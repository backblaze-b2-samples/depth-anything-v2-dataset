"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Play, Trash2, Images } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { JobStatusBadge } from "./job-status-badge";
import { PairsGrid } from "./pairs-grid";
import { RenameJobDialog } from "./rename-job-dialog";
import { DeleteJobDialog } from "./delete-job-dialog";
import { ApiError } from "@/lib/api-client";
import { useJob, useJobPairs, useRunJob } from "@/lib/queries";
import { humanizeBytes } from "@/lib/utils";

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right font-medium">{value}</span>
    </div>
  );
}

export function JobDetail({ id }: { id: string }) {
  const { data: job, isLoading, error, refetch } = useJob(id);
  const pairs = useJobPairs(id);
  const run = useRunJob(id);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (error) {
    return <ErrorState error={error} title="Couldn't load job" onRetry={() => refetch()} />;
  }
  if (isLoading || !job) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const amplification =
    job.source_bytes > 0
      ? ((job.source_bytes + job.depth_bytes) / job.source_bytes).toFixed(2)
      : "—";

  const onRun = () => {
    run.mutate(undefined, {
      onSuccess: (updated) => {
        if (updated.status === "completed") {
          toast.success(`Processed ${updated.processed_count} image(s)`);
        } else {
          toast.error(updated.error ?? "Job run failed");
        }
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Run failed");
      },
    });
  };

  const running = run.isPending || job.status === "running";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0 space-y-1.5">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            All jobs
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="page-title truncate">{job.name}</h1>
            <JobStatusBadge status={job.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onRun} disabled={running || job.status === "completed"}>
            <Play className="h-3.5 w-3.5" />
            {running ? "Running…" : "Run"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {job.status === "failed" && job.error && (
        <Alert variant="destructive">
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription className="break-words">{job.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            <StatRow label="Source prefix" value={job.source_prefix} />
            <StatRow label="Model" value={job.model} />
            <StatRow label="Output format" value={job.output_format} />
            <StatRow label="Device (requested)" value={job.device} />
            <StatRow label="Device (used)" value={job.device_used ?? "—"} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Dataset stats</CardTitle>
          </CardHeader>
          <CardContent className="p-5 grid gap-3 sm:grid-cols-2">
            <StatRow label="Images processed" value={`${job.processed_count}/${job.image_count}`} />
            <StatRow label="Depth maps stored" value={job.processed_count} />
            <StatRow label="Source bytes" value={humanizeBytes(job.source_bytes)} />
            <StatRow label="Depth bytes" value={humanizeBytes(job.depth_bytes)} />
            <StatRow
              label="Total stored"
              value={humanizeBytes(job.source_bytes + job.depth_bytes)}
            />
            <StatRow label="Amplification" value={`${amplification}×`} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Image → depth pairs</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {pairs.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full" />
              ))}
            </div>
          ) : pairs.error ? (
            <ErrorState error={pairs.error} onRetry={() => pairs.refetch()} />
          ) : (pairs.data ?? []).length === 0 ? (
            <EmptyState
              icon={Images}
              title="No pairs yet"
              description="Run the job to generate depth maps for its source images."
            />
          ) : (
            <PairsGrid pairs={pairs.data ?? []} />
          )}
        </CardContent>
      </Card>

      <RenameJobDialog
        id={job.id}
        currentName={job.name}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <DeleteJobDialog
        id={job.id}
        name={job.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
