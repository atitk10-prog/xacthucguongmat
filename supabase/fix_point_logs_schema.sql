-- Ensure point_logs has the 'date' column for local date filtering
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'point_logs' AND column_name = 'date') THEN
        ALTER TABLE public.point_logs ADD COLUMN date DATE;
        -- Populate date from created_at for existing records
        UPDATE public.point_logs SET date = (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'ICT')::DATE WHERE date IS NULL;
    END IF;
END $$;

-- Fix created_by reference if it was pointing to auth.users (sometimes problematic in RLS)
-- Better to point to public.users if that's where student info is
-- ALTER TABLE public.point_logs DROP CONSTRAINT IF EXISTS point_logs_created_by_fkey;
-- ALTER TABLE public.point_logs ADD CONSTRAINT point_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

-- Ensure correct columns in getPointStatistics (points vs amount)
-- This is just a reminder, the TypeScript code was already updated to use 'points'.
