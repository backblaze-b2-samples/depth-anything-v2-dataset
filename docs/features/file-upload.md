<!-- last_verified: 2026-07-21 -->
# Feature: Image Ingest (Upload)

## Purpose
Ingest source RGB images from the browser to Backblaze B2 with real-time progress,
ready to run a Depth Job over.

## Used By
- UI: `/upload` page, upload form component
- API: `POST /upload`

## Core Functions
- `apps/web/src/components/upload/upload-form.tsx` — orchestrates dropzone + progress + state
- `apps/web/src/components/upload/dropzone.tsx` — drag-and-drop via `react-dropzone`
- `apps/web/src/lib/upload-file-types.ts` — client allow-list (images only)
- `apps/web/src/lib/api-client.ts` — `uploadFile()` using XHR for progress events
- `services/api/app/runtime/upload.py` — HTTP handler, reads file chunks
- `services/api/app/service/upload.py` — validates and orchestrates upload
- `services/api/app/repo/b2_client.py` — `upload_file()` via boto3 `put_object`
- `services/api/app/service/metadata.py` — `extract_metadata()` after upload

## Canonical Files
- Service orchestration pattern: `services/api/app/service/upload.py`
- Frontend upload flow: `apps/web/src/components/upload/upload-form.tsx`

## Inputs
- file: `File` (browser multipart form data)
- content_type: string (image/jpeg, image/png, image/webp)

## Outputs
- `FileUploadResponse`: key, filename, size, content_type, uploaded_at, url, metadata
- Side effect: image stored in B2 under `uploads/{sanitized_filename}`

## Flow
- User drops or selects images in the dropzone
- Client validates size (max 100MB) and type — this app accepts JPEG / PNG / WebP only
- XHR sends multipart POST to `/upload` with progress events
- API checks `Content-Length` early, validates type against the image allow-list
  (SVG excluded — stored-XSS risk), sanitizes the filename, checks extension↔type,
  reads in 1MB chunks with streaming size enforcement, rejects empty files, and
  verifies the leading bytes match the declared image type (magic-byte check)
- API stores under `uploads/{sanitized_filename}` via `put_object`, extracts
  metadata (checksums + image dimensions), and returns `FileUploadResponse`

## Edge Cases
- File exceeds 100MB → client-rejected row + toast; API returns 413 if bypassed
- Non-image type → API returns 415
- Extension mismatches MIME type → API returns 415
- Bytes don't match declared image type → API returns 415
- No filename → 400; empty file → 400
- Duplicate filename → B2 creates a new version (buckets are versioned)
- B2 unreachable → API returns 500; UI keeps failed rows retryable

## UX States
- Empty: dropzone with instructions
- Loading: per-file progress bars
- Error: red status icon + per-file reason, retry when applicable
- Complete: green checkmark, "Clear finished"

## Verification
- Test files: `services/api/tests/test_upload_validation.py`,
  `services/api/tests/test_upload_conflict.py`, `services/api/tests/test_error_handling.py`
- Required cases: successful image upload, oversized (413), disallowed type (415),
  extension mismatch (415), content-signature mismatch (415), empty file (400),
  duplicate filename allowed, `uploads_total` metric increments
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Metadata Extraction](metadata-extraction.md)
- [Depth Jobs](depth-jobs.md)
- [App Workflows](../app-workflows.md)
