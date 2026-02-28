import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Vérifie la signature HMAC du webhook FedaPay.
 * Nécessite FEDAPAY_WEBHOOK_SECRET dans les secrets Supabase.
 */
async function verifyWebhookSignature(req: Request, body: string): Promise<boolean> {
  const webhookSecret = Deno.env.get('FEDAPAY_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.warn('FEDAPAY_WEBHOOK_SECRET non configuré — validation désactivée en dev');
    return true; // À activer en production
  }

  const signature = req.headers.get('x-fedapay-signature') ?? req.headers.get('x-webhook-signature');
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = 'sha256=' + Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Comparaison en temps constant
  return signature.length === expected.length && signature === expected;
}

async function applyPaymentToArticle(
  supabaseAdmin: ReturnType<typeof createClient>,
  studentId: string,
  articleId: string,
  amount: number
) {
  const { data: studentArticle } = await supabaseAdmin
    .from('student_articles')
    .select('*')
    .eq('student_id', studentId)
    .eq('article_id', articleId)
    .single();

  if (!studentArticle) return;

  const newAmountPaid = studentArticle.amount_paid + amount;
  const status = newAmountPaid >= studentArticle.amount ? 'paid' : 'partial';

  await supabaseAdmin
    .from('student_articles')
    .update({
      amount_paid: newAmountPaid,
      status,
      payment_date: status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', studentArticle.id);
}

async function applyPaymentToInvoice(
  supabaseAdmin: ReturnType<typeof createClient>,
  invoiceId: string,
  amount: number
) {
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return;

  const newAmountPaid = invoice.amount_paid + amount;
  const status = newAmountPaid >= invoice.amount ? 'paid' : 'partial';

  await supabaseAdmin
    .from('invoices')
    .update({
      amount_paid: newAmountPaid,
      status,
      payment_date: status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const rawBody = await req.text();

  // ── Vérification signature webhook ─────────────────────────────────────
  const isValid = await verifyWebhookSignature(req, rawBody);
  if (!isValid) {
    console.error('Signature webhook invalide');
    return new Response(JSON.stringify({ error: 'Signature invalide' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = JSON.parse(rawBody);
    console.log('Webhook received:', body?.event);

    const { entity, event } = body;

    if (!entity || entity.name !== 'Transaction') {
      return new Response(JSON.stringify({ message: 'Événement non-transaction ignoré' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const transaction = entity.object;
    const status = transaction.status;
    const fedapayTransactionId = transaction.id.toString();
    const metadata = transaction.metadata || {};

    // Cherche la transaction locale
    let ourTransaction = null;
    const { data: txByRef } = await supabaseAdmin
      .from('payment_transactions')
      .select('*')
      .eq('transaction_ref', fedapayTransactionId)
      .maybeSingle();

    ourTransaction = txByRef;

    if (!ourTransaction && metadata.transaction_id) {
      const { data: txByMeta } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('id', metadata.transaction_id)
        .maybeSingle();
      ourTransaction = txByMeta;
    }

    if (!ourTransaction) {
      console.error('Transaction introuvable:', fedapayTransactionId);
      // Retourne 200 pour éviter les retry infinis de FedaPay
      return new Response(JSON.stringify({ message: 'Transaction non trouvée — ignorée' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Évite de retraiter un paiement déjà complété (idempotence)
    if (ourTransaction.status === 'completed') {
      return new Response(JSON.stringify({ success: true, message: 'Déjà traité' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const newStatus =
      status === 'approved' ? 'completed'
        : ['declined', 'cancelled', 'refunded'].includes(status) ? 'failed'
          : 'pending';

    await supabaseAdmin
      .from('payment_transactions')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', ourTransaction.id);

    if (newStatus === 'completed') {
      if (ourTransaction.article_id && ourTransaction.student_id) {
        await applyPaymentToArticle(supabaseAdmin, ourTransaction.student_id, ourTransaction.article_id, ourTransaction.amount);
      }
      if (ourTransaction.invoice_id) {
        await applyPaymentToInvoice(supabaseAdmin, ourTransaction.invoice_id, ourTransaction.amount);
      }

      if (ourTransaction.student_id) {
        const { data: student } = await supabaseAdmin
          .from('students')
          .select('user_id')
          .eq('id', ourTransaction.student_id)
          .single();

        if (student?.user_id) {
          await supabaseAdmin.from('notifications').insert({
            user_id: student.user_id,
            type: 'payment',
            title: 'Paiement confirmé',
            message: `Votre paiement de ${ourTransaction.amount} FCFA a été confirmé.`,
            metadata: { transaction_id: ourTransaction.id },
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('Webhook error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
