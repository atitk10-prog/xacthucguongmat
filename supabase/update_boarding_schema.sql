-- Update boarding_checkins table to add noon columns
ALTER TABLE boarding_checkins 
ADD COLUMN IF NOT EXISTS noon_in TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS noon_out TIMESTAMP WITH TIME ZONE;

-- Add face_descriptor to users table if not exists (for global check-in)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS face_descriptor TEXT; -- Stored as JSON string of Float32Array

-- Ensure users table has student details for syncing
ALTER TABLE users
ADD COLUMN IF NOT EXISTS student_code TEXT,
ADD COLUMN IF NOT EXISTS organization TEXT; 

-- Create index for faster role-based lookup
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
