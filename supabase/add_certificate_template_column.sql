-- Add template_id to certificates to store the design style used
ALTER TABLE public.certificates
ADD COLUMN IF NOT EXISTS template_id text DEFAULT 'classic'; -- 'classic', 'modern', 'tech', 'luxury'

-- Add styling_config for custom colors/fonts if needed in future
ALTER TABLE public.certificates
ADD COLUMN IF NOT EXISTS styling_config jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.certificates.template_id IS 'Design template used: classic, modern, tech, luxury';
