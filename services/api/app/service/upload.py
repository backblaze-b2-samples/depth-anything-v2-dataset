import re

from app.config import settings
from app.repo import upload_file
from app.service.metadata import extract_metadata
from app.types import FileUploadResponse
from app.types.formatting import humanize_bytes

# This app ingests source RGB images only — depth estimation runs over images.
# Note: image/svg+xml is deliberately excluded. SVGs can embed <script>, so a
# file stored and later served from a public bucket URL would execute in the
# browser (stored XSS). Re-add only with server-side SVG sanitization.
ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

MIME_EXTENSION_MAP: dict[str, set[str]] = {
    "image/jpeg": {"jpg", "jpeg", "jfif"},
    "image/png": {"png"},
    "image/webp": {"webp"},
}

# Magic-byte signatures for the image types we accept. The client-declared
# content_type is untrusted, so we sniff the leading bytes and reject obvious
# mismatches (e.g. an HTML/script payload uploaded as image/png).
def matches_content_signature(data: bytes, content_type: str) -> bool:
    """Return True if `data`'s leading bytes are consistent with `content_type`.

    Types without a known signature return True (nothing to verify).
    """
    if content_type == "image/jpeg":
        return data[:3] == b"\xff\xd8\xff"
    if content_type == "image/png":
        return data[:8] == b"\x89PNG\r\n\x1a\n"
    if content_type == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return True

_SAFE_FILENAME_RE = re.compile(r"[^\w\-.]")


def sanitize_filename(filename: str) -> str:
    """Sanitize filename: strip path components, remove unsafe chars, limit length."""
    name = filename.replace("\\", "/").split("/")[-1]
    name = name.replace("\x00", "")
    name = _SAFE_FILENAME_RE.sub("_", name)
    name = re.sub(r"[_.]{2,}", "_", name)
    name = name.lstrip(".").strip()
    if len(name) > 200:
        base, sep, ext = name.rpartition(".")
        # Preserve the extension only when there is one that still fits;
        # otherwise (no dot, or an absurdly long "extension") hard-truncate.
        # `rpartition` returns ("", "", name) when there is no dot, so guard on
        # `sep`, not `ext` — else an extensionless name keeps its whole body.
        name = (
            base[: 200 - len(ext) - 1] + "." + ext
            if sep and len(ext) < 200
            else name[:200]
        )
    return name or "unnamed"


def sanitize_scene(scene: str) -> str:
    """Sanitize an optional scene/session name into a single safe path segment.

    Slashes are collapsed (a scene is exactly one prefix level under uploads/),
    unsafe chars are replaced, and empty/all-unsafe input yields "" so the caller
    falls back to the flat uploads/ prefix.
    """
    name = scene.replace("\\", "/").replace("/", "_")
    name = name.replace("\x00", "")
    name = _SAFE_FILENAME_RE.sub("_", name)
    name = re.sub(r"[_.]{2,}", "_", name)
    name = name.strip("._")
    return name[:100]


def upload_prefix(scene: str = "") -> str:
    """The B2 prefix (ending in /) ingested files land under for a given scene.
    Defaults to the flat uploads/ prefix when no (usable) scene is given."""
    seg = sanitize_scene(scene)
    return f"uploads/{seg}/" if seg else "uploads/"


def validate_extension_matches_type(filename: str, content_type: str) -> bool:
    """Verify the file extension is consistent with the declared MIME type."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_exts = MIME_EXTENSION_MAP.get(content_type)
    if allowed_exts is None:
        return False
    if not ext:
        return True
    return ext in allowed_exts


class UploadError(Exception):
    """Raised when upload validation fails."""

    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def process_upload(
    file_data: bytes,
    filename: str,
    content_type: str,
    content_length: int | None = None,
    scene: str = "",
) -> FileUploadResponse:
    """Validate and process a file upload. Raises UploadError on failure.

    An optional `scene` groups ingested files under a per-scene sub-prefix
    (uploads/<scene>/); empty scene keeps the flat uploads/ prefix.
    """
    if not filename:
        raise UploadError("No filename provided")

    if content_length and content_length > settings.max_file_size:
        raise UploadError(
            f"File too large. Max size: {humanize_bytes(settings.max_file_size)}",
            status_code=413,
        )

    if content_type not in ALLOWED_TYPES:
        raise UploadError(
            f"File type '{content_type}' not allowed", status_code=415
        )

    safe_name = sanitize_filename(filename)

    if not validate_extension_matches_type(safe_name, content_type):
        raise UploadError(
            "File extension does not match declared content type",
            status_code=415,
        )

    if len(file_data) == 0:
        raise UploadError("Empty file")

    if not matches_content_signature(file_data, content_type):
        raise UploadError(
            "File contents do not match the declared type", status_code=415
        )

    if len(file_data) > settings.max_file_size:
        raise UploadError(
            f"File too large. Max size: {humanize_bytes(settings.max_file_size)}",
            status_code=413,
        )

    # B2 buckets are always versioned — uploading the same key creates a new
    # version automatically.  No duplicate rejection needed.
    key = f"{upload_prefix(scene)}{safe_name}"
    result = upload_file(file_data, key, content_type)
    metadata = extract_metadata(file_data, safe_name, content_type)

    return FileUploadResponse(
        key=result.key,
        filename=result.filename,
        size_bytes=result.size_bytes,
        size_human=result.size_human,
        content_type=content_type,
        uploaded_at=result.uploaded_at,
        url=result.url,
        metadata=metadata,
    )
