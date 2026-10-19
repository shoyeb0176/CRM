-- Products with their on-hand stock and stock status, so the Products list can filter by stock and
-- page in the database instead of loading every product and every stock row into the browser.
-- security_invoker: the view runs with the reader's rights, so the products and inventory_stock
-- row-level security still decides what each person sees. Safe to run more than once (if products
-- gains columns later, DROP the view first: p.* is fixed when the view is made).

CREATE OR REPLACE VIEW public.products_with_stock WITH (security_invoker = true) AS
SELECT p.*,
       COALESCE(s.on_hand, 0) AS on_hand,
       CASE
         WHEN NOT p.track_inventory THEN 'untracked'
         WHEN COALESCE(s.on_hand, 0) <= 0 THEN 'out'
         WHEN p.low_stock_threshold IS NOT NULL AND COALESCE(s.on_hand, 0) <= p.low_stock_threshold THEN 'low'
         ELSE 'ok'
       END AS stock_status
FROM public.products p
LEFT JOIN (
  SELECT product_id, SUM(quantity) AS on_hand FROM public.inventory_stock GROUP BY product_id
) s ON s.product_id = p.id;

REVOKE ALL ON public.products_with_stock FROM anon;
GRANT SELECT ON public.products_with_stock TO authenticated, service_role;
