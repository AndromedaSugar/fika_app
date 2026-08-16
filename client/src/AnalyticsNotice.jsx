import React, { useState } from 'react';
import { getAnalyticsMeasurementId } from './analytics';

export const ANALYTICS_NOTICE_DISMISSED_KEY = 'fika-analytics-notice-dismissed-v1';

const shouldShowAnalyticsNotice = () => {
  if (!getAnalyticsMeasurementId() || typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(ANALYTICS_NOTICE_DISMISSED_KEY) !== 'dismissed';
  } catch (error) {
    return true;
  }
};

export default function AnalyticsNotice() {
  const [visible, setVisible] = useState(shouldShowAnalyticsNotice);

  if (!visible) {
    return null;
  }

  const dismissNotice = () => {
    try {
      window.localStorage.setItem(ANALYTICS_NOTICE_DISMISSED_KEY, 'dismissed');
    } catch (error) {
      // Still close the notice for this page when browser storage is unavailable.
    }

    setVisible(false);
  };

  return (
    <aside className="analytics-notice" aria-label="Analytics and cookie notice">
      <p>
        Fika uses cookies and browsing data to understand how the site is used and improve the
        service. <a href="/privacy-policy">Read more in our Privacy Policy</a>.
      </p>
      <button type="button" onClick={dismissNotice} aria-label="Close analytics and cookie notice">
        Close
      </button>
    </aside>
  );
}
