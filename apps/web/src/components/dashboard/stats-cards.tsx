"use client";

import { Layers, ImageIcon, Boxes, HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useDatasetStats } from "@/lib/queries";

export function StatsCards() {
  const { data: stats, isLoading, error, refetch } = useDatasetStats();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { title: "Depth Jobs", value: stats?.total_jobs ?? 0, icon: Layers, sub: null },
    {
      title: "Images Processed",
      value: stats?.images_processed ?? 0,
      icon: ImageIcon,
      sub: null,
    },
    {
      title: "Depth Maps Stored",
      value: stats?.depth_maps_stored ?? 0,
      icon: Boxes,
      sub: null,
    },
    {
      title: "Total Storage",
      value: stats?.total_bytes_human ?? "0 B",
      icon: HardDrive,
      sub: stats
        ? `${stats.source_bytes_human} source + ${stats.depth_bytes_human} depth · ${stats.amplification_ratio}× amplification`
        : null,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1}`}
        >
          <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-5 px-4">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="stat-value">{card.value}</div>
                {card.sub && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{card.sub}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
