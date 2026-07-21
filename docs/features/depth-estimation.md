<!-- last_verified: 2026-07-21 -->
# Feature: Depth Estimation (Depth Anything V2)

## Purpose
Estimate a dense depth map for a single RGB image, locally, and encode it to storable
artifacts (16-bit PNG / `.npy` + a browser-viewable 8-bit colorized preview).

## Deployment
`deployment: local` — this runs on-device (no external API, no API key). The default
checkpoint `depth-anything/Depth-Anything-V2-Small-hf` is Apache-2.0 and public; weights
download once from the HuggingFace Hub (~100 MB for Small) on the first run only.

## Used By
- Service: `services/api/app/service/jobs.py` (`run_job`)
- Not a direct HTTP endpoint — invoked as part of a Depth Job run

## Core Functions
- `services/api/app/service/depth.py` — `estimate_depth()`, `select_device()`,
  `resolve_model_id()`, cached `_load_pipeline()`
- `services/api/app/service/encode.py` — `encode_png16()`, `encode_npy()`, `encode_preview_png()`

## Canonical Files
- Inference (lazy ML imports): `services/api/app/service/depth.py`
- Encoding (numpy colormap LUT, no matplotlib/opencv): `services/api/app/service/encode.py`

## Inputs
- image_bytes: bytes
- model_id: string (resolved from the Small/Base/Large variant)
- device: string (`auto|cpu|cuda|mps`)

## Outputs
- depth: float32 HxW array (at source resolution)
- 16-bit PNG and/or `.npy` artifacts + an 8-bit colorized preview PNG

## Device rule (hard requirement)
- Default to **CPU**. `select_device()` auto-detects the first available of
  **CUDA → Apple MPS → CPU** and always falls back to CPU. Never hard-requires a GPU.
- `DEPTH_DEVICE` env (`auto|cpu|cuda|mps`) overrides; an unavailable accelerator falls
  back to auto-detect.
- **MPS caveat:** the DINOv2 backbone generally runs on MPS, but if an MPS op errors at
  run time, `estimate_depth()` catches it and retries on CPU (reporting `device_used="cpu"`).

## Flow
- Lazily import `torch` / `transformers` inside functions (so app import and hermetic
  test collection never load heavy ML or trigger a download)
- Load a cached `pipeline("depth-estimation", model=..., device=...)`
- Run inference; take `predicted_depth`, bicubic-resize to the source resolution
- Encode: min-max normalize → 16-bit PNG (mode `I;16`) / float32 `.npy` /
  viridis-like colorized 8-bit RGB preview

## Edge Cases
- Flat/degenerate depth → normalization yields zeros (no divide-by-zero)
- Accelerator op error → CPU retry
- First run offline → model download fails; subsequent runs use the cached weights

## UX States
- Not applicable directly (surfaced through the Depth Job run status)

## Verification
- Test files: `services/api/tests/test_jobs.py` (encode tests + run with mocked inference)
- Required cases: 16-bit PNG output, RGB preview, `.npy` roundtrip, flat-depth handling
- Quick verify command: `pnpm test:api`
- Full verify: a real end-to-end run — seed `demo-scene/` and Run a job (only end-to-end
  exercises the actual model download + inference)
- Pass criteria: hermetic tests green; a real run writes artifacts + manifest and completes

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Depth Jobs](depth-jobs.md)
