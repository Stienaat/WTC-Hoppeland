import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// ============================
// GET admin config
// ============================
router.get("/config", async (req, res) => {
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
          bic: data?.vereniging_bic || "",
          med: data?.vereniging_med || ""
        }
      }
    });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ============================
// SAVE admin config
// ============================
router.post("/config", async (req, res) => {
  try {
    const { vereniging } = req.body || {};

    const naam = vereniging?.naam || "";
    const iban = vereniging?.iban || "";
    const bic = vereniging?.bic || "";
    const med = vereniging?.med || "";

    const { error } = await supabase
      .from("Config")
      .upsert({
        id: 1,
        vereniging_naam: naam,
        vereniging_iban: iban,
        vereniging_bic: bic,
        vereniging_med: med
      });

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

export default router;