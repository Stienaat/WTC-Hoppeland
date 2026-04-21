import express from "express";
import path from "path";
import session from "express-session";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

import eventsRoutes from "./routes/events.js";
import adminRoutes from "./routes/admin.js";
import signupsRoutes from "./routes/signups.js";
import noticeRoutes from "./routes/notice.js";
import contactRoutes from "./routes/contact.js";
import authRoutes from "./routes/auth.js";
import cycleRoutes from "./routes/cycleroutes.js";
import ridesRouter from './routes/rides.js';
import cors from 'cors';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors({
  origin: 'https://wtc-hoppeland.onrender.com',
  credentials: true
}));

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use((req, res, next) => {
  req.supabase = supabase;
  next();
});
app.use("/api/routes", cycleRoutes);

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
  secure: true,
  sameSite: 'none'
	}
}));

app.use('/api/rides', ridesRouter);
app.use(express.static(path.join(__dirname, "public")));

app.use("/", authRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/signups", signupsRoutes);
app.use("/api/notice", noticeRoutes);
app.use("/api/contact", contactRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/admin-login", (req, res) => {
  req.url = "/api/admin/login";
  app.handle(req, res);
});

app.post("/admin-change-pin", (req, res) => {
  req.url = "/api/admin/change-pin";
  app.handle(req, res);
});

app.get("/signups", (req, res) => {
  req.url = "/api/signups?" + new URLSearchParams(req.query).toString();
  app.handle(req, res);
});

app.get("/signup-status", (req, res) => {
  req.url = "/api/signups/status?" + new URLSearchParams(req.query).toString();
  app.handle(req, res);
});

app.post("/signup", (req, res) => {
  req.url = "/api/signups";
  app.handle(req, res);
});

app.post("/cancel", async (req, res) => {
  try {
    const { email, event_id } = req.body;

    if (!email || !event_id) {
      return res.json({ ok: false, message: "email en event_id verplicht" });
    }

    const { data: member } = await supabase
      .from("Leden")
      .select("id")
      .eq("email", email)
      .single();

    if (!member) {
      return res.json({ ok: false, message: "Lid niet gevonden." });
    }

    const { error } = await supabase
      .from("signups")
      .delete()
      .eq("member_id", member.id)
      .eq("event_id", event_id);

    if (error) {
      return res.json({ ok: false, message: "Annuleren mislukt." });
    }

    return res.json({ ok: true });
  } catch {
    return res.json({ ok: false, message: "Serverfout." });
  }
});

app.get("/api/me", async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.json({ ok: false, error: "Geen email ontvangen." });
  }

  const { data: user } = await supabase
    .from("Leden")
    .select("id, naam, email, adres, gemeente, telefoon")
    .eq("email", email)
    .single();

  if (!user) {
    return res.json({ ok: false, error: "Lid niet gevonden." });
  }

  res.json({ ok: true, user });
});

app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: "API route niet gevonden" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "Serverfout" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server draait op poort " + PORT);
});
