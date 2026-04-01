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

    const { class_id, variant_count = 1 } = await req.json();
    if (!class_id) throw new Error("class_id is required");

    // Fetch all data needed for generation
    const [
      { data: classData },
      { data: teacherClasses },
      { data: subjects },
      { data: teachers },
      { data: rooms },
      { data: constraints },
      { data: existingSlots },
    ] = await Promise.all([
      supabase.from("classes").select("*").eq("id", class_id).single(),
      supabase.from("teacher_classes").select("*, subject:subjects(*), teacher:teachers(*, profile:profiles(first_name, last_name))").eq("class_id", class_id),
      supabase.from("subjects").select("*").eq("is_active", true),
      supabase.from("teachers").select("*, profile:profiles(first_name, last_name)").eq("is_active", true),
      supabase.from("rooms").select("*").eq("is_active", true),
      supabase.from("timetable_constraints").select("*").eq("is_active", true).limit(1),
      supabase.from("timetable_slots").select("*"),
    ]);

    if (!classData) throw new Error("Classe introuvable");
    if (!teacherClasses?.length) throw new Error("Aucun enseignant assigné à cette classe");

    // Get constraint settings
    const constraint = constraints?.[0] || {
      period_start: "07:00",
      period_end: "18:00",
      lunch_start: "12:00",
      lunch_end: "13:00",
      days_of_week: [1, 2, 3, 4, 5, 6],
      max_consecutive_hours: 4,
    };

    const periodStart = parseInt(String(constraint.period_start).slice(0, 2));
    const periodEnd = parseInt(String(constraint.period_end).slice(0, 2));
    const lunchStart = parseInt(String(constraint.lunch_start).slice(0, 2));
    const lunchEnd = parseInt(String(constraint.lunch_end).slice(0, 2));
    const days = constraint.days_of_week || [1, 2, 3, 4, 5, 6];

    const variants: any[] = [];

    for (let v = 0; v < variant_count; v++) {
      const newSlots: any[] = [];
      const conflictsList: string[] = [];

      // Track occupied slots globally
      const occupied = new Map<string, boolean>();
      const markOccupied = (type: string, id: string, day: number, hour: number) => {
        occupied.set(`${type}-${id}-${day}-${hour}`, true);
      };
      const isOccupied = (type: string, id: string, day: number, hour: number) => {
        return occupied.get(`${type}-${id}-${day}-${hour}`) === true;
      };

      // Mark existing slots from OTHER classes
      (existingSlots || []).filter((s: any) => s.class_id !== class_id).forEach((s: any) => {
        const sH = parseInt(s.start_time.slice(0, 2));
        const eH = parseInt(s.end_time.slice(0, 2));
        for (let h = sH; h < eH; h++) {
          markOccupied("teacher", s.teacher_id, s.day_of_week, h);
          if (s.room_id) markOccupied("room", s.room_id, s.day_of_week, h);
        }
      });

      // Build subject requirements
      const subjectReqs: { teacher_id: string; subject_id: string; hours: number; block_size: number; subject_name: string }[] = [];
      for (const tc of teacherClasses!) {
        const subject = tc.subject as any;
        if (!subject) continue;
        const hpw = subject.hours_per_week || subject.coefficient || 2;
        const blockSize = subject.preferred_block_size || 60;
        subjectReqs.push({
          teacher_id: tc.teacher_id,
          subject_id: tc.subject_id,
          hours: hpw,
          block_size: blockSize,
          subject_name: subject.name,
        });
      }

      // Shuffle for variant diversity
      if (v > 0) {
        for (let i = subjectReqs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [subjectReqs[i], subjectReqs[j]] = [subjectReqs[j], subjectReqs[i]];
        }
      }

      // Get teacher constraints
      const teacherMap: Record<string, any> = {};
      for (const t of (teachers || [])) {
        teacherMap[t.id] = t;
      }

      // Assign slots
      for (const req of subjectReqs) {
        let remaining = req.hours;
        const blockHours = Math.max(1, Math.round(req.block_size / 60));
        const teacher = teacherMap[req.teacher_id];
        const maxPerDay = teacher?.max_hours_per_day || 8;
        const unavailable = teacher?.unavailable_slots || [];

        // Track teacher hours per day
        const teacherDayHours: Record<number, number> = {};

        for (const day of days) {
          if (remaining <= 0) break;
          
          // Check teacher unavailability
          const isUnavail = (unavailable as any[]).some((u: any) => u.day === day);
          if (isUnavail) continue;

          for (let hour = periodStart; hour <= periodEnd - blockHours; hour++) {
            if (remaining <= 0) break;
            
            // Skip lunch
            let overlapsLunch = false;
            for (let bh = 0; bh < blockHours; bh++) {
              if (hour + bh >= lunchStart && hour + bh < lunchEnd) {
                overlapsLunch = true;
                break;
              }
            }
            if (overlapsLunch) continue;

            // Check all hours in block
            let canPlace = true;
            for (let bh = 0; bh < blockHours; bh++) {
              if (isOccupied("teacher", req.teacher_id, day, hour + bh) ||
                  isOccupied("class", class_id, day, hour + bh)) {
                canPlace = false;
                break;
              }
            }
            if (!canPlace) continue;

            // Check teacher day limit
            const currentDayHours = teacherDayHours[day] || 0;
            if (currentDayHours + blockHours > maxPerDay) continue;

            // Find free room
            let roomId: string | null = null;
            let roomName: string | null = null;
            for (const room of (rooms || [])) {
              let roomFree = true;
              for (let bh = 0; bh < blockHours; bh++) {
                if (isOccupied("room", room.id, day, hour + bh)) {
                  roomFree = false;
                  break;
                }
              }
              if (roomFree) {
                roomId = room.id;
                roomName = room.name;
                break;
              }
            }

            const startTime = `${String(hour).padStart(2, "0")}:00`;
            const endTime = `${String(hour + blockHours).padStart(2, "0")}:00`;

            newSlots.push({
              day_of_week: day,
              start_time: startTime,
              end_time: endTime,
              class_id,
              subject_id: req.subject_id,
              teacher_id: req.teacher_id,
              room: roomName,
              room_id: roomId,
            });

            for (let bh = 0; bh < blockHours; bh++) {
              markOccupied("teacher", req.teacher_id, day, hour + bh);
              markOccupied("class", class_id, day, hour + bh);
              if (roomId) markOccupied("room", roomId, day, hour + bh);
            }

            teacherDayHours[day] = (teacherDayHours[day] || 0) + blockHours;
            remaining -= blockHours;
            break; // Move to next day for distribution
          }
        }

        if (remaining > 0) {
          conflictsList.push(`${req.subject_name}: ${remaining}h non placée(s)`);
        }
      }

      // Get existing version count
      const { count } = await supabase
        .from("timetable_generations")
        .select("*", { count: "exact", head: true })
        .eq("class_id", class_id);

      const version = (count || 0) + v + 1;

      // Save generation
      const { data: gen, error: genError } = await supabase
        .from("timetable_generations")
        .insert({
          class_id,
          version,
          status: conflictsList.length > 0 ? "conflicts" : "generated",
          slots_count: newSlots.length,
          conflicts_count: conflictsList.length,
          conflicts_details: conflictsList,
          slots_data: newSlots,
          is_active: false,
        })
        .select()
        .single();

      if (genError) throw genError;

      variants.push({
        id: gen.id,
        version,
        slots_count: newSlots.length,
        conflicts_count: conflictsList.length,
        conflicts: conflictsList,
        slots: newSlots,
      });
    }

    return new Response(JSON.stringify({ success: true, variants }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
