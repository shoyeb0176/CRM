// Turns raw database / API errors into messages people can act on.
type ErrLike = { code?: string; message?: string; details?: string; constraint?: string } | null | undefined;

const UNIQUE_MESSAGES: Array<[RegExp, string]> = [
  [/products_org_id_sku/i, "A product with this SKU already exists"],
  [/barcode/i, "A product with this barcode already exists"],
  [/organizations_slug|slug/i, "That address is already taken. Try another"],
  [/email/i, "Someone with this email already exists"],
  [/number/i, "That document number is already in use"],
  [/name/i, "Something with this name already exists"],
];

export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const err = e as ErrLike;
  const msg = typeof err?.message === "string" ? err.message : e instanceof Error ? e.message : "";
  const code = err?.code;
  if (code === "23505" || /duplicate key value violates unique constraint/i.test(msg)) {
    const hay = `${err?.constraint ?? ""} ${msg} ${err?.details ?? ""}`;
    for (const [re, text] of UNIQUE_MESSAGES) if (re.test(hay)) return text;
    return "This record already exists";
  }
  if (code === "23503") return "This is linked to other records and can't be changed that way";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "You don't have permission to do that";
  if (/JWT expired|refresh token|not authenticated/i.test(msg)) return "You were signed out. Sign in again to continue";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Couldn't reach the server. Check your connection and try again";
  if (code === "23502" || /violates not-null constraint/i.test(msg)) return "A required field is empty";
  if (code === "23514" || /violates check constraint/i.test(msg)) return "One of the values isn't allowed";
  if (code === "22P02" || /invalid input syntax/i.test(msg)) return "One of the values is in the wrong format";
  return msg || fallback;
}
