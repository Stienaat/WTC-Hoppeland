import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// Alleen leden of admin
function requireMemberOrAdmin(req, res, next) {
   if (!req.session?.user && !req.session?.is_admin)
        return res.status(403).json({ error: "Niet ingelogd" });
    }
    next();


router.use(requireMemberOrAdmin);

/* ============================
   GET – signups voor 1 event
   ============================ */
router.get("/", async (req, res) => {
    const eventId = req.query.event_id;
    if (!eventId) return res.json({ signups: [] });

    // 1. Haal signups op
    const { data: signups, error } = await supabase
        .from("signups")
        .select("id, member_id, paid, payment_method, payment_reference, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // 2. Haal leden op
    const memberIds = [...new Set(signups.map(s => s.member_id))];

    const { data: leden } = await supabase
        .from("Leden")
        .select("id, naam, email")
        .in("id", memberIds);

    const ledenMap = {};
    leden.forEach(l => {
        ledenMap[l.id] = {
            name: l.naam,
            email: l.email
        };
    });

    // 3. Bouw structuur die frontend verwacht
    const result = signups.map(s => ({
        id: s.id,
        created_at: s.created_at,
        paid: s.paid,
        method: s.payment_method || "",
        reference: s.payment_reference || "",
        Leden: ledenMap[s.member_id] || { name: "", email: "" }
    }));

    res.json({ signups: result });
});


/* ============================
   POST – update / delete / cleanup
   ============================ */
router.post("/", async (req, res) => {
    const body = req.body;
    const action = body.action;

    /* UPDATE */
    if (action === "update") {
        const { error } = await supabase
            .from("signups")
            .update({
                paid: body.paid === "true",
                payment_method: body.payment_method.trim(),
                payment_reference: body.payment_reference.trim()
            })
            .eq("id", body.signup_id);   // FIX

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ ok: true });
    }

    /* DELETE */
    if (action === "delete") {
        const { error } = await supabase
            .from("signups")
            .delete()
            .eq("id", body.signup_id);   // FIX

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ ok: true });
    }

    /* CLEANUP */
    if (action === "cleanup") {
        const now = new Date().toISOString();

        const { data: oldEvents } = await supabase
            .from("events")
            .select("id")
            .lt("start", now);

        const ids = oldEvents.map(ev => ev.id);

        if (ids.length) {
            await supabase.from("events").delete().in("id", ids);
        }

        return res.json({ ok: true });
    }

    res.status(400).json({ error: "Onbekende actie" });
});

/* ============================
   EXPORT
   ============================ */
import ExcelJS from "exceljs";

router.get("/export", async (req, res) => {
    const eventId = req.query.event_id;
    if (!eventId) return res.status(400).send("Geen event_id");

    const { data: signups } = await supabase
        .from("signups")
        .select("id, member_id, paid, payment_method, payment_reference, created_at")
        .eq("event_id", eventId);

    const memberIds = [...new Set(signups.map(s => s.member_id))];

    const { data: leden } = await supabase
        .from("Leden")
        .select("id, naam, email")
        .in("id", memberIds);

    const ledenMap = {};
    leden.forEach(l => {
        ledenMap[l.id] = { name: l.naam, email: l.email };
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inschrijvingen");

    ws.addRow(["Naam", "Email", "Betaald", "Methode", "Referentie", "Ingeschreven"]);

    signups.forEach(s => {
        const lid = ledenMap[s.member_id] || { name: "", email: "" };
        ws.addRow([
            lid.name,
            lid.email,
            s.paid ? "Ja" : "Nee",
            s.payment_method,
            s.payment_reference,
            s.created_at
        ]);
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="inschrijvingen.xlsx"');

    await wb.xlsx.write(res);
    res.end();
});

export default router;
