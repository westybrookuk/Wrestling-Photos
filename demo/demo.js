/**
 * M1 demo. Loads the real manifest and the real roster export, renders three
 * surfaces through the same component, and demonstrates the failure path.
 *
 * This page is a harness, not the game. The game integration is the three call
 * sites documented in docs/INTEGRATION.md.
 *
 * The render functions are exported and take an explicit `doc` so the browser path
 * can be driven by tools/demo-smoke.mjs without a browser. Every function here is
 * also safe to call with a jsdom document.
 */
import {
  resolvePortrait, portraitMarkup, initPortraits, coverageReport, attributionFor,
} from '../js/portrait.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function statusLabel(p) {
  if (p.status === 'ok') return 'photo';
  if (p.status === 'preview') return 'test plate';
  if (p.status === 'pending') return 'cleared — files pending fetch';
  if (p.status === 'generated') return 'generated worker';
  return 'fallback';
}

export function companyOf(row) {
  if (row.company_context) return row.company_context;
  if (Array.isArray(row.company_affiliations)) return row.company_affiliations.map((c) => c.company).join(', ');
  return '—';
}

function roleTag(role) {
  if (role === 'manager') return '<span class="tag tag--mgr">manager</span>';
  if (role === 'announcer') return '<span class="tag tag--ann">announcer</span>';
  return '<span class="tag tag--w">wrestler</span>';
}

/** Build the demo row list: every staff identity, a few wrestlers, two generated workers. */
export function buildRows({ manifest, roster }) {
  const staff = manifest.portraits.map((s) => ({ id: s.id, name: s.display_name, role: s.role }));
  // Real ids from the roster export. These are wrestler-wave identities, so every
  // one of them falls back today - that is the point of showing them.
  const wrestlers = ['hulk-hogan', 'ric-flair', 'shawn-michaels', 'bret-hart',
    'arn-anderson', 'aja-kong']
    .map((id) => roster.roster_identities.find((w) => w.id === id && w.role === 'wrestler'))
    .filter(Boolean)
    .map((w) => ({ id: w.id, name: w.display_name, role: 'wrestler' }));
  const generated = [
    { id: 'indy-14-96', name: 'Danny Havoc', role: 'wrestler' },
    { id: 'rookie-388-100', name: 'Rick Santos', role: 'wrestler' },
  ];
  return [...staff, ...wrestlers, ...generated];
}

export function renderRosterInto(doc, rows, basePath = '../') {
  doc.querySelector('#roster').innerHTML = rows.map((row) => {
    const p = resolvePortrait(row, { basePath });
    const credit = attributionFor(row.id);
    const short = credit && credit.includes('—') ? credit.split('—')[1].trim() : credit;
    return '<div class="row">'
      + portraitMarkup(row, { size: 'small', basePath })
      + `<div class="row__meta"><div class="row__name">${esc(row.name)}</div>`
      + `<div class="row__sub">${roleTag(row.role)}<span>${statusLabel(p)}</span></div>`
      + (credit ? `<div class="row__sub" title="${esc(credit)}"><span>${esc(short)}</span></div>` : '')
      + '</div></div>';
  }).join('');

  const report = coverageReport(rows, { basePath });
  doc.querySelector('#stats').innerHTML = [
    `<span>identities <b>${report.total}</b></span>`,
    `<span>with a plate <b>${report.ok + report.preview}</b></span>`,
    `<span>cleared, awaiting fetch <b>${report.pending}</b></span>`,
    `<span>fallback <b>${report.generated + report.absent}</b></span>`,
    `<span>broken images <b>0</b></span>`,
  ].join('');
  return report;
}

export function renderProfileInto(doc, target, ctx, basePath = '../') {
  const key = typeof target === 'string' ? target : target.key;
  const row = ctx.manifest.portraits.find((p) => p.id === key)
    || ctx.roster.other_role_identities.find((p) => p.id === key)
    || ctx.roster.roster_identities.find((p) => p.id === key)
    || { id: key, display_name: (target && target.label) || key, role: 'wrestler' };
  const p = resolvePortrait(row, { basePath });
  const credit = attributionFor(row.id);

  doc.querySelector('#profile').innerHTML = `
    <div class="profile__head">
      ${portraitMarkup(row, { size: 'medium', basePath })}
      <div>
        <h3 class="profile__name">${esc(row.display_name)}</h3>
        <div class="profile__sub">${esc(row.role)} · ${esc(companyOf(row))} · status <b>${p.status}</b></div>
        <div class="profile__credit">${credit ? esc(credit) : 'No photo — this identity renders the built-in fallback portrait.'}</div>
        ${row.verification && row.verification.license_evidence
    ? `<div class="profile__credit" style="margin-top:8px;opacity:.8">Licence evidence: ${esc(row.verification.license_evidence)}</div>` : ''}
      </div>
    </div>
    <div class="hero">
      ${portraitMarkup(row, { size: 'large', basePath })}
      <div class="profile__credit" style="max-width:230px">
        Hero size is 384px and is the only eager image on the page.
        ${p.sizes ? '' : 'No file mapped, so no request was made at all.'}
      </div>
    </div>`;
}

const PAIRS = [
  ['bobby-heenan', 'dusty-rhodes'],
  ['jimmy-hart', 'missy-hyatt'],
  ['tony-schiavone', 'jim-ross'],
];

export function renderMatchInto(doc, booking, ctx, basePath = '../') {
  const pair = PAIRS[booking % PAIRS.length];
  const sides = pair.map((id, i) => {
    const row = ctx.manifest.portraits.find((p) => p.id === id)
      || ctx.roster.other_role_identities.find((p) => p.id === id)
      || { id, display_name: id, role: 'wrestler' };
    const p = resolvePortrait(row, { basePath });
    return `<div class="corner${i === 1 ? ' corner--r' : ''}">
      ${portraitMarkup(row, { size: 'thumb', basePath })}
      <div><div class="corner__name">${esc(row.display_name)}</div>
      <div class="corner__meta">${statusLabel(p)}</div></div>
    </div>`;
  });
  // One slot is always a generated worker: fictional talent must be able to appear
  // on a card without ever looking broken.
  const gen = { id: `indy-${20 + booking}-96`, name: 'TBA — local independent', role: 'wrestler' };
  doc.querySelector('#matchcard').innerHTML = sides[0]
    + '<div class="vs">VS</div>'
    + sides[1]
    + `<div class="matchcard__extra">
        ${portraitMarkup(gen, { size: 'thumb', basePath })}
        <div><div class="corner__name">${esc(gen.name)}</div>
        <div class="corner__meta">${statusLabel(resolvePortrait(gen))} — never an error state</div></div>
      </div>`;
}

export function renderCreditsInto(doc, manifest) {
  const items = manifest.portraits.filter((p) => p.source).map((p) => {
    const s = p.source;
    const who = s.author ? ` — ${esc(s.author)}` : '';
    const lic = s.attribution_required
      ? `, <a href="${esc(s.license_url)}" target="_blank" rel="noopener">${esc(s.license)}</a>`
      : ', public domain';
    return `<li><b>${esc(p.display_name)}</b>${who}${lic} · <a href="${esc(s.page_url)}" target="_blank" rel="noopener">source</a>`
      + (s.restrictions === 'personality' ? ' · <span style="color:var(--warn)">personality rights flagged</span>' : '')
      + '</li>';
  });
  doc.querySelector('#credits').innerHTML = items.join('') || '<li>No photos in use yet.</li>';
  return items.length;
}

/** Wire everything to a document. Used by the page and by the smoke test. */
export function mount(doc, ctx, basePath = '../') {
  initPortraits(doc);
  const rows = buildRows(ctx);
  const report = renderRosterInto(doc, rows, basePath);
  renderProfileInto(doc, 'bobby-heenan', ctx, basePath);
  renderMatchInto(doc, 0, ctx, basePath);
  renderCreditsInto(doc, ctx.manifest);

  let booking = 0;
  doc.querySelectorAll('#roster .row').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.querySelector('.pt')?.dataset.ptKey;
      const label = el.querySelector('.row__name')?.textContent || null;
      if (key) renderProfileInto(doc, { key, label }, ctx, basePath);
    });
  });

  const breakBtn = doc.querySelector('#breakImg');
  if (breakBtn) {
    breakBtn.addEventListener('click', () => {
      // Point every third portrait image at a file that does not exist.
      doc.querySelectorAll('.pt__img').forEach((img, i) => {
        if (i % 3 === 0) img.src = `${basePath}assets/portraits/definitely-not-here.jpg`;
      });
      const note = doc.querySelector('#breakNote');
      if (note) note.hidden = false;
    });
  }
  const pick = doc.querySelector('#pickRandom');
  if (pick) {
    pick.addEventListener('click', () => {
      booking += 1;
      renderMatchInto(doc, booking, ctx, basePath);
    });
  }
  return { rows, report };
}

/* ---------------------------------------------------------- page bootstrap */
async function main() {
  if (typeof document === 'undefined' || !document.querySelector('#roster')) return;
  const [manifest, roster] = await Promise.all([
    fetch('../data/portraits.json').then((x) => x.json()),
    fetch('../data/roster-manifest.json').then((x) => x.json()),
  ]);
  mount(document, { manifest, roster }, '../');
}

main();
