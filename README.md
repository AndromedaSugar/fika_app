# FikaApp 🚌

**FikaApp** is a simple, user-friendly transit timetable viewer built with **JavaScript**. It aims to make accessing and understanding public transport schedules—like those of MyCiTi Bus and Golden Arrow—much 
easier than downloading static PDFs from transit websites.

## 🚀 Features

- 🔍 **Searchable Timetables**: Quickly search for a specific route’s schedule.
- 🔁 **Route Direction Toggle**: Flip between outbound and return directions for any route using a convenient radio button.
- 🧭 **Cleaner UI**: No more sifting through PDF documents—FikaApp presents the data in a clean and readable format.
- 📱 **Saved Offline Timetables**: Pin timetable data in the browser and reopen it from one offline-ready hub.
- 🚌 **Current Support**: Currently displays **MyCiTi Bus** timetables.
- 🛠️ **Coming Soon**: Integration of **Golden Arrow** and **train** schedules.

## 🛠 Tech Stack

- React/JavaScript
- HTML & CSS

## 📦 Future Plans

- Add support for Golden Arrow and train timetables.
- Mobile-first UX enhancements.

## Preview 
[Watch the demo](https://youtu.be/RCbFUW39EwI)

## Search-friendly timetable URLs

Public timetable pages use the route's stable agency and operator code:

```text
/timetables/golden-arrow/route-0004-atlantis-cape-town
/timetables/myciti/route-214a-parklands-table-view
```

Numeric database IDs remain internal to `/schedule_times/:id` and `/api/v2/schedule_times/:id`. Historic numeric page URLs are stored in `route_url_aliases` and redirect with HTTP 301. Timetable replacement imports preserve these aliases before deleting routes.

## Saved timetables and offline access

Timetables pinned with **Save offline** appear at `/saved-timetables`. Saved route metadata and timetable payloads remain in that browser's IndexedDB; they are not attached to an account or synced between devices. The production service worker caches only the application shell and static assets so the saved hub and cached timetable URLs can cold-start without a network connection. API timetable payloads are not stored in Cache Storage.

Offline access requires at least one successful online visit on the browser. Removing a timetable from the saved hub unpins it but leaves the normal short-lived recent-view cache behavior intact.

## Privacy-gated GA4 analytics

Set `GA4_MEASUREMENT_ID` on the production web service to a valid GA4 web-stream ID such as `G-ABC123`. The server injects the ID at runtime; if it is absent or invalid, the Google tag and analytics consent controls remain disabled. Local CRA development can optionally use `REACT_APP_GA4_MEASUREMENT_ID`.

GA4 loads only after a visitor selects **Accept analytics**. Advertising storage, Google Signals, and ad personalization remain disabled. Fika sends route codes and controlled interaction categories, but never raw search text, stop names, timetable contents, contact details, query strings, or raw errors.

Configure the GA4 property as follows:

- Disable Enhanced Measurement's browser-history page changes because Fika sends explicit SPA page views.
- Disable Enhanced Measurement's automatic site search so `q` parameters are never collected as search terms.
- Register event dimensions for `agency`, `route_code`, `search_location`, `selection_source`, `query_length_bucket`, `data_source`, `online_state`, `saved_state`, `direction`, `service_day`, and `failure_type`.
- Register numeric event metrics for `result_count` and `saved_count`.
- Mark `timetable_viewed` as a key event, use 14-month event-data retention, and leave Google Signals and ad personalization disabled.
- Verify the consent transition, single page views, and custom events in Tag Assistant or DebugView before using the production stream for reporting.

To seed all known numeric URLs from the pre-replacement backup into a target database, run from the parent project directory:

```bash
.venv/bin/python seed_route_url_aliases.py \
  --backup backups/fika_20260802_before_gabs_v2_replace.dump \
  --database-url "$DATABASE_URL"
```

## Weekly Search Console import

The weekly job stores property totals separately from top query/page rows so reports do not mistake Search Console's omitted or anonymized queries for the property total. It re-pulls an overlapping 21-day finalized-data window, paginates at 25,000 rows, and checks impression-bearing URLs using non-following HEAD requests.

Required secrets:

- `DATABASE_URL`: the Render Postgres internal connection URL for the cron job.
- `GSC_SERVICE_ACCOUNT_JSON`: the full service-account JSON (plain JSON or base64 encoded). Add its `client_email` to the exact `https://www.fika.net.za/` Search Console property with read access.
- `GSC_SITE_URL`: defaults to `https://www.fika.net.za/`.

The included `render.yaml` defines `fika-gsc-weekly` for Mondays at `04:00 UTC` (`06:00` in Johannesburg). Render prompts for both secrets when the Blueprint is first created. The same cron can also be created manually with build command `npm ci`, command `npm run sync:gsc`, and schedule `0 4 * * 1`.

Run the initial backfill after credentials are configured:

```bash
npm run backfill:gsc
```

To tie the first SEO deployment to the report while running a sync:

```bash
npm run sync:gsc -- --event="Stable route-code URLs and Search Console SEO rollout" --event-date=2026-08-02
```

The importer creates these tables idempotently: `gsc_daily_metrics`, `gsc_search_rows`, `gsc_sync_runs`, `gsc_seo_events`, and `gsc_url_checks`.

## Private search performance report

Set these secrets on the Render web service:

- `SEO_REPORT_USERNAME`
- `SEO_REPORT_PASSWORD`

Then open `/admin/search-performance`. The report uses HTTP Basic authentication and always returns `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.

After the route URL deployment, submit `/sitemap.xml` in Search Console and inspect the Atlantis and Mamre hubs plus routes 234, 246, and Golden Arrow 0004. Avoid further title changes for 28 days unless correcting a defect.
