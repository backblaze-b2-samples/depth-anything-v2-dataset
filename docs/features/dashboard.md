<!-- last_verified: 2026-07-21 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance view of the depth dataset: jobs, images processed, depth maps
stored, and the source-vs-depth storage split (the write-amplification story).

## Used By
- UI: `/` page (dashboard home)
- API: `GET /jobs/stats`, `GET /jobs`

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — 4 stat cards
- `apps/web/src/components/dashboard/storage-chart.tsx` — stacked source-vs-depth bytes per job
- `apps/web/src/components/dashboard/recent-jobs-table.tsx` — last 5 jobs
- `apps/web/src/lib/queries.ts` — `useDatasetStats()`, `useJobs()`
- `services/api/app/runtime/jobs.py` — `GET /jobs/stats` handler
- `services/api/app/service/jobs.py` — `get_dataset_stats()` business logic
- `services/api/app/repo/jobs.py` — job-record aggregation over B2

## Canonical Files
- Dashboard aggregation: `services/api/app/service/jobs.py` (`get_dataset_stats`)
- Chart pattern: `apps/web/src/components/dashboard/storage-chart.tsx`

## Inputs
- None (dashboard loads data automatically via TanStack Query)

## Outputs
- `GET /jobs/stats` → `DepthDatasetStats` (total_jobs, images_processed,
  depth_maps_stored, source_bytes, depth_bytes, total_bytes, humanized variants,
  amplification_ratio)
- `GET /jobs` → `DepthJob[]` for the chart and recent-jobs table

## Flow
- Page loads → `useDatasetStats()` + `useJobs()` fire in parallel
- Stat cards show job/image/depth-map counts and total storage with the source vs
  depth split + amplification ratio
- Storage chart renders one stacked bar per job (source bytes + depth bytes)
- Recent-jobs table shows the 5 newest jobs with status and image counts

## Edge Cases
- API unavailable → inline error state with retry
- No jobs / no completed runs → empty chart + empty table messages
- Amplification ratio is 0 when no source bytes have been recorded yet

## UX States
- Loading: skeleton placeholders for cards, chart, and table
- Empty: "No depth data yet" / "No jobs yet"
- Loaded: populated cards, chart, table

## Verification
- Test files: `services/api/tests/test_jobs.py` (`test_dataset_stats_amplification`)
- Required cases: stats with jobs (amplification), empty state
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Depth Jobs](depth-jobs.md)
- [App Workflows](../app-workflows.md)
