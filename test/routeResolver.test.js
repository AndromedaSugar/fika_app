const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTimetableRoute } = require('../lib/routeResolver');
const { getCanonicalTimetablePath } = require('../lib/routePaths');

const route0175 = {
  id: 289,
  agency: 'GABS',
  code: '0175',
  name: 'STRANDFONTEIN - ATLANTIS',
};

function repository({ alias = null, idRoute = route0175, uniqueNameRoute = null } = {}) {
  const savedAliases = [];
  return {
    savedAliases,
    async getByAgencyAndCode(agency, code) {
      return agency === route0175.agency && String(code).toLowerCase() === route0175.code ? route0175 : null;
    },
    async getById(id) {
      return Number(id) === Number(idRoute?.id) ? idRoute : null;
    },
    async getAlias() {
      return alias;
    },
    async findUniqueByNameSlug() {
      return uniqueNameRoute;
    },
    async saveAlias(value) {
      savedAliases.push(value);
    },
  };
}

test('historic Golden Arrow route 39 redirects to route code 0175', async () => {
  const result = await resolveTimetableRoute({
    agencySlug: 'golden-arrow',
    routeSlug: '39-strandfontein-atlantis',
    requestPath: '/timetables/golden-arrow/39-strandfontein-atlantis',
  }, repository({
    alias: { agency: 'GABS', route_code: '0175', route_name: route0175.name },
    idRoute: null,
  }));

  assert.equal(result.status, 'redirect');
  assert.equal(result.canonicalPath, '/timetables/golden-arrow/route-0175-strandfontein-atlantis');
});

test('a current numeric route URL redirects and is saved as an alias', async () => {
  const routeRepository = repository();
  const result = await resolveTimetableRoute({
    agencySlug: 'golden-arrow',
    routeSlug: '289-strandfontein-atlantis',
    requestPath: '/timetables/golden-arrow/289-strandfontein-atlantis',
  }, routeRepository);

  assert.equal(result.status, 'redirect');
  assert.equal(routeRepository.savedAliases.length, 1);
  assert.equal(routeRepository.savedAliases[0].routeCode, '0175');
});

test('canonical route-code URL resolves case-insensitively and self-references', async () => {
  const canonicalPath = getCanonicalTimetablePath(route0175);
  const result = await resolveTimetableRoute({
    agencySlug: 'golden-arrow',
    routeSlug: canonicalPath.split('/').pop(),
    requestPath: canonicalPath,
  }, repository());

  assert.equal(result.status, 'canonical');
  assert.equal(result.route.id, 289);
});

test('ambiguous name fallback never chooses an arbitrary route', async () => {
  const result = await resolveTimetableRoute({
    agencySlug: 'golden-arrow',
    routeSlug: '39-duplicate-name',
    requestPath: '/timetables/golden-arrow/39-duplicate-name',
  }, repository({ idRoute: null, uniqueNameRoute: null }));

  assert.equal(result.status, 'not-found');
});

test('alphanumeric codes remain part of the canonical path', () => {
  assert.equal(getCanonicalTimetablePath({
    agency: 'MyCiti', code: '214A', name: 'PARKLANDS - TABLE VIEW',
  }), '/timetables/myciti/route-214a-parklands-table-view');
});
