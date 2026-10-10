"""Guard module: ensures LLM hallucination prevention by validating all numbers against source data."""
from __future__ import annotations
import re
from typing import Any, Dict, List, Set, Tuple


def _extract_numbers_from_structure(data: Any, found: Set[float], found_str: Set[str]) -> None:
    """Recursively collect numeric floats and strings from a nested dictionary/list."""
    if isinstance(data, (int, float)):
        val = float(data)
        found.add(round(val, 2))
        found.add(round(val, 1))
        found.add(round(val, 0))
        found_str.add(str(int(round(val))))
        found_str.add(str(round(val, 1)))
    elif isinstance(data, str):
        # Extract numbers like 12, 12.5, times like 1:30 -> 1, 30
        for match in re.finditer(r"\b(\d+(?:\.\d+)?)\b", data):
            try:
                num_s = match.group(1)
                found_str.add(num_s)
                num_f = float(num_s)
                found.add(round(num_f, 2))
                found.add(round(num_f, 1))
                found.add(round(num_f, 0))
            except ValueError:
                pass
    elif isinstance(data, dict):
        for v in data.values():
            _extract_numbers_from_structure(v, found, found_str)
    elif isinstance(data, (list, tuple, set)):
        for item in data:
            _extract_numbers_from_structure(item, found, found_str)


def extract_numbers_from_text(text: str) -> List[Tuple[str, float]]:
    """Extract all numbers from text along with their float representations."""
    results = []
    # Match numbers, ignoring dates like 2026 if needed, but capturing all decimals and integers
    matches = re.finditer(r"\b(\d+(?:\.\d+)?)\b", text)
    for m in matches:
        s = m.group(1)
        try:
            val = float(s)
            results.append((s, val))
        except ValueError:
            pass
    return results


def verify_agent_answer(
    answer: str,
    plan_json: Dict[str, Any],
    tool_outputs: List[Dict[str, Any]] | None = None,
) -> Tuple[bool, List[str]]:
    """Verify that every number cited in the agent's answer appears in the plan or tool outputs.
    
    Returns:
        (is_valid, list_of_unverified_numbers)
    """
    if not answer or not answer.strip():
        return True, []

    allowed_floats: Set[float] = set()
    allowed_strings: Set[str] = set()

    # Collect numbers from plan_json
    _extract_numbers_from_structure(plan_json, allowed_floats, allowed_strings)

    # Collect numbers from tool_outputs
    if tool_outputs:
        for tool_out in tool_outputs:
            _extract_numbers_from_structure(tool_out, allowed_floats, allowed_strings)

    # Extract all numbers from the generated answer
    answer_numbers = extract_numbers_from_text(answer)
    unverified: List[str] = []

    for num_str, num_val in answer_numbers:
        # Check string match
        if num_str in allowed_strings:
            continue

        # Check rounded float matches
        is_matched = False
        for tolerance in [0.0, 0.5, 1.0]:
            # Exact or rounded
            if round(num_val, 1) in allowed_floats or round(num_val, 0) in allowed_floats:
                is_matched = True
                break
            # Close float match
            for allowed_f in allowed_floats:
                if abs(num_val - allowed_f) <= tolerance:
                    is_matched = True
                    break
            if is_matched:
                break

        if not is_matched:
            unverified.append(num_str)

    is_valid = len(unverified) == 0
    return is_valid, unverified
