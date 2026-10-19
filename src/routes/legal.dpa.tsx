import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/dpa")({
  head: () => ({
    meta: [
      { title: "Data Processing Addendum — Inuberry" },
      { name: "description", content: "Inuberry's Data Processing Addendum for customers subject to GDPR or similar regimes." },
      { property: "og:title", content: "Data Processing Addendum — Inuberry" },
      { property: "og:description", content: "Inuberry's Data Processing Addendum for GDPR and similar regimes." },
    ],
  }),
  component: DpaPage,
});

function DpaPage() {
  return (
    <LegalPage eyebrow="Legal" title="Data Processing Addendum">
      <p>
        This Data Processing Addendum ("DPA") supplements the Terms of Service
        between {LEGAL.company} ("Processor") and the customer ("Controller")
        and applies whenever Processor processes Personal Data on behalf of
        Controller in the course of providing the Service.
      </p>

      <h2>1. Definitions</h2>
      <p>"Personal Data", "Processing", "Controller", "Processor", and "Data Subject" have the meanings given in the GDPR.</p>

      <h2>2. Subject matter and duration</h2>
      <p>Processor processes Personal Data only to provide the Service for the duration of the Controller's subscription, plus the retention period set out in the Privacy Policy.</p>

      <h2>3. Nature and purpose</h2>
      <p>Processing covers hosting, storage, backup, transmission, retrieval, and support of Personal Data contained in records the Controller creates in Inuberry, including CRM contacts, employees, customers, and invoice recipients.</p>

      <h2>4. Subprocessors</h2>
      <p>Controller authorizes the subprocessors listed in the Privacy Policy. Processor will give 30 days' notice of any new subprocessor and provide a reasonable mechanism to object.</p>

      <h2>5. Security measures</h2>
      <ul>
        <li>Encryption in transit (TLS 1.2+) and at rest.</li>
        <li>Row-level security on all multi-tenant data tables.</li>
        <li>Role-based access control and least-privilege for Processor personnel.</li>
        <li>Audit logging of sensitive operations.</li>
        <li>Leaked-password protection on customer accounts.</li>
      </ul>

      <h2>6. International transfers</h2>
      <p>For transfers out of the EEA/UK/Switzerland, the parties incorporate the EU Standard Contractual Clauses (Module Two: Controller-to-Processor) by reference, with Processor as data importer.</p>

      <h2>7. Data subject requests</h2>
      <p>Processor will assist Controller in responding to data-subject requests using in-product tooling where available. Direct requests received by Processor will be forwarded to the Controller without undue delay.</p>

      <h2>8. Breach notification</h2>
      <p>Processor will notify Controller without undue delay and in any case within 72 hours of becoming aware of a Personal Data Breach affecting Controller's Personal Data.</p>

      <h2>9. Audits</h2>
      <p>Processor will make available the most recent third-party reports and respond to reasonable written audit questionnaires once per year.</p>

      <h2>10. Deletion</h2>
      <p>Upon termination, Processor will delete or return all Personal Data within 30 days unless retention is required by law.</p>

      <h2>11. Acceptance</h2>
      <p>
        Customers can execute this DPA by countersigning and emailing it to{" "}
        <a href={`mailto:${LEGAL.dpoEmail}`}>{LEGAL.dpoEmail}</a>. Use of the
        Service constitutes acceptance of this DPA where countersignature is
        not required.
      </p>

      <p className="text-xs text-muted-foreground">
        Template — review with qualified legal counsel before relying on this
        DPA for regulated customers.
      </p>
    </LegalPage>
  );
}
