const GSC_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS gsc_daily_metrics (
    metric_date date NOT NULL,
    search_type text NOT NULL DEFAULT 'web',
    clicks double precision NOT NULL DEFAULT 0,
    impressions double precision NOT NULL DEFAULT 0,
    position_sum double precision NOT NULL DEFAULT 0,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (metric_date, search_type)
  );

  CREATE TABLE IF NOT EXISTS gsc_search_rows (
    metric_date date NOT NULL,
    query text NOT NULL DEFAULT '',
    page text NOT NULL DEFAULT '',
    country text NOT NULL DEFAULT '',
    device text NOT NULL DEFAULT '',
    search_type text NOT NULL DEFAULT 'web',
    clicks double precision NOT NULL DEFAULT 0,
    impressions double precision NOT NULL DEFAULT 0,
    position_sum double precision NOT NULL DEFAULT 0,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (metric_date, query, page, country, device, search_type)
  );

  CREATE INDEX IF NOT EXISTS idx_gsc_search_rows_page_date
    ON gsc_search_rows (page, metric_date);
  CREATE INDEX IF NOT EXISTS idx_gsc_search_rows_scope_date
    ON gsc_search_rows (country, device, metric_date);

  CREATE TABLE IF NOT EXISTS gsc_sync_runs (
    id bigserial PRIMARY KEY,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    requested_start date NOT NULL,
    requested_end date NOT NULL,
    daily_row_count integer NOT NULL DEFAULT 0,
    search_row_count integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'running',
    error text
  );

  CREATE TABLE IF NOT EXISTS gsc_seo_events (
    id bigserial PRIMARY KEY,
    event_date date NOT NULL,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS gsc_url_checks (
    page text PRIMARY KEY,
    status_code integer,
    location text,
    impressions double precision NOT NULL DEFAULT 0,
    last_checked_at timestamptz NOT NULL DEFAULT now(),
    error text
  );
`;

async function ensureGscSchema(database) {
  await database.query(GSC_SCHEMA_SQL);
}

module.exports = {
  GSC_SCHEMA_SQL,
  ensureGscSchema,
};
