"""Encode a depth array to storable artifacts.

- `encode_png16`  -> 16-bit grayscale PNG (Pillow mode "I;16"), the training
  artifact (full precision, not browser-friendly).
- `encode_npy`    -> raw float32 `.npy`.
- `encode_preview_png` -> 8-bit colorized RGB PNG that the browser CAN render
  (this is what the pairs grid / Library display).

Self-contained numpy colormap LUT — no matplotlib/opencv dependency.
"""

import io

import numpy as np
from PIL import Image

# 5-stop viridis-like colormap (normalized position, R, G, B). Perceptually
# ordered so nearer/farther depth is legible; computed with np.interp per
# channel, so no big lookup table or extra dependency is needed.
_CMAP = np.array(
    [
        [0.00, 68, 1, 84],
        [0.25, 59, 82, 139],
        [0.50, 33, 145, 140],
        [0.75, 94, 201, 98],
        [1.00, 253, 231, 37],
    ],
    dtype=np.float64,
)


def _normalize(depth: np.ndarray) -> np.ndarray:
    """Min-max normalize to [0, 1]. Flat/degenerate input -> all zeros."""
    d = np.asarray(depth, dtype=np.float64)
    finite = np.isfinite(d)
    if not finite.any():
        return np.zeros_like(d)
    dmin = float(d[finite].min())
    dmax = float(d[finite].max())
    if (dmax - dmin) < 1e-8:
        return np.zeros_like(d)
    out = (d - dmin) / (dmax - dmin)
    return np.clip(np.nan_to_num(out, nan=0.0), 0.0, 1.0)


def encode_png16(depth: np.ndarray) -> bytes:
    norm = _normalize(depth)
    # Little-endian uint16; build via frombytes so we don't rely on the
    # deprecated Image.fromarray(mode=...) path (removed in Pillow 13).
    arr16 = np.rint(norm * 65535.0).astype("<u2")
    h, w = arr16.shape
    img = Image.frombytes("I;16", (w, h), arr16.tobytes())
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def encode_npy(depth: np.ndarray) -> bytes:
    buf = io.BytesIO()
    np.save(buf, np.asarray(depth, dtype=np.float32))
    return buf.getvalue()


def encode_preview_png(depth: np.ndarray) -> bytes:
    norm = _normalize(depth)
    pos = _CMAP[:, 0]
    rgb = np.stack(
        [
            np.interp(norm, pos, _CMAP[:, 1]),
            np.interp(norm, pos, _CMAP[:, 2]),
            np.interp(norm, pos, _CMAP[:, 3]),
        ],
        axis=-1,
    )
    rgb8 = np.clip(rgb, 0, 255).astype(np.uint8)
    img = Image.fromarray(rgb8, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
