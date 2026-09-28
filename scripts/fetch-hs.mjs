// Récupère les cartes Hearthstone (données HearthSim/hsdata, textes français inclus)
// et écrit data/hs-cards.json. Lancé chaque semaine par une GitHub Action.
// Usage : node scripts/fetch-hs.mjs [dossier contenant CardDefs.xml, GLOBAL.txt et enums.py pour tester sans réseau]
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = 'data/hs-cards.json';
const RAW = 'https://raw.githubusercontent.com/HearthSim';
const LOCAL = process.argv[2] || null;

// Extensions vendues en boosters : identifiant interne -> clé de texte, date de sortie
const KNOWN = {
  EXPERT1: ['EXPERT1', '2014-03-11'], PE1: ['GVG', '2014-12-08'], TGT: ['TGT', '2015-08-24'], OG: ['OG', '2016-04-26'],
  GANGS: ['GANGS', '2016-12-01'], UNGORO: ['UNGORO', '2017-04-06'], ICECROWN: ['ICECROWN', '2017-08-10'],
  LOOTAPALOOZA: ['LOOTAPALOOZA', '2017-12-07'], GILNEAS: ['GILNEAS', '2018-04-12'], BOOMSDAY: ['BOOMSDAY', '2018-08-07'],
  TROLL: ['TROLL', '2018-12-04'], DALARAN: ['DALARAN', '2019-04-09'], ULDUM: ['ULDUM', '2019-08-06'], DRAGONS: ['DRG', '2019-12-10'],
  BLACK_TEMPLE: ['BT', '2020-04-07'], SCHOLOMANCE: ['SCH', '2020-08-06'], DARKMOON_FAIRE: ['DMF', '2020-11-17'],
  THE_BARRENS: ['BAR', '2021-03-30'], STORMWIND: ['SW', '2021-08-03'], ALTERAC_VALLEY: ['AV', '2021-12-07'],
  THE_SUNKEN_CITY: ['TSC', '2022-04-12'], REVENDRETH: ['REV', '2022-08-02'], RETURN_OF_THE_LICH_KING: ['RLK', '2022-12-06'],
  BATTLE_OF_THE_BANDS: ['ETC', '2023-04-11'], TITANS: ['TTN', '2023-08-01'], WILD_WEST: ['WST', '2023-11-14'],
  WHIZBANGS_WORKSHOP: ['TOY', '2024-03-19'], ISLAND_VACATION: ['VAC', '2024-07-23'], SPACE: ['GDB', '2024-11-05'],
  EMERALD_DREAM: ['EDR', '2025-03-25'], THE_LOST_CITY: ['TLC', '2025-07-08'], TIME_TRAVEL: ['TIME', '2025-11-04'],
  CATACLYSM: ['CATA', '2026-03-17'], ESCAPEFROM_VIOLET_HOLD: ['JAIL', '2026-07-14'],
};
// Jamais vendues en boosters
const SKIP = new Set(['BASIC', 'CORE', 'CORE_HIDDEN', 'VANILLA', 'LEGACY', 'HOF', 'HERO_SKINS', 'EVENT', 'WONDERS', 'PROMO',
  'NAXX', 'FP1', 'BRM', 'LOE', 'KARA', 'YEAR_OF_THE_DRAGON', 'DEMON_HUNTER_INITIATE', 'PATH_OF_ARTHAS', 'TUTORIAL', 'MISSIONS']);
const CLASSES = { 1: 'Chevalier de la mort', 2: 'Druide', 3: 'Chasseur', 4: 'Mage', 5: 'Paladin', 6: 'Prêtre', 7: 'Voleur', 8: 'Chaman', 9: 'Démoniste', 10: 'Guerrier', 12: 'Neutre', 14: 'Chasseur de démons' };
const TYPES = { 3: 'hero', 4: 'minion', 5: 'spell', 7: 'weapon', 39: 'location' };
const RAR = { 1: 'C', 3: 'R', 4: 'E', 5: 'L' };

async function text(path) {
  if (LOCAL) return readFile(LOCAL + '/' + path.split('/').pop(), 'utf8');
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(RAW + path); if (r.ok) return await r.text(); console.warn(`HTTP ${r.status} sur ${path}`); }
    catch (e) { console.warn(`Erreur réseau sur ${path} : ${e.message}`); }
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
  throw new Error('Téléchargement impossible : ' + path);
}

const [xml, glob, enums] = await Promise.all([
  text('/hsdata/master/CardDefs.xml'),
  text('/hsdata/master/Strings/frFR/GLOBAL.txt'),
  text('/python-hearthstone/master/hearthstone/enums.py'),
]);

// Noms français des extensions
const G = {};
for (const line of glob.split(/\r?\n/)) { const [k, v] = line.split('\t'); if (k && v) G[k] = v.trim(); }
// Identifiants numériques des extensions
const blk = enums.slice(enums.indexOf('class CardSet'));
const setIds = {};
for (const m of blk.slice(0, blk.indexOf('\nclass ', 10)).matchAll(/\n\t([A-Z0-9_]+) = (\d+)/g)) setIds[+m[2]] = m[1];

const tag = (body, name) => { const m = body.match(new RegExp(`name="${name}" type="Int" value="(-?\\d+)"`)); return m ? +m[1] : null; };
const bySet = {};
for (const m of xml.matchAll(/<Entity CardID="([^"]+)"[^>]*>([\s\S]*?)<\/Entity>/g)) {
  const [, cid, body] = m;
  if (tag(body, 'COLLECTIBLE') !== 1 || tag(body, 'MINI_SET') === 1) continue;
  const r = RAR[tag(body, 'RARITY')]; if (!r) continue;
  const setName = setIds[tag(body, 'CARD_SET')]; if (!setName || SKIP.has(setName)) continue;
  const nm = body.match(/name="CARDNAME" type="LocString">[\s\S]*?<frFR>([^<]*)<\/frFR>/);
  const cost = tag(body, 'COST'), atk = tag(body, 'ATK'), hp = tag(body, 'HEALTH') ?? tag(body, 'DURABILITY');
  (bySet[setName] ||= []).push([cid, nm ? nm[1].replace(/&apos;/g, '’').replace(/'/g, '’').replace(/&amp;/g, '&') : cid, r,
    CLASSES[tag(body, 'CLASS')] || 'Neutre', cost ?? '', TYPES[tag(body, 'CARDTYPE')] || 'other', atk ?? '', hp ?? '']);
}

const sets = [], cards = [];
for (const [key, list] of Object.entries(bySet)) {
  const known = KNOWN[key];
  const rs = new Set(list.map(c => c[2]));
  // Une nouvelle extension est prise en compte si elle a les 4 raretés et une taille d'extension complète
  if (!known && !(list.length >= 120 && ['C', 'R', 'E', 'L'].every(r => rs.has(r)))) continue;
  const gkey = known ? known[0] : key;
  let name = G['GLOBAL_CARD_SET_' + gkey] || key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
  if (name === name.toUpperCase()) name = name.charAt(0) + name.slice(1).toLowerCase();
  const date = known ? known[1] : new Date().toISOString().slice(0, 10);
  sets.push({ key, name, date, year: +date.slice(0, 4), count: list.length });
  list.sort((a, b) => a[3].localeCompare(b[3], 'fr') || (+a[4] || 0) - (+b[4] || 0) || a[1].localeCompare(b[1], 'fr'));
  for (const c of list) cards.push([key, ...c]);
}
sets.sort((a, b) => a.date.localeCompare(b.date));

let previous = null;
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const out = { updated: new Date().toISOString().slice(0, 10), source: 'HearthSim (hsdata)', sets, cards };
if (previous && JSON.stringify({ ...previous, updated: '' }) === JSON.stringify({ ...out, updated: '' })) {
  console.log('Aucune nouveauté.');
} else {
  await mkdir('data', { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  console.log(`${sets.length} extensions, ${cards.length} cartes écrites dans ${OUT}.`);
}
