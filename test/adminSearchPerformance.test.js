const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSearchPerformanceHandler,
  isAuthorized,
  parseBasicAuthorization,
} = require('../lib/adminSearchPerformance');

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    type() { return this; },
    send(value) { this.body = value; return this; },
  };
}

test('Basic authentication parsing preserves colons in passwords', () => {
  const header = `Basic ${Buffer.from('admin:a:strong:password').toString('base64')}`;
  assert.deepEqual(parseBasicAuthorization(header), { username: 'admin', password: 'a:strong:password' });
  assert.equal(isAuthorized(header, 'admin', 'a:strong:password'), true);
  assert.equal(isAuthorized(header, 'admin', 'wrong'), false);
});

test('unauthorized report requests return 401 with no-store and noindex headers', async () => {
  let databaseCalled = false;
  const handler = createSearchPerformanceHandler({
    database: { async query() { databaseCalled = true; } },
    username: 'admin',
    password: 'secret',
  });
  const response = responseRecorder();
  await handler({ get: () => '', query: {} }, response);

  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.match(response.headers['WWW-Authenticate'], /^Basic/);
  assert.equal(databaseCalled, false);
});

test('authorized report requests render period comparisons', async () => {
  const handler = createSearchPerformanceHandler({
    database: {
      async query(sql) {
        if (sql.includes('MAX(metric_date)')) {
          return { rows: [{ latest_date: '2026-08-01' }] };
        }
        if (sql.includes('FROM gsc_daily_metrics') && sql.includes('SELECT metric_date')) {
          return { rows: [
            { metric_date: '2026-08-01', clicks: 2, impressions: 100, position_sum: 900 },
            { metric_date: '2026-07-04', clicks: 1, impressions: 80, position_sum: 800 },
          ] };
        }
        return { rows: [] };
      },
    },
    username: 'admin',
    password: 'secret',
  });
  const response = responseRecorder();
  const authorization = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
  await handler({ get: () => authorization, query: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Fika Search Performance/);
  assert.match(response.body, /Clicks/);
  assert.match(response.body, /2026-07-05 to 2026-08-01/);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
