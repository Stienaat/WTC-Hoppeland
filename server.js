const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const upload = multer();


const NOTICE_PATH = path.join(__dirname, "public", "notice.md");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use("/api/events", events);
app.use("/api/signups", signups);
app.use("/api/leden", ledenRoutes);
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({secret: process.env.SESSION_SECRET || "change-this-session-secret",
    resave: false, saveUninitialized: false, cookie: {
      httpOnly: true, sameSite: "lax", secure: false}
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

// BEWAREN
app.post("/api/notice", upload.none(), async (req, res) => {
  try {
    const { text = "" } = req.body;
    await fs.writeFile(NOTICE_PATH, text, "utf8");
    res.json({ ok: true });
  } catch (err) {
    console.error("Notice save error:", err);
    res.json({ ok: false, error: "Kon mededelingen niet bewaren." });
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

    res.json({ok: true, user: {d: user.id,
        email: user.email,
        naam: user.naam
      }
    });
  } catch (err) {
 
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

    // 1. Haal signups op
    const { data: signups, error: signupsError } = await supabase
      .from("signups")
      .select("id, created_at, member_id, event_id, paid, payment_method, payment_reference")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (signupsError) throw signupsError;

    // 2. Verzamel alle member_ids
    const memberIds = [...new Set(signups.map(s => s.member_id).filter(Boolean))];

    // 3. Haal leden op
    let ledenById = {};
    if (memberIds.length) {
      const { data: leden, error: ledenError } = await supabase
        .from("Leden")
        .select("id, naam, email");

      if (ledenError) throw ledenError;

      leden.forEach(l => {
        ledenById[l.id] = {
          name: l.naam,
          email: l.email
        };
      });
    }

    // 4. Bouw structuur die jouw frontend verwacht
    const result = signups.map(s => ({
      id: s.id,
      created_at: s.created_at,
      method: s.payment_method || "",
      reference: s.payment_reference || "",
      paid: !!s.paid,
      Leden: ledenById[s.member_id] || { name: "", email: "" }
    }));

    res.json({ ok: true, signups: result });

  } catch (err) {
    console.error("GET /api/signups ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.post("/api/signups", requireAuth, async (req, res) => {
  try {
    if (isAdmin(req)) {
      return res.status(403).json({ ok: false, error: "NOT_ALLOWED_FOR_ADMIN" });
    }

    const eventId = req.body?.event_id;
    if (!eventId) {
      return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
    }

    const member = await getCurrentMember(req);
    if (!member) {
      return res.status(404).json({ ok: false, error: "MEMBER_NOT_FOUND" });
    }

    const existing = await getSignupByMemberAndEvent(member.id, eventId);
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
          created_at: existing.created_at
        }
      });
    }

    const insertPayload = {
      member_id: member.id,
      event_id: eventId,
      paid: false,
      status: "pending",
      payment_method: null,
      payment_reference: null
    };

   const { data, error } = await supabase
	  .from("signups")
	  .insert(insertPayload)
	  .select("id, member_id, event_id, paid, status, payment_method, payment_reference, created_at")
	  .single();


   const signup = data;

res.json({
  ok: true,
  signup: {
    id: signup.id,
    signup_id: signup.id,
    member_id: member.id,
    event_id: eventId,
    name: member.naam,
    email: member.email,
    phone: member.telefoon || "",
    status: signup.status || "pending",
    paid: !!signup.paid,
    payment_method: signup.payment_method,
    payment_reference: signup.payment_reference,
    created_at: signup.created_at
  }
});

  } catch (err) {
    console.error("POST /api/signups ERROR:", err);
    res.status(500).json({ ok: false, error: err.message || "SERVER_ERROR" });
  }
});

app.delete("/api/signups", requireAuth, async (req, res) => {
  try {
    if (isAdmin(req)) {
      return res.status(403).json({ ok: false, error: "NOT_ALLOWED_FOR_ADMIN" });
    }

    const eventId = req.body?.event_id;
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

    const eventId = req.body?.event_id;
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

    const { data, error } = await supabase
      .from("signups")
      .update({ status: "confirmed" })
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

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok: false, error: "NO_FIELDS_TO_UPDATE" });
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


function readJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    const raw = fs.readFileSync(pathname, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j) || typeof j === "object" ? j : fallback;
  } catch {
    return fallback;
  }
}

/* =====================================
   SERVER START
   ===================================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server draait op poort " + PORT);
});


