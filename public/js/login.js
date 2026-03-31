
/************************************************************
 * 1) ADMIN UI OPEN / CLOSE
 ************************************************************/
 document.addEventListener("DOMContentLoaded", () => {
    // AL je code hierbinnen


 
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
    console.error("Admin login error:", err);
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

  const actie = document.activeElement.value;
  const email = document.getElementById("Editbox4").value.trim();
  const password = document.getElementById("Editbox6").value.trim();

  if (actie === "registreer") {
    const naam      = document.getElementById("Editbox1").value.trim();
    const adres     = document.getElementById("Editbox2").value.trim();
    const gemeente  = document.getElementById("Editbox3").value.trim();
    const telefoon  = document.getElementById("Editbox5").value.trim();

    const res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam, adres, gemeente, telefoon, email, password })
    });

    const data = await res.json();
    alert(data.ok ? "Registratie gelukt!" : data.error);
    return;
  }

  if (actie === "login") {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.ok) {
      localStorage.setItem("token", data.token);
      window.location.href = "leden-dashboard.html";
    } else {
      alert(data.error || "Login mislukt.");
    }
  }
});

});
