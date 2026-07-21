"use client";

import Link from "next/link";
import { Images } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PairsGrid } from "@/components/jobs/pairs-grid";
import { useLibraryPairs } from "@/lib/queries";

export function PairsLibrary() {
  const { data: pairs = [], isLoading, error, refetch } = useLibraryPairs();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState
            error={error}
            title="Couldn't load the library"
            onRetry={() => refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Images}
            title="No pairs yet"
            description="Run a depth job to populate the library with source → depth pairs."
            action={
              <Button asChild size="sm">
                <Link href="/jobs">Go to Depth Jobs</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return <PairsGrid pairs={pairs} />;
}
