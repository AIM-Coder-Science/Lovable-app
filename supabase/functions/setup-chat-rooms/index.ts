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

    // Get auth token to verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all active classes
    const { data: classes } = await supabase
      .from("classes")
      .select("id, name")
      .eq("is_active", true);

    if (!classes) {
      return new Response(JSON.stringify({ message: "No classes found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let roomsCreated = 0;

    for (const cls of classes) {
      // 1. Create class chat room (students only) if not exists
      const { data: existingClassRoom } = await supabase
        .from("chat_rooms")
        .select("id")
        .eq("class_id", cls.id)
        .eq("room_type", "class")
        .maybeSingle();

      let classRoomId: string;
      if (!existingClassRoom) {
        const { data: newRoom } = await supabase
          .from("chat_rooms")
          .insert({ name: `Chat ${cls.name}`, room_type: "class", class_id: cls.id })
          .select("id")
          .single();
        classRoomId = newRoom!.id;
        roomsCreated++;
      } else {
        classRoomId = existingClassRoom.id;
      }

      // Add students of this class as members
      const { data: students } = await supabase
        .from("students")
        .select("user_id")
        .eq("class_id", cls.id)
        .eq("is_active", true);

      if (students) {
        for (const student of students) {
          await supabase
            .from("chat_room_members")
            .upsert({ room_id: classRoomId, user_id: student.user_id }, { onConflict: "room_id,user_id" });
        }
      }

      // 2. Create teacher-class room (teacher + students of class) if not exists
      const { data: teacherClasses } = await supabase
        .from("teacher_classes")
        .select("teacher_id, teachers(user_id)")
        .eq("class_id", cls.id);

      if (teacherClasses && teacherClasses.length > 0) {
        const { data: existingTeacherRoom } = await supabase
          .from("chat_rooms")
          .select("id")
          .eq("class_id", cls.id)
          .eq("room_type", "teacher_class")
          .maybeSingle();

        let teacherRoomId: string;
        if (!existingTeacherRoom) {
          const { data: newRoom } = await supabase
            .from("chat_rooms")
            .insert({ name: `Enseignants & ${cls.name}`, room_type: "teacher_class", class_id: cls.id })
            .select("id")
            .single();
          teacherRoomId = newRoom!.id;
          roomsCreated++;
        } else {
          teacherRoomId = existingTeacherRoom.id;
        }

        // Add teachers
        for (const tc of teacherClasses) {
          const teacherUserId = (tc as any).teachers?.user_id;
          if (teacherUserId) {
            await supabase
              .from("chat_room_members")
              .upsert({ room_id: teacherRoomId, user_id: teacherUserId }, { onConflict: "room_id,user_id" });
          }
        }

        // Add students
        if (students) {
          for (const student of students) {
            await supabase
              .from("chat_room_members")
              .upsert({ room_id: teacherRoomId, user_id: student.user_id }, { onConflict: "room_id,user_id" });
          }
        }
      }
    }

    // 3. Create teachers-only room
    const { data: existingTeachersRoom } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("room_type", "teachers")
      .is("class_id", null)
      .maybeSingle();

    let teachersRoomId: string;
    if (!existingTeachersRoom) {
      const { data: newRoom } = await supabase
        .from("chat_rooms")
        .insert({ name: "Salle des enseignants", room_type: "teachers" })
        .select("id")
        .single();
      teachersRoomId = newRoom!.id;
      roomsCreated++;
    } else {
      teachersRoomId = existingTeachersRoom.id;
    }

    // Add all active teachers
    const { data: allTeachers } = await supabase
      .from("teachers")
      .select("user_id")
      .eq("is_active", true);

    if (allTeachers) {
      for (const teacher of allTeachers) {
        await supabase
          .from("chat_room_members")
          .upsert({ room_id: teachersRoomId, user_id: teacher.user_id }, { onConflict: "room_id,user_id" });
      }
    }

    return new Response(
      JSON.stringify({ success: true, roomsCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
