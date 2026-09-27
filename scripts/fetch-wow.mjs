// Récupère la liste des cartes du JCC World of Warcraft sur WoWTCGFR (https://wowtcgfr.com)
// et l'écrit dans data/wow-cards.json. Lancé chaque semaine par une GitHub Action.
// Usage : node scripts/fetch-wow.mjs [dossier-de-fichiers-html-pour-test]
import { load } from 'cheerio';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://wowtcgfr.com';
const OUT = 'data/wow-cards.json';
const UA = 'PKM-booster-collection/1.0 (simulateur perso non commercial; https://github.com/Magmort/PKM-booster-collection)';
const LOCAL = process.argv[2] || null; // dossier de pages enregistrées, pour tester sans réseau

// Infos connues sur les extensions (le site ne donne que l'année)
const KNOWN = {
  azeroth:    { abbr: 'HOA', en: 'Heroes of Azeroth',        date: '2006-10-25', block: 'Bloc Azeroth', size: 15 },
  darkportal: { abbr: 'TDP', en: 'Through the Dark Portal',  date: '2007-04-01', block: 'Bloc Azeroth', size: 15 },
  outland:    { abbr: 'FOO', en: 'Fires of Outland',         date: '2007-07-01', block: 'Bloc Azeroth', size: 15 },
  legion:     { abbr: 'MOL', en: 'March of the Legion',      date: '2007-11-01', block: 'Bloc Burning Crusade', size: 18 },
  betrayer:   { abbr: 'SOB', en: 'Servants of the Betrayer', date: '2008-03-01', block: 'Bloc Burning Crusade', size: 18 },
  illidan:    { abbr: 'HFI', en: 'The Hunt for Illidan',     date: '2008-07-01', block: 'Bloc Burning Crusade', size: 18 },
  mc:         { abbr: 'MC',  en: 'Molten Core',              date: '2008-06-01', block: 'Raids', raid: true },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const plain = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

async function get(path) {
  if (LOCAL) {
    const f = LOCAL + '/' + path.replace(/^\//, '').replace(/\//g, '_') + '.html';
    try { return await readFile(f, 'utf8'); } catch { return null; }
  }
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + path, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
      console.warn(`HTTP ${r.status} sur ${path}`);
    } catch (e) { console.warn(`Erreur réseau sur ${path} : ${e.message}`); }
    await sleep(4000 * (i + 1));
  }
  throw new Error('Impossible de charger ' + path);
}

// ---------- liste des extensions ----------
function parseSetList(html) {
  const $ = load(html), sets = [], seen = new Set();
  $('a[href*="/edition/"]').each((_, a) => {
    const m = ($(a).attr('href') || '').match(/\/edition\/([^/?#]+)\/fr\/?$/);
    if (!m || seen.has(m[1])) return;
    const t = clean($(a).text());
    const n = t.match(/^(.*?)\s*(\d+)\s*Cartes?\s*(\d{4})\s*$/i);
    if (!n) return;
    seen.add(m[1]);
    sets.push({ slug: m[1], name: clean(n[1]), announced: +n[2], year: +n[3] });
  });
  return sets;
}

// ---------- page d'une extension ----------
const CLASSES = ['druide', 'chasseur', 'mage', 'paladin', 'pretre', 'voleur', 'chaman', 'demoniste', 'guerrier', 'chevalier de la mort'];
const CLASS_FR = { pretre: 'Prêtre', demoniste: 'Démoniste', 'chevalier de la mort': 'Chevalier de la mort' };

function rarity(t) {
  const p = plain(t);
  if (p.includes('peu commune') || p === 'uncommon') return 'U';
  if (p.includes('commune') || p === 'common') return 'C';
  if (p.includes('epique') || p === 'epic') return 'E';
  if (p.includes('legendaire') || p.includes('butin') || p.includes('loot') || p === 'legendary') return 'L';
  if (p.includes('rare')) return 'R';
  return 'C';
}

function kindOf(t) {
  const p = plain(t);
  if (/^(hero|heros)\b/.test(p)) return 'hero';
  if (/^allie\b/.test(p)) return 'ally';
  if (/^capacite instantanee\b/.test(p)) return 'instant';
  if (/^capacite\b/.test(p)) return 'ability';
  if (/^(equipement|arme|armure|objet)\b/.test(p)) return 'equipment';
  if (/^quete\b/.test(p)) return 'quest';
  if (/^(lieu|emplacement)\b/.test(p)) return 'location';
  return 'other';
}

function parseType($, td) {
  const imgs = $(td).find('img').map((_, el) => ({
    t: clean($(el).attr('title') || $(el).attr('alt')),
    f: (($(el).attr('src') || '').split('/').pop() || '').replace(/\.\w+$/, ''),
  })).get();
  let text = clean($(td).text());
  const kind = kindOf(text);
  let fac = '';
  for (const i of imgs) { const p = plain(i.t); if (p === 'alliance' || p === 'horde') { fac = p; break; } }
  if (!fac) { const m = text.match(/\b(alliance|horde)\b/i); if (m) fac = m[1].toLowerCase(); }
  let cls = '';
  for (const i of imgs) { const p = plain(i.t); if (CLASSES.includes(p)) { cls = CLASS_FR[p] || i.t; break; } }
  const school = (imgs.find(i => plain(i.t) === 'attaque') || {}).f || '';
  let atk = '', hp = '';
  const s = text.match(/—\s*([\dX+\-]+)\s*\/\s*(\d+)\s*$/);
  if (s) { atk = s[1]; hp = s[2]; text = text.slice(0, s.index); }
  else if (kind === 'hero') { const h = text.match(/—\s*(\d+)\s*$/); if (h) { hp = h[1]; text = text.slice(0, h.index); } }
  // Ligne de type lisible : « Allié — Humain Paladin », « Capacité instantanée — Feu »
  let line = text.replace(/^Hero\b/, 'Héros').replace('Capacité Instantanée', 'Capacité instantanée').replace(/\s\b(alliance|horde|aucune)\b/g, '').replace(/\s*—\s*$/, '');
  line = clean(line.replace(/\s+—\s+/g, ' — '));
  return { kind, fac, cls, school, atk, hp, line };
}

function parseSet(html) {
  const $ = load(html);
  // Colonnes repérées par leur en-tête, avec l'ordre habituel en secours
  const col = { num: 0, name: 1, type: 2, cost: 3, rar: 4, artist: 5 };
  $('tr').each((_, tr) => {
    const th = $(tr).find('th,td').map((_, c) => plain($(c).text())).get();
    if (!th.some(t => t.startsWith('rarete'))) return;
    th.forEach((t, i) => {
      if (t.startsWith('nom')) col.name = i; else if (t.startsWith('type')) col.type = i;
      else if (t.startsWith('cout')) col.cost = i; else if (t.startsWith('rarete')) col.rar = i;
      else if (t.startsWith('artiste')) col.artist = i; else if (t === '№' || t === 'no' || t === 'n°') col.num = i;
    });
    return false;
  });
  const cards = [], seen = new Set();
  $('tr').each((_, tr) => {
    const td = $(tr).find('td');
    if (td.length < 5) return;
    const numT = clean($(td[col.num]).text());
    if (!/^\d+[a-z]?$/i.test(numT)) return;
    const num = /^\d+$/.test(numT) ? +numT : numT;
    if (seen.has(num)) return;
    const name = clean($(td[col.name]).text());
    if (!name) return;
    seen.add(num);
    const ty = parseType($, td[col.type]);
    cards.push([num, name, rarity($(td[col.rar]).text()), ty.kind, ty.fac, ty.cls,
      clean($(td[col.cost]).text()), ty.atk, ty.hp, ty.line, ty.school, clean($(td[col.artist]).text())]);
  });
  return cards;
}

// ---------- programme principal ----------
let old = null;
try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const oldCards = slug => old ? old.cards.filter(c => c[0] === slug).map(c => c.slice(1)) : [];

const listHtml = await get('/world-of-warcraft-jcc');
if (!listHtml) throw new Error('Page des extensions introuvable');
const list = parseSetList(listHtml);
if (!list.length) throw new Error('Aucune extension trouvée : la structure du site a peut-être changé');

const sets = [], cards = [];
for (const s of list) {
  if (!LOCAL) await sleep(2500); // reste discret avec le site
  const html = await get(`/edition/${s.slug}/fr`);
  let got = html ? parseSet(html) : [];
  const prev = oldCards(s.slug);
  if (got.length < Math.min(s.announced, 50) * 0.5) {
    console.warn(`${s.slug} : ${got.length} cartes lues pour ${s.announced} annoncées, ${prev.length ? 'ancienne liste conservée' : 'extension ignorée'}`);
    got = prev;
  }
  if (!got.length) continue;
  const k = KNOWN[s.slug] || {};
  sets.push({
    slug: s.slug, name: s.name || k.en || s.slug, en: k.en || '', abbr: k.abbr || s.slug.slice(0, 3).toUpperCase(),
    year: s.year, date: k.date || `${s.year}-12-01`, block: k.block || `Extensions ${s.year}`,
    size: k.size || 18, raid: !!(k.raid || s.announced < 60), count: got.length,
  });
  got.forEach(c => cards.push([s.slug, ...c]));
  console.log(`${s.slug} : ${got.length} cartes`);
}
if (!cards.length) throw new Error('Aucune carte lue, fichier inchangé');

const body = { source: 'WoWTCGFR (https://wowtcgfr.com)', sets, cards };
const same = old && JSON.stringify({ source: old.source, sets: old.sets, cards: old.cards }) === JSON.stringify(body);
if (same) { console.log('Aucun changement.'); process.exit(0); }
await mkdir('data', { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), ...body }));
console.log(`Écrit : ${sets.length} extensions, ${cards.length} cartes.`);
