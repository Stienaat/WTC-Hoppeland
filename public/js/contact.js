
window.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('#contactForm');
  if (!form) return;

  function v(fd){ 
    var names = Array.prototype.slice.call(arguments,1);
    for (const n of names){
      if (fd.has(n) && String(fd.get(n)).trim()) return String(fd.get(n)).trim();
    }
    return '';
  }

  async function onSubmit(e){
    e.preventDefault();

    const fd = new FormData(form);
    const consent = document.getElementById('consent');

    if (!consent.checked){
      await Modal.warn("⚠️", "Je moet toestemming geven om te kunnen versturen!");
      return;
    }

    const payload = {
      action: 'submitForm',
      name:  v(fd,'name','naam','fullname'),
      email: v(fd,'email','e-mail'),
      phone: v(fd,'phone','tel','telefoon','gsm'),
      street:v(fd,'street','straat'),
      zip:   v(fd,'zip','postcode','pc'),
      city:  v(fd,'city','gemeente','stad'),
      message: v(fd,'message','msg','bericht')
    };

    if (!payload.name || !payload.message){
      await Modal.warn("⚠️", "Naam en bericht zijn verplicht.");
      return;
    }

    try{
      const res = await fetch('/api/contact', {
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        credentials:'same-origin',
        body: JSON.stringify(payload)
      });

      const j = await res.json().catch(()=>null);

      if (!res.ok || !j || j.ok !== true){
        const msg = (j && (j.error || j.message)) || ('HTTP '+res.status);
        throw new Error(msg);
      }

      if (j.txt) {
        const blob = new Blob([j.txt], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Forms.txt';
        document.body.appendChild(a);
        a.click()
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      await Modal.success("👌", "Uw boodschap werd verzonden! ✔");
      form.reset();

    }catch(err){
     await Modal.error("👎", "Verzenden mislukt. ❌");
    }
  }

  form.addEventListener('submit', onSubmit);
});
