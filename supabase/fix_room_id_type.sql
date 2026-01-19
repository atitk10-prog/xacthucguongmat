-- 1. Set invalid room_ids to NULL (values that are not valid UUIDs)
-- This cleans up data like "101" or empty strings before converting type
UPDATE users 
SET room_id = NULL 
WHERE room_id IS NOT NULL 
  AND room_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 2. Convert column to UUID
ALTER TABLE users 
ALTER COLUMN room_id TYPE UUID USING room_id::UUID;

-- 3. Add Foreign Key constraint if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_room_id_fkey') THEN 
    ALTER TABLE users 
    ADD CONSTRAINT users_room_id_fkey 
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL; 
  END IF; 
END $$;

-- 4. Re-grant permissions just in case
GRANT ALL ON users TO anon;
GRANT ALL ON users TO authenticated;
GRANT ALL ON users TO service_role;
