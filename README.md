# Wrestling-Photos
Wrestling Photos

Portrait system for **WCW vs WWF Arena** — identity-keyed, licence-audited portraits with a
first-class fallback so no wrestler ever shows a broken image.

## What is here

| Path | What it is |
|---|---|
| `data/roster-manifest.json` | The identity export: 334 wrestler/manager ids + 35 announcer ids (369 rows). The source of truth for identity. |
| `data/portraits.json` | The portrait manifest: per-id source, author, licence, licence URL, era, verification status and fallback reason. |
| `js/portrait.js` | The component: `resolvePortrait`, `portraitMarkup`, `initPortraits`. Presentation only — no rng, no state. |
| `js/portraits.data.js` | Generated runtime index (paths + credits). Do not edit by hand. |
| `css/portrait.css` | Component styles: sizes, role frames, per-identity hue, quiet failure states. |
| `assets/portraits/fallback.svg` | The fallback plate. One static file; the monogram, hue and frame are composed around it. |
| `assets/portraits/<id>/` | Derived portraits: 48 / 96 / 192 / 384 px square WebP. Full-resolution originals are **not** committed. |
| `assets/portraits/_testplate/` | Watermarked local test plates. Not photographs; used to prove the image pipeline. |
| `tools/` | `seed-staff-manifest`, `build-portraits`, `portraits-check`, `fetch-portraits`, `demo-smoke`. |
| `test/portraits.js` | 58 assertions, no DOM required. |
| `demo/` | Three-surface demo: roster list, profile, match booking. |
| `docs/ATTRIBUTIONS.md` | Generated credit list for every photo in use. |
| `docs/INTEGRATION.md` | How to drop the system into the game, with the three call sites. |

## Commands

```bash
node test/portraits.js                  # unit tests (58)
node tools/portraits-check.mjs          # validate the manifest and every file path
node tools/portraits-check.mjs --strict # release gate: fails if a cleared row has no file yet
node tools/build-portraits.mjs          # regenerate the index + attributions
node tools/fetch-portraits.mjs          # dry run: show what would be imported
node tools/fetch-portraits.mjs --fetch  # download cleared photos + build derivatives
node tools/fetch-portraits.mjs --self-test   # exercise the image pipeline offline
npm install --no-save jsdom && node tools/demo-smoke.mjs   # browser-path tests (20)
```

Serve the repo root and open `/demo/` to see the three surfaces.

## The rules this system enforces

- **Keyed by stable id, never by display name.** Two gimmicks of one performer, and one
  name belonging to two different people, are both handled explicitly.
- **Licence-checked before import.** Every photograph records its source page, author,
  licence and licence URL. Non-commercial and no-derivative licences are rejected
  outright, because the distribution model is not settled and the game crops images.
  Unresolved questions are recorded in `unresolved[]`, never silently approved.
- **Fallback-first.** The fallback is the base layer of every portrait. Three failure
  paths — unmapped, missing file, failed decode — produce the same clean result.
- **No image bytes in saves.** Nothing is persisted; resolution happens at render time.
- **Bundled and local.** No hotlinking, no remote URLs, works offline and in a packed build.
- **No simulation impact.** No rng, no state mutation, determinism untouched.

## Current coverage

Wave 1 is **staff-first**: all 15 manager and 35 announcer identities are in the manifest —
**28 with a licence-cleared photo**, 22 with none yet (those render the fallback). Wrestler
waves follow. `docs/ATTRIBUTIONS.md` lists every photo and its terms.

## Importing photos

The manifest was authored in a sandbox that could not reach `upload.wikimedia.org`, so the
import step is explicit and runs where Commons is reachable:

```bash
node tools/fetch-portraits.mjs            # read the plan
node tools/fetch-portraits.mjs --fetch    # resolves each URL from the Commons API,
                                          # re-checks the licence, hashes the original,
                                          # writes 48/96/192/384 WebP derivatives
node tools/build-portraits.mjs && node tools/portraits-check.mjs --strict
```
