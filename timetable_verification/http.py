"""Sequential, host-paced HTTP access for official operator sites."""

from __future__ import annotations

import email.utils
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from typing import Callable, Dict, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener


DEFAULT_MIN_INTERVAL_SECONDS = 1.5
MAX_PDF_BYTES = 50 * 1024 * 1024
DEFAULT_USER_AGENT = "Fika-Timetable-Verifier/1.0 (+https://www.fika.net.za/contact)"
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})


class RequestFailure(RuntimeError):
    def __init__(self, message: str, *, status: Optional[int] = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class HttpResponse:
    url: str
    status: int
    headers: Mapping[str, str]
    body: bytes
    duration_ms: int


def _headers_dict(headers: object) -> Dict[str, str]:
    if headers is None:
        return {}
    return {str(key).casefold(): str(value) for key, value in headers.items()}


def _retry_after_seconds(value: Optional[str], now: Optional[datetime] = None) -> Optional[float]:
    if not value:
        return None
    stripped = value.strip()
    try:
        return max(0.0, float(stripped))
    except ValueError:
        pass
    try:
        retry_at = email.utils.parsedate_to_datetime(stripped)
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        return max(0.0, (retry_at - current).total_seconds())
    except (TypeError, ValueError, OverflowError):
        return None


class PoliteRequester:
    """A cookie-aware requester with one sequential stream per process.

    The configured interval is clamped to at least 1.5 seconds.  Retries honor
    ``Retry-After`` and use bounded exponential backoff for transient failures.
    PDF callers intentionally make unconditional GETs so a source can be
    fingerprinted even when an operator silently replaces a same-name file.
    """

    def __init__(
        self,
        *,
        min_interval_seconds: float = DEFAULT_MIN_INTERVAL_SECONDS,
        retries: int = 3,
        timeout_seconds: float = 60.0,
        user_agent: str = DEFAULT_USER_AGENT,
        jitter_seconds: float = 0.25,
        opener: object = None,
        monotonic: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        random_value: Callable[[], float] = random.random,
    ) -> None:
        self.min_interval_seconds = max(
            DEFAULT_MIN_INTERVAL_SECONDS,
            float(min_interval_seconds),
        )
        self.retries = max(1, int(retries))
        self.timeout_seconds = max(1.0, float(timeout_seconds))
        self.user_agent = user_agent
        self.jitter_seconds = max(0.0, float(jitter_seconds))
        self.opener = opener or build_opener(HTTPCookieProcessor(CookieJar()))
        self._monotonic = monotonic
        self._sleep = sleep
        self._random_value = random_value
        self._last_request_started: Dict[str, float] = {}

    def get(
        self,
        url: str,
        *,
        headers: Optional[Mapping[str, str]] = None,
        accept: str = "*/*",
        max_bytes: Optional[int] = None,
    ) -> HttpResponse:
        return self.request(
            "GET",
            url,
            headers=headers,
            accept=accept,
            max_bytes=max_bytes,
        )

    def post(
        self,
        url: str,
        data: bytes,
        *,
        headers: Optional[Mapping[str, str]] = None,
        accept: str = "*/*",
    ) -> HttpResponse:
        return self.request("POST", url, data=data, headers=headers, accept=accept)

    def get_pdf(
        self,
        url: str,
        *,
        referer: Optional[str] = None,
    ) -> HttpResponse:
        headers = {
            "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
            "Cache-Control": "no-cache, no-store",
            "Pragma": "no-cache",
        }
        if referer:
            headers["Referer"] = referer
        response = self.get(url, headers=headers, max_bytes=MAX_PDF_BYTES)
        if not response.body.startswith(b"%PDF-"):
            raise RequestFailure(
                f"{url} did not return a PDF document",
                status=response.status,
            )
        return response

    def request(
        self,
        method: str,
        url: str,
        *,
        data: Optional[bytes] = None,
        headers: Optional[Mapping[str, str]] = None,
        accept: str = "*/*",
        max_bytes: Optional[int] = None,
    ) -> HttpResponse:
        combined_headers = {
            "User-Agent": self.user_agent,
            "Accept-Language": "en-ZA,en;q=0.8",
            "Accept": accept,
        }
        combined_headers.update(dict(headers or {}))
        last_error: Optional[BaseException] = None

        for attempt in range(1, self.retries + 1):
            self._pace(url)
            started = self._monotonic()
            request = Request(
                url,
                data=data,
                headers=combined_headers,
                method=method.upper(),
            )
            try:
                with self.opener.open(request, timeout=self.timeout_seconds) as response:
                    response_headers = _headers_dict(response.headers)
                    content_length = response_headers.get("content-length")
                    if max_bytes is not None and content_length:
                        try:
                            if int(content_length) > max_bytes:
                                raise RequestFailure(
                                    f"{method.upper()} {url} exceeds the {max_bytes}-byte limit"
                                )
                        except ValueError:
                            pass
                    body = (
                        response.read(max_bytes + 1)
                        if max_bytes is not None
                        else response.read()
                    )
                    if max_bytes is not None and len(body) > max_bytes:
                        raise RequestFailure(
                            f"{method.upper()} {url} exceeds the {max_bytes}-byte limit"
                        )
                    status = int(getattr(response, "status", response.getcode()))
                    response_url = str(getattr(response, "url", url))
                    return HttpResponse(
                        url=response_url,
                        status=status,
                        headers=response_headers,
                        body=body,
                        duration_ms=max(0, int((self._monotonic() - started) * 1000)),
                    )
            except HTTPError as exc:
                last_error = exc
                if exc.code not in RETRYABLE_STATUS_CODES or attempt == self.retries:
                    raise RequestFailure(
                        f"{method.upper()} {url} returned HTTP {exc.code}",
                        status=exc.code,
                    ) from exc
                delay = _retry_after_seconds(exc.headers.get("Retry-After"))
                self._sleep(delay if delay is not None else self._backoff(attempt))
            except (URLError, TimeoutError, OSError) as exc:
                last_error = exc
                if attempt == self.retries:
                    raise RequestFailure(
                        f"{method.upper()} {url} failed after {attempt} attempts: {exc}"
                    ) from exc
                self._sleep(self._backoff(attempt))

        raise RequestFailure(f"{method.upper()} {url} failed: {last_error}")

    def _pace(self, url: str) -> None:
        host = (urlsplit(url).hostname or "").casefold()
        now = self._monotonic()
        last_started = self._last_request_started.get(host)
        if last_started is not None:
            required_interval = self.min_interval_seconds + (
                self.jitter_seconds * min(1.0, max(0.0, self._random_value()))
            )
            remaining = required_interval - (now - last_started)
            if remaining > 0:
                self._sleep(remaining)
                now = self._monotonic()
        self._last_request_started[host] = now

    @staticmethod
    def _backoff(attempt: int) -> float:
        return min(float(2 ** (attempt - 1)), 30.0)


__all__ = [
    "DEFAULT_MIN_INTERVAL_SECONDS",
    "DEFAULT_USER_AGENT",
    "HttpResponse",
    "MAX_PDF_BYTES",
    "PoliteRequester",
    "RequestFailure",
]
