import { getAvailableRouteCount, getRouteCountLabel } from './routeUtils';

test('builds the homepage route count dynamically from unique available routes', () => {
  const routes = [
    { id: 1, agency: 'GABS', code: '0001', name: 'First route' },
    { id: 2, agency: 'MyCiti', code: '214A', name: 'Second route' },
    { id: 2, agency: 'MyCiti', code: '214A', name: 'Second route' },
  ];

  expect(getAvailableRouteCount(routes)).toBe(2);
  expect(getRouteCountLabel(getAvailableRouteCount(routes))).toBe('2 route timetables');
});
