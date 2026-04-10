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
    renderTable(data.signups);
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
		
			<td>${su.Leden?.name || ""}</td>
			<td>${su.Leden?.email || ""}</td>

            <td>${su.paid ? "Ja" : "Nee"}</td>
            <td>${su.method || ""}</td>
            <td>${su.reference || ""}</td>
            <td>${new Date(su.created_at).toLocaleString()}</td>
            <td>
                <button class="update" data-id="${su.id}">update</button>
                <button class="delete" data-id="${su.id}">delete</button>
            </td>
        `;

        tableBody.appendChild(tr);
    });
}


// UPDATE
document.addEventListener("click", async e => {
    if (e.target.classList.contains("updateBtn")) {
        const name = e.target.dataset.name;
        const ok = await showConfirm(`Inschrijving van '${name}' bijwerken ❓`);
        if (!ok) return;

        const tr = e.target.closest("tr");
        const signupId = e.target.dataset.id;

        const payload = {
            action: "update",
            event_id: currentEvent,
            signup_id: signupId,
            paid: tr.querySelector('[data-field="paid"]').value,
            payment_method: tr.querySelector('[data-field="payment_method"]').value,
            payment_reference: tr.querySelector('[data-field="payment_reference"]').value
        };

        await fetch("/api/signups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        showAlert("success", "Inschrijving bijgewerkt ✔️");
    }

    // DELETE
    if (e.target.classList.contains("deleteBtn")) {
        const name = e.target.dataset.name;
        const ok = await showConfirm(`${name} verwijderen? ❓`);
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

        showAlert("success", "Inschrijving verwijderd ✔️");
        loadPage();
    }
});

// CLEANUP
cleanupBtn.onclick = async () => {
    const ok = await showConfirm("Oude events opruimen ❓");
    if (!ok) return;

    await fetch("/api/signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup" })
    });

    showAlert("success", "Opruiming voltooid ✔️");
    loadPage();
};

// EXPORT
exportBtn.onclick = () => {
    window.location = `/api/signups/export?event_id=${currentEvent}`;
    setTimeout(() => showAlert("success", "Bestand is aangemaakt ✔️"), 500);
};

loadPage();
