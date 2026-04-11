function showModal(type, title, message, onConfirm) {
    const modal = document.getElementById("app-modal");
    const t = document.getElementById("modal-title");
    const m = document.getElementById("modal-message");
    const btnBox = document.getElementById("modal-buttons");

    t.textContent = title || "";
    m.textContent = message || "";

    // Reset knoppen
    btnBox.innerHTML = "";

    if (type === "success" || type === "error") {
        const ok = document.createElement("button");
        ok.className = "wtc-button";
        ok.textContent = "OK";
        ok.onclick = closeModal;
        btnBox.appendChild(ok);
    }

    if (type === "confirm") {
        const yes = document.createElement("button");
        yes.className = "wtc-button";
        yes.textContent = "Ja";
        yes.onclick = () => {
            closeModal();
            if (typeof onConfirm === "function") onConfirm(true);
        };

        const no = document.createElement("button");
        no.className = "wtc-button";
        no.textContent = "Nee";
        no.onclick = () => {
            closeModal();
            if (typeof onConfirm === "function") onConfirm(false);
        };

        btnBox.appendChild(yes);
        btnBox.appendChild(no);
    }

    modal.classList.remove("hidden");
}

function closeModal() {
    document.getElementById("app-modal").classList.add("hidden");
}

