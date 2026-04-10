function showModal(type, title, message) {
    const modal = document.getElementById("app-modal");
    const modalTitle = document.getElementById("modal-title");
    const modalMessage = document.getElementById("modal-message");

    if (!modal || !modalTitle || !modalMessage) {
        console.warn("Modal HTML ontbreekt op deze pagina");
        return;
    }

    modal.classList.remove("modal-success", "modal-error");
    modal.classList.add(type === "error" ? "modal-error" : "modal-success");

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    modal.classList.remove("hidden");
	
	if (fade) {
		setTimeout(() => {
		el.style.opacity = "0";
		}, 3500);
    }
}


function closeModal() {
    const modal = document.getElementById("app-modal");
    if (modal) modal.classList.add("hidden");
}
