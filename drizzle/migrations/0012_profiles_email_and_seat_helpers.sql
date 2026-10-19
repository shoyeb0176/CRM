-- Add email to profiles so member lists can show name + email without auth schema access.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.email IS DISTINCT FROM u.email;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END; $function$;

-- Count of active seats for an org (used for per-seat Stripe quantities).
CREATE OR REPLACE FUNCTION public.org_active_seat_count(_org uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(1, count(*)::int) FROM public.memberships
   WHERE org_id = _org AND status = 'active';
$function$;

REVOKE ALL ON FUNCTION public.org_active_seat_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_active_seat_count(uuid) TO authenticated, service_role;