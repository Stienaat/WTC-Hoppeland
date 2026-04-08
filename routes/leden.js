import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// ADMIN CHECK UITZETTEN OF AANPASSEN
router.use((req, res, next) => {
  // tijdelijk uit:
  // return next();

  // of: alleen blokkeren als je dat echt wil
  if (!req.session?.is_admin) {
    return res.status(403).json({ error: "NOT_ADMIN" });
  }
  next();
});

// GET all members
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("Leden")   // <-- hoofdletter
    .select("*")
    .order("naam", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// UPDATE member
router.put("/:id", async (req, res) => {
  const id = req.params.id;
  const updates = req.body;

  const { data, error } = await supabase
    .from("Leden")   // <-- hoofdletter
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE member
router.delete("/:id", async (req, res) => {
  const id = req.params.id;

  const { error } = await supabase
    .from("Leden")   // <-- hoofdletter
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
