import copy
import unittest

from timetable_verification.canonical import canonical_json_bytes, content_sha256
from timetable_verification.diff import compare_extractions


def extraction(time="06:00", route_name="Route"):
    return {
        "schema_version": 1,
        "operator": "MyCiti",
        "source_key": "T01X",
        "publication_scope": "route",
        "effective_date": None,
        "routes": [
            {
                "code": "T01X",
                "name": route_name,
                "directions": [
                    {
                        "code": "T01X",
                        "name": "To Terminus",
                        "effective_date": None,
                        "services": [
                            {
                                "label": "MONDAYS TO FRIDAYS",
                                "service_days": [
                                    "monday",
                                    "tuesday",
                                    "wednesday",
                                    "thursday",
                                    "friday",
                                ],
                                "footnotes": [],
                                "trips": [
                                    {
                                        "footnote_markers": [],
                                        "service_days": [
                                            "monday",
                                            "tuesday",
                                            "wednesday",
                                            "thursday",
                                            "friday",
                                        ],
                                        "times": [
                                            {
                                                "sequence": 0,
                                                "stop_name": "Origin",
                                                "time": time,
                                                "raw_time": time,
                                                "stop_time_type": "scheduled",
                                            },
                                            {
                                                "sequence": 1,
                                                "stop_name": "Terminus",
                                                "time": "06:30",
                                                "raw_time": "06:30",
                                                "stop_time_type": "scheduled",
                                            },
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        ],
    }


class CanonicalAndDiffTest(unittest.TestCase):
    def test_canonical_fingerprint_is_independent_of_dictionary_key_order(self):
        first = extraction()
        second = {key: first[key] for key in reversed(list(first))}
        self.assertEqual(canonical_json_bytes(first), canonical_json_bytes(second))
        self.assertEqual(content_sha256(first), content_sha256(second))

    def test_diff_reports_counts_times_and_structural_changes(self):
        previous = extraction()
        current = extraction(time="06:05", route_name="Renamed Route")
        comparison = compare_extractions(previous, current)
        self.assertEqual(comparison["previous_scheduled_departure_count"], 2)
        self.assertEqual(comparison["current_scheduled_departure_count"], 2)
        self.assertEqual(comparison["changed_time_count"], 1)
        self.assertTrue(comparison["structural_changes"]["routes"]["changed"])
        self.assertTrue(comparison["has_changes"])

    def test_added_and_removed_cells_remain_distinct_from_changed_times(self):
        previous = extraction()
        current = copy.deepcopy(previous)
        current["routes"][0]["directions"][0]["services"][0]["trips"][0]["times"][1][
            "stop_time_type"
        ] = "not_served"
        current["routes"][0]["directions"][0]["services"][0]["trips"][0]["times"][1][
            "time"
        ] = None
        comparison = compare_extractions(previous, current)
        self.assertEqual(comparison["changed_time_count"], 0)
        self.assertEqual(comparison["removed_time_count"], 1)


if __name__ == "__main__":
    unittest.main()
