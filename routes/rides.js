import express from 'express';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

// Pas aan aan jouw project
const GPX_BASE_DIR = path.join(process.cwd(), 'data', 'gpx');

// -----------------------------
// helpers
// -----------------------------
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

// -----------------------------
// GET /api/rides
// publiek
// -----------------------------
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

// -----------------------------
// GET /api/rides/:id
// publiek
// -----------------------------
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

// -----------------------------
// GET /api/rides/:id/gpx
// publiek
// -----------------------------
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

    const year = data.year || 'unknown';
    const group = data.group_code || 'unknown';
    const fullPath = path.join(GPX_BASE_DIR, String(year), String(group), safeFilename);

    return res.download(fullPath, safeFilename);
  } catch (err) {
    console.error('GET /api/rides/:id/gpx crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

// -----------------------------
// POST /api/admin/rides
// admin
// -----------------------------
router.post('/admin/create', async (req, res) => {
  try {
    const supabase = req.supabase;
    const {
      title,
      year,
      group_code,
      start_place,
      distance_km,
      ride_kind = 'drawn',
      coords = [],
      waypoints = [],
      gpx_filename = null,
      gpx_original_name = null,
      source = 'admin',
      notes = null,
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ ok: false, error: 'Titel is verplicht' });
    }

    if (!Array.isArray(coords) || coords.length < 2) {
      return res.status(400).json({ ok: false, error: 'Coords moeten minstens 2 punten bevatten' });
    }

    const payload = {
      title: String(title).trim(),
      year: parseInteger(year),
      group_code: group_code ? String(group_code).trim() : null,
      start_place: start_place ? String(start_place).trim() : null,
      distance_km: parseNumeric(distance_km),
      ride_kind,
      coords,
      waypoints: Array.isArray(waypoints) ? waypoints : [],
      gpx_filename: gpx_filename ? sanitizeFilename(gpx_filename) : null,
      gpx_original_name: gpx_original_name || null,
      gpx_uploaded_at: gpx_filename ? new Date().toISOString() : null,
      source,
      notes,
    };

    const { data, error } = await supabase
      .from('club_rides')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('POST /api/admin/rides error:', error);
      return res.status(500).json({ ok: false, error: 'Opslaan mislukt' });
    }

    return res.status(201).json({ ok: true, ride: mapRideRow(data) });
  } catch (err) {
    console.error('POST /api/admin/rides crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

// -----------------------------
// PUT /api/admin/rides/:id
// admin
// -----------------------------
router.put('/admin/:id', async (req, res) => {
  try {
    const supabase = req.supabase;
    const { id } = req.params;
    const {
      title,
      year,
      group_code,
      start_place,
      distance_km,
      ride_kind,
      coords,
      waypoints,
      gpx_filename,
      gpx_original_name,
      notes,
      is_active,
    } = req.body;

    const patch = {};

    if (title !== undefined) patch.title = String(title).trim();
    if (year !== undefined) patch.year = parseInteger(year);
    if (group_code !== undefined) patch.group_code = group_code ? String(group_code).trim() : null;
    if (start_place !== undefined) patch.start_place = start_place ? String(start_place).trim() : null;
    if (distance_km !== undefined) patch.distance_km = parseNumeric(distance_km);
    if (ride_kind !== undefined) patch.ride_kind = ride_kind;
    if (coords !== undefined) patch.coords = coords;
    if (waypoints !== undefined) patch.waypoints = Array.isArray(waypoints) ? waypoints : [];
    if (gpx_filename !== undefined) patch.gpx_filename = gpx_filename ? sanitizeFilename(gpx_filename) : null;
    if (gpx_original_name !== undefined) patch.gpx_original_name = gpx_original_name || null;
    if (notes !== undefined) patch.notes = notes;
    if (is_active !== undefined) patch.is_active = Boolean(is_active);

    const { data, error } = await supabase
      .from('club_rides')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('PUT /api/admin/rides/:id error:', error);
      return res.status(404).json({ ok: false, error: 'Rit niet gevonden of update mislukt' });
    }

    return res.json({ ok: true, ride: mapRideRow(data) });
  } catch (err) {
    console.error('PUT /api/admin/rides/:id crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

// -----------------------------
// DELETE /api/admin/rides/:id
// admin
// soft delete
// -----------------------------
router.delete('/admin/:id', async (req, res) => {
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
      console.error('DELETE /api/admin/rides/:id error:', error);
      return res.status(404).json({ ok: false, error: 'Rit niet gevonden of verwijderen mislukt' });
    }

    return res.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('DELETE /api/admin/rides/:id crash:', err);
    return res.status(500).json({ ok: false, error: 'Serverfout' });
  }
});

export default router;