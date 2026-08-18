import unittest
from datetime import date

from timetable_verification.audit import (
    AuditCandidate,
    build_extraction_candidates,
    plan_compliance,
    reconcile_with_published,
    select_stratified_samples,
)


def _version(operator="MyCiti"):
    scope = "route" if operator == "MyCiti" else "service_days"
    route_code = "242" if operator == "MyCiti" else "0066"
    return {
        "source_id": 7,
        "source_version_id": 11,
        "extraction": {
            "schema_version": 1,
            "operator": operator,
            "source_key": "242" if operator == "MyCiti" else "006602",
            "publication_scope": scope,
            "effective_date": None,
            "routes": [
                {
                    "code": route_code,
                    "name": "Origin - Destination",
                    "directions": [
                        {
                            "code": route_code if operator == "MyCiti" else "01",
                            "name": "To Destination",
                            "effective_date": None,
                            "services": [
                                {
                                    "label": "MONDAYS TO FRIDAYS",
                                    "service_days": ["monday"],
                                    "footnotes": [],
                                    "trips": [
                                        {
                                            "footnote_markers": [],
                                            "service_days": ["monday"],
                                            "times": [
                                                {
                                                    "sequence": 0,
                                                    "stop_name": "Origin",
                                                    "time": "06:00",
                                                    "raw_time": "06:00",
                                                    "stop_time_type": "scheduled",
                                                }
                                            ],
                                        }
                                    ],
                                },
                                {
                                    "label": "SATURDAYS",
                                    "service_days": ["saturday"],
                                    "footnotes": [],
                                    "trips": [
                                        {
                                            "footnote_markers": [],
                                            "service_days": ["saturday"],
                                            "times": [
                                                {
                                                    "sequence": 0,
                                                    "stop_name": "Origin",
                                                    "time": "07:00",
                                                    "raw_time": "07:00",
                                                    "stop_time_type": "scheduled",
                                                }
                                            ],
                                        }
                                    ],
                                },
                            ],
                        }
                    ],
                }
            ],
        },
    }


class AuditCandidateTest(unittest.TestCase):
    def test_trip_ordinals_are_flattened_across_services_for_both_operators(self):
        for operator in ("MyCiti", "GABS"):
            with self.subTest(operator=operator):
                candidates = build_extraction_candidates([_version(operator)])
                by_day = {item.service_day: item.trip_ordinal for item in candidates}
                self.assertEqual(by_day, {"monday": 1, "saturday": 2})

    def test_reconciliation_uses_production_value_and_direct_trip_ordinal(self):
        candidate = build_extraction_candidates([_version("MyCiti")])[0]
        published = {
            "source_version_id": candidate.source_version_id,
            "route_code": candidate.route_code,
            "direction_code": candidate.direction_code,
            "direction_name": candidate.direction_name,
            "service_day": candidate.service_day,
            "trip_ordinal": candidate.trip_ordinal,
            "stop_sequence": candidate.stop_sequence,
            "stop_name": candidate.stop_name,
            "expected_departure": "06:05",
            # MyCiTi intentionally has no timetable_service_family value.
            "timetable_service_family": None,
        }
        reconciled, counts = reconcile_with_published([candidate], [published])
        self.assertEqual(reconciled[0].expected_departure, "06:05")
        self.assertEqual(reconciled[0].pdf_departure, "06:00")
        self.assertEqual(counts["candidate_production_time_mismatches"], 1)

        published["trip_ordinal"] = 999
        reconciled, counts = reconcile_with_published([candidate], [published])
        self.assertEqual(reconciled, [])
        self.assertEqual(counts["unpublished_candidates"], 1)

    def test_default_plan_is_deterministic_and_meets_required_strata(self):
        candidates = []
        days = ["monday", "saturday", "sunday", "public_holiday"]
        kinds = ["standard", "first_departure", "last_departure", "footnote"]
        version_id = 0
        for operator in ("GABS", "MyCiti"):
            for direction_ordinal in (1, 2):
                version_id += 1
                for number in range(80):
                    day = days[number % len(days)]
                    kind = kinds[number % len(kinds)]
                    candidates.append(
                        AuditCandidate(
                            source_id=version_id,
                            source_version_id=version_id,
                            operator=operator,
                            route_code=f"R{version_id}",
                            route_name=f"Route {version_id}",
                            direction_code=str(direction_ordinal),
                            direction_name=f"{operator} direction {direction_ordinal}",
                            direction_ordinal=direction_ordinal,
                            service_day=day,
                            trip_ordinal=number + 1,
                            stop_name=f"Stop {number}",
                            stop_sequence=number,
                            pdf_departure=f"{number % 24:02d}:{number % 60:02d}",
                            raw_departure=f"{number % 24:02d}:{number % 60:02d}",
                            sample_kind=kind,
                            footnote_markers=("a",) if kind == "footnote" else (),
                            expected_departure=f"{number % 24:02d}:{number % 60:02d}",
                        )
                    )

        first = select_stratified_samples(
            candidates,
            audit_week=date(2026, 8, 17),
        )
        second = select_stratified_samples(
            list(reversed(candidates)),
            audit_week=date(2026, 8, 17),
        )
        self.assertEqual([item.identity() for item in first], [item.identity() for item in second])
        self.assertEqual(len(first), 200)
        self.assertTrue(plan_compliance(first, candidates)["compliant"])


if __name__ == "__main__":
    unittest.main()
