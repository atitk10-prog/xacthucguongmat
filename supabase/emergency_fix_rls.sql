-- EMERGENCY FIX RLS
-- Run this to fix "Cannot add/edit/delete" issues

-- 1. USERS Table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;

-- Allow everyone to read users (needed for Leaderboard, History check, etc)
CREATE POLICY "Public read users" ON public.users FOR SELECT USING (true);

-- Allow admins to do everything
CREATE POLICY "Admins full access users" ON public.users FOR ALL TO authenticated 
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);

-- Allow users to update themselves
CREATE POLICY "Users update self" ON public.users FOR UPDATE TO authenticated 
USING (id = auth.uid()) WITH CHECK (id = auth.uid());


-- 2. POINT_LOGS Table
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins and Teachers can view all point logs" ON public.point_logs;
DROP POLICY IF EXISTS "Users can view their own point logs" ON public.point_logs;
DROP POLICY IF EXISTS "Admins and Teachers can insert point logs" ON public.point_logs;

-- Simplified Policy: Authenticated users can View and Insert
-- (We rely on logic in the App to hide buttons, and the fact that basic users don't access the admin panel)
CREATE POLICY "Auth users full access point_logs" ON public.point_logs FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- 3. CHECKINS Table
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users full access checkins" ON public.checkins FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- 4. EVENTS & EVENT_PARTICIPANTS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users full access events" ON public.events FOR ALL TO authenticated
USING (true) WITH CHECK (true);

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users full access participants" ON public.event_participants FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- 5. FUNCTION PERMISSIONS
GRANT EXECUTE ON FUNCTION public.add_user_points TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_points TO service_role;
