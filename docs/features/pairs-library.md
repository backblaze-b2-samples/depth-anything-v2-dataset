<!-- last_verified: 2026-07-21 -->
# Feature: Pairs Library

## Purpose
A gallery of source→depth-preview pairs across all jobs, scoped to the sample's own
`depth/` output prefix — the training-ready dataset, browsable in one place. Distinct
from the full-bucket `/files` explorer.

## Used By
- UI: `/library` page
- API: `GET /library/pairs`

## Core Functions
- `apps/web/src/components/library/pairs-library.tsx` — gallery + states
- `apps/web/src/components/jobs/pairs-grid.tsx` — shared pair rendering (source + depth preview)
- `apps/web/src/lib/queries.ts` — `useLibraryPairs()`
- `services/api/app/runtime/jobs.py` — `GET /library/pairs` handler
- `services/api/app/service/jobs.py` — `get_library_pairs()` (aggregates per-job manifests)
- `services/api/app/repo/jobs.py` — `read_manifest()`, `presign()`

## Canonical Files
- Gallery: `apps/web/src/components/library/pairs-library.tsx`
- Aggregation: `services/api/app/service/jobs.py` (`get_library_pairs`)

## Inputs
- limit: query param (1–500, default 200)

## Outputs
- `DepthPair[]` — each with `image_url` and `preview_url` presigned for inline rendering,
  plus dimensions and byte sizes

## Flow
- `get_library_pairs()` lists jobs, reads each `depth/<id>/manifest.jsonl`, and builds
  `DepthPair`s with presigned URLs for the source image and its 8-bit colorized preview
- The grid renders both images via `next/image` (`unoptimized`, since presigned URLs
  carry their own short expiry) — the depth side shows the browser-renderable preview,
  never the raw 16-bit artifact

## Edge Cases
- No completed runs → empty state with a link to Depth Jobs
- A manifest missing/empty → that job contributes no pairs
- `limit` out of range → `400`

## UX States
- Loading: skeleton grid
- Empty: "No pairs yet" + CTA
- Loaded: responsive grid of source/depth pairs

## Verification
- Test files: `services/api/tests/test_jobs.py` (`test_run_job_writes_artifacts_and_pairs`
  exercises pair building + presigned URLs)
- Required cases: pairs built from manifest with presigned URLs, empty state
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green; media renders via presigned URLs in the browser

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Depth Jobs](depth-jobs.md)
- [File Browser](file-browser.md)
