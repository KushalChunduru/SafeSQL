"""Combine independent signals into a single confidence score."""
from app.models import ConfidenceBreakdown

WEIGHTS = {
    "syntax_valid": 0.15,
    "back_translation_alignment": 0.30,
    "sanity_check_pass_rate": 0.25,
    "multi_query_agreement": 0.15,
    "schema_coverage_score": 0.15,
}


def compute_confidence(
    syntax_valid: bool,
    back_translation_alignment: float,
    sanity_check_pass_rate: float,
    schema_coverage_score: float,
    multi_query_agreement: float | None = None,
) -> ConfidenceBreakdown:
    components = {
        "syntax_valid": 1.0 if syntax_valid else 0.0,
        "back_translation_alignment": back_translation_alignment,
        "sanity_check_pass_rate": sanity_check_pass_rate,
        "schema_coverage_score": schema_coverage_score,
    }

    if multi_query_agreement is not None:
        components["multi_query_agreement"] = multi_query_agreement
        weights = WEIGHTS
    else:
        # redistribute the multi-query weight proportionally when it wasn't run
        weights = {k: v for k, v in WEIGHTS.items() if k != "multi_query_agreement"}
        total = sum(weights.values())
        weights = {k: v / total for k, v in weights.items()}

    overall = sum(components[k] * weights[k] for k in components)

    return ConfidenceBreakdown(
        syntax_valid=syntax_valid,
        back_translation_alignment=back_translation_alignment,
        sanity_check_pass_rate=sanity_check_pass_rate,
        multi_query_agreement=multi_query_agreement,
        schema_coverage_score=schema_coverage_score,
        overall=round(overall, 3),
    )
