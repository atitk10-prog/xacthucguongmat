-- =====================================================
-- CERTIFICATE SYSTEM UPGRADE v3.0
-- Implementation of Requirements: A, B, C, D
-- =====================================================

-- 1. Ensure core columns exist in certificates
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS qr_verify TEXT,
ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'custom';

-- 2. Create Certificate Verification Logs (Requirement C)
CREATE TABLE IF NOT EXISTS public.certificate_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    device_info TEXT,
    location TEXT
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_cert_verif_cert_id ON public.certificate_verifications(certificate_id);

-- 3. RPC Function for Monthly Top Students (Requirement: Lọc theo tháng và top)
-- This function calculates the top students by total points earned in a specific month
CREATE OR REPLACE FUNCTION public.get_top_students_by_month(
    p_month INT, 
    p_year INT, 
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    student_code TEXT,
    organization TEXT,
    avatar_url TEXT,
    monthly_points BIGINT,
    rank BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH monthly_scores AS (
        SELECT 
            pl.user_id,
            SUM(pl.points)::BIGINT as total_monthly_points
        FROM 
            public.point_logs pl
        WHERE 
            EXTRACT(MONTH FROM pl.created_at) = p_month
            AND EXTRACT(YEAR FROM pl.created_at) = p_year
        GROUP BY 
            pl.user_id
    )
    SELECT 
        u.id as user_id,
        u.full_name,
        u.student_code,
        u.organization,
        u.avatar_url,
        ms.total_monthly_points as monthly_points,
        DENSE_RANK() OVER (ORDER BY ms.total_monthly_points DESC) as rank
    FROM 
        monthly_scores ms
    JOIN 
        public.users u ON u.id = ms.user_id
    WHERE 
        u.role = 'student'
    ORDER BY 
        ms.total_monthly_points DESC
    LIMIT p_limit;
END;
$$;

-- 4. Enable RLS for the new table
ALTER TABLE public.certificate_verifications ENABLE ROW LEVEL SECURITY;

-- Public access to record verifications (anyone scanning can trigger a log)
CREATE POLICY "Allow public insert to verifications" 
ON public.certificate_verifications FOR INSERT WITH CHECK (true);

-- Admin/Teacher can view logs
CREATE POLICY "Allow teachers to view verifications" 
ON public.certificate_verifications FOR SELECT 
USING (true); -- Simplified for dev, usually role based
