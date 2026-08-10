import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  denyAnalyticsConsent,
  getStoredAnalyticsConsent,
  grantAnalyticsConsent,
  hasAnalyticsConfiguration,
  initializeAnalytics,
  revokeAnalyticsConsent,
} from './analytics';

const AnalyticsConsentContext = createContext({
  analyticsAvailable: false,
  consent: null,
  openAnalyticsSettings: () => {},
});

export const useAnalyticsConsent = () => useContext(AnalyticsConsentContext);

export function AnalyticsSettingsButton({ className = '' }) {
  const { analyticsAvailable, openAnalyticsSettings } = useAnalyticsConsent();

  if (!analyticsAvailable) {
    return null;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={openAnalyticsSettings}
    >
      Analytics settings
    </button>
  );
}

export function AnalyticsConsentProvider({ children }) {
  const analyticsAvailable = hasAnalyticsConfiguration();
  const [consent, setConsent] = useState(getStoredAnalyticsConsent);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsHeadingRef = useRef(null);

  useEffect(() => {
    if (analyticsAvailable && consent === 'granted') {
      initializeAnalytics();
    }
  }, [analyticsAvailable, consent]);

  useEffect(() => {
    if (!analyticsAvailable) {
      return undefined;
    }

    const openLinkedSettings = () => {
      if (window.location.hash === '#analytics-settings') {
        setSettingsOpen(true);
      }
    };

    openLinkedSettings();
    window.addEventListener('hashchange', openLinkedSettings);
    return () => window.removeEventListener('hashchange', openLinkedSettings);
  }, [analyticsAvailable]);

  useEffect(() => {
    if (!settingsOpen) {
      return undefined;
    }

    settingsHeadingRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);

  const acceptAnalytics = () => {
    grantAnalyticsConsent();
    setConsent('granted');
    setSettingsOpen(false);
  };

  const rejectAnalytics = () => {
    const wasGranted = consent === 'granted';

    if (wasGranted) {
      revokeAnalyticsConsent();
      return;
    }

    denyAnalyticsConsent();
    setConsent('denied');
    setSettingsOpen(false);
  };

  const contextValue = useMemo(() => ({
    analyticsAvailable,
    consent,
    openAnalyticsSettings: () => setSettingsOpen(true),
  }), [analyticsAvailable, consent]);

  return (
    <AnalyticsConsentContext.Provider value={contextValue}>
      {children}
      {analyticsAvailable && consent === null && (
        <section className="analytics-consent-banner" aria-label="Analytics choice">
          <div>
            <h2>Help improve Fika</h2>
            <p>
              With your permission, Fika uses Google Analytics to understand which timetable
              features are useful. It never sends your raw searches or timetable contents.
            </p>
          </div>
          <div className="analytics-consent-actions">
            <button type="button" onClick={acceptAnalytics}>Accept analytics</button>
            <button type="button" onClick={rejectAnalytics}>Reject</button>
          </div>
        </section>
      )}
      {analyticsAvailable && settingsOpen && (
        <div className="analytics-settings" role="dialog" aria-modal="true" aria-labelledby="analytics-settings-title">
          <button
            type="button"
            className="analytics-settings-backdrop"
            aria-label="Close analytics settings"
            onClick={() => setSettingsOpen(false)}
          />
          <section className="analytics-settings-panel">
            <h2 id="analytics-settings-title" tabIndex="-1" ref={settingsHeadingRef}>
              Analytics settings
            </h2>
            <p>
              Allow Fika to measure anonymous page and timetable interactions. Raw route-search
              text, stops, timetable contents, and personal information are not sent.
            </p>
            <p className="analytics-settings-status">
              Current choice: <strong>{consent === 'granted' ? 'Accepted' : consent === 'denied' ? 'Rejected' : 'Not chosen'}</strong>
            </p>
            <div className="analytics-consent-actions">
              <button type="button" onClick={acceptAnalytics}>Accept analytics</button>
              <button type="button" onClick={rejectAnalytics}>Reject</button>
              <button type="button" className="secondary" onClick={() => setSettingsOpen(false)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </AnalyticsConsentContext.Provider>
  );
}
