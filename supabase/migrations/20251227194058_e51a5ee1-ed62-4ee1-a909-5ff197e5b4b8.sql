-- Create timetable_slots table for schedule configuration
CREATE TABLE public.timetable_slots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    room VARCHAR(50),
    academic_year TEXT NOT NULL DEFAULT '2024-2025',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create administration_members table for school staff
CREATE TABLE public.administration_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title VARCHAR(100) NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    photo_url TEXT,
    order_index INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoices table for student fee tracking
CREATE TABLE public.invoices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
    payment_date TIMESTAMP WITH TIME ZONE,
    academic_year TEXT NOT NULL DEFAULT '2024-2025',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create events table
CREATE TABLE public.events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL DEFAULT 'general',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    location VARCHAR(255),
    visibility VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'teachers', 'students', 'admin')),
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administration_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Timetable RLS Policies
CREATE POLICY "Admins can manage timetable" ON public.timetable_slots FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Everyone can view timetable" ON public.timetable_slots FOR SELECT USING (true);

-- Administration Members RLS Policies  
CREATE POLICY "Admins can manage administration" ON public.administration_members FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Everyone can view administration" ON public.administration_members FOR SELECT USING (true);

-- Invoices RLS Policies
CREATE POLICY "Admins can manage invoices" ON public.invoices FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can view own invoices" ON public.invoices FOR SELECT USING (
    EXISTS (SELECT 1 FROM students s WHERE s.user_id = auth.uid() AND s.id = invoices.student_id)
);

-- Events RLS Policies
CREATE POLICY "Admins can manage events" ON public.events FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view events based on visibility" ON public.events FOR SELECT USING (
    is_published = true AND (
        visibility = 'all' OR
        (visibility = 'teachers' AND has_role(auth.uid(), 'teacher')) OR
        (visibility = 'students' AND has_role(auth.uid(), 'student')) OR
        has_role(auth.uid(), 'admin')
    )
);

-- Create triggers for updated_at
CREATE TRIGGER update_administration_members_updated_at BEFORE UPDATE ON public.administration_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();