export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  // Image-specific (this app ingests images only)
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Depth Anything V2 dataset ---

export type DepthModelVariant = "small" | "base" | "large";
export type DepthOutputFormat = "png16" | "npy" | "both";
export type DepthJobStatus = "pending" | "running" | "completed" | "failed";

export interface DepthJob {
  id: string;
  name: string;
  source_prefix: string;
  model: DepthModelVariant;
  model_id: string;
  output_format: DepthOutputFormat;
  device: string;
  status: DepthJobStatus;
  created_at: string;
  updated_at: string;
  image_count: number;
  processed_count: number;
  source_bytes: number;
  depth_bytes: number;
  device_used: string | null;
  error: string | null;
}

/** A source image paired with its generated depth artifacts, with presigned
 *  URLs for browser rendering (the preview is an 8-bit colorized PNG). */
export interface DepthPair {
  image_key: string;
  depth_key: string | null;
  preview_key: string | null;
  image_url: string | null;
  preview_url: string | null;
  width: number;
  height: number;
  source_bytes: number;
  depth_bytes: number;
  job_id: string | null;
}

export interface DepthDatasetStats {
  total_jobs: number;
  images_processed: number;
  depth_maps_stored: number;
  source_bytes: number;
  depth_bytes: number;
  total_bytes: number;
  source_bytes_human: string;
  depth_bytes_human: string;
  total_bytes_human: string;
  amplification_ratio: number;
}

export interface CreateDepthJobInput {
  name: string;
  source_prefix: string;
  model: DepthModelVariant;
  output_format: DepthOutputFormat;
  device?: string;
}
