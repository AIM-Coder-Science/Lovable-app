import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOLVER_API = "https://school-timetable-solver-api.onrender.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { class_id, variant_count = 1 } = body;
    if (!class_id) throw new Error("class_id est requis");

    // ── Fetch all needed data ─────────────────────────────────────────────
    const [
      { data: classData, error: classErr },
      { data: teacherClasses, error: tcErr },
      { data: allTeachers },
      { data: allRooms },
      { data: constraints },
      { data: allSubjects },
      { data: existingSlots },
    ] = await Promise.all([
      supabase.from("classes").select("*").eq("id", class_id).single(),
      supabase.from("teacher_classes")
        .select("*, subject:subjects(*), teacher:teachers(*, profile:profiles(first_name, last_name))")
        .eq("class_id", class_id),
      supabase.from("teachers").select("*, profile:profiles(first_name, last_name)").eq("is_active", true),
      supabase.from("rooms").select("*").eq("is_active", true),
      supabase.from("timetable_constraints").select("*").eq("is_active", true).limit(1),
      supabase.from("subjects").select("*").eq("is_active", true),
      supabase.from("timetable_slots").select("*"),
    ]);

    if (classErr || !classData) throw new Error("Classe introuvable: " + (classErr?.message || ""));
    if (!teacherClasses?.length) throw new Error("Aucun enseignant assigné à cette classe. Assignez des enseignants dans la page Enseignants.");

    const constraint = constraints?.[0] || {
      period_start: "07:00", period_end: "18:00",
      lunch_start: "12:00", lunch_end: "13:00",
      days_of_week: [1, 2, 3, 4, 5, 6], max_consecutive_hours: 4,
    };

    // ── Try OR-Tools solver first ─────────────────────────────────────────
    const allClasses = [{ id: classData.id, name: classData.name, size: classData.max_students || 30 }];
    
    const teacherMap: Record<string, any> = {};
    (allTeachers || []).forEach((t: any) => { teacherMap[t.id] = t; });

    const usedTeacherIds = [...new Set(teacherClasses.map((tc: any) => tc.teacher_id))];
    const solverTeachers = usedTeacherIds.map((tid: string) => {
      const t = teacherMap[tid];
      return {
        id: tid,
        name: t?.profile ? `${t.profile.first_name} ${t.profile.last_name}` : tid,
        max_hours_per_day: t?.max_hours_per_day || 6,
        max_hours_per_week: t?.max_hours_per_week || 30,
        unavailable_slots: t?.unavailable_slots || [],
      };
    });

    const usedSubjectIds = [...new Set(teacherClasses.map((tc: any) => tc.subject_id))];
    const subjectMap: Record<string, any> = {};
    (allSubjects || []).forEach((s: any) => { subjectMap[s.id] = s; });
    const solverSubjects = usedSubjectIds.map((sid: string) => {
      const s = subjectMap[sid];
      return {
        id: sid,
        name: s?.name || sid,
        hours_per_week: s?.hours_per_week || 2,
        preferred_block_minutes: s?.preferred_block_size || 60,
        is_single_session_only: s?.is_single_session_only || false,
      };
    });

    const solverRooms = (allRooms || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity || 30,
      room_type: r.room_type || "classroom",
    }));

    const solverAssignments = teacherClasses.map((tc: any) => ({
      teacher_id: tc.teacher_id,
      class_id: class_id,
      subject_id: tc.subject_id,
    }));

    const solverPayload = {
      classes: allClasses,
      subjects: solverSubjects,
      teachers: solverTeachers,
      rooms: solverRooms.length > 0 ? solverRooms : [{ id: "default", name: "Salle par défaut", capacity: 30, room_type: "classroom" }],
      assignments: solverAssignments,
      constraints: {
        period_start: String(constraint.period_start).slice(0, 5),
        period_end: String(constraint.period_end).slice(0, 5),
        lunch_start: String(constraint.lunch_start).slice(0, 5),
        lunch_end: String(constraint.lunch_end).slice(0, 5),
        days_of_week: constraint.days_of_week || [1, 2, 3, 4, 5, 6],
        max_consecutive_hours: constraint.max_consecutive_hours || 4,
      },
      max_time_seconds: 45,
    };

    let variants: any[] = [];

    // Try OR-Tools solver
    try {
      const solverRes = await fetch(`${SOLVER_API}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solverPayload),
        signal: AbortSignal.timeout(60000),
      });

      if (solverRes.ok) {
        const solverData = await solverRes.json();
        if (solverData.status === "success" || solverData.status === "partial") {
          // Convert OR-Tools format to slots format
          for (let v = 0; v < variant_count; v++) {
            const newSlots = (solverData.timetable || []).map((entry: any) => ({
              day_of_week: entry.day,
              start_time: `${String(entry.start_hour).padStart(2, "0")}:${String(entry.start_minute || 0).padStart(2, "0")}`,
              end_time: (() => {
                const totalMin = entry.start_hour * 60 + (entry.start_minute || 0) + entry.duration_minutes;
                return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
              })(),
              class_id: class_id,
              subject_id: entry.subject_id,
              teacher_id: entry.teacher_id,
              room: entry.room_name !== "—" ? entry.room_name : null,
              room_id: entry.room_id !== "none" ? entry.room_id : null,
            }));

            const { count } = await supabase
              .from("timetable_generations")
              .select("*", { count: "exact", head: true })
              .eq("class_id", class_id);

            const version = (count || 0) + v + 1;
            const conflictsList = solverData.conflicts || [];

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

          return new Response(JSON.stringify({ success: true, variants, solver: "or-tools" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (solverError: any) {
      console.log("OR-Tools solver unavailable, falling back to greedy:", solverError.message);
    }

    // ── Fallback: Greedy algorithm ────────────────────────────────────────
    const periodStart = parseInt(String(constraint.period_start).slice(0, 2));
    const periodEnd   = parseInt(String(constraint.period_end).slice(0, 2));
    const lunchStart  = parseInt(String(constraint.lunch_start).slice(0, 2));
    const lunchEnd    = parseInt(String(constraint.lunch_end).slice(0, 2));
    const days = (constraint.days_of_week as number[]) || [1, 2, 3, 4, 5, 6];

    for (let v = 0; v < variant_count; v++) {
      const newSlots: any[] = [];
      const conflictsList: string[] = [];

      const occupied = new Map<string, boolean>();
      const markOccupied = (type: string, id: string, day: number, hour: number) =>
        occupied.set(`${type}-${id}-${day}-${hour}`, true);
      const isOccupied = (type: string, id: string, day: number, hour: number) =>
        occupied.get(`${type}-${id}-${day}-${hour}`) === true;

      // Mark slots from OTHER classes
      (existingSlots || []).filter((s: any) => s.class_id !== class_id).forEach((s: any) => {
        const sH = parseInt(s.start_time.slice(0, 2));
        const eH = parseInt(s.end_time.slice(0, 2));
        for (let h = sH; h < eH; h++) {
          markOccupied("teacher", s.teacher_id, s.day_of_week, h);
          if (s.room_id) markOccupied("room", s.room_id, s.day_of_week, h);
        }
      });

      const subjectReqs = teacherClasses!.map((tc: any) => {
        const subject = tc.subject as any;
        const hpw = subject?.hours_per_week || 2;
        const blockSize = subject?.preferred_block_size || 60;
        return {
          teacher_id: tc.teacher_id,
          subject_id: tc.subject_id,
          hours: hpw,
          block_size: blockSize,
          subject_name: subject?.name || tc.subject_id,
        };
      });

      if (v > 0) {
        for (let i = subjectReqs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [subjectReqs[i], subjectReqs[j]] = [subjectReqs[j], subjectReqs[i]];
        }
      }

      for (const req of subjectReqs) {
        let remaining = req.hours;
        const blockHours = Math.max(1, Math.round(req.block_size / 60));
        const teacher = teacherMap[req.teacher_id];
        const maxPerDay = teacher?.max_hours_per_day || 8;
        const unavailable = (teacher?.unavailable_slots || []) as any[];
        const teacherDayHours: Record<number, number> = {};

        for (const day of days) {
          if (remaining <= 0) break;
          if (unavailable.some((u: any) => u.day === day)) continue;

          for (let hour = periodStart; hour <= periodEnd - blockHours; hour++) {
            if (remaining <= 0) break;

            let overlapsLunch = false;
            for (let bh = 0; bh < blockHours; bh++) {
              if (hour + bh >= lunchStart && hour + bh < lunchEnd) { overlapsLunch = true; break; }
            }
            if (overlapsLunch) continue;

            let canPlace = true;
            for (let bh = 0; bh < blockHours; bh++) {
              if (isOccupied("teacher", req.teacher_id, day, hour + bh) ||
                  isOccupied("class", class_id, day, hour + bh)) { canPlace = false; break; }
            }
            if (!canPlace) continue;

            if ((teacherDayHours[day] || 0) + blockHours > maxPerDay) continue;

            // Find free room (strict: check room availability)
            let roomId: string | null = null;
            let roomName: string | null = null;
            for (const room of (allRooms || [])) {
              let roomFree = true;
              for (let bh = 0; bh < blockHours; bh++) {
                if (isOccupied("room", room.id, day, hour + bh)) { roomFree = false; break; }
              }
              if (roomFree) { roomId = room.id; roomName = room.name; break; }
            }

            const startTime = `${String(hour).padStart(2, "0")}:00`;
            const endTime = `${String(hour + blockHours).padStart(2, "0")}:00`;

            newSlots.push({
              day_of_week: day, start_time: startTime, end_time: endTime,
              class_id, subject_id: req.subject_id, teacher_id: req.teacher_id,
              room: roomName, room_id: roomId,
            });

            for (let bh = 0; bh < blockHours; bh++) {
              markOccupied("teacher", req.teacher_id, day, hour + bh);
              markOccupied("class", class_id, day, hour + bh);
              if (roomId) markOccupied("room", roomId, day, hour + bh);
            }

            teacherDayHours[day] = (teacherDayHours[day] || 0) + blockHours;
            remaining -= blockHours;
            break;
          }
        }

        if (remaining > 0) {
          conflictsList.push(`${req.subject_name}: ${remaining}h non placée(s)`);
        }
      }

      const { count } = await supabase
        .from("timetable_generations")
        .select("*", { count: "exact", head: true })
        .eq("class_id", class_id);

      const version = (count || 0) + v + 1;

      const { data: gen, error: genError } = await supabase
        .from("timetable_generations")
        .insert({
          class_id, version,
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
        id: gen.id, version,
        slots_count: newSlots.length,
        conflicts_count: conflictsList.length,
        conflicts: conflictsList,
        slots: newSlots,
      });
    }

    return new Response(JSON.stringify({ success: true, variants, solver: "greedy-fallback" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("generate-timetable error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
