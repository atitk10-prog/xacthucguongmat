-- =====================================================
-- CERTIFICATE PRESET REFERENCE ARCHITECTURE
-- Adds config_id to certificates for lightweight storage
-- =====================================================

-- 1. Add config_id column to certificates table
ALTER TABLE public.certificates
ADD COLUMN IF NOT EXISTS config_id UUID REFERENCES public.certificate_configs(id) ON DELETE SET NULL;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_certificates_config_id ON public.certificates(config_id);

-- 3. Add is_locked column to certificate_configs to track presets in use
ALTER TABLE public.certificate_configs
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- 4. Create function to count certificates using a specific config
CREATE OR REPLACE FUNCTION count_certificates_by_config(p_config_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM certificates WHERE config_id = p_config_id);
END;
$$ LANGUAGE plpgsql;

-- 5. Grant execute permission
GRANT EXECUTE ON FUNCTION count_certificates_by_config TO authenticated;
GRANT EXECUTE ON FUNCTION count_certificates_by_config TO anon;

COMMENT ON COLUMN public.certificates.config_id IS 'Reference to certificate_configs for design template. NULL means use default template.';
COMMENT ON COLUMN public.certificate_configs.is_locked IS 'True if this config was auto-created during bulk certificate generation and should not be deleted.';
