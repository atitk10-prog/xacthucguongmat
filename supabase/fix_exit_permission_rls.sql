-- ============================================
-- FIX RLS POLICY FOR exit_permissions
-- ============================================

-- 1. Disable RLS momentarily to ensure clean state or debug
ALTER TABLE exit_permissions DISABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow read for all" ON exit_permissions;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON exit_permissions;
DROP POLICY IF EXISTS "Allow update for authenticated" ON exit_permissions;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON exit_permissions;
DROP POLICY IF EXISTS "Enable all access for all users" ON exit_permissions;

-- 3. Re-enable RLS
ALTER TABLE exit_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Create a PERMISSIVE policy for testing (Allow ALL operations for ALL users)
-- effectively making it public but keeping RLS enabled structure
CREATE POLICY "Enable all access for all users" ON exit_permissions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 5. Create specific policies (Alternative - if you want stricter control later)
-- Uncomment these if you want to revert to strict mode later
/*
-- Read: Everyone can read
CREATE POLICY "Allow read for all" ON exit_permissions FOR SELECT USING (true);

-- Insert: Authenticated users can insert
CREATE POLICY "Allow insert for authenticated" ON exit_permissions FOR INSERT TO authenticated WITH CHECK (true);

-- Update: Authenticated users can update
CREATE POLICY "Allow update for authenticated" ON exit_permissions FOR UPDATE TO authenticated USING (true);

-- Delete: Authenticated users can delete
CREATE POLICY "Allow delete for authenticated" ON exit_permissions FOR DELETE TO authenticated USING (true);
*/

-- 6. Verification
SELECT 'RLS policies updated for exit_permissions' as status;
