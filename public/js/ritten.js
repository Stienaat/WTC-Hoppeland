console.log('script start');

// Basispad waar routes.html staat
const BASE_URL = new URL('.', window.location.href).pathname.replace(/\/$/, '');

// Icons-map
const ICON_BASE = new URL('../icons/', window.location.href).pathname;

// DOM
const listEl = document.getElementById('list');
const groepSelect = document.getElementById('groepSelect');
const zoekInput = document.getElementById('zoekInput');

function isAdminUser() {
  return localStorage.getItem('is_admin') === 'true';
}

// helpers
function joinUrl(base, file) {
  if (!base.endsWith('/')) base += '/';
  if (file.startsWith('/')) file = file.slice(1);
  return base + file;
}

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, function (c) {
    return {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    }[c];
  });
}

function getGpxBaseUrl(meta) {
  return BASE_URL + '/gpx/' + meta.jaar + '/' + meta.groep + '/';
}

function buildWaypointPopup(wp) {
  return (
    '<div>' +
      '<strong>' + wp.name + '</strong><br/><br/>' +

      '<button onclick="renameWaypoint(\'' + wp.id + '\')">Naam wijzigen</button><br/><br/>' +

      '<button onclick="setWaypointType(\'' + wp.id + '\',\'rest\')">Rust</button> ' +
      '<button onclick="setWaypointType(\'' + wp.id + '\',\'food\')">Horeca</button> ' +
      '<button onclick="setWaypointType(\'' + wp.id + '\',\'water\')">Water</button><br/>' +

      '<button onclick="setWaypointType(\'' + wp.id + '\',\'danger\')">Gevaar</button> ' +
      '<button onclick="setWaypointType(\'' + wp.id + '\',\'climb\')">Klim</button> ' +
      '<button onclick="setWaypointType(\'' + wp.id + '\',\'sprint\')">Sprint</button>' +

      '<br/><br/>' +
      '<button onclick="deleteWaypoint(\'' + wp.id + '\')">Verwijder</button>' +
    '</div>'
  );
}

function populateGroepen() {
  const groepen = [];
  routes
    .filter(function (r) { return r.type === 'catalog'; })
    .forEach(function (r) {
      if (r.groep && groepen.indexOf(r.groep) === -1) {
        groepen.push(r.groep);
      }
    });

  groepen.sort();

  if (!groepSelect) return;

  groepSelect.innerHTML =
    '<option value="ALL">Alle</option>' +
    groepen.map(function (g) {
      return '<option value="' + g + '">' + g + '</option>';
    }).join('');
}

function confirmModal(message) {
  return new Promise(function (resolve) {
    showModal('confirm', '❓', message, [
      { text: 'Ja', action: function () { resolve(true); } },
      { text: 'Nee', action: function () { resolve(false); } }
    ]);
  });
}

/* ================= MAP ================= */

let isDrawing = false;

const map = L.map('map').setView([50.85, 2.73], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

const drawnItems = new L.FeatureGroup().addTo(map);

/* ================= STATE ================= */

let routes = [];
let activeRouteIndex = null;

const ROUTE_STYLE_NORMAL = { color: '#3388ff', weight: 4, opacity: 0.8 };
const ROUTE_STYLE_ACTIVE = { color: '#e74c3c', weight: 6, opacity: 1 };

/* ================= ICONS ================= */

function makeIcon(file) {
  return L.icon({
    iconUrl: joinUrl(ICON_BASE, file),
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
}

const waypointIcons = {
  rest: makeIcon('rest.png'),
  food: makeIcon('food.png'),
  water: makeIcon('water.png'),
  danger: makeIcon('danger.png'),
  climb: makeIcon('climb.png'),
  sprint: makeIcon('sprint.png')
};

/* ================= DRAW ================= */

map.addControl(new L.Control.Draw({
  draw: { polyline: true },
  edit: { featureGroup: drawnItems }
}));

map.on('draw:drawstart', function () { isDrawing = true; });
map.on('draw:drawstop', function () { isDrawing = false; });

map.on(L.Draw.Event.CREATED, async function (e) {
  drawnItems.addLayer(e.layer);

  const naam = await promptModal('Naam van de route', 'Nieuwe route');
  if (!naam) {
    drawnItems.removeLayer(e.layer);
    return;
  }

  const start = await promptModal('Startplaats', '');
  const einde = await promptModal('Eindplaats', '');

  const afstand_km = calculateDistanceKmFromLayer(e.layer);

  const r = {
    type: 'drawn',
    naam: naam,
    start: start || '',
    einde: einde || '',
    afstand_km: afstand_km,
    layer: e.layer,
    waypoints: []
  };

  e.layer.on('click', function () {
    const idx = routes.indexOf(r);
    if (idx >= 0) setRouteActive(idx);
    renderList();
  });

  routes.push(r);
  activeRouteIndex = routes.length - 1;
  setRouteActive(activeRouteIndex);
  renderList();
});

/* ================= ACTIVE ================= */

function setRouteActive(index) {
  if (activeRouteIndex !== null) {
    const prev = routes[activeRouteIndex];
    if (prev && prev.layer && prev.layer.setStyle) {
      prev.layer.setStyle(ROUTE_STYLE_NORMAL);
    }
  }

  activeRouteIndex = index;
  const curr = routes[index];
  if (curr && curr.layer && curr.layer.setStyle) {
    curr.layer.setStyle(ROUTE_STYLE_ACTIVE);
  }
}

/* ================= LOAD ================= */

function reloadCatalog() {
  return fetch('/api/rides')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      const active = routes.filter(function (r) { return r.type !== 'catalog'; });
      const catalog = (data || []).map(function (x) {
        const y = {};
        for (const k in x) y[k] = x[k];
        y.type = 'catalog';
        return y;
      });

      routes = active.concat(catalog);

      populateGroepen();
      renderList();
    });
}

/* ================= ACTIVE ROUTE WISSEN ================= */

function clearActiveRoute() {
  routes.filter(function (r) { return r.type !== 'catalog'; }).forEach(function (r) {
    if (r.layer) {
      drawnItems.removeLayer(r.layer);
    }
    if (Array.isArray(r.waypoints)) {
      r.waypoints.forEach(function (wp) {
        if (wp.marker) map.removeLayer(wp.marker);
      });
    }
  });

  routes = routes.filter(function (r) { return r.type === 'catalog'; });
  activeRouteIndex = null;
}

window.wisRoute = function () {
  clearActiveRoute();
  renderList();
};

function zoomToLayer(layer) {
  try {
    map.fitBounds(layer.getBounds());
  } catch (e) {}
}

/* ================= SAVE ================= */

window.saveDrawnRoute = async function (i) {
  const r = routes[i];
  if (!r || r.type !== 'drawn') return;

  if (!isAdminUser()) {
    showModal('error', '❌', 'Alleen admin mag routes opslaan in de catalogus.');
    return;
  }

  if (r.catalogId) {
    return window.overwriteRoute(i);
  }

  const geo = r.layer.toGeoJSON();
  let coords = [];
  if (geo && geo.geometry && geo.geometry.coordinates) {
    coords = geo.geometry.coordinates.map(function (c) {
      return [c[1], c[0]];
    });
  }

  if (!Array.isArray(coords) || coords.length < 2) {
    showModal('error', '❌', 'Route bevat te weinig punten.');
    return;
  }

  const payload = {
    naam: r.naam,
    groep: 'TEKEN',
    start: r.start || null,
    einde: r.einde || null,
    afstand_km: r.afstand_km || null,
    coords: coords,
    waypoints: (r.waypoints || []).map(function (wp) {
      return {
        lat: wp.lat,
        lon: wp.lon,
        name: wp.name,
        type: wp.type
      };
    })
  };

  try {
    const res = await fetch('/api/rides/admin/drawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const j = await res.json();

    if (!res.ok || !j.ok) {
      showModal('error', '❌', j.error || 'Opslaan mislukt.');
      return;
    }

    r.catalogId = j.id || (j.ride && j.ride.id) || null;

    showModal('success', '👌', 'Route opgeslagen in catalogus.');
    await reloadCatalog();
    renderList();
  } catch (err) {
    console.error(err);
    showModal('error', '❌', 'Serverfout bij opslaan.');
  }
};

window.overwriteRoute = async function (i) {
  const r = routes[i];
  if (!r || !r.catalogId || !r.layer) return;

  if (!isAdminUser()) {
    showModal('error', '❌', 'Alleen admin mag catalogusroutes bijwerken.');
    return;
  }

  const ok = await confirmModal('Deze route overschrijven in de catalogus?');
  if (!ok) return;

  const geo = r.layer.toGeoJSON();
  let coords = [];
  if (geo && geo.geometry && geo.geometry.coordinates) {
    coords = geo.geometry.coordinates.map(function (c) {
      return [c[1], c[0]];
    });
  }

  const payload = {
    naam: r.naam,
    coords: coords,
    waypoints: (r.waypoints || []).map(function (wp) {
      return {
        lat: wp.lat,
        lon: wp.lon,
        name: wp.name,
        type: wp.type
      };
    })
  };

  try {
    const res = await fetch('/api/rides/admin/' + encodeURIComponent(r.catalogId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const j = await res.json();

    if (!res.ok || !j.ok) {
      showModal('error', '❌', j.error || 'Opslaan mislukt.');
      return;
    }

    showModal('success', '👌', 'Route bijgewerkt.');
    await reloadCatalog();
    renderList();
  } catch (err) {
    console.error(err);
    showModal('error', '❌', 'Serverfout bij opslaan.');
  }
};

/* ================= DELETE ================= */

window.deleteActiveRoute = async function (i) {
  const r = routes[i];
  if (!r || r.type === 'catalog') return;

  const ok = await confirmModal('Deze route van de kaart verwijderen?');
  if (!ok) return;

  clearActiveRoute();
  renderList();
};

window.deleteCatalogRoute = async function (i) {
  const r = routes[i];
  if (!r || !r.catalogId) return;

  if (!isAdminUser()) {
    showModal('error', '❌', 'Alleen admin mag catalogusroutes verwijderen.');
    return;
  }

  const ok = await confirmModal('Deze route uit de catalogus verwijderen?');
  if (!ok) return;

  try {
    const res = await fetch('/api/rides/admin/' + encodeURIComponent(r.catalogId), {
      method: 'DELETE'
    });

    const j = await res.json();

    if (!res.ok || !j.ok) {
      showModal('error', '❌', j.error || 'Verwijderen mislukt.');
      return;
    }

    if (r.layer) drawnItems.removeLayer(r.layer);
    if (Array.isArray(r.waypoints)) {
      r.waypoints.forEach(function (wp) {
        if (wp.marker) map.removeLayer(wp.marker);
      });
    }

    activeRouteIndex = null;
    await reloadCatalog();
    renderList();

    showModal('success', '👌', 'Route uit catalogus verwijderd.');
  } catch (err) {
    console.error(err);
    showModal('error', '❌', 'Serverfout bij verwijderen.');
  }
};

/* ================= UI ================= */

function renderList() {
  let html = '';

  html += '<div class="row"><em>Actief</em></div>';

  routes.filter(function (r) { return r.type !== 'catalog'; }).forEach(function (r) {
    const i = routes.indexOf(r);
    const canDownload = !!r.layer;
    const canSave = isAdminUser() && r.type === 'drawn';
    const canDeleteCatalog = isAdminUser() && !!r.catalogId;

    html += '<div class="row">';
    html += '<strong>' + r.naam + '</strong><br/>';

    if (canSave) {
      html +=
        '<button type="button" class="wtc-button" onclick="' +
        (r.catalogId ? ('overwriteRoute(' + i + ')') : ('saveDrawnRoute(' + i + ')')) +
        '">Opslaan</button> ';
    }

    if (canDownload) {
      html +=
        '<button type="button" class="wtc-button" style="padding: 4px 5px 4px 5px" onclick="exportDrawnRouteToGPX(routes[' +
        i +
        '])">Download</button> ';
    }

    html +=
      '<button type="button" class="wtc-button" onclick="deleteActiveRoute(' +
      i +
      ')">Verwijder</button> ';

    if (canDeleteCatalog) {
      html +=
        '<button type="button" class="wtc-button" onclick="deleteCatalogRoute(' +
        i +
        ')">delete</button>';
    }

    html += '</div>';
  });

  html += '<hr/><div class="row"><em>Catalogus</em></div>';

  const groep = groepSelect ? groepSelect.value : 'ALL';
  const zoek = zoekInput ? zoekInput.value.toLowerCase() : '';

  routes
    .filter(function (r) { return r.type === 'catalog'; })
    .filter(function (r) { return groep === 'ALL' || r.groep === groep; })
    .filter(function (r) {
      return !zoek || ((r.naam || '').toLowerCase().indexOf(zoek) !== -1);
    })
    .forEach(function (r) {
      html += '<div class="row route-row">';
      html += '  <div class="route-row-top">';
      html += '    <strong>' + r.naam + '</strong>';
      html += '    <button type="button" class="wtc-button" onclick="loadCatalogRouteById(\'' + r.id + '\')">Toon</button>';
      html += '  </div>';

      html += '  <small>';
      html += (r.start || '');
      html += (r.start && r.afstand_km ? ' – ' : '');
      html += (r.afstand_km ? (r.afstand_km + ' km') : '');
      if (!r.start && !r.afstand_km && Array.isArray(r.coords) && r.coords.length > 1) {
        html += '(getekend)';
      }
      html += '  </small>';
      html += '</div>';
    });

  if (listEl) {
    listEl.innerHTML = html;
  }
}

function exportRouteToGPX(route) {
  if (!route || !route.layer) return;

  const geo = route.layer.toGeoJSON();
  const coords = (geo && geo.geometry && geo.geometry.coordinates) ? geo.geometry.coordinates : [];

  if (coords.length < 2) {
    showModal('error', '❌', 'Route bevat te weinig punten!');
    return;
  }

  const wpMap = {
    rest: { sym: 'Restroom', type: 'rest' },
    food: { sym: 'Food & Drink', type: 'food' },
    water: { sym: 'Drinking Water', type: 'water' },
    danger: { sym: 'Danger Area', type: 'danger' },
    climb: { sym: 'Summit', type: 'climb' },
    sprint: { sym: 'Flag', type: 'sprint' }
  };

  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="Clubroutes" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '<trk>\n' +
    '  <name>' + escapeXml(route.naam) + '</name>\n' +
    '  <trkseg>\n';

  coords.forEach(function (c) {
    gpx += '    <trkpt lat="' + c[1] + '" lon="' + c[0] + '"></trkpt>\n';
  });

  gpx += '  </trkseg>\n</trk>\n';

  if (Array.isArray(route.waypoints)) {
    route.waypoints.forEach(function (wp) {
      const mapItem = wpMap[wp.type] || {};
      gpx +=
        '<wpt lat="' + wp.lat + '" lon="' + wp.lon + '">\n' +
        '  <name>' + escapeXml(wp.name) + '</name>\n' +
        '  <desc>' + escapeXml(wp.type) + '</desc>\n' +
        (mapItem.sym ? ('  <sym>' + mapItem.sym + '</sym>\n') : '') +
        (mapItem.type ? ('  <type>' + mapItem.type + '</type>\n') : '') +
        '</wpt>\n';
    });
  }

  gpx += '</gpx>';

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (route.naam || 'route') + '.gpx';
  a.click();
}

window.exportDrawnRouteToGPX = function (route) {
  exportRouteToGPX(route);
};

function renderUserBadge() {
  const el = document.getElementById('routeUserBadge');
  if (!el) return;

  const role = isAdminUser() ? 'Admin' : 'Lid';
  const name =
    localStorage.getItem('user_name') ||
    sessionStorage.getItem('user_name') ||
    '';

  el.textContent = name ? (role + ': ' + name) : role;
}

/* ================= GPX PARSER ================= */

function parseGpxToActiveRoute(gpxText, metaNaam) {
  const xml = new DOMParser().parseFromString(gpxText, 'application/xml');

  const trk = xml.querySelector('trk');
  if (!trk) return null;

  const latlngs = [];
  trk.querySelectorAll('trkpt').forEach(function (pt) {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    if (!isNaN(lat) && !isNaN(lon)) {
      latlngs.push([lat, lon]);
    }
  });

  if (latlngs.length < 2) return null;

  const layer = L.polyline(latlngs, ROUTE_STYLE_NORMAL);
  drawnItems.addLayer(layer);

  const waypoints = [];
  xml.querySelectorAll('wpt').forEach(function (wpt) {
    const lat = parseFloat(wpt.getAttribute('lat'));
    const lon = parseFloat(wpt.getAttribute('lon'));
    if (isNaN(lat) || isNaN(lon)) return;

    const typeNode = wpt.querySelector('type');
    const nameNode = wpt.querySelector('name');

    const type = typeNode && typeNode.textContent ? typeNode.textContent : 'rest';
    const name = nameNode && nameNode.textContent ? nameNode.textContent : 'Waypoint';

    const wp = {
      id: crypto.randomUUID(),
      lat: lat,
      lon: lon,
      name: name,
      type: type
    };

    wp.marker = L.marker([lat, lon], {
      icon: waypointIcons[type] || waypointIcons.rest
    }).addTo(map);

    wp.marker.bindPopup(buildWaypointPopup(wp));
    waypoints.push(wp);
  });

  let routeName = 'GPX route';
  const trkNameNode = trk.querySelector('name');
  if (trkNameNode && trkNameNode.textContent) {
    routeName = trkNameNode.textContent;
  }

  const r = {
    type: 'gpx',
    naam: metaNaam || routeName,
    layer: layer,
    waypoints: waypoints
  };

  layer.on('click', function () {
    const idx = routes.indexOf(r);
    if (idx >= 0) setRouteActive(idx);
    renderList();
  });

  return r;
}

/* ================= TOON btn ================= */

window.loadCatalogRouteById = function (id) {
  const meta = routes.find(function (r) {
    return r.type === 'catalog' && String(r.id) === String(id);
  });

  if (!meta) {
    showModal('error', '❌', 'Route niet gevonden');
    return;
  }

  clearActiveRoute();

  // 1) catalogusitem met coords
  if (Array.isArray(meta.coords) && meta.coords.length >= 2) {
    const layer = L.polyline(meta.coords, ROUTE_STYLE_NORMAL);
    drawnItems.addLayer(layer);

    const r = {
      type: 'drawn',
      naam: meta.naam,
      start: meta.start || '',
      einde: meta.einde || '',
      afstand_km: meta.afstand_km || null,
      layer: layer,
      waypoints: Array.isArray(meta.waypoints)
        ? meta.waypoints.map(function (w) {
            const copy = {};
            for (const k in w) copy[k] = w[k];
            copy.id = w.id || crypto.randomUUID();
            return copy;
          })
        : [],
      catalogId: meta.id
    };

    r.waypoints.forEach(function (wp) {
      wp.marker = L.marker([wp.lat, wp.lon], {
        icon: waypointIcons[wp.type] || waypointIcons.rest
      }).addTo(map);

      wp.marker.bindPopup(buildWaypointPopup(wp));
    });

    layer.on('click', function () {
      const idx = routes.indexOf(r);
      if (idx >= 0) setRouteActive(idx);
      renderList();
    });

    routes.push(r);
    activeRouteIndex = routes.length - 1;
    setRouteActive(activeRouteIndex);
    zoomToLayer(layer);
    renderList();
    return;
  }

  // 2) catalogusitem met GPX bestand
  if (meta.bestand) {
    if (String(meta.bestand).indexOf('/') !== -1) {
      showModal('error', '❌', 'Bestand mag geen pad bevatten');
      return;
    }

    const url = '/api/rides/' + encodeURIComponent(meta.id) + '/gpx';

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (txt) {
        const active = parseGpxToActiveRoute(txt, meta.naam);

        if (!active) {
          showModal('error', '❌', 'GPX bevat geen track');
          return;
        }

        active.catalogId = meta.id;
        routes.push(active);
        activeRouteIndex = routes.length - 1;
        setRouteActive(activeRouteIndex);
        zoomToLayer(active.layer);
        renderList();
      })
      .catch(function (err) {
        console.error(err);
        showModal('error', '❌', 'GPX laden mislukt');
      });

    return;
  }

  showModal('error', '❌', 'Deze catalogusroute heeft geen coords en geen bestand');
};

/* ================= WP's ================= */

map.on('contextmenu', function (e) {
  if (isDrawing) return;
  if (activeRouteIndex === null) return;

  const route = routes[activeRouteIndex];
  if (!route || !route.layer) return;

  const wp = {
    id: crypto.randomUUID(),
    lat: e.latlng.lat,
    lon: e.latlng.lng,
    name: 'Waypoint',
    type: 'rest'
  };

  wp.marker = L.marker(e.latlng, {
    icon: waypointIcons[wp.type] || waypointIcons.rest
  }).addTo(map);

  wp.marker.bindPopup(buildWaypointPopup(wp));

  if (!route.waypoints) {
    route.waypoints = [];
  }

  route.waypoints.push(wp);
});

function findWaypointById(id) {
  const r = routes[activeRouteIndex];
  if (!r || !Array.isArray(r.waypoints)) return null;

  for (let i = 0; i < r.waypoints.length; i++) {
    if (r.waypoints[i].id === id) return r.waypoints[i];
  }
  return null;
}

window.renameWaypoint = function (id) {
  const wp = findWaypointById(id);
  if (!wp) return;

  const name = prompt('Nieuwe naam', wp.name);
  if (!name) return;

  wp.name = name;
  wp.marker.setPopupContent(buildWaypointPopup(wp));
};

window.setWaypointType = function (id, type) {
  const wp = findWaypointById(id);
  if (!wp) return;

  wp.type = type;
  wp.marker.setIcon(waypointIcons[type] || waypointIcons.rest);
  wp.marker.setPopupContent(buildWaypointPopup(wp));
};

window.deleteWaypoint = function (id) {
  const r = routes[activeRouteIndex];
  if (!r || !Array.isArray(r.waypoints)) return;

  const wp = findWaypointById(id);
  if (!wp) return;

  map.removeLayer(wp.marker);
  r.waypoints = r.waypoints.filter(function (w) {
    return w.id !== id;
  });
};

/* ================= TEKST INPUT-MODAL ================= */
function promptModal(title, defaultValue) {
  if (defaultValue === undefined) defaultValue = '';
  return Promise.resolve(window.prompt(title, defaultValue));
}
/*
function promptModal(title, defaultValue) {
  if (defaultValue === undefined) defaultValue = '';

  return new Promise(function (resolve) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<input id="modal-input-field" type="text" value="' +
        String(defaultValue).replace(/"/g, '&quot;') +
        '" style="padding:8px;">' +
      '</div>';

    showModal('custom', '✏️', title, [
      {
        text: 'OK',
        action: function () {
          const input = document.getElementById('modal-input-field');
          const value = input ? input.value : '';
          resolve(value.trim());
        }
      },
      {
        text: 'Annuleer',
        action: function () {
          resolve(null);
        }
      }
    ], wrapper);
  });
}
*/

function calculateDistanceKmFromLayer(layer) {
  if (!layer) return 0;

  let latlngs = [];
  if (layer && layer.getLatLngs) {
    latlngs = layer.getLatLngs();
  }

  if (!Array.isArray(latlngs) || latlngs.length < 2) return 0;

  let meters = 0;
  for (let i = 1; i < latlngs.length; i++) {
    meters += latlngs[i - 1].distanceTo(latlngs[i]);
  }

  return Math.round((meters / 1000) * 10) / 10;
}

/* ================= INIT ================= */

const wisBtn = document.getElementById('wisBtn');
if (wisBtn) {
  wisBtn.addEventListener('click', function () {
    drawnItems.clearLayers();
    activeRouteIndex = null;
    renderList();
    renderUserBadge();
  });
}

if (groepSelect) {
  groepSelect.addEventListener('change', renderList);
}

if (zoekInput) {
  zoekInput.addEventListener('input', renderList);
}

reloadCatalog();
renderUserBadge();