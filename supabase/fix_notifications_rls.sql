-- FIX RLS FOR NOTIFICATIONS TABLE
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System/Admins can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

-- 1. Everyone can see their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 2. Authenticated users can insert notifications 
-- (Needed for checkin process which might run as the student's session)
CREATE POLICY "Auth users can insert notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (true);

-- 3. Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications" ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 4. Admins have full access
CREATE POLICY "Admins full access notifications" ON public.notifications
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);
