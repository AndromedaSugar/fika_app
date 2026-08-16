import React from 'react';
import {
  getAgencyDisplayName,
  getRouteIntentLabel,
  getRouteLabel,
  getRouteTileLabel,
  getTimetablePath,
} from './routeUtils';
import { trackEvent } from './analytics';

export default function RouteLinkList({ routes, emptyMessage, selectionSource, compact = false }) {
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
          <span>{compact ? getRouteTileLabel(schedule) : getRouteIntentLabel(schedule)}</span>
          {!compact && (
            <small>{getRouteLabel(schedule)} · {getAgencyDisplayName(schedule.agency)}</small>
          )}
        </a>
      ))}
    </div>
  );
}
