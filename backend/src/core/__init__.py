"""AirWindow Core Package: pure Python, zero AWS dependencies, unit-testable."""
from .series import build_time_series, classify_cpcb
from .exposure import compute_dose_ug
from .optimizer import optimize_schedule
from .correction import correct
from .confidence import evaluate_confidence
from .guard import verify_agent_answer

__all__ = [
    "build_time_series",
    "classify_cpcb",
    "compute_dose_ug",
    "optimize_schedule",
    "correct",
    "evaluate_confidence",
    "verify_agent_answer",
]
