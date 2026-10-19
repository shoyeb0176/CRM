-- Each company's own outgoing mailbox (SMTP). Quotes and invoices are emailed through it.
-- We don't run mail servers for companies: without this row, document email is blocked with a
-- prompt to connect a mailbox. Auth emails (sign-up, invite, reset) still use the platform sender.
--
-- The password is encrypted by the app (APP_ENCRYPTION_KEY, AES-GCM) and is never readable by
-- users: only the service role reads it, when sending. Writes go through server functions.

CREATE TABLE IF NOT EXISTS public.org_mail_settings (
  org_id        uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  host          text NOT NULL CHECK (length(host) BETWEEN 3 AND 253),
  port          integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  security      text NOT NULL DEFAULT 'starttls' CHECK (security IN ('ssl', 'starttls')),
  username      text NOT NULL CHECK (length(username) BETWEEN 1 AND 320),
  password_enc  text NOT NULL,
  from_name     text,
  from_email    text NOT NULL CHECK (from_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  reply_to      text CHECK (reply_to IS NULL OR reply_to ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  verified_at   timestamptz,
  last_error    text,
  updated_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_mail_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.org_mail_settings FROM anon, authenticated;
-- Users may read every column except the password.
GRANT SELECT (org_id, host, port, security, username, from_name, from_email, reply_to,
              verified_at, last_error, updated_at) ON public.org_mail_settings TO authenticated;
GRANT ALL ON public.org_mail_settings TO service_role;

DROP POLICY IF EXISTS org_mail_settings_select ON public.org_mail_settings;
CREATE POLICY org_mail_settings_select ON public.org_mail_settings
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, ARRAY['org_owner', 'org_admin']::public.app_role[]));

DROP TRIGGER IF EXISTS org_mail_settings_set_updated_at ON public.org_mail_settings;
CREATE TRIGGER org_mail_settings_set_updated_at BEFORE UPDATE ON public.org_mail_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();