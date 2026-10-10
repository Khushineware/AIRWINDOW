"""Test exposure calculation properties."""
import unittest
from backend.src.core.exposure import compute_dose_ug, get_mask_factor


class TestExposure(unittest.TestCase):
    def test_exposure_scales_with_duration_and_breathing_rate(self):
        # 15 minutes of 100 ug/m3 PM2.5 at 20 L/min (walking)
        # Vol in m3 = (20 / 1000) * 15 = 0.3 m3
        # Dose = 100 * 0.3 = 30 ug
        dose_15m_walk = compute_dose_ug([100.0], activity="walking", mask=False)
        self.assertEqual(dose_15m_walk, 30.0)

        # 30 minutes (two 15-min steps) of 100 ug/m3 at 20 L/min: dose should double to 60 ug
        dose_30m_walk = compute_dose_ug([100.0, 100.0], activity="walking", mask=False)
        self.assertEqual(dose_30m_walk, 60.0)
        self.assertEqual(dose_30m_walk, 2 * dose_15m_walk)

        # Running breathing rate is 40 L/min (2x walking)
        dose_15m_run = compute_dose_ug([100.0], activity="running", mask=False)
        self.assertEqual(dose_15m_run, 60.0)
        self.assertEqual(dose_15m_run, 2 * dose_15m_walk)

    def test_mask_lowers_dose(self):
        pm25_series = [100.0, 100.0]
        dose_unmasked = compute_dose_ug(pm25_series, activity="running", mask=False)
        dose_masked = compute_dose_ug(pm25_series, activity="running", mask=True)

        mask_factor = get_mask_factor()
        self.assertLess(mask_factor, 1.0)
        self.assertLess(dose_masked, dose_unmasked)
        self.assertEqual(round(dose_masked, 1), round(dose_unmasked * mask_factor, 1))


if __name__ == "__main__":
    unittest.main()
