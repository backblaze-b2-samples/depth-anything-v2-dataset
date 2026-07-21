<!-- last_verified: 2026-07-21 -->
# App Workflows

User journeys inside the application.

## Ingest source images

- User navigates to `/upload`
- Drops or selects RGB images (JPEG / PNG / WebP, max 100MB each)
- Client validates size and type; server re-validates with magic-byte sniffing
- Images land under the `uploads/` prefix (a scene prefix a job can target)
- Alternatively, `scripts/seed-demo.py` seeds a `demo-scene/` prefix
- See: [Image Ingest](features/file-upload.md)

## Create and run a Depth Job

- User navigates to `/jobs` and clicks **New job**
- Fills the create form: name, source prefix (selector populated from bucket
  prefixes, with a custom-prefix fallback), model variant (Small/Base/Large),
  output format (16-bit PNG / `.npy` / both)
- A `pending` job record is written to B2 (`depth-jobs/<id>.json`)
- User opens the job detail (`/jobs/[id]`) and clicks **Run**
- Depth Anything V2 runs locally over the source images (capped at
  `DEPTH_MAX_IMAGES_PER_RUN`), device auto-detected CUDA → MPS → CPU
- Artifacts + `manifest.jsonl` are written under `depth/<id>/`; status flips to
  `completed` (or `failed`, with the error surfaced inline)
- See: [Depth Jobs](features/depth-jobs.md), [Depth Estimation](features/depth-estimation.md)

## Manage a Depth Job (rename / delete)

- On `/jobs/[id]`, **Edit** opens a dialog to rename the job (rewrites its B2 record)
- **Delete** opens a confirm dialog; on confirm the job's depth artifacts, manifest,
  and record are removed — prefix-scoped to `depth/<id>/` and `depth-jobs/<id>.json`,
  never touching source images or other jobs
- See: [Depth Jobs](features/depth-jobs.md)

## Browse image → depth pairs (Pairs Library)

- User navigates to `/library`
- The gallery lists source→depth-preview pairs across all jobs, scoped to the
  sample's own `depth/` output prefix
- Each pair renders the source image and its 8-bit colorized depth preview via
  presigned URLs
- See: [Pairs Library](features/pairs-library.md)

## Browse the full bucket (File Explorer)

- User navigates to `/files`
- Tree view of every object in the bucket with preview / download / delete
- See: [File Browser](features/file-browser.md)

## View the dashboard

- User navigates to `/` (home)
- Stat cards: depth jobs, images processed, depth maps stored, total storage
  (with source vs depth split + amplification ratio)
- A stacked bar chart of source-vs-depth bytes per job (the write-amplification story)
- A recent-jobs table
- See: [Dashboard](features/dashboard.md)
