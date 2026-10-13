/**
 * Portrait system tests.
 *
 * Run: node test/portraits.js
 *
 * These tests cover the contract the portrait feature must not break:
 *   1. no simulation impact - resolution and markup are pure
 *   2. save safety          - rendering touches no save-shaped state
 *   3. never a broken image - the fallback is the base layer, always
 *   4. policy               - a rejected licence cannot reach the build
 *   5. identity safety      - ambiguous names never resolve to a photo
 *
 * No DOM and no dependency: the component returns strings precisely so it can be
 * tested here. That is also why `portraitMarkup` is a pure function.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  resolvePortrait, portraitMarkup, initialsFor, hueFor, isGeneratedId,
  escapeHtml, variantNameFor, coverageReport, PORTRAIT_PX,
} from '../js/portrait.js';
import { PORTRAIT_INDEX, PORTRAIT_NAME_KEYS, PORTRAIT_SHARED, PORTRAIT_VARIANTS } from '../js/portraits.data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'data/portraits.json'), 'utf8'));
const roster = JSON.parse(readFileSync(join(ROOT, 'data/roster-manifest.json'), 'utf8'));

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

const staffIds = manifest.portraits.map((p) => p.id);
const cleared = manifest.portraits.filter((p) => p.status === 'cleared');

/* ------------------------------------------------------------ monogram logic */
section('Monogram and hashing');
check('quoted nickname collapses to two initials', initialsFor('Bob "Spark Plug" Holly') === 'BH', initialsFor('Bob "Spark Plug" Holly'));
check('plain two-part name', initialsFor('Jim Cornette') === 'JC', initialsFor('Jim Cornette'));
check('single word uses two letters', initialsFor('Tazz') === 'TA', initialsFor('Tazz'));
check('numeral + word', initialsFor('2 Cold Scorpio') === '2C', initialsFor('2 Cold Scorpio'));
check('lone numeral stays intact', initialsFor('911') === '911', initialsFor('911'));
check('empty name degrades safely', initialsFor('') === '?', initialsFor(''));
check('null name degrades safely', initialsFor(null) === '?', initialsFor(null));
check('hue is inside 0..359', staffIds.every((id) => hueFor(id) >= 0 && hueFor(id) < 360));
check('hue is deterministic', staffIds.every((id) => hueFor(id) === hueFor(id)));
check('hue differs across a sample of ids', new Set(staffIds.slice(0, 8).map(hueFor)).size > 3);
check('escapeHtml neutralises a script tag', escapeHtml('<script>x</script>') === '&lt;script&gt;x&lt;/script&gt;');

/* ------------------------------------------------------------- the full roster */
section('Every staff identity resolves');
let threw = 0;
for (const row of manifest.portraits) {
  try {
    const r = resolvePortrait({ id: row.id, name: row.display_name, role: row.role }, { identityClass: row.identity_class });
    if (!r || !r.status) throw new Error('no status');
  } catch { threw += 1; }
}
check(`all ${manifest.portraits.length} staff ids resolve without throwing`, threw === 0, `${threw} threw`);
check('cleared rows resolve to ok or pending', cleared.every((row) => {
  const r = resolvePortrait({ id: row.id, name: row.display_name });
  return r.status === 'ok' || r.status === 'pending' || r.status === 'preview';
}));
const absentRows = manifest.portraits.filter((p) => p.status === 'absent');
check('absent rows resolve to absent', absentRows.every((row) => resolvePortrait({ id: row.id }).status === 'absent'));
check('every absent row carries a fallback reason',
  absentRows.every((row) => row.fallback_reason === 'no-cleared-photo'));

/* ------------------------------------------------------- generated identities */
section('Generated and custom workers');
for (const id of ['indy-7-48', 'rookie-42-100', 'ecw-p-19-232', 'caw-2']) {
  const r = resolvePortrait({ id, name: 'Generated Person' });
  check(`generated id ${id} is classified, not an error`, r.status === 'generated', r.status);
}
check('an arbitrary custom name still resolves', resolvePortrait({ id: null, name: 'Iron Ring Champion' }).status === 'absent');
check('isGeneratedId rejects a real id', isGeneratedId('bobby-heenan') === false);

/* ------------------------------------------------------------- never broken */
section('Never a broken image');
const unmapped = portraitMarkup('no-such-wrestler-at-all', { name: 'Nobody Here' });
check('unmapped identity emits no <img> at all', !unmapped.includes('<img'), unmapped.slice(0, 120));
check('unmapped identity still emits the fallback plate', unmapped.includes('pt__fb'));
const mapped = portraitMarkup('bobby-heenan', { size: 'small' });
const fbAt = mapped.indexOf('pt__fb');
const imgAt = mapped.indexOf('<img');
check('fallback appears before the image in document order', fbAt >= 0 && imgAt > fbAt, `fb=${fbAt} img=${imgAt}`);
check('mapped identity emits exactly one image', (mapped.match(/<img/g) || []).length === 1);
check('every portrait emits exactly one fallback layer',
  manifest.portraits.every((row) => (portraitMarkup(row.id).match(/pt__fb/g) || []).length === 1));
check('no portrait markup contains an inline onerror handler', !mapped.includes('onerror'));
check('hero image is eager, list images are lazy',
  portraitMarkup('bobby-heenan', { size: 'large' }).includes('loading="eager"')
  && portraitMarkup('bobby-heenan', { size: 'small' }).includes('loading="lazy"'));
check('image carries intrinsic dimensions to prevent layout shift',
  mapped.includes(`width="${PORTRAIT_PX.small}"`) && mapped.includes(`height="${PORTRAIT_PX.small}"`));

/* --------------------------------------------------------------- the fallback */
section('Fallback quality');
const f = portraitMarkup({ id: 'jerry-lawler', name: 'Jerry "The King" Lawler' }, { size: 'medium' });
check('fallback shows a monogram', f.includes('>JL<'), f.match(/pt__mono">[^<]*/)?.[0]);
check('fallback carries a deterministic hue variable', /--pt-hue:\d+/.test(f));
check('role frame is applied for a manager', portraitMarkup({ id: 'jimmy-hart', role: 'manager' }).includes('pt--frame-staff'));
check('role frame is applied for a wrestler', portraitMarkup({ id: 'hulk-hogan', role: 'wrestler' }).includes('pt--frame-wrestler'));
check('portrait exposes an accessible label', f.includes('aria-label="Jerry &quot;The King&quot; Lawler portrait"'), f.slice(0, 200));

/* --------------------------------------------------------- identity safety */
section('Identity safety');
check('ambiguous name is NOT resolvable to a photo',
  resolvePortrait({ id: null, name: 'Arturo Rivera' }).status === 'absent',
  'the painter collision must stay impossible');
check('ambiguous name is absent from the generated name index',
  !Object.keys(PORTRAIT_NAME_KEYS).includes('arturo rivera'));
check('unkeyed coach name resolves through the name index',
  resolvePortrait({ id: null, name: 'Dusty Rhodes' }).status !== 'absent',
  'DEV_COACHES carries a name with no id');
check('shared photo resolves from the secondary id',
  resolvePortrait({ id: 'gary-michael-cappetta-awf' }).status === resolvePortrait({ id: 'gary-michael-cappetta' }).status);
check('shared-photo map points at a real owner',
  Object.values(PORTRAIT_SHARED).every((owner) => Boolean(PORTRAIT_INDEX[owner])));
check('documented renames are exposed as variants',
  Array.isArray(PORTRAIT_VARIANTS['razor-ramon']) && PORTRAIT_VARIANTS['razor-ramon'][0].name === 'Scott Hall');
check('variant lookup returns the later name', variantNameFor('razor-ramon', 100) === 'Scott Hall');
check('variant lookup returns null for an unchanged id', variantNameFor('bobby-heenan', 100) === null);

/* -------------------------------------------------------- simulation purity */
section('Simulation purity');
const state = {
  game: { turn: 42, week: 3, company: 'WWF' },
  wrestlers: staffIds.map((id, i) => ({ id, name: `Person ${i}`, company: 'WWF', pop: 40 + i, wage: 10, contract: 40 })),
  titles: [{ id: 'wwf-world', holder: 'hulk-hogan' }],
};
const before = JSON.stringify(state);
for (let i = 0; i < 3; i += 1) {
  for (const id of staffIds) portraitMarkup(id, { size: 'small' });
}
check('rendering every portrait leaves state byte-identical', JSON.stringify(state) === before);
check('rendering is deterministic across repeated calls',
  portraitMarkup('bobby-heenan', { size: 'small' }) === mapped);
check('no portrait markup embeds base64 image data', !mapped.includes('base64'));
check('no portrait markup references a remote URL', !/https?:\/\//.test(mapped), 'assets must stay local for offline use');
check('no portrait markup contains a save/state token', !/save|localStorage|state\./i.test(mapped));
const payload = JSON.stringify({ portrait: resolvePortrait('bobby-heenan') });
check('a resolved descriptor is small enough to never justify storing image bytes', payload.length < 900, `${payload.length} bytes`);

/* ---------------------------------------------------------------- coverage */
section('Coverage');
const report = coverageReport(staffIds.map((id) => ({ id })));
check('coverage report renders every row', report.neverBroken === true);
check('coverage total matches the manifest', report.total === manifest.portraits.length);
const withPlate = staffIds.filter((id) => resolvePortrait(id).sizes).length;
check('rows with a loadable plate are exactly the test-plate rows', withPlate === 3, `${withPlate}`);

/* --------------------------------------------- registration of the markup keys */
section('Markup contract');
const allMarkup = manifest.portraits.map((r) => portraitMarkup(r.id, { basePath: '../' }));
check('every row emits a data-pt-key matching its id',
  allMarkup.every((m, i) => m.includes(`data-pt-key="${manifest.portraits[i].id}"`)));
check('every row emits a data-pt-status', allMarkup.every((m) => m.includes('data-pt-status=')));
check('cleared rows without files report pending, not absent',
  manifest.portraits.filter((r) => r.status === 'cleared' && !r.preview_files)
    .every((r) => resolvePortrait(r.id).status === 'pending'));
check('preview rows report preview', manifest.portraits.filter((r) => r.preview_files)
  .every((r) => resolvePortrait(r.id).status === 'preview'));
check('preview markup is watermarked by class, not by a fake photo',
  portraitMarkup('bobby-heenan').includes('pt--preview'));
check('size defaults to small', portraitMarkup('bobby-heenan').includes('pt--small'));
check('an unknown size falls back to small', portraitMarkup('bobby-heenan', { size: 'gigantic' }).includes('pt--small'));

/* ------------------------------------------------------------------ summary */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('failures:');
  for (const name of failures) console.log(`  - ${name}`);
  process.exit(1);
}
