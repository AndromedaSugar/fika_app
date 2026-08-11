import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  __resetAnalyticsForTests,
  initializeAnalytics,
} from './analytics';
import SchedulesDropdown from './SchedulesDropdown';

const dataLayerEntries = () => (window.dataLayer || []).map((entry) => Array.from(entry));

beforeEach(() => {
  jest.useFakeTimers();
  __resetAnalyticsForTests();
  window.localStorage.clear();
  window.__FIKA_CONFIG__ = { ga4MeasurementId: 'G-TEST123' };
  document.getElementById('fika-ga4-script')?.remove();
  delete window.gtag;
  delete window.dataLayer;
  initializeAnalytics();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test('debounces search metrics without sending raw search text', () => {
  render(
    <SchedulesDropdown
      schedules={[{
        id: 1,
        agency: 'GABS',
        code: '0004',
        name: 'ATLANTIS - CAPE TOWN',
      }]}
      selectedAgency="GABS"
      onAgencyChange={() => {}}
      onRouteSelect={() => {}}
      route={null}
      searchLocation="landing_search"
    />
  );

  fireEvent.change(screen.getByPlaceholderText('Search route...'), {
    target: { value: 'Private unmatched search' },
  });
  jest.advanceTimersByTime(749);
  expect(dataLayerEntries().some((entry) => entry[1] === 'route_search')).toBe(false);
  jest.advanceTimersByTime(1);

  const searchEvents = dataLayerEntries().filter((entry) =>
    entry[1] === 'route_search' || entry[1] === 'no_search_results'
  );
  expect(searchEvents).toHaveLength(2);
  searchEvents.forEach((entry) => {
    expect(entry[2]).toEqual({
      agency: 'GABS',
      search_location: 'landing_search',
      result_count: 0,
      query_length_bucket: '8+',
    });
    expect(JSON.stringify(entry[2])).not.toMatch(/private|unmatched|search_term/i);
  });
});
