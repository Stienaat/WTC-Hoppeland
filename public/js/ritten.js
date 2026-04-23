
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
  return `
    <div class="wp-popup">

      <div class="wp-title">${wp.name}</div>

      <button class="wp-btn wp-btn-main"
        onclick="renameWaypoint('${wp.id}')">
        ✏️ Naam wijzigen
      </button>

      <div class="wp-section">Type</div>

      <div class="wp-grid">
        <button class="wp-chip" onclick="setWaypointType('${wp.id}','rest')">🛑 Rust</button>
        <button class="wp-chip" onclick="setWaypointType('${wp.id}','food')">🍽️ Bevoorrading</button>
        <button class="wp-chip" onclick="setWaypointType('${wp.id}','water')">💧 Water</button>
        <button class="wp-chip" onclick="setWaypointType('${wp.id}','danger')">⚠️ Gevaar</button>
        <button class="wp-chip" onclick="setWaypointType('${wp.id}','climb')">⛰️ Klim</button>
        <button class="wp-chip" onclick="setWaypointType('${wp.id}','start')">⚡ Start</button>
      </div>

      <button class="wp-btn wp-btn-danger"
        onclick="deleteWaypoint('${wp.id}')">
        🗑️ Verwijder
      </button>

    </div>
  `;
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

const waypointIcons = {
  start: createWpIcon('🚩', '#FFF000'),
  water: createWpIcon('💧', '#00FFFF'),
  food: createWpIcon('🍽️', '#ff9800'),
  climb: createWpIcon('⛰️', '#F5DEB3'),
  danger: createWpIcon('⚠️', '#e53935'),
  rest: createWpIcon('🛑', '#FFC0CB'),
  supply: createWpIcon('📦', '#9c27b0')
};

function createWpIcon(symbol, color) {
  return L.divIcon({
    className: 'wp-icon-wrapper',
    html: `<div class="wp-icon" style="background:${color}">
             <span>${symbol}</span>
           </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

/* ================= DRAW ================= */

map.addControl(new L.Control.Draw({
  draw: { polyline: true },
  edit: { featureGroup: drawnItems }
}));

map.on('draw:drawstart', function () {
  isDrawing = true;

  // Zorg dat actief leeg is vóór een nieuwe route
  clearActiveRoute();
});

map.on('draw:drawstop', function () {
  isDrawing = false;
});

map.on(L.Draw.Event.CREATED, function (e) {
  const layer = e.layer;

  drawnItems.addLayer(layer);

  const afstand_km = calculateDistanceKmFromLayer(layer);

  const r = {
    type: 'drawn',
    naam: 'Nieuwe route',
    start: '',
    afstand_km: afstand_km,
    layer: layer,
    waypoints: []
  };

  layer.on('click', function () {
    const idx = routes.indexOf(r);
    if (idx >= 0) setRouteActive(idx);
    renderList();
  });

  routes.push(r);
  activeRouteIndex = routes.length - 1;
  setRouteActive(activeRouteIndex);
  renderList();
});

map.on('draw:edited', function (e) {
  e.layers.eachLayer(function (layer) {
    if (layer instanceof L.Polyline) {

      const km = calculateDistanceKmFromLayer(layer);

      // zoek bijhorende route
      const r = routes.find(r => r.layer === layer);
      if (r) {
        r.afstand_km = km;
      }

      console.log('Afstand geüpdatet:', km);
    }
  });

  renderList(); // zodat UI update
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
    await Modal.error("❌", "Alleen admin mag opslaan.");
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '10px';
  wrapper.style.marginTop = '10px';

  const naamInput = document.createElement('input');
  naamInput.type = 'text';
  naamInput.value = r.naam && r.naam !== 'Nieuwe route' ? r.naam : '';
  naamInput.placeholder = 'Naam van de route';
  naamInput.className = 'modal-input';

  const startInput = document.createElement('input');
  startInput.type = 'text';
  startInput.value = r.start || '';
  startInput.placeholder = 'Startplaats';
  startInput.className = 'modal-input';

  wrapper.appendChild(naamInput);
  wrapper.appendChild(startInput);

  const formData = await Modal.show({
    type: 'prompt',
    title: 'Route opslaan',
    content: wrapper,
    buttons: [
      {
        text: 'Opslaan',
        getValue: function () {
          return {
            naam: naamInput.value.trim(),
            start: startInput.value.trim()
          };
        }
      },
      {
        text: 'Annuleer',
        value: null
      }
    ]
  });

  if (formData === null) return;

  if (!formData.naam) {
    await Modal.warn("⚠️", "Geef een naam op.");
    return;
  }

  if (!formData.start) {
    await Modal.warn("⚠️", "Geef een startplaats op.");
    return;
  }

  const geo = r.layer.toGeoJSON();
  const coords = (geo?.geometry?.coordinates || []).map(function (c) {
    return [c[1], c[0]];
  });

  if (coords.length < 2) {
    await Modal.error("❌", "Route bevat te weinig punten.");
    return;
  }

  const waypoints = Array.isArray(r.waypoints)
    ? r.waypoints.map(function (wp) {
        return {
          lat: Number(wp.lat),
          lon: Number(wp.lon),
          name: wp.naam || wp.name || 'Waypoint',
          type: wp.type || 'rest'
        };
      })
    : [];

  const isUpdate = !!r.catalogId;
  const url = isUpdate
    ? '/api/rides/admin/' + encodeURIComponent(r.catalogId)
    : '/api/rides/admin/drawn';

  // force recalculation
  r.afstand_km = calculateDistanceKmFromLayer(r.layer);

  const payload = {
    naam: formData.naam,
    groep: r.groep || 'TEKEN',
    start: formData.start,
    afstand_km: r.afstand_km ?? null,
    coords: coords,
    waypoints: waypoints
  };

  try {
    const res = await fetch(url, {
      method: isUpdate ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const j = await res.json();

    if (!res.ok || !j.ok) {
      await Modal.error("❌", "Opslaan mislukt: " + (j.error || j.message || ('HTTP ' + res.status)));
      return;
    }

    r.naam = formData.naam;
    r.start = formData.start;
    r.catalogId = j.id || j.ride?.id || r.catalogId || null;

    await Modal.success("👌", isUpdate ? "Route bijgewerkt!" : "Route opgeslagen!");
    await reloadCatalog();
    renderList();
  } catch (err) {
    console.error(err);
    await Modal.error("❌", "Serverfout bij opslaan: " + err.message);
  }
};

/* ================= UPDATE ROUTE ================= */

window.overwriteRoute = async function (i) {
  const r = routes[i];
  if (!r || !r.catalogId || !r.layer) return;

  if (!isAdminUser()) {
	await Modal.error("👎", "Alleen de Admin mag catalogus bijwerken. ❌");

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
  title: String(naam).trim(),
  year: new Date().getFullYear(),
  group_code: groep ? String(groep).trim() : 'TEKEN',
  start_place: String(start_place ?? start ?? '').trim() || null,
  distance_km: parseNumeric(afstand_km),
  ride_kind: 'drawn',
  coords: normalizedCoords,
  waypoints: normalizedWaypoints,
  gpx_filename: null,
  gpx_original_name: null,
  gpx_uploaded_at: null,
  source: 'admin_drawn',
  is_active: true
};

  try {
const res = await fetch('/api/rides/admin/' + encodeURIComponent(r.catalogId), {
  method: 'PUT',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

    const j = await res.json();

    if (!res.ok || !j.ok) {
      await Modal.error("👎", "Opslaan mislukt. ❌");

      return;
    }

   await Modal.success("👌", "Route is bijgewerkt!");
    await reloadCatalog();
    renderList();
  } catch (err) {
    console.error(err);
    await Modal.error("👎", "Serverfout. ❌");

  }
};

/* ================= DELETE ================= */

// VERWIJDEREN 

window.deleteActiveRoute = async function (i) {
  const r = routes[i];
  if (!r || r.type === 'catalog') return;

  const ok = await Modal.confirm("Bevestigen", "Deze route van de kaart verwijderen?");
  if (!ok) return;

  if (r.layer && drawnItems.hasLayer(r.layer)) {
    drawnItems.removeLayer(r.layer);
  }

  if (Array.isArray(r.waypoints)) {
    r.waypoints.forEach(function (wp) {
      if (wp.marker && map.hasLayer(wp.marker)) {
        map.removeLayer(wp.marker);
      }
    });
  }

  routes.splice(i, 1);
  activeRouteIndex = null;
  renderList();
  renderUserBadge();
};

// DELETE 

window.deleteCatalogRoute = async function (i) {
  const r = routes[i];
  if (!r || !r.catalogId) return;

  if (!isAdminUser()) {
    await Modal.error("👎", "Alleen de Admin ma routes verwijderen. ❌");

    return;
  }

  const ok = await Modal.confirm("Bevestigen", "Deze route uit de catalogus verwijderen?");
  if (!ok) return;

  try {
    const res = await fetch('/api/rides/admin/' + encodeURIComponent(r.catalogId), {
      method: 'DELETE',
      credentials: 'include'
    });

    const j = await res.json();

    if (!res.ok || !j.ok) {
      await Modal.error("👎", "Verwijderen mislukt. ❌");

      return;
    }

    if (r.layer) drawnItems.removeLayer(r.layer);

    if (Array.isArray(r.waypoints)) {
      r.waypoints.forEach(function (wp) {
        if (wp.marker) map.removeLayer(wp.marker);
      });
    }

    routes.splice(i, 1);
    activeRouteIndex = null;

    await reloadCatalog();
    renderList();

    await Modal.success("👌", "Route is uit catalogus verwijderd!");
  } catch (err) {
    console.error(err);
    await Modal.error("👎", "Serverfout. ❌");

  }
};
/* ================= UI ================= */

function renderList() {
  let html = '';

  html += '<div class="row"><em>Actief</em></div>';
  html += (r.afstand_km ? (r.afstand_km + ' km') : '');

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
        (r.catalogId ? ('saveDrawnRoute(' + i + ')') : ('saveDrawnRoute(' + i + ')')) +
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

async function exportRouteToGPX(route) {
  if (!route || !route.layer) return;

  const geo = route.layer.toGeoJSON();
  const coords = (geo && geo.geometry && geo.geometry.coordinates) ? geo.geometry.coordinates : [];

  if (coords.length < 2) {
    await Modal.error("👎", "Route bevat te weinig pnten. ❌");

    return;
  }

  const wpMap = {
    rest: { sym: 'Restroom', type: 'rest' },
    food: { sym: 'Food & Drink', type: 'food' },
    water: { sym: 'Drinking Water', type: 'water' },
    danger: { sym: 'danger Area', type: 'danger' },
    climb: { sym: 'Summit', type: 'climb' },
    start: { sym: 'Flag', type: 'start' }
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

  const parserError = xml.querySelector('parsererror');
  if (parserError) {
    console.error('Ongeldige GPX XML', parserError.textContent);
    return null;
  }

  let latlngs = [];
  let routeName = 'GPX route';

  // Eerst track proberen
  const trk = xml.querySelector('trk');
  if (trk) {
    trk.querySelectorAll('trkpt').forEach(function (pt) {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) {
        latlngs.push([lat, lon]);
      }
    });

    const trkNameNode = trk.querySelector('name');
    if (trkNameNode && trkNameNode.textContent) {
      routeName = trkNameNode.textContent;
    }
  }

  // Als geen trackpunten gevonden: route proberen
  if (latlngs.length < 2) {
    const rte = xml.querySelector('rte');
    if (rte) {
      latlngs = [];
      rte.querySelectorAll('rtept').forEach(function (pt) {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          latlngs.push([lat, lon]);
        }
      });

      const rteNameNode = rte.querySelector('name');
      if (rteNameNode && rteNameNode.textContent) {
        routeName = rteNameNode.textContent;
      }
    }
  }

  if (latlngs.length < 2) {
    console.warn('GPX bevat geen bruikbare trkpt of rtept');
    return null;
  }

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
      naam: name,
      type: type
    };

    wp.marker = L.marker([lat, lon], {
      icon: waypointIcons[type] || waypointIcons.rest
    }).addTo(map);

    wp.marker.bindPopup(buildWaypointPopup(wp));
    waypoints.push(wp);
  });

  const r = {
    type: 'drawn',
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

window.loadCatalogRouteById = async function (id) {
  const meta = routes.find(function (r) {
    return r.type === 'catalog' && String(r.id) === String(id);
  });

  if (!meta) {
    await Modal.error("👎", "Route niet gevonden. ❌");

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
      afstand_km: calculateDistanceKmFromLayer(layer),
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
  if (meta.gpx_filename) {
    const url = '/api/rides/' + encodeURIComponent(meta.id) + '/gpx';

    try {
	const res = await fetch(url, {
	  credentials: 'include'
	});
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }

      const txt = await res.text();
      const active = parseGpxToActiveRoute(txt, meta.naam || meta.title);

      if (!active) {
        await Modal.error("👎", "GPX bevat geen track. ❌");

        return;
      }

      active.catalogId = meta.id;
      routes.push(active);
      activeRouteIndex = routes.length - 1;
      setRouteActive(activeRouteIndex);
      zoomToLayer(active.layer);
      renderList();
    } catch (err) {
      console.error(err);
      await Modal.error("👎", "GPX laden mislukt. ❌");

    }

    return;
  }

    await Modal.error("👎", "Deze route heeft geen coords en geen bestand! ❌");

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

window.renameWaypoint = async function (id) {
  const wp = findWaypointById(id);
  if (!wp) return;

 /** const name = prompt('Nieuwe naam', wp.name); **/
  const name = await Modal.prompt('Nieuwe naam', wp.naam || wp.name);

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



