import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// ============================
// GET admin config
// ============================
router.get("/config", async (req, res) => {
  const supabase = req.supabase;
console.log("ADMIN CONFIG DATA:", data);
console.log("ADMIN CONFIG ERROR:", error);
// ============================
// SAVE admin config
// ============================
router.post("/config", async (req, res) => {

console.log("BODY:", req.body);
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