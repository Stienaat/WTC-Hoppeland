/************************************************************
 * CORE HELPERS
 ************************************************************/
const noticeStatus = document.getElementById('loginStatus');

async function ajax(url, options = {}) {
  options.headers = {
    Accept: 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, {
    credentials: 'include',
    ...options
  });

  const ct = res.headers.get('content-type') || '';

  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error('Server returned non-JSON:\n' + text.slice(0, 200));
  }

  return res.json();
}

function setStatus(el, message = '', type = 'info') {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('ok', 'error', 'info');
  el.classList.add(type);
}

/************************************************************
 * BASIS DOM
 ************************************************************/
const logo = document.getElementById('Image1');
const adminOverlay = document.getElementById('adminOverlay');
const adminStatus = document.getElementById('admin-status');

/************************************************************
 * NOTICE
 ************************************************************/
const box = document.getElementById('noticeBox');
const btnEditNotice = document.getElementById('btnEditNotice');
const btnNoticeClose = document.getElementById('btnNoticeClose');
const btnMedSave = document.getElementById('btnMedSave');

function setRaw(text) {
  if (box) box.dataset.raw = String(text || '');
}

function getRaw() {
  return box ? (box.dataset.raw || '') : '';
}

function fmt(text) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim());

  let html = '';
  let inList = false;

  const R = {
    lg: new RegExp("\\[lg\\]\\s*([\\s\\S]*?)\\s*\\[\\/lg\\]", "g"),
    sm: new RegExp("\\[sm\\]\\s*([\\s\\S]*?)\\s*\\[\\/sm\\]", "g"),
    bold: new RegExp("\\*\\*\\s*([\\s\\S]+?)\\s*\\*\\*", "g"),
    em: new RegExp("\\*\\s*([\\s\\S]+?)\\s*\\*", "g"),
    u: new RegExp("__\\s*([\\s\\S]+?)\\s*__", "g")
  };

  const pushLine = raw => {
    let body = esc(raw);
    let cls = 'n-line';

    if (body.startsWith('##')) {
      cls = 'n-h2';
      body = body.replace(/^##\s*/, '');
    } else if (body.startsWith('#')) {
      cls = 'n-h1';
      body = body.replace(/^#\s*/, '');
    }

    body = body.replace(R.lg, '<span class="n-lg">$1</span>');
    body = body.replace(R.sm, '<span class="n-sm">$1</span>');
    body = body.replace(R.bold, '<strong>$1</strong>');
    body = body.replace(R.em, '<em>$1</em>');
    body = body.replace(R.u, '<u>$1</u>');

    html += `<div class="${cls}">${body || '&nbsp;'}</div>`;
  };

  for (const line of lines) {
    const m = /^\-\s*(.*)$/.exec(line);

    if (m) {
      if (!inList) {
        html += '<ul class="n-ul">';
        inList = true;
      }

      let item = esc(m[1]);
      item = item.replace(R.bold, '<strong>$1</strong>');
      item = item.replace(R.em, '<em>$1</em>');
      item = item.replace(R.u, '<u>$1</u>');
      html += `<li>${item || '&nbsp;'}</li>`;
      continue;
    }

    if (inList) {
      html += '</ul>';
      inList = false;
    }

    pushLine(line);
  }

  if (inList) html += '</ul>';
  return html;
}

function renderNotice() {
  if (!box) return;
  box.innerHTML = fmt(getRaw());
}

async function loadNotice() {
  try {
    const j = await ajax('/api/notice');

    if (!j.ok) throw new Error(j.error || 'Onbekende fout');

    setRaw(j.text);
    renderNotice();
  } catch (err) {
    await Modal.error("👎", "Kan mededelingen niet laden. ❌");

  }
}

function startEditNotice() {
  if (!box) return;

  box.innerHTML = getRaw().replace(/\n/g, '<br>');
  box.contentEditable = 'true';
  box.focus();
}

async function saveNotice() {
  if (!box || box.contentEditable !== 'true') return;

  const raw = box.innerHTML
    .replace(/<div>/gi, '\n')
    .replace(/<\/div>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .trim();

  setRaw(raw);
  box.contentEditable = 'false';
  renderNotice();

  try {
    const fd = new FormData();
    fd.append('text', raw);

    const res = await fetch('/api/notice', {
      method: 'POST',
      body: fd
    });

    const j = await res.json();

    if (!j.ok) {
      await Modal.error("👎", "Opslaan mislukt. ❌");
      return;
    }

   await Modal.success("👌", "Uw tekst werd opgeslagen!");
  } catch (err) {
    await Modal.error("👎", "Serverfout. ❌");

  }
}

/************************************************************
 * ADMIN CONFIG
 ************************************************************/
function initAdminConfigCard() {
  const elName = document.getElementById('cfgOrgName');
  const elIban = document.getElementById('cfgIban');
  const elBic = document.getElementById('cfgBic');
  const elMed = document.getElementById('cfgMed');
  const btnSave = document.getElementById('btnSaveConfig');
  const confSaveStatus = document.getElementById('confSaveStatus');

  if (!elName || !elIban || !elBic || !elMed || !btnSave) return;

  (async () => {
    try {
      const j = await ajax('/api/admin/config');

      if (!j?.ok || !j.config) {
        setStatus(confSaveStatus, 'Kon configuratie niet laden.', 'error');
        return;
      }

      elName.value = j.config.vereniging?.naam || '';
      elIban.value = j.config.vereniging?.iban || '';
      elBic.value = j.config.vereniging?.bic || '';
      elMed.value = j.config.vereniging?.med || '';

      setStatus(confSaveStatus, '', 'info');
    } catch (e) {
      setStatus(confSaveStatus, 'Kon configuratie niet laden.', 'error');
    }
  })();

  btnSave.onclick = async () => {
    if (!elName.value.trim()) {
      setStatus(confSaveStatus, 'Naam is verplicht.', 'error');
      return;
    }

    setStatus(confSaveStatus, 'Opslaan...', 'info');

    try {
      const j = await ajax('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vereniging: {
            naam: elName.value.trim(),
            iban: elIban.value.trim(),
            bic: elBic.value.trim(),
            med: elMed.value.trim()
          }
        })
      });

      if (!j.ok) {
        setStatus(confSaveStatus, 'Configuratie is niet opgeslagen.', 'error');
        return;
      }

      await Modal.success("👌", "Opslag gelukt! ✔");
    } catch (e) {
      setStatus(confSaveStatus, 'Technische fout: ' + e.message, 'error');
    }
  };
}

/************************************************************
 * FIETSROUTES UPLOAD (Node API)
 * Admin-only upload van GPX naar /api/routes/upload-gpx
 ************************************************************/
const btnUploadRoute = document.getElementById('btnUploadRoute');
const btnCloseRoute = document.getElementById('btnCloseRoute');
const routeOverlay = document.getElementById('routeOverlay');
const routeError = document.getElementById('routeError');

function closeRouteOverlay() {
  routeOverlay && routeOverlay.classList.remove('show');
}

if (btnCloseRoute) {
  btnCloseRoute.addEventListener('click', closeRouteOverlay);
}

if (btnUploadRoute) {
  btnUploadRoute.addEventListener('click', async () => {
    const naam = document.getElementById('routeNaam')?.value.trim() || '';
    const groep = document.getElementById('routeGroep')?.value || '';
    const afstand = document.getElementById('routeAfstand')?.value.trim() || '';
    const start = document.getElementById('routeStart')?.value.trim() || '';
    const file = document.getElementById('routeFile')?.files?.[0];

    if (!naam || !groep || !afstand || !start || !file) {
      setStatus(routeError, 'Naam, groep, afstand, start en bestand zijn verplicht.', 'error');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      setStatus(routeError, 'Alleen .gpx bestanden zijn toegestaan.', 'error');
      return;
    }

    const fd = new FormData();
    fd.append('naam', naam);
    fd.append('groep', groep);
    fd.append('afstand', afstand);
    fd.append('start', start);
    fd.append('gpxfile', file);

try {
  const res = await fetch('/api/rides/admin/upload-gpx', {
    method: 'POST',
    credentials: 'include',
    body: fd
  });

  const ct = res.headers.get('content-type') || '';

  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Server returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  const j = await res.json();

  if (!res.ok || !j.ok) {
    setStatus(routeError, j.error || 'Upload mislukt.', 'error');
    return;
  }

  closeRouteOverlay();
  setStatus(routeError, '✔ Route toegevoegd.', 'ok');

  const naamEl = document.getElementById('routeNaam');
  const afstandEl = document.getElementById('routeAfstand');
  const startEl = document.getElementById('routeStart');
  const fileEl = document.getElementById('routeFile');

  if (naamEl) naamEl.value = '';
  if (afstandEl) afstandEl.value = '';
  if (startEl) startEl.value = '';
  if (fileEl) fileEl.value = '';

  if (typeof reloadCatalog === 'function') {
    await reloadCatalog();
  }
} catch (e) {
  console.error(e);
  setStatus(routeError, 'Technische fout bij upload.', 'error');
}
  });
}

/************************************************************
 * ADMIN UI OPEN / CLOSE
 ************************************************************/
const adminLogin = document.getElementById('adminLogin');
const adminFase2 = document.getElementById('adminFase2');

function openAdminPhase1() {
  adminLogin && (adminLogin.style.display = 'block');
  adminFase2 && adminFase2.classList.remove('open');
}

function openAdminPhase2() {
  adminLogin && (adminLogin.style.display = 'none');
  adminFase2 && adminFase2.classList.add('open');
  initAdminConfigCard();
}

function closeAdminUI() {
  adminLogin && (adminLogin.style.display = 'none');
  adminFase2 && adminFase2.classList.remove('open');
}

function closeAdminPan() {
  if (adminFase2) {
    adminFase2.style.display = 'none';
  }

  const url = new URL(window.location);
  url.searchParams.delete('overlay');
  window.history.replaceState({}, '', url);
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('noticeBox')) {
    loadNotice();
  }
});

btnEditNotice && btnEditNotice.addEventListener('click', startEditNotice);
btnNoticeClose && btnNoticeClose.addEventListener('click', saveNotice);

document.getElementById('btnCloseAdmin')?.addEventListener('click', closeAdminUI);
document.getElementById('btnCloseAdmin2')?.addEventListener('click', closeAdminPan);

document.addEventListener('DOMContentLoaded', function () {
  const params = new URLSearchParams(window.location.search);

  if (params.get('overlay') === '1') {
    setTimeout(() => {
      if (typeof openAdminPhase2 === 'function') {
        openAdminPhase2();
      }
    }, 50);
  }
});

  if (typeof loadNotice === "function") {
    loadNotice();
  }