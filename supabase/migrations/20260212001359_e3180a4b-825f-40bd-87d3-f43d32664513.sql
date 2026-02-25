-- Drop the old restrictive check constraint on grade_type
ALTER TABLE public.grades DROP CONSTRAINT grades_grade_type_check;

-- Add a new permissive constraint that allows indexed grade types
ALTER TABLE public.grades ADD CONSTRAINT grades_grade_type_check 
  CHECK (grade_type ~ '^(interro_[0-9]+|devoir_[0-9]+|exam|participation)$');