// Bug reports and tickets to the Inuberry team (platform_tickets, migration 0041).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BadgeTone } from "@/components/crm/status-badge";

export const REPORT_KINDS = [
  { value: "bug", label: "Something is broken" },
  { value: "issue", label: "Something is hard to use" },
  { value: "idea", label: "An idea" },
  { value: "question", label: "A question" },
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number]["value"];

export const TICKET_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "primary" },
  in_review: { label: "Being looked at", tone: "info" },
  in_progress: { label: "Being fixed", tone: "warning" },
  fixed: { label: "Fixed", tone: "success" },
  wont_fix: { label: "Won't change", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
};
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const kindLabel = (k: string) => REPORT_KINDS.find((x) => x.value === k)?.label ?? k;

/** Owners and reviewers see every report. */
export function useIsPlatformReviewer() {
  return useQuery({
    queryKey: ["is-platform-reviewer"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_reviewer");
      if (error) return false;
      return !!data;
    },
  });
}

/** A short-lived link to a report's screenshot. */
export async function screenshotUrl(path: string) {
  const { data } = await supabase.storage.from("feedback").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

/** "Chrome on Windows". */
export function describeBrowser(ua = navigator.userAgent) {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) && !/Mobile/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "another system";
  return `${browser} on ${os}`;
}

/** Ask the report dialog (mounted in the app frame) to open, e.g. from the search box. */
export function openReportDialog(kind?: ReportKind, title?: string) {
  window.dispatchEvent(new CustomEvent("inuberry:report", { detail: { kind, title } }));
}
