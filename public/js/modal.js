(function (window) {
    let currentResolver = null;

    function getElements() {
        return {
            modal: document.getElementById("app-modal"),
            title: document.getElementById("modal-title"),
            message: document.getElementById("modal-message"),
            buttons: document.getElementById("modal-buttons")
        };
    }

    function resetModal() {
        const { modal, title, message, buttons } = getElements();

        title.textContent = "";
        message.innerHTML = "";
        buttons.innerHTML = "";

        modal.classList.remove(
            "modal-success",
            "modal-error",
            "modal-warn",
            "modal-confirm",
            "modal-prompt",
            "modal-default"
        );
    }

    function close(result) {
        const { modal, message, buttons } = getElements();

        modal.classList.add("hidden");
        message.innerHTML = "";
        buttons.innerHTML = "";

        if (typeof currentResolver === "function") {
            currentResolver(result);
            currentResolver = null;
        }
    }

    function normalizeOptions(options) {
        if (typeof options === "string") {
            return {
                message: options
            };
        }
        return options || {};
    }

    function createMessageBlock(message) {
        const block = document.createElement("div");
        block.textContent = message;
        return block;
    }

    function createInput(inputOptions) {
        const wrap = document.createElement("div");
        wrap.className = "modal-custom-content";
        wrap.style.marginTop = "15px";

        const input = document.createElement("input");
        input.type = inputOptions.type || "text";
        input.value = inputOptions.value || "";
        input.placeholder = inputOptions.placeholder || "";
        input.id = inputOptions.id || "modal-input-field";
        input.className = inputOptions.className || "modal-input";

        if (!inputOptions.className) {
            input.style.width = "100%";
            input.style.boxSizing = "border-box";
            input.style.padding = "8px";
        }

        if (inputOptions.maxLength) {
            input.maxLength = inputOptions.maxLength;
        }

        wrap.appendChild(input);

        return {
            wrapper: wrap,
            input: input
        };
    }

    function createButton(buttonOptions, context) {
        const button = document.createElement("button");
        button.className = buttonOptions.className || "wtc-button";
        button.textContent = buttonOptions.text || "OK";

        button.onclick = function () {
            let result = buttonOptions.value;

            if (typeof buttonOptions.getValue === "function") {
                result = buttonOptions.getValue(context);
            }

            if (typeof buttonOptions.onClick === "function") {
                buttonOptions.onClick(result, context);
            }

            close(result);
        };

        return button;
    }

    function show(options) {
        options = normalizeOptions(options);

        const {
            type = "default",
            title = "",
            message = "",
            content = null,
            input = null,
            buttons = null,
            closeOnBackdrop = false
        } = options;

        const { modal, title: titleEl, message: messageEl, buttons: buttonsEl } = getElements();

        if (!modal || !titleEl || !messageEl || !buttonsEl) {
            throw new Error("Modal HTML-elementen niet gevonden.");
        }

        if (currentResolver) {
            currentResolver(null);
            currentResolver = null;
        }

        resetModal();

        titleEl.textContent = title || "";

        if (message) {
            messageEl.appendChild(createMessageBlock(message));
        }

        const context = {
            modal: modal,
            input: null
        };

        if (content instanceof HTMLElement) {
            const wrap = document.createElement("div");
            wrap.className = "modal-custom-content";
            wrap.style.marginTop = "15px";
            wrap.appendChild(content);
            messageEl.appendChild(wrap);
        } else if (typeof content === "string" && content.trim() !== "") {
            const wrap = document.createElement("div");
            wrap.className = "modal-custom-content";
            wrap.style.marginTop = "15px";
            wrap.innerHTML = content;
            messageEl.appendChild(wrap);
        }

        if (input) {
            const inputParts = createInput(input);
            context.input = inputParts.input;
            messageEl.appendChild(inputParts.wrapper);
        }

        let finalButtons = buttons;

        if (!Array.isArray(finalButtons) || finalButtons.length === 0) {
            if (type === "confirm") {
                finalButtons = [
                    { text: "Ja", value: true },
                    { text: "Nee", value: false }
                ];
            } else {
                finalButtons = [
                    { text: "OK", value: true }
                ];
            }
        }

        finalButtons.forEach(function (btn) {
            buttonsEl.appendChild(createButton(btn, context));
        });

        modal.classList.add("modal-" + type);
        modal.classList.remove("hidden");

        if (context.input) {
            setTimeout(function () {
                context.input.focus();
                context.input.select();
            }, 0);
        }

        if (closeOnBackdrop) {
            modal.onclick = function (e) {
                if (e.target === modal) {
                    close(null);
                }
            };
        } else {
            modal.onclick = null;
        }

        return new Promise(function (resolve) {
            currentResolver = resolve;
        });
    }

    function success(title, message) {
        return show({
            type: "success",
            title: title,
            message: message
        });
    }

    function error(title, message) {
        return show({
            type: "error",
            title: title,
            message: message
        });
    }

    function warn(title, message) {
        return show({
            type: "warn",
            title: title,
            message: message
        });
    }

    function confirm(title, message, options) {
        options = options || {};

        return show({
            type: "confirm",
            title: title,
            message: message,
            buttons: options.buttons || [
                { text: options.yesText || "Ja", value: true },
                { text: options.noText || "Nee", value: false }
            ]
        });
    }

    function prompt(title, defaultValue, options) {
        options = options || {};

        return show({
            type: "prompt",
            title: title,
            message: options.message || "",
            input: {
                type: options.inputType || "text",
                value: defaultValue || "",
                placeholder: options.placeholder || "",
                id: options.id || "modal-input-field",
                className: options.className || "modal-input",
                maxLength: options.maxLength || null
            },
            buttons: [
                {
                    text: options.okText || "OK",
                    getValue: function (ctx) {
                        return ctx.input ? ctx.input.value.trim() : "";
                    }
                },
                {
                    text: options.cancelText || "Annuleer",
                    value: null
                }
            ]
        });
    }

    function content(title, contentNodeOrHtml, buttons, options) {
        options = options || {};

        return show({
            type: options.type || "default",
            title: title,
            message: options.message || "",
            content: contentNodeOrHtml,
            buttons: buttons || [{ text: "OK", value: true }]
        });
    }

    window.Modal = {
        show: show,
        close: close,
        success: success,
        error: error,
        warn: warn,
        confirm: confirm,
        prompt: prompt,
        content: content
    };

    window.closeModal = close;
})(window);