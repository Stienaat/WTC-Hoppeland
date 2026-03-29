import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

import multer from "multer";
const upload = multer(); // nodig om FormData te lezen

app.post("/leden", upload.none(), async (req, res) => {
  try {
    const actie = req.body.actie;

    if (!actie) {
      return res.json({ ok: false, error: "Geen actie opgegeven" });
    }

    const ledenPath = path.join(__dirname, "data", "leden.json");
    const adminPath = path.join(__dirname, "data", "admin.json");
    const noticePath = path.join(__dirname, "data", "notice.md");

    const leden = JSON.parse(fs.readFileSync(ledenPath, "utf8"));
    const adminCfg = JSON.parse(fs.readFileSync(adminPath, "utf8"));

    // -----------------------------
    // 1) LEDEN LOGIN
    // -----------------------------
    if (actie === "login") {
      const email = (req.body.email || "").toLowerCase();
      const code = req.body.code || "";

      const lid = leden.find(l => l.email.toLowerCase() === email);

      if (!lid) {
        return res.json({ ok: false, error: "Onbekende gebruiker" });
      }

      const match = await bcrypt.compare(code, lid.wachtwoord);

      if (!match) {
        return res.json({ ok: false, error: "Fout wachtwoord" });
      }

      return res.json({
        ok: true,
        naam: lid.naam,
        id: lid.id
      });
    }

    // -----------------------------
    // 2) ADMIN LOGIN (PIN)
    // -----------------------------
    if (actie === "admin_login") {
      const pin = req.body.admin_pin || "";

      const match = await bcrypt.compare(pin, adminCfg.pin_hash);

      if (!match) {
        return res.json({ ok: false, error: "Onjuiste admin PIN" });
      }

      return res.json({ ok: true });
    }

    // -----------------------------
    // 3) ADMIN PIN WIJZIGEN
    // -----------------------------
    if (actie === "admin_change_pin") {
      const oldPin = req.body.old_pin || "";
      const newPin = req.body.new_pin || "";

      const match = await bcrypt.compare(oldPin, adminCfg.pin_hash);

      if (!match) {
        return res.json({ ok: false, error: "Oude PIN fout" });
      }

      adminCfg.pin_hash = await bcrypt.hash(newPin, 10);
      fs.writeFileSync(adminPath, JSON.stringify(adminCfg, null, 2));

      return res.json({ ok: true });
    }

    // -----------------------------
    // 4) REGISTRATIE
    // -----------------------------
    if (actie === "registreer") {
      const email = (req.body.email || "").toLowerCase();
      const code = req.body.code || "";
      const naam = req.body.name || "";

      if (!email || !code || !naam) {
        return res.json({ ok: false, error: "Velden ontbreken" });
      }

      if (leden.find(l => l.email.toLowerCase() === email)) {
        return res.json({ ok: false, error: "Email bestaat al" });
      }

      const nieuw = {
        id: Date.now(),
        naam,
        email,
        wachtwoord: await bcrypt.hash(code, 10)
      };

      leden.push(nieuw);
      fs.writeFileSync(ledenPath, JSON.stringify(leden, null, 2));

      return res.json({ ok: true });
    }

    // -----------------------------
    // 5) NOTICE OPSLAAN
    // -----------------------------
    if (actie === "setNotice") {
      const text = req.body.text || "";
      fs.writeFileSync(noticePath, text, "utf8");
      return res.json({ ok: true });
    }

    return res.json({ ok: false, error: "Onbekende actie" });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Serverfout" });
  }
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static("public"));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CONTACT FORM
app.post("/api/contact", async (req, res) => {
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
      return res.json({ ok: false, error: "name/message required" });
    }

    const { data, error } = await supabase
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
      ])
      .select();

    if (error) {
      console.error(error);
      return res.json({ ok: false, error: "Database insert failed" });
    }

    return res.json({
      ok: true,
      txt: `
${name}
${email || ""}
${phone || ""}
${street || ""}
${zip || ""}
${city || ""}
${message}
${new Date().toISOString().slice(0, 16).replace("T", " ")}
      `.trim()
    });
  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Server error" });
  }
});

// NOTICE ROUTE
app.get("/notice", (req, res) => {
  const filePath = path.join(__dirname, "data", "notice.md");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      return res.status(500).send("Kon mededelingen niet laden.");
    }
    res.send(data);
  });
});


// LOGIN ROUTE
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ ok: false, error: "Email en wachtwoord vereist" });
    }

    // Pad naar leden.json
    const ledenPath = path.join(__dirname, "data", "leden.json");

    // JSON inlezen
    const raw = fs.readFileSync(ledenPath, "utf8");
    const leden = JSON.parse(raw);

    // Lid zoeken op email (case-insensitive)
    const lid = leden.find(
      (l) => l.email.toLowerCase() === email.toLowerCase()
    );

    if (!lid) {
      return res.json({ ok: false, error: "Onbekende gebruiker" });
    }

    // Wachtwoord controleren
    const match = await bcrypt.compare(password, lid.wachtwoord);

    if (!match) {
      return res.json({ ok: false, error: "Fout wachtwoord" });
    }

    // Login OK
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

// START SERVER
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server draait op poort ${PORT}`);
});
