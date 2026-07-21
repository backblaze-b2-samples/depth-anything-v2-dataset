from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

DepthModelVariant = Literal["small", "base", "large"]
DepthOutputFormat = Literal["png16", "npy", "both"]
DepthJobStatus = Literal["pending", "running", "completed", "failed"]


class CreateDepthJob(BaseModel):
    """Request body for POST /jobs."""

    name: str = Field(min_length=1, max_length=100)
    source_prefix: str = Field(min_length=1, max_length=500)
    model: DepthModelVariant = "small"
    output_format: DepthOutputFormat = "png16"
    device: str | None = None  # auto|cpu|cuda|mps — defaults to settings


class RenameDepthJob(BaseModel):
    """Request body for PATCH /jobs/{id}."""

    name: str = Field(min_length=1, max_length=100)


class DepthJob(BaseModel):
    """A depth-estimation batch job over a scene prefix. Persisted to B2 as
    depth-jobs/<id>.json — B2 is the sole data store (no DB)."""

    id: str
    name: str
    source_prefix: str
    model: DepthModelVariant
    model_id: str
    output_format: DepthOutputFormat
    device: str
    status: DepthJobStatus
    created_at: datetime
    updated_at: datetime
    image_count: int = 0
    processed_count: int = 0
    source_bytes: int = 0
    depth_bytes: int = 0
    device_used: str | None = None
    error: str | None = None


class DepthPair(BaseModel):
    """A source image paired with its generated depth artifacts. The preview is
    an 8-bit colorized PNG the browser can render; the depth_key points at the
    raw 16-bit artifact. URLs are presigned by the runtime layer."""

    image_key: str
    depth_key: str | None = None
    preview_key: str | None = None
    image_url: str | None = None
    preview_url: str | None = None
    width: int = 0
    height: int = 0
    source_bytes: int = 0
    depth_bytes: int = 0
    job_id: str | None = None


class DepthDatasetStats(BaseModel):
    """Dataset-wide aggregates for the dashboard. The amplification ratio is the
    headline B2 story: (source + depth) / source bytes."""

    total_jobs: int
    images_processed: int
    depth_maps_stored: int
    source_bytes: int
    depth_bytes: int
    total_bytes: int
    source_bytes_human: str
    depth_bytes_human: str
    total_bytes_human: str
    amplification_ratio: float
