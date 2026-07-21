"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createJob,
  deleteFile,
  deleteJob,
  getDatasetStats,
  getFiles,
  getFileStats,
  getHealth,
  getJob,
  getJobPairs,
  getJobs,
  getLibraryPairs,
  getPreviewUrl,
  getSourcePrefixes,
  getUploadActivity,
  renameJob,
  runJob,
} from "@/lib/api-client";
import type {
  CreateDepthJobInput,
  DepthJob,
  FileMetadata,
} from "@depth-anything-v2-dataset/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  health: () => [...qk.all, "health"] as const,
  jobs: () => [...qk.all, "jobs"] as const,
  job: (id: string) => [...qk.all, "jobs", id] as const,
  jobPairs: (id: string) => [...qk.all, "jobs", id, "pairs"] as const,
  libraryPairs: (limit: number) => [...qk.all, "library", "pairs", limit] as const,
  datasetStats: () => [...qk.all, "dataset-stats"] as const,
  sourcePrefixes: () => [...qk.all, "source-prefixes"] as const,
};

export type Health = Awaited<ReturnType<typeof getHealth>>;

export function useFiles(prefix = "", limit = 100) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
  });
}

export function useFileStats() {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Health poll for the top-of-app B2 banner. `retry: false` and letting a
// failed fetch leave `data` undefined keeps a down API silent (the
// per-component ErrorState covers that); the banner only reacts to an up API
// reporting b2_connected: false. Polls every 60s and on window focus.
export function useHealth() {
  return useQuery<Health>({
    queryKey: qk.health(),
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    // After delete, blow away every cached file list + stats. Cheap and
    // correct — the dashboard re-fetches lazily as components remount.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- Depth Jobs -------------------------------------------------------------

export function useJobs() {
  return useQuery<DepthJob[], ApiError>({
    queryKey: qk.jobs(),
    queryFn: getJobs,
  });
}

// While a run is in progress the backend advances status/processed_count, so
// poll until the job reaches a terminal state, then stop.
export function useJob(id: string | undefined) {
  return useQuery<DepthJob, ApiError>({
    queryKey: qk.job(id ?? ""),
    queryFn: () => getJob(id as string),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 1500 : false,
  });
}

// `poll` is driven by the caller (true while the parent job is running) so the
// pairs grid refreshes as the manifest is written; polling stops otherwise.
export function useJobPairs(id: string | undefined, poll = false) {
  return useQuery({
    queryKey: qk.jobPairs(id ?? ""),
    queryFn: () => getJobPairs(id as string),
    enabled: !!id,
    refetchInterval: poll ? 1500 : false,
  });
}

export function useLibraryPairs(limit = 200) {
  return useQuery({
    queryKey: qk.libraryPairs(limit),
    queryFn: () => getLibraryPairs(limit),
  });
}

export function useDatasetStats() {
  return useQuery({
    queryKey: qk.datasetStats(),
    queryFn: getDatasetStats,
  });
}

export function useSourcePrefixes() {
  return useQuery({
    queryKey: qk.sourcePrefixes(),
    queryFn: getSourcePrefixes,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepthJobInput) => createJob(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.jobs() }),
  });
}

export function useRenameJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameJob(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.jobs() });
      qc.invalidateQueries({ queryKey: qk.job(id) });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJob(id),
    // A completed job's artifacts feed the dashboard + Library, so invalidate
    // everything under the app root key.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}

export function useRunJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runJob(id),
    // A run writes depth artifacts + updates stats — refresh broadly.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}
