import React from 'react';
import { getAgencyDisplayName, getRouteSeoTitle } from './routeUtils';

const SERVICE_DAYS = [
  { key: 'monday', short: 'Mon' },
  { key: 'tuesday', short: 'Tue' },
  { key: 'wednesday', short: 'Wed' },
  { key: 'thursday', short: 'Thu' },
  { key: 'friday', short: 'Fri' },
  { key: 'saturday', short: 'Sat' },
  { key: 'sunday', short: 'Sun' },
];

const formatStopTime = (stopTime) => {
  if (!stopTime || stopTime.stop_time_type === 'not_served') {
    return '--';
  }

  if (stopTime.stop_time_type === 'via' && !stopTime.arrival) {
    return 'via';
  }

  return stopTime.arrival ? stopTime.arrival.substring(0, 5) : '--';
};

const getServiceBadge = (trip) => {
  const activeDays = SERVICE_DAYS
    .map((day, index) => ({ ...day, index }))
    .filter((day) => trip[day.key]);

  const ranges = [];
  let rangeStart = null;
  let previousDay = null;

  activeDays.forEach((day) => {
    if (!rangeStart) {
      rangeStart = day;
      previousDay = day;
      return;
    }

    if (day.index === previousDay.index + 1) {
      previousDay = day;
      return;
    }

    ranges.push(rangeStart.index === previousDay.index ? rangeStart.short : `${rangeStart.short}-${previousDay.short}`);
    rangeStart = day;
    previousDay = day;
  });

  if (rangeStart) {
    ranges.push(rangeStart.index === previousDay.index ? rangeStart.short : `${rangeStart.short}-${previousDay.short}`);
  }

  if (trip.public_holiday) {
    ranges.push('Public Holiday');
  }

  return ranges.join(', ') || 'No Service Days';
};

const getVisibleTrips = (trips, selectedServiceDay) => {
  if (!selectedServiceDay) {
    return [];
  }

  return (trips || []).filter((trip) => trip[selectedServiceDay]).sort((firstTrip, secondTrip) => {
    const firstArrival = firstTrip.first_arrival || '';
    const secondArrival = secondTrip.first_arrival || '';

    return (
      secondTrip.service_pattern.localeCompare(firstTrip.service_pattern) ||
      firstArrival.localeCompare(secondArrival) ||
      firstTrip.trip_id - secondTrip.trip_id
    );
  });
};

export const getVisibleRows = (rows, visibleTrips) => {
  const visibleTripIds = new Set(
    (visibleTrips || []).map((trip) => Number(trip.trip_id))
  );

  if (visibleTripIds.size === 0) {
    return [];
  }

  return (rows || []).filter((row) =>
    (row.stop_times || []).some((stopTime) =>
      visibleTripIds.has(Number(stopTime.trip_id))
    )
  );
};

const getTimesByTripId = (row) => {
  return (row.stop_times || []).reduce((result, stopTime) => {
    result[stopTime.trip_id] = stopTime;
    return result;
  }, {});
};

const ScheduleTable = ({
  selectedDirection,
  selectedServiceDay,
  scheduleData,
  route,
  savedOffline,
  onSaveOfflineChange,
  offlineSaveMessage,
}) => {
  if (!scheduleData) {
    return (
      <div className='schedule-table'>
        <div className='route-title'>
          <h1>{route ? getRouteSeoTitle(route) : 'Timetable'}</h1>
        </div>
        <p>Loading schedule data...</p>
      </div>
    );
  }

  const defaultDirection = Object.keys(scheduleData)[0];
  const directionData = selectedDirection !== '' ? scheduleData[selectedDirection] : scheduleData[defaultDirection];
  const visibleTrips = directionData ? getVisibleTrips(directionData.trips, selectedServiceDay) : [];
  const visibleRows = directionData ? getVisibleRows(directionData.rows, visibleTrips) : [];
  const columnCount = visibleTrips.length;
  const agencyName = getAgencyDisplayName(route?.agency);
  const stopCount = visibleRows.length;
  const serviceDayText = selectedServiceDay
    ? selectedServiceDay.replace(/_/g, ' ')
    : 'the selected service day';

  return (
    <div className='schedule-table'>
      <div className='route-title'>
        <h1>{route ? getRouteSeoTitle(route) : 'Table'}</h1>
        {route && onSaveOfflineChange && (
          <label className="save-offline-toggle">
            <input
              type="checkbox"
              checked={Boolean(savedOffline)}
              onChange={(event) => onSaveOfflineChange(event.target.checked)}
            />
            <span>Save offline</span>
          </label>
        )}
      </div>
      {offlineSaveMessage && <p className="offline-save-error" role="alert">{offlineSaveMessage}</p>}
      {route && directionData && (
        <p className="route-summary">
          This {agencyName} timetable lists {stopCount} stops for {directionData.name || selectedDirection || 'this direction'}
          {' '}and {visibleTrips.length} trips for {serviceDayText}. Fika is independent, so confirm urgent service changes with the operator.
        </p>
      )}
      {directionData !== undefined ? (
        <div className="table-container">
          <table
            className="timetable"
            style={{
              '--column-count': columnCount,
            }}
          >
            <thead>
              <tr>
                <th className="stop-heading">Stops</th>
                {visibleTrips.map((trip) => (
                  <th key={trip.trip_id}>
                    {getServiceBadge(trip)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => {
                const timesByTripId = getTimesByTripId(row);

                return (
                  <tr key={`${row.name}-${rowIndex}`} data-id={rowIndex}>
                    <td className="stop-cell">{row.name}</td>
                    {visibleTrips.map((trip) => (
                      <td
                        key={trip.trip_id}
                        className={timesByTripId[trip.trip_id]?.stop_time_type || ''}
                      >
                        {formatStopTime(timesByTripId[trip.trip_id])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Loading schedule data...</p>
      )}
    </div>
  );
};

export default ScheduleTable;
