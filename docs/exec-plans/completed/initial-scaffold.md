# Build Plan — `depth-anything-v2-dataset`

Source of truth for the starter tree: `.claude/scratch/vcsk-5beed183-3b68-4608-a574-078298afde3f/`
(cloned fresh in Phase 0). All keep/trim/add deltas below are computed against that tree.

---

## 1. Purpose

`depth-anything-v2-dataset` is a B2 sample for **robotics / AR / 3D dataset teams** who need
to generate dense depth maps from large RGB image collections and keep the source images and
derived depth maps together as a training-ready dataset. A user ingests RGB images into a
Backblaze B2 bucket (organized by scene/session prefix), creates a **Depth Job** that runs
**Depth Anything V2** locally over those images, and the app writes a co-located depth artifact
(16-bit PNG and/or `.npy`) plus a browser-viewable colorized preview back to B2, indexed by a
per-job `manifest.jsonl`. Downstream training jobs read matched image+depth pairs straight from
B2 via the S3 API using the manifest as the dataset index. The headline B2 story is **write
amplification**: every ingested image yields a co-located depth map, so the dataset roughly
doubles in object count and grows substantially in bytes — B2 is the storage layer that absorbs
that growth cheaply, accessed over the S3-compatible API with a custom user-agent and standard
`B2_*` env vars. Everything heavy runs **locally on OSS** (no second API key — B2 credentials
only).

---

## 2. Architecture delta from `vibe-coding-starter-kit`

The starter kit is the ceiling. Strip what depth-dataset work doesn't need; add the depth job
surface. The layered backend (`types → config → repo → service → runtime`), the shadcn UI kit,
TanStack Query data layer, structural tests, health/metrics/rate-limit/logging middleware, and
the doc scaffolding all stay.

### KEEP (as-is or lightly re-themed)
- `apps/web/src/components/ui/**` — the entire shadcn UI kit. Never edit generated primitives.
- `apps/web/src/app/globals.css`, `/design` reference page and its components.
- **Bucket explorer (NON-NEGOTIABLE keep):** `/files` route + `apps/web/src/app/files/**` +
  `apps/web/src/components/files/**` (full-bucket browse, preview, download, delete). The Files
  sidebar entry stays.
- **Upload:** `/upload` route + `apps/web/src/app/upload/**` + `apps/web/src/components/upload/**`.
  Re-framed as "ingest source RGB images"; the Upload sidebar entry stays.
- Backend layering + middleware: `main.py` (CORS-outermost ordering, JSON logging, lifespan
  boot gate), `runtime/health.py`, `runtime/metrics.py`, `runtime/ratelimit.py`,
  `repo/counter.py`, `repo/b2_client.py` S3 primitives (rename env only — see §6).
- Structural tests (`tests/test_structure.py`), health/rate-limit/error tests, doctor preflight
  (`scripts/doctor.mjs`), CI workflow (update names only), TanStack Query layer, error/empty
  state patterns, command palette, sidebar, header (already derives title from `APP_NAME` +
  pathname — just register the new routes in its `pageTitles` map).

### TRIM (remove or narrow from starter)
- **Upload allow-list → images only.** Narrow `service/upload.py` `ALLOWED_TYPES` /
  `MIME_EXTENSION_MAP` / `matches_content_signature` to `image/jpeg`, `image/png`, `image/webp`
  (drop pdf/csv/json/zip/mp4/mp3/wav — this app ingests images). Keep the magic-byte + extension
  checks for the retained image types.
- **Metadata extraction → image-only.** In `service/metadata.py`, drop the PDF branch and the
  audio/video fields; keep hashes + image dimensions (source resolution is relevant to depth).
  Remove `PyPDF2` from `requirements.txt`. Trim `FileMetadataDetail` (both Pydantic + shared TS)
  to remove pdf_*/audio-video fields. Update the metadata feature doc accordingly (do NOT delete
  the doc — trim it, and fix any dangling references).
- **Dashboard defaults** (`apps/web/src/components/dashboard/**`) — replaced, see ADD.
- Starter marketing copy in `README.md` / `PRODUCT.md` — rewritten for this sample.

### ADD (new for `depth-anything-v2-dataset`)
- **Primary entity — Depth Job** (see §4). Backend:
  - `types/jobs.py` — `DepthJob`, `DepthPair`, `DepthDatasetStats` Pydantic models.
  - `repo/jobs.py` — B2 persistence of job records (`depth-jobs/<id>.json`) + per-job
    `manifest.jsonl` (read/write/list/delete). Uses the S3 client in `repo/b2_client.py`
    (boto3 stays repo-only). Delete is prefix-scoped to the job's own output prefix.
  - `service/depth.py` — Depth Anything V2 inference: **lazy-import** torch/transformers inside
    functions (mirrors `metadata.py`'s lazy PIL import so app import / test collection never
    loads heavy ML). Model load cached (`functools.lru_cache`); device autodetect
    CUDA → MPS → CPU (see §4 local-deployment rule); runs `pipeline("depth-estimation", ...)`,
    resizes depth back to source resolution.
  - `service/encode.py` — encode a depth array to 16-bit PNG (`Pillow` mode `I;16`), `.npy`
    (`numpy`), and an 8-bit **colorized** preview PNG (self-contained numpy colormap LUT — no
    matplotlib/opencv dep). Keep each file < 300 lines.
  - `service/jobs.py` — orchestration: create job, run job (list sources via repo → for each:
    get source bytes → infer → encode → put artifacts → append manifest line), rename, delete,
    compute dataset stats (source bytes vs depth bytes vs amplification ratio).
  - `runtime/jobs.py` — routes (see §3). Business logic stays out of the router.
- **Depth Jobs UI:** `/jobs` (list/table + "New job"), `/jobs/new` (create form) or a create
  Dialog, `/jobs/[id]` (detail: status, stats, Run/Edit/Delete, pairs grid). Sidebar entry
  "Depth Jobs".
- **Pairs Library (sample-specific scoped asset explorer, mandatory):** `/library` — a gallery
  **scoped to the sample's own `depth/` output prefix** showing source→depth-preview pairs
  across all jobs (distinct from the full-bucket `/files` explorer). Sidebar entry "Pairs
  Library". *(Note: the bucket explorer `/files` is kept in full per the non-negotiable rule;
  this scoped Library is added alongside it, not in place of it.)*
- **Adapted Dashboard:** stat cards (total jobs, images processed, depth maps stored, total
  storage with **source vs depth split + amplification ratio**); a chart of source-vs-depth
  bytes (stacked) — replaces the upload-count chart; a recent-jobs table. New aggregations flow
  through `runtime → service → repo` and are exposed via TanStack Query hooks in
  `lib/queries.ts` (no bare `useEffect + fetch`).
- **Frontend data layer:** add DepthJob/DepthPair/DepthDatasetStats to `packages/shared/src/types.ts`,
  api-client functions in `lib/api-client.ts`, and hooks in `lib/queries.ts`.
- **`scripts/seed-demo.py`** — reproducible, offline, binary-free seed: generates a handful of
  synthetic RGB images with Pillow (gradients + geometric shapes) and uploads them to a
  `demo-scene/` prefix so the app is demonstrable and later screenshot/verify steps have real
  inputs to run a Depth Job on. No binaries committed to the repo. Document a `--from-urls`
  escape hatch for using real photos.

---

## 3. B2 surface (S3-compatible only — no b2-native)

All operations go through the S3 API via boto3 in `repo/` with the custom user-agent set on the
client. No b2-native SDK anywhere.

| Operation | Used for |
|-----------|----------|
| `put_object` | write depth 16-bit PNG / `.npy` / colorized preview / `manifest.jsonl` / job record; upload (ingest) |
| `list_objects_v2` (paginated) | list source images under a scene prefix; list job records; list depth pairs (`depth/` prefix); dashboard stats |
| `get_object` | read source image bytes for inference; read manifest; read job record |
| `head_object` | source/artifact metadata |
| `delete_object` / `delete_objects` | delete a job's artifacts + record (prefix-scoped to `depth/<id>/` and `depth-jobs/<id>.json`) |
| `generate_presigned_url` | serve source images + colorized depth previews to the browser (media must actually render) |

B2 layout (B2 is the sole data store — no DB, matching the starter):
- Source images: `<scene_prefix>/...` (e.g. `demo-scene/img001.png`) — ingested via `/upload`.
- Depth artifacts per job: `depth/<job_id>/<name>.depth.png` (16-bit), optional `.depth.npy`,
  and `<name>.depth_preview.png` (8-bit colorized, browser-renderable).
- Manifest per job: `depth/<job_id>/manifest.jsonl` — one line per image:
  `{"image_key","depth_key","preview_key","width","height","source_bytes","depth_bytes"}`.
- Job record: `depth-jobs/<job_id>.json` — `DepthJob` metadata.

Writing depth artifacts under a parallel `depth/<job_id>/` prefix (not literally interleaved
with sources) prevents a re-run from ingesting its own outputs; the manifest is the index that
pairs them. This still satisfies "stored alongside in the same bucket."

---

## 4. Key features

1. **Depth estimation (Depth Anything V2) — `deployment: local`.**
   - Provider/model: **Depth Anything V2** via HuggingFace `transformers`
     `pipeline("depth-estimation")`, default checkpoint `depth-anything/Depth-Anything-V2-Small-hf`
     (Apache-2.0, public — **no HF token / no external API key**). Variant selectable
     Small/Base/Large via env + the create form.
   - `deployment: **local**` (explicit per-feature field). This is the sample's whole point and
     runs on-device, so per `api-provider-selection.md` LOCAL is the default. **Hard rule:**
     default to **CPU**, auto-detect the first available of **CUDA → Apple MPS → CPU** at
     runtime; never hard-require a GPU. `DEPTH_DEVICE` env override (`auto|cpu|cuda|mps`).
     *MPS caveat:* Depth Anything V2 (DINOv2 backbone) generally runs on MPS, but if an MPS op
     errors the code catches and falls back to CPU — note this in the feature doc.
   - Cost for one full demo run: **$0** (local inference; weights download once from HF Hub,
     ~100 MB for Small — network needed on first run only). Env var for a key: **none**.
   - No external API provider; the description does **not** mention Genblaze, so no Genblaze
     routing.
2. **Depth Jobs (primary-entity lifecycle).** Configure + run + track a batch depth run over a
   scene prefix; see the lifecycle table below.
3. **Manifest dataset index + write amplification.** Per-job `manifest.jsonl` pairs each source
   image key with its depth artifact key; dashboard surfaces source-vs-depth bytes and the
   amplification ratio — the core B2 storytelling.
4. **Pairs Library.** Scoped gallery of source→depth-preview pairs across all jobs (the
   sample-specific asset explorer).
5. **B2 ingest + bucket explorer.** Drag-and-drop image ingest and the kept full-bucket browser.

### Primary entity — **Depth Job** — lifecycle (all verbs built; none omitted)

| Verb | UI surface | Behavior |
|------|-----------|----------|
| **Create** | `/jobs/new` (or Dialog) | Form: name, source prefix, model variant, output format. Creates a `pending` job record in B2. |
| **Read** | `/jobs` list + `/jobs/[id]` | Table of jobs; detail shows status, stats, and the image→depth pairs grid (media rendered via presigned URLs). |
| **Edit** | `/jobs/[id]` (Dialog) | Rename the job's display name (rewrites the job record in B2). Always available. |
| **Delete** | `/jobs/[id]` (AlertDialog, `danger-zone` pattern) | Deletes the job's depth artifacts + manifest + record, **prefix-scoped** to `depth/<id>/` and `depth-jobs/<id>.json`. Confirm dialog. |
| **Run** | `/jobs/[id]` (button; disabled once `completed`) | Executes Depth Anything V2 over the source images synchronously (threadpool), writes artifacts + manifest, flips status to `completed`. Capped at `DEPTH_MAX_IMAGES_PER_RUN` (default 8) for a bounded demo run; note the synchronous/demo scope in docs. |

`omitted_ui_verbs`: **none** — all five verbs are user-accessible and built.

**Endpoints** (`runtime/jobs.py`): `POST /jobs` (create), `GET /jobs` (list), `GET /jobs/{id}`
(detail), `PATCH /jobs/{id}` (rename), `DELETE /jobs/{id}`, `POST /jobs/{id}/run`,
`GET /jobs/{id}/pairs` (job pairs), `GET /library/pairs` (all pairs, scoped to `depth/`),
`GET /jobs/stats` (dataset stats for the dashboard). Each new endpoint touches the three
canonical files: `runtime/jobs.py`, `lib/api-client.ts`, `lib/queries.ts`.

### Form UX conventions (create/edit forms) — exemplar: `settings-form.tsx`
- **Finite-value fields use a selector, never free text** (create AND edit):
  - `model` → `Select` (Small / Base / Large).
  - `output_format` → `RadioGroup` or `Select` (16-bit PNG / `.npy` / both).
  - `source_prefix` → `Select` populated from existing bucket prefixes (fetched from B2), with
    a free-text fallback for a new prefix.
- **Create-form safe defaults surfaced as placeholder / `FormDescription` guidance (not an
  autofill button):** model → "Small (fastest, CPU-friendly)"; output_format → "16-bit PNG";
  source_prefix hint → e.g. "demo-scene/ (run scripts/seed-demo.py to populate)". The edit form
  opens pre-filled with the real job's values.

---

## 5. Doc transforms

- **README.md** — rewrite: purpose, the 4-step workflow (ingest → run → write → serve/query),
  quick start (note first-run model download + `scripts/seed-demo.py`), standardized `B2_*` env
  table, features, local-inference/device note, commands.
- **PRODUCT.md** — rewrite users/purpose for the robotics/AR dataset audience.
- **ARCHITECTURE.md** — add `service/depth.py` + `service/encode.py` + `service/jobs.py` +
  `repo/jobs.py` + `runtime/jobs.py`; B2 layout (source / depth / manifest / job records);
  device autodetect; data flows for create/run/serve; note torch/transformers are lazy-imported
  in the service layer and boto3 stays repo-only.
- **AGENTS.md** — update repo name + package scope, commands, and the "building on this kit"
  contract references; add the lazy-ML-import invariant.
- **docs/features/** —
  - *Rewrite:* `dashboard.md` (depth dataset metrics + amplification), `file-upload.md`
    (framed as image ingest), `metadata-extraction.md` (trimmed to image-only).
  - *Keep:* `file-browser.md` (bucket explorer).
  - *Add stubs (fill from `_template.md`):* `depth-jobs.md` (primary entity + run + manifest +
    write amplification), `pairs-library.md` (scoped explorer), `depth-estimation.md`
    (Depth Anything V2, device autodetect, output formats).
- Keep `docs/exec-plans/` scaffold; this plan lands at
  `docs/exec-plans/completed/initial-scaffold.md` on PASS.
- Update the doctor preflight only if new required env names change its checks.

---

## 6. Rename table (`vibe-coding-starter-kit` → `depth-anything-v2-dataset`)

Grep-replace all occurrences across `package.json` files, `pnpm-workspace.yaml`, `*.ts/tsx`,
`*.py`, `*.mjs`, `*.yml`, docs. Verify with `pnpm build && pnpm lint && pnpm lint:api &&
pnpm test:api && pnpm check:structure`.

| Kind | From | To |
|------|------|----|
| kebab / repo slug | `vibe-coding-starter-kit` | `depth-anything-v2-dataset` |
| snake | `vibe_coding_starter_kit` | `depth_anything_v2_dataset` |
| workspace pkg scope | `@vibe-coding-starter-kit/*` (`/shared`, `/web`) | `@depth-anything-v2-dataset/*` |
| Title Case | `Vibe Coding Starter Kit` | `Depth Anything V2 Dataset` |
| APP_NAME (`lib/app-config.ts`) | `OSS Starter Kit` | `Depth Anything V2 Dataset` |
| APP_DESCRIPTION | `File management dashboard powered by Backblaze B2` | `Generate dense depth maps from image collections with Depth Anything V2, stored on Backblaze B2` |
| FastAPI title (`main.py`) | `OSS Starter Kit API` | `Depth Anything V2 Dataset API` |
| S3 `user_agent_extra` (`repo/b2_client.py`) | `b2ai-oss-start` | `b2ai-depth-anything-v2-dataset` |
| UTM `utm_content` in B2 links | `b2ai-oss-start` | `depth-anything-v2-dataset` |
| CI / image tags / railway slugs | starter names | `depth-anything-v2-dataset` |

### Env var standardization (Standard #3 — starter deviates, sample MUST comply)
The starter uses `B2_KEY_ID` / `B2_ENDPOINT` and an unexposed `b2_public_url`, with no
`B2_REGION`. Standardize to the five canonical names in `settings.py`, `main.py`
(`REQUIRED_B2_SETTINGS` + placeholder set), `.env.example`, README, and doctor:

| From (starter) | To (Standard #3) | Notes |
|----------------|------------------|-------|
| `B2_KEY_ID` (`b2_key_id`) | `B2_APPLICATION_KEY_ID` (`b2_application_key_id`) | required |
| `B2_APPLICATION_KEY` | `B2_APPLICATION_KEY` | required (unchanged) |
| `B2_BUCKET_NAME` | `B2_BUCKET_NAME` | required (unchanged) |
| *(none)* | `B2_REGION` (`b2_region`, default `us-west-004`) | endpoint derived: `https://s3.{B2_REGION}.backblazeb2.com`; optional `B2_ENDPOINT` override retained |
| `b2_public_url` | `B2_PUBLIC_URL_BASE` (`b2_public_url_base`) | **OPTIONAL — must NOT be in the boot gate** (public URLs are a convenience; required = key id, key, bucket only) |

Sample-specific settings to add: `depth_model_id`, `depth_output_format` (default `png16`),
`depth_max_images_per_run` (default 8), `depth_device` (default `auto`), `depth_output_prefix`
(default `depth/`), `depth_jobs_prefix` (default `depth-jobs/`).

### Requirements (pin ML deps — unpinned torch/transformers is a false-green on fresh clone)
Add to `services/api/requirements.txt` with tested windows; remove `PyPDF2`:
- `torch>=2.3,<2.9` (CPU wheel; MPS/CUDA autodetected at runtime)
- `transformers>=4.45,<5` (Depth Anything V2 support)
- `numpy>=1.26,<2` (conservative, known-good with torch/transformers)
- `Pillow>=11.0.0` (kept — 16-bit `I;16` PNG output)
- (add `torchvision` matching torch **only if** the pipeline requires it; verify)
The builder MUST verify a real end-to-end depth run on a fresh install (only end-to-end catches
these); unit tests stay hermetic (no model download, no network — torch/transformers lazy).

---

## Build discipline (carry into Phase 2)
- Every file < 300 lines; split `service/depth.py` / `service/encode.py` if needed.
- boto3 only in `repo/`; torch/transformers lazy-imported inside `service/depth.py` functions.
- No bare `print()` (JSON logging); structural + feature tests updated/added and green.
- Colorized preview (not raw 16-bit) is what renders in the browser — pairs grid + Library must
  actually paint via presigned URLs.
- Docs updated in the same pass as code (AGENTS §9 mapping).
