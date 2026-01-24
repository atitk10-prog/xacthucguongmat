-- =====================================================
-- CERTIFICATE CONFIGS TABLE
-- Stores saved designs/presets for the Certificate Generator
-- =====================================================

CREATE TABLE IF NOT EXISTS public.certificate_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    template_id TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_cert_configs_name ON public.certificate_configs(name);

-- RLS
ALTER TABLE public.certificate_configs ENABLE ROW LEVEL SECURITY;

-- Development policy: Public access (mirroring existing certificate policy)
DROP POLICY IF EXISTS "Public access certificate_configs" ON public.certificate_configs;
CREATE POLICY "Public access certificate_configs" ON public.certificate_configs FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_certificate_configs_updated_at
    BEFORE UPDATE ON public.certificate_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
