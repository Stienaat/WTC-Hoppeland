import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// GET all members
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("leden")
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
    .from("leden")
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
    .from("leden")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
