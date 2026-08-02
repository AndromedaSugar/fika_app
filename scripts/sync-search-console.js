#!/usr/bin/env node
const { Pool } = require('pg');
const {
  fetchAllSearchAnalyticsRows,
  getAccessToken,
  parseServiceAccountCredentials,
} = require('../lib/gscClient');
const { ensureGscSchema } = require('../lib/gscSchema');

const DEFAULT_SITE_URL = 'https://www.fika.net.za/';
const DETAIL_DIMENSIONS = ['date', 'query', 'page', 'country', 'device'];

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, dayCount) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayCount);
  return formatDate(date);
}

function getJohannesburgDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseArguments(argv) {
  const argumentsMap = {};
  argv.forEach((argument) => {
    const match = argument.match(/^--([^=]+)=(.*)$/);
    if (match) {
      argumentsMap[match[1]] = match[2];
    }
  });
  return argumentsMap;
}

function getRequestedRange(argumentsMap) {
  const endDate = argumentsMap.end || addDays(getJohannesburgDate(), -3);
  const startDate = argumentsMap.start || addDays(endDate, -20);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Use YYYY-MM-DD for --start and --end');
  }
  if (startDate > endDate) {
    throw new Error('--start cannot be after --end');
  }

  return { startDate, endDate };
}

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 2,
  });
}

function normalizeDailyRows(rows) {
  return rows.map((row) => ({
    metric_date: row.keys?.[0],
    search_type: 'web',
    clicks: Number(row.clicks) || 0,
    impressions: Number(row.impressions) || 0,
    position_sum: (Number(row.position) || 0) * (Number(row.impressions) || 0),
  })).filter((row) => row.metric_date);
}

function normalizeSearchRows(rows) {
  return rows.map((row) => ({
    metric_date: row.keys?.[0],
    query: row.keys?.[1] || '',
    page: row.keys?.[2] || '',
    country: (row.keys?.[3] || '').toLowerCase(),
    device: (row.keys?.[4] || '').toLowerCase(),
    search_type: 'web',
    clicks: Number(row.clicks) || 0,
    impressions: Number(row.impressions) || 0,
    position_sum: (Number(row.position) || 0) * (Number(row.impressions) || 0),
  })).filter((row) => row.metric_date && row.page);
}

async function replaceMetrics(client, { startDate, endDate, dailyRows, searchRows }) {
  await client.query('BEGIN');
  try {
    await client.query(
      'DELETE FROM gsc_daily_metrics WHERE metric_date BETWEEN $1 AND $2 AND search_type = $3',
      [startDate, endDate, 'web']
    );
    await client.query(
      'DELETE FROM gsc_search_rows WHERE metric_date BETWEEN $1 AND $2 AND search_type = $3',
      [startDate, endDate, 'web']
    );

    if (dailyRows.length) {
      await client.query(`
        INSERT INTO gsc_daily_metrics (
          metric_date, search_type, clicks, impressions, position_sum, fetched_at
        )
        SELECT
          (item->>'metric_date')::date,
          item->>'search_type',
          (item->>'clicks')::double precision,
          (item->>'impressions')::double precision,
          (item->>'position_sum')::double precision,
          now()
        FROM jsonb_array_elements($1::jsonb) AS item
        ON CONFLICT (metric_date, search_type) DO UPDATE SET
          clicks = EXCLUDED.clicks,
          impressions = EXCLUDED.impressions,
          position_sum = EXCLUDED.position_sum,
          fetched_at = now();
      `, [JSON.stringify(dailyRows)]);
    }

    if (searchRows.length) {
      await client.query(`
        INSERT INTO gsc_search_rows (
          metric_date, query, page, country, device, search_type,
          clicks, impressions, position_sum, fetched_at
        )
        SELECT
          (item->>'metric_date')::date,
          item->>'query',
          item->>'page',
          item->>'country',
          item->>'device',
          item->>'search_type',
          (item->>'clicks')::double precision,
          (item->>'impressions')::double precision,
          (item->>'position_sum')::double precision,
          now()
        FROM jsonb_array_elements($1::jsonb) AS item
        ON CONFLICT (metric_date, query, page, country, device, search_type) DO UPDATE SET
          clicks = EXCLUDED.clicks,
          impressions = EXCLUDED.impressions,
          position_sum = EXCLUDED.position_sum,
          fetched_at = now();
      `, [JSON.stringify(searchRows)]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function checkImpressionUrls(pool, { startDate, endDate, fetchImpl = fetch }) {
  const { rows } = await pool.query(`
    SELECT page, SUM(impressions) AS impressions
    FROM gsc_search_rows
    WHERE metric_date BETWEEN $1 AND $2
      AND search_type = 'web'
      AND page != ''
    GROUP BY page
    HAVING SUM(impressions) > 0
    ORDER BY SUM(impressions) DESC;
  `, [startDate, endDate]);

  const queue = [...rows];
  async function worker() {
    while (queue.length) {
      const row = queue.shift();
      let statusCode = null;
      let location = null;
      let errorMessage = null;
      try {
        const response = await fetchImpl(row.page, { method: 'HEAD', redirect: 'manual' });
        statusCode = response.status;
        location = response.headers.get('location');
      } catch (error) {
        errorMessage = String(error.message || error).slice(0, 1000);
      }

      await pool.query(`
        INSERT INTO gsc_url_checks (
          page, status_code, location, impressions, last_checked_at, error
        ) VALUES ($1, $2, $3, $4, now(), $5)
        ON CONFLICT (page) DO UPDATE SET
          status_code = EXCLUDED.status_code,
          location = EXCLUDED.location,
          impressions = EXCLUDED.impressions,
          last_checked_at = now(),
          error = EXCLUDED.error;
      `, [row.page, statusCode, location, Number(row.impressions) || 0, errorMessage]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, rows.length) }, worker));
  return rows.length;
}

async function runSync({ argv = process.argv.slice(2), fetchImpl = fetch } = {}) {
  const argumentsMap = parseArguments(argv);
  const { startDate, endDate } = getRequestedRange(argumentsMap);
  const siteUrl = process.env.GSC_SITE_URL || DEFAULT_SITE_URL;
  const pool = createPool();
  let syncRunId = null;

  try {
    await ensureGscSchema(pool);
    const syncRun = await pool.query(`
      INSERT INTO gsc_sync_runs (requested_start, requested_end)
      VALUES ($1, $2)
      RETURNING id;
    `, [startDate, endDate]);
    syncRunId = syncRun.rows[0].id;

    if (argumentsMap.event) {
      await pool.query(`
        INSERT INTO gsc_seo_events (event_date, description)
        VALUES ($1, $2);
      `, [argumentsMap['event-date'] || getJohannesburgDate(), argumentsMap.event]);
    }

    const credentials = parseServiceAccountCredentials();
    const accessToken = await getAccessToken({ credentials, fetchImpl });
    const commonOptions = { accessToken, siteUrl, startDate, endDate, fetchImpl };
    const [dailyApiRows, detailedApiRows] = await Promise.all([
      fetchAllSearchAnalyticsRows({ ...commonOptions, dimensions: ['date'], aggregationType: 'byProperty' }),
      fetchAllSearchAnalyticsRows({ ...commonOptions, dimensions: DETAIL_DIMENSIONS }),
    ]);
    const dailyRows = normalizeDailyRows(dailyApiRows);
    const searchRows = normalizeSearchRows(detailedApiRows);
    const client = await pool.connect();
    try {
      await replaceMetrics(client, { startDate, endDate, dailyRows, searchRows });
    } finally {
      client.release();
    }

    const checkedUrlCount = await checkImpressionUrls(pool, { startDate, endDate, fetchImpl });
    await pool.query(`
      UPDATE gsc_sync_runs
      SET finished_at = now(), status = 'success', daily_row_count = $2, search_row_count = $3
      WHERE id = $1;
    `, [syncRunId, dailyRows.length, searchRows.length]);

    console.log(JSON.stringify({
      status: 'success',
      siteUrl,
      startDate,
      endDate,
      dailyRows: dailyRows.length,
      searchRows: searchRows.length,
      checkedUrls: checkedUrlCount,
      note: 'Detailed query rows are top-row data and do not equal property totals.',
    }));
  } catch (error) {
    if (syncRunId) {
      await pool.query(`
        UPDATE gsc_sync_runs
        SET finished_at = now(), status = 'error', error = $2
        WHERE id = $1;
      `, [syncRunId, String(error.stack || error).slice(0, 10000)]).catch(() => {});
    }
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runSync().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  DETAIL_DIMENSIONS,
  addDays,
  checkImpressionUrls,
  getRequestedRange,
  normalizeDailyRows,
  normalizeSearchRows,
  parseArguments,
  replaceMetrics,
  runSync,
};
