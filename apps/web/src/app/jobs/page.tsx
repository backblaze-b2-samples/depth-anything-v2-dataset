import { CreateJobDialog } from "@/components/jobs/create-job-dialog";
import { JobsTable } from "@/components/jobs/jobs-table";

export default function JobsPage() {
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
        <CreateJobDialog />
      </div>
      <div className="animate-fade-in-up stagger-2">
        <JobsTable />
      </div>
    </div>
  );
}
