-- Fix security issue 1: Restrict teachers from viewing ALL profiles
-- Teachers should only see profiles of students in their assigned classes

DROP POLICY IF EXISTS "Teachers can view all profiles" ON public.profiles;

CREATE POLICY "Teachers can view profiles of students in their classes"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role) AND (
    -- Teacher can view their own profile
    auth.uid() = user_id
    OR
    -- Teacher can view profiles of students in their classes
    EXISTS (
      SELECT 1 FROM students s
      JOIN teacher_classes tc ON tc.class_id = s.class_id
      JOIN teachers t ON t.id = tc.teacher_id
      WHERE s.profile_id = profiles.id
      AND t.user_id = auth.uid()
    )
    OR
    -- Teacher can view profiles of other teachers (for collaboration)
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.profile_id = profiles.id
    )
  )
);

-- Fix security issue 2: Restrict administration_members access
-- Only authenticated users should see administration members, not public

DROP POLICY IF EXISTS "Everyone can view administration" ON public.administration_members;

CREATE POLICY "Authenticated users can view administration"
ON public.administration_members
FOR SELECT
USING (auth.uid() IS NOT NULL);