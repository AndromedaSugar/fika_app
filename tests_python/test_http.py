import io
import unittest
from urllib.error import HTTPError

from timetable_verification.http import MAX_PDF_BYTES, PoliteRequester, RequestFailure


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class FakeResponse:
    def __init__(self, body=b"ok", status=200, headers=None, url="https://example.test/a"):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.url = url
        self.read_calls = []

    def read(self, *args):
        self.read_calls.append(args)
        return self.body if not args else self.body[: args[0]]

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FakeOpener:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class HttpTest(unittest.TestCase):
    def test_uncapped_html_read_does_not_pass_negative_size(self):
        response = FakeResponse(body=b"<html>catalogue</html>")
        requester = PoliteRequester(opener=FakeOpener([response]))
        result = requester.get("https://example.test/catalogue")
        self.assertEqual(result.body, b"<html>catalogue</html>")
        self.assertEqual(response.read_calls, [()])

    def test_requests_are_identified_unconditional_and_host_paced_with_jitter(self):
        clock = FakeClock()
        opener = FakeOpener(
            [
                FakeResponse(body=b"%PDF-one"),
                FakeResponse(body=b"%PDF-two"),
            ]
        )
        requester = PoliteRequester(
            opener=opener,
            monotonic=clock.monotonic,
            sleep=clock.sleep,
            random_value=lambda: 0.4,
            jitter_seconds=0.25,
        )
        requester.get_pdf("https://example.test/one.pdf")
        requester.get_pdf("https://example.test/two.pdf")
        self.assertAlmostEqual(clock.sleeps[-1], 1.6)
        request = opener.requests[0][0]
        self.assertIn("Fika-Timetable-Verifier", request.get_header("User-agent"))
        self.assertEqual(request.get_header("Cache-control"), "no-cache, no-store")
        self.assertIsNone(request.get_header("If-none-match"))

    def test_retry_after_is_honored(self):
        clock = FakeClock()
        error = HTTPError(
            "https://example.test/a",
            429,
            "busy",
            {"Retry-After": "4"},
            io.BytesIO(b""),
        )
        opener = FakeOpener([error, FakeResponse()])
        requester = PoliteRequester(
            opener=opener,
            retries=2,
            monotonic=clock.monotonic,
            sleep=clock.sleep,
            jitter_seconds=0,
        )
        requester.get("https://example.test/a")
        self.assertGreaterEqual(sum(clock.sleeps), 4.0)

    def test_pdf_size_is_bounded_before_storage(self):
        opener = FakeOpener(
            [
                FakeResponse(
                    body=b"%PDF-small",
                    headers={"Content-Length": str(MAX_PDF_BYTES + 1)},
                )
            ]
        )
        requester = PoliteRequester(opener=opener)
        with self.assertRaises(RequestFailure):
            requester.get_pdf("https://example.test/huge.pdf")


if __name__ == "__main__":
    unittest.main()
