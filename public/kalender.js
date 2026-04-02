/* ============================================================
   KALENDER.JS — COMPLETE NIEUWE VERSIE
   Frank — WTC Hoppeland
   ============================================================ */

/* ============================================================
   USER MODEL
   ============================================================ */

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function isAdmin() {
  const u = getUser();
  return u && u.isAdmin === true;
}

function getUserEmail() {
  const u = getUser();
  return u && u.email ? u.email : null;
}

function getUserName() {
  const u = getUser();
  return u && u.name ? u.name : "Bezoeker";
}

/* ============================================================
   API HELPERS
   ============================================================ */

async function apiJson(url, options = {}) {
  try {
    const r = await fetch(url, options);
    return await r.json();
  } catch (err) {
    console.error("API fout:", err);
    return null;
  }
}

async function loadEvents() {
  return await apiJson("/events");
}

async function loadSignupsForEvent(eventId) {
  const r = await apiJson(`/signups?event_id=${eventId}`);
  if (!r || r.error) {
    console.error("Signups laden mislukt:", r);
    return [];
  }
  return r;
}

async function getSignupStatus(eventId, email) {
  if (!email) return { signed_up: false };
  return await apiJson(`/signup-status?event_id=${eventId}&email=${encodeURIComponent(email)}`);
}

async function doSignup(eventId) {
  const email = getUserEmail();
  if (!email) return { ok: false };
  return await apiJson("/signup", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `event_id=${eventId}&email=${encodeURIComponent(email)}`
  });
}

async function doCancel(eventId) {
  const email = getUserEmail();
  if (!email) return { ok: false };
  return await apiJson("/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `event_id=${eventId}&email=${encodeURIComponent(email)}`
  });
}

/* ============================================================
   DOM ELEMENTS
   ============================================================ */

const eventDialog = document.getElementById("eventDialog");
const dialogBody  = document.getElementById("dialogBody");
const memberActions = document.getElementById("memberActions");

const headerUserName = document.getElementById("naam");
const weekRange = document.getElementById("weekLabel");

const grid = document.getElementById("grid");

let events = [];
let currentWeekStart = null;
let editingEvent = null;
let signupDownloaded = false;

/* ============================================================
   INIT
   ============================================================ */
document.getElementById("btnPrev").onclick = () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  render();
};

document.getElementById("btnNext").onclick = () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  render();
};

document.getElementById("btnToday").onclick = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() + diff);
  render();
};

const user = getUser();
const header = document.getElementById("header");
if (header) {
  header.textContent = `Welkom beste ${user.isAdmin ? "Beheerder" : user.email}`;
}


async function init() {
  const user = getUser();

  // Header
  if (headerUserName) {
    headerUserName.textContent = user.isAdmin ? "Beheerder" : user.name || "Lid";
  }

  // Week start = maandag
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() + diff);

  events = await loadEvents();
  renderWeek();
}

document.addEventListener("DOMContentLoaded", init);

/* ============================================================
   WEEK RENDERING
   ============================================================ */

function renderWeek() {
  renderWeekHeader();
  renderGrid();
  renderEvents();
}

function renderWeekHeader() {
  const start = new Date(currentWeekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  if (weekRange) {
  weekRange.textContent = `${start.toLocaleDateString("nl-BE")} - ${end.toLocaleDateString("nl-BE")}`;
}

    `${start.toLocaleDateString("nl-BE")} - ${end.toLocaleDateString("nl-BE")}`;
}

function renderGrid() {
  grid.innerHTML = "";

  for (let h = 6; h <= 22; h++) {
    const row = document.createElement("div");
    row.className = "gridRow";
    row.dataset.hour = h;
    grid.appendChild(row);
  }
}

function renderEvents(eventLayer) {
  if (!eventLayer) return;
  eventLayer.innerHTML = "";

  const start = currentWeekStart;
  const end = addDays(start, 7);

  const weekEvents = events.filter(ev => {
    const d = new Date(ev.start);
    return d >= start && d < end;
  });

  for (const ev of weekEvents) {
    const startD = new Date(ev.start);
    const endD   = new Date(ev.end);

    const dayIndex = (startD.getDay() + 6) % 7; // maandag=0

    const startMinEv = startD.getHours() * 60 + startD.getMinutes();
    const endMinEv   = endD.getHours() * 60 + endD.getMinutes();

    const rowStart = Math.floor((startMinEv - startMin) / slotMinutes) + 2;
    const rowEnd   = Math.floor((endMinEv - startMin) / slotMinutes) + 2;

    const col = dayIndex + 2;

    const div = document.createElement("div");
    div.className = "event";
    div.style.gridColumn = col;
    div.style.gridRow = `${rowStart} / ${rowEnd}`;
    div.innerHTML = `
      <div class="title">${escapeHtml(ev.title)}</div>
    `;

    div.onclick = () => openEventDialog(ev);

    eventLayer.appendChild(div);
  }
}


function renderEvent(ev) {
  const startD = new Date(ev.start);
  const hour = startD.getHours();

  const row = grid.querySelector(`.gridRow[data-hour="${hour}"]`);
  if (!row) return;

  const div = document.createElement("div");
  div.className = "eventItem";
  div.textContent = ev.title;
  div.onclick = () => openEventDialog(ev);

  row.appendChild(div);
}

/* ============================================================
   EVENT DIALOG DISPATCHER
   ============================================================ */

function openEventDialog(ev) {
  if (isAdmin()) openAdminDialog(ev);
  else openMemberDialog(ev);
}

/* ============================================================
   MEMBER DIALOG
============================================================ */

async function openMemberDialog(eventData) {
  signupDownloaded = false;

  const email = getUserEmail();
  const statusJson = await getSignupStatus(eventData.id, email);
  let status = null;

  if (statusJson?.signed_up) {
    status = (statusJson.status || "").toLowerCase().trim();
    if (status !== "pending" && status !== "confirmed") status = "pending";
  }

  const startD = new Date(eventData.start);
  const endD   = new Date(eventData.end);

  const e = { ...eventData, startD, endD };

  dialogBody.innerHTML = renderMemberLeft(e);
  memberActions.innerHTML = renderMemberRight(e, status);

  attachMemberEvents(e, status);

  eventDialog.showModal();
}

function renderMemberLeft(e) {
  return `
    <h3>${escapeHtml(e.title)}</h3>
    <div class="eventDate">
      ${e.startD.toLocaleDateString("nl-BE", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      })}
    </div>
    <p><strong>Van:</strong> ${pad2(e.startD.getHours())}:${pad2(e.startD.getMinutes())}
       &nbsp;&nbsp;
       <strong>Tot:</strong> ${pad2(e.endD.getHours())}:${pad2(e.endD.getMinutes())}</p>
    <hr>
    <p>${escapeHtml(e.info)}</p>
    <p>
      ${e.requires_signup ? "Inschrijving verplicht<br>" : ""}
      ${e.mandatory ? "Deelname verplicht<br>" : ""}
      ${e.paid ? `Prijs: ${e.price} €` : ""}
    </p>
  `;
}

function renderMemberRight(e, status) {
  if (!e.requires_signup) {
    return `<div class="signupStatus info">Geen inschrijving nodig.</div>`;
  }

  if (status === "pending" || status === "confirmed") {
    return `<div class="statusok">✔️ U bent ingeschreven!</div>`;
  }

  return `
    <label class="signupLabel">
      <input type="checkbox" id="mDoSignup">
      <span class="signupText">Ik schrijf mij in.</span>
    </label>
    <div id="qrWrap" style="display:none;">
      <div id="qrCode" style="margin:20px 60px;"></div>
      <div id="qrText" style="font-size:16px;font-weight:700;margin:20px;color:#6450E1;">
        Druk download bevestiging en U bent ingeschreven!
      </div>
    </div>
    <button id="btnDownload" class="wtc-button" style="display:none;margin:20px;">
      Download bevestiging
    </button>
  `;
}

function generateQR(e) {
  const qrDiv = document.getElementById("qrCode");
  qrDiv.innerHTML = "";
  new QRCode(qrDiv, {
    text: e.qr_text,
    width: 180,
    height: 180
  });
}

function attachMemberEvents(e, status) {
  const chk        = document.getElementById("mDoSignup");
  const qrWrap     = document.getElementById("qrWrap");
  const qrText     = document.getElementById("qrText");
  const btn        = document.getElementById("btnDownload");
  const signupText = document.querySelector(".signupText");

  let lastSignup = null;

  if (!chk) return;

  function showQR() {
    qrWrap.style.display = "block";
    qrText.style.display = "block";
    generateQR(e);
  }

  function hideQR() {
    qrWrap.style.display = "none";
    qrText.style.display = "none";
  }

  if (status === "pending" || status === "confirmed") {
    chk.checked = true;
    chk.disabled = true;
    showQR();
    btn.style.display = "block";
    lastSignup = { event_id: e.id, email: getUserEmail(), status };
    return;
  }

  chk.onchange = async () => {
    if (signupDownloaded) return;

    if (chk.checked) {
      const r = await doSignup(e.id);
      if (!r || !r.ok) {
        alert("Inschrijving mislukt");
        chk.checked = false;
        return;
      }
      lastSignup = r.signup;

      if (signupText) {
        signupText.textContent = "Scan de code met uw bankapp.";
      }

      showQR();
      btn.style.display = "block";
      return;
    }

    const r = await doCancel(e.id);
    if (!r || !r.ok) {
      alert("Annuleren mislukt");
      chk.checked = true;
      return;
    }

    if (signupText) {
      signupText.textContent = "Ik schrijf mij in.";
    }

    hideQR();
    btn.style.display = "none";
    lastSignup = null;
  };

  btn.onclick = () => {
    if (!lastSignup) return;
    signupDownloaded = true;

    if (signupText) {
      signupText.textContent = "✔️ U bent ingeschreven";
    }

    downloadConfirmation(e, lastSignup);
  };
}

function downloadConfirmation(event, signup) {
  const start = new Date(event.start);
  const dateStr = start.toLocaleDateString("nl-BE");
  const timeStr = start.toLocaleTimeString("nl-BE");

  const prijs = Number(event.price || 0).toFixed(2).replace(".", ",");
  const betaald = signup.paid ? "ja" : "onder voorbehoud";

  const text =
    `Beste ${signup.name}\n\n` +
    `Bevestiging van uw inschrijving voor:\n\n` +
    `Event  : ${event.title}\n` +
    `Datum  : ${dateStr}\n` +
    `om     : ${timeStr}\n` +
    `Prijs  : ${prijs} €\n` +
    `Betaald: ${betaald}\n`;

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "inschrijving.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

/* ============================================================
   ADMIN DIALOG
============================================================ */

async function openAdminDialog(eventData) {
  const startD = new Date(eventData.start);
  const endD   = new Date(eventData.end);

  const signups = await loadSignupsForEvent(eventData.id);

  const e = { ...eventData, startD, endD, signups };

  dialogBody.innerHTML = renderAdminLeft(e);
  memberActions.innerHTML = renderAdminRight(e);

  editingEvent = e;

  const btnSave   = document.getElementById("btnSave");
  const btnDelete = document.getElementById("btnDelete");

  if (btnSave) {
    btnSave.style.display = "inline-block";
    btnSave.onclick = () => handleSaveEvent();
  }

  if (btnDelete) {
    btnDelete.style.display = e.id ? "inline-block" : "none";
    btnDelete.onclick = () => handleDeleteEvent();
  }

  eventDialog.showModal();
}

function renderAdminLeft(e) {
  return `
    <h3>Event bewerken</h3>

    <label>Titel<br>
      <input id="fTitle" type="text" value="${escapeHtml(e.title || "")}">
    </label>

    <div class="row">
      <label>Van<br>
        <input id="fStart" type="time" value="${pad2(e.startD.getHours())}:${pad2(e.startD.getMinutes())}">
      </label>
      <label>Tot<br>
        <input id="fEnd" type="time" value="${pad2(e.endD.getHours())}:${pad2(e.endD.getMinutes())}">
      </label>
    </div>

    <label>Info<br>
      <textarea id="fInfo" rows="5">${escapeHtml(e.info || "")}</textarea>
    </label>

    <hr>

    <label><input type="checkbox" id="fSignup" ${e.requires_signup ? "checked" : ""}> Inschrijving vereist</label>
    <label><input type="checkbox" id="fMandatory" ${e.mandatory ? "checked" : ""}> Verplicht</label>
    <label><input type="checkbox" id="fPaid" ${e.paid ? "checked" : ""}> Betalend</label>

    <div id="priceWrap" style="${e.paid ? "" : "display:none"}">
      <input id="fPrice" type="number" min="0" step="1" value="${Number(e.price || 0)}"> €
    </div>
  `;
}

function renderAdminRight(e) {
  let html = `<h3>Inschrijvingen</h3>`;

  if (!e.signups || e.signups.length === 0) {
    html += `<p>Geen inschrijvingen.</p>`;
    return html;
  }

  html += `<ul class="signupList">`;

  for (const s of e.signups) {
    html += `
      <li>
        <strong>${escapeHtml(s.name || "")}</strong><br>
        ${escapeHtml(s.email || "")}<br>
        Status: ${escapeHtml(s.status || "")}
      </li>
    `;
  }

  html += `</ul>`;
  return html;
}

/* ============================================================
   EVENT OPSLAAN / VERWIJDEREN (ADMIN)
============================================================ */

async function handleSaveEvent() {
  if (!editingEvent) return;

  const titleEl = document.getElementById("fTitle");
  const startEl = document.getElementById("fStart");
  const endEl   = document.getElementById("fEnd");
  const infoEl  = document.getElementById("fInfo");
  const signupEl   = document.getElementById("fSignup");
  const mandatoryEl= document.getElementById("fMandatory");
  const paidEl     = document.getElementById("fPaid");
  const priceEl    = document.getElementById("fPrice");

  const title = (titleEl?.value || "").trim();
  if (!title) {
    alert("Titel is verplicht.");
    return;
  }

  const startTime = startEl?.value || "00:00";
  const endTime   = endEl?.value || "00:00";

  const startD = new Date(editingEvent.startD);
  const [sh, sm] = startTime.split(":").map(Number);
  startD.setHours(sh, sm, 0, 0);

  const endD = new Date(editingEvent.startD);
  const [eh, em] = endTime.split(":").map(Number);
  endD.setHours(eh, em, 0, 0);

  const payload = {
    title,
    info: infoEl?.value || "",
    start: startD.toISOString(),
    end: endD.toISOString(),
    requires_signup: !!(signupEl && signupEl.checked),
    mandatory: !!(mandatoryEl && mandatoryEl.checked),
    paid: !!(paidEl && paidEl.checked),
    price: Number(priceEl?.value || 0)
  };

  const isNew = !editingEvent.id;

  const url = isNew ? "/events" : `/events/${editingEvent.id}`;
  const method = isNew ? "POST" : "PUT";

  const r = await apiJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r || r.error) {
    console.error("Event opslaan mislukt:", r);
    alert("Opslaan mislukt.");
    return;
  }

  // Events herladen
  events = await loadEvents();
  renderWeek();

  if (eventDialog && eventDialog.close) {
    eventDialog.close();
  }
}

async function handleDeleteEvent() {
  if (!editingEvent || !editingEvent.id) return;

  if (!confirm("Event verwijderen?")) return;

  const r = await apiJson(`/events/${editingEvent.id}`, {
    method: "DELETE"
  });

  if (!r || r.error) {
    console.error("Event verwijderen mislukt:", r);
    alert("Verwijderen mislukt.");
    return;
  }

  events = await loadEvents();
  renderWeek();

  if (eventDialog && eventDialog.close) {
    eventDialog.close();
  }
}

/* ============================================================
   KLEINE HELPERS
============================================================ */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
