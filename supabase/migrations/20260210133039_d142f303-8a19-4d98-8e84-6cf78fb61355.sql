
-- Add class_id to subject_level_coefficients for per-class coefficients
ALTER TABLE public.subject_level_coefficients 
ADD COLUMN class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_slc_class_id ON public.subject_level_coefficients(class_id);

-- Create sanctions table
CREATE TABLE public.sanctions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  reason TEXT NOT NULL,
  sanction_type TEXT NOT NULL DEFAULT 'avertissement',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sanctions" ON public.sanctions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can create sanctions for their classes" ON public.sanctions FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM teachers t JOIN teacher_classes tc ON tc.teacher_id = t.id 
  WHERE t.user_id = auth.uid() AND tc.class_id = sanctions.class_id
));

CREATE POLICY "Teachers can view sanctions in their classes" ON public.sanctions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM teachers t JOIN teacher_classes tc ON tc.teacher_id = t.id 
  WHERE t.user_id = auth.uid() AND tc.class_id = sanctions.class_id
));

CREATE POLICY "Students can view their own sanctions" ON public.sanctions FOR SELECT
USING (EXISTS (SELECT 1 FROM students s WHERE s.user_id = auth.uid() AND s.id = sanctions.student_id));

-- Trigger to notify principal teacher and admins on sanction
CREATE OR REPLACE FUNCTION public.notify_sanction()
RETURNS TRIGGER AS $$
DECLARE
  student_name TEXT;
  teacher_name TEXT;
  principal_rec RECORD;
  admin_rec RECORD;
BEGIN
  SELECT p.first_name || ' ' || p.last_name INTO student_name
  FROM students s JOIN profiles p ON p.id = s.profile_id WHERE s.id = NEW.student_id;

  SELECT p.first_name || ' ' || p.last_name INTO teacher_name
  FROM teachers t JOIN profiles p ON p.id = t.profile_id WHERE t.id = NEW.teacher_id;

  -- Notify principal teachers of the class
  FOR principal_rec IN (
    SELECT t.user_id FROM teacher_classes tc JOIN teachers t ON t.id = tc.teacher_id
    WHERE tc.class_id = NEW.class_id AND tc.is_principal = true AND t.user_id != (
      SELECT user_id FROM teachers WHERE id = NEW.teacher_id
    )
  ) LOOP
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (principal_rec.user_id, 'Nouvelle sanction', 
      teacher_name || ' a sanctionné ' || student_name || ' : ' || NEW.reason, 'sanction');
  END LOOP;

  -- Notify all admins
  FOR admin_rec IN (SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'admin') LOOP
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (admin_rec.user_id, 'Nouvelle sanction',
      teacher_name || ' a sanctionné ' || student_name || ' : ' || NEW.reason, 'sanction');
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_notify_sanction
AFTER INSERT ON public.sanctions
FOR EACH ROW
EXECUTE FUNCTION public.notify_sanction();
