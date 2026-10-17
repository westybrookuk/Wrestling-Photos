# Integrating the portrait system into the game

The portrait system is **presentation only**. It reads no simulation state, calls no
`rng()`, and writes nothing to a save file. Integration is additive: new files plus
three render call sites.

> **Status:** this document is written but not yet applied. The game repository
> (`westybrookuk/WCW-vs-WWF`) is not readable from the workspace that built this
> system, so the three call sites below could not be located in `js/ui.js`. Phase 2
> step one is to confirm each anchor, then patch.

---

## 1. Files to copy into the game

| From this repo | To the game | Ships to players? |
|---|---|---|
| `js/portrait.js` | `js/portrait.js` | yes |
| `js/portraits.data.js` | `js/portraits.data.js` | yes (generated) |
| `css/portrait.css` | wherever the game's CSS lives, or inline it | yes |
| `assets/portraits/fallback.svg` | `assets/portraits/fallback.svg` | yes |
| `assets/portraits/<id>/…` | same | yes (derived images only) |
| `data/portraits.json` | keep in this repo | **no** — build-time record |
| `tools/*.mjs`, `test/portraits.js` | keep in this repo | **no** |
| `data/portraits.originals/` | never copied | **no** — full-resolution sources stay out of git |

`js/portrait.js` and `js/portraits.data.js` are plain ES modules with no imports
outside each other, so they drop in unchanged. The CSS uses one custom property per
portrait (`--pt-hue`) and no global selectors, so it cannot leak into the game's styles.

If the game ever moves to a bundler, `assets/portraits/...` paths can stay as strings;
nothing depends on runtime discovery of the filesystem.

---

## 2. The three call sites

### 2.1 Roster, free-agent and contract lists (96px)

The component returns a string, so it drops into whatever the table already builds.

```js
import { portraitMarkup, initPortraits } from './portrait.js';

// once, at start-up
initPortraits(document);          // one delegated listener pair for the whole page

// inside the row builder, where the name is emitted today
function rosterRow(w) {
  return `<tr>
    <td class="col-who">
      <span class="pt-row">
        ${portraitMarkup(w, { size: 'small', basePath: '' })}
        <span class="pt-row__name">
          <b>${escapeHtml(w.name)}</b>
          <span>${escapeHtml(w.company || 'Free agent')}</span>
        </span>
      </span>
    </td>
    <td>${w.pop}</td>
  </tr>`;
}
```

`portraitMarkup` accepts either a worker record (`{id, name, company, …}`) or a bare
id string, so no call site needs to reshape data.

### 2.2 Wrestler profile

```js
${portraitMarkup(w, { size: 'medium', basePath: '' })}   // 192px, lazy
${portraitMarkup(w, { size: 'large',  basePath: '' })}   // 384px hero, the ONLY eager image
```

Attribution is available for a credits screen or a hover tooltip:

```js
import { attributionFor } from './portrait.js';
const credit = attributionFor(w.id);        // null when nothing needs crediting
```

### 2.3 Match-booking screen (48px, both corners)

```js
`<div class="corner">${portraitMarkup(a, { size: 'thumb', basePath: '' })}</div>
 <div class="vs">VS</div>
 <div class="corner">${portraitMarkup(b, { size: 'thumb', basePath: '' })}</div>`
```

Booking screens are where generated and custom workers appear most, and where the
fallback matters most. A generated opponent, a CAW, a deleted independent and a
1950s legend all render through this one path.

---

## 3. Why it cannot break anything

| Guarantee | How it is enforced | Test |
|---|---|---|
| No simulation impact | pure functions; nothing written to state | `Simulation purity` — state is byte-identical after rendering every portrait |
| No RNG usage | the module never imports or calls the game's rng; hues come from a hash | same section |
| Save compatibility | nothing is persisted; no new save field; no image bytes | `no portrait markup contains a save/state token` |
| No broken-image icons | the fallback is the base layer; an unmapped id emits no `<img>` at all | `unmapped identity emits no <img>`; DOM test fires a real error event |
| No layout shift | `width`/`height` on every image | `image carries intrinsic dimensions` |
| No full-resolution loading in lists | `thumb`/`small` only in lists; `loading="lazy"` except the hero | `hero image is eager, list images are lazy` |
| Offline play | no remote URLs in any rendered markup | `no portrait markup references a remote URL` |
| Offline archives | relative paths, no absolute URLs | validator rejects non-`https` sources |

**Performance:** a 96px WebP derivative is ~2–6 KB. Even if every one of the ~430
workers eventually had a photo, the list view loads only the portraits actually on
screen, and only at 48–96px.

**Cost of a mistake:** deleting one manifest row and one file returns that wrestler to
the fallback. Nothing else changes.

---

## 4. Integration checklist

1. Copy the files in §1.
2. Add the CSS.
3. Call `initPortraits(document)` once at start-up.
4. Patch the three render sites (§2) and confirm each anchor in `js/ui.js`.
5. `node test/portraits.js` — 58 assertions, no DOM needed.
6. `node tools/portraits-check.mjs` — manifest valid, every path present.
7. Run the game's own suites and confirm the replay hash is unchanged:
   `node test/sim.js && node test/ai-stress.js`.
8. Confirm a fresh save and an old save both load, and that a save file is the same
   size as before.

## 5. Things not to do

- **Do not** key portraits by display name. Names carry nicknames and change on
  repackaging; ids do not. `jerry-lawler` is one id in two identity classes, and the
  name "Arturo Rivera" belongs to two different people.
- **Do not** add image data to a save, or a portrait field to the save format.
- **Do not** hotlink a remote image, even temporarily.
- **Do not** add an image to the manifest without a source URL, an author and a
  licence — `tools/portraits-check.mjs` will fail the build, on purpose.
- **Do not** import the `95-96.zip` picture pack. It has no per-file provenance and
  cannot be redistributed with the game.
