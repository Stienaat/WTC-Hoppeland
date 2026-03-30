import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import bcrypt from "bcrypt";
import multer from "multer";

const upload = multer();

// Fix voor ESM (__dirname bestaat niet standaard)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ✔ HEALTH CHECK (Render verwacht dit)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✔ LEDEN ROUTE (placeholder zodat server niet crasht)
app.post("/leden", upload.none(), (req, res) => {
  res.json({ ok: true });
});

// ✔ SERVER START
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server draait op poort " + PORT);
});
