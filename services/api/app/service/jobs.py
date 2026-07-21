"""Depth Job orchestration: create / run / rename / delete / read + stats.

Business logic lives here; the router (`runtime/jobs.py`) stays thin and boto3
stays in `repo/`. Depth artifacts are written under a parallel depth/<id>/
prefix (not interleaved with sources), so a re-run never ingests its own output;
the per-job manifest is the index that pairs source image -> depth artifacts.
"""

import logging
import uuid
from datetime import UTC, datetime

from app.config import settings
from app.repo import jobs as repo
from app.service import depth, encode
from app.types import (
    CreateDepthJob,
    DepthDatasetStats,
    DepthJob,
    DepthPair,
)
from app.types.formatting import humanize_bytes

logger = logging.getLogger(__name__)


class JobNotFoundError(Exception):
    def __init__(self, detail: str = "Depth job not found"):
        self.detail = detail
        super().__init__(detail)


class JobStateError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


def create_job(req: CreateDepthJob) -> DepthJob:
    now = datetime.now(UTC)
    job = DepthJob(
        id=uuid.uuid4().hex[:12],
        name=req.name.strip(),
        source_prefix=req.source_prefix.strip(),
        model=req.model,
        model_id=depth.resolve_model_id(req.model),
        output_format=req.output_format,
        device=(req.device or settings.depth_device or "auto"),
        status="pending",
        created_at=now,
        updated_at=now,
    )
    repo.save_job(job)
    logger.info("Depth job created: id=%s prefix=%s", job.id, job.source_prefix)
    return job


def list_jobs() -> list[DepthJob]:
    return repo.list_jobs()


def get_job(job_id: str) -> DepthJob:
    job = repo.get_job(job_id)
    if job is None:
        raise JobNotFoundError()
    return job


def rename_job(job_id: str, name: str) -> DepthJob:
    job = get_job(job_id)
    job.name = name.strip()
    job.updated_at = datetime.now(UTC)
    repo.save_job(job)
    return job


def delete_job(job_id: str) -> None:
    get_job(job_id)  # 404 if missing
    repo.delete_job(job_id)
    logger.info("Depth job deleted: id=%s", job_id)


def _artifact_base(job_id: str, image_key: str) -> str:
    name = image_key.rsplit("/", 1)[-1]
    stem = name.rsplit(".", 1)[0] if "." in name else name
    return f"{settings.depth_output_prefix}{job_id}/{stem}"


def _write_artifacts(job: DepthJob, image_key, arr) -> tuple[str | None, str, int]:
    """Write depth artifacts for one image. The colorized preview is always
    written (it is what the browser renders). Returns (depth_key, preview_key,
    total_bytes_written)."""
    base = _artifact_base(job.id, image_key)
    depth_key: str | None = None
    written = 0
    if job.output_format in ("png16", "both"):
        depth_key = f"{base}.depth.png"
        written += repo.put_artifact(depth_key, encode.encode_png16(arr), "image/png")
    if job.output_format in ("npy", "both"):
        npy_key = f"{base}.depth.npy"
        written += repo.put_artifact(
            npy_key, encode.encode_npy(arr), "application/octet-stream"
        )
        depth_key = depth_key or npy_key
    preview_key = f"{base}.depth_preview.png"
    written += repo.put_artifact(
        preview_key, encode.encode_preview_png(arr), "image/png"
    )
    return depth_key, preview_key, written


def run_job(job_id: str) -> DepthJob:
    """Run Depth Anything V2 over the source images (synchronous, capped at
    DEPTH_MAX_IMAGES_PER_RUN for a bounded demo run). Writes artifacts + manifest
    and flips status to completed (or failed, recording the error)."""
    job = get_job(job_id)
    if job.status == "completed":
        raise JobStateError("Job already completed")

    sources = repo.list_source_images(job.source_prefix)
    if not sources:
        raise JobStateError(f"No source images found under '{job.source_prefix}'")

    selected = sources[: settings.depth_max_images_per_run]
    job.status = "running"
    job.updated_at = datetime.now(UTC)
    repo.save_job(job)

    device = depth.select_device(job.device)
    manifest: list[dict] = []
    source_bytes = depth_bytes = processed = 0
    device_used = device

    try:
        for src in selected:
            data = repo.get_object_bytes(src["key"])
            arr, width, height, device_used = depth.estimate_depth(
                data, job.model_id, device
            )
            depth_key, preview_key, written = _write_artifacts(job, src["key"], arr)
            source_bytes += src["size"]
            depth_bytes += written
            processed += 1
            manifest.append(
                {
                    "image_key": src["key"],
                    "depth_key": depth_key,
                    "preview_key": preview_key,
                    "width": width,
                    "height": height,
                    "source_bytes": src["size"],
                    "depth_bytes": written,
                }
            )
    except Exception as e:
        # Record and surface the failure — don't crash the worker thread.
        job.status = "failed"
        job.error = str(e)[:500]
        logger.error("Depth job %s failed", job.id, exc_info=True)
    else:
        job.status = "completed"
        job.error = None
    finally:
        if manifest:
            repo.write_manifest(job.id, manifest)
        job.image_count = len(selected)
        job.processed_count = processed
        job.source_bytes = source_bytes
        job.depth_bytes = depth_bytes
        job.device_used = device_used
        job.updated_at = datetime.now(UTC)
        repo.save_job(job)

    logger.info(
        "Depth job %s finished: status=%s processed=%d device=%s",
        job.id,
        job.status,
        processed,
        device_used,
    )
    return job


def _pairs_from_manifest(job_id: str, lines: list[dict]) -> list[DepthPair]:
    pairs: list[DepthPair] = []
    for line in lines:
        image_key = line.get("image_key")
        preview_key = line.get("preview_key")
        pairs.append(
            DepthPair(
                image_key=image_key,
                depth_key=line.get("depth_key"),
                preview_key=preview_key,
                image_url=repo.presign(image_key) if image_key else None,
                preview_url=repo.presign(preview_key) if preview_key else None,
                width=line.get("width", 0),
                height=line.get("height", 0),
                source_bytes=line.get("source_bytes", 0),
                depth_bytes=line.get("depth_bytes", 0),
                job_id=job_id,
            )
        )
    return pairs


def get_job_pairs(job_id: str) -> list[DepthPair]:
    get_job(job_id)  # 404 if missing
    return _pairs_from_manifest(job_id, repo.read_manifest(job_id))


def get_library_pairs(limit: int = 200) -> list[DepthPair]:
    """All source->depth-preview pairs across every job, scoped to the sample's
    own depth/ output prefix."""
    pairs: list[DepthPair] = []
    for job in repo.list_jobs():
        pairs.extend(_pairs_from_manifest(job.id, repo.read_manifest(job.id)))
        if len(pairs) >= limit:
            break
    return pairs[:limit]


def get_dataset_stats() -> DepthDatasetStats:
    jobs = repo.list_jobs()
    images_processed = sum(j.processed_count for j in jobs)
    source_bytes = sum(j.source_bytes for j in jobs)
    depth_bytes = sum(j.depth_bytes for j in jobs)
    total = source_bytes + depth_bytes
    ratio = (total / source_bytes) if source_bytes > 0 else 0.0
    return DepthDatasetStats(
        total_jobs=len(jobs),
        images_processed=images_processed,
        depth_maps_stored=images_processed,
        source_bytes=source_bytes,
        depth_bytes=depth_bytes,
        total_bytes=total,
        source_bytes_human=humanize_bytes(source_bytes),
        depth_bytes_human=humanize_bytes(depth_bytes),
        total_bytes_human=humanize_bytes(total),
        amplification_ratio=round(ratio, 2),
    )


def list_source_prefixes() -> list[str]:
    return repo.list_source_prefixes()
