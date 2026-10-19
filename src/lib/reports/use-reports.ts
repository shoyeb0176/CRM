import { useMemo, useState } from "react";

export function fmtMoney(n: number | string | null | undefined, ccy = "USD") {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, minimumFractionDigits: 2 }).format(v || 0);
}

export function fmtNum(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat().format(v || 0);
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function toCSV(rows: Array<Record<string, unknown>>, filename = "report.csv") {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function useDateRange(defaultFrom?: string, defaultTo?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = new Date().getFullYear() + "-01-01";
  const [from, setFrom] = useState(defaultFrom ?? firstOfYear);
  const [to, setTo] = useState(defaultTo ?? today);
  return { from, to, setFrom, setTo };
}

export function monthKey(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

export function useMonthBuckets(from: string, to: string) {
  return useMemo(() => {
    const out: string[] = [];
    const start = new Date(from); start.setDate(1);
    const end = new Date(to); end.setDate(1);
    while (start <= end) {
      out.push(monthKey(start));
      start.setMonth(start.getMonth() + 1);
    }
    return out;
  }, [from, to]);
}
