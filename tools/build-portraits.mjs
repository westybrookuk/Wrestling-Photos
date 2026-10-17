/**
 * Build the runtime index and the attribution file from data/portraits.json.
 *
 * The runtime never reads licence data: it reads js/portraits.data.js, which carries
 * only paths and the credit line. That keeps the shipped bundle small and means a
 * licence mistake is caught at build time rather than at render time.
 *
 * Usage: node tools/build-portraits.mjs
 * Writes: js/portraits.data.js, docs/ATTRIBUTIONS.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

function nameKey(name) {
  return String(name == null ? '' : name)
    .normalize('NFKD').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function creditLine(row) {
  const s = row.source;
  if (!s) return null;
  const who = s.author || null;
  if (!s.attribution_required) {
    return who
      ? `${row.display_name} — ${who}, public domain, via Wikimedia Commons`
      : `${row.display_name} — public domain, via Wikimedia Commons`;
  }
  return `${row.display_name} — Photo: ${who || 'unknown'}, ${s.license}, via Wikimedia Commons`;
}

function main() {
  const manifest = read('data/portraits.json');
  const roster = read('data/roster-manifest.json');

  /* ---------------------------------------------------- manifest self-checks */
  const problems = [];
  const accepted = manifest.policy.accepted_licenses;
  for (const row of manifest.portraits) {
    if (row.status !== 'cleared') continue;
    if (!row.source) problems.push(`${row.id}: cleared but has no source block`);
    else {
      if (!accepted.includes(row.source.license)) {
        problems.push(`${row.id}: licence "${row.source.license}" is not in accepted_licenses`);
      }
      if (!row.source.page_url) problems.push(`${row.id}: no source page URL`);
      if (row.source.attribution_required && !row.source.author) {
        problems.push(`${row.id}: attribution required but no author recorded`);
      }
    }
  }
  // Ids must never collide across identity classes with divergent photos.
  const byId = new Map();
  for (const row of manifest.portraits) {
    if (!byId.has(row.id)) byId.set(row.id, row);
    else {
      const a = byId.get(row.id);
      if ((a.source && a.source.page_url) !== (row.source && row.source.page_url)) {
        problems.push(`${row.id}: same id in two identity classes with different photos`);
      }
    }
  }
  if (problems.length) {
    console.error('Refusing to build - manifest problems:');
    for (const p of problems) console.error('  -', p);
    process.exit(1);
  }

  /* ------------------------------------------------------------- the index */
  const index = {};
  for (const row of manifest.portraits) {
    // Test plates live in the manifest so the validator can audit them too.
    const previewFiles = row.preview_files || null;
    index[row.id] = {
      identity_class: row.identity_class,
      display_name: row.display_name,
      role: row.role,
      company_context: row.company_context || null,
      status: row.status,
      files: row.files || null,
      preview_files: previewFiles,
      preview: Boolean(previewFiles),
      credit: creditLine(row),
      preview_note: row.preview_note || null,
      license: row.source ? row.source.license : null,
      license_url: row.source ? row.source.license_url : null,
      attribution_required: row.source ? row.source.attribution_required : false,
      share_alike: row.source ? row.source.share_alike : false,
      source_page: row.source ? row.source.page_url : null,
      era_match: row.photo ? row.photo.era_match : null,
      reason: row.fallback_reason || null,
    };
  }

  // Shared photos: both directions are declared in the manifest; normalise to one map.
  const shared = {};
  for (const row of manifest.portraits) {
    if (row.shares_with_id) shared[row.id] = row.shares_with_id;
    for (const other of row.shared_with_ids || []) shared[other] = row.id;
  }
  for (const [from, to] of Object.entries(shared)) {
    if (shared[to]) throw new Error(`shared-photo cycle: ${from} -> ${to}`);
    if (!index[to]) throw new Error(`shared-photo target missing: ${to}`);
  }

  // Name keys exist ONLY for strings that genuinely have no id (DEV_COACHES, owner
  // labels, commentary fallbacks). Ambiguous names are deliberately not indexed -
  // that is what keeps the Arturo Rivera painter collision impossible.
  const nameKeys = {};
  const ambiguous = new Set();
  for (const rec of [...roster.roster_identities, ...roster.other_role_identities]) {
    const k = nameKey(rec.display_name);
    if (!k) continue;
    if (nameKeys[k] && nameKeys[k] !== rec.id) { ambiguous.add(k); continue; }
    nameKeys[k] = rec.id;
  }
  for (const k of ambiguous) delete nameKeys[k];
  for (const k of Object.keys(nameKeys)) {
    // Keep only names that lead to an identity which either has a cleared photo or
    // will have one once fetched. A name must never be a route to a photo we do not
    // have, because that would turn "no photo yet" into a misleading pending state.
    const entry = index[nameKeys[k]];
    if (!entry || entry.status !== 'cleared') delete nameKeys[k];
  }

  // Documented display-name variants. Ids never change; the label may.
  const variants = {};
  for (const rec of roster.roster_identities) {
    for (const v of rec.known_name_variants || []) {
      const name = v.name || v.display_name;
      if (!name) continue;
      variants[rec.id] = variants[rec.id] || [];
      variants[rec.id].push({ name, basis: v.basis || null, from_turn: null });
    }
  }

  const header = `/**
 * GENERATED FILE - do not edit by hand.
 * Produced by tools/build-portraits.mjs from data/portraits.json.
 * Source of truth for identity: data/roster-manifest.json
 * Manifest schema: ${manifest.schema}   Generated: ${manifest.generated}
 * Rows: ${manifest.portraits.length} staff (${manifest.stats.cleared} with a cleared photo, ${manifest.stats.absent} with none yet)
 *
 * This file carries paths and credits only. It contains no licence logic and no
 * image data, and it must never be written into a save file.
 */

`;

  const js = header
    + `export const PORTRAIT_INDEX = ${JSON.stringify(index, null, 2)};\n\n`
    + `export const PORTRAIT_SHARED = ${JSON.stringify(shared, null, 2)};\n\n`
    + `export const PORTRAIT_NAME_KEYS = ${JSON.stringify(nameKeys, null, 2)};\n\n`
    + `export const PORTRAIT_VARIANTS = ${JSON.stringify(variants, null, 2)};\n`;
  writeFileSync(join(ROOT, 'js/portraits.data.js'), js);

  /* --------------------------------------------------------- attributions */
  const credited = manifest.portraits.filter((r) => r.source && r.source.attribution_required);
  const pd = manifest.portraits.filter((r) => r.source && !r.source.attribution_required);
  const byLicence = new Map();
  for (const row of credited) {
    const key = row.source.license;
    if (!byLicence.has(key)) byLicence.set(key, []);
    byLicence.get(key).push(row);
  }
  const pdByAuthor = new Map();
  for (const row of pd) {
    const key = row.source.author || 'Author not recorded';
    if (!pdByAuthor.has(key)) pdByAuthor.set(key, []);
    pdByAuthor.get(key).push(row);
  }

  let md = `# Portrait attributions\n\n`;
  md += `Generated from \`data/portraits.json\` on ${manifest.generated} by \`tools/build-portraits.mjs\`.\n`;
  md += `Do not edit by hand — regenerate instead.\n\n`;
  md += `**${manifest.portraits.length} staff identities** are in the manifest: `;
  md += `**${manifest.stats.cleared}** with a licence-cleared photo and **${manifest.stats.absent}** `;
  md += `with no cleared photo yet (those render the built-in fallback portrait).\n\n`;
  md += `Photos are cropped and scaled for display. Cropping and scaling are modifications, `;
  md += `which is why every licence below permits derivative works.\n\n`;

  if (credited.length) {
    md += `## Attribution required\n\n`;
    for (const [licence, rows] of [...byLicence.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      md += `### ${licence}\n\n`;
      for (const row of rows) {
        md += `- **${row.display_name}** (\`${row.id}\`) — photo by ${row.source.author}`;
        md += `, [${row.source.license}](${row.source.license_url})`;
        md += row.source.share_alike ? ` (share-alike: adaptations of this photo stay under ${row.source.license})` : '';
        md += ` — [source](${row.source.page_url})\n`;
        if (row.source.restrictions === 'personality') {
          md += `  - ⚠️ Commons flags **personality rights** on this file. The licence clears copyright only. Used under a neutral crop, with no promotion marks and no endorsement implied.\n`;
        }
        if (row.photo && row.photo.era_match === 'modern') {
          md += `  - Era note: photographed ${row.photo.date}. Retained for recognition value; flagged for the owner's era decision.\n`;
        }
      }
      md += `\n`;
    }
  }

  if (pd.length) {
    md += `## Public domain — no attribution required\n\n`;
    md += `Credited voluntarily and listed here so provenance is never lost.\n\n`;
    for (const [author, rows] of [...pdByAuthor.entries()]) {
      md += `- **${author}**\n`;
      for (const row of rows) {
        md += `  - ${row.display_name} (\`${row.id}\`)`;
        if (row.photo && row.photo.date) md += `, photographed ${row.photo.date}`;
        md += ` — [source](${row.source.page_url})\n`;
      }
    }
    md += `\n`;
  }

  md += `## Identity-layer notes\n\n`;
  md += `- Keys are stable source ids, never display names. Two identities that share a photo keep separate rows.\n`;
  md += `- Photographed rows are matched to identities by **stable id**; the name index exists only for the few `;
  md += `strings in the game that carry no id (the development-coach pool, owner labels, commentary fallbacks).\n`;
  md += `- Ambiguous names are deliberately left unindexed. The name "Arturo Rivera" is the worked example: `;
  md += `the canonical file under that name is a self-portrait by a Mexican painter, a different person.\n`;

  writeFileSync(join(ROOT, 'docs/ATTRIBUTIONS.md'), md);

  console.log(`js/portraits.data.js  : ${Object.keys(index).length} entries, ${Object.keys(shared).length} shared, ${Object.keys(nameKeys).length} name keys`);
  console.log(`docs/ATTRIBUTIONS.md  : ${credited.length} attributed, ${pd.length} public domain`);
  console.log(`stats                 : ${JSON.stringify(manifest.stats.era_breakdown)}`);
}

main();
