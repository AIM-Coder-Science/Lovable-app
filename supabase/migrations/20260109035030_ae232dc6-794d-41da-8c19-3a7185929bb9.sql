-- Fix student_articles INSERT policy - ensure student can insert for themselves
DROP POLICY IF EXISTS "Admins can manage student_articles" ON public.student_articles;
DROP POLICY IF EXISTS "Students can view their own articles" ON public.student_articles;

-- Recreate policies with proper INSERT
CREATE POLICY "Admins can manage student_articles" 
ON public.student_articles 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view their own articles" 
ON public.student_articles 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM students s 
  WHERE s.user_id = auth.uid() AND s.id = student_articles.student_id
));

CREATE POLICY "Students can insert their own articles" 
ON public.student_articles 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM students s 
  WHERE s.user_id = auth.uid() AND s.id = student_articles.student_id
));

-- Add employee_id to teachers table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teachers' AND column_name = 'employee_id') THEN
    ALTER TABLE public.teachers ADD COLUMN employee_id text;
  END IF;
END $$;