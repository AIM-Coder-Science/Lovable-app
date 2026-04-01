import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { slot_id, day_of_week, start_time, end_time, class_id, teacher_id, room_id } = await req.json();

    // Fetch all existing slots excluding the one being edited
    const query = supabase.from("timetable_slots")
      .select("*, class:classes(name), subject:subjects(name), teacher:teachers(profile:profiles(first_name, last_name))")
      .eq("day_of_week", day_of_week);
    
    if (slot_id) query.neq("id", slot_id);
    
    const { data: slots } = await query;

    const conflicts: { type: string; message: string }[] = [];

    for (const slot of (slots || [])) {
      const slotStart = slot.start_time.slice(0, 5);
      const slotEnd = slot.end_time.slice(0, 5);

      // Check time overlap
      if (start_time < slotEnd && end_time > slotStart) {
        if (slot.teacher_id === teacher_id) {
          const name = slot.teacher?.profile ? `${slot.teacher.profile.first_name} ${slot.teacher.profile.last_name}` : "L'enseignant";
          conflicts.push({
            type: "teacher",
            message: `${name} enseigne déjà ${slot.subject?.name || ""} (${slotStart}-${slotEnd})`,
          });
        }
        if (slot.class_id === class_id) {
          conflicts.push({
            type: "class",
            message: `${slot.class?.name || "La classe"} a déjà ${slot.subject?.name || "un cours"} (${slotStart}-${slotEnd})`,
          });
        }
        if (room_id && slot.room_id === room_id) {
          conflicts.push({
            type: "room",
            message: `La salle est déjà occupée (${slotStart}-${slotEnd})`,
          });
        }
      }
    }

    // Check teacher constraints
    if (teacher_id) {
      const { data: teacher } = await supabase
        .from("teachers")
        .select("max_hours_per_day, max_hours_per_week, unavailable_slots")
        .eq("id", teacher_id)
        .single();

      if (teacher) {
        // Check unavailability
        const unavailable = (teacher.unavailable_slots as any[]) || [];
        const isUnavail = unavailable.some((u: any) => u.day === day_of_week);
        if (isUnavail) {
          conflicts.push({ type: "availability", message: "L'enseignant n'est pas disponible ce jour" });
        }

        // Check daily hours
        const { data: daySlots } = await supabase
          .from("timetable_slots")
          .select("start_time, end_time")
          .eq("teacher_id", teacher_id)
          .eq("day_of_week", day_of_week)
          .neq("id", slot_id || "");

        let totalMinutes = 0;
        for (const s of (daySlots || [])) {
          const [sh, sm] = s.start_time.split(":").map(Number);
          const [eh, em] = s.end_time.split(":").map(Number);
          totalMinutes += (eh * 60 + em) - (sh * 60 + sm);
        }
        const [nsh, nsm] = start_time.split(":").map(Number);
        const [neh, nem] = end_time.split(":").map(Number);
        totalMinutes += (neh * 60 + nem) - (nsh * 60 + nsm);

        if (totalMinutes / 60 > (teacher.max_hours_per_day || 8)) {
          conflicts.push({ type: "hours", message: `Dépassement des ${teacher.max_hours_per_day || 8}h/jour max pour cet enseignant` });
        }
      }
    }

    return new Response(JSON.stringify({ valid: conflicts.length === 0, conflicts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ valid: false, conflicts: [{ type: "error", message: error.message }] }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
