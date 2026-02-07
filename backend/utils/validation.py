"""Validation utilities for user inputs."""

from typing import List, Tuple


def validate_clause_text(text: str) -> Tuple[bool, str]:
    """Validate a single clause text input."""
    if not text:
        return False, "Clause cannot be empty"
    if not text.strip():
        return False, "Clause cannot be only whitespace"
    return True, ""


def validate_clauses(clauses_list: List[str]) -> Tuple[bool, str]:
    """Validate a list of clauses."""
    if not clauses_list:
        return False, "At least one clause is required"

    non_empty_clauses = [c for c in clauses_list if c and c.strip()]
    if len(non_empty_clauses) == 0:
        return False, "At least one non-empty clause is required"

    for idx, clause in enumerate(non_empty_clauses):
        is_valid, error_msg = validate_clause_text(clause)
        if not is_valid:
            return False, f"Clause {idx + 1}: {error_msg}"

    return True, ""

