"""B2 persistence for Depth Jobs. B2 is the sole data store (no DB).

Layout:
  depth-jobs/<id>.json                 — DepthJob record
  depth/<id>/<name>.depth.png          — 16-bit depth artifact
  depth/<id>/<name>.depth.npy          — optional numpy artifact
  depth/<id>/<name>.depth_preview.png  — 8-bit colorized, browser-renderable
  depth/<id>/manifest.jsonl            — one line per processed image

boto3/botocore live only in repo/ — this module reuses the shared S3 client
from b2_client and adds job-specific object operations.
"""

import io
import json

from botocore.exceptions import ClientError

from app.config import settings
from app.repo.b2_client import (
    _fetch_all_objects,
    _invalidate_list_cache,
    get_s3_client,
)
from app.types import DepthJob

_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".jfif")


def _job_key(job_id: str) -> str:
    return f"{settings.depth_jobs_prefix}{job_id}.json"


def _job_output_prefix(job_id: str) -> str:
    return f"{settings.depth_output_prefix}{job_id}/"


def _manifest_key(job_id: str) -> str:
    return f"{_job_output_prefix(job_id)}manifest.jsonl"


def _is_reserved(key: str) -> bool:
    """Keys the app writes itself — never treated as ingestable source images."""
    return key.startswith(settings.depth_output_prefix) or key.startswith(
        settings.depth_jobs_prefix
    )


# --- Job records ------------------------------------------------------------


def save_job(job: DepthJob) -> None:
    client = get_s3_client()
    body = job.model_dump_json().encode("utf-8")
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=_job_key(job.id),
            Body=io.BytesIO(body),
            ContentType="application/json",
        )
    except ClientError as e:
        raise RuntimeError(f"B2 save_job failed for '{job.id}': {e}") from e
    _invalidate_list_cache()


def get_job(job_id: str) -> DepthJob | None:
    client = get_s3_client()
    try:
        resp = client.get_object(Bucket=settings.b2_bucket_name, Key=_job_key(job_id))
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return None
        raise RuntimeError(f"B2 get_job failed for '{job_id}': {e}") from e
    return DepthJob.model_validate_json(resp["Body"].read())


def list_jobs() -> list[DepthJob]:
    jobs: list[DepthJob] = []
    for obj in _fetch_all_objects(settings.depth_jobs_prefix):
        if not obj["Key"].endswith(".json"):
            continue
        job = get_job(obj["Key"].removeprefix(settings.depth_jobs_prefix).removesuffix(".json"))
        if job is not None:
            jobs.append(job)
    jobs.sort(key=lambda j: j.created_at, reverse=True)
    return jobs


def delete_job(job_id: str) -> None:
    """Delete a job's record + all its artifacts. Prefix-scoped to
    depth/<id>/ and depth-jobs/<id>.json — never touches other prefixes."""
    keys = [obj["Key"] for obj in _fetch_all_objects(_job_output_prefix(job_id))]
    keys.append(_job_key(job_id))
    _delete_keys(keys)
    _invalidate_list_cache()


def _delete_keys(keys: list[str]) -> None:
    if not keys:
        return
    client = get_s3_client()
    # delete_objects caps at 1000 keys per request.
    for i in range(0, len(keys), 1000):
        batch = [{"Key": k} for k in keys[i : i + 1000]]
        try:
            client.delete_objects(
                Bucket=settings.b2_bucket_name, Delete={"Objects": batch}
            )
        except ClientError as e:
            raise RuntimeError(f"B2 delete_objects failed: {e}") from e


# --- Source images + artifacts ---------------------------------------------


def list_source_images(prefix: str) -> list[dict]:
    """List ingestable source images under `prefix`, newest first. Excludes the
    app's own output prefixes so a re-run never ingests its own depth maps."""
    out: list[dict] = []
    for obj in _fetch_all_objects(prefix):
        key = obj["Key"]
        if key.endswith("/") or _is_reserved(key):
            continue
        if not key.lower().endswith(_IMAGE_EXTS):
            continue
        out.append({"key": key, "size": obj["Size"]})
    out.sort(key=lambda o: o["key"])
    return out


def get_object_bytes(key: str) -> bytes:
    client = get_s3_client()
    try:
        resp = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
    except ClientError as e:
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e
    return resp["Body"].read()


def put_artifact(key: str, data: bytes, content_type: str) -> int:
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=key,
            Body=io.BytesIO(data),
            ContentType=content_type,
        )
    except ClientError as e:
        raise RuntimeError(f"B2 put_artifact failed for '{key}': {e}") from e
    _invalidate_list_cache()
    return len(data)


def write_manifest(job_id: str, lines: list[dict]) -> None:
    body = ("\n".join(json.dumps(line) for line in lines) + "\n").encode("utf-8")
    put_artifact(_manifest_key(job_id), body, "application/x-ndjson")


def read_manifest(job_id: str) -> list[dict]:
    client = get_s3_client()
    try:
        resp = client.get_object(
            Bucket=settings.b2_bucket_name, Key=_manifest_key(job_id)
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return []
        raise RuntimeError(f"B2 read_manifest failed for '{job_id}': {e}") from e
    text = resp["Body"].read().decode("utf-8")
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def presign(key: str, expires_in: int = 900) -> str:
    """Presigned GET URL for inline browser rendering (no attachment
    disposition, so `<img>` renders the object directly)."""
    client = get_s3_client()
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.b2_bucket_name, "Key": key},
            ExpiresIn=expires_in,
        )
    except ClientError as e:
        raise RuntimeError(f"B2 presign failed for '{key}': {e}") from e


def list_source_prefixes() -> list[str]:
    """Top-level bucket prefixes (folders), for the create-form selector.
    Excludes the app's own output prefixes."""
    client = get_s3_client()
    prefixes: set[str] = set()
    kwargs: dict = {
        "Bucket": settings.b2_bucket_name,
        "Delimiter": "/",
        "MaxKeys": 1000,
    }
    try:
        while True:
            resp = client.list_objects_v2(**kwargs)
            for cp in resp.get("CommonPrefixes", []):
                p = cp.get("Prefix", "")
                if p and not _is_reserved(p):
                    prefixes.add(p)
            if not resp.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = resp["NextContinuationToken"]
    except ClientError as e:
        raise RuntimeError(f"B2 list prefixes failed: {e}") from e
    return sorted(prefixes)
