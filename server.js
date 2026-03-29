import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static("public"));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CONTACT FORM
app.post("/api/contact", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      street,
      zip,
      city,
      message,
      consent
    } = req.body;

    if (!name || !message) {
      return res.json({ ok: false, error: "name/message required" });
    }

    const { data, error } = await supabase
      .from("forms")
      .insert([
        {
          name,
          email: email?.toLowerCase() || "",
          phone,
          street,
          zip,
          city,
          msg: message,
          consent: consent === true
        }
      ])
      .select();

    if (error) {
      console.error(error);
      return res.json({ ok: false, error: "Database insert failed" });
    }

    return res.json({
      ok: true,
      txt: `
${name}
${email || ""}
${phone || ""}
${street || ""}
${zip || ""}
${city || ""}
${message}
${new Date().toISOString().slice(0, 16).replace("T", " ")}
      `.trim()
    });
  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Server error" });
  }
});

// NOTICE ROUTE
app.get("/notice", (req, res) => {
  const filePath = path.join(__dirname, "data", "notice.md");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      return res.status(500).send("Kon mededelingen niet laden.");
    }
    res.send(data);
  });
});

// START SERVER
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server draait op poort ${PORT}`);
});
