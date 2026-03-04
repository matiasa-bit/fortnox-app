-- Enable and harden RLS for public.customers (Security Advisor)
DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Service role can do everything" ON public.customers';
    EXECUTE 'CREATE POLICY "Service role can do everything" ON public.customers FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;
