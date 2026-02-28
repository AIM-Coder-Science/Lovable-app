import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Génère une référence de transaction unique et non-prévisible. */
function generateTransactionRef(): string {
  const random = new Uint8Array(9);
  crypto.getRandomValues(random);
  return `TX-${Date.now()}-${Array.from(random).map(b => b.toString(36)).join('').slice(0, 9)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { amount, studentId, articleId, invoiceId, paymentMethod, description, callbackUrl, category } = body;

    if (!amount || (!articleId && !invoiceId)) {
      return new Response(JSON.stringify({ error: 'Données de paiement incomplètes' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: studentData } = await supabaseAdmin
      .from('students')
      .select('id, matricule, profiles!students_profile_id_fkey (first_name, last_name, email)')
      .eq('id', studentId)
      .single();

    if (!studentData) {
      return new Response(JSON.stringify({ error: 'Étudiant non trouvé' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const profile = (studentData as unknown as { profiles: { first_name: string; last_name: string; email: string } }).profiles;
    const transactionRef = generateTransactionRef();

    // Crée la transaction en attente
    const { data: transactionData, error: transactionError } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        student_id: studentId,
        article_id: articleId || null,
        invoice_id: invoiceId || null,
        amount,
        payment_method: paymentMethod,
        status: 'pending',
        transaction_ref: transactionRef,
        notes: description,
        category: category || (articleId ? 'article' : invoiceId ? 'fee' : 'article'),
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Transaction creation error:', transactionError);
      return new Response(JSON.stringify({ error: 'Erreur lors de la création de la transaction' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Paiement en espèces ────────────────────────────────────────────────
    if (paymentMethod === 'cash') {
      const { data: admins } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        await supabaseAdmin.from('notifications').insert(
          admins.map(admin => ({
            user_id: admin.user_id,
            title: 'Demande de paiement en espèces',
            message: `${profile.first_name} ${profile.last_name} a demandé un paiement en espèces de ${amount} FCFA.`,
            type: 'payment_request',
            metadata: { transaction_id: transactionData.id, student_id: studentId, article_id: articleId, amount },
          }))
        );
      }

      return new Response(JSON.stringify({
        success: true,
        transactionId: transactionData.id,
        transactionRef,
        message: 'Demande de paiement en espèces envoyée. Veuillez vous rendre à la caisse.',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Paiement FedaPay ───────────────────────────────────────────────────
    if (['fedapay', 'card', 'momo', 'flooz'].includes(paymentMethod)) {
      const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY');
      if (!fedapaySecretKey) {
        return new Response(JSON.stringify({ error: 'Configuration FedaPay manquante' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

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
            customer: { firstname: profile.first_name, lastname: profile.last_name, email: profile.email },
            metadata: {
              transaction_id: transactionData.id,
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

      if (!fedapayResponse.ok) {
        await supabaseAdmin
          .from('payment_transactions')
          .update({ status: 'failed', notes: JSON.stringify(fedapayData) })
          .eq('id', transactionData.id);

        const message = fedapayData?.message ?? fedapayData?.error ?? 'Échec de la transaction';
        return new Response(JSON.stringify({ error: `Erreur FedaPay: ${message}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const fedapayTransactionId =
        fedapayData?.transaction?.id ?? fedapayData?.v1?.transaction?.id ?? fedapayData?.id ?? null;

      if (!fedapayTransactionId) {
        return new Response(JSON.stringify({ error: 'Format de réponse FedaPay inattendu' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

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

      if (!checkoutResponse.ok) {
        return new Response(JSON.stringify({ error: 'Erreur lors de la génération du lien de paiement' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const paymentUrl = checkoutData?.transaction?.checkout_url ?? checkoutData?.v1?.transaction?.checkout_url ?? null;

      if (!paymentUrl) {
        return new Response(JSON.stringify({ error: 'Lien de paiement introuvable dans la réponse FedaPay' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await supabaseAdmin
        .from('payment_transactions')
        .update({ transaction_ref: fedapayTransactionId.toString(), notes: `LocalRef=${transactionRef}` })
        .eq('id', transactionData.id);

      return new Response(JSON.stringify({
        success: true,
        paymentUrl,
        transactionId: transactionData.id,
        fedapayTransactionId,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Méthode inconnue
    return new Response(JSON.stringify({
      success: true,
      transactionId: transactionData.id,
      transactionRef,
      message: 'Transaction enregistrée.',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('initiate-payment error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
