import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Inuberry" },
      { name: "description", content: "How Inuberry collects, uses, and protects personal data." },
      { property: "og:title", content: "Privacy Policy — Inuberry" },
      { property: "og:description", content: "How Inuberry collects, uses, and protects personal data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy">
      <p>
        This Privacy Policy explains how {LEGAL.company} ("we", "us") collects,
        uses, and discloses personal data when you use Inuberry.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email, password hash, profile photo, organization membership.</li>
        <li><strong>Customer Data:</strong> records you create in the product (contacts, deals, invoices, employees, etc.).</li>
        <li><strong>Billing data:</strong> handled by Stripe; we store a customer ID and subscription metadata but not card numbers.</li>
        <li><strong>Usage data:</strong> logs, IP, device, browser, page events used for security, debugging, and product analytics.</li>
        <li><strong>AI prompts:</strong> prompts and tool calls executed by your agents.</li>
      </ul>

      <h2>2. How we use data</h2>
      <ul>
        <li>To provide, secure, and improve the Service.</li>
        <li>To process payments and prevent fraud.</li>
        <li>To send transactional emails (receipts, invoices, security alerts).</li>
        <li>To respond to support requests.</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <p>We do not sell personal data. We do not use Customer Data to train foundation AI models.</p>

      <h2>3. Legal bases (GDPR)</h2>
      <p>We process personal data on the basis of contract performance, legitimate interests (security, product analytics), legal obligation, and consent where required.</p>

      <h2>4. Subprocessors</h2>
      <p>We use the following subprocessors to deliver the Service:</p>
      <ul>
        <li>Supabase / Lovable Cloud — application hosting, database, auth, storage.</li>
        <li>Stripe — payment processing.</li>
        <li>Resend — transactional email.</li>
        <li>OpenAI and/or Anthropic — AI model inference (per-organization key).</li>
        <li>Sentry — error monitoring (when enabled).</li>
        <li>PostHog (EU Cloud) — product analytics inside the app, only if you accept optional cookies: pages you open, your user ID and email, and your workspace's name and plan. Typed text is masked in session recordings. No customer, invoice or other business records.</li>
        <li>Google Analytics 4 — visits to our public website, only if you accept optional cookies. Anonymous: no names, emails or account IDs, and Google signals are off.</li>
      </ul>
      <p>Current subprocessor list is updated as we add vendors.</p>

      <h2>5. International transfers</h2>
      <p>
        Data may be processed in the United States, the European Union, and
        other regions where our subprocessors operate. We rely on Standard
        Contractual Clauses or equivalent safeguards for cross-border transfers.
      </p>

      <h2>6. Retention</h2>
      <p>
        We retain Customer Data while your Workspace is active and for up to 30
        days after deletion to allow recovery, after which it is permanently
        removed from primary systems. Backups are rotated within 90 days.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on your jurisdiction, you may have the right to access,
        correct, delete, port, or restrict processing of your personal data,
        and to object or withdraw consent. You can exercise most rights
        directly inside the Service or by emailing{" "}
        <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
      </p>

      <h2>8. Security</h2>
      <p>
        We use encryption in transit (TLS) and at rest, row-level security on
        all multi-tenant tables, leaked-password protection, and least-privilege
        access for our team. See our <a href="/legal/security">Security</a> page.
      </p>

      <h2>9. Children</h2>
      <p>The Service is not directed at children under 16. Do not use it if you are below that age.</p>

      <h2>10. Cookies</h2>
      <p>
        We use strictly necessary cookies for authentication and CSRF
        protection, and optional analytics cookies (PostHog in the app, Google
        Analytics on the website) only when you choose "Accept all" on the
        cookie banner shown on your first visit. "Necessary only" turns both off.
        To change your choice, clear this site's data in your browser and the
        banner will ask again.
      </p>

      <h2>11. Contact</h2>
      <p>
        Privacy enquiries: <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
        Data Protection Officer: <a href={`mailto:${LEGAL.dpoEmail}`}>{LEGAL.dpoEmail}</a>.
      </p>

      <p className="text-xs text-muted-foreground">
        This page is maintained by {LEGAL.company} and should be reviewed by
        qualified legal counsel before public launch.
      </p>
    </LegalPage>
  );
}
