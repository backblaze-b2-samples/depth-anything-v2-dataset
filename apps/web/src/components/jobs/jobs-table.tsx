"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { JobStatusBadge } from "./job-status-badge";
import { useJobs } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function JobsTable() {
  const { data: jobs = [], isLoading, error, refetch } = useJobs();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState
            error={error}
            title="Couldn't load jobs"
            onRetry={() => refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Layers}
            title="No depth jobs yet"
            description="Create a job to run Depth Anything V2 over a scene prefix."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[28%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="w-[24%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Source prefix
              </TableHead>
              <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </TableHead>
              <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Images
              </TableHead>
              <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} className="table-row-hover">
                <TableCell className="font-medium">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="truncate text-primary hover:underline"
                  >
                    {job.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <span className="truncate block">{job.source_prefix}</span>
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">
                  {job.model}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {job.processed_count}/{job.image_count}
                </TableCell>
                <TableCell>
                  <JobStatusBadge status={job.status} />
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDate(job.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
