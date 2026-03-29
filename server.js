const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static('public'));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    if (!name || !message) {
      return res.json({ ok: false, error: 'name/message required' });
    }

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server draait op poort ${PORT}`);
});
