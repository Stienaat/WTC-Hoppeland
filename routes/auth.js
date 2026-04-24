import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";

const router = express.Router();
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/register", async (req, res) => {
  const supabase = req.supabase;
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

    return res.json({ ok: true });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
});

router.post("/login", async (req, res) => {
  const supabase = req.supabase;
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

    return res.json({ ok: true, user });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.json({ ok: false, error: "Technische fout" });
  }
});

router.get("/api/me", async (req, res) => {
  const supabase = req.supabase;
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

  return res.json({ ok: true, user });
});

export default router;

router.post("/forgot-password", async (req, res) => {
  const supabase = req.supabase;
  const email = String(req.body?.email || "").trim().toLowerCase();

  if (!email) {
    return res.json({ ok: true });
  }

  try {
    const { data: user } = await supabase
      .from("Leden")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    // Niet verklappen of email bestaat
    if (!user) {
      return res.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await supabase
      .from("password_resets")
      .insert({
        email,
        token_hash: tokenHash,
        expires_at: expiresAt
      });

    const link = `${process.env.SITE_URL}/reset.html?token=${token}`;

    await mailer.sendMail({
      from: `"WTC" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: "Paswoord herstellen",
      text: `Klik op deze link om je paswoord te herstellen:\n\n${link}\n\nDeze link blijft 1 uur geldig.`
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.json({ ok: false, error: "Mail verzenden mislukt." });
  }
});

router.post("/reset-password", async (req, res) => {
  const supabase = req.supabase;
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!token || password.length < 6) {
    return res.json({ ok: false, error: "Ongeldige aanvraag." });
  }

  try {
    const tokenHash = hashToken(token);

    const { data: reset, error } = await supabase
      .from("password_resets")
      .select("*")
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .maybeSingle();

    if (error || !reset) {
      return res.json({ ok: false, error: "Link is ongeldig." });
    }

    if (new Date(reset.expires_at) < new Date()) {
      return res.json({ ok: false, error: "Link is verlopen." });
    }

    const hash = await bcrypt.hash(password, 10);

    const { error: updateError } = await supabase
      .from("Leden")
      .update({ wachtwoord: hash })
      .eq("email", reset.email);

    if (updateError) throw updateError;

    await supabase
      .from("password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("id", reset.id);

    return res.json({ ok: true });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.json({ ok: false, error: "Reset mislukt." });
  }
});