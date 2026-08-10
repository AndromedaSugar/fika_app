import {
  __resetAnalyticsForTests,
  ANALYTICS_CONSENT_KEY,
  denyAnalyticsConsent,
  grantAnalyticsConsent,
  revokeAnalyticsConsent,
  trackEvent,
  trackPageView,
} from './analytics';

const dataLayerEntries = () => (window.dataLayer || []).map((entry) => Array.from(entry));

beforeEach(() => {
  __resetAnalyticsForTests();
  window.localStorage.clear();
  window.__FIKA_CONFIG__ = { ga4MeasurementId: 'G-TEST123' };
  document.getElementById('fika-ga4-script')?.remove();
  delete window.gtag;
  delete window.dataLayer;
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0].trim();
    document.cookie = `${name}=; Max-Age=0; path=/`;
  });
});

test('does not load or replay interactions before consent, then sends one sanitized page view', () => {
  trackPageView({ path: '/saved-timetables?private=value#section', title: 'Saved timetables' });
  expect(trackEvent('route_selected', { route_code: '214A' })).toBe(false);
  expect(document.getElementById('fika-ga4-script')).toBeNull();

  expect(grantAnalyticsConsent()).toBe(true);
  expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('granted');
  expect(document.getElementById('fika-ga4-script')).not.toBeNull();

  const events = dataLayerEntries().filter(([command]) => command === 'event');
  expect(events).toHaveLength(1);
  expect(events[0][1]).toBe('page_view');
  expect(events[0][2].page_path).toBe('/saved-timetables');
  expect(events[0][2].page_location).not.toMatch(/[?#]/);

  expect(trackPageView({ path: '/saved-timetables?another=value', title: 'Saved timetables' })).toBe(false);
  expect(dataLayerEntries().filter(([command]) => command === 'event')).toHaveLength(1);
});

test('rejection persists without loading Google and revocation expires GA cookies', () => {
  denyAnalyticsConsent();
  expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied');
  expect(document.getElementById('fika-ga4-script')).toBeNull();

  grantAnalyticsConsent();
  document.cookie = '_ga=GA1.1.123; path=/';
  expect(document.cookie).toContain('_ga=');

  revokeAnalyticsConsent({ reload: false });
  expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied');
  expect(document.cookie).not.toContain('_ga=');
  expect(trackEvent('route_search', { result_count: 1 })).toBe(false);
});
