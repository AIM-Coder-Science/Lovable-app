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

    // For cash payments - create notification for admin
    if (paymentMethod === 'cash') {
      // Create notification for admin
      const { data: admins } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        const notifications = admins.map(admin => ({
          user_id: admin.user_id,
          title: 'Demande de paiement en espèces',
          message: `${profile.first_name} ${profile.last_name} a demandé un paiement en espèces de ${amount} FCFA.`,
          type: 'payment_request',
          metadata: {
            transaction_id: transactionData.id,
            student_id: studentId,
            article_id: articleId,
            amount: amount,
          }
        }));

        await supabaseAdmin.from('notifications').insert(notifications);
      }

      return new Response(JSON.stringify({ 
        success: true,
        transactionId: transactionData.id,
        transactionRef: transactionRef,
        message: 'Demande de paiement en espèces envoyée à l\'administration. Veuillez vous rendre à la caisse.',
      }), {
        status: 200,
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

      console.log('Creating FedaPay transaction for amount:', amount);

      // Create FedaPay transaction
      const fedapayResponse = await fetch('https://sandbox-api.fedapay.com/v1/transactions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          transaction: {
            amount: Math.round(amount),
            currency: 'XOF',
            description: description || `Paiement - ${studentData.matricule}`,
            callback_url: callbackUrl || `${req.headers.get('origin')}/articles`,
            customer: {
              firstname: profile.first_name,
              lastname: profile.last_name,
              email: profile.email,
            },
            metadata: {
              // Keep BOTH keys so the webhook can always find the local transaction
              transaction_id: transactionData.id,
              local_transaction_id: transactionData.id,
              transaction_ref: transactionRef,
              student_id: studentId,
              article_id: articleId,
              invoice_id: invoiceId,
              payment_method: paymentMethod,
            },
          },
        }),
      });

      const fedapayData = await fedapayResponse.json();
      console.log('FedaPay response:', JSON.stringify(fedapayData));

      if (!fedapayResponse.ok) {
        console.error('FedaPay error:', fedapayData);

        // Update transaction as failed
        await supabaseAdmin
          .from('payment_transactions')
          .update({ status: 'failed', notes: JSON.stringify(fedapayData) })
          .eq('id', transactionData.id);

        const message =
          fedapayData?.message ||
          fedapayData?.error ||
          fedapayData?.errors?.[0]?.message ||
          'Échec de la transaction';

        return new Response(JSON.stringify({ error: `Erreur FedaPay: ${message}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Extract transaction ID from response (supports multiple formats)
      const fedapayTransactionId =
        fedapayData?.transaction?.id ??
        fedapayData?.v1?.transaction?.id ??
        fedapayData?.id ??
        null;

      if (!fedapayTransactionId) {
        console.error('Could not extract transaction ID from FedaPay response:', fedapayData);
        return new Response(JSON.stringify({ error: 'Format de réponse FedaPay inattendu' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('FedaPay transaction ID:', fedapayTransactionId);

      // Generate checkout URL
      const checkoutResponse = await fetch(
        `https://sandbox-api.fedapay.com/v1/transactions/${fedapayTransactionId}/checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${fedapaySecretKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      );

      const checkoutData = await checkoutResponse.json();
      console.log('Checkout response:', JSON.stringify(checkoutData));

      if (!checkoutResponse.ok) {
        console.error('FedaPay checkout error:', checkoutData);
        return new Response(JSON.stringify({ error: 'Erreur lors de la génération du lien de paiement' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const paymentUrl =
        checkoutData?.transaction?.checkout_url ??
        checkoutData?.v1?.transaction?.checkout_url ??
        null;

      if (!paymentUrl) {
        console.error('Could not extract checkout_url from FedaPay checkout response:', checkoutData);
        return new Response(JSON.stringify({ error: 'Lien de paiement introuvable dans la réponse FedaPay' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update transaction with FedaPay reference
      await supabaseAdmin
        .from('payment_transactions')
        .update({
          transaction_ref: fedapayTransactionId.toString(),
          notes: `LocalRef=${transactionRef}; FedaPayTransactionID=${fedapayTransactionId}`,
        })
        .eq('id', transactionData.id);

      return new Response(
        JSON.stringify({
          success: true,
          paymentUrl,
          transactionId: transactionData.id,
          fedapayTransactionId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fallback for unknown payment methods
    return new Response(JSON.stringify({ 
      success: true,
      transactionId: transactionData.id,
      transactionRef: transactionRef,
      message: 'Transaction enregistrée.',
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
