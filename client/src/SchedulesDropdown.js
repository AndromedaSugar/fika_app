import React, { useEffect, useRef, useState } from 'react';
import { trackEvent } from './analytics';

const getRouteLabel = (route) => {
  return route.code ? `${route.code} - ${route.name}` : route.name;
};

const SchedulesDropdown = ({
  className = '',
  placeholder = 'Search route...',
  onRouteSelect,
  onAgencyChange,
  route,
  schedules,
  selectedAgency,
  searchLocation = 'timetable_search',
}) => {
  const [query, setQuery] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const lastTrackedSearch = useRef('');

  const agencies = [...new Set(schedules.map((schedule) => schedule.agency))].filter(Boolean);

  const handleAgencyChange = (event) => {
    const agency = event.target.value;

    onAgencyChange?.(agency);

    setQuery('');
  };

  const handleRouteSelect = (selectedOption) => {
    const routeObj = schedules.find((schedule) => schedule.id === selectedOption.id);

    onRouteSelect?.(routeObj, { source: searchLocation });
  };

  const filtered = schedules.filter((schedule) =>
    (!selectedAgency || schedule.agency === selectedAgency) &&
    getRouteLabel(schedule).toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length < 2) {
      lastTrackedSearch.current = '';
      return undefined;
    }

    const searchKey = `${selectedAgency}|${normalizedQuery}|${filtered.length}`;
    const timer = window.setTimeout(() => {
      if (lastTrackedSearch.current === searchKey) {
        return;
      }

      lastTrackedSearch.current = searchKey;
      const queryLengthBucket = normalizedQuery.length <= 3
        ? '2-3'
        : normalizedQuery.length <= 7 ? '4-7' : '8+';
      const parameters = {
        agency: selectedAgency || 'all',
        search_location: searchLocation,
        result_count: filtered.length,
        query_length_bucket: queryLengthBucket,
      };

      trackEvent('route_search', parameters);
      if (filtered.length === 0) {
        trackEvent('no_search_results', parameters);
      }
    }, 750);

    return () => window.clearTimeout(timer);
  }, [filtered.length, query, searchLocation, selectedAgency]);

  return (
    <div className={`schedule-picker ${className}`.trim()}>
      {agencies.length > 0 && (
        <select
          className="agency-select"
          value={selectedAgency}
          onChange={handleAgencyChange}
        >
          {agencies.map((agency) => (
            <option key={agency} value={agency}>
              {agency}
            </option>
          ))}
        </select>
      )}
      <div className="dropdown">
        <input
          type="text"
          value={query}
          placeholder={route ? getRouteLabel(route) : placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setShowOptions(true)}
          onBlur={() => setTimeout(() => setShowOptions(false), 100)}
        />
        {showOptions && (
          <ul className="dropdown-menu">
            {filtered.map((schedule) => (
              <li
                key={schedule.id}
                onMouseDown={() => {
                  handleRouteSelect(schedule);
                  setQuery('');
                  setShowOptions(false);
                }}
              >
                <span>{getRouteLabel(schedule)}</span>
                <small>{schedule.agency}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SchedulesDropdown;
