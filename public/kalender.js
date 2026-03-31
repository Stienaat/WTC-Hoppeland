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
