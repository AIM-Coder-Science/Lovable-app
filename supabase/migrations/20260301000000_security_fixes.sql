-- ============================================================
-- CORRECTION SÉCURITÉ — 2026-03-01
-- ============================================================

-- 1. RLS manquant sur user_credentials (les enseignants ne doivent pas voir les mots de passe)
DROP POLICY IF EXISTS "Admins can manage credentials" ON public.user_credentials;

CREATE POLICY "Only admins can view credentials"
ON public.user_credentials FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only service role can insert credentials"
ON public.user_credentials FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Supprimer la colonne generated_password_hash inutilisée et risquée
ALTER TABLE public.profiles DROP COLUMN IF EXISTS generated_password_hash;

-- 3. Ajouter un index sur payment_transactions(transaction_ref) pour les lookups webhook
CREATE INDEX IF NOT EXISTS idx_payment_transactions_ref
ON public.payment_transactions (transaction_ref);

-- 4. Ajouter un index sur payment_transactions(student_id) pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_student
ON public.payment_transactions (student_id);

-- 5. Ajouter un index sur notifications(user_id) si absent
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
ON public.notifications (user_id);

-- 6. Contrainte : status ne peut prendre que des valeurs valides
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('pending', 'completed', 'failed'));
