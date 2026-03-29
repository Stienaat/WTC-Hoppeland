const express = require('express');
const app = express();

app.use(express.static('public'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server draait op poort ${PORT}`);
});

app.post('/api/contact', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      street,
      zip,
      city,
      message,
      consent
    } = req.body;

    // Validatie zoals in je PHP
    if (!name || !message) {
      return res.json({ ok: false, error: 'name/message required' });
    }

    // Opslaan in Supabase forms-tabel
    const { data, error } = await supabase
      .from('forms')
      .insert([
        {
          name,
          email: email?.toLowerCase() || '',
          phone,
          street,
          zip,
          city,
          msg: message,
          consent: consent === true,
        }
      ])
      .select();

    if (error) {
      console.error(error);
      return res.json({ ok: false, error: 'Database insert failed' });
    }

    // Response zoals jouw PHP doet
    return res.json({
      ok: true,
      txt: `
${name}
${email || ''}
${phone || ''}
${street || ''}
${zip || ''}
${city || ''}
${message}
${new Date().toISOString().slice(0, 16).replace('T', ' ')}
      `.trim()
    });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: 'Server error' });
  }
});
