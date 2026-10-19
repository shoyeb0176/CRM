import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { FileCard } from "@/components/ui/file-card";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { supabase } from "@/integrations/supabase/client";
import {
  confirmUpload, deleteAttachment, getAttachmentUrl, requestUpload, type AttachmentEntity,
} from "@/lib/attachments/attachments.functions";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
type Row = { id: string; file_name: string; size_bytes: number; created_at: string; mime_type: string | null };
type Queued = { key: string; file: File; status: "waiting" | "uploading" | "done" | "error" };

/** Files attached to one record. Upload, download and delete; stored in the workspace's quota. */
export function AttachmentsPanel({ orgId, entityType, entityId, className }: {
  orgId: string | null | undefined; entityType: AttachmentEntity; entityId: string; className?: string;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  // Files being uploaded right now, shown as cards with their state.
  const [queue, setQueue] = useState<Queued[]>([]);
  const uploading = queue.some((q) => q.status === "waiting" || q.status === "uploading");
  const request = useServerFn(requestUpload);
  const confirm = useServerFn(confirmUpload);
  const getUrl = useServerFn(getAttachmentUrl);
  const remove = useServerFn(deleteAttachment);
  const key = ["attachments", entityType, entityId];

  const files = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("attachments")
        .select("id,file_name,size_bytes,created_at,mime_type")
        .eq("entity_type", entityType).eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function upload(list: FileList | File[] | null) {
    if (!list?.length || !orgId) return;
    const batch: Queued[] = Array.from(list).map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, status: "waiting" }));
    setQueue((q) => [...q.filter((x) => x.status !== "done"), ...batch]);
    const mark = (key: string, status: Queued["status"]) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, status } : x)));
    for (const { key: k, file } of batch) {
      mark(k, "uploading");
      try {
        const { path, token } = await request({ data: { orgId, entityType, entityId, fileName: file.name, size: file.size } });
        const { error } = await supabase.storage.from("org-files").uploadToSignedUrl(path, token, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (error) throw new Error(error.message);
        const { id } = await confirm({ data: { orgId, entityType, entityId, fileName: file.name, path, mimeType: file.type || undefined } });
        mark(k, "done");
        // A wrong file can be taken back straight away.
        toast.success(`${file.name} attached`, {
          duration: 10_000,
          action: { label: "Undo", onClick: () => { void removeById(id, file.name); } },
        });
      } catch (e) {
        mark(k, "error");
        toast.error(e instanceof Error ? e.message : `Could not upload ${file.name}`);
      }
      qc.invalidateQueries({ queryKey: key });
    }
    if (input.current) input.current.value = "";
    qc.invalidateQueries({ queryKey: ["org-storage-used"] });
    // Finished cards fade out once the list below shows the files.
    setTimeout(() => setQueue((q) => q.filter((x) => x.status !== "done")), 1500);
  }

  async function removeById(id: string, name: string) {
    try {
      await remove({ data: { id } });
      toast.success(`${name} removed`);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["org-storage-used"] });
    } catch (e) {
      toast.error(friendlyError(e, "Could not remove the file"));
    }
  }

  async function download(row: Row) {
    try {
      const { url } = await getUrl({ data: { id: row.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(friendlyError(e, "Could not open the file"));
    }
  }

  async function del(row: Row) {
    if (!confirm_(`Delete ${row.file_name}?`)) return;
    await removeById(row.id, row.file_name);
  }

  return (
    <section
      className={className ?? "border border-border bg-background"}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
          <Paperclip className="size-3.5 text-primary" /> Attachments
          {files.data && files.data.length > 0 && <span className="text-muted-foreground">({files.data.length})</span>}
        </h2>
        <Button variant="kit" size="kit"
          type="button"
          onClick={() => input.current?.click()}
          disabled={!!uploading || !orgId}
          className="gap-1 px-2 py-1 hover:bg-muted"
        >
          <Upload className="size-3" /> {uploading ? "Uploading…" : "Add files"}
        </Button>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} aria-label="Choose files to attach" />
      </header>
      <div className="p-2">
        {queue.length > 0 && (
          <ul className="mb-2 grid gap-2" aria-label="Uploads">
            {queue.map((q, i) => (
              <li key={q.key}>
                <FileCard
                  name={q.file.name} size={q.file.size} file={q.file}
                  status={q.status === "waiting" ? undefined : q.status}
                  note={q.status === "waiting" ? "Waiting" : q.status === "uploading" ? `Uploading ${i + 1} of ${queue.length}` : q.status === "error" ? "Didn't upload" : "Attached"}
                  onRemove={q.status === "error" || q.status === "waiting" ? () => setQueue((list) => list.filter((x) => x.key !== q.key)) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
        {files.isLoading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : !files.data?.length ? (
          <FileDropzone
            multiple
            disabled={!!uploading || !orgId}
            onFiles={upload}
            label={uploading ? "Uploading…" : undefined}
            hint="Contracts, receipts and documents, up to 50 MB each."
            className="py-6"
          />
        ) : (
          <ul className="grid gap-2">
            {files.data.map((f) => (
              <li key={f.id}>
                <FileCard
                  name={f.file_name} size={Number(f.size_bytes)} mime={f.mime_type}
                  note={new Date(f.created_at).toLocaleDateString()}
                  onOpen={() => download(f)}
                  actions={(
                    <>
                      <Button variant="bare" size="bare" type="button" onClick={() => download(f)} className="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Download ${f.file_name}`}>
                        <Download className="size-4" />
                      </Button>
                      <Button variant="bare" size="bare" type="button" onClick={() => del(f)} className="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${f.file_name}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const confirm_ = (msg: string) => window.confirm(msg);
