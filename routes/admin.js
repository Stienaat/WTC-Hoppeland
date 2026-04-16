import express from "express";

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

router.post("/config", async (req, res) => {
  const supabase = req.supabase;

  try {
    const body = req.body || {};
    const vereniging = body.vereniging || body;

    const naam = vereniging.naam || "";
    const iban = vereniging.iban || "";
    const bic = vereniging.bic || "";
    const med = vereniging.med || "";

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

export default router;

// ============================
// POST admin login
// ============================
router.post("/login", async (req, res) => {
  const supabase = req.supabase;
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

// ============================
// POST admin pin wijzigen
// ============================
router.post("/change-pin", async (req, res) => {
  const supabase = req.supabase;
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