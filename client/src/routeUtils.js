export const AGENCY_DISPLAY_NAMES = {
  GABS: 'Golden Arrow',
  MyCiti: 'MyCiTi',
};

export const AGENCY_SLUGS = {
  GABS: 'golden-arrow',
  MyCiti: 'myciti',
};

export const AGENCY_FROM_SLUG = Object.entries(AGENCY_SLUGS).reduce((result, [agency, slug]) => {
  result[slug] = agency;
  return result;
}, {});

export const getAgencyDisplayName = (agency) => AGENCY_DISPLAY_NAMES[agency] || agency;

export const slugify = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'route';
};

export const getAgencySlug = (agency) => AGENCY_SLUGS[agency] || slugify(agency);

export const getTimetablePath = (route) => {
  if (!route) {
    return '/';
  }

  return `/timetables/${getAgencySlug(route.agency)}/route-${slugify(route.code)}-${slugify(route.name)}`;
};

export const getRouteLocatorFromPath = (pathname) => {
  const canonicalMatch = pathname.match(/^\/timetables\/([^/]+)\/route-([a-z0-9]+)(?:-|$)/i);

  if (canonicalMatch) {
    return {
      agency: AGENCY_FROM_SLUG[canonicalMatch[1].toLowerCase()] || null,
      code: canonicalMatch[2],
    };
  }

  const legacyMatch = pathname.match(/^\/timetables\/[^/]+\/(\d+)(?:-|$)/);
  return legacyMatch ? { id: Number(legacyMatch[1]) } : null;
};

export const getRouteIdFromPath = (pathname) => getRouteLocatorFromPath(pathname)?.id || null;

export const getOperatorAgencyFromPath = (pathname) => {
  const match = pathname.match(/^\/operators\/([^/]+)$/);
  return match ? AGENCY_FROM_SLUG[match[1]] : null;
};

export const getAreaSlugFromPath = (pathname) => {
  const match = pathname.match(/^\/areas\/([^/]+)$/);
  return match ? match[1] : null;
};

export const isAreasIndexPath = (pathname) => pathname === '/areas';

export const getAvailableRouteCount = (routes = []) => {
  const routeKeys = new Set();

  (routes || []).forEach((route) => {
    if (!route) return;
    const hasId = route.id !== null && route.id !== undefined && route.id !== '';
    routeKeys.add(hasId
      ? `id:${route.id}`
      : `route:${route.agency || ''}:${route.code || ''}:${route.name || ''}`
    );
  });

  return routeKeys.size;
};

export const getRouteCountLabel = (count) => {
  if (!count) {
    return 'Route timetables';
  }

  return `${count} route timetable${count === 1 ? '' : 's'}`;
};

export const getRouteLabel = (route) => {
  return route?.code ? `${route.code} - ${route.name}` : route?.name;
};

export const getRouteDirections = (route) => {
  return [route?.direction_1, route?.direction_2].filter(Boolean);
};

export const normalizeDirectionLabel = (direction) => {
  if (!direction) {
    return direction;
  }

  return String(direction).replace(/^to\s+/i, '').trim();
};

export const titleizeSlug = (slug) => String(slug || '')
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

export const cleanAreaName = (value) => {
  const cleanedName = String(value || '')
    .replace(/\((?:anti-?clockwise|clockwise)\)/ig, '')
    .replace(/\s+/g, ' ')
    .trim();

  return /^mamre\s*\((?:crown|frans)\)$/i.test(cleanedName) ? 'Mamre' : cleanedName;
};

export const formatRoutePlace = (value) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()
  .replace(/\b\w/g, (letter) => letter.toUpperCase())
  .replace(/\bCbd\b/g, 'CBD')
  .replace(/\bSap\b/g, 'SAP');

export const getRouteEndpoints = (route) => {
  const parts = String(route?.name || '').split(/\s+-\s+/).map(formatRoutePlace).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : parts;
};

export const getRouteIntentLabel = (route) => {
  const code = route?.code ? ` ${route.code}` : '';
  return `${getAgencyDisplayName(route?.agency)}${code} ${getRouteEndpoints(route).join(' to ')} bus times`
    .replace(/\s+/g, ' ')
    .trim();
};

export const getRouteTileLabel = (route) => {
  const code = route?.code ? `${route.code} ` : '';
  return `${code}${getRouteEndpoints(route).join(' to ')}`
    .replace(/\s+/g, ' ')
    .trim();
};

export const getRouteSeoTitle = (route) => {
  const code = route?.code ? ` ${route.code}` : '';
  return `${getAgencyDisplayName(route?.agency)}${code} ${getRouteEndpoints(route).join('–')} Bus Times`
    .replace(/\s+/g, ' ')
    .trim();
};

export const getRouteAreaNames = (route) => {
  const routeParts = String(route?.name || '').split(/\s+-\s+/);
  const directionParts = getRouteDirections(route)
    .flatMap((direction) => String(direction).split(/\s+-\s+| to /i));

  return [...new Set([...routeParts, ...directionParts]
    .map(cleanAreaName)
    .filter((value) => value.length >= 3))];
};
