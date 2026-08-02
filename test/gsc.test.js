const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  SEARCH_ANALYTICS_ROW_LIMIT,
  fetchAllSearchAnalyticsRows,
  getAccessToken,
} = require('../lib/gscClient');
const {
  getRequestedRange,
  normalizeDailyRows,
  normalizeSearchRows,
  replaceMetrics,
} = require('../scripts/sync-search-console');
const {
  aggregateMetrics,
  classifySearchIntent,
  enrichSearchRow,
  isUrlAlert,
} = require('../lib/gscReport');

test('OAuth JWT requests only the read-only Search Console scope', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  let requestBody;
  const token = await getAccessToken({
    credentials: {
      client_email: 'seo@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    },
    now: Date.parse('2026-08-02T00:00:00Z'),
    fetchImpl: async (_url, options) => {
      requestBody = options.body;
      return { ok: true, json: async () => ({ access_token: 'read-only-token' }) };
    },
  });
  const assertion = requestBody.get('assertion');
  const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8'));

  assert.equal(token, 'read-only-token');
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
});

test('Search Analytics pagination advances in 25,000-row batches and requests finalized data', async () => {
  const calls = [];
  const fullPage = Array.from({ length: SEARCH_ANALYTICS_ROW_LIMIT }, (_, index) => ({ keys: [String(index)] }));
  const rows = await fetchAllSearchAnalyticsRows({
    accessToken: 'token',
    siteUrl: 'https://www.fika.net.za/',
    startDate: '2026-07-01',
    endDate: '2026-07-21',
    dimensions: ['date'],
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return { ok: true, json: async () => ({ rows: body.startRow ? [] : fullPage }) };
    },
  });

  assert.equal(rows.length, SEARCH_ANALYTICS_ROW_LIMIT);
  assert.deepEqual(calls.map((call) => call.startRow), [0, SEARCH_ANALYTICS_ROW_LIMIT]);
  assert.ok(calls.every((call) => call.dataState === 'final' && call.rowLimit === 25000));
});

test('property-total requests can explicitly use byProperty aggregation', async () => {
  let requestBody;
  await fetchAllSearchAnalyticsRows({
    accessToken: 'token', siteUrl: 'https://www.fika.net.za/',
    startDate: '2026-08-01', endDate: '2026-08-01', dimensions: ['date'],
    aggregationType: 'byProperty',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ rows: [] }) };
    },
  });
  assert.equal(requestBody.aggregationType, 'byProperty');
});

test('default reruns overlap 21 days', () => {
  assert.deepEqual(getRequestedRange({ end: '2026-08-01' }), {
    startDate: '2026-07-12',
    endDate: '2026-08-01',
  });
});

test('position values are persisted as impression-weighted totals', () => {
  assert.equal(normalizeDailyRows([{ keys: ['2026-08-01'], impressions: 10, clicks: 1, position: 8.5 }])[0].position_sum, 85);
  assert.equal(normalizeSearchRows([{ keys: ['2026-08-01', 'bus', 'https://www.fika.net.za/', 'zaf', 'mobile'], impressions: 20, position: 4 }])[0].position_sum, 80);
  assert.equal(aggregateMetrics([
    { impressions: 10, clicks: 1, position_sum: 100 },
    { impressions: 30, clicks: 2, position_sum: 150 },
  ]).position, 6.25);
});

test('overlap writes are idempotent and rollback on failure', async () => {
  const queries = [];
  const successfulClient = {
    async query(sql) {
      queries.push(sql);
      return { rows: [] };
    },
  };
  await replaceMetrics(successfulClient, {
    startDate: '2026-07-01', endDate: '2026-07-21',
    dailyRows: [{ metric_date: '2026-07-01', search_type: 'web', clicks: 0, impressions: 1, position_sum: 5 }],
    searchRows: [],
  });
  assert.ok(queries.some((sql) => sql.includes('ON CONFLICT (metric_date, search_type) DO UPDATE')));
  assert.equal(queries.at(-1), 'COMMIT');

  const failedQueries = [];
  await assert.rejects(replaceMetrics({
    async query(sql) {
      failedQueries.push(sql);
      if (sql.includes('INSERT INTO gsc_daily_metrics')) {
        throw new Error('simulated write failure');
      }
      return { rows: [] };
    },
  }, {
    startDate: '2026-07-01', endDate: '2026-07-21',
    dailyRows: [{ metric_date: '2026-07-01', search_type: 'web', clicks: 0, impressions: 1, position_sum: 5 }],
    searchRows: [],
  }), /simulated write failure/);
  assert.equal(failedQueries.at(-1), 'ROLLBACK');
});

test('opportunities and intent classification use query/page pairs', () => {
  const row = enrichSearchRow({ query: '244 bus timetable', page: 'https://www.fika.net.za/areas/atlantis', clicks: 0, impressions: 100, position_sum: 900 });
  assert.equal(row.position, 9);
  assert.equal(row.estimatedUpside, 1);
  assert.equal(classifySearchIntent('244 bus timetable'), 'route-number');
  assert.equal(classifySearchIntent('mamre crown bus times'), 'area');
});

test('URL alerts exclude expected redirects to route-code canonicals', () => {
  assert.equal(isUrlAlert({ status_code: 404 }), true);
  assert.equal(isUrlAlert({ status_code: 301, page: 'https://www.fika.net.za/timetables/golden-arrow/39-old', location: '/timetables/golden-arrow/route-0175-new' }), false);
  assert.equal(isUrlAlert({ status_code: 302, page: 'https://www.fika.net.za/old', location: '/' }), true);
});
