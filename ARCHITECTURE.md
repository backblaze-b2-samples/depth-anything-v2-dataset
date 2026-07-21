<!-- last_verified: 2026-07-15 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Dashboard (depth dataset metrics: jobs, images processed, storage split + amplification)
  - Depth Jobs — the primary entity, full lifecycle (create/read/edit/delete/run)
  - Pairs Library — scoped source→depth-preview gallery
  - Image ingest (drag-and-drop) + full-bucket File browser
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for depth jobs, image ingest, listing, deletion
  - B2 S3 integration via boto3 (repo layer only)
  - Depth Anything V2 inference (local, lazy-imported torch/transformers)
  - Health check endpoint with B2 connectivity verification
  - Structured JSON logging with request tracing + Prometheus-format metrics
- **packages/shared/** — TypeScript type definitions
  - Mirrors Pydantic models from the API (incl. DepthJob / DepthPair / DepthDatasetStats)
  - Consumed by `apps/web/` as workspace dependency

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (files, upload, stats, jobs)
    config/                Settings loaded from environment
    repo/                  B2 S3 client (b2_client.py) + job persistence (jobs.py)
    service/               Business logic: upload, files, metadata,
                           depth.py (Depth Anything V2 — lazy torch/transformers),
                           encode.py (16-bit PNG / .npy / colorized preview),
                           jobs.py (create/run/rename/delete/read + stats)
    runtime/               FastAPI route handlers (files, upload, jobs, health, metrics)
  tests/                   pytest tests (structural + integration; test_jobs.py is hermetic)
```

**ML import invariant:** `torch`/`transformers` are imported lazily INSIDE functions in
`service/depth.py` so importing the app (and collecting the hermetic unit tests) never
loads heavy ML or triggers a model download. `boto3` stays in `repo/` only. `numpy`/`PIL`
(used by `service/encode.py`) are lightweight and imported normally.

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repo
  - See `infra/railway/README.md` for configuration

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API). No application database — B2 is
  the sole data store. Layout:
  - Source images: `<scene_prefix>/...` (e.g. `demo-scene/img001.png`, `uploads/...`)
  - Depth artifacts per job: `depth/<job_id>/<name>.depth.png` (16-bit),
    optional `.depth.npy`, and `<name>.depth_preview.png` (8-bit colorized, browser-renderable)
  - Manifest per job: `depth/<job_id>/manifest.jsonl` — one line per image
    (`image_key`, `depth_key`, `preview_key`, `width`, `height`, `source_bytes`, `depth_bytes`)
  - Job record: `depth-jobs/<job_id>.json` — the `DepthJob` model
  - Depth artifacts live under a parallel `depth/<id>/` prefix (not interleaved with
    sources) so a re-run never ingests its own output; the manifest is the pairing index.

## Device Selection (local inference)

`service/depth.py::select_device()` defaults to CPU and auto-detects the first available
of **CUDA → Apple MPS → CPU**, always falling back to CPU (never hard-requires a GPU).
`DEPTH_DEVICE` (`auto|cpu|cuda|mps`) overrides. If an MPS op errors at run time,
`estimate_depth()` retries on CPU.

## External Services

- **Backblaze B2 S3 API** — object storage, retrieval, deletion, presigned URLs
- **HuggingFace Hub** — one-time model weight download on the first depth run (no token)

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs (download: forced attachment; pairs/library media:
  inline, so `<img>` renders the colorized preview directly)

## Data Flows

- **Ingest**: Browser -> `POST /upload` (multipart) -> API validates (images only) -> repo writes to B2 -> response
- **Create job**: Browser -> `POST /jobs` -> service builds a `pending` `DepthJob` -> repo writes `depth-jobs/<id>.json`
- **Run job**: Browser -> `POST /jobs/{id}/run` -> service lists source images (repo) -> for each: get bytes (repo) -> `service/depth.estimate_depth` (local inference) -> `service/encode` -> `put_object` artifacts (repo) -> write `manifest.jsonl` -> flip status
- **Serve pairs**: Browser -> `GET /jobs/{id}/pairs` or `GET /library/pairs` -> service reads manifest(s) (repo) -> repo presigns source + preview URLs -> grid renders media inline
- **Delete job**: Browser -> `DELETE /jobs/{id}` -> service -> repo deletes `depth/<id>/*` + record (prefix-scoped)
- **Dashboard**: Browser -> `GET /jobs/stats` -> service aggregates job records (repo)

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## Canonical Files

- Primary-entity router: `services/api/app/runtime/jobs.py`
- Depth orchestration: `services/api/app/service/jobs.py`
- Local inference (lazy ML imports): `services/api/app/service/depth.py`
- Artifact encoding: `services/api/app/service/encode.py`
- Job persistence (repo layer): `services/api/app/repo/jobs.py`
- B2 S3 client (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`files.py`, `upload.py`, `stats.py`, `jobs.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Depth Jobs](docs/features/depth-jobs.md)
- [Depth Estimation](docs/features/depth-estimation.md)
- [Pairs Library](docs/features/pairs-library.md)
- [Image Ingest](docs/features/file-upload.md)
- [File Browser](docs/features/file-browser.md)
- [Dashboard](docs/features/dashboard.md)
- [Metadata Extraction](docs/features/metadata-extraction.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
