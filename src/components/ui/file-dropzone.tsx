import { useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileCard } from "@/components/ui/file-card";

/**
 * Click-or-drop file picker: a dashed box with an upload icon. Native drag-and-drop, no library.
 * Pass `files` (and `onRemove`) to show the chosen files as cards that can be removed before
 * anything is submitted; the drop box then shrinks to "Replace" or "Add more".
 */
export function FileDropzone({
  onFiles, accept, multiple, hint, label, disabled, className, files, onRemove, fileNote,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  /** Small print under the prompt, e.g. "CSV, up to 5 MB". */
  hint?: ReactNode;
  /** Replaces the default prompt. */
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Files chosen so far (staged, not uploaded). */
  files?: File[];
  onRemove?: (index: number) => void;
  /** Extra line on a file's card, e.g. "120 rows". */
  fileNote?: (file: File, index: number) => ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const chosen = files ?? [];

  function take(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length || disabled) return;
    onFiles(multiple ? picked : picked.slice(0, 1));
    if (input.current) input.current.value = "";
  }

  const box = (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-border bg-card px-4 text-center transition-colors",
        chosen.length ? "py-3" : "py-8",
        "hover:border-primary/60 hover:bg-primary/5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
        over && "border-primary bg-primary/10",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {!chosen.length && <Upload className={cn("size-6", over ? "text-primary" : "text-muted-foreground")} aria-hidden />}
      <span className="text-sm">
        {chosen.length ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Upload className="size-4" aria-hidden />
            {multiple ? "Drop more files or click to add" : "Drop another file or click to replace"}
          </span>
        ) : label ?? (
          <>Drop {multiple ? "files" : "a file"} here or <span className="font-semibold text-primary underline underline-offset-2">click to choose</span></>
        )}
      </span>
      {hint && !chosen.length && <span className="text-xs text-muted-foreground">{hint}</span>}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => take(e.target.files)}
      />
    </label>
  );

  if (!chosen.length) return box;
  return (
    <div className="grid gap-2">
      <ul className="grid gap-2" aria-label="Chosen files">
        {chosen.map((f, i) => (
          <li key={`${f.name}-${f.size}-${i}`}>
            <FileCard name={f.name} size={f.size} file={f} note={fileNote?.(f, i)} onRemove={onRemove ? () => onRemove(i) : undefined} />
          </li>
        ))}
      </ul>
      {box}
    </div>
  );
}
