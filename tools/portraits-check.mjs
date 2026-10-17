/**
 * Portrait manifest validator.
 *
 * Fails the build on: unknown identities, duplicate ids, broken share links,
 * unacceptable licences, missing provenance, missing files, oversized files,
 * and one photo reused for two unrelated people.
 *
 * Usage:
 *   node tools/portraits-check.mjs            # validates manifest + whatever exists on disk
 *   node tools/portraits-check.mjs --strict   # additionally fails if a cleared row has no files
 *   node tools/portraits-check.mjs --json     # machine-readable report
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const AS_JSON = args.includes('--json');

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const manifest = read('data/portraits.json');
const roster = read('data/roster-manifest.json');
const policy = manifest.policy;

/* ------------------------------------------------------- identity integrity */
const knownIds = new Map(); // id -> Set(identity_class)
for (const r of roster.roster_identities) {
  if (!knownIds.has(r.id)) knownIds.set(r.id, new Set());
  knownIds.get(r.id).add(r.identity_class);
}
for (const r of roster.other_role_identities) {
  if (!knownIds.has(r.id)) knownIds.set(r.id, new Set());
  knownIds.get(r.id).add(r.identity_class);
}

const seen = new Map(); // `${class}:${id}` -> row
for (const row of manifest.portraits) {
  const key = `${row.identity_class}:${row.id}`;
  if (seen.has(key)) err(`duplicate row for ${key}`);
  seen.set(key, row);

  if (!knownIds.has(row.id)) {
    err(`${row.id}: id does not exist in the roster export`);
  } else if (!knownIds.get(row.id).has(row.identity_class)) {
    err(`${row.id}: identity_class "${row.identity_class}" does not match the roster export`);
  }
  if (!row.display_name) err(`${row.id}: missing display_name`);
  if (!['wrestler', 'manager', 'announcer'].includes(row.role)) {
    err(`${row.id}: unexpected role "${row.role}"`);
  }
}

/* ------------------------------------------------------- licensing integrity */
const accepted = new Set(policy.accepted_licenses);
const rejectedPatterns = [/^CC BY-NC/, /^CC BY-ND/, /^CC BY-NC-SA/, /^CC BY-NC-ND/, /^GFDL$/, /fair use/i, /non-free/i, /unverified/i];

for (const row of manifest.portraits) {
  if (row.status === 'absent') {
    if (!row.fallback_reason) err(`${row.id}: absent without a fallback_reason`);
    if (row.source) err(`${row.id}: absent but carries a source block`);
    continue;
  }
  if (!row.source) { err(`${row.id}: ${row.status} but no source block`); continue; }

  const lic = row.source.license;
  if (!accepted.has(lic)) err(`${row.id}: licence "${lic}" is not accepted by policy`);
  for (const re of rejectedPatterns) {
    if (re.test(String(lic))) err(`${row.id}: licence "${lic}" matches a rejected pattern ${re}`);
  }
  if (!row.source.page_url) err(`${row.id}: no source page URL`);
  if (!/^https:\/\//.test(String(row.source.page_url))) err(`${row.id}: source page URL is not https`);
  if (row.source.attribution_required && !row.source.author) {
    err(`${row.id}: attribution required but no author recorded`);
  }
  if (row.source.attribution_required && !row.source.license_url) {
    err(`${row.id}: attribution required but no licence URL recorded`);
  }
  if (row.source.share_alike && !/-SA/.test(String(lic))) {
    warn(`${row.id}: share_alike set but licence "${lic}" is not a -SA licence`);
  }
  if (row.source.original_sha256 && !/^[0-9a-f]{64}$/.test(row.source.original_sha256)) {
    err(`${row.id}: original_sha256 is not a sha256 hex digest`);
  }
  if (row.source.sha256_status === 'pending-fetch' && row.files) {
    err(`${row.id}: files present but hash still marked pending-fetch`);
  }
  if (!row.verification || row.verification.status !== 'cleared') {
    err(`${row.id}: status "${row.status}" but verification.status is not "cleared"`);
  }
  if (STRICT && !row.files) {
    err(`${row.id}: --strict and this cleared row has no files on disk yet`);
  }
}

/* ----------------------------------------------------------- share integrity */
const shared = {};
for (const row of manifest.portraits) {
  if (row.shares_with_id) shared[row.id] = row.shares_with_id;
  for (const other of row.shared_with_ids || []) shared[other] = row.id;
}
for (const [from, to] of Object.entries(shared)) {
  if (from === to) { err(`shared-photo self-reference: ${from}`); continue; }
  if (!seen.has(`wrestler_roster:${to}`) && !seen.has(`announcer:${to}`)) {
    err(`shared-photo target "${to}" has no manifest row`);
  }
  if (shared[to]) err(`shared-photo chain (must point directly at the owner): ${from} -> ${to} -> ${shared[to]}`);
}

/* ------------------------------------------------------------ file integrity */
const budgets = policy.budgets_kb;
const fileOwner = new Map();
let filesChecked = 0;
let bytesTotal = 0;

function checkPath(row, size, rel) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) { err(`${row.id}: file missing on disk: ${rel}`); return; }
  const st = statSync(abs);
  bytesTotal += st.size;
  filesChecked += 1;
  const kb = st.size / 1024;
  const cap = budgets[size];
  // Preview plates are stand-ins and are exempt from production budgets.
  if (!row.preview_files && cap && kb > cap) {
    err(`${row.id}: ${size} is ${kb.toFixed(1)} KB, over the ${cap} KB budget`);
  }
  if (rel.includes('..')) err(`${row.id}: path escapes the asset root: ${rel}`);
}

for (const row of manifest.portraits) {
  const sets = [['files', row.files], ['preview_files', row.preview_files]];
  for (const [name, set] of sets) {
    if (!set) continue;
    for (const size of policy.sizes ? Object.keys(policy.sizes) : ['thumb', 'small', 'medium', 'large']) {
      if (!set[size]) { err(`${row.id}: ${name} is missing the "${size}" size`); continue; }
      checkPath(row, size, set[size]);
    }
    if (name === 'files') {
      for (const rel of Object.values(set)) {
        if (fileOwner.has(rel) && fileOwner.get(rel) !== row.id) {
          err(`file reused for two identities: ${rel} (${fileOwner.get(rel)} and ${row.id})`);
        }
        fileOwner.set(rel, row.id);
      }
    }
  }
  if (row.preview_files && !row.preview_files.thumb.includes('_testplate')) {
    warn(`${row.id}: preview_files does not look like a test plate`);
  }
}

/* ----------------------------------------------------------------- reporting */
const byStatus = {};
const byRole = {};
const byEra = {};
for (const row of manifest.portraits) {
  byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  byRole[row.role] = (byRole[row.role] || 0) + 1;
  const e = row.photo ? row.photo.era_match : 'none';
  byEra[e] = (byEra[e] || 0) + 1;
}

const withPhoto = manifest.portraits.filter((r) => r.status !== 'absent').length;
const report = {
  schema: manifest.schema,
  rows: manifest.portraits.length,
  by_status: byStatus,
  by_role: byRole,
  by_era: byEra,
  with_cleared_photo: withPhoto,
  fallback_share: `${(((manifest.portraits.length - withPhoto) / manifest.portraits.length) * 100).toFixed(0)}%`,
  files_on_disk: filesChecked,
  total_file_kb: Math.round(bytesTotal / 1024),
  unresolved_licensing_questions: manifest.unresolved.length,
  errors,
  warnings,
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`portrait manifest: ${report.rows} staff rows (${JSON.stringify(byStatus)})`);
  console.log(`  photos cleared : ${withPhoto}/${report.rows}  (fallback share ${report.fallback_share})`);
  console.log(`  era breakdown  : ${JSON.stringify(byEra)}`);
  console.log(`  files on disk  : ${filesChecked} (${report.total_file_kb} KB)`);
  console.log(`  open licensing questions: ${report.unresolved_licensing_questions}`);
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  console.log(errors.length ? `FAILED with ${errors.length} error(s)` : 'OK - manifest valid');
}

process.exit(errors.length ? 1 : 0);
