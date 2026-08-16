import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AnalyticsNotice, { ANALYTICS_NOTICE_DISMISSED_KEY } from './AnalyticsNotice';

beforeEach(() => {
  window.localStorage.clear();
  window.__FIKA_CONFIG__ = { ga4MeasurementId: 'G-TEST123' };
});

test('shows an informational privacy link and remembers when it is closed', () => {
  const firstRender = render(<AnalyticsNotice />);

  expect(screen.getByRole('complementary', { name: 'Analytics and cookie notice' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Privacy Policy/i })).toHaveAttribute('href', '/privacy-policy');

  fireEvent.click(screen.getByRole('button', { name: 'Close analytics and cookie notice' }));
  expect(screen.queryByRole('complementary', { name: 'Analytics and cookie notice' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem(ANALYTICS_NOTICE_DISMISSED_KEY)).toBe('dismissed');

  firstRender.unmount();
  render(<AnalyticsNotice />);
  expect(screen.queryByRole('complementary', { name: 'Analytics and cookie notice' })).not.toBeInTheDocument();
});

test('does not show when analytics is not configured', () => {
  window.__FIKA_CONFIG__ = { ga4MeasurementId: '' };
  render(<AnalyticsNotice />);

  expect(screen.queryByRole('complementary', { name: 'Analytics and cookie notice' })).not.toBeInTheDocument();
});
