"""Test optimizer search, constraints, heat penalties, and non-negative reduction percentage."""
import unittest
from backend.src.core.optimizer import optimize_schedule, NoFeasibleSlotError
from backend.src.core.series import build_time_series


def create_synthetic_series():
    times = [f"2026-10-09T{h:02d}:00:00" for h in range(24)]
    pm25s = [
        150.0, 160.0, 170.0, 180.0, 150.0, 120.0,
        90.0, 70.0, 50.0, 40.0, 35.0, 30.0,
        30.0, 30.0, 35.0, 50.0, 80.0, 110.0,
        140.0, 160.0, 170.0, 180.0, 175.0, 160.0
    ]
    temps = [25.0] * 24
    return build_time_series(times, pm25s, temps)


class TestOptimizer(unittest.TestCase):
    def test_optimizer_returns_minimum_dose_slot_and_respects_window(self):
        series = create_synthetic_series()
        res = optimize_schedule(
            series=series,
            activity="running",
            duration_min=30,
            window_start="2026-10-09T06:00:00",
            window_end="2026-10-09T20:00:00",
        )

        best = res["best"]
        self.assertTrue("11:" in best["start"] or "12:" in best["start"] or "13:" in best["start"])
        self.assertGreater(res["candidates_count"], 0)
        self.assertLess(best["dose_ug"], 100.0)

    def test_heat_penalty_changes_ranking(self):
        times = [f"2026-10-09T{h:02d}:00:00" for h in range(8, 16)]
        pm25s = [40.0] * len(times)
        temps = [28.0, 28.0, 28.0, 28.0, 28.0, 42.0, 42.0, 30.0]
        series = build_time_series(times, pm25s, temps)

        res = optimize_schedule(
            series=series,
            activity="running",
            duration_min=30,
            window_start="2026-10-09T08:00:00",
            window_end="2026-10-09T15:00:00",
        )

        self.assertNotIn("13:00", res["best"]["start"])
        self.assertLessEqual(res["best"]["temp_c"], 35.0)

    def test_reduction_pct_never_negative(self):
        series = create_synthetic_series()
        res = optimize_schedule(
            series=series,
            activity="running",
            duration_min=45,
            window_start="2026-10-09T05:00:00",
            window_end="2026-10-09T22:00:00",
            usual_time="13:00",
        )
        self.assertGreaterEqual(res["best"]["reduction_pct"], 0)

    def test_no_feasible_slot_raises_error(self):
        series = create_synthetic_series()
        with self.assertRaises(NoFeasibleSlotError):
            optimize_schedule(
                series=series,
                activity="running",
                duration_min=60,
                window_start="2026-10-09T10:00:00",
                window_end="2026-10-09T10:15:00",
            )


if __name__ == "__main__":
    unittest.main()
