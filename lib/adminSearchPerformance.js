const crypto = require('crypto');
const { ensureGscSchema } = require('./gscSchema');
const { getSearchPerformanceReport, toDateOnly } = require('./gscReport');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function secureEqual(first, second) {
  const firstHash = crypto.createHash('sha256').update(String(first || '')).digest();
  const secondHash = crypto.createHash('sha256').update(String(second || '')).digest();
  return crypto.timingSafeEqual(firstHash, secondHash);
}

function parseBasicAuthorization(header) {
  const match = String(header || '').match(/^Basic\s+(.+)$/i);
  if (!match) {
    return null;
  }

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) {
      return null;
    }
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function isAuthorized(header, expectedUsername, expectedPassword) {
  if (!expectedUsername || !expectedPassword) {
    return false;
  }
  const credentials = parseBasicAuthorization(header);
  return Boolean(credentials) &&
    secureEqual(credentials.username, expectedUsername) &&
    secureEqual(credentials.password, expectedPassword);
}

function number(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits }).format(Number(value) || 0);
}

function percent(value) {
  return `${number((Number(value) || 0) * 100, 2)}%`;
}

function getPageLabel(value) {
  try {
    return new URL(value).pathname;
  } catch {
    return String(value || '');
  }
}

function comparison(label, current, previous, formatter = number, lowerIsBetter = false) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  const change = previousValue ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100 : null;
  const direction = change === null || change === 0 ? '' : (change > 0) !== lowerIsBetter ? 'up' : 'down';
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatter(currentValue))}</strong>
      <span>previous ${escapeHtml(formatter(previousValue))}</span>
      <small class="${direction}">${change === null ? 'No comparison' : `${change >= 0 ? '+' : ''}${number(change, 1)}%`}</small>
    </div>
  `;
}

function renderOpportunityTable(rows) {
  if (!rows.length) {
    return '<p class="empty">No rows meet this threshold in the selected scope.</p>';
  }
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Query</th><th>Page</th><th>Intent</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th><th>1% upside</th></tr></thead>
      <tbody>${rows.slice(0, 100).map((row) => `
        <tr>
          <td>${escapeHtml(row.query || '(omitted)')}</td>
          <td><a href="${escapeHtml(row.page)}">${escapeHtml(getPageLabel(row.page))}</a></td>
          <td>${escapeHtml(row.intent)}</td>
          <td>${number(row.clicks)}</td>
          <td>${number(row.impressions)}</td>
          <td>${percent(row.ctr)}</td>
          <td>${number(row.position, 2)}</td>
          <td>+${number(row.estimatedUpside)} estimated clicks</td>
        </tr>
      `).join('')}</tbody>
    </table></div>
  `;
}

function renderBreakdowns(rows) {
  if (!rows.length) {
    return '<p class="empty">No detailed rows are available yet.</p>';
  }
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Dimension</th><th>Value</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td>${escapeHtml(row.dimension)}</td><td>${escapeHtml(row.value || '(not set)')}</td><td>${number(row.clicks)}</td><td>${number(row.impressions)}</td><td>${percent(row.ctr)}</td><td>${number(row.position, 2)}</td></tr>
      `).join('')}</tbody>
    </table></div>
  `;
}

function renderIntentGroups(rows) {
  const groups = ['operator', 'route-number', 'area', 'corridor', 'generic-cape-town'];
  return groups.map((intent) => {
    const intentRows = rows.filter((row) => row.intent === intent);
    return `
      <div class="intent-group">
        <h3>${escapeHtml(intent.replace(/-/g, ' '))}</h3>
        ${renderOpportunityTable(intentRows)}
      </div>
    `;
  }).join('');
}

function renderUrlAlerts(rows) {
  if (!rows.length) {
    return '<p class="good">No impression-bearing 404s or unexpected redirects were found in the latest URL check.</p>';
  }
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Page</th><th>Status</th><th>Redirect</th><th>Impressions</th><th>Error</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td><a href="${escapeHtml(row.page)}">${escapeHtml(row.page)}</a></td><td>${escapeHtml(row.status_code || 'failed')}</td><td>${escapeHtml(row.location || '')}</td><td>${number(row.impressions)}</td><td>${escapeHtml(row.error || '')}</td></tr>
      `).join('')}</tbody>
    </table></div>
  `;
}

function renderReport(report) {
  const { currentMetrics, previousMetrics, periods, scope } = report;
  return `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><title>Fika Search Performance</title>
  <style>
    :root{color-scheme:light;font-family:Inter,system-ui,sans-serif;background:#f4f2ed;color:#17211b}body{margin:0;padding:24px}main{max-width:1400px;margin:auto}h1{margin-bottom:4px}h2{margin-top:0}.muted,.empty{color:#647067}.notice{padding:12px 16px;background:#fff3c7;border-radius:10px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px}.metric,section{background:white;border-radius:14px;padding:18px;box-shadow:0 2px 10px #17211b0d}.metric strong{font-size:28px;display:block}.metric span,.metric small{display:block;color:#647067;margin-top:4px}.metric small.up{color:#167347}.metric small.down{color:#ad3131}section{margin-top:18px}.filters{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.filters label{display:grid;gap:4px}.filters input{padding:8px;border:1px solid #ccd3ce;border-radius:7px}.filters button{padding:9px 14px;border:0;border-radius:7px;background:#12643d;color:white}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;border-bottom:1px solid #e5e7e5;padding:9px;vertical-align:top}th{white-space:nowrap}td a{color:#12643d}.good{color:#167347}@media(max-width:760px){body{padding:12px}.metrics{grid-template-columns:1fr 1fr}.metric strong{font-size:22px}}
  </style></head><body><main>
    <h1>Fika Search Performance</h1>
    <p class="muted">${escapeHtml(periods.currentStart)} to ${escapeHtml(periods.currentEnd)} versus ${escapeHtml(periods.previousStart)} to ${escapeHtml(periods.previousEnd)}</p>
    <p class="notice">${escapeHtml(report.detailedDataNotice)}</p>
    <form class="filters" method="get"><label>Country code<input name="country" value="${escapeHtml(scope.country)}"></label><label>Device<input name="device" value="${escapeHtml(scope.device)}"></label><button>Apply detail scope</button></form>
    <div class="metrics">
      ${comparison('Clicks', currentMetrics.clicks, previousMetrics.clicks)}
      ${comparison('Impressions', currentMetrics.impressions, previousMetrics.impressions)}
      ${comparison('CTR', currentMetrics.ctr, previousMetrics.ctr, percent)}
      ${comparison('Weighted position', currentMetrics.position, previousMetrics.position, (value) => number(value, 2), true)}
    </div>
    <section><h2>Page-one CTR opportunities</h2><p class="muted">Position ≤10, at least 20 impressions, CTR below 1%. Upside is an estimate to 1% CTR.</p>${renderOpportunityTable(report.pageOneOpportunities)}</section>
    <section><h2>Striking-distance query/page pairs</h2><p class="muted">Position above 10 through 20, at least 20 impressions.</p>${renderOpportunityTable(report.strikingDistance)}</section>
    <section><h2>Query/page intent groups</h2><p class="muted">Top-row data in the selected country and device scope, grouped by operator, route number, area, corridor, and generic Cape Town intent.</p>${renderIntentGroups(report.intentRows)}</section>
    <section><h2>Device and country breakdowns</h2>${renderBreakdowns(report.breakdowns)}</section>
    <section><h2>Impression-bearing URL alerts</h2>${renderUrlAlerts(report.urlAlerts)}</section>
    <section><h2>SEO events</h2>${report.events.length ? `<ul>${report.events.map((event) => `<li><strong>${escapeHtml(toDateOnly(event.event_date))}</strong> ${escapeHtml(event.description)}</li>`).join('')}</ul>` : '<p class="empty">No SEO deployment events recorded.</p>'}</section>
  </main></body></html>`;
}

function createSearchPerformanceHandler({ database, username, password }) {
  return async function searchPerformanceHandler(req, res) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');

    if (!username || !password) {
      res.status(503).type('text/plain').send('Search performance authentication is not configured.');
      return;
    }
    if (!isAuthorized(req.get('authorization'), username, password)) {
      res.set('WWW-Authenticate', 'Basic realm="Fika Search Performance", charset="UTF-8"');
      res.status(401).type('text/plain').send('Authentication required.');
      return;
    }

    try {
      await ensureGscSchema(database);
      const report = await getSearchPerformanceReport(database, {
        country: String(req.query.country ?? 'zaf').trim().toLowerCase(),
        device: String(req.query.device ?? 'mobile').trim().toLowerCase(),
      });
      if (!report) {
        res.status(200).send('<!doctype html><meta name="robots" content="noindex,nofollow"><h1>Fika Search Performance</h1><p>No Search Console data has been imported yet.</p>');
        return;
      }
      res.send(renderReport(report));
    } catch (error) {
      console.error('Error rendering Search Console report', error);
      res.status(500).type('text/plain').send('Unable to load Search Console report.');
    }
  };
}

module.exports = {
  createSearchPerformanceHandler,
  isAuthorized,
  parseBasicAuthorization,
  renderReport,
  secureEqual,
};
