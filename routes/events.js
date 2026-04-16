import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// helper voor QR (kopie uit server.js)
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

// ============================
// GET events
// ============================
router.get("/", async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .order("start", { ascending: true });

    if (error) throw error;

    const { data: cfg } = await supabase
      .from("Config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const iban = cfg?.vereniging_iban || "";
    const bic = cfg?.vereniging_bic || "";
    const name = cfg?.vereniging_naam || "";

    const withQr = (events || []).map((ev) => {
      const datum = (ev.start || "").slice(0, 10);

      const qr_text = buildEpcQrText(
        name,
        iban,
        bic,
        ev.price || 0,
        `bet :${ev.title || ""} dd ${datum}`,
        ""
      );

      return { ...ev, qr_text };
    });

    res.json(withQr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// CREATE event
// ============================
router.post("/", async (req, res) => {
  try {
    const payload = {
      title: req.body.title || "",
      start: req.body.start,
      end: req.body.end,
      info: req.body.info || "",
      requires_signup: !!req.body.requires_signup,
      mandatory: !!req.body.mandatory,
      paid: !!req.body.paid,
      price: Number(req.body.price || 0)
    };

    const { data, error } = await supabase
      .from("events")
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, event: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================
// UPDATE event
// ============================
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const payload = {
      title: req.body.title || "",
      start: req.body.start,
      end: req.body.end,
      info: req.body.info || "",
      requires_signup: !!req.body.requires_signup,
      mandatory: !!req.body.mandatory,
      paid: !!req.body.paid,
      price: Number(req.body.price || 0)
    };

    const { data, error } = await supabase
      .from("events")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, event: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================
// DELETE event
// ============================
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;