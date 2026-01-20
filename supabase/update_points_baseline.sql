-- Set baseline points to 100 for all users
UPDATE users 
SET total_points = 100;

-- Optional: If you want to only update students, uncomment below
-- UPDATE users SET total_points = 100 WHERE role = 'student';
