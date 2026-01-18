-- Add birth_date column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Update existing users with a default value (optional, or leave as null)
-- UPDATE public.users SET birth_date = '2000-01-01' WHERE birth_date IS NULL;

-- Notify that migration is complete
SELECT 'Migration completed: Added birth_date to users table' as status;
