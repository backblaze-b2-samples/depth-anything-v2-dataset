<!-- last_verified: 2026-07-21 -->
# Feature: Metadata Extraction

## Purpose
Extract image metadata (dimensions, EXIF) and checksums from ingested images and
return it alongside upload results. Source resolution is relevant to depth output.

## Used By
- API: `POST /upload` (called after B2 upload)
- UI: upload results, file metadata panel

## Core Functions
- `services/api/app/service/metadata.py` — `extract_metadata()`, `_extract_image_metadata()`
- `apps/web/src/components/files/file-metadata-panel.tsx` — displays metadata

## Canonical Files
- Metadata extraction pattern: `services/api/app/service/metadata.py`
- Metadata display component: `apps/web/src/components/files/file-metadata-panel.tsx`

## Inputs
- file_data: bytes
- filename: string
- content_type: string

## Outputs
- `FileMetadataDetail`: filename, size_bytes, size_human, mime_type, extension, md5, sha256, uploaded_at
- Image-specific (optional): image_width, image_height, exif dict

## Flow
- Upload route stores the image in B2, then calls `extract_metadata()`
- Computes MD5 and SHA-256 hashes
- For images, opens with Pillow (lazily imported) and extracts dimensions + EXIF
- Returns `FileMetadataDetail`; the frontend renders it in the file metadata panel

## Edge Cases
- Corrupt image → Pillow fails silently, image fields remain null
- Unknown content type → only common fields populated (hashes, size, extension)
- EXIF binary values → decoded UTF-8 with replace, converted to string

> This app ingests images only. PDF and audio/video metadata branches from the
> starter kit were removed (and `PyPDF2` dropped from `requirements.txt`).

## UX States
- Not applicable (metadata is part of the upload response and file preview)

## Verification
- Test files: covered indirectly via `services/api/tests/test_upload_validation.py`
- Required cases: image with EXIF, image without EXIF, corrupt-image handling
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Image Ingest](file-upload.md)
