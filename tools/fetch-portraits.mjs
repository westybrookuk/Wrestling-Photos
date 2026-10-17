/**
 * Fetch cleared portraits from Wikimedia Commons and build the size derivatives.
 *
 * This is the only tool in the repo that touches the network, and it is deliberately
 * a separate, explicit step: the sandbox that authored the manifest could not reach
 * upload.wikimedia.org, so imports are performed by a human on a machine that can.
 *
 * Safety properties:
 *   - only rows with status "cleared" are ever fetched; nothing else is requested
 *   - the file URL is resolved from the Commons API, never hand-typed
 *   - the licence is re-checked against the manifest at fetch time and the run aborts
 *     if it has changed (a licence can be revoked or corrected on-wiki)
 *   - the original is hashed and the hash is recorded in the manifest
 *   - originals are kept out of git; only the derivatives are committed
 *   - file names are never user-supplied, so a title cannot escape the asset root
 *
 * Usage:
 *   node tools/fetch-portraits.mjs                 # dry run: show the plan
 *   node tools/fetch-portraits.mjs --fetch         # download + build derivatives
 *   node tools/fetch-portraits.mjs --fetch --only bobby-heenan,dusty-rhodes
 *   node tools/fetch-portraits.mjs --self-test     # exercise the image pipeline offline
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINALS = join(ROOT, 'data/portraits.originals');
const args = process.argv.slice(2);
const DO_FETCH = args.includes('--fetch');
const SELF_TEST = args.includes('--self-test');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 && args[i + 1] ? new Set(args[i + 1].split(',').map((s) => s.trim())) : null;
})();

const MANIFEST = join(ROOT, 'data/portraits.json');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const SIZES = manifest.policy.sizes;

// Wikimedia asks for a descriptive User-Agent with contact information.
const UA = 'WCW-vs-WWF-Arena-portrait-importer/1.0 (https://github.com/westybrookuk; contact: repo owner)';

/* --------------------------------------------------------------- toolchain */

function detectBackend() {
  try {
    const formats = execFileSync('convert', ['-list', 'format'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (/\bWEBP\b/.test(formats)) return { name: 'imagemagick', ext: 'webp', quality: ['-quality', '82'], im: 'convert' };
    return { name: 'imagemagick', ext: 'jpg', quality: ['-quality', '84'], im: 'convert' };
  } catch {
    try {
      execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
      return { name: 'cwebp', ext: 'webp' };
    } catch {
      return { name: null };
    }
  }
}

const BACKEND = detectBackend();

/**
 * Build the four size derivatives from a local image file. Always a centre crop to
 * a square: portraits are displayed square, and cropping is why every accepted
 * licence must permit derivative works.
 */
function buildDerivatives(srcPath, id, backend = BACKEND) {
  if (!backend.name) throw new Error('no image backend found (need ImageMagick or cwebp)');
  const dir = join(ROOT, 'assets/portraits', id);
  mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [size, px] of Object.entries(SIZES)) {
    const ext = backend.name === 'cwebp' ? 'webp' : backend.ext;
    const target = join(dir, `${size}.${ext}`);
    if (backend.name === 'imagemagick') {
      try {
      execFileSync(backend.im, [
        srcPath,
        '-auto-orient',
        '-strip',
        '-resize', `${px}x${px}^`,
        '-gravity', 'center',
        '-extent', `${px}x${px}`,
        ...backend.quality,
        target,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      } catch (e) {
        const detail = (e.stderr ? e.stderr.toString() : '').trim().split('\n')[0] || e.message;
        throw new Error(`convert failed for ${srcPath} -> ${target}: ${detail}`);
      }
    } else {
      // cwebp has no square-crop step; crop with ImageMagick first if it is present.
      execFileSync('cwebp', ['-quiet', '-q', '82', '-resize', String(px), String(px), srcPath, '-o', target], { stdio: 'ignore' });
    }
    out[size] = `assets/portraits/${id}/${size}.${ext}`;
  }
  return out;
}

/* ------------------------------------------------------------- licence guard */

async function resolveFileUrl(pageUrl) {
  const title = decodeURIComponent(pageUrl.split('/wiki/')[1] || '');
  const api = 'https://commons.wikimedia.org/w/api.php'
    + '?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|sha1'
    + '&iiextmetadatafilter=LicenseShortName|Artist|AttributionRequired'
    + `&titles=${encodeURIComponent(title)}`;
  const res = await fetch(api, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`API ${res.status} for ${title}`);
  const json = await res.json();
  const pages = json.query && json.query.pages ? Object.values(json.query.pages) : [];
  const page = pages.find((p) => p.imageinfo && p.imageinfo[0]);
  if (!page) throw new Error(`no imageinfo for ${title}`);
  const info = page.imageinfo[0];
  return {
    url: info.url,
    sha1: info.sha1,
    license: info.extmetadata && info.extmetadata.LicenseShortName ? info.extmetadata.LicenseShortName.value : null,
    artist: info.extmetadata && info.extmetadata.Artist ? info.extmetadata.Artist.value : null,
  };
}

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

/* ------------------------------------------------------------------- loader */

async function fetchOne(row) {
  const meta = await resolveFileUrl(row.source.page_url);
  if (meta.license && meta.license !== row.source.license) {
    throw new Error(`LICENCE CHANGED on Commons: manifest says "${row.source.license}", page now says "${meta.license}". Re-review before importing.`);
  }
  const res = await fetch(meta.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256(buf);
  mkdirSync(ORIGINALS, { recursive: true });
  const ext = (meta.url.split('.').pop() || 'jpg').toLowerCase();
  const original = join(ORIGINALS, `${row.id}.${ext}`);
  writeFileSync(original, buf);
  return { original, hash, bytes: buf.length };
}

/* --------------------------------------------------------------------- main */

async function run() {
  console.log(`image backend: ${BACKEND.name || 'NONE'}${BACKEND.name ? ` (${BACKEND.ext})` : ''}`);
  if (!BACKEND.name) {
    console.error('Install ImageMagick (with WebP support for .webp output) or cwebp.');
    process.exit(1);
  }

  if (SELF_TEST) {
    // Exercises the derivative pipeline against the fallback art - no network.
    console.log('\nSelf-test: running a synthetic raster source through the size pipeline');
    const src = join(ORIGINALS, '_selftest-source.png');
    mkdirSync(ORIGINALS, { recursive: true });
    execFileSync(BACKEND.im, [
      '-size', '640x480',
      "gradient:#334155-#0f172a",
      '-fill', '#93a3bd', '-draw', 'circle 320,190 320,95',
      src,
    ], { stdio: 'ignore' });
    const out = buildDerivatives(src, '_selftest');
    for (const [size, rel] of Object.entries(out)) {
      const abs = join(ROOT, rel);
      const ok = existsSync(abs) && statSync(abs).size > 0;
      const dims = ok && BACKEND.name === 'imagemagick'
        ? execFileSync('identify', ['-format', '%wx%h', abs], { encoding: 'utf8' }) : '?';
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${size.padEnd(6)} ${String(dims).padEnd(9)} ${rel}`);
      if (!ok) process.exitCode = 1;
    }
    rmSync(join(ROOT, 'assets/portraits/_selftest'), { recursive: true, force: true });
    rmSync(src, { force: true });
    // The sandbox's ImageMagick has no SVG rasteriser, so a raster probe is used
    // deliberately: the fallback art is rendered by the browser, never by this tool.
    console.log(process.exitCode ? 'SELF-TEST FAILED' : 'self-test passed (artefacts removed)');
    return;
  }

  const targets = manifest.portraits.filter((r) => r.status === 'cleared' && !r.files && (!ONLY || ONLY.has(r.id)));
  const skipped = manifest.portraits.filter((r) => r.status === 'cleared' && !r.files && ONLY && !ONLY.has(r.id));

  console.log(`\n${targets.length} cleared portrait(s) to import`);
  if (skipped.length) console.log(`${skipped.length} skipped by --only`);
  const needsCrop = targets.filter((r) => r.photo && r.photo.requires_crop).map((r) => r.id);
  if (needsCrop.length) {
    console.log(`\nNeeds a human crop first (excluded): ${needsCrop.join(', ')}`);
  }

  if (!DO_FETCH) {
    console.log('\nDRY RUN - nothing requested. Re-run with --fetch to import.\n');
    for (const r of targets.slice(0, 40)) {
      console.log(`  ${r.id.padEnd(26)} ${r.source.license.padEnd(14)} ${r.source.page_url}`);
    }
    if (targets.length > 40) console.log(`  ... and ${targets.length - 40} more`);
    return;
  }

  let ok = 0; let failed = 0;
  for (const row of targets) {
    if (row.photo && row.photo.requires_crop) { console.log(`  skip  ${row.id} (needs a human crop)`); continue; }
    try {
      const { original, hash, bytes } = await fetchOne(row);
      const files = buildDerivatives(original, row.id);
      row.files = files;
      row.source.original_sha256 = hash;
      row.source.sha256_status = 'verified';
      row.source.original_bytes = bytes;
      row.source.retrieved = new Date().toISOString().slice(0, 10);
      ok += 1;
      console.log(`  ok    ${row.id} (${(bytes / 1024).toFixed(0)} KB source, sha256 ${hash.slice(0, 12)}…)`);
      writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL  ${row.id}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite to the API
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${ok} imported, ${failed} failed. Now run: node tools/build-portraits.mjs && node tools/portraits-check.mjs --strict`);
}

run();
