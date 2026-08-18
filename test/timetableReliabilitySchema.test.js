const test = require('node:test');
const assert = require('node:assert/strict');
const { TIMETABLE_RELIABILITY_SCHEMA_SQL } = require('../lib/timetableReliabilitySchema');

test('source registry schema records required provenance and review state', () => {
  [
    'operator text',
    'route_name text',
    'direction_names text[]',
    'service_day_coverage text[]',
    'official_source_url text',
    'source_effective_date date',
    'last_downloaded_at timestamptz',
    'last_manually_verified_on date',
    'current_pdf_sha256 text',
    'parser_version text',
    'import_version text',
    "status IN ('verified', 'changed_review_required', 'withdrawn')",
  ].forEach((fragment) => assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, new RegExp(fragment.replace(/[()[\]]/g, '\\$&'))));
});

test('source versions preserve captured PDFs, canonical extraction, comparisons, and approvals', () => {
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /pdf_bytes bytea NOT NULL/);
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /extraction jsonb NOT NULL/);
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /comparison jsonb NOT NULL/);
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /approved_by text/);
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /published_at timestamptz/);
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /target_sample_size integer NOT NULL CHECK \(target_sample_size >= 100\)/);
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /timetable_source_version_id bigint REFERENCES timetable_source_versions/);
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /timetable_service_family text CHECK/);
  assert.match(TIMETABLE_RELIABILITY_SCHEMA_SQL, /timetable_trip_ordinal integer CHECK/);
});
