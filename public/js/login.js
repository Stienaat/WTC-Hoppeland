
/************************************************************
 * 1) ADMIN UI OPEN / CLOSE
 ************************************************************/
 
document.addEventListener("DOMContentLoaded", () => {
 
const adminLogin   = document.getElementById("adminLogin");
const adminFase2   = document.getElementById("adminFase2");
const adminStatus  = document.getElementById("admin-status");
const adminLogo = document.getElementById("adminLogo");

function openAdminPhase1() {
  if (adminLogin) adminLogin.style.display = "block";
  if (adminFase2) adminFase2.classList.remove("open");
}

function openAdminPhase2() {
  if (adminLogin) adminLogin.style.display = "none";
  if (adminFase2) adminFase2.classList.add("open");
  if (typeof initAdminConfigCard === "function") {
    initAdminConfigCard();
  }
}

function closeAdminUI() {
  if (adminLogin) adminLogin.style.display = "none";
  if (adminFase2) adminFase2.classList.remove("open");
}

function closeAdminPan() {
  if (adminFase2) adminFase2.style.display = "none";

  const url = new URL(window.location);
  url.searchParams.delete("overlay");
  window.history.replaceState({}, "", url);
}

 document.getElementById('btnCloseAdmin2');
 btnCloseAdmin2?.addEventListener('click', closeAdminPan);
 


/************************************************************
 * 2) ADMIN LOGIN (PIN)
 ************************************************************/
const pinInput = document.getElementById("pinInput");
const btnOk    = document.getElementById("btnOk");
const pinError = document.getElementById("pinError");

async function handleAdminLogin(pin) {
  if (!pin || pin.length !== 6) {
    setStatus(pinError, "PIN moet 6 cijfers zijn.");
    return;
  }

  try {
    const res = await fetch("/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });

    const data = await res.json();

    if (!data.ok) {
      setStatus(pinError, data.error || "PIN onjuist.");
      return;
    }

    // Admin authenticated
    localStorage.setItem("is_admin", "true");
    pinError.textContent = "";
    pinInput.value = "";
    openAdminPhase2();

  } catch (err) {
    showModal("error", "❌", "Verzenden mislukt: " + err.message);

    setStatus(pinError, "Serverfout.");
  }
}

btnOk?.addEventListener("click", () => {
  handleAdminLogin(pinInput.value.trim());
});

adminLogo?.addEventListener("dblclick", e => {
  e.preventDefault();
  openAdminPhase1();
  pinInput?.focus();
});

/************************************************************
 * 3) PIN WIJZIGEN
 ************************************************************/
const btnPinChange      = document.getElementById("btnPinChange");
const pinChangeOverlay  = document.getElementById("pinChangeOverlay");
const btnChangeCode     = document.getElementById("btnChangeCode");
const btnClosePinChange = document.getElementById("btnClosePinChange");

const oldPinInput  = document.getElementById("oldPinInput");
const newPinInput  = document.getElementById("newPinInput");
const newPinInput2 = document.getElementById("newPinInput2");
const pinChangeErr = document.getElementById("pinChangeError");
const pinError2    = document.getElementById("pinError2");

function openPinChangePopup() {
  pinChangeOverlay?.classList.add("show");
  oldPinInput.value = "";
  newPinInput.value = "";
  newPinInput2.value = "";
  pinChangeErr.textContent = "";
  oldPinInput.focus();
}

function closePinChangePopup() {
  pinChangeOverlay?.classList.remove("show");
}

async function handlePinChange() {
  const oldPin = oldPinInput.value.trim();
  const newPin = newPinInput.value.trim();
  const newPin2 = newPinInput2.value.trim();

  if (!oldPin || !newPin || newPin !== newPin2) {
    setStatus(pinError2, "PIN ongeldig.");
    return;
  }

  try {
    const res = await fetch("/admin-change-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPin, newPin })
    });

    const data = await res.json();

    if (!data.ok) {
      setStatus(pinError2, data.error || "Wijzigen mislukt.");
      return;
    }

    pinChangeErr.textContent = "✔ PIN gewijzigd";
    setTimeout(closePinChangePopup, 800);

  } catch (err) {
    console.error("PIN change error:", err);
    setStatus(pinError2, "Serverfout.");
  }
}



btnPinChange?.addEventListener("click", openPinChangePopup);
btnChangeCode?.addEventListener("click", handlePinChange);
btnClosePinChange?.addEventListener("click", closePinChangePopup);

/************************************************************
 * 4) LOGIN / REGISTRATIE UI
 ************************************************************/
(function initLoginRegister() {
  const regOnlyFields = document.querySelectorAll(".reg-only");
  const loginBtn = document.getElementById("Button1");
  const regBtn   = document.getElementById("Button2");
  const goReg    = document.getElementById("GoRegister");
  const goLogin  = document.getElementById("GoLogin");

  function setMode(mode) {
    const isLogin = mode === "login";

    regOnlyFields.forEach(el => el.style.display = isLogin ? "none" : "block");
    loginBtn.style.display = isLogin ? "inline-block" : "none";
    regBtn.style.display   = isLogin ? "none" : "inline-block";
    goReg.style.display    = isLogin ? "inline" : "none";
    goLogin.style.display  = isLogin ? "none" : "inline";
  }

  setMode("login");

  goReg?.addEventListener("click", e => {
    e.preventDefault();
    setMode("registreer");
  });

  goLogin?.addEventListener("click", e => {
    e.preventDefault();
    setMode("login");
  });

  if (typeof loadNotice === "function") {
    loadNotice();
  }
})();

/************************************************************
 * 5) MEMBER LOGIN & REGISTRATIE
 ************************************************************/

document.getElementById("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  // Welke knop werd ingedrukt? (login of registreer)
  const actie = document.activeElement.value;

  // LOGIN velden
  const email    = document.getElementById("Editbox4").value.trim();
  const password = document.getElementById("Editbox6").value.trim();

  // REGISTRATIE velden
  const naam      = document.getElementById("Editbox1").value.trim();
  const adres     = document.getElementById("Editbox2").value.trim();
  const gemeente  = document.getElementById("Editbox3").value.trim();
  const telefoon  = document.getElementById("Editbox5").value.trim();
  const codeRepeat = document.getElementById("Editbox7").value.trim();

  /***********************
   * REGISTRATIE
   ***********************/
  if (actie === "registreer") {

    if (password !== codeRepeat) {
      showModal("error", "👎", "Paswoorden komen niet overeen.");
      return;
    }

    const res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam, adres, gemeente, telefoon, email, password })
    });

    const data = await res.json();
	
     showModal("success", "Welkom", "Je bent geregistreerd. ✔️ Je kunt nu inloggen !");
	 setTimeout(() => {
		window.location.href = "leden.html";
	  }, 5000);


  }

  /***********************
   * LOGIN
   ***********************/
  if (actie === "login") {

    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

	if (data.ok) {
	  localStorage.setItem("user_email", email);
	  showModal("success", "Welkom", "Je bent ingelogd. ✔️");
	  setTimeout(() => {
		window.location.href = "leden-dashboard.html";
	  }, 5000);
	} else {
	  showModal("error","👎","Login mislukt. ❌");
	}

  }
});

});

  /************************************************************
   * 6) NOTICE
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
    lg:   new RegExp("\\[lg\\]\\s*([\\s\\S]*?)\\s*\\[\\/lg\\]", "g"),
	
	sm:   new RegExp("\\[sm\\]\\s*([\\s\\S]*?)\\s*\\[\\/sm\\]", "g"),
		
	bold: new RegExp("\\*\\*\\s*([\\s\\S]+?)\\s*\\*\\*", "g"),
	em:   new RegExp("\\*\\s*([\\s\\S]+?)\\s*\\*", "g"),   
	u:    new RegExp("__\\s*([\\s\\S]+?)\\s*__", "g")
	
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
    setStatus(status, 'Tekst laden…', 'info');
 fetch('/notice.md')
  .then(r => r.text())
  .then(md => {
    document.getElementById('noticebox').innerHTML = marked.parse(md);
  });



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
	
