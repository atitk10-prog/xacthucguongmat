-- Chỉ tạo/cập nhật function (bỏ qua phần policy đã tồn tại)
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
