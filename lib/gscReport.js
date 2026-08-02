const PRIORITY_AREAS = [
  'atlantis',
  'mamre',
  'claremont',
  'khayelitsha',
  'cape town',
  'delft',
  'bellville',
  'heideveld',
];

function dateOffset(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toDateOnly(value) {
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }
  return String(value || '').slice(0, 10);
}

function aggregateMetrics(rows) {
  const totals = rows.reduce((result, row) => ({
    clicks: result.clicks + Number(row.clicks || 0),
    impressions: result.impressions + Number(row.impressions || 0),
    positionSum: result.positionSum + Number(row.position_sum || 0),
  }), { clicks: 0, impressions: 0, positionSum: 0 });

  return {
    ...totals,
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
    position: totals.impressions ? totals.positionSum / totals.impressions : 0,
  };
}

function classifySearchIntent(query, page = '') {
  const value = `${query} ${page}`.toLowerCase();
  if (/\b(?:golden arrow|gabs|myciti|my citi)\b/.test(value)) {
    return 'operator';
  }
  if (/\b\d{2,4}[a-z]?\b/.test(query) && /\b(?:bus|route|time|timetable)\b/i.test(query)) {
    return 'route-number';
  }
  if (/\b(?:to|from)\b|\s[-–]\s/.test(query)) {
    return 'corridor';
  }
  if (PRIORITY_AREAS.some((area) => value.includes(area))) {
    return 'area';
  }
  return 'generic-cape-town';
}

function enrichSearchRow(row) {
  const clicks = Number(row.clicks) || 0;
  const impressions = Number(row.impressions) || 0;
  const positionSum = Number(row.position_sum) || 0;

  return {
    ...row,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? positionSum / impressions : 0,
    estimatedUpside: Math.max(0, Math.ceil(impressions * 0.01 - clicks)),
    intent: classifySearchIntent(row.query, row.page),
  };
}

function isUrlAlert(row) {
  const status = Number(row.status_code) || 0;
  if (row.error || !status || status >= 400) {
    return true;
  }
  if (status >= 300 && status < 400) {
    try {
      const locationPath = new URL(row.location, row.page).pathname;
      return !/^\/timetables\/[^/]+\/route-[a-z0-9]+-/i.test(locationPath);
    } catch {
      return true;
    }
  }
  return false;
}

async function getSearchPerformanceReport(database, { country = 'zaf', device = 'mobile' } = {}) {
  const latestResult = await database.query(`
    SELECT MAX(metric_date)::text AS latest_date
    FROM gsc_daily_metrics
    WHERE search_type = 'web';
  `);
  const latestDate = latestResult.rows[0]?.latest_date;
  if (!latestDate) {
    return null;
  }

  const periods = {
    currentStart: dateOffset(latestDate, -27),
    currentEnd: latestDate,
    previousStart: dateOffset(latestDate, -55),
    previousEnd: dateOffset(latestDate, -28),
  };
  const dailyResult = await database.query(`
    SELECT metric_date, clicks, impressions, position_sum
    FROM gsc_daily_metrics
    WHERE metric_date BETWEEN $1 AND $2
      AND search_type = 'web';
  `, [periods.previousStart, periods.currentEnd]);
  const currentMetrics = aggregateMetrics(dailyResult.rows.filter((row) => toDateOnly(row.metric_date) >= periods.currentStart));
  const previousMetrics = aggregateMetrics(dailyResult.rows.filter((row) => toDateOnly(row.metric_date) <= periods.previousEnd));

  const searchResult = await database.query(`
    SELECT
      query,
      page,
      SUM(clicks) AS clicks,
      SUM(impressions) AS impressions,
      SUM(position_sum) AS position_sum
    FROM gsc_search_rows
    WHERE metric_date BETWEEN $1 AND $2
      AND search_type = 'web'
      AND ($3 = '' OR country = $3)
      AND ($4 = '' OR device = $4)
    GROUP BY query, page
    HAVING SUM(impressions) >= 20
    ORDER BY SUM(impressions) DESC
    LIMIT 500;
  `, [periods.currentStart, periods.currentEnd, country.toLowerCase(), device.toLowerCase()]);
  const enrichedRows = searchResult.rows.map(enrichSearchRow);

  const breakdownResult = await database.query(`
    SELECT 'device' AS dimension, device AS value,
           SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(position_sum) AS position_sum
    FROM gsc_search_rows
    WHERE metric_date BETWEEN $1 AND $2 AND search_type = 'web'
    GROUP BY device
    UNION ALL
    SELECT 'country' AS dimension, country AS value,
           SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(position_sum) AS position_sum
    FROM gsc_search_rows
    WHERE metric_date BETWEEN $1 AND $2 AND search_type = 'web'
    GROUP BY country
    ORDER BY dimension, impressions DESC;
  `, [periods.currentStart, periods.currentEnd]);
  const breakdowns = breakdownResult.rows.map((row) => ({
    ...enrichSearchRow({ ...row, query: '', page: '' }),
    dimension: row.dimension,
    value: row.value,
  }));

  const checksResult = await database.query(`
    SELECT page, status_code, location, impressions, last_checked_at, error
    FROM gsc_url_checks
    WHERE impressions > 0
    ORDER BY impressions DESC, page
    LIMIT 250;
  `);
  const eventsResult = await database.query(`
    SELECT event_date, description
    FROM gsc_seo_events
    ORDER BY event_date DESC, id DESC
    LIMIT 20;
  `);

  return {
    periods,
    scope: { country, device },
    currentMetrics,
    previousMetrics,
    pageOneOpportunities: enrichedRows.filter((row) => row.position <= 10 && row.ctr < 0.01),
    strikingDistance: enrichedRows.filter((row) => row.position > 10 && row.position <= 20),
    intentRows: enrichedRows,
    breakdowns,
    urlAlerts: checksResult.rows.filter(isUrlAlert),
    events: eventsResult.rows,
    detailedDataNotice: 'Query/page tables contain top-row Search Console data; property totals include omitted and anonymized queries.',
  };
}

module.exports = {
  aggregateMetrics,
  classifySearchIntent,
  dateOffset,
  enrichSearchRow,
  getSearchPerformanceReport,
  isUrlAlert,
  toDateOnly,
};
