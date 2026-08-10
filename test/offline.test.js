const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serviceWorker = fs.readFileSync(
  path.join(__dirname, '..', 'client', 'public', 'sw.js'),
  'utf8'
);
const clientEntrypoint = fs.readFileSync(
  path.join(__dirname, '..', 'client', 'src', 'index.js'),
  'utf8'
);

test('offline shell precaches the saved hub and current asset manifest', () => {
  assert.match(serviceWorker, /'\/saved-timetables'/);
  assert.match(serviceWorker, /'\/asset-manifest\.json'/);
  assert.match(serviceWorker, /manifest\.entrypoints/);
  assert.match(serviceWorker, /networkFirstNavigation/);
  assert.match(serviceWorker, /staleWhileRevalidate/);
});

test('service worker bypasses timetable APIs and is registered only by production clients', () => {
  assert.match(serviceWorker, /url\.pathname === '\/schedules'/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/schedule_times\/'\)/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(clientEntrypoint, /process\.env\.NODE_ENV === 'production'/);
  assert.match(clientEntrypoint, /serviceWorker\.register\('\/sw\.js'/);
  assert.doesNotMatch(clientEntrypoint, /unregisterLegacyServiceWorkers/);
});
