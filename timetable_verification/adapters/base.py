"""Common types implemented by each official-source adapter."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


class DiscoveryError(RuntimeError):
    pass


class ParseError(ValueError):
    pass


@dataclass(frozen=True)
class DiscoveredSource:
    operator: str
    source_key: str
    url: str
    catalogue_page: Optional[str] = None
    route_name_hint: str = ""
    alternate_urls: Tuple[str, ...] = ()
    discovery_warnings: Tuple[str, ...] = ()


class OperatorAdapter(ABC):
    operator: str

    @abstractmethod
    def discover(self, requester: Any) -> List[DiscoveredSource]:
        """Return every currently published official timetable source."""

    @abstractmethod
    def parse_pdf(
        self,
        source: DiscoveredSource,
        pdf_bytes: bytes,
    ) -> Dict[str, Any]:
        """Return deterministic canonical JSON-compatible data."""
