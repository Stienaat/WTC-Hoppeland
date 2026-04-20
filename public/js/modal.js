function showModal(type, icon, title, buttons, content) {
    const modal = document.getElementById("app-modal");
    const t = document.getElementById("modal-title");
    const m = document.getElementById("modal-message");
    const btnBox = document.getElementById("modal-buttons");

    t.textContent = `${icon ? icon + ' ' : ''}${title || ''}`;

    // inhoud resetten
    m.innerHTML = "";

    if (typeof content === "string") {
        m.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        m.appendChild(content);
    } else {
        m.textContent = "";
    }

    // knoppen resetten
    btnBox.innerHTML = "";

    // classes resetten
    modal.classList.remove("modal-success", "modal-error", "modal-confirm", "modal-custom");

    if (type === "success") modal.classList.add("modal-success");
    if (type === "error") modal.classList.add("modal-error");
    if (type === "confirm") modal.classList.add("modal-confirm");
    if (type === "custom") modal.classList.add("modal-custom");

    // standaard knoppen
    if ((type === "success" || type === "error") && (!buttons || !buttons.length)) {
        const ok = document.createElement("button");
        ok.className = "wtc-button";
        ok.textContent = "OK";
        ok.onclick = closeModal;
        btnBox.appendChild(ok);
    }

    if (type === "confirm" && (!buttons || !buttons.length)) {
        const yes = document.createElement("button");
        yes.className = "wtc-button";
        yes.textContent = "Ja";
        yes.onclick = () => closeModal();

        const no = document.createElement("button");
        no.className = "wtc-button";
        no.textContent = "Nee";
        no.onclick = () => closeModal();

        btnBox.appendChild(yes);
        btnBox.appendChild(no);
    }

    // custom knoppen
    if (Array.isArray(buttons)) {
        buttons.forEach(btn => {
            const button = document.createElement("button");
            button.className = "wtc-button";
            button.textContent = btn.text || "OK";
            button.onclick = () => {
                closeModal();
                if (typeof btn.action === "function") btn.action();
            };
            btnBox.appendChild(button);
        });
    }

    modal.classList.remove("hidden");
}