import base64
import hashlib
import unittest
from pathlib import Path

from timetable_verification.adapters import DiscoveredSource, GabsAdapter, MyCitiAdapter
from timetable_verification.adapters.base import ParseError
from timetable_verification.adapters.gabs import (
    GABS_CATALOGUE_HEADERS,
    _deduplicate_identical_timetables,
    _footnote_service_days,
    _select_preferred_source,
    _source_key_from_pdf_url,
)
from timetable_verification.adapters.myciti import _direction_details, source_key_from_url


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def fixture_bytes(name):
    return base64.b64decode((FIXTURES / name).read_text(encoding="ascii"))


class AdapterUnitTest(unittest.TestCase):
    def test_gabs_catalogue_uses_browser_compatible_identified_headers(self):
        self.assertTrue(GABS_CATALOGUE_HEADERS["User-Agent"].startswith("Mozilla/5.0"))
        self.assertIn("Fika-Timetable-Verifier", GABS_CATALOGUE_HEADERS["X-Fika-Verifier"])
        self.assertIn("fika.net.za/contact", GABS_CATALOGUE_HEADERS["X-Fika-Verifier"])

    def test_myciti_source_keys_support_feeder_and_express_codes(self):
        self.assertEqual(
            source_key_from_url(
                "https://www.myciti.org.za/docs/route-timetables/T01X-timetable.pdf"
            ),
            "T01X",
        )
        self.assertEqual(
            source_key_from_url(
                "https://www.myciti.org.za/docs/route-timetables/d08-timetable.pdf"
            ),
            "D08",
        )

    def test_gabs_footnote_day_ranges_expand_inclusively(self):
        self.assertEqual(
            _footnote_service_days("Mondays to Thursdays"),
            ["monday", "tuesday", "wednesday", "thursday"],
        )
        with self.assertRaises(ParseError):
            _footnote_service_days("Mondays through Thursdays")
        with self.assertRaises(ParseError):
            _footnote_service_days("Mondays excluding public holidays")

    def test_gabs_literal_five_digit_catalogue_key_is_accepted(self):
        self.assertEqual(
            _source_key_from_pdf_url(
                "https://www.gabs.co.za/PDF/KHAYELITSHA_01560.pdf"
            ),
            "01560",
        )

    def test_duplicate_catalogue_key_selects_newest_url_without_losing_evidence(self):
        older = DiscoveredSource(
            "GABS",
            "01560",
            "https://operator.test/route_from_20260727_to_20260823_01560.pdf",
        )
        newer = DiscoveredSource(
            "GABS",
            "01560",
            "https://operator.test/route_from_20260817_to_20260823_01560.pdf",
        )
        selected = _select_preferred_source([newer, older, older])
        self.assertEqual(selected.source_key, "01560")
        self.assertEqual(selected.url, newer.url)
        self.assertEqual(selected.alternate_urls, (older.url,))
        self.assertIn("2 official PDF URLs", selected.discovery_warnings[0])

    def test_only_semantically_identical_duplicate_sections_are_coalesced(self):
        section = {
            "route_title": "A - B",
            "timetable_number": "000101",
            "effective_date": "2026-01-01",
            "services": {"SUNDAYS": {"stops": ["A"], "trips": [["06:00"]]}},
            "footnotes": {},
        }
        duplicate = dict(section)
        conflict = {**section, "effective_date": "2026-01-02"}
        self.assertEqual(len(_deduplicate_identical_timetables([section, duplicate])), 1)
        self.assertEqual(len(_deduplicate_identical_timetables([section, conflict])), 2)

    def test_myciti_direction_preserves_multiword_destination(self):
        self.assertEqual(
            _direction_details("Direction: To 214a Marine Circle"),
            {"code": "214A", "name": "To Marine Circle"},
        )


class RealGabsPdfTest(unittest.TestCase):
    def test_exact_repeated_pages_are_coalesced_but_distinct_direction_remains(self):
        pdf_bytes = fixture_bytes("gabs_001504_duplicate_pages.pdf.b64")
        extraction = GabsAdapter().parse_pdf(
            DiscoveredSource(
                "GABS",
                "001504",
                "https://fixtures.test/CAPE_TOWN___DURBANVILLE___PH_20260810_001504.pdf",
            ),
            pdf_bytes,
        )
        directions = extraction["routes"][0]["directions"]
        self.assertEqual([item["code"] for item in directions], ["03", "04"])
        self.assertEqual(
            [len(item["services"][0]["trips"]) for item in directions],
            [1, 1],
        )

    def test_headerless_sections_use_order_but_only_source_gets_filename_date(self):
        pdf_bytes = fixture_bytes("gabs_009601_headerless.pdf.b64")
        extraction = GabsAdapter().parse_pdf(
            DiscoveredSource(
                "GABS",
                "009601",
                "https://fixtures.test/DELFT___TOWN_CENTRE_from_20260321_to_99999999_009601.pdf",
            ),
            pdf_bytes,
        )
        directions = extraction["routes"][0]["directions"]
        self.assertEqual([item["code"] for item in directions], ["01", "02"])
        self.assertEqual(
            [item["effective_date"] for item in directions],
            ["2026-03-21", None],
        )

    def test_headerless_five_digit_bundle_is_quarantined_as_ambiguous(self):
        pdf_bytes = fixture_bytes("gabs_01560_ambiguous_headerless.pdf.b64")
        with self.assertRaisesRegex(
            ParseError,
            "five-digit bundle key 01560 cannot identify the direction",
        ):
            GabsAdapter().parse_pdf(
                DiscoveredSource(
                    "GABS",
                    "01560",
                    "https://fixtures.test/"
                    "KHAYELITSHA___MITCHELLS_PLAIN_SCHOOLS_"
                    "from_20260118_to_99999999_01560.pdf",
                ),
                pdf_bytes,
            )

    def test_regular_pdf_keeps_all_embedded_directions_and_dates(self):
        pdf_bytes = fixture_bytes("gabs_006602_regular.pdf.b64")
        self.assertEqual(
            hashlib.sha256(pdf_bytes).hexdigest(),
            "ed7ea5b6de2d8fac70eb96ba30d7c4b6106646b137bcb3b6d4c855c12abf8190",
        )
        extraction = GabsAdapter().parse_pdf(
            DiscoveredSource("GABS", "006602", "https://fixtures.test/006602.pdf"),
            pdf_bytes,
        )
        self.assertEqual(extraction["publication_scope"], "service_days")
        directions = extraction["routes"][0]["directions"]
        self.assertEqual([direction["code"] for direction in directions], ["01", "02", "03", "04"])
        self.assertEqual(
            [direction["effective_date"] for direction in directions],
            ["2026-07-20", "2026-07-25", "2026-07-18", "2026-07-18"],
        )
        weekday = directions[0]["services"][0]
        marked = next(trip for trip in weekday["trips"] if trip["footnote_markers"] == ["a"])
        self.assertEqual(
            marked["service_days"],
            ["monday", "tuesday", "wednesday", "thursday"],
        )

    def test_public_holiday_pdf_is_not_silently_dropped(self):
        pdf_bytes = fixture_bytes("gabs_006603_public_holiday.pdf.b64")
        self.assertEqual(
            hashlib.sha256(pdf_bytes).hexdigest(),
            "e1a2dbf8d4a2f71fda741b15ee7894d7b3ef24705192eab8bc94a0f17c4beed3",
        )
        extraction = GabsAdapter().parse_pdf(
            DiscoveredSource("GABS", "006603", "https://fixtures.test/006603.pdf"),
            pdf_bytes,
        )
        self.assertEqual(len(extraction["routes"][0]["directions"]), 4)
        self.assertTrue(
            all(
                service["service_days"] == ["public_holiday"]
                for direction in extraction["routes"][0]["directions"]
                for service in direction["services"]
            )
        )


class RealMyCitiPdfTest(unittest.TestCase):
    def test_route_pdf_preserves_both_directions_and_holiday_coverage(self):
        pdf_bytes = fixture_bytes("myciti_242.pdf.b64")
        self.assertEqual(
            hashlib.sha256(pdf_bytes).hexdigest(),
            "d840d3e216a4dc1ad099a1713525dd2082e284422f67b65fafca15a36a46a72a",
        )
        extraction = MyCitiAdapter().parse_pdf(
            DiscoveredSource("MyCiti", "242", "https://fixtures.test/242-timetable.pdf"),
            pdf_bytes,
        )
        self.assertIsNone(extraction["effective_date"])
        self.assertEqual(
            [item["name"] for item in extraction["routes"][0]["directions"]],
            ["To Swawel", "To Atlantis"],
        )
        coverage = extraction["routes"][0]["directions"][0]["services"][2]["service_days"]
        self.assertEqual(coverage, ["sunday", "public_holiday"])


if __name__ == "__main__":
    unittest.main()
