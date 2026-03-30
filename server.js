import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const upload = multer();

// Fix voor __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express setup
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Health check (Render vereist dit)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// =====================================
// LEDEN LOGIN
// =====================================
app.post("/login", upload.none(), async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: leden, error } = await supabase
      .from("leden")
      .select("*")
      .eq("email", email.toLowerCase())
      .limit(1);

    if (error || leden.length === 0) {
      return res.json({ ok: false, error: "Onbekende gebruiker" });
    }

    const lid = leden[0];
    const match = await bcrypt.compare(password, lid.wachtwoord);

    if (!match) {
      return res.json({ ok: false, error: "Fout wachtwoord" });
    }

    return res.json({
      ok: true,
      naam: lid.naam,
      id: lid.id
    });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Serverfout" });
  }
});


// =====================================
// REGISTRATIE
// =====================================
app.post("/register", upload.none(), async (req, res) => {
  try {
    const { naam, email, password, adres, gemeente, telefoon } = req.body;

    const hash = await bcrypt.hash(password, 10);

    const { error } = await supabase
      .from("leden")
      .insert([
        {
          naam,
          email: email.toLowerCase(),
          wachtwoord: hash,
          adres,
          gemeente,
          telefoon
        }
      ]);

    if (error) {
      console.error(error);
      return res.json({ ok: false, error: "Email bestaat al?" });
    }

    return res.json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Serverfout" });
  }
});


// =====================================
// NOTICE (opslaan & ophalen)
// =====================================
app.get("/notice", async (req, res) => {
  const { data, error } = await supabase
    .from("notice")
    .select("*")
    .limit(1);

  if (error || data.length === 0) {
    return res.status(500).send("Kon mededelingen niet laden.");
  }

  res.send(data[0].text);
});

app.post("/notice", upload.none(), async (req, res) => {
  const { text } = req.body;

  const { error } = await supabase
    .from("notice")
    .update({ text })
    .eq("id", 1);

  if (error) {
    return res.json({ ok: false });
  }

  return res.json({ ok: true });
});


// =====================================
// EVENTS OPHALEN
// =====================================
app.get("/events", async (req, res) => {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start", { ascending: true });

  if (error) {
    return res.json({ ok: false });
  }

  res.json({ ok: true, events: data });
});


// =====================================
// INSCHRIJVEN VOOR EVENT
// =====================================
app.post("/signup", upload.none(), async (req, res) => {
  const { member_id, event_id } = req.body;

  const { error } = await supabase
    .from("signups")
    .insert([{ member_id, event_id, status: "ingeschreven" }]);

  if (error) {
    return res.json({ ok: false });
  }

  return res.json({ ok: true });
});


// =====================================
// CONTACT FORM (bestond al)
// =====================================
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, street, zip, city, message, consent } = req.body;

    const { error } = await supabase
      .from("forms")
      .insert([
        {
          name,
          email: email?.toLowerCase() || "",
          phone,
          street,
          zip,
          city,
          msg: message,
          consent: consent === true
        }
      ]);

    if (error) {
      console.error(error);
      return res.json({ ok: false, error: "Database insert failed" });
    }

    return res.json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Server error" });
  }
});


// =====================================
// SERVER START
// =====================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server draait op poort " + PORT);
});
