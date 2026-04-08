

async function loadMembers() {
  try {
    const res = await fetch("/leden");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const leden = await res.json();
    console.log("Leden:", leden);

    // TODO: tabel vullen
  } catch (err) {
    console.error("Kon leden niet laden:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadMembers);
