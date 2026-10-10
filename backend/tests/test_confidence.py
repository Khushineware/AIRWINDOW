"""Test confidence score rules and station freshness evaluations."""
import unittest
from datetime import datetime, timezone, timedelta
from backend.src.core.confidence import evaluate_confidence, evaluate_station_status


class TestConfidence(unittest.TestCase):
    def test_station_status_evaluations(self):
        now = datetime.now(timezone.utc)
        one_hour_ago = (now - timedelta(hours=1)).isoformat()
        four_hours_ago = (now - timedelta(hours=4)).isoformat()

        status_live, _ = evaluate_station_status(one_hour_ago, now)
        self.assertEqual(status_live, "LIVE")

        status_stale, _ = evaluate_station_status(four_hours_ago, now)
        self.assertEqual(status_stale, "STALE")

        status_missing, _ = evaluate_station_status(None, now)
        self.assertEqual(status_missing, "MISSING")

    def test_confidence_rules(self):
        now = datetime.now(timezone.utc)
        one_h_ago = (now - timedelta(hours=1)).isoformat()
        four_h_ago = (now - timedelta(hours=4)).isoformat()

        # Rule 1: High = >= 2 LIVE stations and correction applied
        conf_high = evaluate_confidence(
            station_summaries=[
                {"name": "S1", "last_reading": one_h_ago},
                {"name": "S2", "last_reading": one_h_ago},
            ],
            correction_applied=True,
            snapshot_age_hours=0.5,
            reference_time_iso=now.isoformat(),
        )
        self.assertEqual(conf_high["level"], "high")

        # Rule 2: Medium = 1 LIVE station
        conf_med1 = evaluate_confidence(
            station_summaries=[
                {"name": "S1", "last_reading": one_h_ago},
            ],
            correction_applied=False,
            snapshot_age_hours=0.5,
            reference_time_iso=now.isoformat(),
        )
        self.assertEqual(conf_med1["level"], "medium")

        # Rule 3: Medium = stations stale
        conf_med2 = evaluate_confidence(
            station_summaries=[
                {"name": "S1", "last_reading": four_h_ago},
            ],
            correction_applied=False,
            snapshot_age_hours=0.5,
            reference_time_iso=now.isoformat(),
        )
        self.assertEqual(conf_med2["level"], "medium")

        # Rule 4: Low = snapshot older than 3 hours
        conf_low = evaluate_confidence(
            station_summaries=[],
            correction_applied=False,
            snapshot_age_hours=4.5,
            reference_time_iso=now.isoformat(),
        )
        self.assertEqual(conf_low["level"], "low")


if __name__ == "__main__":
    unittest.main()
