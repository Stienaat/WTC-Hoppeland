import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import eventsRoutes from "./routes/events.js";
import adminRoutes from "./routes/admin.js";
import signupsRoutes from "./routes/signups.js";

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

app.use("/api/events", eventsRoutes);
app.use("/api/admin", (req, res, next) => {
  req.supabase = supabase;
  next();
}, adminRoutes);
app.use("/api/signups", (req, res, next) => {
  req.supabase = supabase;
  next();
}, signupsRoutes);

// =====================================
// HOME
// =====================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =====================================
// HELPERS
// =====================================
function moneyAmount(x) {
  return "EUR" + Number(x || 0).toFixed(2);
}

function sanitizeLine(s) {
  return String(s || "").replace(/[\r\n]/g, " ").trim();
}

function buildEpcQrText(creditorName, iban, bic, amount, remittance, info = "") {
  creditorName = sanitizeLine(creditorName);
  iban = sanitizeLine(iban).toUpperCase().replace(/[^A-Z0-9]/g, "");
  bic = sanitizeLine(bic).toUpperCase().replace(/[^A-Z0-9]/g, "");
  remittance = sanitizeLine(remittance);
  info = sanitizeLine(info);

  return [
    "BCD",
    "002",
    "1",
    "SCT",
    bic,
    creditorName,
    iban,
    moneyAmount(amount),
    "",
    remittance,
    info
  ].join("\n");
}

async function findMemberByEmail(email) {
  if (!email) return { member: null, error: "email verplicht" };

  const { data: member, error } = await supabase
    .from("Leden")
    .select("id, naam, email")
    .eq("email", email)
    .single();

  if (error || !member) {
    return { member: null, error: "Lid niet gevonden." };
  }

  return { member, error: null };
}

// =====================================
// NOTICE OPHALEN / SAVE
// =====================================
app.get("/api/notice", async (req, res) => {
  const { data, error } = await supabase
    .from("Notice")
    .select("text")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return res.json({ ok: false, error: error.message });
  }

  res.json({ ok: true, text: data?.text || "" });
});

app.post("/api/notice", upload.none(), async (req, res) => {
  const { text = "" } = req.body;

  const { error } = await supabase
    .from("Notice")
    .upsert({ id: 1, text });

  if (error) {
    return res.json({ ok: false, error: error.message });
  }

  res.json({ ok: true });
});


// =====================================
// REGISTRATIE (leden)
// =====================================
app.post("/register", async (req, res) => {
  const { naam, adres, gemeente, telefoon, email, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    const { error } = await supabase
      .from("Leden")
      .insert({
        naam,
        adres,
        gemeente,
        telefoon,
        email,
        wachtwoord: hash
      });

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// =====================================
// LEDEN LOGIN
// =====================================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: user, error } = await supabase
      .from("Leden")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.json({ ok: false, error: "Onbekend emailadres." });
    }

    const ok = await bcrypt.compare(password, user.wachtwoord);

    if (!ok) {
      return res.json({ ok: false, error: "Fout wachtwoord." });
    }

    res.json({ ok: true, user });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.json({ ok: false, error: "Technische fout" });
  }
});

// =====================================
// ADMIN LOGIN (PIN)
// =====================================
app.post("/admin-login", async (req, res) => {
  const { pin } = req.body;

  if (!pin) {
    return res.json({ ok: false, message: "PIN verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("admin")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    if (!data || data.pin !== pin) {
      return res.json({ ok: false, message: "PIN fout." });
    }

    return res.json({ ok: true, message: "PIN OK" });
  } catch (err) {
    return res.json({ ok: false, message: "Serverfout." });
  }
});

// =====================================
// ADMIN PIN WIJZIGEN
// =====================================
app.post("/admin-change-pin", async (req, res) => {
  const { oldPin, newPin } = req.body;

  if (!oldPin || !newPin) {
    return res.json({ ok: false, message: "Beide PINs verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("admin")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    if (!data || data.pin !== oldPin) {
      return res.json({ ok: false, message: "Oude PIN fout." });
    }

    const { error: updateError } = await supabase
      .from("admin")
      .update({ pin: newPin })
      .eq("id", 1);

    if (updateError) throw updateError;

    return res.json({ ok: true, message: "PIN gewijzigd." });
  } catch (err) {
    return res.json({ ok: false, message: "Serverfout." });
  }
});

// =====================================
// CONTACT FORM
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
          consent: consent === true || consent === "true"
        }
      ]);

    if (error) {
      return res.json({ ok: false, error: "Database insert failed" });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.json({ ok: false, error: "Server error" });
  }
});

// =====================================
// VERIFICATIE LOGIN
// =====================================
app.get("/api/me", async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.json({ ok: false, error: "Geen email ontvangen." });
  }

  const { data: user, error } = await supabase
    .from("Leden")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !user) {
    return res.json({ ok: false, error: "Lid niet gevonden." });
  }

  res.json({ ok: true, user });
});

// =====================================
// COMPATIBILITEIT MET OUDE ROUTES
// =====================================
app.get("/signups", async (req, res) => {
  req.url = "/api/signups?" + new URLSearchParams(req.query).toString();
  app.handle(req, res);
});

app.get("/signup-status", async (req, res) => {
  req.url = "/api/signups/status?" + new URLSearchParams(req.query).toString();
  app.handle(req, res);
});

app.post("/signup", async (req, res) => {
  req.url = "/api/signups";
  app.handle(req, res);
});

app.post("/cancel", async (req, res) => {
  try {
    const { email, event_id } = req.body;

    if (!email || !event_id) {
      return res.json({ ok: false, message: "email en event_id verplicht" });
    }

    const { member, error } = await findMemberByEmail(email);
    if (error || !member) {
      return res.json({ ok: false, message: "Lid niet gevonden." });
    }

    const { error: deleteError } = await supabase
      .from("signups")
      .delete()
      .eq("member_id", member.id)
      .eq("event_id", event_id);

    if (deleteError) {
      return res.json({ ok: false, message: "Annuleren mislukt." });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.json({ ok: false, message: "Serverfout." });
  }
})


// =====================================
// SERVER START
// =====================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server draait op poort " + PORT);
});