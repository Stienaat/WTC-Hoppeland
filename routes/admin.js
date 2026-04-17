import express from "express";
import { requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/config", async (req, res) => {
  const supabase = req.supabase;

  try {
    const { data, error } = await supabase
      .from("Config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return res.json({
      ok: true,
      config: {
        vereniging: {
          naam: data?.vereniging_naam || "",
          iban: data?.vereniging_iban || "",
          bic: data?.vereniging_bic || "",
          med: data?.vereniging_med || ""
        }
      }
    });
  } catch (err) {
    console.error("ADMIN CONFIG GET ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/config", requireAdmin, async (req, res) => {
  const supabase = req.supabase;

  try {
    const body = req.body || {};
    const vereniging = body.vereniging || body;

    const naam = String(vereniging.naam || "").trim();
    const iban = String(vereniging.iban || "").trim();
    const bic = String(vereniging.bic || "").trim();
    const med = String(vereniging.med || "").trim();

    const { data: existing, error: findError } = await supabase
      .from("Config")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;

    let result;
    let error;

    if (existing?.id) {
      ({ data: result, error } = await supabase
        .from("Config")
        .update({
          vereniging_naam: naam,
          vereniging_iban: iban,
          vereniging_bic: bic,
          vereniging_med: med
        })
        .eq("id", existing.id)
        .select());
    } else {
      ({ data: result, error } = await supabase
        .from("Config")
        .insert({
          vereniging_naam: naam,
          vereniging_iban: iban,
          vereniging_bic: bic,
          vereniging_med: med
        })
        .select());
    }

    if (error) throw error;

    return res.json({ ok: true, saved: result });
  } catch (err) {
    console.error("ADMIN CONFIG SAVE ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/login", async (req, res) => {
  const supabase = req.supabase;
  const pin = String(req.body?.pin || "").trim();

  if (!/^\d{6}$/.test(pin)) {
    return res.json({ ok: false, message: "PIN moet 6 cijfers zijn." });
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

    req.session.is_admin = true;

    return res.json({ ok: true, message: "PIN OK" });
  } catch (err) {
    return res.json({ ok: false, message: "Serverfout." });
  }
});

router.post("/change-pin", requireAdmin, async (req, res) => {
  const supabase = req.supabase;
  const oldPin = String(req.body?.oldPin || "").trim();
  const newPin = String(req.body?.newPin || "").trim();

  if (!/^\d{6}$/.test(oldPin) || !/^\d{6}$/.test(newPin)) {
    return res.json({ ok: false, message: "Beide PINs moeten 6 cijfers zijn." });
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

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;