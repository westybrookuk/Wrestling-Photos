/**
 * Browser-path smoke test for the portrait component.
 *
 * jsdom cannot execute <script type="module">, so instead of loading the page this
 * test drives the demo's exported render functions against a real DOM and fires the
 * load/error events itself. That is deterministic (no network), and it exercises the
 * code that only runs in a browser: initPortraits and its delegated handlers.
 *
 * Requires jsdom, which is a dev-only convenience and deliberately not a dependency
 * of the shipped system:  npm install --no-save jsdom
 *
 * Run: node tools/demo-smoke.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('SKIP: jsdom is not installed (npm install --no-save jsdom)');
  process.exit(0);
}

const { mount, buildRows } = await import('../demo/demo.js');
const manifest = JSON.parse(readFileSync(join(ROOT, 'data/portraits.json'), 'utf8'));
const roster = JSON.parse(readFileSync(join(ROOT, 'data/roster-manifest.json'), 'utf8'));

let pass = 0; let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`); }
};

const html = readFileSync(join(ROOT, 'demo/index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/demo/index.html', pretendToBeVisual: true });
const doc = dom.window.document;
const { rows } = mount(doc, { manifest, roster }, '../');

console.log('\nBrowser-path smoke test');

const portraits = doc.querySelectorAll('.pt');
const imgs = doc.querySelectorAll('.pt__img');
const fbs = doc.querySelectorAll('.pt__fb');

check('roster rendered every demo row', doc.querySelectorAll('#roster .row').length === rows.length,
  `${doc.querySelectorAll('#roster .row').length} of ${rows.length}`);
check('every portrait has exactly one fallback layer', fbs.length === portraits.length,
  `${fbs.length} fallbacks / ${portraits.length} portraits`);
// 3 in the roster list (96px) + 2 for the profile (192px + 384px hero)
// + 2 in the first match card (48px x2 corners)
check('portraits with a mapped file carry an image', imgs.length === 7, `${imgs.length}`);
check('no inline event handlers anywhere', !dom.serialize().includes('onerror'));
check('image srcs are local and relative',
  [...imgs].every((i) => i.getAttribute('src').startsWith('../assets/')),
  [...imgs].map((i) => i.getAttribute('src')).slice(0, 2).join(', '));
check('list images are lazy, hero is eager',
  [...imgs].filter((i) => i.getAttribute('loading') === 'lazy').length === imgs.length - 1);
check('images carry intrinsic width and height', [...imgs].every((i) => i.getAttribute('width') && i.getAttribute('height')));
check('generated workers are labelled, not errored',
  doc.querySelector('#matchcard').textContent.includes('never an error state'));
check('coverage line reports zero broken images', /broken images\s*0/.test(doc.querySelector('#stats').textContent));
check('profile shows licence evidence', doc.querySelector('#profile').textContent.includes('Licence evidence'));
check('credits list rendered', doc.querySelectorAll('#credits li').length >= 25,
  `${doc.querySelectorAll('#credits li').length}`);

/* ---- load path: the fade-in class is applied by the delegated listener ---- */
const firstImg = imgs[0];
firstImg.dispatchEvent(new dom.window.Event('load'));
check('delegated load handler fades the image in', firstImg.classList.contains('pt__img--in'));

/* ---- error path: one failure retires the image, fallback stays ---- */
const cellsBefore = doc.querySelectorAll('.pt').length;
const victim = imgs[1];
const host = victim.parentNode;
victim.dispatchEvent(new dom.window.Event('error'));
check('failed image is removed from the DOM', !host.querySelector('.pt__img'));
check('container is marked missing', host.classList.contains('pt--missing'), host.className);
check('the fallback is still present after failure', Boolean(host.querySelector('.pt__fb')));
check('no portrait cell is lost when an image fails', doc.querySelectorAll('.pt').length === cellsBefore);
check('a second error event on the same image is harmless',
  (() => { victim.dispatchEvent(new dom.window.Event('error')); return doc.querySelectorAll('.pt').length === cellsBefore; })());

/* ---- changing a src to a broken path must not break the cell ---- */
doc.querySelector('#breakImg').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
check('breaking srcs keeps every cell intact', doc.querySelectorAll('.pt').length === cellsBefore);
check('the failure note is revealed', doc.querySelector('#breakNote').hidden === false);

/* ---- repaint sanity ---- */
doc.querySelector('#pickRandom').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
check('booking another card re-renders without throwing',
  doc.querySelectorAll('#matchcard .corner').length >= 2);

console.log(`\n${pass} passed, ${fail} failed`);
dom.window.close();
process.exit(fail ? 1 : 0);
