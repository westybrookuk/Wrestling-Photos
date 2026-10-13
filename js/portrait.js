/**
 * Portrait component - WCW vs WWF Arena
 * =====================================
 *
 * PRESENTATION ONLY. This module must never:
 *   - read or mutate simulation state,
 *   - call the game's rng(),
 *   - run any work at import time (no side effects on import),
 *   - add anything to a save file.
 *
 * It is safe to `import` from a plain Node test (`node test/portraits.js`): nothing
 * here touches `window` or `document` unless the caller explicitly asks for it via
 * `initPortraits()`.
 *
 * Failure model - three paths, one result:
 *   unmapped        -> no <img> is emitted at all, so no network request happens
 *   mapped, missing -> the <img> fails, is retired once, the fallback stays visible
 *   decode/offline  -> identical to the above
 * In every case the fallback is the initial DOM, so a broken-image icon can never
 * appear and the layout never shifts.
 *
 * Identity model - keyed by stable id, never by display name:
 *   1. exact id (namespaced by identity class when the same id exists in two classes)
 *   2. shared-photo owner (one photo, several ids, ids never merged)
 *   3. published name key (for unkeyed strings that genuinely have no id)
 *   4. generated-id pattern  -> generated fallback
 *   5. fallback
 */
import {
  PORTRAIT_INDEX,
  PORTRAIT_SHARED,
  PORTRAIT_NAME_KEYS,
  PORTRAIT_VARIANTS,
} from './portraits.data.js';

export const PORTRAIT_SCHEMA = 'cwvwwf-portraits/1';
export const PORTRAIT_SIZES = ['thumb', 'small', 'medium', 'large'];
export const PORTRAIT_PX = { thumb: 48, small: 96, medium: 192, large: 384 };

/** Generated worker ids produced by the engine - these can never have a photo. */
export const GENERATED_ID_PATTERNS = [
  /^indy-\d+-\d+$/,
  /^rookie-\d+-\d+$/,
  /^ecw-p-\d+-\d+$/,
  /^caw-\d+$/,
];

const ROLE_FRAMES = {
  wrestler: 'wrestler',
  manager: 'staff',
  announcer: 'staff',
  coach: 'coach',
  unknown: 'wrestler',
};

/* ------------------------------------------------------------------ helpers */

/** Deterministic hue from a key - a hash, NOT rng(), so it is stable forever. */
export function hueFor(key) {
  let h = 2166136261 >>> 0;
  const s = String(key == null ? '' : key);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 360;
}

/** Monogram from a display name, tolerant of gimmick/punctuation forms. */
export function initialsFor(name) {
  const raw = String(name == null ? '' : name).trim();
  if (!raw) return '?';
  // Drop quoted nicknames and bracketed asides: Bob "Spark Plug" Holly -> Bob Holly
  const cleaned = raw
    .replace(/["'\u2018\u2019\u201c\u201d()[\]{}]/g, ' ')
    .replace(/,.*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => /[a-z0-9]/i.test(w));
  if (!words.length) return raw.slice(0, 1).toUpperCase();
  // Leading numerals ("2 Cold Scorpio", "911") read better as digits than initials.
  if (/^\d+$/.test(words[0])) {
    const digits = words[0].slice(0, 2);
    return words.length === 1 ? words[0].slice(0, 3) : (digits + words[1][0]).toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isGeneratedId(id) {
  return GENERATED_ID_PATTERNS.some((re) => re.test(String(id || '')));
}

function nameKey(name) {
  return String(name == null ? '' : name)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------------------------------------------------------- resolution */

/**
 * Resolve a portrait for a worker, an id string, or any display name.
 *
 * @param {object|string} target  worker record (needs .id, optionally .name/.role) or an id/name string
 * @param {object} [opts]
 * @param {string} [opts.identityClass]  'wrestler_roster' | 'announcer'
 * @param {string} [opts.role]           'wrestler' | 'manager' | 'announcer' | 'coach'
 * @param {string} [opts.name]           display name, for the monogram / name fallback
 * @param {number} [opts.turn]           game turn, for time-scoped variants
 * @returns {{key,status,id,identityClass,role,frame,hue,monogram,sizes,credit,license,attributionRequired,reason,displayName}}
 */
export function resolvePortrait(target, opts = {}) {
  const o = opts || {};
  let id = null;
  let name = o.name || null;
  let role = o.role || null;
  let identityClass = o.identityClass || null;

  if (target && typeof target === 'object') {
    id = target.id != null ? String(target.id) : null;
    name = name || target.name || target.display_name || null;
    role = role || target.role || null;
    identityClass = identityClass || target.identity_class || null;
    // Managers are wrestler_roster records carrying a role flag.
    if (!role && target.isManager) role = 'manager';
  } else if (typeof target === 'string') {
    id = target;
    name = name || target;
  }

  const base = {
    key: id || name || 'unknown',
    id,
    identityClass,
    role: role || 'unknown',
    displayName: name || id || 'Unknown',
    frame: ROLE_FRAMES[role || 'unknown'] || 'wrestler',
    hue: hueFor(id || name || 'unknown'),
    monogram: initialsFor(name || id),
    sizes: null,
    credit: null,
    license: null,
    attributionRequired: false,
    status: 'absent',
    reason: null,
  };

  try {
    // 1 + 2: exact id, then shared-photo owner.
    let entry = null;
    if (id) {
      entry = PORTRAIT_INDEX[id] || null;
      if (!entry && PORTRAIT_SHARED[id]) entry = PORTRAIT_INDEX[PORTRAIT_SHARED[id]] || null;
    }
    // 3: published name key (unkeyed strings that have no stable id).
    // The name map stores an *id*; the index must then be consulted for the entry.
    if (!entry && name) {
      const nameId = PORTRAIT_NAME_KEYS[nameKey(name)];
      if (nameId) entry = PORTRAIT_INDEX[nameId] || null;
    }

    if (entry) {
      const sizes = entry.files || entry.preview_files || null;
      // An index hit is not automatically a photo: the entry may be a known
      // identity that has no cleared image yet.
      if (entry.status === 'absent' || (!sizes && entry.status !== 'cleared')) {
        return { ...base, status: 'absent', reason: entry.reason || 'no-cleared-photo' };
      }
      return {
        ...base,
        status: sizes ? (entry.preview ? 'preview' : 'ok') : 'pending',
        reason: sizes ? null : 'files-not-fetched',
        sizes,
        credit: entry.credit || null,
        license: entry.license || null,
        attributionRequired: Boolean(entry.attribution_required),
      };
    }

    // 4: generated ids get a deliberate, named state - not an error.
    if (isGeneratedId(id)) {
      return { ...base, status: 'generated', reason: 'fictional-worker' };
    }

    // 5: fallback.
    return { ...base, status: 'absent', reason: id ? 'no-cleared-photo' : 'no-identity' };
  } catch (err) {
    // Resolution must never break a render.
    return { ...base, status: 'absent', reason: 'resolver-error' };
  }
}

/** Time-scoped display-name variant for a stable id (IDs never change). */
export function variantNameFor(id, turn) {
  const list = PORTRAIT_VARIANTS[id];
  if (!list || !list.length) return null;
  for (const v of list) {
    if (turn == null || v.from_turn == null || turn >= v.from_turn) return v.name;
  }
  return null;
}

/** Human-readable credit line, or null when nothing needs crediting. */
export function attributionFor(key) {
  const entry = PORTRAIT_INDEX[key] || PORTRAIT_INDEX[PORTRAIT_SHARED[key]];
  if (!entry || !entry.credit) return null;
  return entry.credit;
}

/* ------------------------------------------------------------------- markup */

/**
 * Build the portrait markup. The fallback is always the base layer; the <img> is
 * emitted only when a file is actually mapped.
 *
 * @param {object|string} target
 * @param {object} [opts]  resolvePortrait opts, plus:
 * @param {string} [opts.size='small']   'thumb'|'small'|'medium'|'large'
 * @param {string} [opts.basePath='']    prefix for asset paths (e.g. '../../')
 * @param {string} [opts.className='']
 * @param {boolean} [opts.decorative=true]  false -> sets alt to the display name
 * @param {string} [opts.show='auto']    'auto' | 'always' | 'hide' (demo affordance)
 */
export function portraitMarkup(target, opts = {}) {
  const o = opts || {};
  const size = PORTRAIT_SIZES.includes(o.size) ? o.size : 'small';
  const px = PORTRAIT_PX[size];
  const p = resolvePortrait(target, o);
  const basePath = o.basePath || '';

  const classes = [
    'pt',
    `pt--${size}`,
    `pt--${p.status}`,
    `pt--frame-${p.frame}`,
    o.className || '',
  ].filter(Boolean).join(' ');

  const src = p.sizes && p.sizes[size] ? basePath + p.sizes[size] : null;
  const credit = p.credit ? ` title="${escapeHtml(p.credit)}"` : '';
  const alt = o.decorative === false ? escapeHtml(p.displayName) : '';

  const img = src
    ? `<img class="pt__img" src="${escapeHtml(src)}" alt="${alt}" width="${px}" height="${px}" `
      + `loading="${size === 'large' ? 'eager' : 'lazy'}" decoding="async" data-pt-credit="${escapeHtml(p.credit || '')}">`
    : '';

  return `<span class="${classes}" style="--pt-hue:${p.hue}"${credit}`
    + ` data-pt-key="${escapeHtml(p.key)}" data-pt-status="${p.status}"`
    + (p.reason ? ` data-pt-reason="${escapeHtml(p.reason)}"` : '')
    + ` role="img" aria-label="${escapeHtml(p.displayName)} portrait">`
    + `<span class="pt__fb" aria-hidden="true"><span class="pt__mono">${escapeHtml(p.monogram)}</span></span>`
    + img
    + '</span>';
}

/* ------------------------------------------------------- browser-side wiring */

let wiring = null;

/**
 * Attach one delegated pair of capture listeners for every portrait on the page.
 * Idempotent, and safe to call before any markup exists. no-op outside a browser.
 * There is deliberately no per-image inline handler, so this stays CSP-friendly.
 */
export function initPortraits(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || wiring) return;
  const onLoad = (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('pt__img')) t.classList.add('pt__img--in');
  };
  const onError = (e) => {
    const t = e.target;
    if (!t || !t.classList || !t.classList.contains('pt__img') || t.dataset.ptDone) return;
    t.dataset.ptDone = '1';                 // retire once - never a retry loop
    const host = t.parentNode;
    if (host && host.classList) {
      // Add the failure state and drop whichever expectation class was present.
      // (A preview row is not pt--ok, so a bare replace() would silently no-op.)
      host.classList.add('pt--missing');
      host.classList.remove('pt--ok', 'pt--preview');
    }
    t.remove();
  };
  d.addEventListener('load', onLoad, true);
  d.addEventListener('error', onError, true);
  wiring = { doc: d, onLoad, onError };
}

/** Detach the listeners (used by tests). */
export function teardownPortraits() {
  if (!wiring) return;
  wiring.doc.removeEventListener('load', wiring.onLoad, true);
  wiring.doc.removeEventListener('error', wiring.onError, true);
  wiring = null;
}

/** Coverage report - pure, used by the demo and by the test suite. */
export function coverageReport(workers = [], opts = {}) {
  const rows = { total: 0, ok: 0, preview: 0, pending: 0, generated: 0, absent: 0 };
  for (const w of workers) {
    const p = resolvePortrait(w, opts);
    rows.total += 1;
    if (rows[p.status] === undefined) rows.absent += 1; else rows[p.status] += 1;
  }
  const rendered = rows.ok + rows.preview + rows.pending + rows.generated + rows.absent;
  return { ...rows, rendered, neverBroken: rendered === rows.total };
}
