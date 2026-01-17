import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const transactionId = body?.transactionId as string | undefined;

    if (!transactionId) {
      return new Response(JSON.stringify({ error: "transactionId requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Validating cash payment transaction:", transactionId);

    const { data: tx, error: txError } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (txError || !tx) {
      console.error("Transaction fetch error:", txError);
      return new Response(JSON.stringify({ error: "Transaction introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tx.payment_method !== "cash") {
      return new Response(JSON.stringify({ error: "Cette transaction n'est pas un paiement en espèces" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tx.status === "completed") {
      return new Response(JSON.stringify({ success: true, message: "Déjà validé" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark transaction as completed
    const { error: updateTxError } = await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", transactionId);

    if (updateTxError) {
      console.error("Transaction update error:", updateTxError);
      return new Response(JSON.stringify({ error: "Impossible de valider la transaction" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply payment to article order
    if (tx.article_id && tx.student_id) {
      const { data: studentArticle } = await supabaseAdmin
        .from("student_articles")
        .select("*")
        .eq("student_id", tx.student_id)
        .eq("article_id", tx.article_id)
        .single();

      if (studentArticle) {
        const newAmountPaid = (studentArticle.amount_paid || 0) + tx.amount;
        const newStatus = newAmountPaid >= studentArticle.amount ? "paid" : "partial";

        await supabaseAdmin
          .from("student_articles")
          .update({
            amount_paid: newAmountPaid,
            status: newStatus,
            payment_date: newStatus === "paid" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", studentArticle.id);
      }
    }

    // Apply payment to invoice
    if (tx.invoice_id) {
      const { data: invoice } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("id", tx.invoice_id)
        .single();

      if (invoice) {
        const newAmountPaid = (invoice.amount_paid || 0) + tx.amount;
        const newStatus = newAmountPaid >= invoice.amount ? "paid" : "partial";

        await supabaseAdmin
          .from("invoices")
          .update({
            amount_paid: newAmountPaid,
            status: newStatus,
            payment_date: newStatus === "paid" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.id);
      }
    }

    // Notify student
    if (tx.student_id) {
      const { data: student } = await supabaseAdmin
        .from("students")
        .select("user_id")
        .eq("id", tx.student_id)
        .single();

      if (student?.user_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: student.user_id,
          type: "payment",
          title: "Paiement validé",
          message: `Votre paiement en espèces de ${tx.amount} FCFA a été validé par l'administration.`,
          metadata: { transaction_id: tx.id },
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("validate-cash-payment error:", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
