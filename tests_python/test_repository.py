import re
import unittest
from unittest import mock

from tests_python.test_canonical_and_diff import extraction
from timetable_verification.adapters.base import DiscoveredSource
from timetable_verification.audit import AuditCandidate
from timetable_verification.canonical import content_sha256, sha256_bytes
from timetable_verification.repository import (
    IncompleteCatalogueError,
    TimetableRepository,
)


def _sql(query):
    return re.sub(r"\s+", " ", query).strip().casefold()


def _json_value(value):
    return value.adapted if hasattr(value, "adapted") else value


class StageCursor:
    def __init__(self, connection):
        self.connection = connection
        self.row = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, args=()):
        statement = _sql(query)
        self.connection.statements.append(statement)
        self.row = None
        if statement.startswith("select * from timetable_sources where id"):
            self.row = dict(self.connection.source)
        elif statement.startswith("select id, previous_version_id"):
            source_id, pdf_hash, parser_version, import_version = args
            self.row = next(
                (
                    dict(version)
                    for version in self.connection.versions
                    if version["source_id"] == source_id
                    and version["pdf_sha256"] == pdf_hash
                    and version["parser_version"] == parser_version
                    and version["import_version"] == import_version
                ),
                None,
            )
        elif statement.startswith("select id, extraction from timetable_source_versions where id"):
            version_id = int(args[0])
            version = next(item for item in self.connection.versions if item["id"] == version_id)
            self.row = {"id": version_id, "extraction": version["extraction"]}
        elif statement.startswith("select id, pdf_sha256, content_sha256, parser_version"):
            if "where id =" in statement:
                version_id = int(args[0])
                version = next(
                    item for item in self.connection.versions if item["id"] == version_id
                )
            else:
                candidates = [
                    item for item in self.connection.versions
                    if item["source_id"] == args[0]
                ]
                version = candidates[-1] if candidates else None
            self.row = dict(version) if version else None
        elif statement.startswith("select id, extraction from timetable_source_versions where source_id"):
            candidates = [
                item for item in self.connection.versions if item["source_id"] == args[0]
            ]
            if candidates:
                version = candidates[-1]
                self.row = {"id": version["id"], "extraction": version["extraction"]}
        elif statement.startswith("select details->>'status_before_missing'"):
            self.row = {
                "prior_status": self.connection.missing_prior_status,
                "audit_mismatch_since_missing": self.connection.audit_mismatch_since_missing,
            }
        elif "missing.details->>'status_before_missing'" in statement:
            self.row = {
                "prior_status": self.connection.missing_prior_status,
                "audit_mismatch_since_missing": self.connection.audit_mismatch_since_missing,
            }
        elif statement.startswith("select id, extraction from timetable_source_versions"):
            source_id, pdf_hash, parser_version, import_version = args
            version = next(
                (
                    item
                    for item in self.connection.versions
                    if item["source_id"] == source_id
                    and item["pdf_sha256"] == pdf_hash
                    and item["parser_version"] == parser_version
                    and item["import_version"] == import_version
                ),
                None,
            )
            if version:
                self.row = {"id": version["id"], "extraction": version["extraction"]}
        elif statement.startswith("insert into timetable_source_versions"):
            version_id = len(self.connection.versions) + 1
            if len(args) == 17:
                version = {
                    "id": version_id,
                    "source_id": args[0],
                    "previous_version_id": args[1],
                    "pdf_sha256": args[2],
                    "content_sha256": args[3],
                    "source_url": args[4],
                    "parser_version": args[8],
                    "import_version": args[9],
                    "extraction": _json_value(args[13]),
                    "comparison": _json_value(args[14]),
                    "pdf_bytes": bytes(args[15].adapted),
                    "pdf_size_bytes": args[16],
                    "review_status": (
                        "superseded" if "'superseded'" in statement else "pending"
                    ),
                }
            else:
                version = {
                    "id": version_id,
                    "source_id": args[0],
                    "previous_version_id": args[1],
                    "pdf_sha256": args[2],
                    "content_sha256": args[3],
                    "source_url": args[4],
                    "parser_version": args[7],
                    "import_version": args[8],
                    "extraction": _json_value(args[10]),
                    "comparison": _json_value(args[11]),
                    "pdf_bytes": bytes(args[12].adapted),
                    "pdf_size_bytes": args[13],
                    "review_status": "pending",
                }
            self.connection.versions.append(version)
            self.row = {"id": version_id}
        elif statement.startswith("update timetable_source_versions set last_downloaded_at"):
            pass
        elif statement.startswith("update timetable_source_versions set review_status = 'superseded'"):
            version = next(item for item in self.connection.versions if item["id"] == args[0])
            version["review_status"] = "superseded"
        elif statement.startswith("update timetable_source_versions set last_downloaded_at = now(), review_status"):
            version = next(item for item in self.connection.versions if item["id"] == args[-1])
            version.update(
                previous_version_id=args[2],
                comparison=_json_value(args[3]),
                review_status="pending",
            )
        elif statement.startswith("update timetable_source_versions set previous_version_id"):
            version = next(item for item in self.connection.versions if item["id"] == args[-1])
            version.update(
                previous_version_id=args[0],
                comparison=_json_value(args[3]),
                review_status="pending",
            )
        elif (
            statement.startswith("update timetable_sources set route_name")
            and "status = 'changed_review_required'" in statement
        ):
            self.connection.source.update(
                route_name=args[0],
                direction_names=args[1],
                service_day_coverage=args[2],
                official_source_url=args[3],
                source_effective_date=args[4],
                current_pdf_sha256=args[5],
                current_content_sha256=args[6],
                parser_version=args[7],
                import_version=args[8],
                status="changed_review_required",
                pending_version_id=args[9],
                consecutive_missing_checks=0,
            )
        elif statement.startswith("update timetable_sources set route_name"):
            self.connection.source.update(
                route_name=args[0],
                direction_names=args[1],
                service_day_coverage=args[2],
                official_source_url=args[3],
                source_effective_date=args[4],
                current_pdf_sha256=args[5],
                current_content_sha256=args[6],
                parser_version=args[7],
                import_version=args[8],
                consecutive_missing_checks=0,
            )
        elif statement.startswith("update timetable_sources set official_source_url"):
            if len(args) == 2:
                self.connection.source["official_source_url"] = args[0]
            else:
                self.connection.source.update(
                    official_source_url=args[0],
                    current_pdf_sha256=args[1],
                    current_content_sha256=args[2],
                    parser_version=args[3],
                    import_version=args[4],
                    status="changed_review_required",
                    pending_version_id=args[5],
                    consecutive_missing_checks=0,
                )
        elif statement.startswith("update timetable_sources set last_downloaded_at"):
            self.connection.source.update(
                official_source_url=args[0],
                consecutive_missing_checks=0,
            )
            if args[1]:
                self.connection.source["status"] = "verified"
        elif statement.startswith("insert into timetable_source_events"):
            self.connection.events.append(args)
        else:
            raise AssertionError(f"unexpected SQL in stage fake: {statement}")

    def fetchone(self):
        return self.row


class StageConnection:
    def __init__(self):
        self.source = {
            "id": 1,
            "status": "changed_review_required",
            "pending_version_id": None,
            "approved_version_id": None,
            "current_pdf_sha256": None,
            "current_content_sha256": None,
            "parser_version": "initial",
            "import_version": "initial",
            "consecutive_missing_checks": 0,
        }
        self.versions = []
        self.events = []
        self.statements = []
        self.missing_prior_status = None
        self.audit_mismatch_since_missing = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self, **_kwargs):
        return StageCursor(self)


class GuardCursor:
    def __init__(self, connection):
        self.connection = connection
        self.row = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, args=()):
        statement = _sql(query)
        self.connection.statements.append(statement)
        if statement.startswith("select count(*)"):
            self.row = {"known_count": 100}
        elif "catalogue_coverage_guard_triggered" in statement:
            self.connection.events.append(args)
            self.row = None
        else:
            raise AssertionError(f"coverage guard must not mark missing: {statement}")

    def fetchone(self):
        return self.row


class GuardConnection:
    def __init__(self):
        self.statements = []
        self.events = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self, **_kwargs):
        return GuardCursor(self)


class CaptureCursor:
    def __init__(self, connection):
        self.connection = connection
        self.row = None
        self.rows = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, args=()):
        statement = _sql(query)
        self.connection.statements.append((statement, args))
        self.row = None
        self.rows = []
        if statement.startswith("insert into timetable_audit_runs"):
            self.row = {"id": 55}

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows


class CaptureConnection:
    def __init__(self):
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self, **_kwargs):
        return CaptureCursor(self)


class TimetableRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.source = DiscoveredSource(
            "MyCiti",
            "T01X",
            "https://operator.test/T01X-timetable.pdf",
        )

    def _stage(self, repository, body, timetable=None):
        timetable = timetable or extraction()
        return repository.stage_download(
            run_id=3,
            source=self.source,
            source_id=1,
            pdf_bytes=body,
            pdf_sha256=sha256_bytes(body),
            content_sha256=content_sha256(timetable),
            extraction=timetable,
            http_etag=None,
            http_last_modified=None,
        )

    def test_same_filename_and_bytes_are_unchanged_but_new_hash_is_pending(self):
        connection = StageConnection()
        repository = TimetableRepository(connection)
        first = self._stage(repository, b"%PDF-first")
        unchanged = self._stage(repository, b"%PDF-first")
        changed = self._stage(repository, b"%PDF-replaced")

        self.assertEqual(first.outcome, "new")
        self.assertEqual(unchanged.outcome, "unchanged")
        self.assertEqual(changed.outcome, "changed")
        self.assertEqual(len(connection.versions), 2)
        self.assertEqual(connection.versions[1]["pdf_bytes"], b"%PDF-replaced")
        self.assertEqual(connection.source["pending_version_id"], 2)
        self.assertEqual(connection.source["status"], "changed_review_required")
        self.assertFalse(
            any(
                "insert into routes" in statement or "update routes" in statement
                for statement in connection.statements
            )
        )

    def test_new_pdf_bytes_with_identical_approved_content_need_no_review(self):
        connection = StageConnection()
        repository = TimetableRepository(connection)
        first = self._stage(repository, b"%PDF-approved")
        connection.versions[0]["review_status"] = "approved"
        connection.source.update(
            approved_version_id=first.version_id,
            pending_version_id=None,
            status="verified",
        )

        regenerated = self._stage(repository, b"%PDF-regenerated-same-timetable")

        self.assertEqual(regenerated.outcome, "unchanged")
        self.assertFalse(regenerated.comparison["has_changes"])
        self.assertTrue(
            regenerated.comparison["pdf_bytes_changed_content_unchanged"]
        )
        self.assertEqual(len(connection.versions), 2)
        self.assertEqual(connection.versions[1]["review_status"], "superseded")
        self.assertEqual(connection.source["approved_version_id"], first.version_id)
        self.assertIsNone(connection.source["pending_version_id"])
        self.assertEqual(connection.source["status"], "verified")
        self.assertEqual(
            connection.source["current_pdf_sha256"],
            sha256_bytes(b"%PDF-regenerated-same-timetable"),
        )
        self.assertTrue(
            any(
                "source_pdf_changed_content_unchanged" in statement
                for statement in connection.statements
            )
        )

        event_count = len(connection.events)
        repeated = self._stage(repository, b"%PDF-regenerated-same-timetable")
        self.assertEqual(repeated.outcome, "unchanged")
        self.assertEqual(repeated.version_id, regenerated.version_id)
        self.assertEqual(len(connection.versions), 2)
        self.assertEqual(len(connection.events), event_count)

    def test_zero_time_changes_with_structural_change_still_needs_review(self):
        connection = StageConnection()
        repository = TimetableRepository(connection)
        approved = extraction()
        first = self._stage(repository, b"%PDF-approved", approved)
        connection.versions[0]["review_status"] = "approved"
        connection.source.update(
            approved_version_id=first.version_id,
            pending_version_id=None,
            status="verified",
        )

        renamed = extraction(route_name="Renamed route")
        changed = self._stage(repository, b"%PDF-renamed", renamed)

        self.assertEqual(changed.outcome, "changed")
        self.assertEqual(changed.comparison["changed_time_count"], 0)
        self.assertEqual(changed.comparison["added_time_count"], 0)
        self.assertEqual(changed.comparison["removed_time_count"], 0)
        self.assertTrue(changed.comparison["has_changes"])
        self.assertEqual(connection.source["pending_version_id"], changed.version_id)
        self.assertEqual(connection.source["status"], "changed_review_required")

    def test_parse_failure_keeps_raw_pdf_in_quarantined_pending_version(self):
        connection = StageConnection()
        repository = TimetableRepository(connection)
        body = b"%PDF-new-layout"
        staged = repository.stage_parse_failure(
            run_id=3,
            source=self.source,
            source_id=1,
            pdf_bytes=body,
            pdf_sha256=sha256_bytes(body),
            error="no timetable headers",
            http_etag=None,
            http_last_modified=None,
        )
        version = connection.versions[0]
        self.assertEqual(staged.outcome, "new")
        self.assertEqual(version["pdf_bytes"], body)
        self.assertEqual(version["extraction"]["parse_error"], "no timetable headers")
        self.assertEqual(connection.source["pending_version_id"], version["id"])
        self.assertEqual(connection.source["parser_version"], repository.parser_version)

    def test_parser_upgrade_with_identical_pdf_and_content_needs_no_reapproval(self):
        connection = StageConnection()
        old_repository = TimetableRepository(connection, parser_version="parser/old")
        body = b"%PDF-parser-compatible"
        first = self._stage(old_repository, body)
        connection.versions[0]["review_status"] = "approved"
        connection.source.update(
            approved_version_id=first.version_id,
            pending_version_id=None,
            status="verified",
        )

        new_repository = TimetableRepository(connection, parser_version="parser/new")
        reparsed = self._stage(new_repository, body)

        self.assertEqual(reparsed.outcome, "unchanged")
        self.assertTrue(reparsed.comparison["parser_only_equivalent"])
        self.assertEqual(len(connection.versions), 1)
        self.assertEqual(connection.source["approved_version_id"], first.version_id)
        self.assertIsNone(connection.source["pending_version_id"])
        self.assertEqual(connection.source["status"], "verified")
        self.assertTrue(
            any("source_reparsed_unchanged" in statement for statement in connection.statements)
        )

    def test_parser_upgrade_reappearance_restores_verified_missing_source(self):
        connection = StageConnection()
        old_repository = TimetableRepository(connection, parser_version="parser/old")
        body = b"%PDF-parser-compatible-reappearance"
        first = self._stage(old_repository, body)
        connection.versions[0]["review_status"] = "approved"
        connection.source.update(
            approved_version_id=first.version_id,
            pending_version_id=None,
            status="changed_review_required",
            consecutive_missing_checks=2,
        )
        connection.missing_prior_status = "verified"
        connection.audit_mismatch_since_missing = False

        new_repository = TimetableRepository(connection, parser_version="parser/new")
        reparsed = self._stage(new_repository, body)

        self.assertEqual(reparsed.outcome, "unchanged")
        self.assertEqual(connection.source["status"], "verified")
        self.assertEqual(connection.source["consecutive_missing_checks"], 0)
        self.assertTrue(
            any("source_reappeared_unchanged" in statement for statement in connection.statements)
        )

    def test_repeated_parse_failure_keeps_one_pending_version_without_self_cycle(self):
        connection = StageConnection()
        repository = TimetableRepository(connection)
        body = b"%PDF-still-broken"
        arguments = {
            "run_id": 3,
            "source": self.source,
            "source_id": 1,
            "pdf_bytes": body,
            "pdf_sha256": sha256_bytes(body),
            "error": "no timetable headers",
            "http_etag": None,
            "http_last_modified": None,
        }
        first = repository.stage_parse_failure(**arguments)
        second = repository.stage_parse_failure(**arguments)
        self.assertEqual(first.version_id, second.version_id)
        self.assertEqual(len(connection.versions), 1)
        self.assertIsNone(connection.versions[0]["previous_version_id"])
        self.assertEqual(connection.source["pending_version_id"], first.version_id)

    def test_unchanged_reappearance_restores_only_missing_origin_verified(self):
        for prior_status, audit_mismatch, expected_status in (
            ("verified", False, "verified"),
            ("changed_review_required", False, "changed_review_required"),
            ("verified", True, "changed_review_required"),
        ):
            with self.subTest(
                prior_status=prior_status,
                audit_mismatch=audit_mismatch,
            ):
                connection = StageConnection()
                repository = TimetableRepository(connection)
                body = b"%PDF-approved"
                first = self._stage(repository, body)
                connection.versions[0]["review_status"] = "approved"
                connection.source.update(
                    approved_version_id=first.version_id,
                    pending_version_id=None,
                    status="changed_review_required",
                    consecutive_missing_checks=2,
                )
                connection.missing_prior_status = prior_status
                connection.audit_mismatch_since_missing = audit_mismatch

                result = self._stage(repository, body)
                self.assertEqual(result.outcome, "unchanged")
                self.assertEqual(connection.source["status"], expected_status)
                self.assertEqual(connection.source["consecutive_missing_checks"], 0)
                self.assertTrue(
                    any(
                        "source_reappeared_unchanged" in statement
                        for statement in connection.statements
                    )
                )

    def test_withdrawn_exact_hash_is_re_staged_for_manual_review(self):
        connection = StageConnection()
        repository = TimetableRepository(connection)
        body = b"%PDF-restored"
        first = self._stage(repository, body)
        connection.source.update(
            status="withdrawn",
            approved_version_id=None,
            pending_version_id=None,
        )
        connection.versions[0]["review_status"] = "approved"

        restored = self._stage(repository, body)
        self.assertEqual(restored.outcome, "changed")
        self.assertTrue(restored.comparison["source_reappeared_after_withdrawal"])
        self.assertEqual(connection.source["status"], "changed_review_required")
        self.assertEqual(connection.source["pending_version_id"], first.version_id)
        self.assertIsNone(connection.versions[0]["previous_version_id"])

    def test_severe_catalogue_drop_records_event_and_marks_nothing_missing(self):
        connection = GuardConnection()
        repository = TimetableRepository(connection)
        with self.assertRaises(IncompleteCatalogueError):
            repository.mark_missing_sources(
                run_id=4,
                operator="GABS",
                discovered_keys=["000001", "000002"],
            )
        self.assertEqual(len(connection.events), 1)
        self.assertFalse(any("update timetable_sources" in sql for sql in connection.statements))

    def test_published_query_uses_direct_trip_ordinal_and_keeps_myciti_rows(self):
        connection = CaptureConnection()
        repository = TimetableRepository(connection)
        self.assertEqual(repository.published_departures([7]), [])
        statement, args = connection.statements[0]
        self.assertIn("trips.timetable_trip_ordinal as trip_ordinal", statement)
        self.assertIn("trips.timetable_source_version_id = any", statement)
        self.assertNotIn("timetable_service_family is not null", statement)
        self.assertEqual(args, ([7],))

    def test_cancelled_audit_queue_is_replaced_under_publication_lock(self):
        connection = CaptureConnection()
        repository = TimetableRepository(connection)
        candidate = AuditCandidate(
            source_id=1,
            source_version_id=2,
            operator="MyCiti",
            route_code="242",
            route_name="Route",
            direction_code="242",
            direction_name="To Atlantis",
            direction_ordinal=1,
            service_day="monday",
            trip_ordinal=1,
            stop_name="Origin",
            stop_sequence=0,
            pdf_departure="06:00",
            raw_departure="06:00",
            sample_kind="first_departure",
            footnote_markers=(),
            expected_departure="06:00",
        )
        repository.approved_versions = mock.Mock(
            return_value=[{"source_version_id": 2}]
        )
        repository.published_departures = mock.Mock(return_value=[])
        with mock.patch(
            "timetable_verification.repository.build_extraction_candidates",
            return_value=[candidate],
        ), mock.patch(
            "timetable_verification.repository.reconcile_with_published",
            return_value=([candidate], {"published_candidates": 1}),
        ), mock.patch(
            "timetable_verification.repository.select_stratified_samples",
            return_value=[candidate],
        ), mock.patch(
            "timetable_verification.repository.plan_compliance",
            return_value={"compliant": True, "shortfalls": []},
        ), mock.patch("psycopg2.extras.execute_values") as execute_values:
            result = repository.ensure_weekly_audit_plan(
                check_run_id=9,
                target_sample_size=100,
            )

        statements = [statement for statement, _args in connection.statements]
        self.assertEqual(result["status"], "created")
        self.assertTrue(any("pg_advisory_xact_lock" in sql for sql in statements))
        self.assertTrue(
            any(
                "status <> 'cancelled'" in sql and "from timetable_audit_runs" in sql
                for sql in statements
            )
        )
        self.assertTrue(
            any(
                "on conflict (audit_week) where status in ('planned', 'in_progress')"
                in sql
                for sql in statements
            )
        )
        execute_values.assert_called_once()


if __name__ == "__main__":
    unittest.main()
