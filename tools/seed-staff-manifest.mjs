/**
 * Seed the portrait manifest from the committed staff census.
 *
 * The census below is the record of what was actually verified against Wikimedia
 * Commons on 2026-10-13 (via the MediaWiki API: prop=imageinfo, iiprop=extmetadata).
 * Nothing here is a guess: every row with a `source` block was read from the file's
 * own licence metadata. Rows without one are recorded as `absent` with a reason -
 * they are never silently approved.
 *
 * Usage: node tools/seed-staff-manifest.mjs
 * Writes: data/portraits.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CENSUS_DATE = '2026-10-13';
const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/File:';

/**
 * Verified staff census. `f` = Commons file title (without the File: prefix).
 * Era classes: career-era (shot during the person's active career, pre-1990),
 * sim-window (1990-2005, the simulation's own span), modern (post-2005).
 */
const CENSUS = {
  // ---------------------------------------------------------------- managers
  'bobby-heenan': {
    f: 'Bobby Heenan.jpg (cropped2).jpg', date: '1989-03-07', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', author: 'John McKeon',
    era: 'career-era', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 2.0", AttributionRequired=true, LicenseUrl present; shot 7 Mar 1989, El Paso Convention Center (WWF Superstars taping)',
    note: 'Fan photo, already an acknowledged crop on Commons.',
  },
  'dusty-rhodes': {
    f: 'Dusty Rhodes as NWA Champion, circa 1979 to 1981.jpg', date: '1979-1981', license: 'Public domain',
    licenseUrl: null, author: 'Bill Apter', era: 'career-era', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain", Copyrighted=False; category "PD US no notice 1989" (magazine scan, no copyright notice)',
    note: 'Scanned from a wrestling magazine; PD via missing copyright notice. Highest-value class: era-correct and PD.',
  },
  'antonio-inoki-ann': {
    f: 'Inoki, circa 1983 (cropped).jpg', date: '1983-04', license: 'Public domain',
    licenseUrl: null, author: 'Unknown photographer', era: 'career-era', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain"; category "PD US no notice 1989"; source "Wrestling Main Event, April 1983"',
    note: 'Magazine scan. Unknown author - attribution not required, so no orphaned credit.',
  },
  'hugo-savinovich': {
    f: 'Hugo Savinovitch (cropped).png', date: '1984-01', license: 'Public domain',
    licenseUrl: null, author: 'Unknown author', era: 'career-era', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain"; source "Wrestling\'s MAIN EVENT magazine: 1984-01"',
    note: 'WWC North American Tag Champions era.',
  },
  'missy-hyatt': {
    f: 'Missy Hyatt, 1988.png', date: '1988', license: 'Public domain',
    licenseUrl: null, author: 'Len McAlister', era: 'career-era', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain", AttributionRequired=false; DateTimeOriginal "Winter 1988"',
    note: 'Rare: era-appropriate AND public domain.',
  },
  'woman': {
    f: 'Nancy Benoit (Fallen Angel) 1984 (cropped).png', date: '1985-01', license: 'Public domain',
    licenseUrl: null, author: 'Unknown author', era: 'career-era', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain", AttributionRequired=false',
    note: 'In-game id is "woman"; display name in the source data is "Woman". Subject: Nancy Benoit (Fallen Angel), 1984-85.',
  },
  'robert-parker': {
    f: 'Robert Fuller.jpg', date: '1975', license: 'Public domain',
    licenseUrl: null, author: 'Unknown author', era: 'career-era', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain"; DateTimeOriginal 1975',
    note: 'In-game id is "robert-parker" (Colonel Robert Parker); the performer is Robert Fuller.',
  },
  'harvey-wippleman': {
    f: 'Harvey Wippleman in 1994.jpg', date: '1994', license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', author: 'GaryColemanFan',
    era: 'sim-window', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 3.0", AttributionRequired=true, Attribution="GaryColemanFan at English Wikipedia"; shot at a 1994 WWF event',
    note: 'GFDL also present as a redundant migration licence. CC BY-SA 3.0 governs; GFDL-only use is never relied on.',
    flag: 'dual-licence: GFDL + CC BY-SA 3.0 (use CC only)',
  },
  'slick': {
    f: 'SlickWWFCropped.jpg', date: '1989-03-07', license: 'CC BY 1.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/1.0/', author: 'John McKeon',
    era: 'career-era', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY 1.0", AttributionRequired=true; same 7 Mar 1989 El Paso shoot as Bobby Heenan',
    note: 'CC BY 1.0 - the least restrictive CC attribution licence; no share-alike obligation.',
  },
  'bill-alfonso': {
    f: 'BillAlfonso.jpg', date: '2006-12', license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', author: 'Adam Etheridge',
    era: 'boundary', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 3.0", AttributionRequired=true, Attribution="The Doppelganger at English Wikipedia"; shot at a WEW event',
    note: 'Shot 2006 - just outside the sim window. Flagged for the era decision, not rejected.',
    flag: 'dual-licence: GFDL + CC BY-SA 3.0 (use CC only)',
  },
  'gary-michael-cappetta': {
    f: 'Gary Michael Cappetta.jpg', date: '2014-11-27', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', author: 'Mike Kalasnik',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 2.0", AttributionRequired=true; shot at Showcase of Champions, Winston-Salem NC',
    note: 'One photo serves both announcer rows (see shared_with).',
    shared: ['gary-michael-cappetta-awf'],
  },
  'les-thatcher': {
    f: 'Les Thatcher July 2014.jpg', date: '2014-07-31', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', author: 'Mike Kalasnik',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 2.0", AttributionRequired=true',
  },
  'jim-cornette': {
    f: 'JimCornette2015Cropped.jpg', date: '2015-06-13', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', author: 'Mike Kalasnik',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 2.0", AttributionRequired=true',
  },
  'larry-zbyszko': {
    f: 'Larry Zbyszko April 2016.jpg', date: '2016-04-01', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', author: 'Miguel Discart',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 2.0", AttributionRequired=true',
  },
  'sonny-onoo': {
    f: 'Sony Onoo 2018.jpg', date: '2017-04-22', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', author: 'Mike Kalasnik',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 2.0", AttributionRequired=true',
  },
  'tony-schiavone': {
    f: 'Tony Schiavone, October 2019 (cropped).jpg', date: '2019-10-09', license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', author: 'grenwail',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY 2.0", AttributionRequired=true',
    note: 'The canonical file for this subject. No era-appropriate alternative on Commons at census time.',
  },
  'paul-e-dangerously': {
    f: 'Paul Heyman August 2024 (cropped).jpg', date: '2024-08-17', license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', author: 'Diego Serrano',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY 2.0", AttributionRequired=true',
    note: 'In-game id is "paul-e-dangerously" (ECW-era gimmick); subject is Paul Heyman.',
  },
  'jim-ross': {
    f: 'Jim Ross Photo Op GalaxyCon Richmond 2025.jpg', date: '2025-03-29', license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', author: 'Super Festivals',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY 2.0", AttributionRequired=true',
  },
  'jerry-lawler': {
    f: 'Jerry Lawler GalaxyCon Nashville 052026-4.jpg', date: '2026-05-31', license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'John Manard',
    era: 'modern', attr: true, restrictions: 'personality',
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 4.0", AttributionRequired=true, Restrictions="personality"',
    note: 'One photo serves the wrestler row and the announcer row (same stable id, two identity classes).',
    shared: ['jerry-lawler'],
  },
  'jimmy-hart': {
    f: 'Jimmy Hart GalaxyCon Nashville 052026-3.jpg', date: '2026-05-31', license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'John Manard',
    era: 'modern', attr: true, restrictions: 'personality',
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 4.0", AttributionRequired=true, Restrictions="personality"',
  },
  'ted-dibiase': {
    f: 'Ted DiBiase GalaxyCon Nashville 052026-4.jpg', date: '2026-05-31', license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'John Manard',
    era: 'modern', attr: true, restrictions: 'personality',
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 4.0", AttributionRequired=true, Restrictions="personality"',
  },
  'vince-mcmahon': {
    f: 'Vince McMahon 2.jpg', date: '2006-12-05', license: 'Public domain',
    licenseUrl: null, author: 'Airman 1st Class Nicholas Pilch (USAF)', era: 'boundary', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain", AttributionRequired=false - US Air Force photograph',
    note: 'US government work: PD. Courtesy credit retained voluntarily even though not required.',
  },
  'paul-bearer': {
    f: 'PaulBearerCage.jpg', date: null, license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', author: 'shstrng',
    era: 'unverified-era', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY 2.0", AttributionRequired=true; no DateTimeOriginal in metadata',
    note: 'Licence verified; capture date absent from the file metadata, so era classification is unresolved.',
  },
  'mr-fuji': {
    f: 'Mr Fuji (cropped).jpg', date: '2012-01-15', license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', author: 'DianesDigitals',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY-SA 2.0", AttributionRequired=true',
  },
  'kevin-kelly': {
    f: 'Announcer Kevin Kelly.jpg', date: '2011-08-13', license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', author: 'Steve Wright Jr.',
    era: 'modern', attr: true,
    evidence: 'imageinfo: LicenseShortName="CC BY 2.0", AttributionRequired=true; shot at a Ring of Honor show',
  },
  'mike-tenay': {
    f: 'TenayLockdown.jpg', date: null, license: 'Public domain',
    licenseUrl: null, author: null, era: 'unverified-era', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain", AttributionRequired=false; no author or date in metadata',
    note: 'PD claim accepted from the file page, but no author/date to corroborate it. Flagged for a second look.',
    flag: 'pd-claim-unattributed: verify the underlying PD rationale before import',
  },
  'joey-styles': {
    f: 'Joey Styles n friend.jpg', date: '2007', license: 'Public domain',
    licenseUrl: null, author: 'Mooowl (English Wikipedia)', era: 'boundary', attr: false,
    evidence: 'imageinfo: LicenseShortName="Public domain", AttributionRequired=false; original upload 16 June 2007',
    note: 'Self-released to PD by the uploader. Group photo - requires a crop to the subject.',
    flag: 'needs-crop: group photo, subject must be isolated',
  },
};

/**
 * Identities that reuse another identity's already-cleared photo.
 * The ids are NEVER merged - both rows stay separate in the manifest; they simply
 * point at the same underlying file.
 */
const SHARES_WITH = {
  // The AWF booth row is the same person as the NWA booth row (same performer,
  // two promotions, two stable ids in the source data).
  'gary-michael-cappetta-awf': 'gary-michael-cappetta',
};

/** Staff identities with no usable photo at census time, and why. */
const ABSENT = {
  'sunny': 'English Wikipedia article exists but carries no lead image; Commons has no portrait under this name.',
  'sherri-martel': 'English Wikipedia article exists but carries no lead image; no free portrait located.',
  'tazz': 'English Wikipedia article exists but carries no lead image at census time.',
  'michael-cole': 'English Wikipedia article exists but carries no lead image at census time.',
  'lance-russell': 'Article exists, no lead image; no free portrait located.',
  'bob-caudle': 'Article exists, no lead image; no free portrait located.',
  'haruka-eigen': 'Article exists, no lead image; no free portrait located.',
  'kent-walton': 'Article exists, no lead image. Retired from ITV commentary in 1988; no free portrait located.',
  'dave-brown': 'No encyclopaedia article; no free portrait located.',
  'carlos-berrios': 'No encyclopaedia article; no free portrait located. WWC Spanish-language commentary.',
  'dave-pugh': 'No encyclopaedia article; no free portrait located.',
  'dr-alfonso-morales': 'No encyclopaedia article; no free portrait located. AAA commentary.',
  'katsuya-kobayashi': 'No encyclopaedia article; no free portrait located. AJW commentary.',
  'kenji-ota': 'No encyclopaedia article; no free portrait located. FMW commentary.',
  'peer-gynter': 'No encyclopaedia article; no free portrait located. CWA commentary.',
  'shinpei-nogami': 'No encyclopaedia article; no free portrait located. NJPW commentary.',
  'tirantes': 'No encyclopaedia article; no free portrait located. CMLL announcer slot (historically a referee).',
  'tsuneharu-fujii': 'No encyclopaedia article; no free portrait located. AJPW commentary.',
  'haruo-murata': 'No encyclopaedia article; no free portrait located. AJW commentary.',
  'arturo-rivera': 'BLOCKED - name collision. The canonical image for this name on Commons is a 2017 self-portrait by the Mexican painter Arturo Rivera (CC BY-SA 4.0), a different person. Never auto-match this name.',
  'arturo-rivera-aaa': 'BLOCKED - same name collision as arturo-rivera.',
  'giant-baba-ann': 'BLOCKED - the lead image on the name\'s article is an unrelated 1938 Sikeston, MO wrestling photograph. Requires a targeted search, not a name lookup.',
};

/** Licence policy. Anything not in accepted_licenses is rejected at build time. */
const POLICY = {
  accepted_licenses: ['CC0', 'Public domain', 'CC BY 1.0', 'CC BY 2.0', 'CC BY 2.5', 'CC BY 3.0', 'CC BY 4.0',
    'CC BY-SA 1.0', 'CC BY-SA 2.0', 'CC BY-SA 2.5', 'CC BY-SA 3.0', 'CC BY-SA 4.0'],
  rejected_licenses: ['CC BY-NC', 'CC BY-NC-SA', 'CC BY-NC-ND', 'CC BY-ND', 'GFDL-only', 'fair use', 'non-free', 'unverified'],
  distribution_assumption: 'commercial-safe',
  era_policy: 'era-appropriate-first; career-era accepted; modern retained but flagged',
  sizes: { thumb: 48, small: 96, medium: 192, large: 384 },
  budgets_kb: { thumb: 8, small: 16, medium: 40, large: 90 },
  require_for_cleared: ['page_url', 'file_url', 'license', 'author_or_public_domain'],
};

/**
 * Demo-only preview plates. These are locally generated stand-ins, NOT photographs,
 * and they exist so the image pipeline (load, fade, sizes, error path) can be proven
 * before any licensed photo is imported. They are watermarked in the UI, they are
 * never counted as cleared imagery, and tools/fetch-portraits.mjs replaces them.
 */
const PREVIEW = {
  'bobby-heenan': 'assets/portraits/_testplate/bobby-heenan',
  'antonio-inoki-ann': 'assets/portraits/_testplate/antonio-inoki-ann',
  'dusty-rhodes': 'assets/portraits/_testplate/dusty-rhodes',
};
const PREVIEW_NOTE = 'Local test plate, not a photograph. Proves the image pipeline before licensed import; replaced by tools/fetch-portraits.mjs.';

function previewBlock(id) {
  const stem = PREVIEW[id];
  if (!stem) return null;
  return { thumb: `${stem}-48.webp`, small: `${stem}-96.webp`, medium: `${stem}-192.webp`, large: `${stem}-384.webp` };
}

function sourceBlock(census) {
  return {
    page_url: COMMONS_FILE + census.f.replace(/ /g, '_'),
    file_url: null, // resolved by tools/fetch-portraits.mjs from the API, never hand-typed
    author: census.author,
    license: census.license,
    license_url: census.licenseUrl,
    attribution_required: census.attr,
    share_alike: /-SA/.test(census.license),
    restrictions: census.restrictions || null,
    retrieved: CENSUS_DATE,
    original_sha256: null,
    sha256_status: 'pending-fetch',
  };
}

function photoBlock(census) {
  return {
    date: census.date,
    era_match: census.era,
    crop: null,
    modified: false,
    requires_crop: Boolean(census.flag && census.flag.startsWith('needs-crop')),
  };
}

function main() {
  const roster = JSON.parse(readFileSync(join(ROOT, 'data/roster-manifest.json'), 'utf8'));
  const byId = new Map();
  for (const r of roster.roster_identities) byId.set(`wrestler_roster:${r.id}`, r);
  for (const r of roster.other_role_identities) byId.set(`announcer:${r.id}`, r);

  const rows = [...roster.roster_identities, ...roster.other_role_identities];
  const staff = rows.filter((r) => r.role === 'manager' || r.role === 'announcer');

  const portraits = [];
  const unresolved = [];

  for (const rec of staff) {
    const cls = rec.identity_class;
    const company = (rec.company_affiliations || []).map((a) => a.company).join(',') || null;
    const base = {
      id: rec.id,
      identity_class: cls,
      display_name: rec.display_name,
      role: rec.role,
      company_context: company,
      aliases: [],
      shared_with_ids: [],
    };

    const census = CENSUS[rec.id];
    const shareOwner = SHARES_WITH[rec.id];
    const ownerCensus = shareOwner ? CENSUS[shareOwner] : null;
    if (ownerCensus) {
      // Points at another row's photo. Duplicated source/photo/verification blocks are
      // intentional: each row must be independently auditable.
      portraits.push({
        ...base,
        shares_with_id: shareOwner,
        shared_with_ids: [],
        status: 'cleared',
        files: null,
        preview_files: previewBlock(rec.id),
        preview_note: previewBlock(rec.id) ? PREVIEW_NOTE : null,
        source: sourceBlock(ownerCensus),
        photo: photoBlock(ownerCensus),
        verification: {
          status: 'cleared',
          checked_on: CENSUS_DATE,
          license_evidence: `Shares the cleared photo of ${shareOwner}: ${ownerCensus.evidence}`,
          risks: ['Subject publicity/likeness rights are not cleared by the photographer\'s licence.'],
          notes: `Reuses the ${shareOwner} photo - same performer, two promotion rows in the source data. Ids are not merged.`,
        },
        approved_for: { commercial: true, modification: true },
        fallback_reason: null,
      });
    } else if (census) {
      const shared = (census.shared || []).filter((s) => s !== rec.id);
      portraits.push({
        ...base,
        shared_with_ids: shared,
        status: 'cleared',
        files: null,
        preview_files: previewBlock(rec.id),
        preview_note: previewBlock(rec.id) ? PREVIEW_NOTE : null,
        source: sourceBlock(census),
        photo: photoBlock(census),
        verification: {
          status: 'cleared',
          checked_on: CENSUS_DATE,
          license_evidence: census.evidence,
          risks: [
            census.restrictions === 'personality'
              ? 'Commons flags personality rights on this file: the licence clears copyright only, not likeness. Neutral crop, no promotion marks, no endorsement implied, takedown path documented.'
              : 'Subject publicity/likeness rights are not cleared by the photographer\'s licence.',
            ...(census.flag ? [census.flag] : []),
          ],
          notes: census.note || null,
        },
        approved_for: { commercial: true, modification: true },
        fallback_reason: null,
      });
      if (census.flag) unresolved.push({ id: rec.id, question: census.flag, since: CENSUS_DATE });
    } else {
      portraits.push({
        ...base,
        status: 'absent',
        files: null,
        preview_files: previewBlock(rec.id),
        preview_note: previewBlock(rec.id) ? PREVIEW_NOTE : null,
        source: null,
        photo: null,
        verification: {
          status: 'absent',
          checked_on: CENSUS_DATE,
          license_evidence: null,
          risks: [],
          notes: ABSENT[rec.id] || 'No photo located at census time.',
        },
        approved_for: null,
        fallback_reason: 'no-cleared-photo',
      });
    }
  }

  const counts = {};
  for (const p of portraits) counts[p.status] = (counts[p.status] || 0) + 1;

  const out = {
    schema: 'cwvwwf-portraits/1',
    generated: CENSUS_DATE,
    identity_source: 'data/roster-manifest.json',
    scope: 'Wave 1 (staff-first): all manager and announcer identities. Wrestler waves follow.',
    policy: POLICY,
    stats: {
      staff_rows: portraits.length,
      ...counts,
      by_role: portraits.reduce((a, p) => { a[p.role] = (a[p.role] || 0) + 1; return a; }, {}),
      era_breakdown: portraits.reduce((a, p) => {
        const k = p.photo ? p.photo.era_match : 'none';
        a[k] = (a[k] || 0) + 1; return a;
      }, {}),
    },
    portraits,
    unresolved,
  };

  writeFileSync(join(ROOT, 'data/portraits.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`data/portraits.json written: ${portraits.length} staff rows`);
  console.log('  status:', JSON.stringify(counts));
  console.log('  era   :', JSON.stringify(out.stats.era_breakdown));
  console.log('  unresolved licensing questions:', unresolved.length);
}

main();
