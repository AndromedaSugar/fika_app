const ROUTE_URL_ALIAS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS route_url_aliases (
    legacy_path text PRIMARY KEY,
    agency text NOT NULL,
    route_code text NOT NULL,
    route_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
`;

const ROUTE_CODE_UNIQUE_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_agency_code_unique
  ON routes (agency, lower(code))
  WHERE code IS NOT NULL AND btrim(code) != '';
`;

const KNOWN_ROUTE_ALIASES = [
  {
    legacyPath: '/timetables/golden-arrow/39-strandfontein-atlantis',
    agency: 'GABS',
    routeCode: '0175',
    routeName: 'STRANDFONTEIN - ATLANTIS',
  },
];

async function ensureRouteUrlAliasSchema(database) {
  await database.query(ROUTE_URL_ALIAS_TABLE_SQL);
  await database.query(ROUTE_CODE_UNIQUE_INDEX_SQL);

  for (const alias of KNOWN_ROUTE_ALIASES) {
    await database.query(`
      INSERT INTO route_url_aliases (legacy_path, agency, route_code, route_name)
      VALUES (lower($1), $2, $3, $4)
      ON CONFLICT (legacy_path) DO NOTHING;
    `, [alias.legacyPath, alias.agency, alias.routeCode, alias.routeName]);
  }
}

async function saveRouteUrlAlias(database, { legacyPath, agency, routeCode, routeName }) {
  await database.query(`
    INSERT INTO route_url_aliases (legacy_path, agency, route_code, route_name)
    VALUES (lower($1), $2, $3, $4)
    ON CONFLICT (legacy_path) DO UPDATE SET
      agency = EXCLUDED.agency,
      route_code = EXCLUDED.route_code,
      route_name = EXCLUDED.route_name;
  `, [legacyPath, agency, routeCode, routeName]);
}

async function getRouteUrlAlias(database, legacyPath) {
  const { rows } = await database.query(`
    SELECT legacy_path, agency, route_code, route_name
    FROM route_url_aliases
    WHERE legacy_path = lower($1)
    LIMIT 1;
  `, [legacyPath]);

  return rows[0] || null;
}

module.exports = {
  ROUTE_CODE_UNIQUE_INDEX_SQL,
  ROUTE_URL_ALIAS_TABLE_SQL,
  KNOWN_ROUTE_ALIASES,
  ensureRouteUrlAliasSchema,
  getRouteUrlAlias,
  saveRouteUrlAlias,
};
