-- Customer portal: link an invited portal user to their login. Invited rows have user_id NULL and the
-- customer may only read their own (linked) row, so the browser could never link itself and every portal
-- page stayed empty. This SECURITY DEFINER function claims invites addressed to the signed-in user's
-- own confirmed email, and stamps last_login_at.
CREATE OR REPLACE FUNCTION public.claim_portal_invites()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text;
  _n int;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users
  WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL THEN RETURN 0; END IF;

  UPDATE public.customer_portal_users
  SET user_id = auth.uid(), status = 'active'
  WHERE lower(email) = _email AND user_id IS NULL AND status IN ('invited', 'active');
  GET DIAGNOSTICS _n = ROW_COUNT;

  UPDATE public.customer_portal_users SET last_login_at = now()
  WHERE user_id = auth.uid() AND status = 'active';
  RETURN _n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_portal_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_portal_invites() TO authenticated;