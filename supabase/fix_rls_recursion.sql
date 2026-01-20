-- FIX RLS RECURSION (Definitive Fix)

-- 1. Create a Helper Function to get role safely (Avoids Recursion)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Grant execute to everyone
GRANT EXECUTE ON FUNCTION public.get_my_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role TO service_role;


-- 2. RESET USERS TABLE POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop all problematic policies
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Public read users" ON public.users;
DROP POLICY IF EXISTS "Admins full access users" ON public.users;
DROP POLICY IF EXISTS "Users update self" ON public.users;

-- Policy A: Everyone can READ users (needed for Leaderboard, History, etc)
CREATE POLICY "Read users allow all" ON public.users FOR SELECT 
USING (true);

-- Policy B: Only Admin/Teacher can UPDATE/DELETE others
-- Uses get_my_role() to avoid recursion
CREATE POLICY "Admin update delete users" ON public.users FOR UPDATE 
TO authenticated
USING (get_my_role() IN ('admin', 'teacher'))
WITH CHECK (get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Admin delete users" ON public.users FOR DELETE 
TO authenticated
USING (get_my_role() IN ('admin', 'teacher'));

-- Policy C: Users can UPDATE themselves
CREATE POLICY "Self update users" ON public.users FOR UPDATE 
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Policy D: Allow INSERT (usually handled by Auth trigger, but allow admins too)
CREATE POLICY "Admin insert users" ON public.users FOR INSERT 
TO authenticated
WITH CHECK (get_my_role() IN ('admin', 'teacher'));


-- 3. RESET POINT_LOGS POLICIES
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users full access point_logs" ON public.point_logs;
DROP POLICY IF EXISTS "Admins and Teachers can view all point logs" ON public.point_logs;

-- Use a simple policy: Authenticated users can View and Insert
-- The logic checks happen in the App or via the add_user_points RPC
CREATE POLICY "Point Logs Access" ON public.point_logs FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);


-- 4. FORCE REFRESH SCHEMA CACHE (By granting permissions)
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.point_logs TO authenticated;

-- 5. Ensure total_points column exists (Just in case)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'total_points') THEN
        ALTER TABLE public.users ADD COLUMN total_points INTEGER DEFAULT 0;
    END IF;
END $$;
