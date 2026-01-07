-- Add teacher_appreciation column to grades table for individual grade comments
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS teacher_appreciation text;

-- Add invoice_settings to school_settings for payment notification frequency
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS payment_reminder_frequency text DEFAULT 'monthly';

-- Create teacher_payments table for tracking teacher salaries
CREATE TABLE IF NOT EXISTS public.teacher_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    amount numeric NOT NULL,
    amount_paid numeric NOT NULL DEFAULT 0,
    description text NOT NULL,
    payment_date timestamp with time zone,
    due_date date NOT NULL,
    status varchar NOT NULL DEFAULT 'pending',
    academic_year text NOT NULL DEFAULT '2024-2025',
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on teacher_payments
ALTER TABLE public.teacher_payments ENABLE ROW LEVEL SECURITY;

-- Policies for teacher_payments
CREATE POLICY "Admins can manage teacher_payments" ON public.teacher_payments
    FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view own payments" ON public.teacher_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.teachers t
            WHERE t.user_id = auth.uid() AND t.id = teacher_payments.teacher_id
        )
    );

-- Trigger for updated_at on teacher_payments
CREATE TRIGGER update_teacher_payments_updated_at
    BEFORE UPDATE ON public.teacher_payments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();