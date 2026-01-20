-- 1. Ensure total_points column exists in users table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'total_points') THEN
        ALTER TABLE public.users ADD COLUMN total_points INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Create point_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.point_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT,
    type TEXT DEFAULT 'manual', -- 'manual', 'checkin', 'boarding'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admin/Teachers can see all logs
-- We drop existing policies first to properly update them if they changed
DROP POLICY IF EXISTS "Admins and Teachers can view all point logs" ON public.point_logs;
CREATE POLICY "Admins and Teachers can view all point logs" 
ON public.point_logs FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('admin', 'teacher')
    )
);

-- Policy: Users can see their own logs
DROP POLICY IF EXISTS "Users can view their own point logs" ON public.point_logs;
CREATE POLICY "Users can view their own point logs" 
ON public.point_logs FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Policy: Admin/Teachers can insert logs
DROP POLICY IF EXISTS "Admins and Teachers can insert point logs" ON public.point_logs;
CREATE POLICY "Admins and Teachers can insert point logs" 
ON public.point_logs FOR INSERT 
TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('admin', 'teacher')
    )
);

-- 3. Create RPC function to safely add/deduct points
CREATE OR REPLACE FUNCTION public.add_user_points(p_user_id UUID, p_points INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE public.users
    SET total_points = COALESCE(total_points, 0) + p_points
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant permissions
GRANT ALL ON public.point_logs TO postgres;
GRANT ALL ON public.point_logs TO authenticated;
GRANT ALL ON public.point_logs TO service_role;
GRANT EXECUTE ON FUNCTION public.add_user_points TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_points TO service_role;
