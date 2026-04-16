/************************************************************
 * CORE HELPERS
 ************************************************************/
const noticeStatus = document.getElementById('loginStatus');

async function ajax(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    Accept: 'application/json'
  };

  const res = await fetch(url, options);
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
    showModal("error", "❌", "Kon mededelingen niet laden: " + err.message);
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
      showModal("error", "❌", "Opslaan mislukt.");
      return;
    }

    showModal("success", "👌", "Uw tekst werd opgeslagen!");
  } catch (err) {
    showModal("error", "❌", "Serverfout bij opslaan.");
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

      setStatus(confSaveStatus, '✔ Opgeslagen.', 'ok');
    } catch (e) {
      setStatus(confSaveStatus, 'Technische fout: ' + e.message, 'error');
    }
  };
}

/************************************************************
 * LEGACY FIETSROUTES
 * Nog niet migreren - gebruikt nog PHP endpoint.
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
    const naam = document.getElementById('routeNaam')?.value.trim();
    const groep = document.getElementById('routeGroep')?.value;
    const afstand = document.getElementById('routeAfstand')?.value.trim();
    const start = document.getElementById('routeStart')?.value.trim();
    const file = document.getElementById('routeFile')?.files[0];

    if (!naam || !file) {
      setStatus(routeError, 'Naam en bestand zijn verplicht.', 'error');
      return;
    }

    const fd = new FormData();
    fd.append('naam', naam);
    fd.append('groep', groep);
    fd.append('afstand', afstand);
    fd.append('start', start);
    fd.append('gpxfile', file);

    try {
      const res = await fetch('/WTC/routes/upload_do.php', {
        method: 'POST',
        body: fd
      });

      if (!res.ok) {
        setStatus(routeError, 'Upload mislukt.', 'error');
        return;
      }

      closeRouteOverlay();
      setStatus(routeError, '✔ Route toegevoegd.', 'ok');
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

/************************************************************
 * ADMIN LOGIN (PIN)
 ************************************************************/
const pinInput = document.getElementById('pinInput');
const btnOk = document.getElementById('btnOk');
const pinError = document.getElementById('pinError');

async function handlePinUnlock() {
  const pin = pinInput?.value?.trim() || '';

  if (pin.length !== 6) {
    setStatus(pinError, 'PIN moet 6 cijfers zijn.', 'error');
    return;
  }

  try {
    const j = await ajax('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    if (!j.ok) {
      setStatus(pinError, j.message || 'PIN onjuist.', 'error');
      return;
    }

    localStorage.setItem('is_admin', 'true');
    setStatus(pinError, '', 'info');
    if (pinInput) pinInput.value = '';
    openAdminPhase2();
  } catch (e) {
    console.error('PIN unlock error:', e);
    setStatus(pinError, 'Serverfout.', 'error');
  }
}

/************************************************************
 * PIN WIJZIGEN
 ************************************************************/
const btnPinChange = document.getElementById('btnPinChange');
const pinChangeOverlay = document.getElementById('pinChangeOverlay');
const btnChangeCode = document.getElementById('btnChangeCode');
const oldPinInput = document.getElementById('oldPinInput');
const newPinInput = document.getElementById('newPinInput');
const newPinInput2 = document.getElementById('newPinInput2');
const pinError2 = document.getElementById('pinError2');

function openPinChangePopup() {
  if (!pinChangeOverlay) return;

  pinChangeOverlay.classList.add('show');
  pinChangeOverlay.style.display = 'flex';

  if (oldPinInput) oldPinInput.value = '';
  if (newPinInput) newPinInput.value = '';
  if (newPinInput2) newPinInput2.value = '';

  setStatus(pinError2, '', 'info');
  oldPinInput && oldPinInput.focus();
}

function closePinChangePopup() {
  if (!pinChangeOverlay) return;

  pinChangeOverlay.classList.remove('show');
  pinChangeOverlay.style.display = 'none';
}

async function handlePinChange() {
  const oldPin = oldPinInput?.value.trim() || '';
  const newPin = newPinInput?.value.trim() || '';
  const newPin2 = newPinInput2?.value.trim() || '';

  if (!oldPin || !newPin || newPin !== newPin2) {
    setStatus(pinError2, 'PIN ongeldig.', 'error');
    return;
  }

  try {
    const j = await ajax('/api/admin/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPin, newPin })
    });

    if (!j.ok) {
      setStatus(pinError2, j.message || 'Wijzigen mislukt.', 'error');
      return;
    }

    setStatus(pinError2, '✔ PIN gewijzigd.', 'ok');
    setTimeout(closePinChangePopup, 800);
  } catch (err) {
    setStatus(pinError2, 'Serverfout.', 'error');
  }
}

/************************************************************
 * LOGIN / REGISTRATIE INIT
 ************************************************************/
(function initLoginRegister() {
  const regOnlyFields = document.querySelectorAll('.reg-only');
  const loginBtn = document.getElementById('Button1');
  const regBtn = document.getElementById('Button2');
  const goReg = document.getElementById('GoRegister');
  const goLogin = document.getElementById('GoLogin');
  const forgot = document.getElementById('ForgotLink');

  function setMode(mode) {
    const isLogin = mode === 'login';

    regOnlyFields.forEach(el => {
      el.style.display = isLogin ? 'none' : 'block';
    });

    if (loginBtn) loginBtn.style.display = isLogin ? 'inline-block' : 'none';
    if (regBtn) regBtn.style.display = isLogin ? 'none' : 'inline-block';
    if (goReg) goReg.style.display = isLogin ? 'inline' : 'none';
    if (goLogin) goLogin.style.display = isLogin ? 'none' : 'inline';
  }

  setMode('login');

  goReg && goReg.addEventListener('click', e => {
    e.preventDefault();
    setMode('registreer');
  });

  goLogin && goLogin.addEventListener('click', e => {
    e.preventDefault();
    setMode('login');
  });

  loadNotice();
})();

/************************************************************
 * EVENTS / BINDINGS
 ************************************************************/
btnEditNotice && btnEditNotice.addEventListener('click', startEditNotice);
btnNoticeClose && btnNoticeClose.addEventListener('click', saveNotice);

btnOk && btnOk.addEventListener('click', handlePinUnlock);
logo && logo.addEventListener('dblclick', e => {
  e.preventDefault();
  openAdminPhase1();
  pinInput && pinInput.focus();
});

document.getElementById('btnCloseAdmin')?.addEventListener('click', closeAdminUI);
document.getElementById('btnCloseAdmin2')?.addEventListener('click', closeAdminPan);
document.getElementById('btnClosePinChange')?.addEventListener('click', closePinChangePopup);

btnPinChange && btnPinChange.addEventListener('click', openPinChangePopup);
btnChangeCode && btnChangeCode.addEventListener('click', handlePinChange);

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