"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ApiError } from "@/lib/api-client";
import { useCreateJob, useSourcePrefixes } from "@/lib/queries";

const CUSTOM = "__custom__";

// Finite-option fields use selectors (never free text); the create form surfaces
// safe defaults as placeholder / description guidance (never an autofill button).
const MODEL_OPTIONS = [
  { value: "small", label: "Small — fastest, CPU-friendly" },
  { value: "base", label: "Base — balanced quality/speed" },
  { value: "large", label: "Large — highest quality (slow on CPU)" },
] as const;

const FORMAT_OPTIONS = [
  { value: "png16", label: "16-bit PNG (training artifact)" },
  { value: "npy", label: "NumPy .npy" },
  { value: "both", label: "Both — 16-bit PNG + .npy" },
] as const;

const schema = z
  .object({
    name: z.string().min(1, "Give the job a name").max(100),
    model: z.enum(["small", "base", "large"]),
    output_format: z.enum(["png16", "npy", "both"]),
    source_prefix: z.string().min(1, "Choose or enter a source prefix"),
    custom_prefix: z.string().optional(),
  })
  .refine(
    (v) =>
      v.source_prefix !== CUSTOM || (v.custom_prefix?.trim().length ?? 0) > 0,
    { message: "Enter a source prefix", path: ["custom_prefix"] }
  );

type FormValues = z.infer<typeof schema>;

interface CreateJobDialogProps {
  // Deep-link from /upload: `?create=1&prefix=uploads/<scene>/` opens the dialog
  // with the just-ingested prefix prefilled, chaining ingest → job creation.
  // The parent (a server component) reads searchParams and passes these in, so
  // no client effect / Suspense boundary is needed to open the dialog.
  initialOpen?: boolean;
  initialPrefix?: string;
}

export function CreateJobDialog({
  initialOpen = false,
  initialPrefix = "",
}: CreateJobDialogProps = {}) {
  const [open, setOpen] = useState(initialOpen);
  const [prefixIsCustom, setPrefixIsCustom] = useState(!!initialPrefix);
  const { data: prefixes = [] } = useSourcePrefixes();
  const createJob = useCreateJob();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      model: "small",
      output_format: "png16",
      source_prefix: initialPrefix ? CUSTOM : "",
      custom_prefix: initialPrefix,
    },
  });

  // Strip the deep-link params after opening so a refresh / back-nav doesn't
  // reopen the dialog. No setState here — the open state is already seeded from
  // the initial props above.
  useEffect(() => {
    if (initialOpen) router.replace("/jobs", { scroll: false });
  }, [initialOpen, router]);

  const onSubmit = (values: FormValues) => {
    const prefix =
      values.source_prefix === CUSTOM
        ? values.custom_prefix!.trim()
        : values.source_prefix;
    createJob.mutate(
      {
        name: values.name.trim(),
        source_prefix: prefix,
        model: values.model,
        output_format: values.output_format,
      },
      {
        onSuccess: (job) => {
          toast.success(`Job "${job.name}" created`);
          setOpen(false);
          form.reset();
          setPrefixIsCustom(false);
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Failed to create job");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus className="h-3.5 w-3.5" />
          New job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New depth job</DialogTitle>
          <DialogDescription>
            Run Depth Anything V2 over a scene prefix. Artifacts and a manifest are
            written back to B2 alongside the source images.
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
                    <Input placeholder="e.g. Living-room scan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="source_prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source prefix</FormLabel>
                  <Select
                    onValueChange={(val) => {
                      field.onChange(val);
                      setPrefixIsCustom(val === CUSTOM);
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a bucket prefix" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {prefixes.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM}>Custom prefix…</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Pick the prefix your images landed under — the Upload page
                    writes to <code>uploads/</code> (or <code>uploads/&lt;scene&gt;/</code>
                    when you set a scene). Or run <code>scripts/seed-demo.py</code> to
                    populate <code>demo-scene/</code>.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {prefixIsCustom && (
              <FormField
                control={form.control}
                name="custom_prefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom prefix</FormLabel>
                    <FormControl>
                      <Input placeholder="my-scene/" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MODEL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Small is the recommended CPU-friendly default.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="output_format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Output format</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FORMAT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    A browser-viewable colorized preview is always written too.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createJob.isPending}>
                {createJob.isPending ? "Creating…" : "Create job"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
