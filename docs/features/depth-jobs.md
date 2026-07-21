<!-- last_verified: 2026-07-21 -->
# Feature: Depth Jobs

## Purpose
The primary entity: configure, run, and track a batch depth run over a scene prefix,
writing co-located depth artifacts + a `manifest.jsonl` index back to B2.

## Used By
- UI: `/jobs` (list + New job), `/jobs/[id]` (detail: status, stats, Run/Edit/Delete, pairs grid)
- API: `POST /jobs`, `GET /jobs`, `GET /jobs/{id}`, `PATCH /jobs/{id}`,
  `DELETE /jobs/{id}`, `POST /jobs/{id}/run`, `GET /jobs/{id}/pairs`,
  `GET /jobs/stats`, `GET /jobs/source-prefixes`

## Core Functions
- `services/api/app/types/jobs.py` — `DepthJob`, `DepthPair`, `DepthDatasetStats`, request models
- `services/api/app/repo/jobs.py` — B2 persistence (records + manifest + artifacts, prefix-scoped delete)
- `services/api/app/service/jobs.py` — create / run / rename / delete / read + stats orchestration
- `services/api/app/runtime/jobs.py` — routes (business logic stays out of handlers)
- `apps/web/src/components/jobs/*` — create dialog, table, detail, rename/delete dialogs, pairs grid
- `apps/web/src/lib/queries.ts` — `useJobs`, `useJob`, `useCreateJob`, `useRenameJob`, `useDeleteJob`, `useRunJob`, `useJobPairs`

## Canonical Files
- Orchestration: `services/api/app/service/jobs.py`
- Create form (Form UX exemplar): `apps/web/src/components/jobs/create-job-dialog.tsx`

## Inputs
- Create: `{ name, source_prefix, model (small|base|large), output_format (png16|npy|both) }`
- Rename: `{ name }`
- Run: job id (path)

## Outputs
- `DepthJob` record at `depth-jobs/<id>.json`
- Per-image artifacts under `depth/<id>/` + `manifest.jsonl`
- `DepthPair[]` (with presigned URLs) for the detail pairs grid

## Lifecycle (all five verbs built — none omitted)
| Verb | UI | Behavior |
|------|----|----------|
| Create | `/jobs` New-job dialog | Writes a `pending` record to B2 |
| Read | `/jobs` + `/jobs/[id]` | Table + detail (status, stats, pairs grid) |
| Edit (rename) | `/jobs/[id]` dialog | Rewrites the job's display name in B2 |
| Delete | `/jobs/[id]` confirm dialog | Deletes artifacts + manifest + record, prefix-scoped |
| Run | `/jobs/[id]` button | Runs Depth Anything V2 synchronously, capped at `DEPTH_MAX_IMAGES_PER_RUN` |

## Flow (run)
- List source images under `source_prefix` (excludes the app's own output prefixes)
- Cap to `DEPTH_MAX_IMAGES_PER_RUN`; mark job `running`
- For each image: get bytes → estimate depth → encode artifacts → `put_object`
- Write `manifest.jsonl`; flip status to `completed` (or `failed`, recording the error)

## Edge Cases
- No source images under the prefix → `409` "No source images found"
- Running a `completed` job → `409` "Job already completed"
- Missing job id → `404`
- A per-image failure mid-run → status `failed`, error surfaced inline; already-processed
  images are still written to the manifest
- Delete is scoped to `depth/<id>/` and `depth-jobs/<id>.json` only — never other data

## UX States
- List: loading skeleton / empty / table
- Detail: loading / error / configuration + stats + pairs grid (empty until a run)

## Verification
- Test files: `services/api/tests/test_jobs.py`
- Required cases: create resolves model id, get-missing raises, rename, delete,
  run-no-sources raises, run writes artifacts + manifest + pairs, dataset-stats amplification
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Depth Estimation](depth-estimation.md)
- [Pairs Library](pairs-library.md)
- [App Workflows](../app-workflows.md)
