from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Backblaze B2 (Standard B2_* env names) ---
    # Required at startup: key id, key, bucket (see main.py boot gate).
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    # Region drives the S3 endpoint. Default is B2's default region; override
    # with B2_REGION for a bucket created elsewhere. No region string is baked
    # into any S3 call — the endpoint is derived from this value below.
    b2_region: str = "us-west-004"
    # Optional public URL base for objects (a convenience, NOT required — must
    # never be in the startup boot gate). Presigned URLs are used regardless.
    b2_public_url_base: str = ""

    api_port: int = 8000
    # Interactive API docs (/docs, /redoc, /openapi.json). On by default for
    # local dev and starter-kit exploration; set false to hide the full API
    # surface in production.
    enable_docs: bool = True
    # Explicit allowlist by default — covers Next on :3000 and the
    # fallback :3001 it picks if 3000 is busy. Production deploys should
    # override with the exact frontend origin.
    api_cors_origins: str = "http://localhost:3000,http://localhost:3001"
    # Optional dev-only escape hatch: a regex that matches additional
    # allowed origins. Empty by default — set this to e.g.
    # `^http://localhost:\d+$` to accept any localhost port without
    # listing each one. NEVER ship this to production.
    api_cors_origin_regex: str = ""

    # Upload limits
    max_file_size: int = 100 * 1024 * 1024  # 100MB

    # Optional confinement for key-addressed reads/deletes. Empty by default so
    # the by-key routes accept any key shape (they deliberately support nested
    # folders and reserved-word segments). Point a fork at a bucket shared with
    # other data? Set to e.g. "uploads/" to restrict all key ops to app uploads.
    allowed_key_prefix: str = ""

    # Rate limiting (per client IP, per 60s window). In-process per replica —
    # documented in docs/RELIABILITY.md; horizontal scaling needs a shared
    # store (e.g. Redis). Writes/downloads get the tighter cap.
    rate_limit_per_minute: int = 120
    # Covers uploads, deletes, downloads and previews — kept generous enough
    # that a normal browsing/upload session doesn't trip it.
    rate_limit_write_per_minute: int = 60

    # Small durable counters (downloads, etc). Point at a persistent
    # volume in production if you care about surviving restarts.
    download_count_file: str = "data/download_count.json"

    # --- Depth Anything V2 (local inference — no API key) ---
    # HuggingFace checkpoint. Small is the CPU-friendly default; Base/Large are
    # selectable from the create form / env.
    depth_model_id: str = "depth-anything/Depth-Anything-V2-Small-hf"
    # Output artifacts to write per image: "png16" (16-bit PNG), "npy", or "both".
    depth_output_format: str = "png16"
    # Bounded demo run: cap the images processed per synchronous run.
    depth_max_images_per_run: int = 8
    # Device selection: auto|cpu|cuda|mps. "auto" prefers CUDA -> MPS -> CPU,
    # always falling back to CPU. Never hard-requires a GPU.
    depth_device: str = "auto"
    # B2 prefixes for the sample's own output. Job artifacts live under
    # depth/<job_id>/; job records under depth-jobs/<job_id>.json.
    depth_output_prefix: str = "depth/"
    depth_jobs_prefix: str = "depth-jobs/"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins(self) -> list[str]:
        # Drop empties so a trailing comma or API_CORS_ORIGINS="" doesn't yield
        # a stray "" origin.
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]

    @property
    def b2_endpoint_url(self) -> str:
        """Derive the S3 endpoint from the region. No region literal is embedded
        in any S3 client call — it flows from the B2_REGION setting only."""
        return f"https://s3.{self.b2_region}.backblazeb2.com"


settings = Settings()
