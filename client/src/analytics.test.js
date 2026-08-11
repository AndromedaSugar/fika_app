import {
  __resetAnalyticsForTests,
  initializeAnalytics,
  trackEvent,
  trackPageView,
} from './analytics';

const dataLayerEntries = () => (window.dataLayer || []).map((entry) => Array.from(entry));

beforeEach(() => {
  __resetAnalyticsForTests();
  window.__FIKA_CONFIG__ = { ga4MeasurementId: 'G-TEST123' };
  document.getElementById('fika-ga4-script')?.remove();
  delete window.gtag;
  delete window.dataLayer;
});

test('remains disabled when no valid measurement ID is configured', () => {
  window.__FIKA_CONFIG__ = { ga4MeasurementId: '' };

  expect(initializeAnalytics()).toBe(false);
  expect(trackEvent('route_selected', { route_code: '214A' })).toBe(false);
  expect(document.getElementById('fika-ga4-script')).toBeNull();
});

test('loads automatically with privacy-limited storage and sends one sanitized page view', () => {
  trackPageView({ path: '/saved-timetables?private=value#section', title: 'Saved timetables' });
  expect(initializeAnalytics()).toBe(true);
  expect(document.getElementById('fika-ga4-script')).not.toBeNull();

  const commands = dataLayerEntries();
  const consent = commands.find(([command]) => command === 'consent');
  const config = commands.find(([command]) => command === 'config');
  const events = commands.filter(([command]) => command === 'event');

  expect(consent[2]).toMatchObject({
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  expect(config[2]).toMatchObject({
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  expect(events).toHaveLength(1);
  expect(events[0][1]).toBe('page_view');
  expect(events[0][2].page_path).toBe('/saved-timetables');
  expect(events[0][2].page_location).not.toMatch(/[?#]/);

  expect(trackPageView({ path: '/saved-timetables?another=value', title: 'Saved timetables' })).toBe(false);
  expect(dataLayerEntries().filter(([command]) => command === 'event')).toHaveLength(1);
});
