import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Inuberry" },
      { name: "description", content: "The terms that govern your use of Inuberry." },
      { property: "og:title", content: "Terms of Service — Inuberry" },
      { property: "og:description", content: "The terms that govern your use of Inuberry." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service">
      <p>
        These Terms of Service ("Terms") govern your access to and use of the
        Inuberry platform, websites, and related services (collectively, the
        "Service") provided by {LEGAL.company} ("we", "us", "our"). By creating
        an account or using the Service you agree to these Terms.
      </p>

      <h2>1. Accounts and organizations</h2>
      <p>
        To use the Service you must create an account and may create or join one
        or more organizations ("Workspaces"). You are responsible for activity
        on your account, for keeping your credentials secure, and for the
        actions of users you invite to a Workspace you own or administer.
      </p>

      <h2>2. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service to violate any law or third-party rights.</li>
        <li>Reverse engineer, resell, or sublicense the Service except as expressly permitted.</li>
        <li>Attempt to gain unauthorized access to other Workspaces or our systems.</li>
        <li>Upload malware, send spam, or use the Service to harass others.</li>
      </ul>

      <h2>3. Subscriptions, billing, and trials</h2>
      <p>
        Paid features are billed in advance on a recurring basis through our
        payment processor (Stripe). Subscriptions renew automatically until
        canceled. You can cancel at any time from the in-app billing portal;
        cancellation takes effect at the end of the current billing period and
        prior fees are non-refundable except where required by law or stated in
        our Refund Policy.
      </p>

      <h2>4. Your data</h2>
      <p>
        You retain ownership of all data you submit to the Service ("Customer
        Data"). You grant us a limited license to host, process, and transmit
        Customer Data solely to provide the Service. Our processing of personal
        data is described in our Privacy Policy and Data Processing Addendum.
      </p>

      <h2>5. AI features</h2>
      <p>
        The Service includes AI agent features that may call third-party model
        providers using API keys you configure. Prompts, tool calls, and
        responses may be sent to those providers under their terms. We do not
        use your Customer Data to train foundation models.
      </p>

      <h2>6. Service availability and changes</h2>
      <p>
        We aim for high availability but do not guarantee uninterrupted access.
        We may modify, suspend, or discontinue features with reasonable notice.
        Material changes to these Terms will be posted on this page with an
        updated effective date and, where appropriate, notified by email.
      </p>

      <h2>7. Warranty disclaimer</h2>
      <p>
        The Service is provided "as is" and "as available". To the maximum
        extent permitted by law, we disclaim all warranties, express or
        implied, including merchantability, fitness for a particular purpose,
        and non-infringement.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our aggregate liability arising
        out of or relating to the Service will not exceed the fees you paid to
        us in the twelve (12) months preceding the event giving rise to the
        claim. We will not be liable for indirect, incidental, special,
        consequential, or punitive damages, or for lost profits or data.
      </p>

      <h2>9. Termination</h2>
      <p>
        Either party may terminate for convenience at any time. We may suspend
        or terminate accounts that violate these Terms. Upon termination, your
        right to access the Service ends; you may export Customer Data for a
        limited period as described in our Privacy Policy.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, USA,
        without regard to its conflict-of-laws principles. The parties consent
        to the exclusive jurisdiction of the state and federal courts located
        in Delaware.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms? Email <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
      </p>

      <p className="text-xs text-muted-foreground">
        This page is maintained by {LEGAL.company}. It is a template and should
        be reviewed by qualified legal counsel before public launch.
      </p>
    </LegalPage>
  );
}
