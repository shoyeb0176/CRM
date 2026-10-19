import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { submitDemoRequest } from "@/lib/forms/forms.functions";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact & Demo — Inuberry ERP" },
      { name: "description", content: "Request a personalized demo or get in touch with the Inuberry team." },
      { property: "og:title", content: "Contact & Demo — Inuberry ERP" },
      { property: "og:description", content: "Talk to our team about how Inuberry fits your business." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = useServerFn(submitDemoRequest);

  return (
    <MarketingShell>
      <section className="mx-auto max-w-7xl px-6 pt-24 pb-12">
        <div className="mb-6 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <span className="size-2 bg-primary" />
          CONTACT · Talk to the team
        </div>
        <h1 className="mb-6 max-w-3xl font-display text-5xl uppercase leading-[0.95] tracking-tighter md:text-7xl">
          Request a demo.
        </h1>
        <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
          See Inuberry running against a workspace like yours. A 30-minute walkthrough — no slides, no sales pressure.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-12 md:grid-cols-2">
        <div>
          {submitted ? (
            <div className="border border-border bg-foreground/[0.02] p-12 text-center">
              <div className="mb-4 font-mono text-xs uppercase tracking-widest text-primary">Received</div>
              <h2 className="mb-4 font-display text-3xl uppercase">We'll be in touch.</h2>
              <p className="text-muted-foreground">
                A member of our team will reach out within one business day to schedule your demo.
              </p>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
                setSending(true); setError(null);
                try {
                  await send({ data: { name: f.name, email: f.email, company: f.company, size: f.size || undefined, message: f.message || undefined } });
                  setSubmitted(true);
                } catch (err) {
                  setError(friendlyError(err, "Something went wrong. Please try again."));
                } finally {
                  setSending(false);
                }
              }}
              className="space-y-6"
            >
              <Field label="Full name" name="name" required />
              <Field label="Work email" name="email" type="email" required />
              <Field label="Company" name="company" required />
              <Field label="Team size" name="size" placeholder="e.g. 1-10, 10-50, 50+" />
              <div>
                <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  What are you hoping to solve?
                </label>
                <textarea
                  name="message"
                  rows={5}
                  className="w-full border border-input bg-card shadow-xs p-4 text-sm transition-colors focus:border-foreground focus:outline-none"
                />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button variant="kitSolid" size="kit"
                type="submit"
                disabled={sending}
                className="px-8 py-4 disabled:opacity-60 text-sm tracking-wider"
              >
                {sending ? "Sending…" : "Request demo"}
              </Button>
            </form>
          )}
        </div>

        <div className="space-y-8 md:pl-12">
          <div className="border-l border-primary pl-6">
            <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Prefer to skip the call?
            </div>
            <h3 className="mb-3 font-display text-2xl uppercase">Start free.</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Set up a workspace in a couple of minutes. Startup is free for small businesses, with no card needed.
            </p>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-block border border-foreground px-6 py-3 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-foreground hover:text-background"
            >
              Start free →
            </Link>
          </div>

          <div className="border border-border p-6 bg-card shadow-sm">
            <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Direct contact
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Sales</dt>
                <dd className="font-mono">sales@inuberry.app</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Support</dt>
                <dd className="font-mono">support@inuberry.app</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Hours</dt>
                <dd className="font-mono">Mon–Fri · 9–18 UTC</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label} {required && <span className="text-primary">*</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full border border-input bg-card shadow-xs p-3 text-sm transition-colors focus:border-foreground focus:outline-none"
      />
    </div>
  );
}
