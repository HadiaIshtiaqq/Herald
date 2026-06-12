# Data Engineering Guide — Herald Knowledge Base
*Foundry IQ-pattern knowledge source · Synthetic data only*

## Purpose
This guide covers the data platform concepts required for the data-layer area, aligned to DP-203 and DP-900 certification objectives.

## Schema migrations without data loss (DP-203)
Schema changes on a live database must be backward compatible for at least one deployment cycle: add the new column, dual-write, backfill, switch reads, then drop the old column. A destructive migration (dropping or renaming a column in one step) breaks any instance still running the previous code version during a rolling deploy. Every migration needs a tested down-migration or a point-in-time restore plan before it runs in production.

## Data pipeline orchestration (DP-203)
Pipelines should be idempotent: re-running a failed window must produce the same result as a single successful run, which rules out blind appends. Watermarking tracks the boundary of processed data so incremental loads pick up exactly where the last run finished. Failures should dead-letter the bad records and continue, rather than halting the whole pipeline on one malformed row.

## Storage tiers and partitioning (DP-203, DP-900)
Azure Data Lake storage is organized into hot, cool, and archive tiers; data accessed by daily jobs belongs in hot, compliance archives in archive tier where retrieval takes hours. Partitioning by date is the default for event data because most queries filter on a time range, turning full scans into partition reads. Small-file proliferation degrades query performance — compaction jobs should merge files toward the optimal size for the query engine.

## SQL performance fundamentals (DP-203)
An index speeds up reads at the cost of write amplification, so index what the query plans actually use — not every column that appears in a WHERE clause. Parameterized queries are mandatory: they prevent SQL injection and allow plan reuse. The query optimizer's estimates degrade when table statistics are stale; slow queries after a large data load are often fixed by updating statistics, not by adding indexes.

## Relational vs non-relational choices (DP-900)
Relational stores fit data with fixed structure and transactional integrity requirements; document stores fit flexible, denormalized aggregates read as a unit. Choosing by familiarity rather than access pattern is the most common data architecture mistake. Azure offers both behind the same resource model: Azure SQL for relational, Cosmos DB for document, key-value, and graph workloads.

## Data protection and compliance (DP-203)
Personally identifiable information should be classified at ingestion and masked or tokenized before it reaches analytical stores. Backups must be tested by restoring them — an unverified backup is a wish. Access to production data follows the same least-privilege RBAC discipline as infrastructure: analysts query curated, de-identified layers, not raw operational tables.

## Study guidance for data-layer contributors
DP-900 is the recommended on-ramp for contributors new to the data platform; DP-203 is mandatory before owning schema migrations or pipeline changes. The team's bar is a 75% practice score on grounded assessments plus a reviewed migration executed in staging.
