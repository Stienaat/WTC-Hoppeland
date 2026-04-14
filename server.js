import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

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
// HOME
// =====================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =====================================
// NOTICE OPHALEN / SAVE
// =====================================
// GET notice
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

// POST notice
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
// ADMIN - CONFIGURATIE
// =====================================

app.get("/api/admin/config", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    res.json({
      ok: true,
      config: {
        vereniging: {
          naam: data?.vereniging_naam || "",
          iban: data?.vereniging_iban || "",
          bic:  data?.vereniging_bic  || "",
          med:  data?.vereniging_med  || ""
        }
      }
    });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/config", upload.none(), async (req, res) => {
  try {
    const { vereniging } = req.body;

    const naam = vereniging?.naam || "";
    const iban = vereniging?.iban || "";
    const bic  = vereniging?.bic  || "";
    const med  = vereniging?.med  || "";

    const { error } = await supabase
      .from("Config")
      .upsert({
        id: 1,
        vereniging_naam: naam,
        vereniging_iban: iban,
        vereniging_bic:  bic,
        vereniging_med:  med
      });

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});


// =====================================
// REGISTRATIE (leden)
// =====================================
app.post("/register", async (req, res) => {
  const { naam, adres, gemeente, telefoon, email, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("Leden")
      .insert({
        naam,
        adres,
        gemeente,
        telefoon,
        email,
        wachtwoord: hash
      })
      .select()
      .single();

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
  console.log("LOGIN BODY:", req.body);
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
// EVENT INSCHRIJVEN (via email)
// =====================================
app.post("/signup", upload.none(), async (req, res) => {
  const { email, event_id } = req.body;

  if (!email || !event_id) {
    return res.json({ ok: false, message: "email en event_id verplicht" });
  }

  try {
    const { data: member, error: memberError } = await supabase
      .from("Leden")
      .select("id, naam, email")
      .eq("email", email)
      .single();

    if (memberError || !member) {
      return res.json({ ok: false, message: "Lid niet gevonden." });
    }

    const { error: insertError } = await supabase
      .from("signups")
      .insert([{ member_id: member.id, event_id, status: "pending" }]);

    if (insertError) {
      return res.json({ ok: false, message: "Inschrijving mislukt." });
    }

    return res.json({
      ok: true,
      signup: {
        event_id,
        email: member.email,
        name: member.naam,
        status: "pending"
      }
    });
  } catch (err) {
    return res.json({ ok: false, message: "Serverfout." });
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
      return res.json({ ok: false, error: "Database insert failed" });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.json({ ok: false, error: "Server error" });
  }
});

// =====================================
// verificatie login
// =====================================

app.get("/me", async (req, res) => {
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
// events route
// =====================================

// GET /events
app.get("/events", async (req, res) => {
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .order("start", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // config ophalen voor QR
  const { data: cfg } = await supabase
    .from("Config")
    .select("*")
    .limit(1)
    .single();

  const iban  = cfg?.iban || "";
  const bic   = cfg?.bic || "";
  const name  = cfg?.creditor_name || "";

  const withQr = (events || []).map(ev => {
    const datum = (ev.start || "").slice(0, 10);
    const qr_text = buildEpcQrText(
      name,
      iban,
      bic,
      ev.price || 0,
      `bet :${ev.title || ""} dd ${datum}`,
      ""
    );
    return { ...ev, qr_text };
  });

  res.json(withQr);
});

// helper
function moneyAmount(x) {
  return "EUR" + Number(x || 0).toFixed(2);
}

function sanitizeLine(s) {
  return String(s || "").replace(/[\r\n]/g, " ").trim();
}

function buildEpcQrText(creditorName, iban, bic, amount, remittance, info = "") {
  creditorName = sanitizeLine(creditorName);
  iban = sanitizeLine(iban).toUpperCase().replace(/[^A-Z0-9]/g, "");
  bic  = sanitizeLine(bic).toUpperCase().replace(/[^A-Z0-9]/g, "");
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

// =====================================
// INSCHRIJVINGEN OPHALEN (ADMIN)
// =====================================
app.get("/signups", async (req, res) => {
  const eventId = req.query.event_id;

  if (!eventId) {
    return res.status(400).json({ error: "event_id verplicht" });
  }

  try {
    // 1) signups ophalen
    const { data: signups, error: sErr } = await supabase
      .from("signups")
      .select("*")
      .eq("event_id", eventId);

    if (sErr) throw sErr;

    // 2) leden ophalen
    const { data: leden, error: lErr } = await supabase
      .from("Leden")
      .select("id, naam, email");

    if (lErr) throw lErr;

    // 3) combineren
    const mapped = (signups || []).map(s => {
      const lid = leden.find(l => l.id === s.member_id) || {};
      return {
        id: s.id,
        name: lid.naam || "",
        email: lid.email || "",
        status: s.status || ""
      };
    });

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =====================================
// INSCHRIJVINGSSTATUS OPHALEN (MEMBER)
// =====================================
app.get("/signup-status", async (req, res) => {
  const { email, event_id } = req.query;

  if (!email || !event_id) {
    return res.json({ ok: false, error: "email en event_id verplicht" });
  }

  try {
    const { data: member, error: memberError } = await supabase
      .from("Leden")
      .select("id")
      .eq("email", email)
      .single();

    if (memberError || !member) {
      return res.json({ ok: true, signed_up: false });
    }

    const { data: signup, error: signupError } = await supabase
      .from("signups")
      .select("*")
      .eq("member_id", member.id)
      .eq("event_id", event_id)
      .maybeSingle();

    if (signupError || !signup) {
      return res.json({ ok: true, signed_up: false });
    }

    return res.json({
      ok: true,
      signed_up: true,
      status: signup.status || "pending"
    });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
});

// =====================================
// INSCHRIJVING ANNULEREN (MEMBER)
// =====================================
app.post("/cancel", upload.none(), async (req, res) => {
  const { email, event_id } = req.body;

  if (!email || !event_id) {
    return res.json({ ok: false, message: "email en event_id verplicht" });
  }

  try {
    const { data: member, error: memberError } = await supabase
      .from("Leden")
      .select("id")
      .eq("email", email)
      .single();

    if (memberError || !member) {
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
});


// =====================================
// SERVER START
// =====================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server draait op poort " + PORT);
});
