"""Exposure module: calculates inhaled particulate dose in micrograms (ug)."""
from __future__ import annotations
import json
import os
from typing import Any, Dict, List

# Load configuration assumptions
_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "model_config.json")
try:
    with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
        MODEL_CONFIG = json.load(f)
except Exception:
    MODEL_CONFIG = {
        "breathing_rate_lpm": {
            "running": 40.0,
            "walking": 20.0,
            "cycling": 30.0,
            "sports": 35.0,
        },
        "mask_factor": 0.67,
        "heat_threshold_c": 35.0,
        "heat_penalty_per_c": 0.02,
        "profile_weight": {
            "adult": 1.0,
            "child": 1.2,
            "sensitive": 1.5,
        },
    }


def get_breathing_rate(activity: str) -> float:
    """Return ventilation rate in Liters/minute for the activity.
    
    TODO / VERIFY AND CITE before submission: Values from Adams (1993) / EPA guidelines.
    """
    act_key = activity.lower().strip()
    rates = MODEL_CONFIG.get("breathing_rate_lpm", {})
    return float(rates.get(act_key, 25.0))


def get_mask_factor() -> float:
    """Return penetration fraction for consumer mask (e.g. 0.67 = 33% reduction).
    
    TODO / VERIFY AND CITE before submission: Mask penetration factor assumption.
    """
    return float(MODEL_CONFIG.get("mask_factor", 0.67))


def get_profile_weight(profile: str | None) -> float:
    """Return susceptibility multiplier for exposure score (affects exposure_score only, not dose)."""
    if not profile:
        return 1.0
    weights = MODEL_CONFIG.get("profile_weight", {})
    return float(weights.get(profile.lower().strip(), 1.0))


def compute_step_dose_ug(
    pm25: float,
    breathing_rate_lpm: float,
    mask: bool = False,
    mask_factor: float | None = None,
) -> float:
    """Compute inhaled PM2.5 dose in micrograms for a single 15-minute step."""
    effective_pm25 = float(pm25)
    if mask:
        mf = mask_factor if mask_factor is not None else get_mask_factor()
        effective_pm25 *= mf
    
    # 15 minutes of breathing at breathing_rate_lpm Liters/min:
    # volume in m3 = (breathing_rate_lpm / 1000.0) * 15.0
    # dose in ug = effective_pm25 (ug/m3) * volume (m3)
    step_dose = effective_pm25 * (breathing_rate_lpm / 1000.0) * 15.0
    return step_dose


def compute_dose_ug(
    step_pm25_values: List[float],
    activity: str,
    mask: bool = False,
    breathing_rate_override: float | None = None,
) -> float:
    """Compute total inhaled PM2.5 dose (ug) across a sequence of 15-minute step values."""
    if not step_pm25_values:
        return 0.0

    rate = breathing_rate_override if breathing_rate_override is not None else get_breathing_rate(activity)
    total_dose = sum(compute_step_dose_ug(p, rate, mask=mask) for p in step_pm25_values)
    return round(total_dose, 1)
