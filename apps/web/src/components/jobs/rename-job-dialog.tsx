"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ApiError } from "@/lib/api-client";
import { useRenameJob } from "@/lib/queries";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(100),
});

type FormValues = z.infer<typeof schema>;

interface RenameJobDialogProps {
  id: string;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameJobDialog({
  id,
  currentName,
  open,
  onOpenChange,
}: RenameJobDialogProps) {
  const rename = useRenameJob(id);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: currentName },
  });

  // The edit form opens pre-filled with the real job's current name.
  useEffect(() => {
    if (open) form.reset({ name: currentName });
  }, [open, currentName, form]);

  const onSubmit = (values: FormValues) => {
    rename.mutate(values.name.trim(), {
      onSuccess: () => {
        toast.success("Job renamed");
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Rename failed");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Rename job</DialogTitle>
          <DialogDescription>
            Update the job&apos;s display name. This rewrites its record in B2.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={rename.isPending}>
                {rename.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
