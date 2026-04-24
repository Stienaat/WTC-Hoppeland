document.addEventListener("DOMContentLoaded", () => {

const adminLogin = document.getElementById("adminLogin");
const adminFase2 = document.getElementById("adminFase2");


/************************************************************
 * ADMIN UI
 ************************************************************/
 
function openAdminPhase1() {
  adminLogin && (adminLogin.style.display = "block");
  adminFase2 && adminFase2.classList.remove("open");
}

function openAdminPhase2() {
  adminLogin && (adminLogin.style.display = "none");
  adminFase2 && adminFase2.classList.add("open");

  if (typeof initAdminConfigCard === "function") {
    initAdminConfigCard();
  }
}

function closeAdminUI() {
  adminLogin && (adminLogin.style.display = "none");
  adminFase2 && adminFase2.classList.remove("open");
}

/************************************************************
 * ADMIN LOGIN (PIN)
 ************************************************************/
async function openAdminPrompt() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <input 
      type="password" 
      id="modal-pin-input" 
      class="wtc-input" 
      style="font-size:1.2em"
      maxlength="6"
      autocomplete="off"
      placeholder="PIN-code: ******"
    >
    <div id="modal-pin-error" class="wtc-status"></div>
  `;

  const input = wrapper.querySelector("#modal-pin-input");
  const error = wrapper.querySelector("#modal-pin-error");

  while (true) {
    const result = await Modal.content("Beheerder", wrapper, [
      { text: "Ontgrendel", value: "ok" },
      { text: "Sluiten", value: null }
    ]);

    if (result === null) {
      return;
    }

    const pin = input.value.trim();

    if (!pin || pin.length !== 6) {
      error.textContent = "Pin moet 6 cijfers zijn.";
      input.focus();
      input.select();
      continue;
    }

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin })
      });

      const data = await res.json();

      if (!data.ok) {
        error.textContent = data.message || "Pin is onjuist.";
        input.value = "";
        input.focus();
        continue;
      }

      localStorage.setItem("is_admin", "true");
      error.textContent = "";
      input.value = "";
      openAdminPhase2();
      return;

    } catch (err) {
      error.textContent = "Login is mislukt.";
      input.focus();
    }
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
  const oldPin = oldPinInput?.value.trim() || "";
  const newPin = newPinInput?.value.trim() || "";
  const newPin2 = newPinInput2?.value.trim() || "";

  if (!oldPin || !newPin || newPin !== newPin2) {
    await Modal.error("👎", "PIN ongeldig. ❌");
    return;
  }

  try {
    const res = await fetch("/api/admin/change-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ oldPin, newPin })
    });

    const text = await res.text();
 

    let j;
    try {
      j = JSON.parse(text);
    } catch {
      await Modal.error("👎", "Server gaf geen geldige JSON terug.");
      return;
    }

    if (!res.ok || !j.ok) {
      await Modal.error("👎", j.message || j.error || "Wijzigen mislukt. ❌");
      return;
    }

    await Modal.success("👌", "PIN gewijzigd! ✔");
    setTimeout(closePinChangePopup, 800);

  } catch (err) {
   
    await Modal.error("👎", "Serverfout.");
  }
}

/************************************************************
 * EVENTS
 ************************************************************/

adminLogo?.addEventListener("dblclick", async e => {
  e.preventDefault();
  await openAdminPrompt();
});

const btnClosePinChange = document.getElementById("btnClosePinChange");
btnClosePinChange?.addEventListener("click", closePinChangePopup);

btnPinChange?.addEventListener("click", openPinChangePopup);
btnChangeCode?.addEventListener("click", handlePinChange);

document.getElementById("Forgotlink")?.addEventListener("click", async () => {
  const email = await Modal.prompt("Geef je e-mailadres");
  if (!email) return;

  try {
    const res = await fetch("/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const j = await res.json();

    if (!j.ok) {
      await Modal.error("👎", j.error || "Reset mislukt.");
      return;
    }

    await Modal.success("👌", "Als het e-mailadres bestaat, is er een mail verzonden.");
  } catch (err) {
    console.error("Forgot error:", err);
    await Modal.error("👎", "Serverfout.");
  }
});

});

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
 
	  await Modal.error("👎", "Paswoorden komen niet overeen! ❌");

      return;
    }

    const res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam, adres, gemeente, telefoon, email, password })
    });

    const data = await res.json();
	 await Modal.success("👌", "Welkom? Je bent geregistreerd. ✔️ Je kunt nu inloggen !");

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
	  // BEWAAR VOLLEDIGE MEMBER INFO + ADMIN-FLAG
	  localStorage.setItem("user_email", data.user.email);
	  localStorage.setItem("member", JSON.stringify(data.user));
	  localStorage.setItem("is_admin", data.user.is_admin ? "true" : "false");
	 
	  await Modal.success("👌", "Welkom, Je bent ingelogd. ✔️");
	  setTimeout(() => {
		window.location.href = "leden-dashboard.html";
	  }, 1500);
	}
	else {
		await Modal.error("👎", "Foute email of pincode! ❌");

	  }
}


});

