console.log('ritten.js geladen');

/* =========================
   DOM
========================= */
const mapEl = document.getElementById('map');
const listEl = document.getElementById('list');
const wisBtn = document.getElementById('wisBtn');

/* =========================
   MAP
========================= */
const map = L.map(mapEl).setView([50.85, 2.73], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

const drawnItems = new L.FeatureGroup().addTo(map);

/* =========================
   STATE
========================= */
let routes = [];
let activeRoute = null;

/* =========================
   DRAW
========================= */
map.addControl(new L.Control.Draw({
  draw: { polyline: true },
  edit: { featureGroup: drawnItems }
}));

map.on(L.Draw.Event.CREATED, e => {
  drawnItems.addLayer(e.layer);

  const name = prompt('Naam van de route:', 'Nieuwe route') || 'Nieuwe route';

  activeRoute = {
    naam: name,
    layer: e.layer,
    waypoints: []
  };

  renderList();
});

/* =========================
   LOAD CATALOG
========================= */
async function loadCatalog() {
  try {
    const res = await fetch('/api/rides');
    const data = await res.json();

    routes = data || [];
    renderList();

  } catch (err) {
    console.error(err);
  }
}

/* =========================
   SAVE
========================= */
async function saveRoute() {
  if (!activeRoute) return;

  const geo = activeRoute.layer.toGeoJSON();
  const coords = geo.geometry.coordinates.map(c => [c[1], c[0]]);

  const payload = {
    naam: activeRoute.naam,
    groep: 'TEKEN',
    coords,
    waypoints: activeRoute.waypoints
  };

  const res = await fetch('/api/rides/admin/drawn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const j = await res.json();

  if (j.ok) {
    alert('Opgeslagen');
    loadCatalog();
  } else {
    alert('Fout bij opslaan');
  }
}

/* =========================
   DELETE
========================= */
async function deleteRoute(id) {
  await fetch(`/api/rides/admin/${id}`, { method: 'DELETE' });
  loadCatalog();
}

/* =========================
   UI
========================= */
function renderList() {
  let html = '';

  if (activeRoute) {
    html += `
      <div class="row">
        <strong>${activeRoute.naam}</strong><br>
        <button onclick="saveRoute()">Opslaan</button>
      </div>
    `;
  }

  html += '<hr>';

  routes.forEach(r => {
    html += `
      <div class="row">
        <strong>${r.naam}</strong><br>
        <button onclick="deleteRoute('${r.id}')">Delete</button>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

/* =========================
   EVENTS
========================= */
wisBtn.addEventListener('click', () => {
  drawnItems.clearLayers();
  activeRoute = null;
  renderList();
});

/* =========================
   INIT
========================= */
loadCatalog();