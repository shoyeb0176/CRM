// One file, shown as a card: an icon for its type (or a thumbnail for images), name, size, and
// optional remove / open actions and upload state. Used by FileDropzone and AttachmentsPanel.
import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Check, File, FileArchive, FileImage, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FileKind = "sheet" | "pdf" | "image" | "doc" | "archive" | "text" | "other";

export function fileKind(name: string, mime?: string | null): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const m = mime ?? "";
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (["csv", "xls", "xlsx", "ods", "tsv"].includes(ext) || m.includes("spreadsheet") || m === "text/csv") return "sheet";
  if (["zip", "gz", "tar", "rar", "7z"].includes(ext) || m.includes("zip")) return "archive";
  if (["doc", "docx", "odt", "rtf", "pages"].includes(ext) || m.includes("word")) return "doc";
  if (["txt", "md", "json", "xml", "html"].includes(ext) || m.startsWith("text/")) return "text";
  return "other";
}

const ICON = { sheet: FileSpreadsheet, pdf: FileText, image: FileImage, doc: FileText, archive: FileArchive, text: FileText, other: File };
const KIND_LABEL: Record<FileKind, string> = { sheet: "Spreadsheet", pdf: "PDF", image: "Image", doc: "Document", archive: "Archive", text: "Text", other: "File" };

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function FileCard({ name, size, mime, file, note, status, onRemove, onOpen, actions, className }: {
  name: string;
  size?: number;
  mime?: string | null;
  /** The local file, for an image thumbnail before upload. */
  file?: File;
  /** Extra line under the name, e.g. "120 rows, 6 columns". */
  note?: ReactNode;
  status?: "uploading" | "done" | "error";
  onRemove?: () => void;
  onOpen?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const kind = fileKind(name, mime ?? file?.type);
  const Icon = ICON[kind];
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== "image" || !file) return;
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file, kind]);

  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase() : KIND_LABEL[kind];
  return (
    <div className={cn("flex items-center gap-3 border border-border bg-card p-2.5", status === "error" && "border-destructive/50", className)}>
      <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden bg-muted">
        {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <Icon className="size-5 text-muted-foreground" aria-hidden />}
        <span className="absolute inset-x-0 bottom-0 bg-foreground/80 text-center font-mono text-xs leading-4 text-background">{ext.slice(0, 4)}</span>
      </div>
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-sm font-medium hover:underline">{name}</button>
        ) : (
          <div className="truncate text-sm font-medium">{name}</div>
        )}
        <div className="truncate text-xs text-muted-foreground">
          {[KIND_LABEL[kind], size != null ? formatBytes(size) : null].filter(Boolean).join(" · ")}
          {note ? <> · {note}</> : null}
        </div>
      </div>
      {status === "uploading" && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Uploading" />}
      {status === "done" && <Check className="size-4 shrink-0 text-success" aria-label="Uploaded" />}
      {status === "error" && <AlertCircle className="size-4 shrink-0 text-destructive" aria-label="Upload failed" />}
      {actions}
      {onRemove && (
        <button type="button" onClick={onRemove} className="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${name}`}>
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
