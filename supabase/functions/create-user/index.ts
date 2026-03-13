import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generatePassword(length = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%&*';
  const all = uppercase + lowercase + numbers + special;
  
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
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

    // For admin creation, verify caller has can_manage_admins permission
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

      const generatedPassword = generatePassword(12);

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
        .insert({
          user_id: newUser.id,
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || null,
        });

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

      // Create admin_permissions
      const permData: Record<string, any> = {
        admin_user_id: newUser.id,
        created_by_user_id: callingUser.id,
      };
      if (permissions) {
        Object.keys(permissions).forEach(key => {
          permData[key] = permissions[key];
        });
      }

      await supabaseAdmin.from('admin_permissions').insert(permData);

      // Store credentials
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

    // Teacher / Student creation (existing logic)
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
    const generatedPassword = generatePassword(12);

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

    let entityId = null;

    if (userType === 'teacher') {
      const { data: teacherData, error: teacherError } = await supabaseAdmin
        .from('teachers')
        .insert({
          user_id: newUser.id,
          profile_id: profileData.id,
          employee_id: finalMatricule,
        })
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
          specialties.map((subjectId: string) => ({
            teacher_id: teacherData.id,
            subject_id: subjectId,
          }))
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
        return new Response(JSON.stringify({ error: 'Erreur lors de la création de l\'étudiant' }), {
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

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
