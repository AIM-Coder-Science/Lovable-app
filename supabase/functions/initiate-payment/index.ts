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
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY');
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { 
      amount, 
      studentId, 
      articleId, 
      invoiceId,
      paymentMethod, // 'fedapay', 'card', 'momo', 'flooz'
      description,
      callbackUrl,
    } = body;

    if (!amount || (!articleId && !invoiceId)) {
      return new Response(JSON.stringify({ error: 'Données de paiement incomplètes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get student info for the payment
    const { data: studentData } = await supabaseAdmin
      .from('students')
      .select(`
        id, matricule,
        profiles!students_profile_id_fkey (first_name, last_name, email)
      `)
      .eq('id', studentId)
      .single();

    if (!studentData) {
      return new Response(JSON.stringify({ error: 'Étudiant non trouvé' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const profile = (studentData as any).profiles;
    const transactionRef = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create pending transaction record
    const { data: transactionData, error: transactionError } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        student_id: studentId,
        article_id: articleId || null,
        invoice_id: invoiceId || null,
        amount: amount,
        payment_method: paymentMethod,
        status: 'pending',
        transaction_ref: transactionRef,
        notes: description,
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Transaction creation error:', transactionError);
      return new Response(JSON.stringify({ error: 'Erreur lors de la création de la transaction' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // For FedaPay payments (card, mobile money)
    if (['fedapay', 'card', 'momo', 'flooz'].includes(paymentMethod)) {
      if (!fedapaySecretKey) {
        return new Response(JSON.stringify({ error: 'Configuration FedaPay manquante' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create FedaPay transaction
      const fedapayResponse = await fetch('https://sandbox-api.fedapay.com/v1/transactions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: description || `Paiement article - ${studentData.matricule}`,
          amount: Math.round(amount),
          currency: { iso: 'XOF' },
          callback_url: callbackUrl || `${req.headers.get('origin')}/articles`,
          customer: {
            firstname: profile.first_name,
            lastname: profile.last_name,
            email: profile.email,
          },
          metadata: {
            transaction_id: transactionData.id,
            transaction_ref: transactionRef,
            student_id: studentId,
            article_id: articleId,
            invoice_id: invoiceId,
          }
        }),
      });

      if (!fedapayResponse.ok) {
        const errorData = await fedapayResponse.json();
        console.error('FedaPay error:', errorData);
        
        // Update transaction as failed
        await supabaseAdmin
          .from('payment_transactions')
          .update({ status: 'failed', notes: JSON.stringify(errorData) })
          .eq('id', transactionData.id);

        return new Response(JSON.stringify({ error: 'Erreur FedaPay: ' + (errorData.message || 'Échec de la transaction') }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const fedapayData = await fedapayResponse.json();
      console.log('FedaPay transaction created:', fedapayData);

      // Generate payment token/link
      const tokenResponse = await fetch(`https://sandbox-api.fedapay.com/v1/transactions/${fedapayData.v1.transaction.id}/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!tokenResponse.ok) {
        const tokenError = await tokenResponse.json();
        console.error('FedaPay token error:', tokenError);
        return new Response(JSON.stringify({ error: 'Erreur lors de la génération du lien de paiement' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const tokenData = await tokenResponse.json();
      
      // Update transaction with FedaPay reference
      await supabaseAdmin
        .from('payment_transactions')
        .update({ 
          transaction_ref: fedapayData.v1.transaction.id.toString(),
          notes: `FedaPay Transaction ID: ${fedapayData.v1.transaction.id}` 
        })
        .eq('id', transactionData.id);

      return new Response(JSON.stringify({ 
        success: true,
        paymentUrl: tokenData.url,
        transactionId: transactionData.id,
        fedapayTransactionId: fedapayData.v1.transaction.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // For cash payments - just return the transaction reference
    return new Response(JSON.stringify({ 
      success: true,
      transactionId: transactionData.id,
      transactionRef: transactionRef,
      message: 'Demande de paiement en espèces enregistrée. Veuillez vous rendre à la caisse.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
