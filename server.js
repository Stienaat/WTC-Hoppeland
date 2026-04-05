import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import multer from "multer";
import session from "express-session";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const upload = multer();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.static(path.join(__dirname, "public")));

/* =====================================
   HELPERS
   ===================================== */
function getSessionUser(req) {
  return req.session?.user || null;
}

function isAdmin(req) {
  return !!req.session?.is_admin;
}

function requireAuth(req, res, next) {
  if (!getSessionUser(req) && !isAdmin(req)) {
    return res.status(401).json({ ok: false, error: "NOT_AUTHENTICATED" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(403).json({ ok: false, error: "NOT_ADMIN" });
  }
  next();
}

function requireKalenderPage(req, res, next) {
  if (!getSessionUser(req) && !isAdmin(req)) {
    return res.redirect("/leden.html?msg=notknown");
  }
  next();
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function parsePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

async function getConfigRow() {
  const { data, error } = await supabase
    .from("Config")
    .select("id, iban, bic, creditor_name")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || { iban: "", bic: "", creditor_name: "" };
}

async function getCurrentMember(req) {
  const user = getSessionUser(req);
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from("Leden")
    .select("id, naam, email, telefoon")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getSignupByMemberAndEvent(memberId, eventId) {
  const { data, error } = await supabase
    .from("signups")
    .select("*")
    .eq("member_id", memberId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function mapEventRow(row, config) {
  const datum = String(row.start || "").slice(0, 10);
  return {
    ...row,
    mandatory: !!row.mandatory,
    paid: !!row.paid,
    requires_signup: !!row.requires_signup,
    price: parsePrice(row.price),
    qr_text: buildEpcQrText(
      config.creditor_name || "",
      config.iban || "",
      config.bic || "",
      parsePrice(row.price),
      `bet :${row.title || ""} dd ${datum}`,
      ""
    )
  };
}

/* =====================================
   HOME + PAGES
   ===================================== */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/kalender", requireKalenderPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "kalender.html"));
});

/* =====================================
   NOTICE
   ===================================== */
app.get("/notice", async (req, res) => {
  try {
    const filePath = path.join(__dirname, "data", "notice.md");
    const data = await fs.readFile(filePath, "utf8");
    res.send(data);
  } catch {
    res.status(500).send("Kon mededelingen niet laden.");
  }
});

app.post("/notice", upload.none(), async (req, res) => {
  try {
    const { text = "" } = req.body;
    const filePath = path.join(__dirname, "data", "notice.md");
    await fs.writeFile(filePath, text, "utf8");
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

/* =====================================
   AUTH
   ===================================== */
app.post("/register", async (req, res) => {
  const { naam, adres, gemeente, telefoon, email, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    const { error } = await supabase.from("Leden").insert({
      naam,
      adres,
      gemeente,
      telefoon,
      email: String(email || "").trim().toLowerCase(),
      wachtwoord: hash
    });

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try {
    const { data: user, error } = await supabase
      .from("Leden")
      .select("id, naam, email, wachtwoord")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return res.json({ ok: false, error: "Onbekend emailadres." });
    }

    const ok = await bcrypt.compare(password, user.wachtwoord || "");
    if (!ok) {
      return res.json({ ok: false, error: "Fout wachtwoord." });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      naam: user.naam
    };
    req.session.is_admin = false;

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        naam: user.naam
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.json({ ok: false, error: "Technische fout" });
  }
});

app.post("/admin-login", async (req, res) => {
  const pin = String(req.body.pin || "").trim();

  if (!pin) {
    return res.json({ ok: false, message: "PIN verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("admin")
      .select("id, pin")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    if (!data || String(data.pin) !== pin) {
      return res.json({ ok: false, message: "PIN fout." });
    }

    req.session.user = {
      id: null,
      email: null,
      naam: "Beheerder"
    };
    req.session.is_admin = true;

    return res.json({ ok: true, message: "PIN OK" });
  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);
    return res.json({ ok: false, message: "Serverfout." });
  }
});

app.post("/admin-change-pin", requireAdmin, async (req, res) => {
  const oldPin = String(req.body.oldPin || "").trim();
  const newPin = String(req.body.newPin || "").trim();

  if (!oldPin || !newPin) {
    return res.json({ ok: false, message: "Beide PINs verplicht." });
  }

  try {
    const { data, error } = await supabase
      .from("admin")
      .select("id, pin")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    if (!data || String(data.pin) !== oldPin) {
      return res.json({ ok: false, message: "Oude PIN fout." });
    }

    const { error: updateError } = await supabase
      .from("admin")
      .update({ pin: newPin })
      .eq("id", 1);

    if (updateError) throw updateError;

    return res.json({ ok: true, message: "PIN gewijzigd." });
  } catch (err) {
    console.error("ADMIN CHANGE PIN ERROR:", err);
    return res.json({ ok: false, message: "Serverfout." });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/me", async (req, res) => {
  try {
    if (isAdmin(req)) {
      return res.json({
        ok: true,
        is_admin: true,
        user: {
          id: null,
          email: null,
          naam: "Beheerder"
        }
      });
    }

    const user = getSessionUser(req);
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: "NOT_AUTHENTICATED" });
    }

    const member = await getCurrentMember(req);
    if (!member) {
      return res.status(404).json({ ok: false, error: "MEMBER_NOT_FOUND" });
    }

    return res.json({
      ok: true,
      is_admin: false,
      user: {
        id: member.id,
        email: member.email,
        naam: member.naam,
        telefoon: member.telefoon || ""
      }
    });
  } catch (err) {
    console.error("/api/me ERROR:", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

/* =====================================
   CONTACT
   ===================================== */
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, street, zip, city, message, consent } = req.body;

    const { error } = await supabase.from("forms").insert([
      {
        name,
        email: String(email || "").toLowerCase(),
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
  } catch {
    return res.json({ ok: false, error: "Server error" });
  }
});

/* =====================================
   EVENTS API
   ===================================== */
app.get("/api/events", requireAuth, async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from("events")
      .select("id, created_at, title, start, end, info, mandatory, paid, price, requires_signup")
      .order("start", { ascending: true });

    if (error) throw error;

    const config = await getConfigRow();
    const result = (events || []).map((row) => mapEventRow(row, config));

    res.json(result);
  } catch (err) {
    console.error("GET /api/events ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.post("/api/events", requireAdmin, async (req, res) => {
  try {
    const payload = {
      title: String(req.body.title || "").trim(),
      start: req.body.start || null,
      end: req.body.end || null,
      info: String(req.body.info || "").trim(),
      mandatory: normalizeBoolean(req.body.mandatory),
      paid: normalizeBoolean(req.body.paid),
      price: parsePrice(req.body.price),
      requires_signup: normalizeBoolean(req.body.requires_signup)
    };

    if (!payload.title || !payload.start || !payload.end) {
      return res.status(400).json({ ok: false, error: "title/start/end ontbreken" });
    }

    const { data, error } = await supabase
      .from("events")
      .insert(payload)
      .select("id, created_at, title, start, end, info, mandatory, paid, price, requires_signup")
      .single();

    if (error) throw error;

    const config = await getConfigRow();
    res.json(mapEventRow(data, config));
  } catch (err) {
    console.error("POST /api/events ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.put("/api/events/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const payload = {
      title: String(req.body.title || "").trim(),
      start: req.body.start || null,
      end: req.body.end || null,
      info: String(req.body.info || "").trim(),
      mandatory: normalizeBoolean(req.body.mandatory),
      paid: normalizeBoolean(req.body.paid),
      price: parsePrice(req.body.price),
      requires_signup: normalizeBoolean(req.body.requires_signup)
    };

    const { data, error } = await supabase
      .from("events")
      .update(payload)
      .eq("id", id)
      .select("id, created_at, title, start, end, info, mandatory, paid, price, requires_signup")
      .single();

    if (error) throw error;

    const config = await getConfigRow();
    res.json({ ok: true, event: mapEventRow(data, config) });
  } catch (err) {
    console.error("PUT /api/events/:id ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.delete("/api/events/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/events/:id ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

/* =====================================
   SIGNUPS API
   ===================================== */
app.get("/api/signups/status", requireAuth, async (req, res) => {
  try {
    if (isAdmin(req)) {
      return res.json({ ok: true, signed_up: false, status: null, paid: false });
    }

    const eventId = req.query.event_id;
    if (!eventId) {
      return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
    }

    const member = await getCurrentMember(req);
    if (!member) {
      return res.status(404).json({ ok: false, error: "MEMBER_NOT_FOUND" });
    }

    const signup = await getSignupByMemberAndEvent(member.id, eventId);
    if (!signup) {
      return res.json({ ok: true, signed_up: false });
    }

    return res.json({
      ok: true,
      signed_up: true,
      status: signup.status || "pending",
      paid: !!signup.paid
    });
  } catch (err) {
    console.error("GET /api/signups/status ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.get("/api/signups", requireAdmin, async (req, res) => {
  try {
    const eventId = req.query.event_id;
    if (!eventId) {
      return res.status(400).json({ ok: false, error: "event_id verplicht" });
    }

    const { data: signups, error: signupsError } = await supabase
      .from("signups")
      .select("id, created_at, member_id, event_id, paid, status, confirmed_at, payment_method, payment_reference")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (signupsError) throw signupsError;

    const memberIds = [...new Set((signups || []).map((s) => s.member_id).filter(Boolean))];
    let ledenById = new Map();

    if (memberIds.length) {
      const { data: leden, error: ledenError } = await supabase
        .from("Leden")
        .select("id, naam, email, telefoon")
        .in("id", memberIds);

      if (ledenError) throw ledenError;
      ledenById = new Map((leden || []).map((l) => [l.id, l]));
    }

    const result = (signups || []).map((s) => {
      const lid = ledenById.get(s.member_id) || {};
      return {
        id: s.id,
        signup_id: s.id,
        member_id: s.member_id,
        event_id: s.event_id,
        name: lid.naam || "",
        email: lid.email || "",
        phone: lid.telefoon || "",
        status: s.status || "pending",
        paid: !!s.paid,
        confirmed_at: s.confirmed_at,
        payment_method: s.payment_method,
        payment_reference: s.payment_reference,
        created_at: s.created_at
      };
    });

    res.json({ ok: true, signups: result });
  } catch (err) {
    console.error("GET /api/signups ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.post("/api/signups", requireAuth, async (req, res) => {
  try {
    console.log("POST /api/signups hit");
    console.log("req.body:", req.body);
    console.log("req.session:", req.session);

    if (isAdmin(req)) {
      console.log("Blocked: admin user");
      return res.status(403).json({ ok: false, error: "NOT_ALLOWED_FOR_ADMIN" });
    }

    const eventId = req.body?.event_id;
    console.log("eventId:", eventId);

    if (!eventId) {
      console.log("Blocked: invalid event id");
      return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
    }

    const member = await getCurrentMember(req);
    console.log("member:", member);

    if (!member) {
      console.log("Blocked: member not found");
      return res.status(404).json({ ok: false, error: "MEMBER_NOT_FOUND" });
    }

    const existing = await getSignupByMemberAndEvent(member.id, eventId);
    console.log("existing signup:", existing);

    if (existing) {
      return res.json({
        ok: true,
        signup: {
          id: existing.id,
          signup_id: existing.id,
          member_id: member.id,
          event_id: eventId,
          name: member.naam,
          email: member.email,
          phone: member.telefoon || "",
          status: existing.status || "pending",
          paid: !!existing.paid,
          payment_method: existing.payment_method,
          payment_reference: existing.payment_reference,
          confirmed_at: existing.confirmed_at,
          created_at: existing.created_at
        }
      });
    }

    const insertPayload = {
      member_id: member.id,
      event_id: eventId,
      paid: false,
      status: "pending",
      confirmed_at: null,
      payment_method: null,
      payment_reference: null
    };

    console.log("insertPayload:", insertPayload);

    const { data, error } = await supabase
      .from("signups")
      .insert(insertPayload)
      .select("id, created_at, member_id, event_id, paid, status, confirmed_at, payment_method, payment_reference")
      .single();

    console.log("supabase insert data:", data);
    console.log("supabase insert error:", error);

    if (error) throw error;

    res.json({
      ok: true,
      signup: {
        id: data.id,
        signup_id: data.id,
        member_id: data.member_id,
        event_id: data.event_id,
        name: member.naam,
        email: member.email,
        phone: member.telefoon || "",
        status: data.status || "pending",
        paid: !!data.paid,
        payment_method: data.payment_method,
        payment_reference: data.payment_reference,
        confirmed_at: data.confirmed_at,
        created_at: data.created_at
      }
    });
  } catch (err) {
    console.error("POST /api/signups ERROR full:", err);
    console.error("POST /api/signups ERROR message:", err?.message);
    console.error("POST /api/signups ERROR stack:", err?.stack);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.delete("/api/signups", requireAuth, async (req, res) => {
  try {
    if (isAdmin(req)) {
      return res.status(403).json({ ok: false, error: "NOT_ALLOWED_FOR_ADMIN" });
    }

    const eventId = req.body.event_id;
    if (!eventId) {
      return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
    }

    const member = await getCurrentMember(req);
    if (!member) {
      return res.status(404).json({ ok: false, error: "MEMBER_NOT_FOUND" });
    }

    const { error } = await supabase
      .from("signups")
      .delete()
      .eq("member_id", member.id)
      .eq("event_id", eventId);

    if (error) throw error;

    res.json({ ok: true, msg: "deleted" });
  } catch (err) {
    console.error("DELETE /api/signups ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.post("/api/signups/commit", requireAuth, async (req, res) => {
  try {
    if (isAdmin(req)) {
      return res.status(403).json({ ok: false, error: "NOT_ALLOWED_FOR_ADMIN" });
    }

    const eventId = req.body.event_id;
    if (!eventId) {
      return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
    }

    const member = await getCurrentMember(req);
    if (!member) {
      return res.status(404).json({ ok: false, error: "MEMBER_NOT_FOUND" });
    }

    const existing = await getSignupByMemberAndEvent(member.id, eventId);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "SIGNUP_NOT_FOUND" });
    }

    if (existing.status === "confirmed") {
      return res.json({ ok: true, data: existing, note: "ALREADY_CONFIRMED" });
    }

    if (existing.status !== "pending") {
      return res.status(400).json({ ok: false, error: "NOT_PENDING", current: existing });
    }

    const confirmedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("signups")
      .update({ status: "confirmed", confirmed_at: confirmedAt })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    console.error("POST /api/signups/commit ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.patch("/api/signups/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const payload = {};

    if ("status" in req.body) payload.status = req.body.status;
    if ("paid" in req.body) payload.paid = normalizeBoolean(req.body.paid);
    if ("payment_method" in req.body) payload.payment_method = req.body.payment_method || null;
    if ("payment_reference" in req.body) payload.payment_reference = req.body.payment_reference || null;
    if ("confirmed_at" in req.body) payload.confirmed_at = req.body.confirmed_at || null;

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok: false, error: "NO_FIELDS_TO_UPDATE" });
    }

    if (payload.status === "confirmed" && !("confirmed_at" in payload)) {
      payload.confirmed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("signups")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    res.json({ ok: true, signup: data });
  } catch (err) {
    console.error("PATCH /api/signups/:id ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.delete("/api/signups/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { error } = await supabase.from("signups").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/signups/:id ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

/* =====================================
   LEGACY COMPATIBILITY ROUTES
   Handig zolang de bestaande frontend nog niet volledig aangepast is.
   ===================================== */
app.get("/events", requireAuth, async (req, res) => {
  req.url = "/api/events";
  app.handle(req, res);
});

app.get("/signup-status", requireAuth, async (req, res) => {
  req.url = "/api/signups/status?event_id=" + encodeURIComponent(req.query.event_id || "");
  app.handle(req, res);
});

app.post("/signup", upload.none(), requireAuth, async (req, res) => {
  req.body = { event_id: req.body.event_id };
  return app._router.handle({ ...req, method: "POST", url: "/api/signups" }, res, () => {});
});

app.post("/cancel", upload.none(), requireAuth, async (req, res) => {
  req.body = { event_id: req.body.event_id };
  return app._router.handle({ ...req, method: "DELETE", url: "/api/signups" }, res, () => {});
});

/* =====================================
   SERVER START
   ===================================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server draait op poort " + PORT);
});
