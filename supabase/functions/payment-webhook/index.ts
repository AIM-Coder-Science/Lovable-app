import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    console.log('Webhook received:', JSON.stringify(body));

    // FedaPay webhook structure
    const { entity, event } = body;
    
    if (!entity || entity.name !== 'Transaction') {
      return new Response(JSON.stringify({ message: 'Non-transaction event ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const transaction = entity.object;
    const status = transaction.status;
    const fedapayTransactionId = transaction.id.toString();
    const metadata = transaction.metadata || {};

    console.log('Processing transaction:', fedapayTransactionId, 'Status:', status);

    // Find our transaction by FedaPay reference
    const { data: ourTransaction, error: findError } = await supabaseAdmin
      .from('payment_transactions')
      .select('*')
      .eq('transaction_ref', fedapayTransactionId)
      .single();

    if (findError || !ourTransaction) {
      // Try using metadata
      if (metadata.transaction_id) {
        const { data: txByMetadata } = await supabaseAdmin
          .from('payment_transactions')
          .select('*')
          .eq('id', metadata.transaction_id)
          .single();
        
        if (!txByMetadata) {
          console.error('Transaction not found:', fedapayTransactionId);
          return new Response(JSON.stringify({ error: 'Transaction not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } else {
        console.error('Transaction not found:', fedapayTransactionId);
        return new Response(JSON.stringify({ error: 'Transaction not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const transactionRecord = ourTransaction || null;
    if (!transactionRecord) {
      return new Response(JSON.stringify({ error: 'Transaction record not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Map FedaPay status to our status
    let newStatus = 'pending';
    if (status === 'approved') {
      newStatus = 'completed';
    } else if (status === 'declined' || status === 'cancelled' || status === 'refunded') {
      newStatus = 'failed';
    }

    // Update our transaction
    await supabaseAdmin
      .from('payment_transactions')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionRecord.id);

    // If payment approved, update the student_article or invoice
    if (newStatus === 'completed') {
      if (transactionRecord.article_id) {
        // Update student_article
        const { data: studentArticle } = await supabaseAdmin
          .from('student_articles')
          .select('*')
          .eq('student_id', transactionRecord.student_id)
          .eq('article_id', transactionRecord.article_id)
          .single();

        if (studentArticle) {
          const newAmountPaid = studentArticle.amount_paid + transactionRecord.amount;
          const articleStatus = newAmountPaid >= studentArticle.amount ? 'paid' : 'partial';

          await supabaseAdmin
            .from('student_articles')
            .update({
              amount_paid: newAmountPaid,
              status: articleStatus,
              payment_date: articleStatus === 'paid' ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', studentArticle.id);
        }
      }

      if (transactionRecord.invoice_id) {
        // Update invoice
        const { data: invoice } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('id', transactionRecord.invoice_id)
          .single();

        if (invoice) {
          const newAmountPaid = invoice.amount_paid + transactionRecord.amount;
          const invoiceStatus = newAmountPaid >= invoice.amount ? 'paid' : 'partial';

          await supabaseAdmin
            .from('invoices')
            .update({
              amount_paid: newAmountPaid,
              status: invoiceStatus,
              payment_date: invoiceStatus === 'paid' ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', invoice.id);
        }
      }

      // Create notification for the student
      if (transactionRecord.student_id) {
        const { data: student } = await supabaseAdmin
          .from('students')
          .select('user_id')
          .eq('id', transactionRecord.student_id)
          .single();

        if (student) {
          await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: student.user_id,
              type: 'payment',
              title: 'Paiement confirmé',
              message: `Votre paiement de ${transactionRecord.amount} FCFA a été confirmé.`,
              metadata: { transaction_id: transactionRecord.id },
            });
        }
      }
    }

    console.log('Transaction updated successfully');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
