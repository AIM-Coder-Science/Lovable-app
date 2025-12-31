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
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !callingUser) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if calling user is admin
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callingUser.id)
      .single();

    if (!roleData || roleData.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès refusé - Admin requis' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      phone,
      userType, // 'teacher' or 'student'
      // Teacher specific
      employeeId,
      specialties, // array of subject_ids
      // Student specific
      matricule,
      classId,
      birthday,
      parentName,
      parentPhone,
    } = body;

    // Validation
    if (!email || !password || !firstName || !lastName || !userType) {
      return new Response(JSON.stringify({ error: 'Champs obligatoires manquants' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (userType === 'student' && !matricule) {
      return new Response(JSON.stringify({ error: 'Matricule requis pour un étudiant' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Creating ${userType}: ${email}`);

    // Create auth user using admin API
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      }
    });

    if (createError) {
      console.error('Auth creation error:', createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const newUser = authData.user;
    console.log('User created:', newUser.id);

    // Create profile
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: newUser.id,
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone || null,
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      return new Response(JSON.stringify({ error: 'Erreur lors de la création du profil' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Profile created:', profileData.id);

    // Assign role
    const role = userType === 'teacher' ? 'teacher' : 'student';
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: newUser.id,
        role: role,
      });

    if (roleError) {
      console.error('Role assignment error:', roleError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      return new Response(JSON.stringify({ error: 'Erreur lors de l\'assignation du rôle' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Role assigned:', role);

    let entityId = null;

    if (userType === 'teacher') {
      // Create teacher record
      const { data: teacherData, error: teacherError } = await supabaseAdmin
        .from('teachers')
        .insert({
          user_id: newUser.id,
          profile_id: profileData.id,
          employee_id: employeeId || null,
        })
        .select()
        .single();

      if (teacherError) {
        console.error('Teacher creation error:', teacherError);
        await supabaseAdmin.auth.admin.deleteUser(newUser.id);
        return new Response(JSON.stringify({ error: 'Erreur lors de la création de l\'enseignant' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      entityId = teacherData.id;
      console.log('Teacher created:', entityId);

      // Add specialties if provided
      if (specialties && specialties.length > 0) {
        const specialtiesInsert = specialties.map((subjectId: string) => ({
          teacher_id: teacherData.id,
          subject_id: subjectId,
        }));

        const { error: specError } = await supabaseAdmin
          .from('teacher_specialties')
          .insert(specialtiesInsert);

        if (specError) {
          console.error('Specialties error:', specError);
        } else {
          console.log('Specialties added:', specialties.length);
        }
      }
    } else {
      // Create student record
      const { data: studentData, error: studentError } = await supabaseAdmin
        .from('students')
        .insert({
          user_id: newUser.id,
          profile_id: profileData.id,
          matricule: matricule,
          class_id: classId || null,
          birthday: birthday || null,
          parent_name: parentName || null,
          parent_phone: parentPhone || null,
        })
        .select()
        .single();

      if (studentError) {
        console.error('Student creation error:', studentError);
        await supabaseAdmin.auth.admin.deleteUser(newUser.id);
        return new Response(JSON.stringify({ error: 'Erreur lors de la création de l\'étudiant' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      entityId = studentData.id;
      console.log('Student created:', entityId);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      userId: newUser.id,
      entityId: entityId,
      message: `${userType === 'teacher' ? 'Enseignant' : 'Apprenant'} créé avec succès`
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
