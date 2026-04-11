/************************************************************
 * CORE HELPERS
 ************************************************************/
 
const noticeStatus = document.getElementById('loginStatus');

async function ajax(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    'Accept': 'application/json'
  };

  const res = await fetch(url, options);
  const ct = res.headers.get('content-type') || '';

  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error('Server returned non-JSON:\n' + text.slice(0, 200));
  }

  return res.json();
} 

 /*********Helper meldingen ***********/
 
function setStatus(el, message = '', type = 'info'){
  if (!el) return;

  el.textContent = message;
  el.classList.remove('ok', 'error', 'info');
  el.classList.add(type);
}
	

  /************************************************************
   * 0) BASIS DOM
   ************************************************************/
  const logo         = document.getElementById('Image1');
  const adminOverlay = document.getElementById('adminOverlay'); 
  
  const API_NOTICE = '/notice';

 // const ROUTES_API = /WTC/routes/upload_do.php';
  
  
 
  /************************************************************
   * 2) NOTICE
   ************************************************************/
  const box    = document.getElementById('noticeBox'); 
  const btnEditNotice  = document.getElementById('btnEditNotice');
  const btnNoticeClose = document.getElementById('btnNoticeClose');
  const btnMedSave = document.getElementById('btnMedSave');

  
 function setRaw(text){
    if (box) box.dataset.raw = String(text || '');
  }
  function getRaw(){
    return box ? (box.dataset.raw || '') : '';
  }

function fmt(text){
  const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  const lines = String(text||'')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim());

  let html = '';
  let inList = false;

const R = {
  lg:   /\[lg\]\s*([\s\S]*?)\s*\[\/lg\]/g,
  sm:   /\[sm\]\s*([\s\S]*?)\s*\[\/sm\]/g,
  bold: /\*\*\s*([\s\S]+?)\s*\*\*/g,
  em:   /\*\s*([\s\S]+?)\s*\*/g,
  u:    /__\s*([\s\S]+?)\s*__/g
};

	
 const pushLine = (raw) => {let body = esc(raw);
   
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

  for (let line of lines) {

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

  function render(){
    if (!box) return;
    box.innerHTML = fmt(getRaw());
  }

function loadNotice(){
  if (!box) return;

  const status = document.getElementById('loginStatus');
  setStatus(status, 'Tekst laden…', 'info');

fetch(API_NOTICE)
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  })
  .then(t => {
    setRaw(t);
    render();
    setStatus(status, '', 'info');
  })
  .catch(e => {
    console.error(e);
    setStatus(status, 'Fout bij laden.', 'error');
    });
}


  function startEditNotice(){
    if (!box) return;
    box.innerText = getRaw();
    box.contentEditable = 'true';
    box.focus();
  }

async function saveNotice(){
  if (!box) return;
 
  if (noticeBox.contentEditable !== "true") return;

  const adminStatus = document.getElementById('admin-status');

  const raw = (box.innerText || '').replace(/\r\n?/g, '\n');
  setRaw(raw);
  box.setAttribute('contenteditable','false');
  
  render();
  
  const fdNotice = new FormData();
  fdNotice.append('action', 'setNotice');
  fdNotice.append('text', raw);

  setStatus(btnMedSave, 'Bewaren…', 'info');

  try {
    const j = await ajax(API_NOTICE, {
      method: 'POST',
      body: fdNotice
    });

    if (!j.ok){
      setStatus(btnMedSave, 'Kon tekst niet bewaren.', 'error');
      return;
    }

    setStatus(btnMedSave, '✔ Opgeslagen', 'ok');
    box.setAttribute('contenteditable','false');
	
	

  } catch (e){
    console.error(e);
    setStatus(adminStatus, 'Technische fout bij bewaren.', 'error');
  }
}


  btnEditNotice && btnEditNotice.addEventListener('click', startEditNotice);
  btnNoticeClose && btnNoticeClose.addEventListener('click', saveNotice);
	

/************************************************************
 * 3) ADMIN CONFIG (naam + IBAN + BIC + Mededeling)
 ************************************************************/
 
function initAdminConfigCard(){

  const elName  = document.getElementById('cfgOrgName');
  const elIban  = document.getElementById('cfgIban');
  const elBic  = document.getElementById('cfgBic');
  const elMed  = document.getElementById('cfgMed');
  const btnSave = document.getElementById('btnSaveConfig');
  const elStat  = document.getElementById('configSaveStatus');

  const confSaveStatus  = document.getElementById('confSaveStatus');

  if (!elName || !elIban || !elBic || !elMed ||!btnSave) return;
  

  // Laden
  (async () => {
    try {
      const j = await ajax('api_admin_config.php');
      if (j?.ok && j.config){
        elName.value = j.config.vereniging?.naam || '';
        elIban.value = j.config.vereniging?.iban || '';
		elBic.value = j.config.vereniging?.bic || '';
		elMed.value = j.config.vereniging?.med || '';
      }
    } catch (e){
      setStatus(confSaveStatus, 'Kon configuratie niet laden.', 'error');
    }
  })();

  // Opslaan
	 btnSave.addEventListener('click', async () => {
	 setStatus(confSaveStatus, 'Naam en bestand zijn verplicht.', 'error');

  try {
    const j = await ajax('api_admin_config.php', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        vereniging: {
          naam: elName.value.trim(),
          iban: elIban.value.trim(),
		  bic: elBic.value.trim(),
		  med: elMed.value.trim()
        }
      })
    });

    if (!j.ok){
	   setStatus(confSaveStatus, 'Niet opgeslagen.', 'error');
      return;
    }

	setStatus(confSaveStatus,'✔ Opgeslagen.','ok');
  } catch (e){
    console.error(e);
   	   setStatus(confSaveStatus, 'Technische fout!', 'error');
  }
});
}

  function closeAdminUI(){
    adminLogin && (adminLogin.style.display = 'none');
    adminFase2 && adminFase2.classList.remove('open');
  }
	function closeAdminPan() {

		// 1. Overlay sluiten
		if (adminFase2) {
			adminFase2.style.display = 'none';
		}

		// 2. overlay=1 uit de URL verwijderen
		const url = new URL(window.location);
		url.searchParams.delete('overlay');
		window.history.replaceState({}, '', url);
	}

  function closePinWijz(){
    pinChangeOverlay && (pinChangeOverlay.style.display = 'none');
  
  }
/************************************************************
 * 4) ROUTES
 ************************************************************/
	const btnUploadRoute = document.getElementById('btnUploadRoute');
	const btnCloseRoute  = document.getElementById('btnCloseRoute');
	const routeOverlay  = document.getElementById('routeOverlay');
	const routeError    = document.getElementById('routeError');

function closeRouteOverlay(){
	  routeOverlay && routeOverlay.classList.remove('show');
	}

	if (btnCloseRoute){
	  btnCloseRoute.addEventListener('click', closeRouteOverlay);
	}

	if (btnUploadRoute){
	  btnUploadRoute.addEventListener('click', async () => {

    const naam  = document.getElementById('routeNaam')?.value.trim();
    const groep = document.getElementById('routeGroep')?.value;
	const afstand = document.getElementById('routeAfstand').value.trim();
	const start   = document.getElementById('routeStart').value.trim();
    const file  = document.getElementById('routeFile')?.files[0];
	
 

    if (!naam || !file){
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

      if (!res.ok){
        setStatus(routeError,' Upload mislukt.','error');
        return;
      }

      closeRouteOverlay();
      setStatus(routeError, '✔ Route toegevoegd.', 'ok');

    } catch (e){
      console.error(e);
      setStatus(routeError, 'Technische fout bij upload.', 'error');
    }
  });
}
	
document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);

    if (params.get('overlay') === '1') {
        // wacht tot ALLE scripts geladen zijn
        setTimeout(() => {
            if (typeof openAdminPhase2 === 'function') {
                openAdminPhase2();
            }
        }, 50);
    }
});
  
  
  /************************************************************
   * 5) PIN WIJZIGEN POPUP (APART)
   ************************************************************/
  const btnPinChange      = document.getElementById('btnPinChange');
  const pinChangeOverlay  = document.getElementById('pinChangeOverlay');
  const btnChangeCode     = document.getElementById('btnChangeCode');
  const btnClosePinChange = document.getElementById('btnClosePinChange');
  const closePinOverlay  = document.getElementById('closePinOverlay');
  const oldPinInput  = document.getElementById('oldPinInput');
  const newPinInput  = document.getElementById('newPinInput');
  const newPinInput2 = document.getElementById('newPinInput2');
  const pinChangeErr = document.getElementById('pinChangeError');    //
  
  const pinError2 = document.getElementById('pinError2');
  
  function openPinChangePopup(){
    pinChangeOverlay.classList.add('show');
    oldPinInput && (oldPinInput.value = '');
    newPinInput && (newPinInput.value = '');
    newPinInput2 && (newPinInput2.value = '');
    pinChangeErr.textContent = '';
    oldPinInput && oldPinInput.focus();
  }

  function closePinChangePopup(){
    pinChangeOverlay.classList.remove('show');
  }

  async function handlePinChange(){
    const oldPin = oldPinInput.value.trim();
    const newPin = newPinInput.value.trim();
    const newPin2= newPinInput2.value.trim();

    if (!oldPin || !newPin || newPin !== newPin2){
      setStatus(pinError2,'PIN ongeldig.','error');
      return;
    }

    const fd = new FormData();
    fd.append('actie','admin_change_pin');
    fd.append('old_pin', oldPin);
    fd.append('new_pin', newPin);

    try{
      const r = await fetch('./leden.php',{method:'POST',body:fd});
      const j = await r.json();
      if (!j.ok){
           setStatus(pinError2,'wijzigen mislukt.','error');
        return;
      }
      pinChangeErr.textContent = '✔ PIN gewijzigd';
      setTimeout(closePinChangePopup, 800);
    }catch{
         setStatus(pinError2,'✔ PIN gewijzigd.','ok');
    }
  }

 document.getElementById('btnCloseAdmin')
  ?.addEventListener('click', closeAdminUI);

 document.getElementById('btnCloseAdmin2')
  ?.addEventListener('click', closeAdminPan);

 document.getElementById('btnClosePinChange')
  ?.addEventListener('click', closePinWijz);

  btnPinChange && btnPinChange.addEventListener('click', openPinChangePopup);
  btnChangeCode && btnChangeCode.addEventListener('click', handlePinChange);

if (btnPinChange && pinChangeOverlay){btnPinChange.addEventListener('click', () => {showPinOverlay();
    });
}

function showPinOverlay(){
    pinChangeOverlay.style.display = 'flex';
}