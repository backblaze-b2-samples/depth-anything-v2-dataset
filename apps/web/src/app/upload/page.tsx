import { UploadForm } from "@/components/upload/upload-form";

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Ingest images</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Drag in the source RGB images for your dataset (JPEG, PNG, or WebP, up
          to 100 MB each). They land under the <code>uploads/</code> prefix (or
          <code>uploads/&lt;scene&gt;/</code> if you name a scene), ready to run a
          Depth Job over. Or run <code>scripts/seed-demo.py</code> to populate a{" "}
          <code>demo-scene/</code> prefix.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <UploadForm />
      </div>
    </div>
  );
}
