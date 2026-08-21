import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import ScheduleTable, { getVisibleRows } from './ScheduleTable';

const weekdayTrip = {
  trip_id: 101,
  monday: true,
  service_pattern: '11111000',
  first_arrival: '04:50:00',
};

const saturdayTrip = {
  trip_id: 202,
  saturday: true,
  service_pattern: '00000100',
  first_arrival: '06:00:00',
};

const rows = [
  {
    name: 'MAKHAZA',
    sequence: 0,
    stop_times: [
      { trip_id: 101, stop_time_type: 'not_served' },
      { trip_id: 202, arrival: '06:00:00', stop_time_type: 'scheduled' },
    ],
  },
  {
    name: 'MAKHAYA',
    sequence: 1,
    stop_times: [{ trip_id: 101, stop_time_type: 'not_served' }],
  },
  {
    name: 'VILLAGE 3',
    sequence: 1,
    stop_times: [{ trip_id: 202, arrival: '06:20:00', stop_time_type: 'scheduled' }],
  },
  {
    name: 'VILLAGE 3',
    sequence: 2,
    stop_times: [{ trip_id: 101, stop_time_type: 'not_served' }],
  },
  {
    name: 'HARARE',
    sequence: 2,
    stop_times: [{ trip_id: 202, arrival: '06:30:00', stop_time_type: 'scheduled' }],
  },
  {
    name: 'HARARE',
    sequence: 3,
    stop_times: [{ trip_id: 101, arrival: '04:50:00', stop_time_type: 'scheduled' }],
  },
];

test('visible rows include only rows used by the selected service-day trips', () => {
  expect(getVisibleRows(rows, [weekdayTrip]).map((row) => row.name)).toEqual([
    'MAKHAZA',
    'MAKHAYA',
    'VILLAGE 3',
    'HARARE',
  ]);
});

test('schedule table does not mix weekend row sequences into a weekday view', () => {
  const { container } = render(
    <ScheduleTable
      selectedDirection="KHAYELITSHA - WYNBERG"
      selectedServiceDay="monday"
      scheduleData={{
        'KHAYELITSHA - WYNBERG': {
          name: 'KHAYELITSHA - WYNBERG',
          trips: [weekdayTrip, saturdayTrip],
          rows,
        },
      }}
      route={{ agency: 'GABS', code: '0068', name: 'WYNBERG - KHAYELITSHA' }}
    />
  );

  expect(
    Array.from(container.querySelectorAll('.stop-cell'), (cell) => cell.textContent)
  ).toEqual(['MAKHAZA', 'MAKHAYA', 'VILLAGE 3', 'HARARE']);
  expect(container.querySelector('.route-summary')).toHaveTextContent('lists 4 stops');
  expect(container.querySelector('tbody')).toHaveTextContent('04:50');
});

test('schedule table waits for a service-day selection instead of flashing mixed rows', () => {
  const { container } = render(
    <ScheduleTable
      selectedDirection="KHAYELITSHA - WYNBERG"
      selectedServiceDay=""
      scheduleData={{
        'KHAYELITSHA - WYNBERG': {
          name: 'KHAYELITSHA - WYNBERG',
          trips: [weekdayTrip, saturdayTrip],
          rows,
        },
      }}
      route={{ agency: 'GABS', code: '0068', name: 'WYNBERG - KHAYELITSHA' }}
    />
  );

  expect(container.querySelectorAll('.stop-cell')).toHaveLength(0);
  expect(container.querySelectorAll('thead th')).toHaveLength(1);
});
