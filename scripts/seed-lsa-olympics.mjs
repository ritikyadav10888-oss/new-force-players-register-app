/**
 * Seed / update "LSA Olympics" from public/LSA_Games_Event_Category_Grid.xlsx
 * Usage: node scripts/seed-lsa-olympics.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';
import pg from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'public', 'LSA_Games_Event_Category_Grid.xlsx');

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const DEFAULT_EVENT_FEE = Math.max(0, Math.round(Number(process.env.LSA_EVENT_FEE) || 0));
const SLUG = 'lsa-olympics';
const NAME = 'LSA Olympics';

function isCheck(v) {
  const s = String(v || '').trim();
  return s === '✔' || s === '✓' || s.toLowerCase() === 'x' || s === '1' || s === 'yes';
}

function parseAgeBand(text) {
  const t = String(text || '').trim();
  // "Age 6 & below" / "Age 71 & above" / "Age 7–8" / "11–15"
  const below = t.match(/(\d+)\s*&\s*below/i);
  if (below) return { minAge: 0, maxAge: Number(below[1]) };
  const above = t.match(/(\d+)\s*&\s*above/i);
  if (above) return { minAge: Number(above[1]), maxAge: null };
  const range = t.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (range) return { minAge: Number(range[1]), maxAge: Number(range[2]) };
  return { minAge: null, maxAge: null };
}

function agesOverlap(aMin, aMax, bMin, bMax) {
  const aLo = aMin ?? 0;
  const aHi = aMax ?? 200;
  const bLo = bMin ?? 0;
  const bHi = bMax ?? 200;
  return aLo <= bHi && bLo <= aHi;
}

function buildFromExcel() {
  const wb = XLSX.readFile(XLSX_PATH);
  const track = XLSX.utils.sheet_to_json(wb.Sheets.Track || wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: '',
  });
  const field = XLSX.utils.sheet_to_json(wb.Sheets.Field || wb.Sheets[wb.SheetNames[1]], {
    header: 1,
    defval: '',
  });
  const relay = XLSX.utils.sheet_to_json(
    wb.Sheets['Relay & Fun Games'] || wb.Sheets[wb.SheetNames[2]],
    { header: 1, defval: '' }
  );

  // --- Track header row ---
  let trackHeaderIdx = track.findIndex(
    (r) => String(r[0]).trim().toLowerCase() === 'category'
  );
  if (trackHeaderIdx < 0) throw new Error('Track sheet: Category header not found');
  const trackHeader = track[trackHeaderIdx];
  const trackEventNames = trackHeader.slice(3).map((h) => String(h).trim()).filter(Boolean);

  const categories = [];
  /** @type {Map<string, { Male: string[]; Female: string[] }>} */
  const trackAllowedByCatName = new Map();
  let currentCat = null;

  for (const row of track.slice(trackHeaderIdx + 1)) {
    const catName = String(row[0] || '').trim();
    const ageGroup = String(row[1] || '').trim();
    const gender = String(row[2] || '').trim();
    if (!gender) continue;
    if (catName) {
      const band = parseAgeBand(ageGroup);
      currentCat = {
        id: randomUUID(),
        name: catName,
        description: ageGroup || undefined,
        minAge: band.minAge,
        maxAge: band.maxAge,
        minDob: null,
        maxDob: null,
        fee: 0,
      };
      categories.push(currentCat);
      trackAllowedByCatName.set(catName, { Male: [], Female: [] });
    }
    if (!currentCat) continue;
    const g = gender === 'Female' ? 'Female' : gender === 'Male' ? 'Male' : null;
    if (!g) continue;
    const allowed = [];
    for (let i = 0; i < trackEventNames.length; i++) {
      if (isCheck(row[i + 3])) allowed.push(trackEventNames[i]);
    }
    trackAllowedByCatName.get(currentCat.name)[g] = allowed;
  }

  // --- Sports: Track ---
  const sports = [];
  const sportIdByName = new Map();
  for (const name of trackEventNames) {
    const id = randomUUID();
    sportIdByName.set(name, id);
    sports.push({
      id,
      name,
      entryType: 'individual',
      fee: DEFAULT_EVENT_FEE,
      minPlayers: 1,
      maxPlayers: 1,
      sportFamily: 'Track',
      formatLabel: name,
      description: 'Track event',
    });
  }

  // --- Field ---
  let fieldHeaderIdx = field.findIndex(
    (r) => String(r[0]).trim().toLowerCase() === 'age band'
  );
  if (fieldHeaderIdx < 0) throw new Error('Field sheet: Age Band header not found');
  const fieldHeader = field[fieldHeaderIdx];
  const fieldEventNames = fieldHeader.slice(2).map((h) => String(h).trim()).filter(Boolean);
  for (const name of fieldEventNames) {
    if (sportIdByName.has(name)) continue;
    const id = randomUUID();
    sportIdByName.set(name, id);
    sports.push({
      id,
      name,
      entryType: 'individual',
      fee: DEFAULT_EVENT_FEE,
      minPlayers: 1,
      maxPlayers: 1,
      sportFamily: 'Field',
      formatLabel: name,
      description: 'Field event',
    });
  }

  /** Field band → allowed event names by gender */
  const fieldBands = [];
  let currentBand = null;
  for (const row of field.slice(fieldHeaderIdx + 1)) {
    const bandLabel = String(row[0] || '').trim();
    const gender = String(row[1] || '').trim();
    if (bandLabel) {
      const band = parseAgeBand(bandLabel);
      currentBand = { label: bandLabel, ...band, Male: [], Female: [] };
      fieldBands.push(currentBand);
    }
    if (!currentBand || !gender) continue;
    const g = gender === 'Female' ? 'Female' : gender === 'Male' ? 'Male' : null;
    if (!g) continue;
    const allowed = [];
    for (let i = 0; i < fieldEventNames.length; i++) {
      if (isCheck(row[i + 2])) allowed.push(fieldEventNames[i]);
    }
    currentBand[g] = allowed;
  }

  // --- Relay & Fun ---
  for (const row of relay) {
    const name = String(row[0] || '').trim();
    const composition = String(row[1] || '').trim();
    const players = Math.max(1, Math.round(Number(row[2]) || 0));
    const notes = String(row[3] || '').trim();
    if (!name || name.startsWith('#') || name.toUpperCase().includes('FUN / TEAM')) continue;
    if (name.toLowerCase() === 'relay event' || name === 'FUN / TEAM GAMES (min. 15 players each)')
      continue;
    // Fun game placeholders like "[Fun Game 1..."
    const isFun = name.startsWith('[') || /^\[\d/.test(name) || /^\d+$/.test(String(row[0]));
    // Relay rows
    if (name.includes('Relay')) {
      const id = randomUUID();
      sportIdByName.set(name, id);
      sports.push({
        id,
        name,
        entryType: 'team',
        fee: DEFAULT_EVENT_FEE,
        minPlayers: players || 4,
        maxPlayers: players || 4,
        sportFamily: 'Relay',
        formatLabel: name,
        description: [composition, notes].filter(Boolean).join(' · ') || 'Relay',
      });
      continue;
    }
  }

  // Fun games from numbered rows
  for (const row of relay) {
    const num = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    const minPlayers = Math.max(1, Math.round(Number(row[2]) || 15));
    const notes = String(row[3] || '').trim();
    if (!/^\d+$/.test(num) || !name) continue;
    const cleanName = name.replace(/^\[|\]$/g, '').trim() || `Fun Game ${num}`;
    if (sportIdByName.has(cleanName)) continue;
    const id = randomUUID();
    sportIdByName.set(cleanName, id);
    sports.push({
      id,
      name: cleanName,
      entryType: 'team',
      fee: DEFAULT_EVENT_FEE,
      minPlayers,
      maxPlayers: Math.max(minPlayers, 30),
      sportFamily: 'Fun Games',
      formatLabel: cleanName,
      description: notes || `Min ${minPlayers} players`,
    });
  }

  // --- Eligibility matrix ---
  const rules = [];
  for (const cat of categories) {
    for (const gender of ['Male', 'Female']) {
      const sportIds = new Set();
      const trackAllowed = trackAllowedByCatName.get(cat.name)?.[gender] || [];
      for (const ev of trackAllowed) {
        const id = sportIdByName.get(ev);
        if (id) sportIds.add(id);
      }
      // Field: any band overlapping this category age
      for (const band of fieldBands) {
        if (!agesOverlap(cat.minAge, cat.maxAge, band.minAge, band.maxAge)) continue;
        for (const ev of band[gender] || []) {
          const id = sportIdByName.get(ev);
          if (id) sportIds.add(id);
        }
      }
      // Relays by gender
      for (const s of sports) {
        if (s.sportFamily !== 'Relay') continue;
        if (s.name.startsWith("Men's") && gender === 'Male') sportIds.add(s.id);
        else if (s.name.startsWith("Women's") && gender === 'Female') sportIds.add(s.id);
        else if (s.name.startsWith('Mixed')) sportIds.add(s.id);
      }
      // Fun games: open to all categories × gender (admin can tighten later)
      for (const s of sports) {
        if (s.sportFamily === 'Fun Games') sportIds.add(s.id);
      }
      rules.push({
        categoryId: cat.id,
        gender,
        sportIds: [...sportIds],
      });
    }
  }

  const form_config = {
    feeMode: 'step',
    firstEventFee: 350,
    extraEventFee: 50,
    eligibilityMatrix: { enabled: true, rules },
    ageCategorySection: {
      label: 'Age category',
      description: 'Category is set from the player date of birth. Events depend on that category and gender.',
    },
    sportsSection: {
      label: 'Select events *',
      description:
        'Only events allowed for your category, gender, and selected disciplines are listed.',
    },
    disciplineSection: {
      label: 'Select discipline *',
      description: 'Choose Track, Field, Relay, and/or Fun Games.',
    },
    gender: {
      enabled: true,
      required: true,
      label: 'Gender',
      description: 'Required — which events you can enter depends on gender.',
    },
    name: { enabled: true, required: true },
    email: { enabled: true, required: true },
    phone: { enabled: true, required: true },
    dob: { enabled: true, required: true },
    photo: { enabled: false, required: false },
  };

  return {
    categories,
    sports,
    form_config,
    summary: {
      categories: categories.length,
      sports: sports.length,
      rules: rules.length,
      trackEvents: trackEventNames.length,
      fieldEvents: fieldEventNames.length,
    },
  };
}

async function getPool() {
  const keyFile =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile) process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile;

  const instance = process.env.CLOUD_SQL_INSTANCE;
  if (instance && keyFile) {
    const connector = new Connector();
    const opts = await connector.getOptions({
      instanceConnectionName: instance,
      ipType: IpAddressTypes.PUBLIC,
    });
    return new Pool({
      ...opts,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'postgres',
      max: 1,
    });
  }

  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }

  throw new Error('Set CLOUD_SQL_INSTANCE + credentials, or DATABASE_URL');
}

const built = buildFromExcel();
console.log('Parsed Excel:', built.summary);
console.log('Event fee per sport (₹):', DEFAULT_EVENT_FEE, '(set LSA_EVENT_FEE to override)');

const pool = await getPool();
try {
  const { rows: existing } = await pool.query(
    `SELECT id, slug, name FROM tournaments
     WHERE slug = $1 OR name ILIKE $2
     ORDER BY CASE WHEN slug = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [SLUG, '%LSA%Olymp%']
  );

  const payload = {
    age_categories: JSON.stringify(built.categories),
    sports_config: JSON.stringify(built.sports),
    form_config: JSON.stringify(built.form_config),
    fee: DEFAULT_EVENT_FEE,
    type: 'Individual',
    sport: 'Athletics',
    min_players: 1,
    max_players: 1,
  };

  if (existing[0] && process.argv.includes('--fees-only')) {
    await pool.query(
      `UPDATE tournaments
       SET form_config = COALESCE(form_config, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        existing[0].id,
        JSON.stringify({
          feeMode: 'step',
          firstEventFee: 350,
          extraEventFee: 50,
          sportsSection: {
            label: 'Select events *',
            description:
              'Only events allowed for your category, gender, and selected disciplines are listed. The first event uses the first-event fee; each extra event adds the extra-event fee.',
          },
        }),
      ]
    );
    console.log('Updated step fees only:', existing[0].id, SLUG);
  } else if (existing[0]) {
    await pool.query(
      `UPDATE tournaments SET
         name = $2,
         slug = $3,
         age_categories = $4::jsonb,
         sports_config = $5::jsonb,
         form_config = COALESCE(form_config, '{}'::jsonb) || $6::jsonb,
         fee = $7,
         type = $8,
         sport = $9,
         min_players = $10,
         max_players = $11
       WHERE id = $1`,
      [
        existing[0].id,
        NAME,
        SLUG,
        payload.age_categories,
        payload.sports_config,
        payload.form_config,
        payload.fee,
        payload.type,
        payload.sport,
        payload.min_players,
        payload.max_players,
      ]
    );
    console.log('Updated tournament:', existing[0].id, SLUG);
  } else {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO tournaments (
         id, name, slug, venue, type, sport, fee, min_players, max_players,
         theme, status, is_public, age_categories, sports_config, form_config,
         organizer_name, description
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, 'Active', true, $11::jsonb, $12::jsonb, $13::jsonb,
         $14, $15
       )`,
      [
        id,
        NAME,
        SLUG,
        'TBD',
        payload.type,
        payload.sport,
        payload.fee,
        payload.min_players,
        payload.max_players,
        '#0d472c',
        payload.age_categories,
        payload.sports_config,
        payload.form_config,
        'LSA',
        'LSA Games — Track, Field, Relay & Fun events. Select category and gender to see eligible events.',
      ]
    );
    console.log('Created tournament:', id, SLUG);
  }

  console.log('Register URL: /register/' + SLUG);
} finally {
  await pool.end();
}
