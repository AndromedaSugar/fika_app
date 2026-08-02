import React from 'react';
import {
  getAgencyDisplayName,
  getRouteIntentLabel,
  getRouteLabel,
  getTimetablePath,
} from './routeUtils';

export default function RouteLinkList({ routes, emptyMessage }) {
  if (!routes.length) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div className="seo-route-grid">
      {routes.map((schedule) => (
        <a key={schedule.id} href={getTimetablePath(schedule)}>
          <span>{getRouteIntentLabel(schedule)}</span>
          <small>{getRouteLabel(schedule)} · {getAgencyDisplayName(schedule.agency)}</small>
        </a>
      ))}
    </div>
  );
}
