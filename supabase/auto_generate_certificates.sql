-- Trigger to automatically create certificates when an event is marked as 'completed'
-- This ensures 100% reliability regardless of who/how the event was updated.

CREATE OR REPLACE FUNCTION public.auto_generate_certificates()
RETURNS TRIGGER AS $$
DECLARE
    participant_record RECORD;
BEGIN
    -- Only trigger when status changes to 'completed'
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        
        -- Loop through all participants of this event
        FOR participant_record IN 
            SELECT p.user_id, u.full_name 
            FROM event_participants p
            JOIN users u ON p.user_id = u.id
            WHERE p.event_id = NEW.id AND p.user_id IS NOT NULL
        LOOP
            -- Check if certificate already exists to avoid duplicates
            IF NOT EXISTS (
                SELECT 1 FROM certificates 
                WHERE user_id = participant_record.user_id 
                AND event_id = NEW.id
            ) THEN
                -- Insert Certificate
                INSERT INTO certificates (
                    user_id,
                    event_id,
                    type,
                    title,
                    issued_date,
                    status,
                    qr_verify
                ) VALUES (
                    participant_record.user_id,
                    NEW.id,
                    'participation', -- Default type
                    'Chứng nhận tham gia: ' || NEW.name,
                    CURRENT_DATE,
                    'issued',
                    'https://educheck.com/verify/' || gen_random_uuid() -- Mock Verify URL
                );
            END IF;
        END LOOP;
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to avoid errors on re-run
DROP TRIGGER IF EXISTS on_event_completed ON events;

-- Create Trigger
CREATE TRIGGER on_event_completed
AFTER UPDATE OF status ON events
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_certificates();
