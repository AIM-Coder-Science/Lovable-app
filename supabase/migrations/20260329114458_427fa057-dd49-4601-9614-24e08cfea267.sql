
-- Add timetable-related columns to subjects
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS hours_per_week integer NOT NULL DEFAULT 2;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS max_sessions_per_week integer NOT NULL DEFAULT 5;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS preferred_block_size integer NOT NULL DEFAULT 60;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS is_single_session_only boolean NOT NULL DEFAULT false;

-- Add timetable-related columns to teachers
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS max_hours_per_day integer NOT NULL DEFAULT 8;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS max_hours_per_week integer NOT NULL DEFAULT 30;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS unavailable_slots jsonb DEFAULT '[]'::jsonb;

-- Create timetable_constraints table
CREATE TABLE IF NOT EXISTS public.timetable_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constraint_name text NOT NULL DEFAULT 'Par défaut',
  period_start time NOT NULL DEFAULT '07:00',
  period_end time NOT NULL DEFAULT '18:00',
  lunch_start time NOT NULL DEFAULT '12:00',
  lunch_end time NOT NULL DEFAULT '13:00',
  days_of_week integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  max_consecutive_hours integer NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timetable_constraints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage timetable_constraints" ON public.timetable_constraints FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view timetable_constraints" ON public.timetable_constraints FOR SELECT USING (true);

-- Create timetable_generations table
CREATE TABLE IF NOT EXISTS public.timetable_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'generated',
  slots_count integer NOT NULL DEFAULT 0,
  conflicts_count integer NOT NULL DEFAULT 0,
  conflicts_details jsonb DEFAULT '[]'::jsonb,
  slots_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timetable_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage timetable_generations" ON public.timetable_generations FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view timetable_generations" ON public.timetable_generations FOR SELECT USING (true);

-- Create attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  timetable_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'present',
  reason text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage attendance" ON public.attendance FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can manage attendance for their classes" ON public.attendance FOR ALL USING (
  EXISTS (
    SELECT 1 FROM teachers t JOIN teacher_classes tc ON tc.teacher_id = t.id
    WHERE t.user_id = auth.uid() AND tc.class_id = attendance.class_id
  )
);
CREATE POLICY "Students can view their own attendance" ON public.attendance FOR SELECT USING (
  EXISTS (SELECT 1 FROM students s WHERE s.user_id = auth.uid() AND s.id = attendance.student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON public.attendance(class_id, date);
