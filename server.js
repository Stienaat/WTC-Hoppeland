import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";


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
