CREATE OR REPLACE FUNCTION public.ensure_org_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _plan uuid;
BEGIN
  SELECT id INTO _plan FROM public.subscription_plans WHERE code = 'business';
  IF _plan IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.organization_subscriptions (org_id, plan_id, status, billing_cycle, current_period_start, trial_ends_at)
  VALUES (NEW.id, _plan, 'trialing', 'monthly', now(), now() + interval '14 days')
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_org_subscription() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_default_subscription ON public.organizations;
CREATE TRIGGER trg_org_default_subscription
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.ensure_org_subscription();