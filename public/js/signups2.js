const eventSelect = document.getElementById("adminEventSelect");
const tableBody = document.querySelector("#signupTable tbody");
const exportBtn = document.getElementById("exportBtn");
const cleanupBtn = document.getElementById("cleanupBtn");

let currentEvent = "";

// Load events + signups
async function loadPage() {
    const events = await fetch("/api/events").then(r => r.json());
    const params = new URLSearchParams(window.location.search);
    currentEvent = params.get("event_id") || "";

    // Fill event dropdown
    eventSelect.innerHTML = `<option value="">* kies een event *</option>`;
    events.forEach(ev => {
        const opt = document.createElement("option");
        opt.value = ev.id;
        opt.textContent = ev.title;
        if (ev.id === currentEvent) opt.selected = true;
        eventSelect.appendChild(opt);
    });

    eventSelect.onchange = () => {
        window.location = "?event_id=" + encodeURIComponent(eventSelect.value);
    };

    if (!currentEvent) {
        tableBody.innerHTML = `<tr><td colspan="7" style="color:#666;">Geen inschrijvingen…</td></tr>`;
        exportBtn.disabled = true;
        return;
    }

    exportBtn.disabled = false;

		 const data = await fetch(`/api/signups?event_id=${currentEvent}`).then(r => r.json());

		console.log("SIGNUPS RESPONSE:", data);

		const signups = Array.isArray(data) ? data : (data.signups || []);

		renderTable(signups);
}

function renderTable(signups) {
    tableBody.innerHTML = "";

    if (!signups.length) {
        tableBody.innerHTML = `<tr><td colspan="7" style="color:#666;">Geen inschrijvingen…</td></tr>`;
        return;
    }

    signups.forEach(su => {
        const tr = document.createElement("tr");

tr.innerHTML = `
  <td>${su.name || ""}</td>
  <td>${su.email || ""}</td>

  <td>
    <select data-field="paid">
      <option value="pending" ${su.status === "pending" ? "selected" : ""}>pending</option>
      <option value="true" ${su.status === "paid" || su.paid === true ? "selected" : ""}>ja</option>
      <option value="false" ${su.status === "unpaid" || su.paid === false ? "selected" : ""}>nee</option>
    </select>
  </td>

  <td>
    <input data-field="payment_method" type="text" value="${su.payment_method || su.method || ""}">
  </td>

  <td>
    <input data-field="payment_reference" type="text" value="${su.payment_reference || su.reference || ""}">
  </td>

  <td>${su.created_at ? new Date(su.created_at).toLocaleString() : ""}</td>

  <td>
    <button class="wtc-button updateBtn" data-id="${su.id}" data-name="${su.name || ""}">Update</button>
	<button class="wtc-button wtc-delete deleteBtn" data-id="${su.id}" data-name="${su.name || ""}">Delete</button>
  </td>
`;

        tableBody.appendChild(tr);
    });
}

// UPDATE
document.addEventListener("click", async e => {
    if (e.target.classList.contains("updateBtn")) {
        const name = e.target.dataset.name;
        const ok = await Modal.confirm("Bevestigen", `Inschrijving van '${name}' bijwerken?`);
        if (!ok) return;

        const tr = e.target.closest("tr");
        const signupId = e.target.dataset.id;

		  const payload = {
		  action: "update",
		  event_id: currentEvent,
		  signup_id: signupId,
		  status: tr.querySelector('[data-field="paid"]')?.value,
		  payment_method: tr.querySelector('[data-field="payment_method"]')?.value,
		  payment_reference: tr.querySelector('[data-field="payment_reference"]')?.value
		};

        await fetch("/api/signups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

		await Modal.success("👌", "Inschrijving bijgewerkt ✔️");
        loadPage();
    }

    // DELETE
    if (e.target.classList.contains("deleteBtn")) {
        const name = e.target.dataset.name;
        const ok = await Modal.confirm("Bevestigen", `${name} verwijderen?`)
        if (!ok) return;

        await fetch("/api/signups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "delete",
                event_id: currentEvent,
                signup_id: e.target.dataset.id
            })
        });

       await Modal.success("👌", "Inschrijving verwijderd ✔️");
        loadPage();
    }
});

	// CLEANUP
cleanupBtn.onclick = async () => {
  await loadPage();
  await Modal.success("👌", "Gegevens vernieuwd.");
};

	// EXPORT
	exportBtn.onclick = () => {
		window.location = `/api/signups/export?event_id=${currentEvent}`;
		setTimeout(() => await Modal.success("👌", "Excell bestand is aangemaakt! ✔️"), 500);
	};

loadPage();
