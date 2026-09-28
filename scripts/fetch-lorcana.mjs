// Récupère les cartes Disney Lorcana en français (données LorcanaJSON, https://lorcanajson.org)
// et écrit data/lorcana-cards.json. Lancé chaque semaine par une GitHub Action.
// Usage : node scripts/fetch-lorcana.mjs [fichier allCards.json local pour tester sans réseau]
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = 'data/lorcana-cards.json';
const URLS = ['https://lorcanajson.org/files/current/fr/allCards.json'];
const LOCAL = process.argv[2] || null;
const UA = 'PKM-booster-collection/1.0 (simulateur perso non commercial)';

const plain = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[_-]+/g, ' ').trim();
const RAR = { 'COMMUNE': 'C', 'COMMON': 'C', 'INHABITUELLE': 'U', 'UNCOMMON': 'U', 'RARE': 'R', 'TRES RARE': 'SR', 'SUPER RARE': 'SR', 'SUPER': 'SR',
  'LEGENDAIRE': 'L', 'LEGENDARY': 'L', 'EPIQUE': 'EP', 'EPIC': 'EP', 'ENCHANTEE': 'EN', 'ENCHANTED': 'EN', 'ICONIQUE': 'IC', 'ICONIC': 'IC' };
const INK = { 'AMBRE': 'amber', 'AMBER': 'amber', 'AMETHYSTE': 'amethyst', 'AMETHYST': 'amethyst', 'EMERAUDE': 'emerald', 'EMERALD': 'emerald',
  'RUBIS': 'ruby', 'RUBY': 'ruby', 'SAPHIR': 'sapphire', 'SAPPHIRE': 'sapphire', 'ACIER': 'steel', 'STEEL': 'steel' };
const TYPE = { 'PERSONNAGE': 'character', 'CHARACTER': 'character', 'ACTION': 'action', 'OBJET': 'item', 'ITEM': 'item', 'LIEU': 'location', 'LOCATION': 'location' };

async function load() {
  if (LOCAL) return JSON.parse(await readFile(LOCAL, 'utf8'));
  for (const url of URLS) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (r.ok) return await r.json();
        console.warn(`HTTP ${r.status} sur ${url}`);
      } catch (e) { console.warn(`Erreur réseau sur ${url} : ${e.message}`); }
      await new Promise(r => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw new Error('Impossible de télécharger les données LorcanaJSON');
}

const d = await load();
const today = new Date().toISOString().slice(0, 10);
const sets = [], cards = [];
for (const [code, s] of Object.entries(d.sets || {})) {
  if (s.type && s.type !== 'expansion') continue;           // uniquement les extensions vendues en boosters
  const date = s.releaseDate || s.prereleaseDate;
  if (!date || date > today) continue;                       // pas encore sortie
  const list = (d.cards || []).filter(c => String(c.setCode) === code);
  const out = [];
  for (const c of list) {
    const r = RAR[plain(c.rarity)]; if (!r) continue;        // on ignore les promos (« Spécial »)
    const inks = (c.colors && c.colors.length ? c.colors : String(c.color || '').split('-')).map(x => INK[plain(x)]).filter(Boolean);
    out.push([code, c.number, c.fullName || c.name, r, inks.join('-'), c.cost ?? '', TYPE[plain(c.type)] || 'other',
      c.strength ?? '', c.willpower ?? '', c.lore ?? '', (c.images && c.images.full) || '']);
  }
  if (!out.length) continue;
  const base = s.cardCounts && s.cardCounts.base || out.filter(x => ['C', 'U', 'R', 'SR', 'L'].includes(x[3])).length;
  sets.push({ code, name: s.name, date, year: +date.slice(0, 4), count: out.length, base });
  out.sort((a, b) => a[1] - b[1]);
  cards.push(...out);
}
sets.sort((a, b) => a.date.localeCompare(b.date));

let previous = null;
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const result = { updated: today, source: 'LorcanaJSON (https://lorcanajson.org)', sets, cards };
if (previous && JSON.stringify({ ...previous, updated: '' }) === JSON.stringify({ ...result, updated: '' })) {
  console.log('Aucune nouveauté.');
} else {
  await mkdir('data', { recursive: true });
  await writeFile(OUT, JSON.stringify(result));
  console.log(`${sets.length} extensions, ${cards.length} cartes écrites dans ${OUT}.`);
}
