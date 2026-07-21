import logging

# Handlers are sync `def` on purpose: the whole chain is blocking boto3 + local
# CPU inference. Starlette runs sync handlers in its threadpool, so a slow Depth
# Anything run never stalls the event loop (see runtime/files.py for the same
# rationale).
from fastapi import APIRouter, HTTPException

from app.service.jobs import (
    JobNotFoundError,
    JobStateError,
    create_job,
    delete_job,
    get_dataset_stats,
    get_job,
    get_job_pairs,
    get_library_pairs,
    list_jobs,
    list_source_prefixes,
    rename_job,
    run_job,
)
from app.types import (
    CreateDepthJob,
    DepthDatasetStats,
    DepthJob,
    DepthPair,
    RenameDepthJob,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Collection + literal routes (declared BEFORE /jobs/{job_id}) -----------


@router.post("/jobs", response_model=DepthJob, status_code=201)
def create_job_endpoint(body: CreateDepthJob):
    return create_job(body)


@router.get("/jobs", response_model=list[DepthJob])
def list_jobs_endpoint():
    return list_jobs()


@router.get("/jobs/stats", response_model=DepthDatasetStats)
def dataset_stats_endpoint():
    return get_dataset_stats()


@router.get("/jobs/source-prefixes", response_model=list[str])
def source_prefixes_endpoint():
    return list_source_prefixes()


@router.get("/library/pairs", response_model=list[DepthPair])
def library_pairs_endpoint(limit: int = 200):
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
    return get_library_pairs(limit=limit)


# --- Item routes ------------------------------------------------------------


@router.get("/jobs/{job_id}", response_model=DepthJob)
def get_job_endpoint(job_id: str):
    try:
        return get_job(job_id)
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.patch("/jobs/{job_id}", response_model=DepthJob)
def rename_job_endpoint(job_id: str, body: RenameDepthJob):
    try:
        return rename_job(job_id, body.name)
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.delete("/jobs/{job_id}")
def delete_job_endpoint(job_id: str):
    try:
        delete_job(job_id)
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Failed to delete job") from None
    return {"deleted": True, "id": job_id}


@router.post("/jobs/{job_id}/run", response_model=DepthJob)
def run_job_endpoint(job_id: str):
    try:
        return run_job(job_id)
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except JobStateError as e:
        raise HTTPException(status_code=409, detail=e.detail) from None


@router.get("/jobs/{job_id}/pairs", response_model=list[DepthPair])
def job_pairs_endpoint(job_id: str):
    try:
        return get_job_pairs(job_id)
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
