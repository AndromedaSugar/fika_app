const test = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  buildSitemapXml,
  cleanAreaName,
  finalizeAreas,
  formatEffectiveDate,
  getAreaNamesForRoute,
  getAreaSeo,
  getRouteSeoTitle,
  getTimetableDescription,
  getTimetableSeo,
} = require('../server');

const route = {
  id: 300,
  agency: 'GABS',
  code: '0004',
  name: 'ATLANTIS - CAPE TOWN',
  direction_1: 'Atlantis - Cape Town',
  direction_2: 'Cape Town - Atlantis',
  effective_date: '2026-07-01',
};

test('route metadata leads with operator, code and endpoints', () => {
  const stops = [{ name: 'Atlantis' }, { name: 'Cape Town' }];
  const window = { first_time: '05:00:00', last_time: '22:30:00' };
  const seo = getTimetableSeo(route, window, stops);

  assert.equal(seo.title, 'Golden Arrow 0004 Atlantis–Cape Town Bus Times');
  assert.match(seo.description, /route 0004 from Atlantis to Cape Town/);
  assert.match(seo.description, /05:00 to 22:30/);
  assert.match(seo.description, /Effective 2026-07-01/);
  assert.match(seo.canonicalUrl, /\/timetables\/golden-arrow\/route-0004-atlantis-cape-town$/);
});

test('Mamre Crown and Frans routes aggregate into one Mamre hub', () => {
  assert.equal(cleanAreaName('Mamre (Crown)'), 'Mamre');
  assert.equal(cleanAreaName('MAMRE (FRANS)'), 'Mamre');
  assert.ok(getAreaNamesForRoute({ name: 'MAMRE (CROWN) - ATLANTIS' }).includes('Mamre'));
});

test('thin areas are noindex while demand-backed areas remain indexable', () => {
  const createAreaMap = (name) => new Map([[
    name.toLowerCase(),
    { slug: name.toLowerCase(), name, routeMap: new Map([[1, route]]) },
  ]]);
  const thinArea = finalizeAreas(createAreaMap('Unknown Terminal'))[0];
  const mamre = finalizeAreas(createAreaMap('Mamre'))[0];

  assert.equal(thinArea.indexable, false);
  assert.equal(getAreaSeo(thinArea).robots, 'noindex,follow');
  assert.equal(mamre.indexable, true);
  assert.equal(getAreaSeo(mamre).robots, 'index,follow');
});

test('effective dates serialize as sitemap-compatible dates', () => {
  assert.equal(formatEffectiveDate(new Date('2026-07-01T00:00:00Z')), '2026-07-01');
  assert.equal(formatEffectiveDate(new Date(2026, 6, 20)), '2026-07-20');
  assert.equal(formatEffectiveDate(null), '');
});

test('sitemap contains only route-code canonicals and reliable lastmod values', () => {
  const sitemap = buildSitemapXml([route], [{
    slug: 'atlantis', name: 'Atlantis', routes: [route], indexable: true,
  }, {
    slug: 'thin-stop', name: 'Thin Stop', routes: [route], indexable: false,
  }]);

  assert.match(sitemap, /\/timetables\/golden-arrow\/route-0004-atlantis-cape-town/);
  assert.doesNotMatch(sitemap, /\/timetables\/golden-arrow\/300-/);
  assert.match(sitemap, /<lastmod>2026-07-01<\/lastmod>/);
  assert.doesNotMatch(sitemap, /changefreq|priority|\/areas\/thin-stop/);
});

test('opening timetable copy includes useful route information before disclaimers', () => {
  const description = getTimetableDescription(route, null, []);
  assert.ok(description.startsWith('Golden Arrow route 0004 from Atlantis to Cape Town.'));
});

test('numeric timetable APIs remain registered for backward compatibility', () => {
  const paths = app._router.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);
  assert.ok(paths.includes('/schedule_times/:id'));
  assert.ok(paths.includes('/api/v2/schedule_times/:id'));
});
