import { JobDetail } from "@/components/jobs/job-detail";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JobDetail id={id} />;
}
