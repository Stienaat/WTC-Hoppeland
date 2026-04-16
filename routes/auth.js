import express from "express";
import bcrypt from "bcryptjs";

const router = express.Router();

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