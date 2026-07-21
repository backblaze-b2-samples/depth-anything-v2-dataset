import { Badge } from "@/components/ui/badge";
import type { DepthJobStatus } from "@depth-anything-v2-dataset/shared";

const VARIANT: Record<
  DepthJobStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
};

export function JobStatusBadge({ status }: { status: DepthJobStatus }) {
  return (
    <Badge variant={VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );
}
