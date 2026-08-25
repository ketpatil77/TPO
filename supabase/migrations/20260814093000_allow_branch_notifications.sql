ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_audience_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_audience_check
CHECK (audience IN ('student', 'all', 'branches'));
