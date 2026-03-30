import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
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

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =====================================
// STATIC FILES
// =====================================
app.use(express.static(path.join(__dirname, "public")));

// =====================================
// HEALTH CHECK / HOME
// =====================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =====================================
// NOTICE OPHALEN (uit notice.md)
// =====================================
app.get("/notice", (req, res) => {
  const filePath = path.join(__dirname, "data", "notice.md");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Notice read error:", err);
      return res.status(500).send("Kon mededelingen niet laden.");
    }
    res.send(data);
  });
});

// Compatibiliteit met oude PHP URL:
// /notice_api.php?action=getNotice
app.get("/notice_api.php", (req, res) => {
  const action = req.query.action;
  if (action === "getNotice") {
    const filePath = path.join(__dirname, "data", "notice.md");
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        console.error("Notice read error:", err);
        return res.status(500).send("Kon mededelingen niet laden.");
      }
      res.send(data);
    });
  } else {
    res.status(400).send("Ongeldige actie.");
  }
});

// =====================================
// NOTICE OPSLAAN (admin)
// =====================================
app.post("/notice", upload.none(), (req, res) => {
  const { text } = req.body;
  const filePath = path.join(__dirname, "data", "notice.md");

  fs.writeFile(filePath, text, "utf8", (err) => {
    if (err) {
      console.error("Notice write error:", err);
      return res.json({ ok: false });
    }
    return res.json({ ok: true });
  });
});

// =====================================
// REGISTRATIE (leden)
// =====================================
app.post("/register", upload.none(), async (req, res) => {
  const { name, address, city, email, phone, code } = req.body;

  if (!name || !email || !code) {
    return res
      .status(400)
      .json({ ok: false, message: "Naam, email en paswoord verplicht." });
  }

  try {
    const { error } = await supabase
      .from("leden")
      .insert([
        {
          name,
          address,
          city,
          email: email.toLowerCase(),
          phone,
          code
        }
      ]);

    if (error) {
      console.error("Registratie fout:", error);
      if (error.code === "23505") {
        return res
          .status(400)
          .json({ ok: false, message: "Dit e-mailadres bestaat al." });
      }
      return res
        .status(500)
        .json({ ok: false, message: "Serverfout bij registratie." });
    }

    return res.json({ ok: true, message: "Registratie gelukt." });
  } catch (err) {
    console.error("Registratie fout (catch):", err);
    return res
      .status(500)
      .json({ ok: false, message: "Serverfout bij registratie." });
  }
});

// =====================================
// LEDEN LOGIN (met code, 6 tekens)
// =====================================
app.post("/login", upload.none(), async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res
      .status(400)
      .json({ ok: false, message: "Email en paswoord verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("leden")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("Login query fout:", error);
      throw error;
    }

    if (!data) {
      return res
        .status(401)
        .json({ ok: false, message: "Onjuiste login." });
    }

    return res.json({
      ok: true,
      message: "Login OK",
      lid: {
        id: data.id,
        name: data.name,
        email: data.email
      }
    });
  } catch (err) {
    console.error("Login fout (catch):", err);
    return res
      .status(500)
      .json({ ok: false, message: "Serverfout bij login." });
  }
});

// =====================================
// ADMIN-LOGIN (PIN)
// =====================================
app.post("/admin-login", upload.none(), async (req, res) => {
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

    if (error) {
      console.error("Admin query fout:", error);
      throw error;
    }

    if (!data || data.pin !== pin) {
      return res.status(401).json({ ok: false, message: "PIN fout." });
    }

    return res.json({ ok: true, message: "PIN OK" });
  } catch (err) {
    console.error("Admin login fout (catch):", err);
    return res.status(500).json({ ok: false, message: "Serverfout." });
  }
});

// =====================================
// ADMIN-PIN WIJZIGEN
// =====================================
app.post("/admin-change-pin", upload.none(), async (req, res) => {
  const { oldPin, newPin } = req.body;

  if (!oldPin || !newPin) {
    return res
      .status(400)
      .json({ ok: false, message: "Beide PINs verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("admin")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("Admin query fout:", error);
      throw error;
    }

    if (!data || data.pin !== oldPin) {
      return res.status(401).json({ ok: false, message: "Oude PIN fout." });
    }

    const { error: updateError } = await supabase
      .from("admin")
      .update({ pin: newPin })
      .eq("id", 1);

    if (updateError) {
      console.error("PIN update fout:", updateError);
      throw updateError;
    }

    return res.json({ ok: true, message: "PIN gewijzigd." });
  } catch (err) {
    console.error("PIN wijzig fout (catch):", err);
    return res.status(500).json({ ok: false, message: "Serverfout." });
  }
});

// =====================================
// EVENTS OPHALEN
// =====================================
app.get("/events", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("start", { ascending: true });

    if (error) {
      console.error("Events fout:", error);
      return res.json({ ok: false });
    }

    res.json({ ok: true, events: data });
  } catch (err) {
    console.error("Events fout (catch):", err);
    res.json({ ok: false });
  }
});

// =====================================
// INSCHRIJVEN VOOR EVENT
// =====================================
app.post("/signup", upload.none(), async (req, res) => {
  const { member_id, event_id } = req.body;

  if (!member_id || !event_id) {
    return res
      .status(400)
      .json({ ok: false, message: "Lid en event verplicht." });
  }

  try {
    const { error } = await supabase
      .from("signups")
      .insert([{ member_id, event_id, status: "ingeschreven" }]);

    if (error) {
      console.error("Signup fout:", error);
      return res.json({ ok: false });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Signup fout (catch):", err);
    return res.json({ ok: false });
  }
});

// =====================================
// CONTACT FORM
// =====================================
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, street, zip, city, message, consent } =
      req.body;

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
          consent: consent === true || consent === "true"
        }
      ]);

    if (error) {
      console.error("Contact insert fout:", error);
      return res.json({ ok: false, error: "Database insert failed" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Contact fout (catch):", err);
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
