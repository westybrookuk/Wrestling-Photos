# Roster identity audit

**Audit date:** 2026-10-13

**Result:** source-only export; no game session was run and no save or CAW formula was inspected.

## Included records

- `js/data.js#WRESTLERS`: **311** fixed starting identities—296 wrestler-role records and 15 manager-role records—across 16 promotions. Every record has an ID and display name. Starting-company counts are listed in the manifest.
- `js/data.js#FA_ARRIVALS`: **23** additional fixed identities scheduled to enter free agency on specified game turns. None overlaps a `WRESTLERS` ID. These are schedule records, not initial employers.
- `js/data.js#ANN_STARTERS` and `#ANN_ARRIVALS`: **35** exact-ID announcer identities represented separately from wrestlers/managers (33 starter occurrences and 5 arrival occurrences). Three repeated source occurrences are retained under their exact IDs.
- The export also carries initial manager/client ID links, the static moonlight-loan-eligibility map, and explicit code-supported name changes. It includes **369 identity rows** total across its two classes.

The game’s scripted timeline refers to existing wrestler IDs; it does not add another fixed wrestler table. The roster-creation audit found the other runtime insertion paths in the engine: independent/jobber generation, annual independent and rookie classes, the ECW discovery pipeline, development prospects called up from a farm system, and user-created/imported CAWs.

## Identity and data-quality findings

All 334 fixed wrestler/manager records have non-empty IDs and names, with no duplicate IDs. Exact-name and normalized-name collision checks across those 334 records found **zero** collisions. The 35 announcer identities are kept in their own role class. Across all 369 exported rows, three display-name groups share a name across different IDs: **Arturo Rivera** (`arturo-rivera`, `arturo-rivera-aaa`), **Gary Michael Cappetta** (`gary-michael-cappetta`, `gary-michael-cappetta-awf`), and **Giant Baba** (`giant-baba`, `giant-baba-ann`). These are not merged. The exact ID `jerry-lawler` appears in both the wrestler and announcer classes with different source display strings; both records are preserved and the name variant is recorded by exact ID, not by name matching.

No external/source-system ID field or explicit alias/ring-name field exists in `WRESTLERS` or `FA_ARRIVALS`. The export records four explicit in-place name changes: Razor Ramon → Scott Hall and Diesel → Kevin Nash when signed outside WWF; Alundra Blayze → Madusa on the WCW timeline route; and Cactus Jack → Mankind on the scripted WWF route. These retain their original IDs. Arbitrary user repackaging and text-only gimmick labels do not provide a durable alias history.

Gender is optional and incomplete: it is unspecified on 295 of 311 base roster records and 17 of 23 scheduled wrestler arrivals. Missing values are left null/blank, not inferred. Static source company is a starting affiliation; `MOONLIGHT_SEED` means loan eligibility, not a complete promotion history. The fixed data also has no comprehensive active/inactive/retired status flag.

## Generated and custom identities

Default `newGame` setup can generate 60 unsigned independents plus 37 local jobbers (97 total), and later full-mode seasons can add 15 independents per year and 4–6 rookies per year from 1996–2001. Other paths are state/RNG-dependent; the ECW discovery path has a finite 12-name candidate list, while development prospects and CAWs have campaign-generated IDs and/or user-supplied names. The manifest documents these patterns and pools but does not fabricate example records or IDs.

A complete campaign roster therefore cannot be derived from static source alone. It requires a particular campaign seed/state for generated identities, and a save for campaign-specific CAWs, changes, and current status. No save, personal data, gameplay state, or source code copy is included in this export. Other names used only as company-owner, commentary, or narrative strings have no stable roster ID and are outside the identity rows.