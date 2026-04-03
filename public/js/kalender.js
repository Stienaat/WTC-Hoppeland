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
  if (!data?.ok) {
    throw new Error(data?.error || "Niet ingelogd");
  }

  CURRENT_USER = {
    id: data.user?.id ?? null,
    email: data.user?.email ?? null,
    isAdmin: !!data.is_admin,
    name: data.user?.naam ?? ""
  };

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
  if (headerUserName) headerUserName.textContent = `Welkom beste, ${name}`;
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

function openEventDialog(ev) {
  if (isAdminUser()) {
    openAdminDialog(ev);
  } else {
    openMemberDialog(ev);
  }
}
window.openEventDialog = openEventDialog;

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

async function openAdminDialog(eventData) {
  const startD = eventData.startD ? new Date(eventData.startD) : new Date(eventData.start);
  const endD = eventData.endD ? new Date(eventData.endD) : new Date(eventData.end);
  const signups = eventData.id ? await loadSignupsForEvent(eventData.id) : [];
  const e = { ...eventData, startD, endD, signups };

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

async function openMemberDialog(eventData) {
  signupDownloaded = false;

  if (btnSave) btnSave.style.display = "none";
  if (btnDelete) btnDelete.style.display = "none";

  const statusJson = await getSignupStatus(eventData.id);
  let status = null;

  if (statusJson?.signed_up) {
    status = (statusJson.status || "").toLowerCase().trim();
    if (status !== "pending" && status !== "confirmed") {
      status = "pending";
    }
  }

  const startD = new Date(eventData.start);
  const endD = new Date(eventData.end);
  const e = { ...eventData, startD, endD };

  dialogBody.innerHTML = renderMemberLeft(e);
  memberActions.innerHTML = renderMemberRight(e, status);

  attachMemberEvents(e, status);
  eventDialog.showModal();
}

function attachMemberEvents(e, status) {
  const chk = document.getElementById("mDoSignup");
  const qrWrap = document.getElementById("qrWrap");
  const qrText = document.getElementById("qrText");
  const btn = document.getElementById("btnDownload");
  const signupText = document.querySelector(".signupText");

  let lastSignup = null;
  if (!chk) return;

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
    lastSignup = { event_id: e.id, name: getUser()?.name || "", status, paid: false };
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
      if (signupText) signupText.textContent = "Scan de code met uw bankapp.";
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
      if (!lastSignup) return;
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
    eventLayer.addEventListener("contextmenu", (ev) => {
      if (ev.ctrlKey) return;
      ev.preventDefault();

      const prev = eventLayer.style.pointerEvents;
      eventLayer.style.pointerEvents = "none";
      eventLayer.querySelectorAll(".event").forEach((x) => (x.style.pointerEvents = "none"));

      const el = document.elementFromPoint(ev.clientX, ev.clientY);

      eventLayer.style.pointerEvents = prev;
      eventLayer.querySelectorAll(".event").forEach((x) => (x.style.pointerEvents = ""));

      const cell = el?.closest?.("[data-slot-start][data-slot-end]");
      if (!cell) return;

      const startD = new Date(cell.dataset.slotStart);
      const endD = new Date(cell.dataset.slotEnd);

      openEventDialog({
        id: null,
        title: "",
        start: cell.dataset.slotStart,
        end: cell.dataset.slotEnd,
        info: "",
        requires_signup: false,
        mandatory: false,
        paid: false,
        price: 0,
        startD,
        endD
      });
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

  const weekEvents = events.filter((ev) => {
    const d = new Date(ev.start);
    return d >= start && d < end;
  });

  for (const ev of weekEvents) {
    const startD = new Date(ev.start);
    const endD = new Date(ev.end);
    const dayIndex = (startD.getDay() + 6) % 7;
    const startMinEv = startD.getHours() * 60 + startD.getMinutes();
    const endMinEv = endD.getHours() * 60 + endD.getMinutes();
    const rowStart = Math.floor((startMinEv - startMin) / slotMinutes) + 2;
    const rowEnd = Math.floor((endMinEv - startMin) / slotMinutes) + 2;
    const col = dayIndex + 2;

    const div = document.createElement("div");
    div.className = "event";
    div.style.gridColumn = col;
    div.style.gridRow = `${rowStart} / ${rowEnd}`;
    div.innerHTML = `<div class="title">${escapeHtml(ev.title)}</div>`;
    div.onclick = () => openEventDialog(ev);
    eventLayer.appendChild(div);
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
