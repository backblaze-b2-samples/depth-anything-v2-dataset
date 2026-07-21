import { PairsLibrary } from "@/components/library/pairs-library";

export default function LibraryPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Pairs Library</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          Every source image paired with its generated depth map, across all
          jobs. Scoped to the sample&apos;s own depth/ output prefix — the
          training-ready dataset, served from Backblaze B2 via presigned URLs.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <PairsLibrary />
      </div>
    </div>
  );
}
