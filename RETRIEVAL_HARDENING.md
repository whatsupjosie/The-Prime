# PEQ Retrieval Hardening

This revision adds a fast, provenance-aware evidence retrieval layer without turning retrieval into a diagnostic or truth oracle.

## Guarantees

- Scientific source records, datasets, instruments/frameworks, interventions, and non-diagnostic working patterns are indexed.
- Candidate retrieval uses a pre-built token index, then relevance/authority/recency scoring.
- Source-family diversification reduces repeated dependence on one evidence family.
- Primary results retain provenance, limitations, role, and automation status.
- Secondary alternatives are retained so the system does not collapse the evidence base to one answer.
- Uncovered query terms are explicitly surfaced; absence from the registry is not treated as negative evidence.
- Working-pattern ranking returns only patterns with actual positive sign overlap. Zero-match padding is prohibited.
- Retrieval is exposed to PEQ audits but is not silently converted into emotional-state evidence merely because a keyword matched.

## Benchmark

On the curated v0.1 registry, retrieval is sub-millisecond for representative queries in-process. The registry is small enough that this is not yet a scaling benchmark; the index is designed so the retrieval contract can move to a larger persistent store without changing callers.

## Remaining limitation

The current ranker is lexical/metadata retrieval, not a semantic embedding or learned ranking system. That is intentional for now: it is deterministic, auditable, fast, and difficult to hide a semantic hallucination inside. A future semantic reranker should sit after this candidate stage and must preserve the same provenance and alternative-result contracts.
