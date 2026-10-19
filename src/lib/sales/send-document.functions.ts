// Emails a quote or invoice to the customer through the company's own mailbox
// (Settings → Email, src/lib/settings/mail.functions.ts). Without one, sending is refused with a
// prompt to connect it: we don't send business email on a company's behalf.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as React from "react";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const NO_MAILBOX = "NO_MAILBOX";
// Staff who may send documents outside the company; read-only and ops roles can't.
const SENDER_ROLES = ["org_owner", "org_admin", "manager", "sales_rep", "accountant"];

export const sendDocumentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    doc: z.enum(["quote", "invoice"]),
    id: z.string().uuid(),
    to: z.string().trim().toLowerCase().email().max(254),
    message: z.string().trim().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; message: string } | { error: string; code?: string }> => {
    const sb = context.supabase;
    const table = data.doc === "quote" ? "quotes" : "invoices";
    const { data: d } = await sb.from(table).select("*").eq("id", data.id).maybeSingle();
    if (!d) return { error: "Document not found." };
    const { data: allowed } = await sb.rpc("has_org_role", { _org: d.org_id, _roles: SENDER_ROLES as never });
    if (allowed !== true) return { error: "Your role can't email documents to customers." };
    if (d.status === "void") return { error: "Void documents can't be sent." };

    const { loadOrgMailbox } = await import("@/lib/settings/mail.functions");
    let box: Awaited<ReturnType<typeof loadOrgMailbox>>;
    try {
      box = await loadOrgMailbox(d.org_id);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "The saved mailbox couldn't be read." };
    }
    if (!box) return { error: "Connect your company mailbox in Settings → Email first.", code: NO_MAILBOX };

    const [{ data: lines }, { data: org }] = await Promise.all([
      data.doc === "quote"
        ? sb.from("quote_items").select("description,quantity,unit_price,line_total").eq("quote_id", data.id).order("position")
        : sb.from("invoice_items").select("description,quantity,unit_price,line_total").eq("invoice_id", data.id).order("position"),
      sb.from("organizations").select("name,email").eq("id", d.org_id).maybeSingle(),
    ]);
    const orgName = org?.name ?? "Inuberry";
    const kind = data.doc === "quote" ? "Quote" : "Invoice";
    const doc = d as Record<string, any>;
    const due = data.doc === "quote" ? doc.expiry_date : doc.due_date;
    const totals: [string, number][] = [["Subtotal", doc.subtotal], ["Tax", doc.tax_total], ["Total", doc.total]];
    if (Number(doc.discount_total) > 0) totals.splice(1, 0, ["Discount", -Number(doc.discount_total)]);
    if (data.doc === "invoice") totals.push(["Paid", doc.amount_paid], ["Balance due", doc.balance_due]);

    const { DocumentEmail } = await import("@/lib/email-templates/document");
    const { render } = await import("@react-email/render");
    const element = React.createElement(DocumentEmail, {
      kind, number: doc.number, orgName, message: data.message, currency: doc.currency ?? "USD",
      meta: [doc.issue_date && `issued ${doc.issue_date}`, due && `${data.doc === "quote" ? "valid until" : "due"} ${due}`].filter(Boolean).join(" · "),
      lines: (lines ?? []), totals,
    });

    const { sendSmtpEmail, smtpErrorMessage } = await import("@/lib/email/smtp.server");
    try {
      await sendSmtpEmail(box.smtp, {
        fromName: box.fromName || orgName,
        fromEmail: box.fromEmail,
        to: data.to,
        replyTo: box.replyTo || org?.email || null,
        subject: `${kind} ${doc.number} from ${orgName}`,
        html: await render(element),
        text: await render(element, { plainText: true }),
      });
    } catch (e) {
      console.error("[sendDocumentEmail]", e);
      return { error: `Email could not be sent: ${smtpErrorMessage(e)}` };
    }

    if (doc.status === "draft") {
      if (data.doc === "invoice") await sb.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", data.id);
      else await sb.from("quotes").update({ status: "sent" }).eq("id", data.id);
    }
    await sb.from("audit_logs").insert({
      org_id: d.org_id, user_id: context.userId, action: `${data.doc}.emailed`,
      entity_type: data.doc, entity_id: data.id, diff: { to: data.to, number: doc.number },
    });
    return { ok: true, message: `${kind} ${doc.number} emailed to ${data.to}.` };
  });
