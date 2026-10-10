"""Test API request input validations and territorial coverage boundaries."""
import json
import unittest
from backend.src.handlers.api import handler
from backend.src.services.open_meteo import is_within_india


class TestApiValidation(unittest.TestCase):
    def test_coverage_bounding_box(self):
        # Delhi: 28.71 N, 77.11 E -> inside
        self.assertTrue(is_within_india(28.71, 77.11))

        # Bengaluru: 12.97 N, 77.59 E -> inside
        self.assertTrue(is_within_india(12.97, 77.59))

        # London: 51.5 N, -0.12 W -> outside
        self.assertFalse(is_within_india(51.5, -0.12))

        # Tokyo: 35.6 N, 139.6 E -> outside
        self.assertFalse(is_within_india(35.6, 139.6))

    def test_api_handler_rejects_outside_coverage(self):
        event = {
            "rawPath": "/plan",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({
                "location": {"name": "London", "lat": 51.5, "lon": -0.12},
                "activity": "running",
                "duration_min": 30,
            }),
        }
        resp = handler(event)
        self.assertEqual(resp["statusCode"], 400)
        body = json.loads(resp["body"])
        self.assertEqual(body["error"]["code"], "OUTSIDE_COVERAGE")

    def test_api_handler_validates_duration_bounds(self):
        # Invalid duration: 5 minutes (< 15)
        event_low = {
            "rawPath": "/plan",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({
                "location": {"name": "Delhi", "lat": 28.7, "lon": 77.1},
                "activity": "running",
                "duration_min": 5,
            }),
        }
        resp_low = handler(event_low)
        self.assertEqual(resp_low["statusCode"], 400)
        body_low = json.loads(resp_low["body"])
        self.assertEqual(body_low["error"]["code"], "INVALID_INPUT")

        # Invalid duration: 180 minutes (> 120)
        event_high = {
            "rawPath": "/plan",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({
                "location": {"name": "Delhi", "lat": 28.7, "lon": 77.1},
                "activity": "running",
                "duration_min": 180,
            }),
        }
        resp_high = handler(event_high)
        self.assertEqual(resp_high["statusCode"], 400)


if __name__ == "__main__":
    unittest.main()
