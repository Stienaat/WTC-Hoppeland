import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import eventsRoutes from "./routes/events.js";
import adminRoutes from "./routes/admin.js";
import signupsRoutes from "./routes/signups.js";
import noticeRoutes from "./routes/notice.js";
import contactRoutes from "./routes/contact.js";
import authRoutes from "./routes/auth.js";


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
app.use((req, res, next) => {
  req.supabase = supabase;
  next();
}, authRoutes);

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
app.use("/api/notice", (req, res, next) => {
  req.supabase = supabase;
  next();
}, noticeRoutes);
app.use("/api/contact", (req, res, next) => {
  req.supabase = supabase;
  next();
}, contactRoutes);

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


app.post("/admin-login", async (req, res) => {
  req.url = "/api/admin/login";
  app.handle(req, res);
});

app.post("/admin-change-pin", async (req, res) => {
  req.url = "/api/admin/change-pin";
  app.handle(req, res);
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