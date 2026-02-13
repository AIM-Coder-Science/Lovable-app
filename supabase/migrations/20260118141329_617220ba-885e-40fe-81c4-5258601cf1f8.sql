-- Add category column to payment_transactions
ALTER TABLE public.payment_transactions 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'article';