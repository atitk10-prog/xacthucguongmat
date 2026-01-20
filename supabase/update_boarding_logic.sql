-- 1. Create RPC to safely increment/decrement user points
CREATE OR REPLACE FUNCTION increment_user_points(p_user_id UUID, p_amount INT)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET total_points = COALESCE(total_points, 100) + p_amount
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Add Boarding Late Points Config
INSERT INTO system_configs (key, value)
VALUES ('points_late_boarding', '-2')
ON CONFLICT (key) DO NOTHING;
