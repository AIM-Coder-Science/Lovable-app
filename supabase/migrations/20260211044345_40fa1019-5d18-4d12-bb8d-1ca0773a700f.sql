-- Drop the old unique constraint that causes the duplicate key error
ALTER TABLE public.subject_level_coefficients DROP CONSTRAINT IF EXISTS subject_level_coefficients_subject_id_level_key;

-- Add new unique constraint that includes class_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_slc_subject_level_class 
ON public.subject_level_coefficients (subject_id, level, COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid));