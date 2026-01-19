-- Allow public (anon) to update users table
-- This is necessary because the app currently processes requests as 'anon' role if not using Supabase Auth
DROP POLICY IF EXISTS "Allow staff to update users room_id" ON users;
DROP POLICY IF EXISTS "Allow public read users" ON users;
DROP POLICY IF EXISTS "Allow public update users" ON users;

-- Re-create read policy
CREATE POLICY "Allow public read users" ON users
FOR SELECT
TO public
USING (true);

-- Create update policy for public
CREATE POLICY "Allow public update users" ON users
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Ensure permissions
GRANT ALL ON users TO anon;
GRANT ALL ON users TO authenticated;
GRANT ALL ON users TO service_role;
