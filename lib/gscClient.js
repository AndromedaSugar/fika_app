const crypto = require('crypto');

const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEARCH_ANALYTICS_ROW_LIMIT = 25000;

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function parseServiceAccountCredentials(value = process.env.GSC_SERVICE_ACCOUNT_JSON) {
  if (!value) {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON is required');
  }

  let decoded = value.trim();
  if (!decoded.startsWith('{')) {
    decoded = Buffer.from(decoded, 'base64').toString('utf8');
  }

  const credentials = JSON.parse(decoded);
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Search Console credentials must contain client_email and private_key');
  }

  return {
    ...credentials,
    private_key: credentials.private_key.replace(/\\n/g, '\n'),
  };
}

async function getAccessToken({ credentials, fetchImpl = fetch, now = Date.now() }) {
  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: SEARCH_CONSOLE_SCOPE,
    aud: credentials.token_uri || GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsignedToken), credentials.private_key);
  const assertion = `${unsignedToken}.${base64Url(signature)}`;
  const response = await fetchImpl(credentials.token_uri || GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth failed (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error('Google OAuth response did not include an access token');
  }

  return payload.access_token;
}

async function fetchSearchAnalyticsPage({
  accessToken,
  siteUrl,
  startDate,
  endDate,
  dimensions,
  aggregationType = 'auto',
  startRow = 0,
  rowLimit = SEARCH_ANALYTICS_ROW_LIMIT,
  fetchImpl = fetch,
}) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions,
      type: 'web',
      dataState: 'final',
      aggregationType,
      rowLimit,
      startRow,
    }),
  });

  if (!response.ok) {
    throw new Error(`Search Analytics API failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function fetchAllSearchAnalyticsRows(options) {
  const rows = [];
  let startRow = 0;

  while (true) {
    const payload = await fetchSearchAnalyticsPage({ ...options, startRow });
    const pageRows = payload.rows || [];
    rows.push(...pageRows);

    if (pageRows.length < SEARCH_ANALYTICS_ROW_LIMIT) {
      break;
    }

    startRow += pageRows.length;
  }

  return rows;
}

module.exports = {
  GOOGLE_TOKEN_URL,
  SEARCH_ANALYTICS_ROW_LIMIT,
  SEARCH_CONSOLE_SCOPE,
  fetchAllSearchAnalyticsRows,
  fetchSearchAnalyticsPage,
  getAccessToken,
  parseServiceAccountCredentials,
};
