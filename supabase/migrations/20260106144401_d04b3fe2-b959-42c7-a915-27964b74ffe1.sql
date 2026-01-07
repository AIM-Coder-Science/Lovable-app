-- Table for class fees (contribution par classe)
CREATE TABLE public.class_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT DEFAULT 'Frais de scolarité',
  academic_year TEXT NOT NULL DEFAULT '2024-2025',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(class_id, academic_year)
);

-- Table for additional articles (tenue de sport, macaron, etc.)
CREATE TABLE public.fee_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  target_group TEXT DEFAULT 'all', -- 'all', 'new_students', 'specific_class'
  target_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  academic_year TEXT NOT NULL DEFAULT '2024-2025',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for student article purchases/assignments
CREATE TABLE public.student_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.fee_articles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  status VARCHAR NOT NULL DEFAULT 'pending',
  payment_date TIMESTAMP WITH TIME ZONE,
  academic_year TEXT NOT NULL DEFAULT '2024-2025',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, article_id, academic_year)
);

-- Table for teacher hourly rates
CREATE TABLE public.teacher_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_type VARCHAR NOT NULL, -- 'titulaire', 'vacataire'
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(rate_type)
);

-- Table for payment transactions (for online payments)
CREATE TABLE public.payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  payment_method VARCHAR NOT NULL, -- 'cash', 'bank', 'fedapay', 'kikiapay', 'paydunya'
  transaction_ref TEXT,
  status VARCHAR NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  article_id UUID REFERENCES public.fee_articles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR NOT NULL DEFAULT 'info', -- 'info', 'payment_reminder', 'grade', 'bulletin'
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.class_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for class_fees
CREATE POLICY "Admins can manage class_fees" ON public.class_fees FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view class_fees" ON public.class_fees FOR SELECT USING (true);

-- RLS Policies for fee_articles
CREATE POLICY "Admins can manage fee_articles" ON public.fee_articles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view fee_articles" ON public.fee_articles FOR SELECT USING (true);

-- RLS Policies for student_articles
CREATE POLICY "Admins can manage student_articles" ON public.student_articles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students can view their own articles" ON public.student_articles FOR SELECT USING (
  EXISTS (SELECT 1 FROM students s WHERE s.user_id = auth.uid() AND s.id = student_articles.student_id)
);

-- RLS Policies for teacher_rates
CREATE POLICY "Admins can manage teacher_rates" ON public.teacher_rates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can view rates" ON public.teacher_rates FOR SELECT USING (has_role(auth.uid(), 'teacher'::app_role));

-- RLS Policies for payment_transactions
CREATE POLICY "Admins can manage payment_transactions" ON public.payment_transactions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students can view own transactions" ON public.payment_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM students s WHERE s.user_id = auth.uid() AND s.id = payment_transactions.student_id)
);
CREATE POLICY "Teachers can view own transactions" ON public.payment_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = auth.uid() AND t.id = payment_transactions.teacher_id)
);
CREATE POLICY "Students can create transactions" ON public.payment_transactions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM students s WHERE s.user_id = auth.uid() AND s.id = payment_transactions.student_id)
);

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all notifications" ON public.notifications FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create triggers for updated_at
CREATE TRIGGER update_class_fees_updated_at BEFORE UPDATE ON public.class_fees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fee_articles_updated_at BEFORE UPDATE ON public.fee_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_student_articles_updated_at BEFORE UPDATE ON public.student_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_teacher_rates_updated_at BEFORE UPDATE ON public.teacher_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default teacher rates
INSERT INTO public.teacher_rates (rate_type, hourly_rate, description) VALUES 
  ('titulaire', 5000, 'Taux horaire pour enseignant titulaire'),
  ('vacataire', 3500, 'Taux horaire pour enseignant vacataire')
ON CONFLICT (rate_type) DO NOTHING;