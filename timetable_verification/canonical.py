"""Canonical timetable helpers shared by both operator adapters."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Tuple


SERVICE_DAYS: Tuple[str, ...] = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "public_holiday",
)

_TIME_RE = re.compile(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)")
_TIME_MARKERS_RE = re.compile(r"\d{1,2}:\d{2}\s*([^\d\s].*|[A-Za-z]+)?$")


class CanonicalError(ValueError):
    """Raised when an extraction cannot satisfy the canonical contract."""


def _validate_optional_date(value: Any, context: str) -> None:
    if value is None:
        return
    if not isinstance(value, str):
        raise CanonicalError(f"{context} must be an ISO date or null")
    try:
        if date.fromisoformat(value).isoformat() != value:
            raise ValueError
    except ValueError as exc:
        raise CanonicalError(f"{context} must be an ISO date or null") from exc


def normalize_time(value: Any) -> Optional[str]:
    """Return a zero-padded HH:MM value embedded in *value*, if valid."""

    match = _TIME_RE.search(str(value or ""))
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def stop_time_type(value: Any) -> str:
    normalized = str(value or "").strip().casefold()
    if normalized == "via":
        return "via"
    if normalize_time(value):
        return "scheduled"
    return "not_served"


def footnote_markers(value: Any) -> List[str]:
    """Extract stable marker characters appended to a timetable time."""

    raw = str(value or "").strip()
    if not normalize_time(raw):
        return []
    match = _TIME_MARKERS_RE.search(raw)
    suffix = (match.group(1) if match else "") or ""
    markers: List[str] = []
    for marker in re.findall(r"[A-Za-z*#\u2020\u2021]+", suffix):
        for character in marker:
            normalized = character.casefold() if character.isalpha() else character
            if normalized not in markers:
                markers.append(normalized)
    return markers


def ordered_service_days(days: Iterable[str]) -> List[str]:
    day_set = {str(day) for day in days}
    unknown = sorted(day_set.difference(SERVICE_DAYS))
    if unknown:
        raise CanonicalError(f"unknown service days: {', '.join(unknown)}")
    return [day for day in SERVICE_DAYS if day in day_set]


def canonical_json_bytes(extraction: Dict[str, Any]) -> bytes:
    """Serialize canonical data identically across runs and platforms."""

    validate_extraction(extraction)
    return json.dumps(
        extraction,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def content_sha256(extraction: Dict[str, Any]) -> str:
    return sha256_bytes(canonical_json_bytes(extraction))


def validate_extraction(extraction: Dict[str, Any]) -> None:
    required = {
        "schema_version",
        "operator",
        "source_key",
        "publication_scope",
        "effective_date",
        "routes",
    }
    missing = sorted(required.difference(extraction))
    if missing:
        raise CanonicalError(f"canonical extraction missing: {', '.join(missing)}")
    if extraction["schema_version"] != 1:
        raise CanonicalError("unsupported canonical schema_version")
    if extraction["operator"] not in {"MyCiti", "GABS"}:
        raise CanonicalError("unsupported operator")
    expected_scope = "route" if extraction["operator"] == "MyCiti" else "service_days"
    if extraction["publication_scope"] != expected_scope:
        raise CanonicalError(
            f"{extraction['operator']} publications must use {expected_scope!r} scope"
        )
    if not str(extraction["source_key"] or "").strip():
        raise CanonicalError("source_key cannot be blank")
    _validate_optional_date(extraction["effective_date"], "effective_date")
    routes = extraction["routes"]
    if not isinstance(routes, list) or not routes:
        raise CanonicalError("canonical extraction must contain at least one route")

    for route in routes:
        if not route.get("code") or not route.get("name"):
            raise CanonicalError("each route needs a code and name")
        directions = route.get("directions")
        if not isinstance(directions, list) or not directions:
            raise CanonicalError("each route needs at least one direction")
        for direction in directions:
            if not direction.get("name"):
                raise CanonicalError("each direction needs a name")
            _validate_optional_date(
                direction.get("effective_date"),
                "direction effective_date",
            )
            services = direction.get("services")
            if not isinstance(services, list) or not services:
                raise CanonicalError("each direction needs at least one service")
            for service in services:
                if not str(service.get("label") or "").strip():
                    raise CanonicalError("each service needs a label")
                service["service_days"] = ordered_service_days(service.get("service_days", []))
                if not service["service_days"]:
                    raise CanonicalError("each service needs at least one service day")
                if not isinstance(service.get("footnotes"), list):
                    raise CanonicalError("service footnotes must be a list")
                footnote_markers_seen = set()
                for footnote in service["footnotes"]:
                    if not isinstance(footnote, dict):
                        raise CanonicalError("footnote definitions must be objects")
                    marker = str(footnote.get("marker") or "")
                    text = str(footnote.get("text") or "")
                    if not marker or not text:
                        raise CanonicalError("footnote definitions need marker and text")
                    if marker in footnote_markers_seen:
                        raise CanonicalError("footnote markers must be unique per service")
                    footnote_markers_seen.add(marker)
                trips = service.get("trips")
                if not isinstance(trips, list) or not trips:
                    raise CanonicalError("each service needs at least one trip")
                expected_stops = None
                for trip in trips:
                    if not isinstance(trip.get("footnote_markers"), list):
                        raise CanonicalError("trip footnote_markers must be a list")
                    trip_markers = trip["footnote_markers"]
                    if len(trip_markers) != len(set(trip_markers)):
                        raise CanonicalError("trip footnote markers must be unique")
                    undefined = sorted(set(trip_markers).difference(footnote_markers_seen))
                    if undefined:
                        raise CanonicalError(
                            f"trip uses undefined footnote markers: {', '.join(undefined)}"
                        )
                    trip["service_days"] = ordered_service_days(
                        trip.get("service_days", service["service_days"])
                    )
                    if not trip["service_days"]:
                        raise CanonicalError("each trip needs at least one service day")
                    if not set(trip["service_days"]).issubset(service["service_days"]):
                        raise CanonicalError(
                            "trip service days must be contained in its service days"
                        )
                    times = trip.get("times")
                    if not isinstance(times, list) or not times:
                        raise CanonicalError("each trip needs stop-time cells")
                    stop_signature = []
                    for expected_sequence, cell in enumerate(times):
                        if cell.get("sequence") != expected_sequence:
                            raise CanonicalError("stop-time sequences must be zero-based and contiguous")
                        if not cell.get("stop_name"):
                            raise CanonicalError("stop_name cannot be blank")
                        stop_signature.append((expected_sequence, cell["stop_name"]))
                        if cell.get("stop_time_type") not in {
                            "scheduled",
                            "not_served",
                            "via",
                        }:
                            raise CanonicalError("invalid stop_time_type")
                        cell_time = cell.get("time")
                        if cell["stop_time_type"] == "scheduled":
                            if normalize_time(cell_time) != cell_time:
                                raise CanonicalError(
                                    "scheduled stop times must use canonical HH:MM"
                                )
                        elif cell_time is not None:
                            raise CanonicalError(
                                "non-scheduled stop-time cells must have null time"
                            )
                        if "raw_time" not in cell:
                            raise CanonicalError("stop-time cells must preserve raw_time")
                    if expected_stops is None:
                        expected_stops = stop_signature
                    elif expected_stops != stop_signature:
                        raise CanonicalError(
                            "all trips in a service must use the same ordered stops"
                        )


def extraction_metadata(extraction: Dict[str, Any]) -> Dict[str, Any]:
    """Derive registry fields from canonical data."""

    route_names: List[str] = []
    direction_names: List[str] = []
    coverage: List[str] = []
    effective_dates: List[str] = []
    for route in extraction["routes"]:
        if route["name"] not in route_names:
            route_names.append(route["name"])
        for direction in route["directions"]:
            if direction["name"] not in direction_names:
                direction_names.append(direction["name"])
            if direction.get("effective_date"):
                effective_dates.append(direction["effective_date"])
            for service in direction["services"]:
                for day in service["service_days"]:
                    if day not in coverage:
                        coverage.append(day)
    top_date = extraction.get("effective_date")
    if top_date:
        effective_dates.append(top_date)
    return {
        "route_name": " / ".join(route_names),
        "direction_names": direction_names,
        "service_day_coverage": ordered_service_days(coverage),
        "source_effective_date": max(effective_dates) if effective_dates else None,
    }


def iter_scheduled_entries(
    extraction: Dict[str, Any],
) -> Iterable[Tuple[Tuple[Any, ...], Dict[str, Any]]]:
    """Yield stable logical keys and scheduled timetable cells."""

    for route_index, route in enumerate(extraction.get("routes", [])):
        for direction_index, direction in enumerate(route.get("directions", [])):
            for service_index, service in enumerate(direction.get("services", [])):
                for trip_index, trip in enumerate(service.get("trips", [])):
                    for cell in trip.get("times", []):
                        if cell.get("stop_time_type") != "scheduled" or not cell.get("time"):
                            continue
                        key = (
                            route_index,
                            route.get("code"),
                            direction_index,
                            direction.get("code"),
                            direction.get("name"),
                            service_index,
                            service.get("label"),
                            trip_index,
                            cell.get("sequence"),
                            cell.get("stop_name"),
                        )
                        yield key, cell
