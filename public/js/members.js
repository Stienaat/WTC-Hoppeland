function renderLeden(leden) {
    const tbody = document.getElementById("ledenRows");
    tbody.innerHTML = "";

    leden.forEach(lid => {
        const formId = "f_" + btoa(lid.email).replace(/=/g, "");

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <form method="post" id="${formId}"></form>

            <input type="hidden" name="action" value="update" form="${formId}">
            <input type="hidden" name="email"  value="${lid.email}" form="${formId}">

            <td><input type="text" name="naam"     form="${formId}" value="${lid.naam || ""}"></td>
            <td>${lid.email}</td>
            <td><input type="text" name="telefoon" form="${formId}" value="${lid.telefoon || ""}"></td>
            <td><input type="text" name="gemeente" form="${formId}" value="${lid.gemeente || ""}"></td>
            <td><input type="text" name="adres"    form="${formId}" value="${lid.adres || ""}"></td>

            <td style="width:120px;">
                <button type="button" class="wtc-button changeMember"
                        data-formid="${formId}"
                        data-naam="${lid.naam || ""}">Update</button>

                <button type="button" class="wtc-button deleteMember"
                        data-email="${lid.email}"
                        data-naam="${lid.naam || ""}">delete</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

document.addEventListener("DOMContentLoaded", loadMembers);
