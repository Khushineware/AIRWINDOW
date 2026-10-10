"""Test guard against hallucinated and unverified numbers in agent outputs."""
import unittest
from backend.src.core.guard import verify_agent_answer


class TestGuard(unittest.TestCase):
    def test_guard_rejects_invented_number(self):
        plan_data = {
            "best": {"label": "1:30 – 2:15 PM", "dose_ug": 52.4, "temp_c": 31.8, "reduction_pct": 46},
            "inputs": {"duration_min": 45, "activity": "running"},
            "location": {"name": "Rohini"},
        }

        bad_answer = "You should go at 1:30 PM because pollution drops by 999 ug and you save 84 percent."
        valid, unverified = verify_agent_answer(bad_answer, plan_data)

        self.assertFalse(valid)
        self.assertTrue("999" in unverified or "84" in unverified)

    def test_guard_accepts_cited_and_rounded_numbers(self):
        plan_data = {
            "best": {"label": "1:30 – 2:15 PM", "dose_ug": 52.4, "temp_c": 31.8, "reduction_pct": 46},
            "baseline": {"label": "your usual time", "dose_ug": 97.2},
            "inputs": {"duration_min": 45, "activity": "running"},
        }

        good_answer = "The cleanest time is 1:30 – 2:15 PM with 52.4 ug dose and 46 percent reduction."
        valid, unverified = verify_agent_answer(good_answer, plan_data)

        self.assertTrue(valid)
        self.assertEqual(len(unverified), 0)


if __name__ == "__main__":
    unittest.main()
