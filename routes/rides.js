import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';

const router = express.Router();
const GPX_BASE_DIR = path.join(process.cwd(), 'data', 'gpx');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/* -----------------------------
   helpers
----------------------------- */
function safeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function mapRideRow(row) {
  return {
    id: row.id,
    naam: row.title,
    jaar: row.year,
    groep: row.group_code,
    start: row.start_place,
   
    afstand_km: row.distance_km,
    bestand: row.gpx_filename,
    coords: row.coords || [],
    waypoints: row.waypoints || [],
    type: 'catalog'
  };
}

function sanitizeFilename(filename) {
  if (!filename) return null;
  const base = path.basename(filename);
  if (base !== filename) return null;
  return base;
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeCoords(coords) {
  if (!Array.isArray(coords)) return [];

  return coords
    .map((p) => {
      if (Array.isArray(p) && p.length >= 2) {
        return [Number(p[0]), Number(p[1])];
      }

      if (p && typeof p === 'object') {
        const lat = Number(p.lat);
        const lon = Number(p.lon ?? p.lng);
        return [lat, lon];
      }

      return null;
    })
    .filter(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1])
    );
}

function normalizeWaypoints(waypoints) {
  if (!Array.isArray(waypoints)) return [];

  return waypoints
    .map((wp) => ({
      lat: Number(wp?.lat),
      lon: Number(wp?.lon ?? wp?.lng),
      name: String(wp?.name || 'Waypoint').trim() || 'Waypoint',
      type: String(wp?.type || 'rest').trim() || 'rest'
    }))
    .filter((wp) => Number.isFinite(wp.lat) && Number.isFinite(wp.lon));
}

function requireAdmin(req, res, next) {
  console.log('SESSION:', req.session);
  console.log('is_admin:', req.session?.is_admin);
  console.log('req.user:', req.user);
  console.log('req.isAdmin:', req.isAdmin);

  const isAdmin =
    req.session?.is_admin === true ||
    req.user?.role === 'admin' ||
    req.isAdmin === true;

  if (!isAdmin) {
    console.warn('NOT_ADMIN triggered');
    return res.status(403).json({ ok: false, error: 'NOT_ADMIN' });
  }

  next();
}
/* -----------------------------
   GET /api/rides
   publiek
----------------------------- */
router.get('/', async (req, res) => {
  try {
    const supabase = req.supabase;
    const { year, group, q } = req.query;

    let query = supabase
      .from('club_rides')
      .select('*')
      .eq('is_active', true)
      .order('year', { ascending: false })
      .order('title', { ascending: true });

    if (year) {
      query = query.eq('year', parseInteger(year));
    }

    if (group && group !== 'ALL') {
      query = query.eq('group_code', group);
    }

    if (q && q.trim()) {
      query = query.ilike('title', `%${q.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('GET /api/rides error:', error);
      return res.status(500).json({ ok: false, error: 'Databasefout bij ophalen ritten' });
    }

    return res.json((data || []).map(mapRideRow));
  } catch (err) {
    console.error('GET /api/rides crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

/* -----------------------------
   GET /api/rides/:id
   publiek
----------------------------- */
router.get('/:id', async (req, res) => {
  try {
    const supabase = req.supabase;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('club_rides')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return res.status(404).json({ ok: false, error: 'Rit niet gevonden' });
    }

    return res.json({ ok: true, ride: mapRideRow(data) });
  } catch (err) {
    console.error('GET /api/rides/:id crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

/* -----------------------------
   GET /api/rides/:id/gpx
   publiek
----------------------------- */
router.get('/:id/gpx', async (req, res) => {
  try {
    const supabase = req.supabase;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('club_rides')
      .select('id, title, year, group_code, gpx_filename')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return res.status(404).json({ ok: false, error: 'Rit niet gevonden' });
    }

    if (!data.gpx_filename) {
      return res.status(404).json({ ok: false, error: 'Geen GPX-bestand beschikbaar' });
    }

    const safeFilename = sanitizeFilename(data.gpx_filename);
    if (!safeFilename) {
      return res.status(400).json({ ok: false, error: 'Ongeldige bestandsnaam' });
    }

    const fullPath = path.join(
      GPX_BASE_DIR,
      String(data.year || 'unknown'),
      String(data.group_code || 'unknown'),
      safeFilename
    );

    try {
      await fs.access(fullPath);
    } catch {
      console.error('GPX file ontbreekt:', fullPath);
      return res.status(404).json({ ok: false, error: 'GPX bestand niet gevonden op server' });
    }

    return res.download(fullPath, safeFilename);
  } catch (err) {
    console.error('GET /api/rides/:id/gpx crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

/* -----------------------------
   POST /api/rides/admin/drawn
   admin
----------------------------- */
router.post('/admin/drawn', requireAdmin, async (req, res) => {
  try {
    const supabase = req.supabase;

    const {
      naam,
      groep,
      start,
      start_place,
      einde,
      end_place,
      afstand_km,
      coords,
      waypoints = []
    } = req.body;

    const normalizedCoords = normalizeCoords(coords);
    const normalizedWaypoints = normalizeWaypoints(waypoints);

    console.log('POST /api/rides/admin/drawn body:', req.body);

    if (!naam || !String(naam).trim()) {
      return res.status(400).json({ ok: false, error: 'Naam is verplicht' });
    }

    if (normalizedCoords.length < 2) {
      return res.status(400).json({ ok: false, error: 'Ongeldige route-data' });
    }

    const payload = {
      title: String(naam).trim(),
      year: new Date().getFullYear(),
      group_code: groep ? String(groep).trim() : 'TEKEN',
      start_place: String(start_place ?? start ?? '').trim() || null,
     
      distance_km: parseNumeric(afstand_km),
      ride_kind: 'drawn',
      coords: normalizedCoords,
      waypoints: normalizedWaypoints,
      source: 'admin',
      is_active: true
    };

    const { data, error } = await supabase
      .from('club_rides')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('POST /api/rides/admin/drawn error:', error);
      return res.status(500).json({ ok: false, error: 'Opslaan mislukt' });
    }

    return res.json({ ok: true, id: data.id, ride: mapRideRow(data) });
  } catch (err) {
    console.error('POST /api/rides/admin/drawn crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

/* -----------------------------
   POST /api/rides/admin/upload-gpx
   admin
----------------------------- */

router.post('/admin/upload-gpx', requireAdmin, upload.single('gpxfile'), async (req, res) => {
  try {
    const supabase = req.supabase;

    const naam = String(req.body?.naam || '').trim();
    const groep = String(req.body?.groep || '').trim();
    const start = String(req.body?.start || '').trim();
    const afstand_km = parseNumeric(req.body?.afstand);
    const notes = String(req.body?.notes || '').trim() || null;
    const file = req.file;

    if (!naam) {
      return res.status(400).json({ ok: false, error: 'Naam is verplicht' });
    }

    if (!groep) {
      return res.status(400).json({ ok: false, error: 'Groep is verplicht' });
    }

    if (!start) {
      return res.status(400).json({ ok: false, error: 'Startplaats is verplicht' });
    }

    if (!file) {
      return res.status(400).json({ ok: false, error: 'Geen GPX-bestand ontvangen' });
    }

    const originalName = String(file.originalname || '');
    if (!originalName.toLowerCase().endsWith('.gpx')) {
      return res.status(400).json({ ok: false, error: 'Alleen .gpx bestanden zijn toegestaan' });
    }

    const year = new Date().getFullYear();
    const safeName = safeSlug(naam) || 'route';
    const fileName = `${crypto.randomUUID()}-${safeName}.gpx`;

    // Kies hier je bucketnaam
    const bucket = 'club-rides-gpx';

    // Bewaar liever pad dan alleen losse filename
    const storagePath = `${year}/${groep}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file.buffer, {
        contentType: 'application/gpx+xml',
        upsert: false
      });

    if (uploadError) {
      console.error('POST /api/rides/admin/upload-gpx storage error:', uploadError);
      return res.status(500).json({ ok: false, error: 'GPX upload mislukt' });
    }

    const payload = {
      title: naam,
      year,
      group_code: groep,
      start_place: start,
      distance_km: afstand_km,
      ride_kind: 'gpx',
      is_active: true,
      coords: null,
      waypoints: [],
      gpx_filename: storagePath,
      gpx_original_nam: originalName,
      gpx_uploaded_at: new Date().toISOString(),
      source: 'admin_gpx',
      notes
    };

    const { data, error } = await supabase
      .from('club_rides')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('POST /api/rides/admin/upload-gpx insert error:', error);

      // rollback storage als DB insert faalt
      await supabase.storage.from(bucket).remove([storagePath]);

      return res.status(500).json({ ok: false, error: 'Opslaan in database mislukt' });
    }

    return res.json({
      ok: true,
      id: data.id,
      ride: mapRideRow(data)
    });
  } catch (err) {
    console.error('POST /api/rides/admin/upload-gpx crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});
/* -----------------------------
   PUT /api/rides/admin/:id
   admin
----------------------------- */
router.put('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const supabase = req.supabase;
    const { id } = req.params;

    const {
      naam,
      start,
      start_place,
      einde,
      end_place,
      afstand_km,
      coords,
      waypoints
    } = req.body;

    const patch = {};

    if (naam !== undefined) {
      const title = String(naam).trim();
      if (!title) {
        return res.status(400).json({ ok: false, error: 'Naam is verplicht' });
      }
      patch.title = title;
    }

    if (start !== undefined || start_place !== undefined) {
      patch.start_place = String(start_place ?? start ?? '').trim() || null;
    }

    if (einde !== undefined || end_place !== undefined) {
      patch.end_place = String(end_place ?? einde ?? '').trim() || null;
    }

    if (afstand_km !== undefined) {
      patch.distance_km = parseNumeric(afstand_km);
    }

    if (coords !== undefined) {
      const normalizedCoords = normalizeCoords(coords);
      if (normalizedCoords.length < 2) {
        return res.status(400).json({ ok: false, error: 'Coords moeten minstens 2 punten bevatten' });
      }
      patch.coords = normalizedCoords;
    }

    if (waypoints !== undefined) {
      patch.waypoints = normalizeWaypoints(waypoints);
    }

    const { data, error } = await supabase
      .from('club_rides')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('PUT /api/rides/admin/:id error:', error);
      return res.status(404).json({ ok: false, error: 'Route niet gevonden' });
    }

    return res.json({ ok: true, ride: mapRideRow(data) });
  } catch (err) {
    console.error('PUT /api/rides/admin/:id crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

/* -----------------------------
   DELETE /api/rides/admin/:id
   admin
   soft delete
----------------------------- */
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const supabase = req.supabase;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('club_rides')
      .update({ is_active: false })
      .eq('id', id)
      .select('id')
      .single();

    if (error || !data) {
      console.error('DELETE /api/rides/admin/:id error:', error);
      return res.status(404).json({ ok: false, error: 'Rit niet gevonden of verwijderen mislukt' });
    }

    return res.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('DELETE /api/rides/admin/:id crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

export default router;