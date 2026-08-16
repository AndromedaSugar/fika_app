import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RouteLinkList from './RouteLinkList';

const route = {
  id: 2,
  agency: 'GABS',
  code: '0002',
  name: 'CAPE TOWN - BLAAUWBERG',
};

test('uses a single compact route label on an operator page', () => {
  render(<RouteLinkList routes={[route]} emptyMessage="" compact />);

  expect(screen.getByRole('link', { name: '0002 Cape Town to Blaauwberg' })).toBeInTheDocument();
  expect(screen.queryByText(/Golden Arrow|bus times/)).not.toBeInTheDocument();
  expect(document.querySelector('.seo-route-grid small')).not.toBeInTheDocument();
});

test('retains route and operator context in the default listing', () => {
  render(<RouteLinkList routes={[route]} emptyMessage="" />);

  expect(screen.getByText('Golden Arrow 0002 Cape Town to Blaauwberg bus times')).toBeInTheDocument();
  expect(screen.getByText('0002 - CAPE TOWN - BLAAUWBERG · Golden Arrow')).toBeInTheDocument();
});
