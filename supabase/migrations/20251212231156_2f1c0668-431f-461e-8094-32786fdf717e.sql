-- Create subject_level_coefficients table for coefficients by class level
CREATE TABLE public.subject_level_coefficients (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    coefficient INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (subject_id, level)
);

-- Enable RLS
ALTER TABLE public.subject_level_coefficients ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view subject_level_coefficients" 
ON public.subject_level_coefficients 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage subject_level_coefficients" 
ON public.subject_level_coefficients 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));