import express from "express";

const router = express.Router();

// ============================
// GET notice
// ============================
router.get("/", async (req, res) => {
  const supabase = req.supabase;

  try {
    const { data, error } = await supabase
      .from("Notice")
      .select("text")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    return res.json({
      ok: true,
      text: data?.text || ""
    });
  } catch (err) {
    console.error("NOTICE GET ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================
// POST notice
// ============================
router.post("/", async (req, res) => {
  const supabase = req.supabase;

  try {
    const { text = "" } = req.body;

    const { error } = await supabase
      .from("Notice")
      .upsert({ id: 1, text });

    if (error) throw error;

    return res.json({ ok: true });
  } catch (err) {
    console.error("NOTICE SAVE ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;