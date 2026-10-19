import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/security")({
  head: () => ({
    meta: [
      { title: "Security — Inuberry" },
      { name: "description", content: "How Inuberry secures customer data: encryption, access control, monitoring, and incident response." },
      { property: "og:title", content: "Security — Inuberry" },
      { property: "og:description", content: "Encryption, access control, monitoring, and incident response at Inuberry." },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <LegalPage eyebrow="Trust" title="Security">
      <p>
        This page is maintained by {LEGAL.company} to answer common security
        and privacy questions about Inuberry. It describes controls that are
        currently enabled in the product. It is not an independent
        certification.
      </p>

      <h2>Hosting and infrastructure</h2>
      <p>Inuberry runs on Lovable Cloud, which uses Supabase (Postgres) for database and authentication, and Cloudflare Workers for serverless compute. Customer data is hosted in managed cloud regions with provider-level physical security.</p>

      <h2>Encryption</h2>
      <ul>
        <li>TLS 1.2+ for all data in transit.</li>
        <li>AES-256 (or equivalent) at rest, managed by the underlying cloud provider.</li>
        <li>Application secrets stored in managed secret stores; never in source.</li>
      </ul>

      <h2>Tenant isolation</h2>
      <p>Every multi-tenant table uses Postgres Row-Level Security policies scoped to the requesting user's organization membership. Cross-tenant reads are blocked at the database layer, not the application layer.</p>

      <h2>Authentication</h2>
      <ul>
        <li>Email + password with leaked-password protection (HIBP) enabled.</li>
        <li>Google single sign-on.</li>
        <li>Password reset via signed one-time link.</li>
        <li>Customer Portal accounts are isolated from primary user accounts.</li>
      </ul>

      <h2>Authorization</h2>
      <p>Role-based access inside each organization (owner, admin, member, viewer) with separate role tables and security-definer helpers to prevent privilege-escalation through profile fields.</p>

      <h2>AI agents</h2>
      <p>AI agents run with the authenticated user's session and respect row-level security. Tool calls that mutate data can be gated behind an approval queue. Agent runs and tool calls are recorded in audit logs.</p>

      <h2>Monitoring and audit</h2>
      <ul>
        <li>Application errors captured in a managed error-tracking system.</li>
        <li>Auth events and sensitive admin actions written to audit_logs.</li>
        <li>Billing events written to billing_events.</li>
      </ul>

      <h2>Vulnerability disclosure</h2>
      <p>
        Found a security issue? Email{" "}
        <a href={`mailto:${LEGAL.securityEmail}`}>{LEGAL.securityEmail}</a> with
        a clear description and reproduction steps. We aim to acknowledge
        within two business days. Please do not publicly disclose until we have
        had a reasonable opportunity to remediate.
      </p>

      <h2>Backups and recovery</h2>
      <p>Daily automated backups are retained by our infrastructure provider. Restore drills are performed periodically.</p>

      <h2>Compliance</h2>
      <p>Inuberry is a young company; we do not currently hold third-party audit certifications such as SOC 2 or ISO 27001. A DPA is available on request.</p>
    </LegalPage>
  );
}
