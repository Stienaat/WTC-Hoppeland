import express from "express";
import { requireAdmin } from "../middleware/auth.js";


const router = express.Router();

async function findMemberByEmail(supabase, email) {
  if (!email) return { member: null, error: "email verplicht" };

  const { data: member, error } = await supabase
    .from("Leden")
    .select("id, naam, email")
    .eq("email", email)
    .single();

  if (error || !member) {
    return { member: null, error: "Lid niet gevonden." };
  }

  return { member, error: null };
}

// ============================
// GET /api/signups?event_id=...
// ============================
router.get("/", async (req, res) => {
  const supabase = req.supabase;
  const eventId = req.query.event_id;

  if (!eventId) {
    return res.status(400).json({ ok: false, error: "event_id verplicht" });
  }

  try {
    const { data: signups, error: sErr } = await supabase
      .from("signups")
      .select("*")
      .eq("event_id", eventId);

    if (sErr) throw sErr;

    const { data: leden, error: lErr } = await supabase
      .from("Leden")
      .select("id, naam, email");

    if (lErr) throw lErr;

    const mapped = (signups || []).map((s) => {
      const lid = (leden || []).find((l) => l.id === s.member_id) || {};
      return {
        id: s.id,
        name: lid.naam || "",
        email: lid.email || "",
        status: s.status || ""
      };
    });

    return res.json(mapped);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ===================================
// GET /api/signups/status
// ===================================
router.get("/status", async (req, res) => {
  const supabase = req.supabase;
  const { email, event_id } = req.query;

  if (!email || !event_id) {
    return res.json({ ok: false, error: "email en event_id verplicht" });
  }

  try {
    const { member, error } = await findMemberByEmail(supabase, email);

    if (error || !member) {
      return res.json({ ok: true, signed_up: false });
    }

    const { data: signup, error: signupError } = await supabase
      .from("signups")
      .select("*")
      .eq("member_id", member.id)
      .eq("event_id", event_id)
      .maybeSingle();

    if (signupError || !signup) {
      return res.json({ ok: true, signed_up: false });
    }

    return res.json({
      ok: true,
      signed_up: true,
      status: signup.status || "pending"
    });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
});

// ============================
// POST /api/signups
// ============================
router.post("/", async (req, res) => {
  const supabase = req.supabase;
  const { action } = req.body;

  // =====================
  // UPDATE
  // =====================
  if (action === "update") {
    const { signup_id, status, payment_method, payment_reference } = req.body;

    const { error } = await supabase
      .from("signups")
      .update({
        status,
        payment_method,
        payment_reference
      })
      .eq("id", signup_id);

    if (error) {
      return res.json({ ok: false, error: "Update mislukt" });
    }

    return res.json({ ok: true });
  }

  // =====================
  // DELETE
  // =====================
  if (action === "delete") {
    const { signup_id } = req.body;

    const { error } = await supabase
      .from("signups")
      .delete()
      .eq("id", signup_id);

    if (error) {
      return res.json({ ok: false, error: "Verwijderen mislukt" });
    }

    return res.json({ ok: true });
  }

  // =====================
  // CREATE (jouw bestaande code)
  // =====================
  const { email, event_id } = req.body;

  if (!email || !event_id) {
    return res.json({ ok: false, message: "email en event_id verplicht" });
  }

  try {
    const { member, error } = await findMemberByEmail(supabase, email);

    if (error || !member) {
      return res.json({ ok: false, message: "Lid niet gevonden." });
    }

    const { data: existing } = await supabase
      .from("signups")
      .select("*")
      .eq("member_id", member.id)
      .eq("event_id", event_id)
      .maybeSingle();

    if (existing) {
      return res.json({
        ok: true,
        signup: {
          event_id,
          email: member.email,
          name: member.naam,
          status: existing.status || "pending"
        }
      });
    }

    const { error: insertError } = await supabase
      .from("signups")
      .insert([{ member_id: member.id, event_id, status: "pending" }]);

    if (insertError) {
      return res.json({ ok: false, message: "Inschrijving mislukt." });
    }

    return res.json({
      ok: true,
      signup: {
        event_id,
        email: member.email,
        name: member.naam,
        status: "pending"
      }
    });
  } catch (err) {
    return res.json({ ok: false, message: "Serverfout." });
  }
});
// ============================
// DELETE /api/signups
// ============================
router.delete("/", async (req, res) => {
  const supabase = req.supabase;
  const { email, event_id } = req.body;

  if (!email || !event_id) {
    return res.json({ ok: false, message: "email en event_id verplicht" });
  }

  try {
    const { member, error } = await findMemberByEmail(supabase, email);

    if (error || !member) {
      return res.json({ ok: false, message: "Lid niet gevonden." });
    }

    const { error: deleteError } = await supabase
      .from("signups")
      .delete()
      .eq("member_id", member.id)
      .eq("event_id", event_id);

    if (deleteError) {
      return res.json({ ok: false, message: "Annuleren mislukt." });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.json({ ok: false, message: "Serverfout." });
  }
});

// ===================================
// POST /api/signups/commit
// ===================================
router.post("/commit", requireAdmin, async (req, res) => {
  const supabase = req.supabase;
  const { email, event_id } = req.body;

  if (!email || !event_id) {
    return res.json({ ok: false, message: "email en event_id verplicht" });
  }

  try {
    const { member, error } = await findMemberByEmail(supabase, email);

    if (error || !member) {
      return res.json({ ok: false, message: "Lid niet gevonden." });
    }

    const { data: signup, error: findError } = await supabase
      .from("signups")
      .select("*")
      .eq("member_id", member.id)
      .eq("event_id", event_id)
      .maybeSingle();

    if (findError || !signup) {
      return res.json({ ok: false, message: "Geen inschrijving gevonden." });
    }

    const { error: updateError } = await supabase
      .from("signups")
      .update({ status: "confirmed" })
      .eq("id", signup.id);

    if (updateError) {
      return res.json({ ok: false, message: "Commit mislukt." });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.json({ ok: false, message: "Serverfout." });
  }
});

export default router;