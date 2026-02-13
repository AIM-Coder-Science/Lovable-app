-- Add unique constraint on class names (normalized)
CREATE OR REPLACE FUNCTION public.normalize_class_name(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(name), '\s+', '', 'g'), '[^a-zA-Z0-9àâäéèêëïîôùûüç]', '', 'gi'))
$$;

-- Add unique index on normalized class name
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_normalized_name_year 
ON public.classes (normalize_class_name(name), academic_year);

-- Create admin_permissions table for granular permissions
CREATE TABLE public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Permission flags
  can_manage_teachers BOOLEAN DEFAULT true,
  can_manage_students BOOLEAN DEFAULT true,
  can_manage_classes BOOLEAN DEFAULT true,
  can_manage_subjects BOOLEAN DEFAULT true,
  can_manage_articles BOOLEAN DEFAULT true,
  can_manage_invoices BOOLEAN DEFAULT true,
  can_manage_publications BOOLEAN DEFAULT true,
  can_manage_events BOOLEAN DEFAULT true,
  can_manage_timetable BOOLEAN DEFAULT true,
  can_manage_documents BOOLEAN DEFAULT true,
  can_manage_admins BOOLEAN DEFAULT false,
  can_sign_bulletins BOOLEAN DEFAULT true,
  
  -- Meta
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(admin_user_id)
);

-- Enable RLS
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- Function to check if user is the original/super admin (first admin created)
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.admin_permissions WHERE admin_user_id = user_id
  ) AND has_role(user_id, 'admin'::app_role)
$$;

-- Function to check if an admin can manage another admin
CREATE OR REPLACE FUNCTION public.can_manage_admin(manager_id UUID, target_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Super admin can manage all
  SELECT CASE 
    WHEN is_super_admin(manager_id) THEN true
    -- Admin can only manage admins they created
    WHEN EXISTS (
      SELECT 1 FROM public.admin_permissions 
      WHERE admin_user_id = target_id 
      AND created_by_user_id = manager_id
    ) THEN true
    ELSE false
  END
$$;

-- RLS Policies for admin_permissions
CREATE POLICY "Super admins can manage all permissions"
ON public.admin_permissions
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admins can view their own permissions"
ON public.admin_permissions
FOR SELECT
USING (admin_user_id = auth.uid());

CREATE POLICY "Admins can manage permissions of admins they created"
ON public.admin_permissions
FOR ALL
USING (can_manage_admin(auth.uid(), admin_user_id))
WITH CHECK (can_manage_admin(auth.uid(), admin_user_id));

-- Add generated_password column to store temporarily for display
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS generated_password_hash TEXT;

-- Create a table to store credentials temporarily (encrypted)
CREATE TABLE public.user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  viewed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can view credentials
CREATE POLICY "Admins can manage credentials"
ON public.user_credentials
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger to update updated_at
CREATE TRIGGER update_admin_permissions_updated_at
BEFORE UPDATE ON public.admin_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();