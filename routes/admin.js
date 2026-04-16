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