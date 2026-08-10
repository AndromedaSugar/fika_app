export const ANALYTICS_CONSENT_KEY = 'fika-analytics-consent-v1';

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;
const SCRIPT_ID = 'fika-ga4-script';

let analyticsInitialized = false;
let analyticsGranted = false;
let latestPageView = null;
let lastPageViewKey = '';
const trackedTimetableViews = new Set();

const getWindow = () => (typeof window === 'undefined' ? null : window);

export const getAnalyticsMeasurementId = () => {
  const browserWindow = getWindow();
  const runtimeId = browserWindow?.__FIKA_CONFIG__?.ga4MeasurementId;
  const buildId = process.env.REACT_APP_GA4_MEASUREMENT_ID;
  const measurementId = String(runtimeId || buildId || '').trim();

  return MEASUREMENT_ID_PATTERN.test(measurementId) ? measurementId.toUpperCase() : '';
};

export const hasAnalyticsConfiguration = () => Boolean(getAnalyticsMeasurementId());

export const getStoredAnalyticsConsent = () => {
  const browserWindow = getWindow();

  if (!browserWindow) {
    return null;
  }

  try {
    const value = browserWindow.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch (error) {
    return null;
  }
};

const storeAnalyticsConsent = (value) => {
  const browserWindow = getWindow();

  if (!browserWindow) {
    return;
  }

  try {
    browserWindow.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch (error) {
    // A blocked localStorage preference should not prevent the visitor's current choice.
  }
};

const ensureGtag = () => {
  const browserWindow = getWindow();

  if (!browserWindow) {
    return null;
  }

  browserWindow.dataLayer = browserWindow.dataLayer || [];
  browserWindow.gtag = browserWindow.gtag || function gtag() {
    browserWindow.dataLayer.push(arguments);
  };

  return browserWindow.gtag;
};

const sanitizePageView = ({ path, title } = {}) => {
  const browserWindow = getWindow();

  if (!browserWindow) {
    return null;
  }

  let pagePath = path || browserWindow.location.pathname || '/';

  try {
    pagePath = new URL(pagePath, browserWindow.location.origin).pathname;
  } catch (error) {
    pagePath = String(pagePath).split(/[?#]/)[0] || '/';
  }

  return {
    page_path: pagePath,
    page_location: `${browserWindow.location.origin}${pagePath}`,
    page_title: String(title || browserWindow.document.title || 'Fika Timetables'),
  };
};

const sendPageView = (pageView) => {
  const gtag = ensureGtag();

  if (!gtag || !analyticsGranted || !analyticsInitialized || !pageView) {
    return false;
  }

  const pageViewKey = `${pageView.page_path}|${pageView.page_title}`;

  if (lastPageViewKey === pageViewKey) {
    return false;
  }

  lastPageViewKey = pageViewKey;
  gtag('event', 'page_view', pageView);
  return true;
};

export const initializeAnalytics = () => {
  const browserWindow = getWindow();
  const measurementId = getAnalyticsMeasurementId();

  if (!browserWindow || !measurementId) {
    return false;
  }

  analyticsGranted = true;

  if (!analyticsInitialized) {
    const gtag = ensureGtag();

    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    gtag('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    gtag('js', new Date());
    gtag('config', measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    if (!browserWindow.document.getElementById(SCRIPT_ID)) {
      const script = browserWindow.document.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      browserWindow.document.head.appendChild(script);
    }

    analyticsInitialized = true;
  }

  sendPageView(latestPageView);
  return true;
};

export const grantAnalyticsConsent = () => {
  storeAnalyticsConsent('granted');
  return initializeAnalytics();
};

export const denyAnalyticsConsent = () => {
  analyticsGranted = false;
  storeAnalyticsConsent('denied');
};

const expireAnalyticsCookies = () => {
  const browserWindow = getWindow();

  if (!browserWindow) {
    return;
  }

  const cookieNames = browserWindow.document.cookie
    .split(';')
    .map((cookie) => cookie.split('=')[0].trim())
    .filter((name) => /^_ga(?:_|$)/.test(name));
  const hostnameParts = browserWindow.location.hostname.split('.');
  const domainCandidates = hostnameParts
    .slice(0, -1)
    .map((unused, index) => `.${hostnameParts.slice(index).join('.')}`);

  cookieNames.forEach((name) => {
    browserWindow.document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    domainCandidates.forEach((domain) => {
      browserWindow.document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}; SameSite=Lax`;
    });
  });
};

export const revokeAnalyticsConsent = ({ reload = true } = {}) => {
  const browserWindow = getWindow();

  if (browserWindow?.gtag) {
    browserWindow.gtag('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
  }

  analyticsGranted = false;
  storeAnalyticsConsent('denied');
  expireAnalyticsCookies();

  if (reload && browserWindow) {
    browserWindow.location.reload();
  }
};

export const trackPageView = (page) => {
  latestPageView = sanitizePageView(page);
  return sendPageView(latestPageView);
};

export const trackEvent = (eventName, parameters = {}) => {
  const gtag = ensureGtag();

  if (!gtag || !analyticsGranted || !analyticsInitialized) {
    return false;
  }

  gtag('event', eventName, parameters);
  return true;
};

export const trackTimetableView = (viewKey, parameters) => {
  if (!viewKey || trackedTimetableViews.has(viewKey)) {
    return false;
  }

  const tracked = trackEvent('timetable_viewed', parameters);

  if (tracked) {
    trackedTimetableViews.add(viewKey);
  }

  return tracked;
};

export const getOnlineState = () => {
  const browserWindow = getWindow();
  return browserWindow?.navigator?.onLine === false ? 'offline' : 'online';
};

export const __resetAnalyticsForTests = () => {
  analyticsInitialized = false;
  analyticsGranted = false;
  latestPageView = null;
  lastPageViewKey = '';
  trackedTimetableViews.clear();
};
