import React from 'react';
import SiteFooter from './SiteFooter';
import { AnalyticsSettingsButton } from './AnalyticsConsent';

export const INFO_PAGES = {
  '/about': {
    title: 'About Fika Timetables',
    eyebrow: 'About',
    body: [
      'Fika Timetables helps Cape Town commuters search Golden Arrow and MyCiTi bus timetables in one place. The site turns route data into readable pages with route names, directions, stops, service days, and listed trip times.',
      'The project exists because bus timetable information is often split across PDFs, operator pages, and route notices. Fika keeps the everyday lookup task focused: choose a route, compare the available directions, and scan the stop-by-stop timetable.',
      'Viewed timetables can be stored in your browser for offline reference. This is useful during commutes where mobile data is unreliable, but critical journeys should still be confirmed with the relevant transport operator.',
      'More South African operators, cities, and provinces are planned as reliable timetable data becomes available.',
    ],
  },
  '/contact': {
    title: 'Contact Fika Timetables',
    eyebrow: 'Contact',
    body: [
      'For timetable feedback, data corrections, accessibility issues, or general enquiries, contact the Fika team.',
      'Email: hello@fika.net.za',
      'Please include the agency, route name, direction, and stop details when reporting timetable data issues.',
      'Fika is an independent timetable viewer and does not operate bus services, sell travel cards, set fares, or issue service alerts. For account, fare, card, lost property, or urgent travel questions, contact the relevant operator directly.',
    ],
  },
  '/privacy-policy': {
    title: 'Privacy Policy',
    eyebrow: 'Privacy',
    body: [
      'Fika Timetables stores viewed and saved timetables in your browser using IndexedDB so selected timetable data can be available offline.',
      'With your permission, Fika Timetables uses Google Analytics 4 to measure page visits and interactions with route search, timetable filters, and offline saving. Google Analytics is not loaded until you accept analytics.',
      'Fika does not send raw route-search text, stop names, timetable contents, contact details, or raw error messages to Google Analytics. Advertising storage, Google Signals, and ad personalization are disabled.',
      'Your analytics choice is stored in this browser. You can reject analytics initially or change your choice later through the Analytics settings control on this page and in the site footer.',
      'Analytics event-level data is configured for a 14-month retention period. Fika Timetables does not run third-party promotional networks or personalized marketing trackers.',
      'You can manage or delete locally stored timetable data in your browser settings. Clearing site data may remove saved offline timetables.',
      'The site does not require user accounts and does not ask for sensitive personal information. Contact hello@fika.net.za for privacy questions.',
      'Route searches and saved timetable choices are handled in your browser unless they are needed to request timetable data from the server.',
    ],
    showAnalyticsSettings: true,
  },
  '/terms': {
    title: 'Terms and Disclaimer',
    eyebrow: 'Terms',
    body: [
      'Fika Timetables is provided as a commuter-friendly timetable viewer. Always confirm critical trips with the relevant transport operator.',
      'Timetable data can change, and Fika does not guarantee that every route, stop, or trip time is complete or current.',
      'Fika is independent from Golden Arrow, MyCiTi, and other transport operators unless a future page says otherwise. Operator names and logos are used only to identify the timetable source or service being viewed.',
      'You may use the site for personal timetable lookup. Automated scraping or abusive request patterns are not permitted.',
    ],
  },
};

export default function InfoPage({ page }) {
  return (
    <main className="info-page">
      <section className="info-panel">
        <p className="info-eyebrow">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        {page.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {page.showAnalyticsSettings && (
          <span id="analytics-settings">
            <AnalyticsSettingsButton className="privacy-settings-button" />
          </span>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
