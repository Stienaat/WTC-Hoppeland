/* ============================================================
   CONFIG
============================================================ */

const API_EVENTS_URL  = "/events";
const API_SIGNUPS_URL = "/signups";

const USER_EMAIL = localStorage.getItem("email");
const IS_ADMIN   = localStorage.getItem("is_admin") === "true";

const slotMinutes = 30;
const startMin = 8 * 60;
const endMin   = 20 * 60;
const defaultScrollToMin = 8 * 60;

const dayNames = ["ma","di","woe","do","vr","za","zo"];

/* ============================================================
   STATE
============================================================ */

let events = [];
let currentWeekStart = startOfWeekMonday(new Date());
let editingEvent = null;
let signupDownloaded = false;

/* ============================================================
   DOM
============================================================ */

const gridEl = document.getElementById("grid");
const labelEl = document.getElementById("weekLabel");
const eventDialog = document.getElementById("eventDialog");
const dialogBody  = document.getElementById("eventDialogBody");
const memberActions = document.getElementById("memberActions");
const btnCloseTop = document.getElementById("btnCloseTop");

/* ============================================================
   HELPERS
============================================================ */

function pad2(n){ return String(n).padStart(2,"0"); }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function addDays(d,days){
  const x = new Date(d);
  x.setDate(x.getDate()+days);
  return x;
}

function startOfWeekMonday(d){
  const x = new Date(d);
  const day = (x.getDay()+6)%7;
  x.setHours(0,0,0,0);
  x.setDate(x.getDate()-day);
  return x;
}

function toDateOnlyKey(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function formatDayLabel(d){
  return `${dayNames[(d.getDay()+6)%7]} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
}

function formatWeekLabel(weekStart){
  const we = addDays(weekStart,6);
  return `${toDateOnlyKey(weekStart)} – ${toDateOnlyKey(we)}`;
}

function dayIndexFromWeekStart(d, weekStart){
  const a = new Date(weekStart); a.setHours(0,0,0,0);
  const b = new Date(d); b.setHours(0,0,0,0);
  return Math.round((b-a)/86400000);
}

function toLocalISO(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

function parseLocalISO(iso){
  return new Date(iso);
}

function overlaps(a,b){ return a.startM < b.endM && b.startM < a.endM; }

function layoutOverlaps(dayEvents){
  dayEvents.sort((a,b)=>a.startM-b.startM||b.endM-a.endM);
  let group=[];
  function flush(){
    const n=group.length;
    if(n<=1){
      group.forEach(ev=>{ ev.el.style.width="100%"; ev.el.style.transform=""; });
      group=[]; return;
    }
    const w=100/n;
    group.forEach((ev,i)=>{ ev.el.style.width=`${w}%`; ev.el.style.transform=`translateX(${i*w}%)`; });
    group=[];
  }
  for(const ev of dayEvents){
    if(!group.length){ group=[ev]; continue; }
    const last = group[group.length-1];
    if(overlaps(last, ev)){ group.push(ev); }
    else { flush(); group=[ev]; }
  }
  flush();
}

/* ============================================================
   API HELPERS
============================================================ */

async function apiJson(url, options = {}) {
  const r = await fetch(url, {
    credentials: "include",
    ...options
  });

  const text = await r.text();
  let json = null;

  if (text) {
    try { json = JSON.parse(text); } catch {}
  }

  if (!r.ok) {
    throw new Error((json && (json.error || json.message)) || text || "Request failed");
  }

  return json;
}

/* ============================================================
   EVENTS API
============================================================ */

async function loadEvents(){
  const data = await apiJson(API_EVENTS_URL, { method:"GET" });
  const arr = Array.isArray(data) ? data : [];

  events = arr.map(e => ({
    id: e.id,
    title: e.title ?? "",
    start: e.start,
    end: e.end,
    info: e.info ?? "",
    requires_signup: !!e.requires_signup,
    mandatory: !!e.mandatory,
    paid: !!e.paid,
    price: Number(e.price ?? 0),
    qr_text: e.qr_text ?? null
  }));
}

/* ============================================================
   GRID RENDERING
============================================================ */

function renderGrid() {
  gridEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "gridHeader";

  for (let i = 0; i < 7; i++) {
    const d = addDays(currentWeekStart, i);
    const div = document.createElement("div");
    div.className = "dayHeader";
    div.textContent = formatDayLabel(d);
    header.appendChild(div);
  }

  gridEl.appendChild(header);

  const body = document.createElement("div");
  body.className = "gridBody";

  for (let m = startMin; m < endMin; m += slotMinutes) {
    const row = document.createElement("div");
    row.className = "timeRow";

    const label = document.createElement("div");
    label.className = "timeLabel";

    if (m % 60 === 0) {
      label.textContent = `${pad2(m/60)}:00`;
    }

    row.appendChild(label);

    for (let d = 0; d < 7; d++) {
      const cell = document.createElement("div");
      cell.className = "timeCell";
      row.appendChild(cell);
    }

    body.appendChild(row);
  }

  gridEl.appendChild(body);
}

/* ============================================================
   EVENTS RENDERING
============================================================ */

function renderEvents() {
  const body = gridEl.querySelector(".gridBody");
  if (!body) return;

  // verwijder oude event‑elementen
  body.querySelectorAll(".eventItem").forEach(el => el.remove());

  const dayBuckets = [[],[],[],[],[],[],[]];

  for (const ev of events) {
    const startD = new Date(ev.start);
    const endD   = new Date(ev.end);

    const dayIdx = dayIndexFromWeekStart(startD, currentWeekStart);
    if (dayIdx < 0 || dayIdx > 6) continue;

    const startM = startD.getHours()*60 + startD.getMinutes();
    const endM   = endD.getHours()*60   + endD.getMinutes();

    const totalSlots = (endMin - startMin) / slotMinutes;
    const topPct    = ((startM - startMin) / (endMin - startMin)) * 100;
    const heightPct = ((endM   - startMin) / (endMin - startMin)) * 100 - topPct;

    const evEl = document.createElement("div");
    evEl.className = "eventItem";
    evEl.style.top    = `${topPct}%`;
    evEl.style.height = `${heightPct}%`;
    evEl.dataset.id   = ev.id;

    const title = document.createElement("div");
    title.className = "eventTitle";
    title.textContent = ev.title || "(zonder titel)";

    const time = document.createElement("div");
    time.className = "eventTime";
    time.textContent =
      `${pad2(startD.getHours())}:${pad2(startD.getMinutes())} - ` +
      `${pad2(endD.getHours())}:${pad2(endD.getMinutes())}`;

    evEl.appendChild(title);
    evEl.appendChild(time);

    evEl.addEventListener("click", () => {
      if (IS_ADMIN) {
        openAdminDialog(ev);
      } else {
        openMemberDialog(ev);
      }
    });

    // plaats in juiste dag‑kolom
    const rows = body.querySelectorAll(".timeRow");
    const firstRow = rows[0];
    if (!firstRow) continue;

    const dayCell = firstRow.children[1 + dayIdx]; // [0]=timeLabel
    if (!dayCell) continue;

    // we positioneren relatief t.o.v. de hele body
    body.appendChild(evEl);

    dayBuckets[dayIdx].push({
      startM,
      endM,
      el: evEl
    });
  }

  // overlappende events layouten
  for (let d = 0; d < 7; d++) {
    layoutOverlaps(dayBuckets[d]);
  }
}

/* ============================================================
   WEEK RENDERING
============================================================ */

function renderWeek() {
  labelEl.textContent = formatWeekLabel(currentWeekStart);
  renderGrid();
  renderEvents();
  scrollToDefaultTime();
}

function scrollToDefaultTime() {
  const body = gridEl.querySelector(".gridBody");
  if (!body) return;

  const totalMinutes = endMin - startMin;
  const offsetMinutes = defaultScrollToMin - startMin;
  const ratio = offsetMinutes / totalMinutes;

  body.scrollTop = body.scrollHeight * ratio;
}

/* ============================================================
   NAVIGATION
============================================================ */

document.getElementById("btnPrevWeek")?.addEventListener("click", () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  renderWeek();
});

document.getElementById("btnNextWeek")?.addEventListener("click", () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  renderWeek();
});

document.getElementById("btnToday")?.addEventListener("click", () => {
  currentWeekStart = startOfWeekMonday(new Date());
  renderWeek();
});

/* ============================================================
   INIT
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadEvents();
  } catch (e) {
    console.error("Events laden mislukt:", e);
  }
  renderWeek();

  btnCloseTop?.addEventListener("click", () => {
    eventDialog.close();
  });
});

/* ============================================================
   MEMBER DIALOG
============================================================ */

async function openMemberDialog(eventData) {

  signupDownloaded = false;

  const statusJson = await getSignupStatus(eventData.id, USER_EMAIL);
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
    lastSignup = { event_id: e.id, email: USER_EMAIL, status };
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
      signupText.textContent = "Scan de code met uw bankapp.";
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

    signupText.textContent = "Ik schrijf mij in.";
    hideQR();
    btn.style.display = "none";
    lastSignup = null;
  };

  btn.onclick = () => {
    if (!lastSignup) return;
    signupDownloaded = true;
    signupText.textContent = "✔️ U bent ingeschreven";
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

  btnSave.style.display = "inline-block";
  btnDelete.style.display = e.id ? "inline-block" : "none";

  btnSave.onclick = () => handleSaveEvent();
  btnDelete.onclick = () => handleDeleteEvent();

  eventDialog.showModal();
}

function renderAdminLeft(e) {
  return `
    <h3>Event bewerken</h3>

    <label>Titel<br>
      <input id="fTitle" type="text" value="${escapeHtml(e.title)}">
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
      <textarea id="fInfo" rows="5">${escapeHtml(e.info)}</textarea>
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
        <strong>${escapeHtml(s.name)}</strong><br>
        ${escapeHtml(s.email)}<br>
        Status: ${escapeHtml(s.status)}
      </li>
    `;
  }

  html += `</ul>`;
  return html;
}

/* ============================================================
   ADMIN SAVE / DELETE
============================================================ */

async function handleSaveEvent() {

  if (!IS_ADMIN) return;
  if (!editingEvent) return;

  const fTitle = dialogBody.querySelector("#fTitle");
  const fStart = dialogBody.querySelector("#fStart");
  const fEnd   = dialogBody.querySelector("#fEnd");
  const fInfo  = dialogBody.querySelector("#fInfo");
  const fSignup    = dialogBody.querySelector("#fSignup");
  const fMandatory = dialogBody.querySelector("#fMandatory");
  const fPaid      = dialogBody.querySelector("#fPaid");
  const fPrice     = dialogBody.querySelector("#fPrice");

  const dateKey = toDateOnlyKey(editingEvent.startD);

  const [sh, sm] = (fStart.value || "00:00").split(":").map(Number);
  const [eh, em] = (fEnd.value || "00:00").split(":").map(Number);

  const s = new Date(`${dateKey}T${pad2(sh)}:${pad2(sm)}:00`);
  const e = new Date(`${dateKey}T${pad2(eh)}:${pad2(em)}:00`);

  if (e <= s) e.setTime(s.getTime() + slotMinutes * 60 * 1000);

  const payload = {
    title: fTitle.value.trim(),
    start: toLocalISO(s),
    end: toLocalISO(e),
    info: fInfo.value.trim(),
    requires_signup: fSignup.checked,
    mandatory: fMandatory.checked,
    paid: fPaid.checked,
    price: Number(fPrice.value || 0)
  };

  try {
    if (editingEvent.id) {
      await updateEventOnServer(editingEvent.id, payload);
    } else {
      const newId = await createEventOnServer(payload);
      editingEvent.id = newId;
    }

    await loadEvents();
    renderWeek();
    eventDialog.close();

  } catch (err) {
    alert("Opslaan mislukt: " + err.message);
  }
}

async function handleDeleteEvent() {
  if (!IS_ADMIN) return;
  if (!editingEvent || !editingEvent.id) return;

  if (!confirm("Event verwijderen?")) return;

  try {
    await deleteEventOnServer(editingEvent.id);
    await loadEvents();
    renderWeek();
    eventDialog.close();
  } catch (err) {
    alert("Verwijderen mislukt: " + err.message);
  }
}
