"""Depth Anything V2 inference (deployment: local).

torch/transformers are imported lazily INSIDE functions so importing this module
(and collecting the hermetic unit tests) never loads heavy ML or triggers a
model download. The model is fetched from the HuggingFace Hub on the first real
run only — no API key is required (the default checkpoint is Apache-2.0/public).

Device rule: default to CPU; auto-detect the first available of CUDA -> Apple
MPS -> CPU. Never hard-require a GPU. If an MPS op errors at run time the caller
(`estimate_depth`) catches it and retries on CPU.
"""

import functools
import io
import logging

from app.config import settings

logger = logging.getLogger(__name__)

# Variant -> public HuggingFace checkpoint. All Apache-2.0, no token required.
MODEL_IDS: dict[str, str] = {
    "small": "depth-anything/Depth-Anything-V2-Small-hf",
    "base": "depth-anything/Depth-Anything-V2-Base-hf",
    "large": "depth-anything/Depth-Anything-V2-Large-hf",
}


def resolve_model_id(variant: str) -> str:
    return MODEL_IDS.get(variant, settings.depth_model_id)


def _mps_available(torch) -> bool:
    backend = getattr(torch.backends, "mps", None)
    return bool(backend is not None and backend.is_available())


def select_device(requested: str | None) -> str:
    """Resolve the runtime device. Honors an explicit cpu/cuda/mps request when
    that accelerator is actually available, otherwise auto-detects
    CUDA -> MPS -> CPU. Always falls back to CPU — never requires a GPU."""
    import torch

    req = (requested or settings.depth_device or "auto").lower()
    if req == "cpu":
        return "cpu"
    if req == "cuda" and torch.cuda.is_available():
        return "cuda"
    if req == "mps" and _mps_available(torch):
        return "mps"
    # "auto", or a requested accelerator that isn't available: detect.
    if torch.cuda.is_available():
        return "cuda"
    if _mps_available(torch):
        return "mps"
    return "cpu"


@functools.lru_cache(maxsize=2)
def _load_pipeline(model_id: str, device: str):
    import torch
    from transformers import pipeline

    logger.info("Loading depth pipeline model=%s device=%s", model_id, device)
    return pipeline("depth-estimation", model=model_id, device=torch.device(device))


def _to_depth_array(result: dict, width: int, height: int):
    """Extract a float32 HxW depth array at the source resolution."""
    import numpy as np
    import torch

    pred = result.get("predicted_depth")
    if pred is not None:
        t = pred
        if t.ndim == 2:
            t = t[None, None]
        elif t.ndim == 3:
            t = t[None]
        t = torch.nn.functional.interpolate(
            t.float(), size=(height, width), mode="bicubic", align_corners=False
        )
        return t[0, 0].detach().cpu().numpy().astype("float32")
    # Fallback: the pipeline's post-processed PIL depth image (already at source
    # resolution, but only 8-bit precision).
    return np.asarray(result["depth"]).astype("float32")


def _run(model_id: str, device: str, img):
    return _load_pipeline(model_id, device)(img)


def estimate_depth(
    image_bytes: bytes, model_id: str, device: str
) -> tuple["object", int, int, str]:
    """Run Depth Anything V2 over one image.

    Returns (depth float32 HxW ndarray, width, height, device_used). On an
    accelerator op error, retries once on CPU and reports device_used="cpu".
    """
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = img.size

    device_used = device
    try:
        result = _run(model_id, device, img)
    except Exception:
        if device != "cpu":
            logger.warning(
                "Depth inference failed on %s; retrying on CPU", device, exc_info=True
            )
            result = _run(model_id, "cpu", img)
            device_used = "cpu"
        else:
            raise

    depth = _to_depth_array(result, width, height)
    return depth, width, height, device_used
