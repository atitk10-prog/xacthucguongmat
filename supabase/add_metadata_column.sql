-- Add metadata column to certificates table if it doesn't exist
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Comment: This column stores custom configuration (labels, colors, fonts, bgImage) for each certificate
