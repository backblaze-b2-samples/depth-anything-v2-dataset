"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { FileRejection } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dropzone } from "./dropzone";
import { UploadProgress, type UploadItem } from "./upload-progress";
import { uploadFile } from "@/lib/api-client";
import { humanizeBytes } from "@/lib/utils";
import { useRefresh } from "@/lib/refresh-context";

const MAX_TOAST_FILE_NAME_LENGTH = 80;

function createUploadItem(file: File): UploadItem {
  return {
    id: `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`,
    file,
    progress: 0,
    retryable: true,
    status: "uploading",
  };
}

function createRejectedItem(file: File, error: string): UploadItem {
  return {
    id: `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`,
    file,
    progress: 0,
    error,
    retryable: false,
    status: "error",
  };
}

function formatToastFileName(name: string) {
  if (name.length <= MAX_TOAST_FILE_NAME_LENGTH) return name;

  const sliceLength = Math.floor((MAX_TOAST_FILE_NAME_LENGTH - 3) / 2);
  return `${name.slice(0, sliceLength)}...${name.slice(-sliceLength)}`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getUploadSummary(items: UploadItem[]) {
  const uploadingCount = items.filter(
    (item) => item.status === "uploading"
  ).length;
  const completeCount = items.filter((item) => item.status === "complete").length;
  const errorCount = items.filter((item) => item.status === "error").length;

  if (uploadingCount > 0) {
    const label = formatCount(uploadingCount, "file");
    return `${label} uploading. New files can be added when this queue finishes.`;
  }

  if (errorCount > 0 && completeCount > 0) {
    const completeLabel = formatCount(completeCount, "file");
    const errorLabel = formatCount(errorCount, "file");
    return `${completeLabel} uploaded. ${errorLabel} need attention.`;
  }

  if (errorCount > 0) {
    return `${formatCount(errorCount, "file")} need attention.`;
  }

  if (completeCount > 0) {
    return `${formatCount(completeCount, "file")} uploaded.`;
  }

  return "";
}

export function UploadForm() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scene, setScene] = useState("");
  // The actual B2 prefix the last batch landed under (derived from the server's
  // returned key), used to prefill the "Create a Depth Job" deep link.
  const [destPrefix, setDestPrefix] = useState<string | null>(null);
  const { triggerRefresh } = useRefresh();

  const uploadItems = useCallback(
    async (queue: UploadItem[], sceneArg: string) => {
      if (queue.length === 0) return;

      setUploading(true);
      let anySuccess = false;

      try {
        for (const item of queue) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    error: undefined,
                    progress: 0,
                    retryable: true,
                    status: "uploading",
                  }
                : i
            )
          );

          try {
            const resp = await uploadFile(
              item.file,
              (percent) => {
                setItems((prev) =>
                  prev.map((i) =>
                    i.id === item.id ? { ...i, progress: percent } : i
                  )
                );
              },
              sceneArg
            );
            // Derive the true destination prefix from the returned key so the
            // "Create a Depth Job" CTA targets exactly what was just ingested.
            const slash = resp.key.lastIndexOf("/");
            if (slash >= 0) setDestPrefix(resp.key.slice(0, slash + 1));
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? { ...i, status: "complete", progress: 100 }
                  : i
              )
            );
            toast.success(
              `${formatToastFileName(item.file.name)} uploaded successfully`
            );
            anySuccess = true;
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Upload failed";
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? { ...i, status: "error", error: message, retryable: true }
                  : i
              )
            );
            const toastName = formatToastFileName(item.file.name);
            toast.error(`Failed to upload ${toastName}: ${message}`);
          }
        }
      } finally {
        setUploading(false);
        if (anySuccess) triggerRefresh();
      }
    },
    [triggerRefresh]
  );

  const handleFilesRejected = useCallback((rejections: FileRejection[]) => {
    const rejectedItems: UploadItem[] = [];

    for (const rejection of rejections) {
      const name = rejection.file.name;
      const errors = rejection.errors.map((e) => {
        if (e.code === "file-too-large") {
          return `exceeds 100MB limit (${humanizeBytes(rejection.file.size)})`;
        }
        if (e.code === "file-invalid-type") {
          return "file type not supported";
        }
        return e.message;
      });
      const message = errors.join(", ") || "File could not be added.";
      rejectedItems.push(createRejectedItem(rejection.file, message));
      toast.error(`${formatToastFileName(name)}: ${message}`);
    }

    setItems((prev) => [...prev, ...rejectedItems]);
  }, []);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (uploading) {
        toast.info("Wait for the current upload queue to finish first.");
        return;
      }

      const newItems = files.map(createUploadItem);
      setItems((prev) => [...prev, ...newItems]);
      void uploadItems(newItems, scene);
    },
    [uploadItems, uploading, scene]
  );

  const retryUpload = useCallback(
    (id: string) => {
      if (uploading) return;

      const item = items.find((i) => i.id === id);
      if (!item || item.retryable === false) return;

      void uploadItems([item], scene);
    },
    [items, uploadItems, uploading, scene]
  );

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === "uploading"));
  }, []);

  const hasCompleted = items.some(
    (i) => i.status === "complete" || i.status === "error"
  );
  const hasSuccessfulUpload = items.some((i) => i.status === "complete");
  const uploadSummary = getUploadSummary(items);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Upload Files</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="scene">Scene (optional)</Label>
          <Input
            id="scene"
            placeholder="e.g. living-room"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            disabled={uploading}
          />
          <p className="text-xs text-muted-foreground">
            Groups this batch under <code>uploads/&lt;scene&gt;/</code> so a Depth
            Job can target just this scene. Leave blank to ingest into the shared{" "}
            <code>uploads/</code> prefix.
          </p>
        </div>
        <Dropzone
          onFilesSelected={handleFilesSelected}
          onFilesRejected={handleFilesRejected}
          disabled={uploading}
        />
        {uploadSummary && (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">Upload queue</p>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {uploadSummary}
            </p>
          </div>
        )}
        <UploadProgress
          disabled={uploading}
          items={items}
          onRetry={retryUpload}
        />
        {hasCompleted && !uploading && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {hasSuccessfulUpload && destPrefix ? (
              <Button asChild size="sm">
                <Link
                  href={`/jobs?create=1&prefix=${encodeURIComponent(destPrefix)}`}
                >
                  Create a Depth Job from these images
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <Button
              aria-label="Clear completed and failed uploads"
              variant="outline"
              size="sm"
              onClick={clearCompleted}
            >
              Clear finished
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
