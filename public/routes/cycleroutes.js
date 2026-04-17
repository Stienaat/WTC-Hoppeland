import express from "express";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pas dit aan als jouw routes.json en gpx-map elders staan
const DATA_DIR = path.join(__dirname, "..");
const ROUTES_FILE = path.join(DATA_DIR, "routes.json");
const GPX_BASE_DIR = path.join(DATA_DIR, "gpx");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

function currentYear() {
  return new Date().getFullYear();
}

function safeSlug(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function ensurePlainFilename(name) {
  const value = String(name || "").trim();
  if (!value) return null;
  if (value.includes("/") || value.includes("\\") || value.includes("..")) return null;
  return value;
}

async function loadRoutes() {
  try {
    const raw = await fs.readFile(ROUTES_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function saveRoutes(routes) {
  await fs.writeFile(
    ROUTES_FILE,
    JSON.stringify(routes, null, 2),
    "utf8"
  );
}

function makeId(prefix = "") {
  const rand = Math.random().toString(16).slice(2, 10);
  return `${prefix}${Date.now().toString(16)}${rand}`;
}

function validateCoords(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  return coords.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      Number.isFinite(Number(p[0])) &&
      Number.isFinite(Number(p[1]))
  );
}

function normalizeWaypoints(waypoints) {
  if (!Array.isArray(waypoints)) return [];
  return waypoints
    .filter((wp) => wp && Number.isFinite(Number(wp.lat)) && Number.isFinite(Number(wp.lon)))
    .map((wp) => ({
      lat: Number(wp.lat),
      lon: Number(wp.lon),
      name: String(wp.name || "Waypoint").trim() || "Waypoint",
      type: String(wp.type || "rest").trim() || "rest"
    }));
}

// ============================
// GET /api/routes
// ============================
router.get("/", async (req, res) => {
  try {
    const routes = await loadRoutes();
    return res.json(routes);
  } catch (err) {
    console.error("ROUTES GET ERROR:", err);
    return res.status(500).json({ ok: false, error: "Routes laden mislukt." });
  }
});

// ============================
// GET /api/routes/file/:jaar/:groep/:bestand
// Veilig serveren van GPX
// ============================
router.get("/file/:jaar/:groep/:bestand", async (req, res) => {
  try {
    const jaar = String(req.params.jaar || "").trim();
    const groep = String(req.params.groep || "").trim();
    const bestand = ensurePlainFilename(req.params.bestand);

    if (!/^\d{4}$/.test(jaar) || !groep || !bestand || !bestand.toLowerCase().endsWith(".gpx")) {
      return res.status(400).json({ ok: false, error: "Ongeldig bestandspad." });
    }

    const fullPath = path.join(GPX_BASE_DIR, jaar, groep, bestand);
    return res.sendFile(fullPath);
  } catch (err) {
    console.error("ROUTE FILE ERROR:", err);
    return res.status(404).json({ ok: false, error: "Bestand niet gevonden." });
  }
});

// ============================
// POST /api/routes/drawn
// Opslaan van getekende route
// ============================
router.post("/drawn", requireAdmin, async (req, res) => {
  try {
    const naam = String(req.body?.naam || "").trim();
    const groep = String(req.body?.groep || "TEKEN").trim() || "TEKEN";
    const coords = req.body?.coords;
    const waypoints = normalizeWaypoints(req.body?.waypoints);

    if (!naam) {
      return res.status(400).json({ ok: false, error: "Naam is verplicht." });
    }

    if (!validateCoords(coords)) {
      return res.status(400).json({ ok: false, error: "Ongeldige route-coördinaten." });
    }

    const routes = await loadRoutes();

    routes.push({
      id: makeId("drawn_"),
      type: "catalog",
      naam,
      jaar: currentYear(),
      groep,
      coords: coords.map(([lat, lon]) => [Number(lat), Number(lon)]),
      waypoints
    });

    await saveRoutes(routes);

    return res.json({ ok: true });
  } catch (err) {
    console.error("DRAWN ROUTE SAVE ERROR:", err);
    return res.status(500).json({ ok: false, error: "Opslaan mislukt." });
  }
});

// ============================
// POST /api/routes/upload-gpx
// Aparte uploadflow voor GPX
// multipart/form-data
// veldnaam file: gpxfile
// ============================
router.post("/upload-gpx", requireAdmin, upload.single("gpxfile"), async (req, res) => {
  try {
    const naam = String(req.body?.naam || "").trim();
    const groep = String(req.body?.groep || "").trim();
    const afstand = String(req.body?.afstand || "").trim();
    const start = String(req.body?.start || "").trim();
    const file = req.file;

    if (!naam || !groep || !afstand || !start) {
      return res.status(400).json({ ok: false, error: "Naam, groep, afstand en start zijn verplicht." });
    }

    if (!file) {
      return res.status(400).json({ ok: false, error: "Geen GPX-bestand ontvangen." });
    }

    const originalName = String(file.originalname || "");
    if (!originalName.toLowerCase().endsWith(".gpx")) {
      return res.status(400).json({ ok: false, error: "Alleen GPX-bestanden zijn toegestaan." });
    }

    const id = makeId();
    const cleanNaam = safeSlug(naam) || "route";
    const filename = `${id}-${cleanNaam}.gpx`;
    const jaar = String(currentYear());
    const targetDir = path.join(GPX_BASE_DIR, jaar, groep);
    const targetPath = path.join(targetDir, filename);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, file.buffer);

    const routes = await loadRoutes();
    routes.push({
      id,
      type: "catalog",
      naam,
      jaar: currentYear(),
      groep,
      afstand_km: afstand,
      start,
      bestand: filename
    });

    await saveRoutes(routes);

    return res.json({ ok: true, id, bestand: filename });
  } catch (err) {
    console.error("GPX UPLOAD ERROR:", err);
    return res.status(500).json({ ok: false, error: "Upload mislukt." });
  }
});

// ============================
// PUT /api/routes/:id
// Bestaande catalogusroute bijwerken
// Alleen naam/coords/waypoints
// ============================
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const naam = String(req.body?.naam || "").trim();
    const coords = req.body?.coords;
    const waypoints = normalizeWaypoints(req.body?.waypoints);

    if (!id) {
      return res.status(400).json({ ok: false, error: "Route-id ontbreekt." });
    }

    if (!naam) {
      return res.status(400).json({ ok: false, error: "Naam is verplicht." });
    }

    if (!validateCoords(coords)) {
      return res.status(400).json({ ok: false, error: "Ongeldige route-coördinaten." });
    }

    const routes = await loadRoutes();
    const route = routes.find((r) => String(r.id) === id);

    if (!route) {
      return res.status(404).json({ ok: false, error: "Route niet gevonden." });
    }

    route.naam = naam;
    route.coords = coords.map(([lat, lon]) => [Number(lat), Number(lon)]);
    route.waypoints = waypoints;

    await saveRoutes(routes);

    return res.json({ ok: true });
  } catch (err) {
    console.error("ROUTE UPDATE ERROR:", err);
    return res.status(500).json({ ok: false, error: "Bijwerken mislukt." });
  }
});

// ============================
// DELETE /api/routes/:id
// Verwijdert catalogusitem
// Verwijdert ook GPX-file indien aanwezig
// ============================
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "Route-id ontbreekt." });
    }

    const routes = await loadRoutes();
    const index = routes.findIndex((r) => String(r.id) === id);

    if (index < 0) {
      return res.status(404).json({ ok: false, error: "Route niet gevonden." });
    }

    const [route] = routes.splice(index, 1);

    if (route?.bestand && route?.jaar && route?.groep) {
      const safeFile = ensurePlainFilename(route.bestand);
      if (safeFile) {
        const gpxPath = path.join(
          GPX_BASE_DIR,
          String(route.jaar),
          String(route.groep),
          safeFile
        );
        try {
          await fs.unlink(gpxPath);
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.warn("GPX delete warning:", err.message);
          }
        }
      }
    }

    await saveRoutes(routes);

    return res.json({ ok: true });
  } catch (err) {
    console.error("ROUTE DELETE ERROR:", err);
    return res.status(500).json({ ok: false, error: "Verwijderen mislukt." });
  }
});

export default router;