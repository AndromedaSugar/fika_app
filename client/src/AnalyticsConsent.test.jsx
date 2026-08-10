import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AnalyticsConsentProvider,
  AnalyticsSettingsButton,
} from './AnalyticsConsent';
import {
  getStoredAnalyticsConsent,
  grantAnalyticsConsent,
  hasAnalyticsConfiguration,
  revokeAnalyticsConsent,
} from './analytics';

jest.mock('./analytics', () => ({
  denyAnalyticsConsent: jest.fn(),
  getStoredAnalyticsConsent: jest.fn(() => null),
  grantAnalyticsConsent: jest.fn(),
  hasAnalyticsConfiguration: jest.fn(() => true),
  initializeAnalytics: jest.fn(),
  revokeAnalyticsConsent: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  getStoredAnalyticsConsent.mockReturnValue(null);
  hasAnalyticsConfiguration.mockReturnValue(true);
});

test('requires an explicit choice and exposes settings again after acceptance', () => {
  render(
    <AnalyticsConsentProvider>
      <AnalyticsSettingsButton />
    </AnalyticsConsentProvider>
  );

  expect(screen.getByRole('region', { name: 'Analytics choice' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));
  expect(grantAnalyticsConsent).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('region', { name: 'Analytics choice' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Analytics settings' }));
  expect(screen.getByRole('dialog', { name: 'Analytics settings' })).toBeInTheDocument();
  expect(screen.getByText(/Current choice:/)).toHaveTextContent('Accepted');

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  expect(revokeAnalyticsConsent).toHaveBeenCalledTimes(1);
});
