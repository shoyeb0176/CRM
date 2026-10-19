
UPDATE public.subscription_plans SET stripe_price_id_monthly='starter_monthly',  stripe_price_id_yearly='starter_yearly'  WHERE code='starter';
UPDATE public.subscription_plans SET stripe_price_id_monthly='growth_monthly',   stripe_price_id_yearly='growth_yearly'   WHERE code='growth';
UPDATE public.subscription_plans SET stripe_price_id_monthly='business_monthly', stripe_price_id_yearly='business_yearly' WHERE code='business';

ALTER TABLE public.ai_agent_runs ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE public.ai_agent_runs ADD COLUMN IF NOT EXISTS model_used TEXT;
