import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReliabilityPage from './ReliabilityPage';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status_counts: { verified: 1, changed_review_required: 1, withdrawn: 0 },
      daily_check_current: true,
      weekly_audit_current: true,
      latest_check: { finished_at: '2026-08-17T01:22:00Z' },
      latest_audit: {
        audit_week: '2026-08-10',
        completed_at: '2026-08-16T09:00:00Z',
        statement: '198 of 200 sampled departures matched the cited operator PDF.',
      },
      sources: [{
        id: 1,
        operator: 'GABS',
        source_key: '000401',
        route: 'ATLANTIS - CAPE TOWN',
        directions: ['ATLANTIS - CAPE TOWN'],
        service_days: ['monday', 'saturday'],
        official_source_url: 'https://operator.example/000401.pdf',
        source_effective_date: '2026-08-10',
        last_downloaded_at: '2026-08-17T01:20:00Z',
        last_manually_verified_on: '2026-08-16',
        pdf_sha256: 'a'.repeat(64),
        approved_pdf_sha256: 'a'.repeat(64),
        parser_version: 'gabs-2',
        import_version: 'canonical-1',
        status: 'verified',
      }],
      change_log: [],
    }),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('separates source accuracy from operational punctuality and renders audit evidence', async () => {
  render(<ReliabilityPage />);

  expect(screen.getByText(/Source accuracy/)).toBeInTheDocument();
  expect(screen.getByText(/Operational punctuality/)).toBeInTheDocument();
  expect(await screen.findByText('198 of 200 sampled departures matched the cited operator PDF.')).toBeInTheDocument();
  expect(screen.getAllByText('ATLANTIS - CAPE TOWN')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Operator PDF' })).toHaveAttribute('href', 'https://operator.example/000401.pdf');
});

test('paginates the filtered source registry at 20 rows while retaining filters', async () => {
  const sources = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    operator: 'GABS',
    source_key: `SRC-${String(index + 1).padStart(2, '0')}`,
    route: `ROUTE ${String(index + 1).padStart(2, '0')}`,
    directions: [`Direction ${index + 1}`],
    service_days: ['monday'],
    official_source_url: `https://operator.example/${index + 1}.pdf`,
    source_effective_date: '2026-08-10',
    last_downloaded_at: '2026-08-17T01:20:00Z',
    last_manually_verified_on: '2026-08-16',
    pdf_sha256: String(index).padStart(64, '0'),
    approved_pdf_sha256: String(index).padStart(64, '0'),
    parser_version: 'gabs-2',
    import_version: 'canonical-1',
    status: 'verified',
  }));
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      status_counts: { verified: 25, changed_review_required: 0, withdrawn: 0 },
      daily_check_current: true,
      weekly_audit_current: true,
      latest_check: null,
      latest_audit: null,
      sources,
      change_log: [],
    }),
  });

  render(<ReliabilityPage />);

  expect(await screen.findByText('ROUTE 01')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(21);
  expect(screen.queryByText('ROUTE 21')).not.toBeInTheDocument();

  const search = screen.getByLabelText('Find a route');
  const status = screen.getByLabelText('Status');
  fireEvent.change(search, { target: { value: 'route' } });
  fireEvent.change(status, { target: { value: 'verified' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  expect(search).toHaveValue('route');
  expect(status).toHaveValue('verified');
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByText('ROUTE 21')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(6);
});
