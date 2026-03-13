import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim();
    const html = String(body?.html ?? "").trim();
    const studentId = String(body?.studentId ?? "").trim();
    const classId = body?.classId ? String(body.classId) : null;
    const period = String(body?.period ?? "").trim();

    if (!title || !html || !studentId || !period) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = roleData?.role === "admin";
    let isPrincipal = false;

    if (!isAdmin && classId) {
      const { data: principalData } = await supabase.rpc("is_principal_of_class", {
        _user_id: user.id,
        _class_id: classId,
      });
      isPrincipal = !!principalData;
    }

    if (!isAdmin && !isPrincipal) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safePeriod = period
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();

    const filePath = `documents/bulletins/${studentId}/${safePeriod}_${Date.now()}.html`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, new Blob([html], { type: "text/html; charset=utf-8" }), {
        contentType: "text/html; charset=utf-8",
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath);

    const { data: existingDoc } = await supabase
      .from("documents")
      .select("id")
      .eq("title", title)
      .eq("doc_type", "bulletin")
      .eq("student_id", studentId)
      .maybeSingle();

    if (existingDoc?.id) {
      const { error: updateError } = await supabase
        .from("documents")
        .update({
          file_url: urlData.publicUrl,
          class_id: classId,
          visibility: "student",
          uploaded_by: user.id,
        })
        .eq("id", existingDoc.id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, updated: true, id: existingDoc.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("documents")
      .insert({
        title,
        doc_type: "bulletin",
        file_url: urlData.publicUrl,
        visibility: "student",
        student_id: studentId,
        class_id: classId,
        uploaded_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, updated: false, id: inserted.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
