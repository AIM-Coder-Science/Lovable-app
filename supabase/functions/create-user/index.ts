import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Génère un mot de passe sécurisé avec crypto.getRandomValues()
 * au lieu de Math.random() (non-cryptographique).
 */
function generatePassword(length = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%&*';
  const all = uppercase + lowercase + numbers + special;

  const randomByte = () => {
    const arr = new Uint8Array(1);
    crypto.getRandomValues(arr);
    return arr[0];
  };

  const pickChar = (charset: string) => charset[randomByte() % charset.length];

  // Garantit au moins un caractère de chaque catégorie
  const required = [
    pickChar(uppercase),
    pickChar(lowercase),
    pickChar(numbers),
    pickChar(special),
  ];

  const rest = Array.from({ length: length - required.length }, () => pickChar(all));
  const combined = [...required, ...rest];

  // Mélange avec Fisher-Yates + crypto
  for (let i = combined.length - 1; i > 0; i--) {
    const j = randomByte() % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join('');
}

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

    // ── Authentification appelant ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !callingUser) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Vérifie que l'appelant est bien admin
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callingUser.id)
      .single();

    if (!roleData || roleData.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès refusé - Admin requis' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const {
      firstName, lastName, phone, userType,
      specialties, classId, birthday, parentName, parentPhone,
      matricule, email, permissions
    } = body;

    if (!firstName || !lastName || !userType) {
      return new Response(JSON.stringify({ error: 'Champs obligatoires manquants' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Création d'un ADMIN ────────────────────────────────────────────────
    if (userType === 'admin') {
      const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin', { user_id: callingUser.id });

      if (!isSuperAdmin) {
        const { data: callerPerms } = await supabaseAdmin
          .from('admin_permissions')
          .select('can_manage_admins')
          .eq('admin_user_id', callingUser.id)
          .maybeSingle();

        if (!callerPerms?.can_manage_admins) {
          return new Response(JSON.stringify({ error: 'Vous n\'avez pas la permission de créer des administrateurs' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      if (!email) {
        return new Response(JSON.stringify({ error: 'L\'email est requis pour un administrateur' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const generatedPassword = generatePassword(14);

      const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const newUser = authData.user;

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({ user_id: newUser.id, first_name: firstName, last_name: lastName, email, phone: phone || null });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.id);
        return new Response(JSON.stringify({ error: 'Erreur lors de la création du profil' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: newUser.id, role: 'admin' });

      if (roleError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.id);
        return new Response(JSON.stringify({ error: 'Erreur lors de l\'assignation du rôle' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Permissions admin
      const permData: Record<string, unknown> = {
        admin_user_id: newUser.id,
        created_by_user_id: callingUser.id,
        ...(permissions ?? {}),
      };
      await supabaseAdmin.from('admin_permissions').insert(permData);

      // Stocke le mot de passe généré (affiché une seule fois à l'admin)
      await supabaseAdmin.from('user_credentials').insert({
        user_id: newUser.id,
        generated_password: generatedPassword,
      });

      return new Response(JSON.stringify({
        success: true,
        userId: newUser.id,
        email,
        generatedPassword,
        message: 'Administrateur créé avec succès',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Création ENSEIGNANT / APPRENANT ────────────────────────────────────
    let finalMatricule = matricule;
    if (!finalMatricule) {
      const prefix = userType === 'teacher' ? 'EN' : 'AP';
      const { data: matriculeData, error: matriculeError } = await supabaseAdmin
        .rpc('generate_matricule', { p_prefix: prefix });

      if (matriculeError) {
        return new Response(JSON.stringify({ error: 'Erreur lors de la génération du matricule' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      finalMatricule = matriculeData;
    }

    const matriculeNumbers = finalMatricule.replace(/\D/g, '');
    const generatedEmail = `${lastName.charAt(0).toLowerCase()}${firstName.charAt(0).toLowerCase()}${matriculeNumbers}@tintin.edugest`;
    const generatedPassword = generatePassword(14);

    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: generatedEmail,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const newUser = authData.user;

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: newUser.id,
        first_name: firstName,
        last_name: lastName,
        email: generatedEmail,
        phone: phone || null,
      })
      .select()
      .single();

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      return new Response(JSON.stringify({ error: 'Erreur lors de la création du profil' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const role = userType === 'teacher' ? 'teacher' : 'student';
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: newUser.id, role });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      return new Response(JSON.stringify({ error: 'Erreur lors de l\'assignation du rôle' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let entityId: string | null = null;

    if (userType === 'teacher') {
      const { data: teacherData, error: teacherError } = await supabaseAdmin
        .from('teachers')
        .insert({ user_id: newUser.id, profile_id: profileData.id, employee_id: finalMatricule })
        .select()
        .single();

      if (teacherError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.id);
        return new Response(JSON.stringify({ error: 'Erreur lors de la création de l\'enseignant' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      entityId = teacherData.id;

      if (specialties && specialties.length > 0) {
        await supabaseAdmin.from('teacher_specialties').insert(
          specialties.map((subjectId: string) => ({ teacher_id: teacherData.id, subject_id: subjectId }))
        );
      }
    } else {
      const { data: studentData, error: studentError } = await supabaseAdmin
        .from('students')
        .insert({
          user_id: newUser.id,
          profile_id: profileData.id,
          matricule: finalMatricule,
          class_id: classId || null,
          birthday: birthday || null,
          parent_name: parentName || null,
          parent_phone: parentPhone || null,
        })
        .select()
        .single();

      if (studentError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.id);
        return new Response(JSON.stringify({ error: 'Erreur lors de la création de l\'apprenant' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      entityId = studentData.id;
    }

    await supabaseAdmin.from('user_credentials').insert({
      user_id: newUser.id,
      generated_password: generatedPassword,
    });

    return new Response(JSON.stringify({
      success: true,
      userId: newUser.id,
      entityId,
      matricule: finalMatricule,
      email: generatedEmail,
      generatedPassword,
      message: `${userType === 'teacher' ? 'Enseignant' : 'Apprenant'} créé avec succès`,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('create-user error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
