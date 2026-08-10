import React from 'react';
import {
  getAgencyDisplayName,
  getRouteIntentLabel,
  getRouteLabel,
  getTimetablePath,
} from './routeUtils';
import { trackEvent } from './analytics';

export default function RouteLinkList({ routes, emptyMessage, selectionSource }) {
  if (!routes.length) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div className="seo-route-grid">
      {routes.map((schedule) => (
        <a
          key={schedule.id}
          href={getTimetablePath(schedule)}
          onClick={() => {
            if (selectionSource) {
              trackEvent('route_selected', {
                agency: schedule.agency,
                route_code: schedule.code || 'unknown',
                selection_source: selectionSource,
              });
            }
          }}
        >
          <span>{getRouteIntentLabel(schedule)}</span>
          <small>{getRouteLabel(schedule)} · {getAgencyDisplayName(schedule.agency)}</small>
        </a>
      ))}
    </div>
  );
}
