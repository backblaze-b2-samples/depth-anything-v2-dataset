<!-- last_verified: 2026-07-21 -->
# Depth Anything V2 Dataset

Generate dense depth maps from large RGB image collections and keep the source
images and their derived depth maps together as a training-ready dataset on
**[Backblaze B2](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-depth-anything-v2-dataset)**.

Built for robotics / AR / 3D dataset teams: ingest RGB images into a B2 bucket
(organized by scene/session prefix), create a **Depth Job** that runs
[Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) locally
over those images, and the app writes a co-located depth artifact (16-bit PNG
and/or `.npy`) plus a browser-viewable colorized preview back to B2, indexed by
a per-job `manifest.jsonl`. Downstream training reads matched image+depth pairs
straight from B2 over the S3 API, using the manifest as the dataset index.

**Why B2 is the story here — write amplification.** Every ingested image yields
a co-located depth map, so the dataset roughly doubles in object count and grows
substantially in bytes. B2 is the storage layer that absorbs that growth cheaply,
accessed over the S3-compatible API with a custom user-agent and standard `B2_*`
env vars. Everything heavy runs **locally** — no second API key, just B2
credentials.

## The workflow

1. **Ingest** source RGB images into a B2 scene prefix (`/upload`, or run
   `scripts/seed-demo.py`).
2. **Run** a Depth Job over that prefix — Depth Anything V2 estimates depth for
   each image on-device.
3. **Write** artifacts back to B2: `depth/<job_id>/<name>.depth.png` (16-bit),
   optional `.depth.npy`, a colorized `<name>.depth_preview.png`, and a
   `manifest.jsonl` index.
4. **Serve / query** matched image→depth pairs from B2 — browse them in the
   Pairs Library, or read the manifest from any training pipeline over S3.

## Key features

- **Depth Jobs** — the primary entity, with the full lifecycle
  (create · read · rename · delete · run) in the UI.
- **Depth Anything V2, local** — HuggingFace `transformers`
  `pipeline("depth-estimation")`, default checkpoint
  `depth-anything/Depth-Anything-V2-Small-hf` (Apache-2.0, public — no token).
  Device auto-detects CUDA → Apple MPS → CPU and always falls back to CPU.
- **Manifest dataset index + amplification** — the dashboard surfaces
  source-vs-depth bytes and the amplification ratio.
- **Pairs Library** — a gallery of source→depth-preview pairs across all jobs,
  scoped to the sample's own `depth/` prefix and rendered via presigned URLs.
- **B2 ingest + full-bucket explorer** — drag-and-drop image ingest and the
  kept `/files` bucket browser.

## Quick Start

You need: Node.js >= 20, pnpm >= 9, Python >= 3.11, and a free
**[Backblaze B2 account](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-depth-anything-v2-dataset)**.

**1. Install dependencies**

```bash
pnpm install
```

**2. Set up the backend** (installs torch + transformers — the CPU wheel is
fine; MPS/CUDA are auto-detected at runtime)

```bash
cd services/api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

**3. Add your B2 credentials**

```bash
cp .env.example .env
```

Then head to the
[Backblaze B2 dashboard](https://secure.backblaze.com/b2_buckets.htm?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-depth-anything-v2-dataset) and:

1. **Create a bucket** → paste its unique name into `B2_BUCKET_NAME`, and set
   `B2_REGION` to the bucket's region (default `us-west-004`; the S3 endpoint is
   derived from it).
2. **Create an application key** with Read and Write permission → paste
   **keyID** into `B2_APPLICATION_KEY_ID` and **applicationKey** into
   `B2_APPLICATION_KEY` (shown once).

`B2_PUBLIC_URL_BASE` is optional — the app serves media via presigned URLs
regardless, so you can leave it unset.

**4. Run it**

```bash
pnpm dev
```

Frontend at `localhost:3000`, API at `localhost:8000` (Swagger UI at
`/docs`). `pnpm dev` runs `pnpm doctor` first — a preflight that catches common
setup gotchas.

**5. Seed a demo scene (optional but recommended)**

```bash
services/api/.venv/bin/python scripts/seed-demo.py   # -> demo-scene/ (6 images)
```

Then open **Depth Jobs → New job**, pick the `demo-scene/` prefix, and hit
**Run**. First run downloads the model weights from the HuggingFace Hub
(~100 MB for Small) — network is needed on the first run only. Use
`--from-urls <url> …` to seed real photos instead of synthetic ones.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `B2_APPLICATION_KEY_ID` | yes | B2 application key ID |
| `B2_APPLICATION_KEY` | yes | B2 application key |
| `B2_BUCKET_NAME` | yes | Target bucket |
| `B2_REGION` | no (default `us-west-004`) | Drives the S3 endpoint |
| `B2_PUBLIC_URL_BASE` | no | Public object URL base (convenience only) |
| `DEPTH_MODEL_ID` | no | HuggingFace checkpoint override |
| `DEPTH_DEVICE` | no (default `auto`) | `auto\|cpu\|cuda\|mps` |
| `DEPTH_MAX_IMAGES_PER_RUN` | no (default `8`) | Bounded demo run cap |

## Tech Stack

- TypeScript, Next.js 16, React 19, Tailwind v4, shadcn/ui, Recharts, TanStack Query
- Python 3.11+, FastAPI, boto3, Pydantic v2, Pillow, NumPy
- Depth Anything V2 via HuggingFace `transformers` + `torch` (local inference)
- Backblaze B2 (S3-compatible object storage)
- pnpm workspaces (monorepo)

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start frontend + backend |
| `pnpm dev:web` / `pnpm dev:api` | One side only |
| `pnpm build` | Build frontend |
| `pnpm lint` / `pnpm lint:api` | Lint frontend / backend |
| `pnpm test:web` / `pnpm test:api` | Unit tests |
| `pnpm check:structure` | Verify layering rules |
| `pnpm test:e2e` | Playwright e2e tests |

## Documentation Map

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Agent table of contents — start here |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System layout, layering, data flows, B2 layout |
| [docs/features/](docs/features/) | Depth jobs, depth estimation, pairs library, ingest, browser, dashboard, metadata |
| [docs/app-workflows.md](docs/app-workflows.md) | User journeys |
| [docs/dev-workflows.md](docs/dev-workflows.md) | Engineering workflows and testing |
| [docs/SECURITY.md](docs/SECURITY.md) | Security principles |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | Reliability expectations |

## License

MIT License — see [LICENSE](LICENSE) for details.
