-- =====================================================
-- FIX EVENT PARTICIPANTS QR & FACE ID
-- =====================================================

-- 1. Add missing columns to event_participants
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS student_code TEXT;
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS qr_code TEXT;
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS face_descriptor TEXT;

-- 2. Create index for QR and Student Code search
CREATE INDEX IF NOT EXISTS idx_participants_qr ON event_participants(qr_code);
CREATE INDEX IF NOT EXISTS idx_participants_student_code ON event_participants(student_code);

-- 3. Update existing participants qr_code to match their id by default (if id is available)
UPDATE event_participants 
SET qr_code = id::text 
WHERE qr_code IS NULL;

-- 4. Enable Realtime for event_participants (Optional but recommended)
-- Note: This is usually done via Supabase dashboard or a separate script
-- ALTER PUBLICATION supabase_realtime ADD TABLE event_participants;
