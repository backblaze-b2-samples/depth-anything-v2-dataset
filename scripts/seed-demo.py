#!/usr/bin/env python3
"""Seed a demo scene into B2 so the app is demonstrable end-to-end.

Generates a handful of synthetic RGB images with Pillow (gradients + geometric
shapes — no binaries committed to the repo) and uploads them under a scene
prefix (default: demo-scene/). Then create a Depth Job over that prefix in the
UI and hit Run.

Usage:
  python scripts/seed-demo.py                 # 6 synthetic images -> demo-scene/
  python scripts/seed-demo.py --count 8 --prefix my-scene/
  python scripts/seed-demo.py --from-urls https://example.com/a.jpg https://…

Reads B2 credentials from the repo-root .env (same as the API). Requires the
API's virtualenv (boto3 + Pillow) — run from services/api/.venv or any env with
those installed.
"""

import argparse
import io
import os
import random
import sys
import urllib.request
from pathlib import Path

import boto3
from botocore.config import Config
from dotenv import load_dotenv
from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env")

USER_AGENT_EXTRA = "b2ai-depth-anything-v2-dataset"


def _endpoint() -> str:
    region = os.environ.get("B2_REGION", "us-west-004").strip() or "us-west-004"
    return f"https://s3.{region}.backblazeb2.com"


def make_client():
    key_id = os.environ.get("B2_APPLICATION_KEY_ID", "")
    app_key = os.environ.get("B2_APPLICATION_KEY", "")
    bucket = os.environ.get("B2_BUCKET_NAME", "")
    if not (key_id and app_key and bucket):
        sys.exit(
            "Missing B2 credentials. Set B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, "
            "and B2_BUCKET_NAME in .env (see .env.example)."
        )
    client = boto3.client(
        "s3",
        endpoint_url=_endpoint(),
        aws_access_key_id=key_id,
        aws_secret_access_key=app_key,
        config=Config(signature_version="s3v4", user_agent_extra=USER_AGENT_EXTRA),
    )
    return client, bucket


def synth_image(seed: int, size: int = 640) -> bytes:
    """A deterministic synthetic scene: diagonal gradient background plus a few
    solid shapes at varying 'depths' (sizes/positions), so depth estimation has
    real structure to work with."""
    rng = random.Random(seed)
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(0, size, 4):  # step 4 for speed; fill the run
            r = int(40 + 160 * (x / size))
            g = int(40 + 160 * (y / size))
            b = int(90 + 120 * ((x + y) / (2 * size)))
            for dx in range(4):
                if x + dx < size:
                    px[x + dx, y] = (r, g, b)
    draw = ImageDraw.Draw(img)
    for _ in range(rng.randint(3, 6)):
        x0 = rng.randint(0, size - 120)
        y0 = rng.randint(0, size - 120)
        s = rng.randint(60, 200)
        color = (rng.randint(60, 255), rng.randint(60, 255), rng.randint(60, 255))
        if rng.random() < 0.5:
            draw.ellipse([x0, y0, x0 + s, y0 + s], fill=color)
        else:
            draw.rectangle([x0, y0, x0 + s, y0 + s], fill=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def fetch_url(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310 — user-supplied
        return resp.read()


def upload(client, bucket: str, key: str, data: bytes, content_type: str) -> None:
    client.put_object(Bucket=bucket, Key=key, Body=io.BytesIO(data), ContentType=content_type)
    print(f"uploaded s3://{bucket}/{key} ({len(data)} bytes)")


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed a demo scene into B2.")
    ap.add_argument("--count", type=int, default=6, help="number of synthetic images")
    ap.add_argument("--prefix", default="demo-scene/", help="destination prefix")
    ap.add_argument(
        "--from-urls",
        nargs="*",
        default=None,
        help="use real photos from these URLs instead of synthetic images",
    )
    args = ap.parse_args()
    prefix = args.prefix if args.prefix.endswith("/") else args.prefix + "/"

    client, bucket = make_client()

    if args.from_urls:
        for i, url in enumerate(args.from_urls):
            data = fetch_url(url)
            ext = url.rsplit(".", 1)[-1].lower()
            ext = ext if ext in ("jpg", "jpeg", "png", "webp") else "jpg"
            ct = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[ext]
            upload(client, bucket, f"{prefix}photo{i:03d}.{ext}", data, ct)
    else:
        for i in range(args.count):
            upload(client, bucket, f"{prefix}img{i:03d}.png", synth_image(i), "image/png")

    print(f"\nDone. Create a Depth Job over '{prefix}' in the UI and hit Run.")


if __name__ == "__main__":
    main()
