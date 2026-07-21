"""Hermetic tests for the Depth Job lifecycle + encoding.

No model download, no network, no torch import: the repo (B2) layer and the
depth inference are mocked, and encoding is exercised with plain numpy arrays.
"""

import io

import numpy as np
import pytest
from PIL import Image

from app.service import encode
from app.service import jobs as svc
from app.types import CreateDepthJob


@pytest.fixture
def fake_repo(monkeypatch):
    """In-memory stand-in for repo/jobs.py so the service never touches B2."""
    store: dict = {}
    manifests: dict = {}

    monkeypatch.setattr(svc.repo, "save_job", lambda job: store.__setitem__(job.id, job))
    monkeypatch.setattr(svc.repo, "get_job", lambda jid: store.get(jid))
    monkeypatch.setattr(
        svc.repo,
        "list_jobs",
        lambda: sorted(store.values(), key=lambda j: j.created_at, reverse=True),
    )

    def _delete(jid):
        store.pop(jid, None)
        manifests.pop(jid, None)

    monkeypatch.setattr(svc.repo, "delete_job", _delete)
    monkeypatch.setattr(
        svc.repo, "write_manifest", lambda jid, lines: manifests.__setitem__(jid, lines)
    )
    monkeypatch.setattr(svc.repo, "read_manifest", lambda jid: manifests.get(jid, []))
    monkeypatch.setattr(
        svc.repo, "presign", lambda key, expires_in=900: f"https://signed.example/{key}"
    )
    return store


def _create(**kw) -> "svc.DepthJob":
    body = CreateDepthJob(
        name=kw.get("name", "Scene A"),
        source_prefix=kw.get("source_prefix", "demo-scene/"),
        model=kw.get("model", "small"),
        output_format=kw.get("output_format", "png16"),
    )
    return svc.create_job(body)


# --- lifecycle --------------------------------------------------------------


def test_create_resolves_model_id_and_pending(fake_repo):
    job = _create(name="Scene A", model="small")
    assert job.status == "pending"
    assert job.model_id.endswith("Small-hf")
    assert svc.get_job(job.id).name == "Scene A"


def test_get_missing_job_raises(fake_repo):
    with pytest.raises(svc.JobNotFoundError):
        svc.get_job("does-not-exist")


def test_rename_job(fake_repo):
    job = _create(name="old")
    renamed = svc.rename_job(job.id, "new name")
    assert renamed.name == "new name"
    assert svc.get_job(job.id).name == "new name"


def test_delete_job(fake_repo):
    job = _create()
    svc.delete_job(job.id)
    with pytest.raises(svc.JobNotFoundError):
        svc.get_job(job.id)


def test_run_job_no_sources_raises(fake_repo, monkeypatch):
    monkeypatch.setattr(svc.repo, "list_source_images", lambda prefix: [])
    job = _create()
    with pytest.raises(svc.JobStateError):
        svc.run_job(job.id)


def test_run_job_writes_artifacts_and_pairs(fake_repo, monkeypatch):
    puts: list[str] = []
    monkeypatch.setattr(
        svc.repo,
        "list_source_images",
        lambda prefix: [{"key": "demo-scene/a.png", "size": 100}],
    )
    monkeypatch.setattr(svc.repo, "get_object_bytes", lambda key: b"imagebytes")

    def _put(key, data, content_type):
        puts.append(key)
        return len(data)

    monkeypatch.setattr(svc.repo, "put_artifact", _put)
    # Mock inference so no torch/transformers is imported and no model downloads.
    monkeypatch.setattr(svc.depth, "select_device", lambda requested: "cpu")
    monkeypatch.setattr(
        svc.depth,
        "estimate_depth",
        lambda data, model_id, device: (
            np.linspace(0, 1, 16).reshape(4, 4).astype("float32"),
            4,
            4,
            "cpu",
        ),
    )

    job = _create(output_format="both")
    result = svc.run_job(job.id)

    assert result.status == "completed"
    assert result.processed_count == 1
    assert result.matched_count == 1
    assert result.image_count == 1
    assert result.device_used == "cpu"
    # Preview is always written; both png16 + npy for output_format="both".
    assert any(k.endswith(".depth_preview.png") for k in puts)
    assert any(k.endswith(".depth.png") for k in puts)
    assert any(k.endswith(".depth.npy") for k in puts)

    pairs = svc.get_job_pairs(job.id)
    assert len(pairs) == 1
    assert pairs[0].preview_url.startswith("https://signed.example/")
    assert pairs[0].image_url.startswith("https://signed.example/")


def _mock_depth(monkeypatch, sources):
    """Wire up repo + depth mocks for a run over `sources` (list of {key,size})."""
    monkeypatch.setattr(svc.repo, "list_source_images", lambda prefix: sources)
    monkeypatch.setattr(svc.repo, "get_object_bytes", lambda key: b"imagebytes")
    monkeypatch.setattr(svc.repo, "put_artifact", lambda key, data, ct: len(data))
    monkeypatch.setattr(svc.depth, "select_device", lambda requested: "cpu")
    monkeypatch.setattr(
        svc.depth,
        "estimate_depth",
        lambda data, model_id, device: (
            np.zeros((4, 4), dtype="float32"),
            4,
            4,
            "cpu",
        ),
    )


def test_run_job_caps_and_reports_matched_count(fake_repo, monkeypatch):
    # 5 images in the prefix, cap of 2: matched=5 (honest total), processed=2.
    monkeypatch.setattr(svc.settings, "depth_max_images_per_run", 2)
    _mock_depth(
        monkeypatch,
        [{"key": f"demo-scene/{i}.png", "size": 100} for i in range(5)],
    )

    result = svc.run_job(_create().id)
    assert result.matched_count == 5
    assert result.image_count == 2
    assert result.processed_count == 2


def test_start_job_run_returns_running_then_completes(fake_repo, monkeypatch):
    _mock_depth(monkeypatch, [{"key": "demo-scene/a.png", "size": 100}])

    # Run the background worker synchronously for a deterministic assertion.
    class _SyncThread:
        def __init__(self, target, args=(), **kwargs):
            self._target = target
            self._args = args

        def start(self):
            self._target(*self._args)

    monkeypatch.setattr(svc.threading, "Thread", _SyncThread)

    job = _create()
    started = svc.start_job_run(job.id)
    # The HTTP caller sees a running job immediately (async run lifecycle).
    assert started.status == "running"
    assert started.processed_count == 0
    # The worker (run synchronously here) drove it to completion + persisted it.
    final = svc.get_job(job.id)
    assert final.status == "completed"
    assert final.processed_count == 1


def test_run_already_running_raises(fake_repo):
    job = _create()
    job.status = "running"
    svc.repo.save_job(job)
    with pytest.raises(svc.JobStateError):
        svc.run_job(job.id)


def test_dataset_stats_amplification(fake_repo, monkeypatch):
    job = _create()
    job.source_bytes = 1000
    job.depth_bytes = 3000
    job.processed_count = 2
    svc.repo.save_job(job)
    stats = svc.get_dataset_stats()
    assert stats.total_jobs == 1
    assert stats.images_processed == 2
    assert stats.depth_maps_stored == 2
    assert stats.total_bytes == 4000
    assert stats.amplification_ratio == 4.0


# --- encoding ---------------------------------------------------------------


def test_encode_png16_is_16bit():
    depth = np.array([[0.0, 1.0], [2.0, 3.0]], dtype="float32")
    img = Image.open(io.BytesIO(encode.encode_png16(depth)))
    arr = np.array(img)
    assert img.size == (2, 2)
    assert int(arr.max()) == 65535
    assert int(arr.min()) == 0


def test_encode_preview_is_rgb():
    depth = np.linspace(0, 1, 16).reshape(4, 4).astype("float32")
    img = Image.open(io.BytesIO(encode.encode_preview_png(depth)))
    assert img.mode == "RGB"
    assert img.size == (4, 4)


def test_encode_npy_roundtrip():
    depth = np.arange(9, dtype="float32").reshape(3, 3)
    loaded = np.load(io.BytesIO(encode.encode_npy(depth)))
    assert loaded.shape == (3, 3)
    assert loaded.dtype == np.float32


def test_encode_handles_flat_depth():
    depth = np.zeros((3, 3), dtype="float32")
    img = Image.open(io.BytesIO(encode.encode_png16(depth)))
    assert int(np.array(img).max()) == 0
