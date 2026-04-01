import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle, Clock, Plus, Trash2, Calendar, MapPin, User,
  BookOpen, Wand2, Loader2, Download, FileText, CheckCircle,
  History, Sparkles, X, Pencil
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";

interface TimetableSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room: string | null;
  room_id: string | null;
  class?: { name: string };
  subject?: { name: string };
  teacher?: { profile?: { first_name: string; last_name: string } };
}

interface ClassItem { id: string; name: string; level: string; }
interface SubjectItem { id: string; name: string; hours_per_week?: number; }
interface TeacherItem {
  id: string;
  profile: { first_name: string; last_name: string };
}
interface TeacherClassItem {
  teacher_id: string;
  class_id: string;
  subject_id: string;
}
interface RoomItem { id: string; name: string; capacity: number; room_type: string; is_active: boolean; }
interface Generation {
  id: string;
  version: number;
  status: string;
  slots_count: number;
  conflicts_count: number;
  conflicts_details: string[];
  is_active: boolean;
  generated_at: string;
  slots_data: any[];
}

const DAYS = [
  { value: 1, label: "Lundi", short: "Lun" },
  { value: 2, label: "Mardi", short: "Mar" },
  { value: 3, label: "Mercredi", short: "Mer" },
  { value: 4, label: "Jeudi", short: "Jeu" },
  { value: 5, label: "Vendredi", short: "Ven" },
  { value: 6, label: "Samedi", short: "Sam" },
];

const TIME_SLOTS = [
  "07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30",
  "11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30",
  "15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00"
];

const DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 heure" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2 heures" },
  { value: 180, label: "3 heures" },
  { value: 240, label: "4 heures" },
];

const SUBJECT_COLORS = [
  "#3b82f6","#10b981","#8b5cf6","#f59e0b","#ec4899",
  "#06b6d4","#84cc16","#ef4444","#6366f1","#14b8a6",
];

const Timetable = () => {
  const { role, teacherId, studentId } = useAuth();
  const calendarRef = useRef<any>(null);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [viewMode, setViewMode] = useState<"class" | "teacher">("class");
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>("");

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [conflicts, setConflicts] = useState<{ type: string; message: string }[]>([]);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genVariants, setGenVariants] = useState<any[]>([]);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [variantCount, setVariantCount] = useState(1);

  // History
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  const [formData, setFormData] = useState({
    day_of_week: 1, start_time: "08:00", duration: 60,
    class_id: "", subject_id: "", teacher_id: "", room_id: "__none__",
  });

  // Filters
  const filteredTeachersForForm = useMemo(() => {
    if (!formData.class_id) return teachers;
    const pairs = teacherClasses.filter(tc => tc.class_id === formData.class_id);
    if (formData.subject_id) {
      const forSubject = pairs.filter(tc => tc.subject_id === formData.subject_id);
      return teachers.filter(t => forSubject.some(tc => tc.teacher_id === t.id));
    }
    return teachers.filter(t => pairs.some(tc => tc.teacher_id === t.id));
  }, [formData.class_id, formData.subject_id, teacherClasses, teachers]);

  const filteredSubjectsForForm = useMemo(() => {
    if (!formData.class_id) return subjects;
    const pairs = teacherClasses.filter(tc => tc.class_id === formData.class_id);
    if (formData.teacher_id) {
      const forTeacher = pairs.filter(tc => tc.teacher_id === formData.teacher_id);
      return subjects.filter(s => forTeacher.some(tc => tc.subject_id === s.id));
    }
    return subjects.filter(s => pairs.some(tc => tc.subject_id === s.id));
  }, [formData.class_id, formData.teacher_id, teacherClasses, subjects]);

  // Color map
  const subjectColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const uniqueSubjects = [...new Set(slots.map(s => s.subject_id))];
    uniqueSubjects.forEach((id, i) => { map[id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });
    return map;
  }, [slots]);

  useEffect(() => { fetchData(); }, [role, teacherId, studentId]);

  const fetchData = async () => {
    setLoading(true);
    if (role === "admin") {
      const [classesRes, subjectsRes, teachersRes, tcRes, roomsRes] = await Promise.all([
        supabase.from("classes").select("id, name, level").eq("is_active", true).order("name"),
        supabase.from("subjects").select("id, name, hours_per_week").eq("is_active", true).order("name"),
        supabase.from("teachers").select("id, profile:profiles(first_name, last_name)").eq("is_active", true),
        supabase.from("teacher_classes").select("teacher_id, class_id, subject_id"),
        supabase.from("rooms").select("*").eq("is_active", true).order("name"),
      ]);
      setClasses(classesRes.data || []);
      setSubjects((subjectsRes.data as any) || []);
      setTeachers(teachersRes.data as any || []);
      setTeacherClasses(tcRes.data || []);
      setRooms((roomsRes.data as any) || []);
      if (classesRes.data?.length) setSelectedClass(classesRes.data[0].id);
    }
    if (role === "student" && studentId) {
      const { data: student } = await supabase.from("students").select("class_id").eq("id", studentId).single();
      if (student?.class_id) setSelectedClass(student.class_id);
    }
    if (role === "teacher" && teacherId) {
      const { data: tcs } = await supabase.from("teacher_classes").select("class_id, class:classes(id, name, level)").eq("teacher_id", teacherId);
      const uniqueClasses = [...new Map((tcs || []).map((tc: any) => [tc.class_id, tc.class])).values()].filter(Boolean) as ClassItem[];
      setClasses(uniqueClasses);
      if (uniqueClasses.length) setSelectedClass(uniqueClasses[0].id);
    }
    await fetchSlots();
    setLoading(false);
  };

  const fetchSlots = async () => {
    const { data, error } = await supabase
      .from("timetable_slots")
      .select("*, class:classes(name), subject:subjects(name), teacher:teachers(profile:profiles(first_name, last_name))")
      .order("day_of_week").order("start_time");
    if (error) toast({ title: "Erreur", description: "Impossible de charger l'emploi du temps", variant: "destructive" });
    else setSlots(data || []);
  };

  const fetchGenerations = async () => {
    if (!selectedClass) return;
    const { data } = await (supabase as any)
      .from("timetable_generations")
      .select("*")
      .eq("class_id", selectedClass)
      .order("generated_at", { ascending: false })
      .limit(20);
    setGenerations(data || []);
  };

  useEffect(() => { if (selectedClass) fetchGenerations(); }, [selectedClass]);

  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [h, m] = startTime.split(":").map(Number);
    const total = h * 60 + m + durationMinutes;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  // Conflict check via edge function
  const checkConflictsRemote = async (params: any) => {
    try {
      const { data, error } = await supabase.functions.invoke("validate-manual-edit", { body: params });
      if (error) throw error;
      return (data as any)?.conflicts || [];
    } catch {
      return [];
    }
  };

  // Local conflict check for immediate feedback
  const checkConflictsLocal = useCallback((
    newSlot: { day_of_week: number; start_time: string; end_time: string; class_id: string; teacher_id: string; room_id: string },
    excludeSlotId?: string
  ) => {
    const result: { type: string; message: string }[] = [];
    const roomId = newSlot.room_id === "__none__" ? "" : newSlot.room_id;
    slots.forEach(slot => {
      if (excludeSlotId && slot.id === excludeSlotId) return;
      if (slot.day_of_week !== newSlot.day_of_week) return;
      const sStart = slot.start_time.slice(0, 5);
      const sEnd = slot.end_time.slice(0, 5);
      if (!(newSlot.start_time < sEnd && newSlot.end_time > sStart)) return;

      if (slot.teacher_id === newSlot.teacher_id) {
        const name = slot.teacher?.profile ? `${slot.teacher.profile.first_name} ${slot.teacher.profile.last_name}` : "Ce professeur";
        result.push({ type: "teacher", message: `${name} enseigne déjà ${slot.subject?.name || ""} (${sStart}-${sEnd})` });
      }
      if (slot.class_id === newSlot.class_id) {
        result.push({ type: "class", message: `${slot.class?.name || "Classe"} a déjà ${slot.subject?.name || "un cours"} (${sStart}-${sEnd})` });
      }
      if (roomId && slot.room_id === roomId) {
        result.push({ type: "room", message: `Salle occupée (${sStart}-${sEnd})` });
      }
    });
    return result;
  }, [slots]);

  useEffect(() => {
    if (formData.class_id && formData.teacher_id && formData.start_time) {
      const endTime = calculateEndTime(formData.start_time, formData.duration);
      setConflicts(checkConflictsLocal({
        day_of_week: formData.day_of_week, start_time: formData.start_time, end_time: endTime,
        class_id: formData.class_id, teacher_id: formData.teacher_id, room_id: formData.room_id,
      }, editingSlot?.id));
    } else setConflicts([]);
  }, [formData, checkConflictsLocal, editingSlot]);

  const handleCreate = async () => {
    if (!formData.class_id || !formData.subject_id || !formData.teacher_id) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs requis", variant: "destructive" });
      return;
    }
    const isValidAssignment = teacherClasses.some(tc =>
      tc.teacher_id === formData.teacher_id && tc.class_id === formData.class_id && tc.subject_id === formData.subject_id
    );
    if (!isValidAssignment) {
      toast({ title: "Erreur", description: "Assignation enseignant/matière/classe invalide", variant: "destructive" });
      return;
    }
    if (conflicts.length > 0) {
      toast({ title: "Conflit détecté", description: "Résolvez les conflits d'abord", variant: "destructive" });
      return;
    }
    const endTime = calculateEndTime(formData.start_time, formData.duration);
    const realRoomId = formData.room_id === "__none__" ? null : formData.room_id;
    const selectedRoom = rooms.find(r => r.id === realRoomId);
    try {
      const slotData = {
        day_of_week: formData.day_of_week, start_time: formData.start_time, end_time: endTime,
        class_id: formData.class_id, subject_id: formData.subject_id, teacher_id: formData.teacher_id,
        room: selectedRoom?.name || null, room_id: realRoomId,
      };
      if (editingSlot) {
        const { error } = await supabase.from("timetable_slots").update(slotData).eq("id", editingSlot.id);
        if (error) throw error;
        toast({ title: "Succès", description: "Créneau modifié" });
      } else {
        const { error } = await supabase.from("timetable_slots").insert(slotData);
        if (error) throw error;
        toast({ title: "Succès", description: "Créneau ajouté" });
      }
      setIsDialogOpen(false);
      resetForm();
      fetchSlots();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({ day_of_week: 1, start_time: "08:00", duration: 60, class_id: selectedClass || "", subject_id: "", teacher_id: "", room_id: "__none__" });
    setEditingSlot(null);
    setConflicts([]);
  };

  const openEditDialog = (slot: TimetableSlot) => {
    const startTime = slot.start_time.slice(0, 5);
    const endTime = slot.end_time.slice(0, 5);
    const [sH, sM] = startTime.split(":").map(Number);
    const [eH, eM] = endTime.split(":").map(Number);
    setFormData({
      day_of_week: slot.day_of_week, start_time: startTime, duration: (eH * 60 + eM) - (sH * 60 + sM),
      class_id: slot.class_id, subject_id: slot.subject_id, teacher_id: slot.teacher_id,
      room_id: slot.room_id || "__none__",
    });
    setEditingSlot(slot);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce créneau ?")) return;
    const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: "Succès", description: "Créneau supprimé" }); fetchSlots(); }
  };

  // Auto-generate via edge function
  const handleAutoGenerate = async () => {
    if (!selectedClass) {
      toast({ title: "Erreur", description: "Sélectionnez une classe", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setGenProgress(10);
    setGenVariants([]);

    try {
      setGenProgress(30);
      const { data, error } = await supabase.functions.invoke("generate-timetable", {
        body: { class_id: selectedClass, variant_count: variantCount },
      });
      setGenProgress(80);

      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || "Échec de la génération");

      const variants = (data as any).variants || [];
      setGenVariants(variants);
      setGenProgress(100);
      setShowGenDialog(true);

      toast({
        title: "Génération terminée !",
        description: `${variants.length} variante(s) générée(s)`,
      });
      fetchGenerations();
    } catch (e: any) {
      toast({ title: "Erreur de génération", description: e.message, variant: "destructive" });
    } finally {
      setTimeout(() => { setGenerating(false); setGenProgress(0); }, 500);
    }
  };

  // Apply a generated variant
  const applyVariant = async (variant: any) => {
    if (!confirm(`Appliquer la variante ${variant.version} ? Les créneaux existants de cette classe seront remplacés.`)) return;
    try {
      await supabase.from("timetable_slots").delete().eq("class_id", selectedClass);
      const { error } = await supabase.from("timetable_slots").insert(variant.slots);
      if (error) throw error;

      await (supabase as any).from("timetable_generations").update({ is_active: false }).eq("class_id", selectedClass);
      await (supabase as any).from("timetable_generations").update({ is_active: true, applied_at: new Date().toISOString() }).eq("id", variant.id);

      toast({ title: "Succès", description: `Variante v${variant.version} appliquée (${variant.slots_count} créneaux)` });
      setShowGenDialog(false);
      fetchSlots();
      fetchGenerations();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  // Drag & drop handler with constraint validation
  const handleEventDrop = async (info: any) => {
    const slotId = info.event.id;
    const slot = slots.find(s => s.id === slotId);
    if (!slot) { info.revert(); return; }

    const newStart = info.event.start;
    const newEnd = info.event.end;
    if (!newStart || !newEnd) { info.revert(); return; }

    const dayOfWeek = newStart.getDay() === 0 ? 7 : newStart.getDay();
    const startTime = `${String(newStart.getHours()).padStart(2, "0")}:${String(newStart.getMinutes()).padStart(2, "0")}`;
    const endTime = `${String(newEnd.getHours()).padStart(2, "0")}:${String(newEnd.getMinutes()).padStart(2, "0")}`;

    // Validate via edge function
    const conflictsResult = await checkConflictsRemote({
      slot_id: slotId, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime,
      class_id: slot.class_id, teacher_id: slot.teacher_id, room_id: slot.room_id,
    });

    if (conflictsResult.length > 0) {
      info.revert();
      toast({
        title: "⚠️ Conflit détecté — déplacement annulé",
        description: conflictsResult.map((c: any) => c.message).join("\n"),
        variant: "destructive",
      });
      return;
    }

    const selectedRoom = rooms.find(r => r.id === slot.room_id);
    const { error } = await supabase.from("timetable_slots").update({
      day_of_week: dayOfWeek, start_time: startTime, end_time: endTime,
      room: selectedRoom?.name || slot.room,
    }).eq("id", slotId);

    if (error) {
      info.revert();
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Créneau déplacé" });
      fetchSlots();
    }
  };

  // Get filtered slots
  const filteredSlots = useMemo(() => {
    if (viewMode === "class") return selectedClass ? slots.filter(s => s.class_id === selectedClass) : slots;
    if (viewMode === "teacher") return selectedTeacherFilter ? slots.filter(s => s.teacher_id === selectedTeacherFilter) : slots;
    return slots;
  }, [slots, viewMode, selectedClass, selectedTeacherFilter]);

  // Convert to FullCalendar events
  const calendarEvents = useMemo(() => {
    const refMonday = new Date(2026, 2, 23);
    return filteredSlots.map(slot => {
      const dayOffset = slot.day_of_week - 1;
      const [sH, sM] = slot.start_time.slice(0, 5).split(":").map(Number);
      const [eH, eM] = slot.end_time.slice(0, 5).split(":").map(Number);
      const start = new Date(refMonday);
      start.setDate(start.getDate() + dayOffset);
      start.setHours(sH, sM, 0);
      const end = new Date(refMonday);
      end.setDate(end.getDate() + dayOffset);
      end.setHours(eH, eM, 0);

      const teacherName = slot.teacher?.profile
        ? `${slot.teacher.profile.first_name} ${slot.teacher.profile.last_name}`
        : "";
      const color = subjectColorMap[slot.subject_id] || SUBJECT_COLORS[0];

      return {
        id: slot.id,
        title: slot.subject?.name || "Cours",
        start,
        end,
        backgroundColor: color + "22",
        borderColor: color,
        textColor: color,
        extendedProps: {
          teacher: teacherName,
          room: slot.room,
          className: slot.class?.name,
          slotId: slot.id,
        },
      };
    });
  }, [filteredSlots, subjectColorMap]);

  // Export PDF
  const exportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape" });
    const className = classes.find(c => c.id === selectedClass)?.name || "Emploi du temps";
    doc.setFontSize(16);
    doc.text(className, 14, 20);
    doc.setFontSize(10);

    const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    let y = 35;
    dayNames.forEach((day, idx) => {
      const daySlots = filteredSlots.filter(s => s.day_of_week === idx + 1).sort((a, b) => a.start_time.localeCompare(b.start_time));
      if (daySlots.length === 0) return;
      doc.setFontSize(12);
      doc.setFont(undefined!, "bold");
      doc.text(day, 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont(undefined!, "normal");
      daySlots.forEach(slot => {
        const line = `${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)} | ${slot.subject?.name || ""} | ${slot.teacher?.profile ? slot.teacher.profile.first_name + " " + slot.teacher.profile.last_name : ""} | ${slot.room || ""}`;
        doc.text(line, 20, y);
        y += 5;
        if (y > 190) { doc.addPage(); y = 20; }
      });
      y += 4;
    });
    doc.save(`${className}.pdf`);
    toast({ title: "PDF exporté" });
  };

  // Export iCal
  const exportICal = () => {
    const className = classes.find(c => c.id === selectedClass)?.name || "Timetable";
    let ical = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//EduGest//Timetable//FR\n";
    const refMonday = new Date(2026, 2, 23);
    filteredSlots.forEach(slot => {
      const dayOffset = slot.day_of_week - 1;
      const [sH, sM] = slot.start_time.slice(0, 5).split(":").map(Number);
      const [eH, eM] = slot.end_time.slice(0, 5).split(":").map(Number);
      const start = new Date(refMonday);
      start.setDate(start.getDate() + dayOffset);
      start.setHours(sH, sM, 0);
      const end = new Date(refMonday);
      end.setDate(end.getDate() + dayOffset);
      end.setHours(eH, eM, 0);
      const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      ical += `BEGIN:VEVENT\nDTSTART:${fmt(start)}\nDTEND:${fmt(end)}\nSUMMARY:${slot.subject?.name || "Cours"}\nLOCATION:${slot.room || ""}\nRRULE:FREQ=WEEKLY\nEND:VEVENT\n`;
    });
    ical += "END:VCALENDAR";
    const blob = new Blob([ical], { type: "text/calendar" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${className}.ics`;
    link.click();
    toast({ title: "iCal exporté" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-7 h-7 text-primary" />
              Emploi du temps
            </h1>
            <p className="text-muted-foreground mt-1">
              {role === "admin" ? "Gérez et générez les emplois du temps" : role === "teacher" ? "Vos cours de la semaine" : "Vos horaires de cours"}
            </p>
          </div>
          {role === "admin" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportPDF}>
                <FileText className="w-4 h-4" />PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportICal}>
                <Download className="w-4 h-4" />iCal
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { fetchGenerations(); setShowHistoryDialog(true); }}>
                <History className="w-4 h-4" />Historique
              </Button>
            </div>
          )}
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap gap-3 items-center">
          {role === "admin" && (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="class" className="gap-1"><BookOpen className="w-4 h-4" />Classe</TabsTrigger>
                <TabsTrigger value="teacher" className="gap-1"><User className="w-4 h-4" />Enseignant</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {viewMode === "class" && (
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Classe" /></SelectTrigger>
              <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {viewMode === "teacher" && role === "admin" && (
            <Select value={selectedTeacherFilter} onValueChange={setSelectedTeacherFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Enseignant" /></SelectTrigger>
              <SelectContent>
                {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.profile?.first_name} {t.profile?.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {role === "admin" && (
            <div className="flex gap-2 ml-auto">
              <Select value={String(variantCount)} onValueChange={v => setVariantCount(Number(v))}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 variante</SelectItem>
                  <SelectItem value="2">2 variantes</SelectItem>
                  <SelectItem value="3">3 variantes</SelectItem>
                </SelectContent>
              </Select>
              <Button className="gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md hover:opacity-90" onClick={handleAutoGenerate} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Générer
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                <Plus className="w-4 h-4" />Créneau
              </Button>
            </div>
          )}
        </div>

        {/* Generation progress */}
        {generating && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="font-medium">Génération en cours...</p>
                  <Progress value={genProgress} className="mt-2 h-2" />
                </div>
                <span className="text-sm font-mono text-muted-foreground">{genProgress}%</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-2 sm:p-4">
              <FullCalendar
                ref={calendarRef}
                plugins={[timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                initialDate="2026-03-23"
                headerToolbar={false}
                locale="fr"
                firstDay={1}
                hiddenDays={[0]}
                slotMinTime="07:00:00"
                slotMaxTime="19:00:00"
                slotDuration="00:30:00"
                slotLabelInterval="01:00:00"
                slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                allDaySlot={false}
                height="auto"
                events={calendarEvents}
                editable={role === "admin"}
                droppable={role === "admin"}
                eventDrop={handleEventDrop}
                eventClick={(info) => {
                  if (role !== "admin") return;
                  const slot = slots.find(s => s.id === info.event.id);
                  if (slot) openEditDialog(slot);
                }}
                dayHeaderFormat={{ weekday: "short" }}
                eventContent={(arg) => {
                  const { teacher, room, className: cn, slotId } = arg.event.extendedProps;
                  return (
                    <div className="group p-1 h-full flex flex-col overflow-hidden text-xs leading-tight cursor-pointer relative">
                      <div className="font-bold truncate">{arg.event.title}</div>
                      {viewMode === "teacher" && cn && <div className="opacity-75 truncate">{cn}</div>}
                      {viewMode === "class" && teacher && <div className="opacity-75 truncate">{teacher}</div>}
                      {room && <div className="opacity-60 truncate mt-auto flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{room}</div>}
                      {role === "admin" && (
                        <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); const s = slots.find(s => s.id === slotId); if (s) openEditDialog(s); }}
                            className="p-0.5 rounded bg-background/80 hover:bg-background shadow-sm"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(slotId); }}
                            className="p-0.5 rounded bg-background/80 hover:bg-destructive/20 shadow-sm text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {filteredSlots.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun cours programmé</p>
                  {role === "admin" && <p className="text-sm mt-2">Utilisez "Générer" ou "Créneau" pour commencer</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {role === "admin" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10"><Calendar className="w-5 h-5 text-primary" /></div>
                <div><p className="text-2xl font-bold">{slots.length}</p><p className="text-sm text-muted-foreground">Créneaux total</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-accent/10"><BookOpen className="w-5 h-5 text-accent" /></div>
                <div><p className="text-2xl font-bold">{filteredSlots.length}</p><p className="text-sm text-muted-foreground">Créneaux affichés</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10"><MapPin className="w-5 h-5 text-primary" /></div>
                <div><p className="text-2xl font-bold">{[...new Set(slots.filter(s => s.room).map(s => s.room))].length}</p><p className="text-sm text-muted-foreground">Salles utilisées</p></div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Add/Edit slot dialog */}
        <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingSlot ? "Modifier le créneau" : "Nouveau créneau"}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              {conflicts.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-destructive">Conflits :</p>
                      {conflicts.map((c, i) => <p key={i} className="text-sm text-destructive/80">• {c.message}</p>)}
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Jour</Label>
                  <Select value={String(formData.day_of_week)} onValueChange={v => setFormData({...formData, day_of_week: Number(v)})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Salle</Label>
                  <Select value={formData.room_id} onValueChange={v => setFormData({...formData, room_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Aucune</SelectItem>
                      {rooms.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.capacity}p)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Heure de début</Label>
                  <Select value={formData.start_time} onValueChange={v => setFormData({...formData, start_time: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Durée</Label>
                  <Select value={String(formData.duration)} onValueChange={v => setFormData({...formData, duration: Number(v)})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DURATIONS.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Classe *</Label>
                <Select value={formData.class_id} onValueChange={v => setFormData({...formData, class_id: v, subject_id: "", teacher_id: ""})}>
                  <SelectTrigger><SelectValue placeholder="Classe" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Matière *</Label>
                <Select value={formData.subject_id} onValueChange={v => setFormData({...formData, subject_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Matière" /></SelectTrigger>
                  <SelectContent>
                    {filteredSubjectsForForm.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    {filteredSubjectsForForm.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Aucune</div>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Enseignant *</Label>
                <Select value={formData.teacher_id} onValueChange={v => setFormData({...formData, teacher_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Enseignant" /></SelectTrigger>
                  <SelectContent>
                    {filteredTeachersForForm.map(t => <SelectItem key={t.id} value={t.id}>{t.profile?.first_name} {t.profile?.last_name}</SelectItem>)}
                    {filteredTeachersForForm.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Aucun</div>}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border text-sm text-muted-foreground">
                <strong>Créneau :</strong> {DAYS.find(d => d.value === formData.day_of_week)?.label} de {formData.start_time} à {calculateEndTime(formData.start_time, formData.duration)}
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} className="flex-1" disabled={conflicts.length > 0}>
                  {editingSlot ? "Modifier" : "Ajouter"}
                </Button>
                {editingSlot && (
                  <Button variant="destructive" onClick={() => handleDelete(editingSlot.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Generation variants dialog */}
        <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Variantes générées
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {genVariants.map((v, i) => (
                <Card key={v.id} className={`border-2 transition-all hover:shadow-md ${v.conflicts_count === 0 ? "border-emerald-300" : "border-amber-300"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Badge variant={v.conflicts_count === 0 ? "default" : "outline"} className={v.conflicts_count === 0 ? "bg-emerald-500" : "text-amber-600 border-amber-300"}>
                          Version {v.version}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{v.slots_count} créneaux</span>
                      </div>
                      <Button size="sm" className="gap-1.5" onClick={() => applyVariant(v)}>
                        <CheckCircle className="w-4 h-4" />Appliquer
                      </Button>
                    </div>
                    {v.conflicts_count > 0 && (
                      <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-sm space-y-1">
                        <p className="font-medium">{v.conflicts_count} conflit(s) mineur(s) :</p>
                        {v.conflicts.map((c: string, j: number) => <p key={j} className="text-xs">• {c}</p>)}
                      </div>
                    )}
                    {v.conflicts_count === 0 && (
                      <p className="text-sm text-emerald-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" />Aucun conflit</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* History dialog */}
        <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />Historique des générations
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {generations.length === 0 && <p className="text-center text-muted-foreground py-8">Aucune génération</p>}
              {generations.map(g => (
                <div key={g.id} className={`p-3 rounded-lg border ${g.is_active ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={g.is_active ? "default" : "secondary"}>v{g.version}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(g.generated_at).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{g.slots_count} créneaux</span>
                      {g.is_active && <Badge className="bg-emerald-500 text-xs">Active</Badge>}
                      {!g.is_active && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyVariant({ id: g.id, version: g.version, slots: g.slots_data, slots_count: g.slots_count })}>
                          Restaurer
                        </Button>
                      )}
                    </div>
                  </div>
                  {g.conflicts_count > 0 && (
                    <p className="text-xs text-amber-600 mt-1">{g.conflicts_count} conflit(s)</p>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Timetable;
