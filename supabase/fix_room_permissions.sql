-- Ensure room_id column exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id);

-- Enable RLS on users if not enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts/duplicates
DROP POLICY IF EXISTS "Allow staff to update users room_id" ON users;
DROP POLICY IF EXISTS "Allow public read users" ON users;

-- Re-create policies with correct permissions
-- Allow authenticated users (staff) to update room_id
CREATE POLICY "Allow staff to update users room_id" ON users
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow public read (for testing/simplicity, tighten later)
CREATE POLICY "Allow public read users" ON users
FOR SELECT
TO public
USING (true);

-- Grant permissions
GRANT ALL ON users TO authenticated;
GRANT ALL ON users TO service_role;
