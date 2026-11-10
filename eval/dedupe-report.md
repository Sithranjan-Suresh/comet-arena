# Dedupe eval report

Generated 2026-11-10: 15 duplicate pairs and 30 non-duplicate pairs.

> **Mock run.** Similarity comes from the hash-based test embedder, not a real model. Re-run with `SOURCES_MODE=live` before changing thresholds.

## Current thresholds

Merge at 0.92, human review from 0.8, plus a same-title-and-host promotion from review to merge.

| Human label | Merged | Sent to review | Treated as new |
|---|---:|---:|---:|
| Duplicate | 5 | 5 | 5 |
| Different events | 0 | 6 | 24 |

**False merges: 0.** (Must be 0: a wrong merge hides a real competition.)  **Missed duplicates (shown twice): 5.**

## Threshold sweep

A pair counts as a duplicate when similarity is at or above the threshold.

| Threshold | Caught | False positives | Missed | Precision | Recall |
|---:|---:|---:|---:|---:|---:|
| 0.60 | 15 | 22 | 0 | 41% | 100% |
| 0.62 | 15 | 20 | 0 | 43% | 100% |
| 0.64 | 15 | 19 | 0 | 44% | 100% |
| 0.66 | 15 | 16 | 0 | 48% | 100% |
| 0.68 | 15 | 14 | 0 | 52% | 100% |
| 0.70 | 13 | 12 | 2 | 52% | 87% |
| 0.72 | 13 | 12 | 2 | 52% | 87% |
| 0.74 | 11 | 9 | 4 | 55% | 73% |
| 0.76 | 10 | 8 | 5 | 56% | 67% |
| 0.78 | 10 | 7 | 5 | 59% | 67% |
| 0.80 | 10 | 6 | 5 | 63% | 67% |
| 0.82 | 10 | 3 | 5 | 77% | 67% |
| 0.84 | 7 | 1 | 8 | 88% | 47% |
| 0.86 | 5 | 1 | 10 | 83% | 33% |
| 0.88 | 3 | 0 | 12 | 100% | 20% |
| 0.90 | 3 | 0 | 12 | 100% | 20% |
| 0.92 | 3 | 0 | 12 | 100% | 20% |
| 0.94 | 2 | 0 | 13 | 100% | 13% |
| 0.96 | 1 | 0 | 14 | 100% | 7% |
| 0.98 | 0 | 0 | 15 | n/a | 0% |

## Recommendation

- Merge threshold: **0.88** (lowest value with zero false merges). Currently 0.92.
- Review threshold: **0.68** (highest value that still catches 95% of duplicates). Currently 0.8.

## Pairs production gets wrong (5)

- `d01` (duplicate treated as new), similarity 0.728: "AIS Fall Case Competition" vs "Fall Case Competition" (host acronym vs full name)
- `d04` (duplicate treated as new), similarity 0.732: "Startup Pitch Night" vs "Pitch Night: Startup Edition" (reworded title and host)
- `d06` (duplicate treated as new), similarity 0.688: "Three Minute Thesis" vs "3 Minute Thesis (3MT) Competition" (3MT spelling)
- `d11` (duplicate treated as new), similarity 0.752: "Comet Cup Esports Tournament" vs "Comet Cup" (short form)
- `d13` (duplicate treated as new), similarity 0.684: "Robotics Challenge" vs "IEEE Robotics Challenge" (date off by a day)
