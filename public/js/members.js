async function loadMembers() {
  try {
    const res = await fetch("/api/leden");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const leden = await res.json();
    console.log("Leden:", leden);

    const tbody = document.getElementById("ledenRows");
    if (!tbody) {
      console.error("Element #ledenRows bestaat niet!");
      return;
    }

    tbody.innerHTML = "";

    leden.forEach(lid => {
      tbody.innerHTML += `
        <tr>
          <td>${lid.naam}</td>
          <td>${lid.email}</td>
          <td>${lid.telefoon || ""}</td>
          <td>${lid.gemeente || ""}</td>
          <td>${lid.adres || ""}</td>
          <td>
            <button class="editBtn" data-id="${lid.id}">✏️</button>
            <button class="deleteBtn" data-id="${lid.id}">🗑️</button>
          </td>
        </tr>
      `;
    });

  } catch (err) {
    console.error("Kon leden niet laden:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadMembers);
