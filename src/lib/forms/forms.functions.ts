import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { notifyOrg } from "@/lib/notify-org";

export type FormFieldType = "text" | "long_text" | "email" | "number" | "date" | "select" | "checkbox";

export type FormFieldDef = {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
};

const SlugInput = z.object({ slug: z.string().min(1).max(120) });
const SubmitInput = z.object({
  slug: z.string().min(1).max(120),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const getPublicForm = createServerFn({ method: "GET" })
  .validator((d: unknown) => SlugInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form } = await supabaseAdmin
      .from("form_definitions")
      .select("id,name,description,fields,submit_message,is_published")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!form || !form.is_published) return null;
    return {
      name: form.name,
      description: form.description,
      fields: (form.fields ?? []) as unknown as FormFieldDef[],
      submitMessage: form.submit_message,
    };
  });

/** Public submissions are limited per address, so a script can't flood a workspace. */
async function limitSubmissions(key: string, max: number, windowSeconds: number) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { clientIp, overLimit } = await import("@/lib/rate-limit.server");
  if (await overLimit(`${key}:${clientIp(getRequest())}`, max, windowSeconds)) {
    throw new Error("Too many submissions from your connection. Wait a few minutes and try again.");
  }
}

export const submitPublicForm = createServerFn({ method: "POST" })
  .validator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data }) => {
    await limitSubmissions(`form:${data.slug}`, 10, 600);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form } = await supabaseAdmin
      .from("form_definitions")
      .select("id,org_id,target,target_database_id,fields,is_published,submit_message")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!form || !form.is_published) throw new Error("This form is not available.");

    const fields = (form.fields ?? []) as unknown as FormFieldDef[];
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      const v = data.values[f.key];
      if (f.required && (v === undefined || v === null || v === "" || v === false)) {
        throw new Error(`${f.label} is required.`);
      }
      if (v !== undefined) values[f.key] = v;
    }

    // Human-readable copy keyed by the question label (used for stored responses + notes).
    const labelled: Record<string, unknown> = {};
    for (const f of fields) {
      if (values[f.key] === undefined) continue;
      let label = (f.label || f.key).trim() || f.key;
      if (label in labelled) label = `${label} (${f.key})`;
      labelled[label] = values[f.key];
    }

    let createdType: string | null = null;
    let createdId: string | null = null;

    if (form.target === "lead") {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .insert({
          org_id: form.org_id,
          name: String(values.name ?? values.full_name ?? values.email ?? "Website lead"),
          email: values.email ? String(values.email) : null,
          phone: values.phone ? String(values.phone) : null,
          company_name: values.company ? String(values.company) : null,
          source: "form",
          notes: Object.entries(labelled)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join("\n"),
        })
        .select("id")
        .maybeSingle();
      createdType = "lead";
      createdId = lead?.id ?? null;
    } else if (form.target === "custom_database" && form.target_database_id) {
      const { data: rec } = await supabaseAdmin
        .from("custom_records")
        .insert({ org_id: form.org_id, database_id: form.target_database_id, data: values as never })
        .select("id")
        .maybeSingle();
      createdType = "custom_record";
      createdId = rec?.id ?? null;
    }

    await supabaseAdmin.from("form_submissions").insert({
      org_id: form.org_id,
      form_id: form.id,
      data: labelled as never,
      created_entity_type: createdType,
      created_entity_id: createdId,
    });

    await notifyOrg(supabaseAdmin, form.org_id, {
      title: "New form submission",
      body: fields
        .slice(0, 3)
        .map((f) => `${f.label}: ${String(values[f.key] ?? "—")}`)
        .join(" · "),
      module: "forms",
      link: `/app/forms/${form.id}`,
    });

    return { ok: true, message: form.submit_message };
  });

const DemoInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  company: z.string().trim().min(1).max(200),
  size: z.string().trim().max(50).optional(),
  message: z.string().trim().max(5000).optional(),
});

/** Website "Request a demo" (/contact): a lead in the platform owner's workspace, plus an alert. */
export const submitDemoRequest = createServerFn({ method: "POST" })
  .validator((d: unknown) => DemoInput.parse(d))
  .handler(async ({ data }) => {
    await limitSubmissions("demo", 5, 600);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("organizations").select("id").eq("slug", "inuberry-platform").maybeSingle();
    if (!org) throw new Error("We couldn't send your request. Please email sales@inuberry.app.");
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert({
        org_id: org.id,
        name: data.name,
        email: data.email,
        company_name: data.company,
        source: "form",
        notes: [`Demo request (website /contact)`, data.size && `Team size: ${data.size}`, data.message && `Message: ${data.message}`]
          .filter(Boolean).join("\n"),
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error("We couldn't send your request. Please email sales@inuberry.app.");
    await notifyOrg(supabaseAdmin, org.id, {
      title: "New demo request",
      body: `${data.name} · ${data.company} · ${data.email}`,
      module: "crm",
      link: "/app/crm/leads",
      entityType: "lead",
      entityId: lead?.id,
    });
    return { ok: true };
  });
