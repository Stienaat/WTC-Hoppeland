console.log('script start');

// Basispad waar routes.html staat
const BASE_URL = new URL('.', window.location.href).pathname.replace(/\/$/, '');

// Icons-map
const ICON_BASE = new URL('../icons/', window.location.href).pathname;

// DOM
const listEl = document.getElementById('list');
const groepSelect = document.getElementById('groepSelect');
const zoekInput = document.getElementById('zoekInput');

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

      renderList();
    });
}

/* ================= SAVE ================= */

window.saveDrawnRoute = async function(i) {
  const r = routes[i];
  if (!r || r.type !== 'drawn') return;

  const geo = r.layer.toGeoJSON();
  const coords = geo.geometry.coordinates.map(c => [c[1], c[0]]);

  const payload = {
    naam: r.naam,
    groep: 'TEKEN',
    coords,
    waypoints: r.waypoints || []
  };

  const res = await fetch('/api/rides/admin/drawn', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });

  const j = await res.json();

  if (j.ok) {
    showModal("success", "👌", "Opgeslagen");
    reloadCatalog();
  }
};

/* ================= DELETE ================= */

window.deleteActiveRoute = async function(i) {
  const r = routes[i];
  if (!r?.catalogId) return;

  await fetch(`/api/rides/admin/${r.catalogId}`, { method:'DELETE' });
  reloadCatalog();
};

/* ================= UI ================= */

function renderList() {
  let html = '';

  html += '<div class="row"><em>Actief</em></div>';

  routes.filter(r => r.type !== 'catalog').forEach(r => {
    const i = routes.indexOf(r);

    html += `
      <div class="row">
        <strong>${r.naam}</strong><br/>
        <button onclick="saveDrawnRoute(${i})">Opslaan</button>
      </div>
    `;
  });

  html += '<hr/><div class="row"><em>Catalogus</em></div>';

  routes.filter(r => r.type === 'catalog').forEach(r => {
    html += `
      <div class="row">
        <strong>${r.naam}</strong><br/>
        <button onclick="deleteActiveRoute(${routes.indexOf(r)})">Delete</button>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

/* ================= INIT ================= */

document.getElementById('wisBtn')?.addEventListener('click', () => {
  drawnItems.clearLayers();
  activeRouteIndex = null;
  renderList();
});

reloadCatalog();