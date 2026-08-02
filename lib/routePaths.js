const AGENCY_DISPLAY_NAMES = {
  GABS: 'Golden Arrow',
  MyCiti: 'MyCiTi',
};

const AGENCY_SLUGS = {
  GABS: 'golden-arrow',
  MyCiti: 'myciti',
};

const AGENCY_FROM_SLUG = Object.entries(AGENCY_SLUGS).reduce((result, [agency, slug]) => {
  result[slug] = agency;
  return result;
}, {});

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'route';
}

function getAgencyDisplayName(agency) {
  return AGENCY_DISPLAY_NAMES[agency] || agency;
}

function getAgencySlug(agency) {
  return AGENCY_SLUGS[agency] || slugify(agency);
}

function getAgencyFromSlug(agencySlug) {
  return AGENCY_FROM_SLUG[String(agencySlug || '').toLowerCase()] || null;
}

function getCanonicalTimetablePath(route) {
  return `/timetables/${getAgencySlug(route.agency)}/route-${slugify(route.code)}-${slugify(route.name)}`;
}

function getLegacyTimetablePath(route) {
  return `/timetables/${getAgencySlug(route.agency)}/${route.id}-${slugify(route.name)}`;
}

function parseTimetableRouteSlug(routeSlug) {
  const value = String(routeSlug || '').toLowerCase();
  const canonicalMatch = value.match(/^route-([a-z0-9]+)(?:-|$)/);

  if (canonicalMatch) {
    return {
      type: 'code',
      code: canonicalMatch[1],
    };
  }

  const legacyMatch = value.match(/^(\d+)(?:-(.*))?$/);

  if (legacyMatch) {
    return {
      type: 'legacy-id',
      id: Number(legacyMatch[1]),
      nameSlug: legacyMatch[2] || '',
    };
  }

  return null;
}

module.exports = {
  AGENCY_DISPLAY_NAMES,
  AGENCY_FROM_SLUG,
  AGENCY_SLUGS,
  getAgencyDisplayName,
  getAgencyFromSlug,
  getAgencySlug,
  getCanonicalTimetablePath,
  getLegacyTimetablePath,
  parseTimetableRouteSlug,
  slugify,
};
