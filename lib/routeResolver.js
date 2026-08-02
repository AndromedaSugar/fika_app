const {
  getAgencyFromSlug,
  getCanonicalTimetablePath,
  parseTimetableRouteSlug,
  slugify,
} = require('./routePaths');

async function resolveTimetableRoute({ agencySlug, routeSlug, requestPath }, repository) {
  const agency = getAgencyFromSlug(agencySlug);
  const locator = parseTimetableRouteSlug(routeSlug);

  if (!agency || !locator) {
    return { status: 'not-found' };
  }

  let route = null;
  let legacyAlias = null;

  if (locator.type === 'code') {
    route = await repository.getByAgencyAndCode(agency, locator.code);
  } else {
    legacyAlias = await repository.getAlias(requestPath);

    if (legacyAlias?.agency === agency) {
      route = await repository.getByAgencyAndCode(agency, legacyAlias.route_code);

      if (!route && legacyAlias.route_name) {
        route = await repository.findUniqueByNameSlug(agency, slugify(legacyAlias.route_name));
      }
    }

    if (!route) {
      const idRoute = await repository.getById(locator.id);
      route = idRoute?.agency === agency ? idRoute : null;
    }

    if (!route && locator.nameSlug) {
      route = await repository.findUniqueByNameSlug(agency, locator.nameSlug);
    }
  }

  if (!route) {
    return { status: 'not-found' };
  }

  const canonicalPath = getCanonicalTimetablePath(route);

  if (locator.type === 'legacy-id' && !legacyAlias) {
    await repository.saveAlias({
      legacyPath: requestPath,
      agency: route.agency,
      routeCode: route.code,
      routeName: route.name,
    });
  }

  return {
    status: requestPath === canonicalPath ? 'canonical' : 'redirect',
    route,
    canonicalPath,
  };
}

module.exports = {
  resolveTimetableRoute,
};
