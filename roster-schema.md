# Roster export schema

This folder contains a static-data identity export, not a campaign save. The files are UTF-8. `roster.csv` uses RFC 4180-style quoting and CRLF row endings; JSON-valued cells are encoded as JSON strings inside the CSV.

## Coverage at a glance

- **334 fixed wrestler/manager identities:** 311 `WRESTLERS` records plus 23 scheduled `FA_ARRIVALS`.
- **35 fixed announcer-role identities:** sourced from 33 `ANN_STARTERS` rows and 5 `ANN_ARRIVALS` rows. Repeated announcer source rows are retained as `source_records` on the exact-ID record; they are not collapsed by name.
- **369 identity rows** in the CSV. Generated campaign instances are deliberately not represented as if they were fixed records; their ID/name-generation rules are in the manifest.

The manifest separates `roster_identities` from `other_role_identities`. `identity_class` is therefore part of the record namespace. For example, `jerry-lawler` occurs in both the wrestler roster and announcer role data; both source records are preserved. The same display name can also belong to different IDs, such as the two separate `Giant Baba` records. Do not use `display_name` as a key or merge records by name.

## Manifest record fields

| Field | Meaning |
|---|---|
| `id` | Exact internal source ID. Preserve it byte-for-byte; no ID is synthesized from a name. |
| `display_name` | Exact source display name for this record. |
| `identity_class` | `wrestler_roster` or `announcer`; keep classes distinct. |
| `role` | `wrestler`, `manager`, or `announcer`. `manager` is derived from the source `isManager: true` flag. |
| `is_manager` | Effective boolean role flag for wrestler-roster records; omitted source flags are represented as `false`. |
| `fixed_or_generated` | `fixed` for every actual identity row in this export. Runtime-generated classes are documented separately. |
| `record_origin` | `fixed_base_roster` or `scheduled_arrival` for wrestler-roster records. |
| `availability` | Starting roster/role or scheduled arrival status as represented by the source data; it is not a live employment status. |
| `source_records` | Source collection/file and source occurrence details. Announcer occurrences are grouped only by exact ID within the announcer class and all occurrences are retained here. |
| `company_affiliations` | Company plus its basis. For wrestlers this can include `starting_company` and `moonlight_loan_eligibility`; the latter is not a full career history. For announcers it records `ANN_STARTERS` companies. |
| `gender` | Raw optional source value (`f` where specified, otherwise `null`). `null` means unspecified, not male. |
| `known_name_variants` | Explicit source-supported alternate display names with their basis, source, and condition. These are not an exhaustive ring-name history. |
| `initial_manager_id` / `initial_client_ids` | Exact-ID links from the initial manager/client seed, where present. These are starting links, not a record of later campaign assignments. |
| `source_notes` | Identity-adjacent source notes retained where present (for example, scheduled-arrival notes or the one source `expiryNote`). They are not a career log. |
| `schedule_turn`, `signing_interest`, `source_note` | Present inside scheduled source occurrences; turns are game turns, not calendar dates. Interest is a preference, not a promotion affiliation. |

The source does not provide third-party wrestling database identifiers. The `id` values are internal project identifiers.

## CSV columns

`roster.csv` has one row per manifest identity record and these columns:

- `identity_class`, `stable_id`, `display_name`, `role`, `fixed_or_generated`, `availability`
- `source_collections`, `source_records_json`, `company_affiliations_json`
- `gender`, `known_name_variants_json`, `scheduled_turns_json`, `signing_interests_json`, `source_notes_json`
- `initial_manager_id`, `initial_client_ids_json`

Array/object columns contain JSON text. A blank scalar cell corresponds to a missing/null value; do not replace it with an inferred value. Rows are not keyed by name. Within a class, the project ID is the identity reference; preserve duplicate-name rows and keep source occurrences intact.

## Alias and duplicate-name rules

`WRESTLERS` and `FA_ARRIVALS` have no `alias`, `ringName`, or equivalent field. The export records only the four explicit in-place name changes found in runtime/scripted logic—Razor Ramon → Scott Hall, Diesel → Kevin Nash, Alundra Blayze → Madusa, and Cactus Jack → Mankind—plus the `Jerry Lawler` announcer display attached to the exact same `jerry-lawler` ID. Conditions are recorded in the manifest. User-entered repackage names and text-only gimmick labels are not treated as durable aliases.

The 334 wrestler/manager identities have no exact or normalized display-name collisions. The additional structured announcer records produce three exact-name groups with distinct IDs: Arturo Rivera, Gary Michael Cappetta, and Giant Baba. All are kept separate. Announcer source rows that repeat the same exact ID (for example, shared staff definitions across promotions) remain visible in `source_records`.

## Adding future custom records

1. For a permanent fixed wrestler/manager, add a source record to `WRESTLERS` with its intended stable `id`, `name`, and `company`; set `isManager: true` only for a manager-role record. Keep optional fields absent when genuinely unspecified.
2. For a scheduled wrestler arrival, add the record to `FA_ARRIVALS` with its exact ID and `turn`. Its `interest` is not an employer field.
3. Do not add user-created CAWs or campaign-generated workers to this static export as though they were fixed data. `createCaw`/`importCawFormula` assign campaign-local IDs of the form `caw-N` (up to three per campaign); export those only from the campaign state when authorized, preserving the stored IDs exactly.
4. A custom promotion draws from existing records; choosing wrestlers for it does not create new identities. If a future source adds an alias field or ID namespace, update the schema and retain every source ID rather than matching on names.

`roster-manifest.json` documents the generated identity sources and their limits. No generated identity instance is included because no campaign seed/state or save was inspected.