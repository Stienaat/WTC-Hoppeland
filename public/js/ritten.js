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

function canUseAdminFeatures() {
  return isAdminUser();
}

// helpers
function joinUrl(base, file) {
  if (!base.endsWith('/')) base += '/';
  if (file.startsWith('/')) file = file.slice(1);
  return base + file;
}

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[c]));
}

function getGpxBaseUrl(meta) {
  return `${BASE_URL}/gpx/${meta.jaar}/${meta.groep}/`;
}

function buildWaypointPopup(wp) {
  return `
    <div>
      <strong>${wp.name}</strong><br/><br/>

      <button onclick="renameWaypoint('${wp.id}')">Naam wijzigen</button><br/><br/>

      <button onclick="setWaypointType('${wp.id}','rest')">Rust</button>
      <button onclick="setWaypointType('${wp.id}','food')">Horeca</button>
      <button onclick="setWaypointType('${wp.id}','water')">Water</button><br/>

      <button onclick="setWaypointType('${wp.id}','danger')">Gevaar</button>
      <button onclick="setWaypointType('${wp.id}','climb')">Klim</button>
      <button onclick="setWaypointType('${wp.id}','sprint')">Sprint</button>

      <br/><br/>
      <button onclick="deleteWaypoint('${wp.id}')">Verwijder</button>
    </div>
  `;
}

function populateGroepen() {
  const groepen = [...new Set(routes
    .filter(r => r.type === 'catalog')
    .map(r => r.groep)
    .filter(Boolean)
  )].sort();

  groepSelect.innerHTML =
    '<option value="ALL">Alle</option>' +
    groepen.map(g => `<option value="${g}">${g}</option>`).join('');
}

function confirmModal(message) {
  return new Promise(resolve => {
    showModal("confirm", "❓", message, [
      { text: "Ja", action: () => resolve(true) },
      { text: "Nee", action: () => resolve(false) }
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

const ROUTE_STYLE_NORMAL = { color:'#3388ff', weight:4, opacity:0.8 };
const ROUTE_STYLE_ACTIVE = { color:'#e74c3c', weight:6, opacity:1 };

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
  rest:   makeIcon('rest.png'),
  food:   makeIcon('food.png'),
  water:  makeIcon('water.png'),
  danger: makeIcon('danger.png'),
  climb:  makeIcon('climb.png'),
  sprint: makeIcon('sprint.png')
};

/* ================= DRAW ================= */

map.addControl(new L.Control.Draw({
  draw: { polyline: true },
  edit: { featureGroup: drawnItems }
}));

map.on('draw:drawstart', () => { isDrawing = true; });
map.on('draw:drawstop', () => { isDrawing = false; });

map.on(L.Draw.Event.CREATED, e => {
  drawnItems.addLayer(e.layer);

  let naam = prompt('Naam van de route:', 'Nieuwe route') || 'Nieuwe route';

  const r = {
    type: 'drawn',
    naam,
    layer: e.layer,
    waypoints: []
  };

  routes.push(r);
  activeRouteIndex = routes.length - 1;

  setRouteActive(activeRouteIndex);
  renderList();
});

/* ================= ACTIVE ================= */

function setRouteActive(index) {
  if (activeRouteIndex !== null) {
    const prev = routes[activeRouteIndex];
    prev?.layer?.setStyle?.(ROUTE_STYLE_NORMAL);
  }

  activeRouteIndex = index;
  const curr = routes[index];
  curr?.layer?.setStyle?.(ROUTE_STYLE_ACTIVE);
}

/* ================= LOAD ================= */

function reloadCatalog() {
  return fetch('/api/rides')
    .then(r => r.json())
    .then(data => {
      const active = routes.filter(r => r.type !== 'catalog');
      const catalog = (data || []).map(x => ({ ...x, type: 'catalog' }));
      routes = [...active, ...catalog];

      populateGroepen();
      renderList();
    });
}
/* ================= AVTIVE ROUTE WISSEN ================= */

function clearActiveRoute() {
  routes.filter(r => r.type !== 'catalog').forEach(r => {
    if (r.layer) drawnItems.removeLayer(r.layer);
    if (Array.isArray(r.waypoints)) {
      r.waypoints.forEach(wp => wp.marker && map.removeLayer(wp.marker));
    }
  });

  routes = routes.filter(r => r.type === 'catalog');
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



/* ================= DELETE ================= */

window.deleteActiveRoute = async function(i) {
  const r = routes[i];
  if (!r || r.type === 'catalog') return;

  const ok = await confirmModal('Deze route van de kaart verwijderen?');
  if (!ok) return;

  if (r.layer) drawnItems.removeLayer(r.layer);

  if (Array.isArray(r.waypoints)) {
    r.waypoints.forEach(wp => wp.marker && map.removeLayer(wp.marker));
  }

  routes.splice(i, 1);
  activeRouteIndex = null;
  renderList();
};

/* ================= UI ================= */

function renderList() {
  let html = '';

  // ACTIEF
  html += '<div class="row"><em>Actief</em></div>';

  routes
    .filter(r => r.type !== 'catalog')
    .forEach(r => {
      const i = routes.indexOf(r);
      const canDownload = !!r.layer;

      html += `
        <div class="row">
          <strong>${r.naam}</strong><br/>

          ${canDownload ? `
            <button type="button"
                    class="wtc-button"
                    style="padding: 4px 5px 4px 5px"
                    onclick="exportDrawnRouteToGPX(routes[${i}])">
              Download GPX
            </button>
          ` : ''}

          <button type="button"
                  class="wtc-button"
                  onclick="deleteActiveRoute(${i})">
            Verwijder
          </button>
        </div>
      `;
    });

  // CATALOGUS
  html += '<hr/><div class="row"><em>Catalogus</em></div>';

  const groep = groepSelect ? groepSelect.value : 'ALL';
  const zoek = zoekInput ? zoekInput.value.toLowerCase() : '';

  routes
    .filter(r => r.type === 'catalog')
    .filter(r => groep === 'ALL' || r.groep === groep)
    .filter(r => !zoek || (r.naam || '').toLowerCase().includes(zoek))
    .forEach(r => {
      const hasGpx = !!r.bestand;
      const hasCoords = Array.isArray(r.coords) && r.coords.length > 1;

      html += `
        <div class="row">
          <strong>${r.naam}</strong><br/>
          <small>
            ${r.start ?? ''}${r.start && r.afstand_km ? ' – ' : ''}
            ${r.afstand_km ? r.afstand_km + ' km' : ''}
            ${(!r.start && !r.afstand_km && hasCoords) ? '(getekend)' : ''}
          </small><br/>

          <button type="button"
                  class="wtc-button"
                  onclick="loadCatalogRouteById('${r.id}')">
            Toon
          </button>

          ${hasGpx ? `
            <a class="wtc-button"
               style="padding: 4px 5px 4px 5px"
               href="${joinUrl(getGpxBaseUrl(r), r.bestand)}"
               download>
              Download GPX
            </a>
          ` : ''}
        </div>
      `;
    });

  listEl.innerHTML = html;
}

function exportRouteToGPX(route) {
  if (!route || !route.layer) return;

  const geo = route.layer.toGeoJSON();
  const coords = geo.geometry.coordinates || [];

  if (coords.length < 2) {
    showModal("error", "❌", "Route bevat te weinig punten!");
    return;
  }

  const wpMap = {
    rest:   { sym: 'Restroom',       type: 'rest' },
    food:   { sym: 'Food & Drink',   type: 'food' },
    water:  { sym: 'Drinking Water', type: 'water' },
    danger: { sym: 'Danger Area',    type: 'danger' },
    climb:  { sym: 'Summit',         type: 'climb' },
    sprint: { sym: 'Flag',           type: 'sprint' }
  };

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1"
     creator="Clubroutes"
     xmlns="http://www.topografix.com/GPX/1/1">
<trk>
  <name>${escapeXml(route.naam)}</name>
  <trkseg>
`;

  coords.forEach(c => {
    gpx += `    <trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>\n`;
  });

  gpx += `  </trkseg>
</trk>
`;

  if (Array.isArray(route.waypoints)) {
    route.waypoints.forEach(wp => {
      const map = wpMap[wp.type] || {};
      gpx += `
<wpt lat="${wp.lat}" lon="${wp.lon}">
  <name>${escapeXml(wp.name)}</name>
  <desc>${escapeXml(wp.type)}</desc>
  ${map.sym ? `<sym>${map.sym}</sym>` : ''}
  ${map.type ? `<type>${map.type}</type>` : ''}
</wpt>
`;
    });
  }

  gpx += `</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (route.naam || 'route') + '.gpx';
  a.click();
}

window.exportDrawnRouteToGPX = function(route) {
  exportRouteToGPX(route);
};

/* ================= GPX PARSER ================= */

function parseGpxToActiveRoute(gpxText, metaNaam) {
  const xml = new DOMParser().parseFromString(gpxText, 'application/xml');

  const trk = xml.querySelector('trk');
  if (!trk) return null;

  const latlngs = [];
  trk.querySelectorAll('trkpt').forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    if (!isNaN(lat) && !isNaN(lon)) latlngs.push([lat, lon]);
  });

  if (latlngs.length < 2) return null;

  const layer = L.polyline(latlngs, ROUTE_STYLE_NORMAL);
  drawnItems.addLayer(layer);

  const waypoints = [];
  xml.querySelectorAll('wpt').forEach(wpt => {
    const lat = parseFloat(wpt.getAttribute('lat'));
    const lon = parseFloat(wpt.getAttribute('lon'));
    if (isNaN(lat) || isNaN(lon)) return;

    const type = wpt.querySelector('type')?.textContent || 'rest';
    const wp = {
      id: crypto.randomUUID(),
      lat,
      lon,
      name: wpt.querySelector('name')?.textContent || 'Waypoint',
      type
    };

    wp.marker = L.marker([lat, lon], {
      icon: waypointIcons[type] || waypointIcons.rest
    }).addTo(map);

    wp.marker.bindPopup(buildWaypointPopup(wp));
    waypoints.push(wp);
  });

  const r = {
    type: 'gpx',
    naam: metaNaam || (trk.querySelector('name')?.textContent ?? 'GPX route'),
    layer,
    waypoints
  };

  layer.on('click', () => {
    const idx = routes.indexOf(r);
    if (idx >= 0) setRouteActive(idx);
    renderList();
  });

  return r;
}

/* ================= TOON btn ================= */

window.loadCatalogRouteById = function(id) {
  const meta = routes.find(r => r.type === 'catalog' && String(r.id) === String(id));

  if (!meta) {
    showModal("error", "❌", "Route niet gevonden");
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
      layer,
      waypoints: Array.isArray(meta.waypoints)
        ? meta.waypoints.map(w => ({ ...w, id: w.id || crypto.randomUUID() }))
        : [],
      catalogId: meta.id
    };

    r.waypoints.forEach(wp => {
      wp.marker = L.marker([wp.lat, wp.lon], {
        icon: waypointIcons[wp.type] || waypointIcons.rest
      }).addTo(map);

      wp.marker.bindPopup(buildWaypointPopup(wp));
    });

    layer.on('click', () => {
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
    if (String(meta.bestand).includes('/')) {
      showModal("error", "❌", "Bestand mag geen pad bevatten");
      return;
    }

    const url = `/api/rides/${encodeURIComponent(meta.id)}/gpx`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(txt => {
        const active = parseGpxToActiveRoute(txt, meta.naam);

        if (!active) {
          showModal("error", "❌", "GPX bevat geen track");
          return;
        }

        active.catalogId = meta.id;
        routes.push(active);
        activeRouteIndex = routes.length - 1;
        setRouteActive(activeRouteIndex);
        zoomToLayer(active.layer);
        renderList();
      })
      .catch(err => {
        console.error(err);
        showModal("error", "❌", "GPX laden mislukt");
      });

    return;
  }

  showModal("error", "❌", "Deze catalogusroute heeft geen coords en geen bestand");
};
/* ================= INIT ================= */

document.getElementById('wisBtn')?.addEventListener('click', () => {
  drawnItems.clearLayers();
  activeRouteIndex = null;
  renderList();
});

reloadCatalog();

groepSelect?.addEventListener('change', renderList);
zoekInput?.addEventListener('input', renderList);