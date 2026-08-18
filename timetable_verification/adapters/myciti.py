"""MyCiTi official timetable catalogue and PDF adapter."""

from __future__ import annotations

import io
import re
from collections import OrderedDict
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence
from urllib.parse import unquote, urljoin, urlparse

import pdfplumber

from timetable_verification import SCHEMA_VERSION
from timetable_verification.canonical import (
    footnote_markers,
    normalize_time,
    ordered_service_days,
    stop_time_type,
    validate_extraction,
)

from .base import DiscoveredSource, DiscoveryError, OperatorAdapter, ParseError


MYCITI_CATALOGUE_URL = "https://www.myciti.org.za/en/timetables/timetable-downloads/"
_SCRIPT_PDF_RE = re.compile(
    r'"timetable"\s*:\s*"(?P<url>[^"?]+\.pdf(?:\?[^\"]*)?)"',
    re.IGNORECASE,
)


def _is_timetable_pdf(url: str) -> bool:
    if not url:
        return False
    path = urlparse(url).path.casefold()
    return path.endswith(".pdf") and "/route-timetables/" in path


class _TimetableLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: List[str] = []

    def handle_starttag(self, tag: str, attrs: Sequence[tuple]) -> None:
        if tag.casefold() != "a":
            return
        href = dict(attrs).get("href")
        if href and _is_timetable_pdf(href):
            self.links.append(href)


def source_key_from_url(url: str) -> str:
    filename = unquote(Path(urlparse(url).path).name)
    stem = Path(filename).stem
    stem = re.sub(r"[-_ ]*timetable$", "", stem, flags=re.IGNORECASE)
    match = re.fullmatch(r"([A-Za-z0-9]+)", stem.strip())
    if not match:
        raise DiscoveryError(f"cannot derive a MyCiTi route code from {url}")
    return match.group(1).upper()


def extract_timetable_links(html: str, page_url: str) -> List[str]:
    parser = _TimetableLinkParser()
    parser.feed(html)
    links = list(parser.links)
    links.extend(match.replace("\\/", "/") for match in _SCRIPT_PDF_RE.findall(html))
    result: List[str] = []
    seen = set()
    for link in links:
        absolute = urljoin(page_url, link)
        if _is_timetable_pdf(absolute) and absolute not in seen:
            seen.add(absolute)
            result.append(absolute)
    return result


def _clean_cell(value: Any) -> str:
    return str(value or "").replace("\n", " ").strip()


def _words_by_height(words: Iterable[Dict[str, Any]], height: float) -> List[str]:
    return [
        word["text"]
        for word in words
        if round(float(word.get("height", 0)), 1) == height
    ]


def _service_days(label: str) -> List[str]:
    normalized = re.sub(r"\s+", " ", label.casefold()).strip(" :")
    replacements = {
        "mondays": "monday",
        "tuesdays": "tuesday",
        "wednesdays": "wednesday",
        "thursdays": "thursday",
        "fridays": "friday",
        "saturdays": "saturday",
        "sundays": "sunday",
        "public holidays": "public_holiday",
        "public holiday": "public_holiday",
    }
    for before, after in replacements.items():
        normalized = normalized.replace(before, after)

    day_order = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "public_holiday",
    ]
    selected = set()
    for start_name, end_name in re.findall(
        r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday|public_holiday)\s+to\s+"
        r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday|public_holiday)",
        normalized,
    ):
        start = day_order.index(start_name)
        end = day_order.index(end_name)
        if start > end:
            raise ParseError(f"unsupported MyCiTi service-day range {label!r}")
        selected.update(day_order[start : end + 1])
    without_ranges = re.sub(
        r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|public_holiday)\s+to\s+"
        r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|public_holiday)",
        "",
        normalized,
    )
    for day in day_order:
        if re.search(rf"(?<![a-z_]){re.escape(day)}(?![a-z_])", without_ranges):
            selected.add(day)
    if not selected:
        raise ParseError(f"unknown MyCiTi service-day label {label!r}")
    return ordered_service_days(selected)


def _merge_page_tables(
    tables: Iterable[List[List[Any]]],
    source_name: str,
    page_number: int,
) -> List[List[str]]:
    cleaned = [
        [[_clean_cell(cell) for cell in row] for row in table if row]
        for table in tables
        if table
    ]
    cleaned = [table for table in cleaned if table]
    if not cleaned:
        return []
    primary = cleaned[0]
    for table in cleaned[1:]:
        if [row[0] for row in table] != [row[0] for row in primary]:
            raise ParseError(
                f"{source_name} page {page_number}: split tables have different stops"
            )
        for index, row in enumerate(table):
            primary[index].extend(row[2:])
    return primary


def _page_data(page: Any, page_number: int, source_name: str) -> Dict[str, Any] | None:
    words = page.extract_words() or []
    if not words:
        return None
    route_words = _words_by_height(words, 13.5)
    service_words = _words_by_height(words, 12.0)
    direction_words = _words_by_height(words, 10.5)
    tables = page.extract_tables() or []
    if not route_words and not service_words and not direction_words and not tables:
        return None
    if len(route_words) < 2:
        raise ParseError(f"{source_name} page {page_number}: missing route code/title")
    result = {
        "code": route_words[0].strip(":").upper(),
        "route_name": " ".join(route_words[1:]).strip(),
        "direction_label": " ".join(direction_words).strip(),
        "service_label": " ".join(service_words).strip(),
        "rows": _merge_page_tables(tables, source_name, page_number),
        "page_number": page_number,
    }
    missing = [
        name
        for name in ("code", "route_name", "direction_label", "service_label", "rows")
        if not result[name]
    ]
    if missing:
        raise ParseError(
            f"{source_name} page {page_number}: missing {', '.join(missing)}"
        )
    _service_days(result["service_label"])
    for row_number, row in enumerate(result["rows"], start=1):
        if len(row) < 3 or not row[0]:
            raise ParseError(
                f"{source_name} page {page_number} row {row_number}: invalid timetable row"
            )
    return result


def _direction_details(label: str) -> Dict[str, str]:
    title = re.sub(r"^Direction:\s*", "", label, flags=re.IGNORECASE).strip()
    match = re.match(r"^(To|From)\s+(\S+)\s+(.+)$", title, flags=re.IGNORECASE)
    if not match:
        raise ParseError(f"unexpected MyCiTi direction format: {label!r}")
    return {
        "code": match.group(2).upper(),
        "name": f"{match.group(1).title()} {match.group(3).strip()}",
    }


def _merge_rows(
    destination: List[List[str]],
    continuation: List[List[str]],
    context: str,
) -> None:
    if len(destination) != len(continuation):
        raise ParseError(f"{context}: continuation page stop count changed")
    for index, row in enumerate(continuation):
        if destination[index][0] != row[0]:
            raise ParseError(f"{context}: continuation page stop order changed")
        destination[index].extend(row[2:])


def _canonical_trips(
    rows: List[List[str]],
    service_days: List[str],
) -> List[Dict[str, Any]]:
    column_count = max(len(row) for row in rows)
    trips: List[Dict[str, Any]] = []
    for column in range(2, column_count):
        cells: List[Dict[str, Any]] = []
        markers: List[str] = []
        for sequence, row in enumerate(rows):
            raw = row[column] if column < len(row) else ""
            for marker in footnote_markers(raw):
                if marker not in markers:
                    markers.append(marker)
            cells.append(
                {
                    "sequence": sequence,
                    "stop_name": row[0],
                    "time": normalize_time(raw),
                    "raw_time": raw,
                    "stop_time_type": stop_time_type(raw),
                }
            )
        if any(cell["stop_time_type"] == "scheduled" for cell in cells):
            trips.append(
                {
                    "footnote_markers": markers,
                    "service_days": list(service_days),
                    "times": cells,
                }
            )
    if not trips:
        raise ParseError("MyCiTi service contained no scheduled trips")
    return trips


class MyCitiAdapter(OperatorAdapter):
    operator = "MyCiti"

    def __init__(self, catalogue_url: str = MYCITI_CATALOGUE_URL) -> None:
        self.catalogue_url = catalogue_url

    def discover(self, requester: Any) -> List[DiscoveredSource]:
        response = requester.get(self.catalogue_url, accept="text/html,*/*;q=0.8")
        html = response.body.decode("utf-8", errors="replace")
        links = extract_timetable_links(html, self.catalogue_url)
        if not links:
            raise DiscoveryError("MyCiTi catalogue contained no timetable PDF links")
        sources: List[DiscoveredSource] = []
        urls_by_key: Dict[str, str] = {}
        for link in links:
            key = source_key_from_url(link)
            previous = urls_by_key.get(key)
            if previous and previous != link:
                raise DiscoveryError(
                    f"MyCiTi catalogue has multiple URLs for route {key}: {previous}, {link}"
                )
            if not previous:
                urls_by_key[key] = link
                sources.append(
                    DiscoveredSource(
                        operator=self.operator,
                        source_key=key,
                        url=link,
                        catalogue_page=self.catalogue_url,
                    )
                )
        return sources

    def parse_pdf(
        self,
        source: DiscoveredSource,
        pdf_bytes: bytes,
    ) -> Dict[str, Any]:
        source_name = Path(urlparse(source.url).path).name or source.source_key
        pages: List[Dict[str, Any]] = []
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page_number, page in enumerate(pdf.pages, start=1):
                    parsed = _page_data(page, page_number, source_name)
                    if parsed:
                        pages.append(parsed)
        except ParseError:
            raise
        except Exception as exc:
            raise ParseError(f"could not parse MyCiTi PDF {source_name}: {exc}") from exc
        if not pages:
            raise ParseError(f"{source_name}: no timetable pages were parsed")

        route_codes = {page["code"] for page in pages}
        route_names = {page["route_name"] for page in pages}
        if route_codes != {source.source_key.upper()}:
            raise ParseError(
                f"{source_name}: source key {source.source_key} did not match PDF routes "
                f"{sorted(route_codes)}"
            )
        if len(route_names) != 1:
            raise ParseError(f"{source_name}: PDF contains multiple route names")

        grouped: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
        for page in pages:
            direction = grouped.setdefault(
                page["direction_label"],
                {
                    **_direction_details(page["direction_label"]),
                    "services": OrderedDict(),
                },
            )
            service = direction["services"].get(page["service_label"])
            if service is None:
                direction["services"][page["service_label"]] = {
                    "label": page["service_label"].upper(),
                    "service_days": _service_days(page["service_label"]),
                    "rows": [list(row) for row in page["rows"]],
                }
            else:
                _merge_rows(
                    service["rows"],
                    page["rows"],
                    f"{source_name} {page['direction_label']} {page['service_label']}",
                )

        canonical_directions: List[Dict[str, Any]] = []
        for direction in grouped.values():
            services: List[Dict[str, Any]] = []
            for service in direction["services"].values():
                services.append(
                    {
                        "label": service["label"],
                        "service_days": service["service_days"],
                        "footnotes": [],
                        "trips": _canonical_trips(
                            service["rows"],
                            service["service_days"],
                        ),
                    }
                )
            canonical_directions.append(
                {
                    "code": direction["code"],
                    "name": direction["name"],
                    "effective_date": None,
                    "services": services,
                }
            )

        extraction = {
            "schema_version": SCHEMA_VERSION,
            "operator": self.operator,
            "source_key": source.source_key.upper(),
            "publication_scope": "route",
            "effective_date": None,
            "routes": [
                {
                    "code": pages[0]["code"],
                    "name": pages[0]["route_name"],
                    "directions": canonical_directions,
                }
            ],
        }
        validate_extraction(extraction)
        return extraction


__all__ = [
    "MYCITI_CATALOGUE_URL",
    "MyCitiAdapter",
    "extract_timetable_links",
    "source_key_from_url",
]
