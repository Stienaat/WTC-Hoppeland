import express from "express";
import path from "path";
import fs from "fs";              // ← JE MIST DEZE IMPORT!
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const upload = multer();

// Fix voor __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express setup (MOET BOVEN ALLE ROUTES STAAN)
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================
// NOTICE OPHALEN (uit notice.md)
// =====================================
app.get("/notice", (req, res) => {
  const filePath = path.join(__dirname, "data", "notice.md");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      return res.status(500).send("Kon mededelingen niet laden.");
    }
    res.send(data);
  });
});

// =====================================
// NOTICE OPSLAAN (admin)
// =====================================
app.post("/notice", upload.none(), (req, res) => {
  const { text } = req.body;
  const filePath = path.join(__dirname, "data", "notice.md");

  fs.writeFile(filePath, text, "utf8", (err) => {
    if (err) {
      return res.json({ ok: false });
    }
    return res.json({ ok: true });
  });
});

// Static files (MOET ONDER DE ROUTES STAAN)
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

    const { data: Leden, error } = await supabase
      .from("Leden")
      .select("*")
      .eq("email", email.toLowerCase())
      .limit(1);

    if (error || Leden.length === 0) {
      return res.json({ ok: false, error: "Onbekende gebruiker" });
    }

    const lid = Leden[0];
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
      .from("Leden")
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
  console.error("Supabase fout:", error);
  return res.json({ ok: false, error: error.message });
}


    return res.json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Serverfout" });
  }
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

//=======================================
//  Login route
//=======================================

app.post("/login", async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ ok: false, message: "Email en paswoord verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("leden")
      .select("*")
      .eq("email", email)
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(401).json({ ok: false, message: "Onjuiste login." });
    }

    return res.json({ ok: true, message: "Login OK" });

  } catch (err) {
    console.error("Login fout:", err);
    return res.status(500).json({ ok: false, message: "Serverfout bij login." });
  }
});

//=======================================
//  Admin-Login route
//=======================================

app.post("/admin-login", async (req, res) => {
  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ ok: false, message: "PIN verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("admin")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    if (!data || data.pin !== pin) {
      return res.status(401).json({ ok: false, message: "PIN fout." });
    }

    return res.json({ ok: true, message: "PIN OK" });

  } catch (err) {
    console.error("Admin login fout:", err);
    return res.status(500).json({ ok: false, message: "Serverfout." });
  }
});

//=======================================
//  Admin-Pin wijzigen
//=======================================
app.post("/admin-change-pin", async (req, res) => {
  const { oldPin, newPin } = req.body;

  if (!oldPin || !newPin) {
    return res.status(400).json({ ok: false, message: "Beide PINs verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("admin")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    if (!data || data.pin !== oldPin) {
      return res.status(401).json({ ok: false, message: "Oude PIN fout." });
    }

    const { error: updateError } = await supabase
      .from("admin")
      .update({ pin: newPin })
      .eq("id", 1);

    if (updateError) throw updateError;

    return res.json({ ok: true, message: "PIN gewijzigd." });

  } catch (err) {
    console.error("PIN wijzig fout:", err);
    return res.status(500).json({ ok: false, message: "Serverfout." });
  }
});
