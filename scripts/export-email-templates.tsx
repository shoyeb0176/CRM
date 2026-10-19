// Export the sign-in emails as static HTML for Supabase Auth (used off Lovable).
//   bun run email:templates   →   deploy/email-templates/*.html
// Paste each file into Supabase → Authentication → Email Templates (matching template, subject below).
// Supabase fills the {{ .Placeholders }} when it sends.
import * as React from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { render } from "@react-email/render";
import { SignupEmail } from "../src/lib/email-templates/signup";
import { InviteEmail } from "../src/lib/email-templates/invite";
import { MagicLinkEmail } from "../src/lib/email-templates/magic-link";
import { RecoveryEmail } from "../src/lib/email-templates/recovery";
import { EmailChangeEmail } from "../src/lib/email-templates/email-change";
import { ReauthenticationEmail } from "../src/lib/email-templates/reauthentication";

const SITE_NAME = process.env.SITE_NAME ?? "Mini ERP by Inuberry";
const SITE_URL = "{{ .SiteURL }}";
const LINK = "{{ .ConfirmationURL }}";

const templates: Array<{ file: string; supabase: string; subject: string; el: React.ReactElement }> = [
  { file: "confirm-signup.html", supabase: "Confirm signup", subject: "Confirm your email",
    el: <SignupEmail siteName={SITE_NAME} siteUrl={SITE_URL} recipient="{{ .Email }}" confirmationUrl={LINK} /> },
  { file: "invite-user.html", supabase: "Invite user", subject: "You've been invited",
    el: <InviteEmail siteName={SITE_NAME} siteUrl={SITE_URL} confirmationUrl={LINK} /> },
  { file: "magic-link.html", supabase: "Magic Link", subject: "Your login link",
    el: <MagicLinkEmail siteName={SITE_NAME} confirmationUrl={LINK} /> },
  { file: "reset-password.html", supabase: "Reset Password", subject: "Reset your password",
    el: <RecoveryEmail siteName={SITE_NAME} confirmationUrl={LINK} /> },
  { file: "change-email.html", supabase: "Change Email Address", subject: "Confirm your new email",
    el: <EmailChangeEmail siteName={SITE_NAME} oldEmail="{{ .Email }}" email="{{ .Email }}" newEmail="{{ .NewEmail }}" confirmationUrl={LINK} /> },
  { file: "reauthentication.html", supabase: "Reauthentication", subject: "Your verification code",
    el: <ReauthenticationEmail token="{{ .Token }}" /> },
];

const dir = "deploy/email-templates";
mkdirSync(dir, { recursive: true });
const index: string[] = ["# Auth email templates for Supabase", "", "| Supabase template | Subject | File |", "|---|---|---|"];
for (const t of templates) {
  // react-email escapes attribute values; Supabase needs the raw {{ .X }} placeholders back.
  const html = (await render(t.el)).replace(/\{\{ \.(\w+) \}\}|&#x7B;&#x7B; \.(\w+) &#x7D;&#x7D;/g, (_m, a, b) => `{{ .${a ?? b} }}`);
  writeFileSync(`${dir}/${t.file}`, html);
  index.push(`| ${t.supabase} | ${t.subject} | ${t.file} |`);
}
writeFileSync(`${dir}/README.md`, index.join("\n") + "\n");
console.log(`Wrote ${templates.length} templates to ${dir}/`);
