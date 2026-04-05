let CURRENT_USER = null;
let events = [];
let currentWeekStart = startOfWeekMonday(new Date());
let editingEvent = null;
let signupDownloaded = false;

const slotMinutes = 30;
const startMin = 8 * 60;
const endMin = 20 * 60;
const defaultScrollToMin = 8 * 60;
const dayNames = ["ma", "di", "woe", "do", "vr", "za", "zo"];

const API_EVENTS_URL = "/api/events";

const gridEl = document.getElementById("grid");
const labelEl = document.getElementById("weekLabel");
const eventDialog = document.getElementById("eventDialog");
const dialogBody = document.getElementById("eventDialogBody");
const memberActions = document.getElementById("memberActions");
const btnSave = document.getElementById("btnSave");
const btnDelete = document.getElementById("btnDelete");
const btnCloseTop = document.getElementById("btnCloseTop");

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    ...options
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    return { ok: false, error: json?.error || json?.message || `HTTP ${res.status}`, status: res.status };
  }

  return json ?? {};
}

async function loadCurrentUser() {
  const data = await apiJson("/api/me");
  console.log("API /api/me response:", data);

  if (!data?.ok) {
    throw new Error(data?.error || "Niet ingelogd");
  }

  const user = data.user || {};

  CURRENT_USER = {
    id: user.id ?? null,
    email: user.email ?? null,
    isAdmin:
      data.is_admin === true ||
      user.is_admin === true ||
      user.isAdmin === true ||
      user.role === "admin",
    name: user.naam ?? user.name ?? ""
  };

  console.log("CURRENT_USER mapped:", CURRENT_USER);

  return CURRENT_USER;
}

function getUser() {
  return CURRENT_USER;
}

function isAdminUser() {
  return !!CURRENT_USER?.isAdmin;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function toDateOnlyKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDayLabel(d) {
  return `${dayNames[(d.getDay() + 6) % 7]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function formatWeekLabel(weekStart) {
  const we = addDays(weekStart, 6);
  return `${toDateOnlyKey(weekStart)} – ${toDateOnlyKey(we)}`;
}

function toLocalISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

function makeCell(text, cls, role) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  d.setAttribute("role", role);
  return d;
}

function scrollToDefault() {
  const sc = document.getElementById("gridScroll");
  if (!sc) return;
  const offsetSlots = (defaultScrollToMin - startMin) / slotMinutes;
  sc.scrollTop = Math.max(0, offsetSlots * 28);
}

function updateHeader() {
  const name = getUser()?.name || "";
  const naamEl = document.getElementById("naam");
  const headerUserName = document.getElementById("headerUserName");
  if (naamEl) naamEl.textContent = name;
  
}

async function loadEvents() {
  const data = await apiJson(API_EVENTS_URL, { method: "GET" });
  const arr = Array.isArray(data) ? data : [];
  events = arr.map((e) => ({
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

async function createEventOnServer(payload) {
  return await apiJson("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function updateEventOnServer(id, payload) {
  return await apiJson(`/api/events/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function deleteEventOnServer(id) {
  return await apiJson(`/api/events/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

async function loadSignupsForEvent(eventId) {
  const r = await apiJson(`/api/signups?event_id=${encodeURIComponent(eventId)}`);
  if (!r || r.error) return [];
  return Array.isArray(r) ? r : (r.signups || []);
}

async function getSignupStatus(eventId) {
  return await apiJson(`/api/signups/status?event_id=${encodeURIComponent(eventId)}`);
}

async function doSignup(eventId) {
  return await apiJson("/api/signups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId })
  });
}

async function doCancel(eventId) {
  return await apiJson("/api/signups", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId })
  });
}

function downloadConfirmation(event, signup) {
  const start = new Date(event.start);
  const dateStr = start.toLocaleDateString("nl-BE");
  const timeStr = start.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  const prijs = Number(event.price || 0).toFixed(2).replace(".", ",");
  const naam = signup?.name || getUser()?.name || "lid";
  const betaald = signup?.paid ? "ja" : "onder voorbehoud";

  const text =
    `Beste ${naam}\n\n` +
    `Bevestiging van uw inschrijving voor:\n\n` +
    `Event  : ${event.title}\n` +
    `Datum  : ${dateStr}\n` +
    `om     : ${timeStr}\n` +
    `Prijs  : ${prijs} €\n` +
    `Betaald: ${betaald}\n`;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inschrijving.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateQR(e) {
  const qrDiv = document.getElementById("qrCode");
  if (!qrDiv) return;
  qrDiv.innerHTML = "";
  if (!e.qr_text || typeof QRCode === "undefined") return;

  new QRCode(qrDiv, {
    text: e.qr_text,
    width: 180,
    height: 180
  });
}

async function openEventDialog(ev) {
  if (isAdminUser()) {
    await openAdminDialog(ev);
  } else {
    await openMemberDialog(ev);
  }
}
window.openEventDialog = openEventDialog;

function renderAdminLeft(e) {
    return `
        <label>Titel<br>
            <input id="fTitle" type="text" value="${escapeHtml(e.title)}">
        </label>
	
        <div class="row">
            <label>
                Van<br>
                <input id="fStart" type="time" value="${pad2(e.startD.getHours())}:${pad2(e.startD.getMinutes())}">
            </label>
            <label>
                Tot<br>
                <input id="fEnd" type="time" value="${pad2(e.endD.getHours())}:${pad2(e.endD.getMinutes())}">
            </label>
        </div>

        <label>
            Info<br>
            <textarea id="fInfo" rows="5">${escapeHtml(e.info)}</textarea>
        </label>

        	<hr style="background:blue; height: 2px;">

        <div class="row" style="align-items:center; gap:12px;">
            <label class="chk" style="margin:0;">
                <input type="checkbox" id="fSignup" ${e.requires_signup ? "checked" : ""}>
                Inschrijving vereist
            </label>

            <label class="chk" style="margin:0;">
                <input type="checkbox" id="fMandatory" ${e.mandatory ? "checked" : ""}>
                Verplicht
            </label>

            <label class="chk" style="margin:0;">
                <input type="checkbox" id="fPaid" ${e.paid ? "checked" : ""}>
                Betalend
            </label>

            <span id="priceWrap" style="${e.paid ? "" : "display:none"}; display:flex; align-items:center; gap:4px;">
                <input id="fPrice" type="number" min="0" step="1" 
                       value="${Number(e.price || 0)}" 
                       style="width:70px;">
                €
            </span>
        </div>

        	<hr style="background:blue; height: 2px;">
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

async function openAdminDialog(eventData) {
  const startD = eventData.startD ? new Date(eventData.startD) : new Date(eventData.start);
  const endD = eventData.endD ? new Date(eventData.endD) : new Date(eventData.end);
  const signups = eventData.id ? await loadSignupsForEvent(eventData.id) : [];
  const e = { ...eventData, startD, endD, signups };
	const dialog = document.getElementById("eventDialog");
	const dialogContent = dialog.querySelector(".dialog-content");
	const form = dialog.querySelector("form");
	
	dialogContent.classList.add("admin-mode");

	dialog.classList.add("admin-mode");
	form.classList.add("admin-mode");
	
  dialogBody.innerHTML = renderAdminLeft(e);
  memberActions.innerHTML = renderAdminRight(e);

  editingEvent = e;

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

function normalizeDialogEvent(eventData) {
  return {
    ...eventData,
    startD: eventData?.startD ?? new Date(eventData.start),
    endD: eventData?.endD ?? new Date(eventData.end)
  };
}

async function openMemberDialog(eventData) {
  btnSave?.classList.add("hidden");
  btnDelete?.classList.add("hidden");

  const dialog = document.getElementById("eventDialog");
  const form = document.getElementById("eventForm");
  const dialogContent = dialog?.querySelector(".dialog-content");
  const memberLeft = document.getElementById("eventDialogBody");
  const memberActions = document.getElementById("memberActions");
  const adminActions = document.getElementById("adminActions");

  if (!dialog || !dialogContent || !memberLeft || !memberActions) return;

  if (form && !form.dataset.memberSubmitBound) {
    form.addEventListener("submit", e => e.preventDefault());
    form.dataset.memberSubmitBound = "1";
  }

  signupDownloaded = false;

  dialog.classList.remove("admin-mode");
  dialogContent.classList.remove("admin-mode");
  form?.classList.remove("admin-mode");
  if (adminActions) adminActions.style.display = "none";

  memberActions.innerHTML = "";
  memberActions.style.display = "";

  let statusJson = null;
  try {
    statusJson = await getSignupStatus(
      eventData.id,
      typeof memberEmail !== "undefined" ? memberEmail : CURRENT_USER?.email
    );
  } catch (err) {
    console.error("getSignupStatus failed", err);
  }

  let status = null;
  if (statusJson?.signed_up) {
    status = (statusJson.status || "").toLowerCase().trim();
    if (status !== "pending" && status !== "confirmed") {
      status = "pending";
    }
  }

  memberLeft.innerHTML = renderMemberLeft(eventData);
  memberActions.innerHTML = renderMemberRight(eventData, status);

  attachMemberEvents(eventData, status);

  dialog.showModal();
}

async function doSignup(eventId) {
  return await apiJson("./api_signups.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "signup",
      event_id: eventId
    })
  });
}

async function doCancel(eventId) {
  return await apiJson("./api_signups.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "cancel",
      event_id: eventId
    })
  });
}

async function doCommit(eventId) {
  return await apiJson("./api_signups.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "commit",
      event_id: eventId
    })
  });
}

function generateQR(e) {
  const qrDiv = document.getElementById("qrCode");
  if (!qrDiv) return;

  qrDiv.innerHTML = "";

  new QRCode(qrDiv, {
    text: e.qr_text,
    width: 180,
    height: 180
  });
}

function renderMemberRight(eventData, status) {
  const checked = status === "pending" || status === "confirmed" ? "checked" : "";
  const disabled = status === "pending" || status === "confirmed" ? "disabled" : "";

  return `
    <div class="member-right">
      <label class="signup-row">
        <input id="mDoSignup" type="checkbox" ${checked} ${disabled}>
        <span class="signupText">Ik schrijf mij in.</span>
      </label>

      <div id="qrText" style="display:none;">
        Om te betalen, scan de code met Uw bankapp.
      </div>

      <div id="qrWrap" style="display:none;">
        <div id="qrCode"></div>
      </div>

      <button id="btnDownload" type="button" class="wtc-button" style="display:none;">
        Download bevestiging
      </button>
    </div>
  `;
}

function renderMemberLeft(eventData) {
  const startD = eventData?.startD ?? new Date(eventData.start);
  const endD = eventData?.endD ?? new Date(eventData.end);

  const datum = !isNaN(startD) ? startD.toLocaleDateString("nl-BE") : "";
  const startTijd = !isNaN(startD)
    ? startD.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })
    : "";
  const eindTijd = !isNaN(endD)
    ? endD.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })
    : "";

  return `
    <div class="member-left">
      <h3>${escapeHtml(eventData.title || "")}</h3>

      ${datum ? `
        <p>
          <strong>Datum:</strong>
          ${datum}
        </p>
      ` : ""}

      ${(startTijd || eindTijd) ? `
        <p>
          <strong>Tijd:</strong>
          ${startTijd}${startTijd && eindTijd ? " – " : ""}${eindTijd}
        </p>
      ` : ""}

      ${eventData.location ? `
        <p>
          <strong>Locatie:</strong>
          ${escapeHtml(eventData.location)}
        </p>
      ` : ""}

      ${eventData.organizer ? `
        <p>
          <strong>Organisator:</strong>
          ${escapeHtml(eventData.organizer)}
        </p>
      ` : ""}

      ${eventData.price ? `
        <p>
          <strong>Prijs:</strong>
          ${escapeHtml(String(eventData.price))}
        </p>
      ` : ""}

      ${eventData.capacity ? `
        <p>
          <strong>Aantal plaatsen:</strong>
          ${escapeHtml(String(eventData.capacity))}
        </p>
      ` : ""}

      ${eventData.info ? `
        <div class="event-info">${escapeHtml(eventData.info)}</div>
      ` : ""}
    </div>
  `;
}

function attachMemberEvents(e, status) {
  const chk = document.getElementById("mDoSignup");
  const qrWrap = document.getElementById("qrWrap");
  const qrText = document.getElementById("qrText");
  const btn = document.getElementById("btnDownload");
  const signupText = document.querySelector(".signupText");

  let lastSignup = null;

  signupDownloaded = false;
  if (signupText) signupText.textContent = "Ik schrijf mij in.";

  if (!chk) {
    console.warn("Geen checkbox gevonden → event vereist geen inschrijving.");
    return;
  }

  function showQR() {
    if (qrWrap) qrWrap.style.display = "block";
    if (qrText) qrText.style.display = "block";
    generateQR(e);
  }

  function hideQR() {
    if (qrWrap) qrWrap.style.display = "none";
    if (qrText) qrText.style.display = "none";
  }

  if (status === "pending" || status === "confirmed") {
    chk.checked = true;
    chk.disabled = true;

    showQR();
    if (btn) btn.style.display = "block";

    lastSignup = {
      event_id: e.id,
      email: typeof memberEmail !== "undefined" ? memberEmail : CURRENT_USER?.email,
      status: status
    };

    if (signupText) {
      signupText.textContent =
        status === "confirmed"
          ? "U bent ingeschreven."
          : "Uw inschrijving is in behandeling.";
    }

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
        signupText.textContent = "Om te betalen, scan de code met Uw bankapp.";
      }

      showQR();
      if (btn) btn.style.display = "block";
      return;
    }

    const r = await doCancel(e.id);

    if (!r || !r.ok) {
      alert("Annuleren mislukt");
      chk.checked = true;
      return;
    }

    if (signupText) signupText.textContent = "Ik schrijf mij in.";
    hideQR();
    if (btn) btn.style.display = "none";
    lastSignup = null;
  };

  if (btn) {
    btn.onclick = () => {
      if (!lastSignup) {
        console.warn("Geen signup info beschikbaar voor download.");
        return;
      }

      signupDownloaded = true;
      if (signupText) signupText.textContent = "✔️ U bent ingeschreven";

      downloadConfirmation(e, lastSignup);
    };
  }
}

function render() {
  labelEl.textContent = formatWeekLabel(currentWeekStart);
  gridEl.innerHTML = "";

  const todayKey = toDateOnlyKey(new Date());
  gridEl.appendChild(makeCell("", "cell head", "columnheader"));

  for (let c = 0; c < 7; c++) {
    const d = addDays(currentWeekStart, c);
    gridEl.appendChild(
      makeCell(
        formatDayLabel(d),
        "cell head" + (toDateOnlyKey(d) === todayKey ? " today" : ""),
        "columnheader"
      )
    );
  }

  const totalSlots = (endMin - startMin) / slotMinutes;
  for (let i = 0; i < totalSlots; i++) {
    const tMin = startMin + i * slotMinutes;
    const h = Math.floor(tMin / 60);
    const m = tMin % 60;

    gridEl.appendChild(makeCell(m === 0 ? `${pad2(h)}:00` : "", "cell hour", "rowheader"));

    for (let c = 0; c < 7; c++) {
      const d = addDays(currentWeekStart, c);
      const dateKey = toDateOnlyKey(d);
      const startIso = `${dateKey}T${pad2(h)}:${pad2(m)}`;
      const endMin2 = tMin + slotMinutes;
      const eh = Math.floor(endMin2 / 60);
      const em = endMin2 % 60;

      const cell = makeCell("", "cell body", "gridcell");
      cell.dataset.slotStart = startIso;
      cell.dataset.slotEnd = `${dateKey}T${pad2(eh)}:${pad2(em)}`;
      gridEl.appendChild(cell);
    }
  }

  const eventLayer = document.createElement("div");
  eventLayer.className = "eventLayer";
  gridEl.appendChild(eventLayer);
if (isAdminUser()) {
  gridEl.addEventListener("contextmenu", (ev) => {
    if (ev.ctrlKey) return;

    const eventEl = ev.target.closest(".event");
    const cellEl = ev.target.closest("[data-slot-start][data-slot-end]");

    // browsermenu blokkeren voor admin in kalender
    ev.preventDefault();
    ev.stopPropagation();

    let startIso = null;
    let endIso = null;

    if (cellEl) {
      startIso = cellEl.dataset.slotStart;
      endIso = cellEl.dataset.slotEnd;
    } else if (eventEl) {
      // als je event-element data meegeeft, kan je ook boven event nieuw event maken
      startIso = eventEl.dataset.slotStart || null;
      endIso = eventEl.dataset.slotEnd || null;
    }

    // fallback: zoek onderliggende cel
    if (!startIso || !endIso) {
      const prevGridPointer = gridEl.style.pointerEvents;
      const prevLayerPointer = eventLayer.style.pointerEvents;

      gridEl.style.pointerEvents = "auto";
      eventLayer.style.pointerEvents = "none";
      eventLayer.querySelectorAll(".event").forEach((x) => (x.style.pointerEvents = "none"));

      const under = document.elementFromPoint(ev.clientX, ev.clientY);

      eventLayer.style.pointerEvents = prevLayerPointer;
      gridEl.style.pointerEvents = prevGridPointer;
      eventLayer.querySelectorAll(".event").forEach((x) => (x.style.pointerEvents = ""));

      const cell = under?.closest?.("[data-slot-start][data-slot-end]");
      if (!cell) return;

      startIso = cell.dataset.slotStart;
      endIso = cell.dataset.slotEnd;
    }

    openAdminDialog(
      {
        id: null,
        title: "",
        start: startIso,
        end: endIso,
        info: "",
        requires_signup: false,
        mandatory: false,
        paid: false,
        price: 0,
        startD: new Date(startIso),
        endD: new Date(endIso)
      },
      { isNew: true }
    );
  });
}

  renderEvents(eventLayer);
  scrollToDefault();
}

function renderEvents(eventLayer) {
  if (!eventLayer) return;
  eventLayer.innerHTML = "";

  const start = currentWeekStart;
  const end = addDays(start, 7);
  const byDay = new Map();

  const weekEvents = events.filter((ev) => {
    const startD = new Date(ev.start);
    const endD = new Date(ev.end);
    return startD < end && endD > start;
  });

  for (const ev of weekEvents) {
    const startD = new Date(ev.start);
    const endD = new Date(ev.end);

    const dayIndex = (startD.getDay() + 6) % 7;
    const startMinEv = startD.getHours() * 60 + startD.getMinutes();
    const endMinEv = endD.getHours() * 60 + endD.getMinutes();

    const rowStart = Math.floor((startMinEv - startMin) / slotMinutes) + 2;
    const rowEnd = Math.ceil((endMinEv - startMin) / slotMinutes) + 2;
    const col = dayIndex + 2;

    const div = document.createElement("div");
    div.className = "event";
    div.style.gridColumn = col;
    div.style.gridRow = `${rowStart} / ${rowEnd}`;
    div.innerHTML = `
      <div class="title">${escapeHtml(ev.title || "")}</div>
      <div class="time">${pad2(startD.getHours())}:${pad2(startD.getMinutes())}–${pad2(endD.getHours())}:${pad2(endD.getMinutes())}</div>
    `;
    div.onclick = (evt) => {
      evt.stopPropagation();
      openEventDialog(ev);
    };

    eventLayer.appendChild(div);

    if (!byDay.has(dayIndex)) byDay.set(dayIndex, []);
    byDay.get(dayIndex).push({
      startM: startMinEv,
      endM: endMinEv,
      el: div
    });
  }

  for (const dayEvents of byDay.values()) {
    layoutOverlaps(dayEvents);
  }
}

async function handleSaveEvent() {
  if (!isAdminUser() || !editingEvent) return;

  const fTitle = document.getElementById("fTitle");
  const fStart = document.getElementById("fStart");
  const fEnd = document.getElementById("fEnd");
  const fInfo = document.getElementById("fInfo");
  const fSignup = document.getElementById("fSignup");
  const fMandatory = document.getElementById("fMandatory");
  const fPaid = document.getElementById("fPaid");
  const fPrice = document.getElementById("fPrice");

  const dateBase = editingEvent.startD ? new Date(editingEvent.startD) : new Date(editingEvent.start);
  const dateKey = toDateOnlyKey(dateBase);

  const [sh, sm] = String(fStart?.value || "00:00").split(":").map(Number);
  const [eh, em] = String(fEnd?.value || "00:00").split(":").map(Number);

  const s = new Date(`${dateKey}T00:00:00`);
  s.setHours(sh || 0, sm || 0, 0, 0);
  const e = new Date(`${dateKey}T00:00:00`);
  e.setHours(eh || 0, em || 0, 0, 0);

  if (e <= s) {
    e.setTime(s.getTime() + slotMinutes * 60 * 1000);
  }

  const payload = {
    title: String(fTitle?.value || "").trim(),
    start: toLocalISO(s),
    end: toLocalISO(e),
    info: String(fInfo?.value || "").trim(),
    requires_signup: !!fSignup?.checked,
    mandatory: !!fMandatory?.checked,
    paid: !!fPaid?.checked,
    price: Number(fPrice?.value || 0)
  };

  if (!payload.title) {
    alert("Geef een titel op");
    return;
  }

  let result;
  if (editingEvent.id) {
    result = await updateEventOnServer(editingEvent.id, payload);
    if (!result?.ok) {
      alert(result?.error || "Opslaan mislukt");
      return;
    }
  } else {
    result = await createEventOnServer(payload);
    if (!result?.id) {
      alert(result?.error || "Aanmaken mislukt");
      return;
    }
  }

  await loadEvents();
  render();
  eventDialog.close();
}

async function handleDeleteEvent() {
  if (!isAdminUser() || !editingEvent?.id) return;
  if (!confirm("Verwijderen?")) return;

  const result = await deleteEventOnServer(editingEvent.id);
  if (!result?.ok) {
    alert(result?.error || "Verwijderen mislukt");
    return;
  }

  await loadEvents();
  render();
  eventDialog.close();
}

function bindToolbar() {
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnToday = document.getElementById("btnToday");

  if (btnPrev) {
    btnPrev.onclick = async () => {
      currentWeekStart = addDays(currentWeekStart, -7);
      render();
    };
  }

  if (btnNext) {
    btnNext.onclick = async () => {
      currentWeekStart = addDays(currentWeekStart, 7);
      render();
    };
  }

  if (btnToday) {
    btnToday.onclick = async () => {
      currentWeekStart = startOfWeekMonday(new Date());
      render();
    };
  }
}

if (btnCloseTop) {
  btnCloseTop.onclick = () => eventDialog.close();
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadCurrentUser();
    updateHeader();
    bindToolbar();
    await loadEvents();
    render();
  } catch (err) {
    console.error("Init mislukt:", err);
    window.location.href = "/leden.html?msg=notknown";
  }
});
