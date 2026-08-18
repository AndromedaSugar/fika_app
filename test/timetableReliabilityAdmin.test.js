const test = require('node:test');
const assert = require('node:assert/strict');
const {
  actionToken,
  comparisonSummary,
  johannesburgDate,
  renderAdminPage,
  secureEqual,
} = require('../lib/timetableReliabilityAdmin');

test('manual verification dates use the Cape Town calendar day', () => {
  assert.equal(johannesburgDate(new Date('2026-08-16T22:30:00Z')), '2026-08-17');
});

test('action tokens are scoped to the action and exact candidate', () => {
  const token = actionToken('secret', 'approve', '3:8:abc');
  assert.equal(secureEqual(token, actionToken('secret', 'approve', '3:8:abc')), true);
  assert.equal(secureEqual(token, actionToken('secret', 'approve', '3:9:def')), false);
  assert.equal(secureEqual(token, actionToken('secret', 'withdraw', '3:8:abc')), false);
});

test('comparison summary reports counts and changed times', () => {
  const summary = comparisonSummary({
    previous_scheduled_departure_count: 180,
    current_scheduled_departure_count: 182,
    changed_time_count: 2,
    added_time_count: 3,
    removed_time_count: 1,
  });
  assert.match(summary, /180 → 182 departures/);
  assert.match(summary, /2 changed, 3 added, 1 removed/);
});

test('admin page makes publication an explicit review action and scopes the accuracy claim', () => {
  const html = renderAdminPage({
    sources: [{
      id: 3,
      operator: 'GABS',
      source_key: '000401',
      route_name: '<route>',
      direction_names: ['Outbound'],
      service_day_coverage: ['monday'],
      official_source_url: 'https://operator.example/source.pdf',
      source_effective_date: new Date(2026, 7, 10),
      last_downloaded_at: '2026-08-17T01:00:00Z',
      current_pdf_sha256: 'a'.repeat(64),
      parser_version: 'gabs-2',
      import_version: 'canonical-1',
      status: 'changed_review_required',
      approved_version_id: 7,
      pending_version_id: 8,
      pending_pdf_sha256: 'b'.repeat(64),
      pending_pdf_size_bytes: 1234,
      pending_comparison: { previous_departure_count: 10, candidate_departure_count: 11 },
    }],
    checkRuns: [],
    audit: null,
    samples: [],
  }, 'secret');

  assert.match(html, /Approve and publish/);
  assert.match(html, /versions\/8\/comparison/);
  assert.match(html, /not a punctuality audit/);
  assert.match(html, /&lt;route&gt;/);
  assert.doesNotMatch(html, /<route>/);
  assert.match(html, /Effective 2026-08-10/);
});

test('admin page quarantines parser failures without offering publication', () => {
  const html = renderAdminPage({
    sources: [{
      id: 4,
      operator: 'GABS',
      source_key: '006603',
      official_source_url: 'https://operator.example/006603.pdf',
      direction_names: [],
      service_day_coverage: [],
      parser_version: 'parser-v2',
      import_version: 'canonical-v1',
      status: 'changed_review_required',
      pending_version_id: 12,
      pending_pdf_sha256: 'c'.repeat(64),
      pending_pdf_size_bytes: 4567,
      pending_comparison: { parse_error: '<unexpected layout>' },
    }],
    checkRuns: [],
    audit: null,
    samples: [],
  }, 'secret');

  assert.match(html, /Parser failed; publication is blocked/);
  assert.match(html, /&lt;unexpected layout&gt;/);
  assert.doesNotMatch(html, /Approve and publish<\/button>/);
  assert.match(html, /captured PDF/);
});
