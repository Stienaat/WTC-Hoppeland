import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// Alleen leden of admin
function requireMemberOrAdmin(req, res, next) {
    if (!req.session?.gebruiker?.email && !req.session?.is_admin) {
        return res.status(403).json({ error: "Niet ingelogd" });
    }
    next();
}

router.use(requireMemberOrAdmin);

/* ============================
   GET – signups voor 1 event
   ============================ */
router.get("/", async (req, res) => {
    const eventId = req.query.event_id;
    if (!eventId) return res.json({ signups: [] });

    const { data, error } = await supabase
        .from("signups")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json({ signups: data });
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
            .eq("signup_id", body.signup_id);

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ ok: true });
    }

    /* DELETE */
    if (action === "delete") {
        const { error } = await supabase
            .from("signups")
            .delete()
            .eq("signup_id", body.signup_id);

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ ok: true });
    }

    /* CLEANUP */
    if (action === "cleanup") {
        const now = new Date().toISOString();

        // Zoek oude events
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

export default router;
import ExcelJS from "exceljs";

router.get("/export", async (req, res) => {
    const eventId = req.query.event_id;
    if (!eventId) return res.status(400).send("Geen event_id");

    const { data: signups, error } = await supabase
        .from("signups")
        .select("*")
        .eq("event_id", eventId);

    if (error) return res.status(500).send(error.message);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inschrijvingen");

    ws.addRow(["Naam", "Email", "Betaald", "Methode", "Referentie", "Ingeschreven"]);

    signups.forEach(s => {
        ws.addRow([
            s.name,
            s.email,
            s.paid ? "Ja" : "Nee",
            s.payment_method,
            s.payment_reference,
            s.created_at
        ]);
    });

    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
        "Content-Disposition",
        'attachment; filename="inschrijvingen.xlsx"'
    );

    await wb.xlsx.write(res);
    res.end();
});
