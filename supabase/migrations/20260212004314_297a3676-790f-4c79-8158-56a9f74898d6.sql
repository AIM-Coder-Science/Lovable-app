
-- Fix grades RLS policies: change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Admins can manage all grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can manage grades for their classes" ON public.grades;
DROP POLICY IF EXISTS "Principal teachers can view all grades in their class" ON public.grades;
DROP POLICY IF EXISTS "Students can view their own grades" ON public.grades;

CREATE POLICY "Admins can manage all grades"
ON public.grades FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can manage grades for their classes"
ON public.grades FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM teachers t
    JOIN teacher_classes tc ON tc.teacher_id = t.id
    WHERE t.user_id = auth.uid()
      AND tc.class_id = grades.class_id
      AND tc.subject_id = grades.subject_id
  )
);

CREATE POLICY "Principal teachers can view all grades in their class"
ON public.grades FOR SELECT
TO authenticated
USING (is_principal_of_class(auth.uid(), class_id));

CREATE POLICY "Students can view their own grades"
ON public.grades FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.user_id = auth.uid() AND s.id = grades.student_id
  )
);

-- Also fix bulletins RLS policies
DROP POLICY IF EXISTS "Admins can manage all bulletins" ON public.bulletins;
DROP POLICY IF EXISTS "Principal teachers can manage bulletins for their class" ON public.bulletins;
DROP POLICY IF EXISTS "Students can view their own bulletins" ON public.bulletins;

CREATE POLICY "Admins can manage all bulletins"
ON public.bulletins FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Principal teachers can manage bulletins for their class"
ON public.bulletins FOR ALL
TO authenticated
USING (is_principal_of_class(auth.uid(), class_id));

CREATE POLICY "Students can view their own bulletins"
ON public.bulletins FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.user_id = auth.uid() AND s.id = bulletins.student_id
  )
);
