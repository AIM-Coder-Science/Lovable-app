-- Add profile_edit_settings to school_settings table
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS profile_edit_settings jsonb DEFAULT '{"students_can_edit_phone": false, "students_can_edit_avatar": true, "teachers_can_edit_phone": false, "teachers_can_edit_avatar": true}'::jsonb;

-- Add matricule_counter table for auto-generation
CREATE TABLE IF NOT EXISTS public.matricule_counters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prefix text NOT NULL UNIQUE,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on matricule_counters
ALTER TABLE public.matricule_counters ENABLE ROW LEVEL SECURITY;

-- Create policies for matricule_counters
CREATE POLICY "Admins can manage matricule_counters" 
ON public.matricule_counters 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default counters
INSERT INTO public.matricule_counters (prefix, last_number) 
VALUES ('AP', 0), ('EN', 0)
ON CONFLICT (prefix) DO NOTHING;

-- Create function to generate next matricule
CREATE OR REPLACE FUNCTION public.generate_matricule(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_number integer;
  v_matricule text;
BEGIN
  -- Update counter and get new value
  UPDATE public.matricule_counters 
  SET last_number = last_number + 1, updated_at = now()
  WHERE prefix = p_prefix
  RETURNING last_number INTO v_next_number;
  
  -- If no row was updated, insert new counter
  IF v_next_number IS NULL THEN
    INSERT INTO public.matricule_counters (prefix, last_number)
    VALUES (p_prefix, 1)
    ON CONFLICT (prefix) DO UPDATE SET last_number = matricule_counters.last_number + 1
    RETURNING last_number INTO v_next_number;
  END IF;
  
  -- Format: PREFIX + 8 digits (zero-padded)
  v_matricule := p_prefix || LPAD(v_next_number::text, 8, '0');
  
  RETURN v_matricule;
END;
$$;