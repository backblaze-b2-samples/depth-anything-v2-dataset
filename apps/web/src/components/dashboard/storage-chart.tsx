"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobs } from "@/lib/queries";
import { humanizeBytes } from "@/lib/utils";

const chartConfig = {
  source: { label: "Source", color: "var(--chart-2)" },
  depth: { label: "Depth", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function StorageChart() {
  const { data: jobs = [], isLoading, error, refetch } = useJobs();

  // One stacked bar per job: source bytes + depth bytes. This is the write
  // amplification story — depth roughly doubles the object count and bytes.
  const data = useMemo(
    () =>
      jobs
        .filter((j) => j.source_bytes + j.depth_bytes > 0)
        .slice(0, 8)
        .map((j) => ({
          name: j.name.length > 14 ? j.name.slice(0, 13) + "…" : j.name,
          source: j.source_bytes,
          depth: j.depth_bytes,
        })),
    [jobs]
  );

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Storage: source vs depth</CardTitle>
        <CardDescription className="text-xs">
          Bytes stored per job — the write-amplification story
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No depth data yet"
            description="Run a depth job to see source-vs-depth storage here."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                fontSize={11}
                width={52}
                tickFormatter={(v) => humanizeBytes(Number(v))}
              />
              <ChartTooltip
                cursor={{ fill: "var(--accent-subtle)" }}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="flex w-full justify-between gap-3">
                        <span className="capitalize text-muted-foreground">{name}</span>
                        <span className="font-mono tabular-nums">
                          {humanizeBytes(Number(value))}
                        </span>
                      </span>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="source" stackId="s" fill="var(--color-source)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="depth" stackId="s" fill="var(--color-depth)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
