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

async function createEventOnServer(payload){
  const json = await apiJson(API_EVENTS_URL, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  return json.id;
}

async function updateEventOnServer(id, payload){
  await apiJson(API_EVENTS_URL, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ action:"update", id, ...payload })
  });
}

async function deleteEventOnServer(id){
  await apiJson(API_EVENTS_URL, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ action:"delete", id })
  });
}

/* ============================================================
   SIGNUPS API
============================================================ */

async function getSignupStatus(eventId, email) {
  return await apiJson(`${API_SIGNUPS_URL}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId, email })
  });
}

async function doSignup(eventId) {
  return await apiJson(`${API_SIGNUPS_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId })
  });
}

async function doCancel(eventId) {
  return await apiJson(`${API_SIGNUPS_URL}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId })
  });
}

async function loadSignupsForEvent(eventId) {
  return await apiJson(`${API_SIGNUPS_URL}/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId })
  }).then(r => r.signups || []);
}

/* ============================================================
   DIALOG RENDERING
============================================================ */

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

/* ============================================================
   MEMBER DIALOG LOGIC
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
  memberActions.innerHTML = "";

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

async function handleSaveEvent(){

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

  if (e <= s) e.setTime(s.getTime() + slotMinutes*60*1000);

  const payload = {
    title: fTitle.value.trim(),
    start: toLocalISO(s),
    end: toLocalISO(e),
    info: fInfo.value.trim(),
    requires_signup: fSignup.checked,
    mandatory: fMandatory.checked,
    paid: fPaid.checked,
    price: Number(fPrice.value || 0)

