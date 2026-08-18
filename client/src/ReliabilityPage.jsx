import React, { useEffect, useMemo, useState } from 'react';
import SiteFooter from './SiteFooter';

const STATUS_LABELS = {
  verified: 'Verified',
  changed_review_required: 'Changed — review required',
  withdrawn: 'Withdrawn',
};

const DAY_LABELS = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
  public_holiday: 'Public holiday',
};

function formatDate(value, includeTime = false) {
  if (!value) return 'Not yet recorded';

  const dateOnly = !includeTime && typeof value === 'string'
    ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    : null;
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short', timeZone: 'Africa/Johannesburg' } : {}),
  }).format(date);
}

function HashValue({ value }) {
  if (!value) return <span>Not yet recorded</span>;

  return (
    <details className="reliability-hash">
      <summary><code>{value.slice(0, 12)}…</code></summary>
      <code>{value}</code>
    </details>
  );
}

function SourceRow({ source }) {
  return (
    <tr>
      <td>{source.operator === 'GABS' ? 'Golden Arrow' : 'MyCiTi'}</td>
      <td><strong>{source.source_key}</strong><br />{source.route || 'Route not parsed'}</td>
      <td>{source.directions.length ? source.directions.join(' · ') : 'Not parsed'}</td>
      <td>{source.service_days.length
        ? source.service_days.map((day) => DAY_LABELS[day] || day).join(', ')
        : 'Not parsed'}</td>
      <td><a href={source.official_source_url} rel="noreferrer">Operator PDF</a></td>
      <td>{source.source_effective_date || 'Not stated by source'}</td>
      <td>{formatDate(source.last_downloaded_at, true)}</td>
      <td>{formatDate(source.last_manually_verified_on)}</td>
      <td>
        <small>Latest observed</small><HashValue value={source.pdf_sha256} />
        {source.approved_pdf_sha256 && source.approved_pdf_sha256 !== source.pdf_sha256 ? (
          <><small>{source.status === 'withdrawn' ? 'Last approved before withdrawal' : 'Currently published'}</small><HashValue value={source.approved_pdf_sha256} /></>
        ) : null}
      </td>
      <td>{source.parser_version}<br /><small>import {source.import_version}</small></td>
      <td><span className={`reliability-status ${source.status}`}>{STATUS_LABELS[source.status] || source.status}</span></td>
    </tr>
  );
}

export default function ReliabilityPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let ignore = false;

    fetch('/api/reliability', { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('Reliability evidence is temporarily unavailable.');
        return response.json();
      })
      .then((data) => {
        if (!ignore) setReport(data);
      })
      .catch((fetchError) => {
        if (!ignore) setError(fetchError.message);
      });

    return () => { ignore = true; };
  }, []);

  const visibleSources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (report?.sources || []).filter((source) => {
      if (status !== 'all' && source.status !== status) return false;
      if (!normalizedQuery) return true;
      return [source.operator, source.source_key, source.route, ...source.directions]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, report, status]);

  return (
    <main className="reliability-page">
      <section className="reliability-intro">
        <p className="info-eyebrow">Evidence, not promises</p>
        <h1>Timetable source reliability</h1>
        <p><strong>Source accuracy</strong> means Fika correctly displays the timetable published in the cited operator PDF. This is what the checks and audits below are designed to prove.</p>
        <p><strong>Operational punctuality</strong> means a bus actually arrives at that time. Fika does not currently measure live operations and cannot claim to prove punctuality.</p>
      </section>

      {error ? <p className="reliability-error">{error}</p> : null}
      {!report && !error ? <p className="reliability-loading">Loading the source registry…</p> : null}

      {report ? (
        <>
          <section className="reliability-summary" aria-label="Registry summary">
            <div><strong>{report.status_counts.verified}</strong><span>verified sources</span></div>
            <div><strong>{report.status_counts.changed_review_required}</strong><span>awaiting review</span></div>
            <div><strong>{report.status_counts.withdrawn}</strong><span>withdrawn sources</span></div>
            <div><strong>{report.latest_check ? formatDate(report.latest_check.finished_at, true) : 'None'}</strong><span>last completed daily check</span></div>
          </section>

          {!report.daily_check_current ? (
            <p className="reliability-error"><strong>Daily verification is not fully current.</strong> The last fully successful run is missing or more than 36 hours old. Treat sources marked review required as unverified and check each source’s download time below.</p>
          ) : null}

          <section className="reliability-evidence">
            <h2>Latest weekly audit</h2>
            {report.latest_audit ? (
              <>
                <p className="reliability-audit-statement">{report.latest_audit.statement}</p>
                <p>Audit week {report.latest_audit.audit_week}; completed {formatDate(report.latest_audit.completed_at, true)}.</p>
              </>
            ) : (
              <p>No completed weekly audit has been recorded yet. Fika does not present an accuracy rate until the human comparison is complete.</p>
            )}
            {report.latest_audit && !report.weekly_audit_current ? (
              <p className="reliability-error"><strong>The weekly audit is not current.</strong> It is overdue or predates a published timetable change, so the result remains historical evidence.</p>
            ) : null}
          </section>

          <section className="reliability-registry">
            <div className="reliability-registry-heading">
              <div>
                <h2>Official source registry</h2>
                <p>{visibleSources.length} of {report.sources.length} timetable sources shown.</p>
              </div>
              <div className="reliability-filters">
                <label>Find a route<input value={query} onChange={(event) => setQuery(event.target.value)} type="search" /></label>
                <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="all">All</option>
                  <option value="verified">Verified</option>
                  <option value="changed_review_required">Review required</option>
                  <option value="withdrawn">Withdrawn</option>
                </select></label>
              </div>
            </div>
            <div className="reliability-table-wrap">
              <table>
                <thead><tr><th>Operator</th><th>Route</th><th>Direction</th><th>Coverage</th><th>Official source</th><th>Effective date</th><th>Downloaded</th><th>Manually verified</th><th>PDF SHA-256</th><th>Parser/import</th><th>Status</th></tr></thead>
                <tbody>{visibleSources.map((source) => <SourceRow source={source} key={source.id} />)}</tbody>
              </table>
            </div>
          </section>

          <section className="reliability-evidence">
            <h2>Dated change log</h2>
            {report.change_log.length ? (
              <ol className="reliability-log">{report.change_log.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.occurred_at}>{formatDate(event.occurred_at, true)}</time>
                  {' — '}{event.event_type.replaceAll('_', ' ')}
                  {event.source_key ? `: ${event.operator} ${event.source_key} ${event.route || ''}` : ''}
                </li>
              ))}</ol>
            ) : <p>No source changes have been recorded yet.</p>}
          </section>
        </>
      ) : null}
      <SiteFooter />
    </main>
  );
}
