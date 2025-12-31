-- Create school_settings table for system configuration
CREATE TABLE public.school_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    school_name text NOT NULL DEFAULT 'EduGest',
    academic_year text NOT NULL DEFAULT '2024-2025',
    period_system text NOT NULL DEFAULT 'trimester' CHECK (period_system IN ('trimester', 'semester')),
    grading_system text NOT NULL DEFAULT 'numeric_20' CHECK (grading_system IN ('numeric_10', 'numeric_20', 'numeric_100', 'letters')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage school settings"
ON public.school_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Everyone can view settings
CREATE POLICY "Everyone can view school settings"
ON public.school_settings
FOR SELECT
USING (true);

-- Insert default settings
INSERT INTO public.school_settings (school_name, academic_year, period_system, grading_system)
VALUES ('EduGest', '2024-2025', 'trimester', 'numeric_20');

-- Create trigger for updated_at
CREATE TRIGGER update_school_settings_updated_at
BEFORE UPDATE ON public.school_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();