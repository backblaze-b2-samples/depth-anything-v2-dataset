"use client";

import Image from "next/image";
import type { DepthPair } from "@depth-anything-v2-dataset/shared";

function keyName(key: string) {
  return key.split("/").pop() ?? key;
}

function PairImage({
  url,
  alt,
  label,
}: {
  url: string | null;
  alt: string;
  label: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-muted/30">
        {url ? (
          // Presigned URLs carry their own short expiry — `unoptimized` avoids
          // Next caching them past that window. The depth side renders the
          // 8-bit colorized preview PNG (browser-renderable), not the raw 16-bit.
          <Image
            src={url}
            alt={alt}
            fill
            sizes="(max-width: 768px) 45vw, 220px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            n/a
          </div>
        )}
      </div>
      <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export function PairsGrid({ pairs }: { pairs: DepthPair[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {pairs.map((pair) => (
        <div
          key={pair.image_key}
          className="rounded-lg border border-border bg-card p-3 space-y-2"
        >
          <div className="flex gap-2">
            <PairImage url={pair.image_url} alt="Source image" label="Source" />
            <PairImage url={pair.preview_url} alt="Depth preview" label="Depth" />
          </div>
          <div className="min-w-0">
            <p
              className="truncate text-xs font-medium text-foreground"
              title={keyName(pair.image_key)}
            >
              {keyName(pair.image_key)}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {pair.width}×{pair.height}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
