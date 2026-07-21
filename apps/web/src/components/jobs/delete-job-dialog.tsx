"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiError } from "@/lib/api-client";
import { useDeleteJob } from "@/lib/queries";

interface DeleteJobDialogProps {
  id: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteJobDialog({
  id,
  name,
  open,
  onOpenChange,
}: DeleteJobDialogProps) {
  const router = useRouter();
  const del = useDeleteJob();

  const onConfirm = () => {
    del.mutate(id, {
      onSuccess: () => {
        toast.success(`Job "${name}" deleted`);
        onOpenChange(false);
        router.push("/jobs");
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Delete failed");
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete job?</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            This permanently deletes{" "}
            <strong className="font-semibold text-foreground">{name}</strong> —
            its depth artifacts, manifest, and record. Deletion is prefix-scoped
            to this job&apos;s output; source images are not touched. This cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={del.isPending}
            className={buttonVariants({ variant: "destructive" })}
          >
            {del.isPending ? "Deleting…" : "Delete job"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
