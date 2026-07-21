import { CreateJobDialog } from "@/components/jobs/create-job-dialog";
import { JobsTable } from "@/components/jobs/jobs-table";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string; prefix?: string }>;
}) {
  // Deep link from /upload → open the create dialog with the ingested prefix.
  const { create, prefix } = await searchParams;
  const initialOpen = create === "1";

  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Depth Jobs</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Run Depth Anything V2 over a scene prefix. Each job writes co-located
            depth maps and a manifest back to Backblaze B2.
          </p>
        </div>
        <CreateJobDialog
          initialOpen={initialOpen}
          initialPrefix={initialOpen ? (prefix ?? "") : ""}
        />
      </div>
      <div className="animate-fade-in-up stagger-2">
        <JobsTable />
      </div>
    </div>
  );
}
