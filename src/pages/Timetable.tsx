import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Clock, Plus, Trash2, Calendar, MapPin, User, BookOpen, Wand2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

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

interface Class { id: string; name: string; level: string; }
interface Subject { id: string; name: string; }
interface Teacher {
  id: string;
  profile: { first_name: string; last_name: string };
}
interface TeacherClass {
  teacher_id: string;
  class_id: string;
  subject_id: string;
}
interface Room { id: string; name: string; capacity: number; room_type: string; is_active: boolean; }
interface ConflictInfo { type: 'teacher' | 'class' | 'room'; message: string; }

const DAYS = [
  { value: 1, label: "Lundi", short: "Lun" },
  { value: 2, label: "Mardi", short: "Mar" },
  { value: 3, label: "Mercredi", short: "Mer" },
  { value: 4, label: "Jeudi", short: "Jeu" },
  { value: 5, label: "Vendredi", short: "Ven" },
  { value: 6, label: "Samedi", short: "Sam" },
];

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"
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
  { bg: 'hsl(221 83% 53% / 0.15)', border: 'hsl(221 83% 53%)', text: 'hsl(221 83% 40%)' },
  { bg: 'hsl(142 71% 45% / 0.15)', border: 'hsl(142 71% 45%)', text: 'hsl(142 71% 30%)' },
  { bg: 'hsl(271 81% 56% / 0.15)', border: 'hsl(271 81% 56%)', text: 'hsl(271 81% 40%)' },
  { bg: 'hsl(25 95% 53% / 0.15)', border: 'hsl(25 95% 53%)', text: 'hsl(25 95% 35%)' },
  { bg: 'hsl(330 81% 60% / 0.15)', border: 'hsl(330 81% 60%)', text: 'hsl(330 81% 40%)' },
  { bg: 'hsl(174 72% 40% / 0.15)', border: 'hsl(174 72% 40%)', text: 'hsl(174 72% 30%)' },
  { bg: 'hsl(45 93% 47% / 0.15)', border: 'hsl(45 93% 47%)', text: 'hsl(45 93% 30%)' },
  { bg: 'hsl(0 72% 51% / 0.15)', border: 'hsl(0 72% 51%)', text: 'hsl(0 72% 40%)' },
];

const Timetable = () => {
  const { role, teacherId, studentId } = useAuth();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [viewMode, setViewMode] = useState<'class' | 'teacher'>('class');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>("");
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);

  const [formData, setFormData] = useState({
    day_of_week: 1, start_time: "08:00", duration: 60,
    class_id: "", subject_id: "", teacher_id: "", room_id: "",
  });

  // Filter teachers by class assignment
  const filteredTeachersForForm = useMemo(() => {
    if (!formData.class_id) return teachers;
    const validTcPairs = teacherClasses.filter(tc => tc.class_id === formData.class_id);
    if (formData.subject_id) {
      const validForSubject = validTcPairs.filter(tc => tc.subject_id === formData.subject_id);
      return teachers.filter(t => validForSubject.some(tc => tc.teacher_id === t.id));
    }
    return teachers.filter(t => validTcPairs.some(tc => tc.teacher_id === t.id));
  }, [formData.class_id, formData.subject_id, teacherClasses, teachers]);

  // Filter subjects by class & teacher assignment
  const filteredSubjectsForForm = useMemo(() => {
    if (!formData.class_id) return subjects;
    const validTcPairs = teacherClasses.filter(tc => tc.class_id === formData.class_id);
    if (formData.teacher_id) {
      const validForTeacher = validTcPairs.filter(tc => tc.teacher_id === formData.teacher_id);
      return subjects.filter(s => validForTeacher.some(tc => tc.subject_id === s.id));
    }
    return subjects.filter(s => validTcPairs.some(tc => tc.subject_id === s.id));
  }, [formData.class_id, formData.teacher_id, teacherClasses, subjects]);

  const subjectColorMap = useMemo(() => {
    const map: Record<string, typeof SUBJECT_COLORS[0]> = {};
    [...new Set(slots.map(s => s.subject?.name).filter(Boolean))].forEach((subject, index) => {
      if (subject) map[subject] = SUBJECT_COLORS[index % SUBJECT_COLORS.length];
    });
    return map;
  }, [slots]);

  useEffect(() => { fetchData(); }, [role, teacherId, studentId]);

  const fetchData = async () => {
    setLoading(true);
    if (role === 'admin') {
      const [classesRes, subjectsRes, teachersRes, tcRes, roomsRes] = await Promise.all([
        supabase.from('classes').select('id, name, level').eq('is_active', true).order('name'),
        supabase.from('subjects').select('id, name').eq('is_active', true).order('name'),
        supabase.from('teachers').select('id, profile:profiles(first_name, last_name)').eq('is_active', true),
        supabase.from('teacher_classes').select('teacher_id, class_id, subject_id'),
        supabase.from('rooms').select('*').eq('is_active', true).order('name'),
      ]);
      setClasses(classesRes.data || []);
      setSubjects(subjectsRes.data || []);
      setTeachers(teachersRes.data as any || []);
      setTeacherClasses(tcRes.data || []);
      setRooms((roomsRes.data as any) || []);
      if (classesRes.data?.length) setSelectedClass(classesRes.data[0].id);
    }
    if (role === 'student' && studentId) {
      const { data: student } = await supabase.from('students').select('class_id').eq('id', studentId).single();
      if (student?.class_id) setSelectedClass(student.class_id);
    }
    if (role === 'teacher' && teacherId) {
      const { data: tcs } = await supabase.from('teacher_classes').select('class_id, class:classes(id, name, level)').eq('teacher_id', teacherId);
      const uniqueClasses = [...new Map((tcs || []).map(tc => [tc.class_id, tc.class])).values()].filter(Boolean) as Class[];
      setClasses(uniqueClasses);
      if (uniqueClasses.length) setSelectedClass(uniqueClasses[0].id);
    }
    await fetchSlots();
    setLoading(false);
  };

  const fetchSlots = async () => {
    const { data, error } = await supabase
      .from('timetable_slots')
      .select(`*, class:classes(name), subject:subjects(name), teacher:teachers(profile:profiles(first_name, last_name))`)
      .order('day_of_week').order('start_time');
    if (error) toast({ title: "Erreur", description: "Impossible de charger l'emploi du temps", variant: "destructive" });
    else setSlots(data || []);
  };

  const checkConflicts = useCallback((
    newSlot: { day_of_week: number; start_time: string; end_time: string; class_id: string; teacher_id: string; room_id: string },
    excludeSlotId?: string
  ): ConflictInfo[] => {
    const conflictList: ConflictInfo[] = [];
    const hasOverlap = (existingStart: string, existingEnd: string) =>
      newSlot.start_time < existingEnd && newSlot.end_time > existingStart;

    slots.forEach(slot => {
      if (excludeSlotId && slot.id === excludeSlotId) return;
      if (slot.day_of_week !== newSlot.day_of_week) return;
      if (!hasOverlap(slot.start_time.slice(0, 5), slot.end_time.slice(0, 5))) return;

      if (slot.teacher_id === newSlot.teacher_id) {
        const name = slot.teacher?.profile ? `${slot.teacher.profile.first_name} ${slot.teacher.profile.last_name}` : 'Ce professeur';
        conflictList.push({ type: 'teacher', message: `${name} enseigne déjà ${slot.subject?.name || ''} à ${slot.class?.name || ''} (${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)})` });
      }
      if (slot.class_id === newSlot.class_id) {
        conflictList.push({ type: 'class', message: `${slot.class?.name || 'Cette classe'} a déjà ${slot.subject?.name || 'un cours'} (${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)})` });
      }
      if (newSlot.room_id && slot.room_id && slot.room_id === newSlot.room_id) {
        const roomName = rooms.find(r => r.id === slot.room_id)?.name || slot.room || "Cette salle";
        conflictList.push({ type: 'room', message: `${roomName} est déjà utilisée (${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)})` });
      }
    });
    return conflictList;
  }, [slots, rooms]);

  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + durationMinutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (formData.class_id && formData.teacher_id && formData.start_time) {
      const endTime = calculateEndTime(formData.start_time, formData.duration);
      setConflicts(checkConflicts({
        day_of_week: formData.day_of_week, start_time: formData.start_time, end_time: endTime,
        class_id: formData.class_id, teacher_id: formData.teacher_id, room_id: formData.room_id,
      }, editingSlot?.id));
    } else setConflicts([]);
  }, [formData, checkConflicts, editingSlot]);

  const handleCreate = async () => {
    if (!formData.class_id || !formData.subject_id || !formData.teacher_id) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs requis", variant: "destructive" });
      return;
    }
    // Validate teacher-class-subject assignment
    const isValidAssignment = teacherClasses.some(tc =>
      tc.teacher_id === formData.teacher_id && tc.class_id === formData.class_id && tc.subject_id === formData.subject_id
    );
    if (!isValidAssignment) {
      toast({ title: "Erreur", description: "Cet enseignant n'est pas assigné à cette matière dans cette classe", variant: "destructive" });
      return;
    }
    if (conflicts.length > 0) {
      toast({ title: "Conflit détecté", description: "Veuillez résoudre les conflits", variant: "destructive" });
      return;
    }
    const endTime = calculateEndTime(formData.start_time, formData.duration);
    const selectedRoom = rooms.find(r => r.id === formData.room_id);
    try {
      const slotData = {
        day_of_week: formData.day_of_week, start_time: formData.start_time, end_time: endTime,
        class_id: formData.class_id, subject_id: formData.subject_id, teacher_id: formData.teacher_id,
        room: selectedRoom?.name || null, room_id: formData.room_id || null,
      };
      if (editingSlot) {
        const { error } = await supabase.from('timetable_slots').update(slotData).eq('id', editingSlot.id);
        if (error) throw error;
        toast({ title: "Succès", description: "Créneau modifié" });
      } else {
        const { error } = await supabase.from('timetable_slots').insert(slotData);
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
    setFormData({ day_of_week: 1, start_time: "08:00", duration: 60, class_id: "", subject_id: "", teacher_id: "", room_id: "" });
    setEditingSlot(null);
    setConflicts([]);
  };

  const openEditDialog = (slot: TimetableSlot) => {
    const startTime = slot.start_time.slice(0, 5);
    const endTime = slot.end_time.slice(0, 5);
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    setFormData({
      day_of_week: slot.day_of_week, start_time: startTime, duration: (eH * 60 + eM) - (sH * 60 + sM),
      class_id: slot.class_id, subject_id: slot.subject_id, teacher_id: slot.teacher_id,
      room_id: slot.room_id || "",
    });
    setEditingSlot(slot);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce créneau ?")) return;
    const { error } = await supabase.from('timetable_slots').delete().eq('id', id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: "Succès", description: "Créneau supprimé" }); fetchSlots(); }
  };

  // Auto-generate timetable
  const handleAutoGenerate = async () => {
    if (!selectedClass) {
      toast({ title: "Erreur", description: "Sélectionnez une classe", variant: "destructive" });
      return;
    }
    if (!confirm("Cela va générer automatiquement l'emploi du temps pour cette classe. Les créneaux existants seront conservés. Continuer ?")) return;

    setAutoGenerating(true);
    try {
      // Get teacher-class assignments for this class
      const { data: assignments } = await supabase
        .from('teacher_classes')
        .select('teacher_id, subject_id, subject:subjects(name, coefficient)')
        .eq('class_id', selectedClass);

      if (!assignments?.length) {
        toast({ title: "Erreur", description: "Aucun enseignant assigné à cette classe", variant: "destructive" });
        return;
      }

      // Build needed hours per subject (coefficient × 2 hours per week baseline)
      const subjectHours: { teacher_id: string; subject_id: string; hours: number; name: string }[] = [];
      assignments.forEach((a: any) => {
        const coeff = a.subject?.coefficient || 1;
        subjectHours.push({
          teacher_id: a.teacher_id,
          subject_id: a.subject_id,
          hours: Math.max(1, coeff), // coeff hours per week
          name: a.subject?.name || "",
        });
      });

      // Get existing slots for this class
      const existingSlots = slots.filter(s => s.class_id === selectedClass);

      // Available rooms
      const activeRooms = rooms.filter(r => r.is_active);

      const newSlots: any[] = [];
      const dayStartHour = 8;
      const dayEndHour = 17;
      const lunchStart = 12;
      const lunchEnd = 13;

      // Track occupied: teacher-day-time, class-day-time, room-day-time
      const occupied = new Map<string, boolean>();
      const markOccupied = (type: string, id: string, day: number, hour: number) => {
        occupied.set(`${type}-${id}-${day}-${hour}`, true);
      };
      const isOccupied = (type: string, id: string, day: number, hour: number) => {
        return occupied.get(`${type}-${id}-${day}-${hour}`) === true;
      };

      // Mark existing slots
      [...existingSlots, ...slots.filter(s => s.class_id !== selectedClass)].forEach(s => {
        const sH = parseInt(s.start_time.slice(0, 2));
        const eH = parseInt(s.end_time.slice(0, 2));
        for (let h = sH; h < eH; h++) {
          markOccupied('teacher', s.teacher_id, s.day_of_week, h);
          markOccupied('class', s.class_id, s.day_of_week, h);
          if (s.room_id) markOccupied('room', s.room_id, s.day_of_week, h);
        }
      });

      // Distribute subjects across days
      for (const sh of subjectHours) {
        let remainingHours = sh.hours;
        for (let day = 1; day <= 6 && remainingHours > 0; day++) {
          for (let hour = dayStartHour; hour < dayEndHour && remainingHours > 0; hour++) {
            if (hour >= lunchStart && hour < lunchEnd) continue;
            if (isOccupied('teacher', sh.teacher_id, day, hour)) continue;
            if (isOccupied('class', selectedClass, day, hour)) continue;

            // Find available room
            let roomId: string | null = null;
            let roomName: string | null = null;
            for (const room of activeRooms) {
              if (!isOccupied('room', room.id, day, hour)) {
                roomId = room.id;
                roomName = room.name;
                break;
              }
            }

            const startTime = `${String(hour).padStart(2, '0')}:00`;
            const endTime = `${String(hour + 1).padStart(2, '0')}:00`;

            newSlots.push({
              day_of_week: day,
              start_time: startTime,
              end_time: endTime,
              class_id: selectedClass,
              subject_id: sh.subject_id,
              teacher_id: sh.teacher_id,
              room: roomName,
              room_id: roomId,
            });

            markOccupied('teacher', sh.teacher_id, day, hour);
            markOccupied('class', selectedClass, day, hour);
            if (roomId) markOccupied('room', roomId, day, hour);

            remainingHours--;
          }
        }
      }

      if (newSlots.length === 0) {
        toast({ title: "Info", description: "Aucun créneau à ajouter (peut-être tout est déjà planifié)" });
        return;
      }

      const { error } = await supabase.from('timetable_slots').insert(newSlots);
      if (error) throw error;

      toast({ title: "Succès", description: `${newSlots.length} créneau(x) généré(s) automatiquement` });
      fetchSlots();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAutoGenerating(false);
    }
  };

  const getFilteredSlots = () => {
    if (viewMode === 'class') return selectedClass ? slots.filter(s => s.class_id === selectedClass) : slots;
    if (viewMode === 'teacher') return selectedTeacherFilter ? slots.filter(s => s.teacher_id === selectedTeacherFilter) : slots;
    return slots;
  };
  const filteredSlots = getFilteredSlots();

  const gridParams = useMemo(() => {
    if (!filteredSlots.length) return { startHour: 8, endHour: 17, totalRows: 9 };
    let minH = 24, maxH = 0;
    filteredSlots.forEach(s => {
      const sH = parseInt(s.start_time.slice(0, 2));
      const eH = parseInt(s.end_time.slice(0, 2));
      const eM = parseInt(s.end_time.slice(3, 5));
      if (sH < minH) minH = sH;
      const end = eM > 0 ? eH + 1 : eH;
      if (end > maxH) maxH = end;
    });
    return { startHour: Math.max(7, minH), endHour: Math.min(20, maxH), totalRows: Math.min(20, maxH) - Math.max(7, minH) };
  }, [filteredSlots]);

  const hourLabels = useMemo(() => {
    const labels = [];
    for (let h = gridParams.startHour; h < gridParams.endHour; h++) labels.push(`${String(h).padStart(2, '0')}:00`);
    return labels;
  }, [gridParams]);

  const getSlotGridStyle = (slot: TimetableSlot) => {
    const sH = parseInt(slot.start_time.slice(0, 2));
    const sM = parseInt(slot.start_time.slice(3, 5));
    const eH = parseInt(slot.end_time.slice(0, 2));
    const eM = parseInt(slot.end_time.slice(3, 5));
    return { top: (sH - gridParams.startHour) * 60 + sM, height: (eH - gridParams.startHour) * 60 + eM - ((sH - gridParams.startHour) * 60 + sM) };
  };

  const uniqueRooms = [...new Set(slots.filter(s => s.room).map(s => s.room))].filter(Boolean) as string[];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Emploi du temps</h1>
            <p className="text-muted-foreground mt-1">
              {role === 'admin' ? 'Gérez les emplois du temps des classes' : role === 'teacher' ? 'Vos cours de la semaine' : 'Vos horaires de cours'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {role === 'admin' && (
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <TabsList>
                  <TabsTrigger value="class" className="gap-1"><BookOpen className="w-4 h-4" />Par classe</TabsTrigger>
                  <TabsTrigger value="teacher" className="gap-1"><User className="w-4 h-4" />Par enseignant</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {viewMode === 'class' && (
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Sélectionner une classe" /></SelectTrigger>
              <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {viewMode === 'teacher' && role === 'admin' && (
            <Select value={selectedTeacherFilter} onValueChange={setSelectedTeacherFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Sélectionner un enseignant" /></SelectTrigger>
              <SelectContent>
                {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.profile?.first_name} {t.profile?.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {role === 'admin' && (
            <>
              <Button variant="outline" className="gap-2 ml-auto" onClick={handleAutoGenerate} disabled={autoGenerating}>
                {autoGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Génération auto
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Plus className="w-4 h-4" />Ajouter un créneau</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{editingSlot ? 'Modifier le créneau' : 'Nouveau créneau'}</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    {conflicts.length > 0 && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-medium text-destructive">Conflits détectés :</p>
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
                            <SelectItem value="">Aucune</SelectItem>
                            {rooms.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.capacity} places)</SelectItem>)}
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
                        <SelectTrigger><SelectValue placeholder="Sélectionner une classe" /></SelectTrigger>
                        <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.level})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Matière * {formData.class_id && <span className="text-xs text-muted-foreground">(filtrées par assignation)</span>}</Label>
                      <Select value={formData.subject_id} onValueChange={v => setFormData({...formData, subject_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner une matière" /></SelectTrigger>
                        <SelectContent>
                          {filteredSubjectsForForm.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          {filteredSubjectsForForm.length === 0 && (
                            <div className="px-2 py-1 text-xs text-muted-foreground">Aucune matière assignée</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Enseignant * {formData.class_id && <span className="text-xs text-muted-foreground">(filtrés par assignation)</span>}</Label>
                      <Select value={formData.teacher_id} onValueChange={v => setFormData({...formData, teacher_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner un enseignant" /></SelectTrigger>
                        <SelectContent>
                          {filteredTeachersForForm.map(t => <SelectItem key={t.id} value={t.id}>{t.profile?.first_name} {t.profile?.last_name}</SelectItem>)}
                          {filteredTeachersForForm.length === 0 && (
                            <div className="px-2 py-1 text-xs text-muted-foreground">Aucun enseignant assigné</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-sm text-muted-foreground">
                        <strong>Créneau :</strong> {DAYS.find(d => d.value === formData.day_of_week)?.label} de {formData.start_time} à {calculateEndTime(formData.start_time, formData.duration)}
                      </p>
                    </div>
                    <Button onClick={handleCreate} className="w-full" disabled={conflicts.length > 0}>
                      {editingSlot ? 'Modifier' : 'Ajouter'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]" style={{ display: 'grid', gridTemplateColumns: '80px repeat(6, 1fr)' }}>
                  <div className="bg-muted/50 border-b border-r p-3 font-semibold text-muted-foreground text-sm flex items-center gap-2 sticky left-0 z-20">
                    <Clock className="w-4 h-4" />
                  </div>
                  {DAYS.map(day => (
                    <div key={day.value} className="bg-muted/50 border-b p-3 font-semibold text-foreground text-center text-sm">
                      <span className="hidden sm:inline">{day.label}</span>
                      <span className="sm:hidden">{day.short}</span>
                    </div>
                  ))}
                  <div style={{ display: 'contents' }}>
                    <div className="border-r bg-muted/30 sticky left-0 z-10" style={{ display: 'grid', gridTemplateRows: `repeat(${gridParams.totalRows}, 60px)` }}>
                      {hourLabels.map(time => (
                        <div key={time} className="px-2 py-1 text-xs text-muted-foreground font-medium flex items-start justify-end border-b">{time}</div>
                      ))}
                    </div>
                    {DAYS.map(day => {
                      const daySlots = filteredSlots.filter(s => s.day_of_week === day.value);
                      return (
                        <div key={day.value} className="relative border-r last:border-r-0" style={{ height: `${gridParams.totalRows * 60}px` }}>
                          {hourLabels.map((_, idx) => (
                            <div key={idx} className="absolute w-full border-b border-dashed border-muted-foreground/20" style={{ top: `${(idx + 1) * 60}px` }} />
                          ))}
                          {daySlots.map(slot => {
                            const { top, height } = getSlotGridStyle(slot);
                            const colors = subjectColorMap[slot.subject?.name || ''] || SUBJECT_COLORS[0];
                            return (
                              <div key={slot.id} className="absolute left-1 right-1 rounded-md cursor-pointer transition-all hover:shadow-lg hover:z-10 group overflow-hidden"
                                style={{ top: `${top}px`, height: `${Math.max(height - 2, 20)}px`, backgroundColor: colors.bg, borderLeft: `3px solid ${colors.border}` }}
                                onClick={() => role === 'admin' && openEditDialog(slot)}>
                                <div className="p-1.5 h-full flex flex-col" style={{ color: colors.text }}>
                                  <div className="font-semibold text-xs truncate">{slot.subject?.name}</div>
                                  {height >= 40 && (
                                    <div className="text-[10px] opacity-80 truncate">
                                      {viewMode === 'teacher' ? slot.class?.name : slot.teacher?.profile ? `${slot.teacher.profile.first_name} ${slot.teacher.profile.last_name}` : ''}
                                    </div>
                                  )}
                                  {height >= 55 && (
                                    <div className="text-[10px] opacity-70 flex items-center gap-1 mt-auto">
                                      <Clock className="w-2.5 h-2.5" />{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                    </div>
                                  )}
                                  {height >= 70 && slot.room && (
                                    <div className="text-[10px] opacity-70 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{slot.room}</div>
                                  )}
                                  {role === 'admin' && (
                                    <Button variant="ghost" size="icon"
                                      className="absolute top-0.5 right-0.5 h-5 w-5 opacity-0 group-hover:opacity-100 bg-background/80 shadow-sm"
                                      onClick={e => { e.stopPropagation(); handleDelete(slot.id); }}>
                                      <Trash2 className="w-3 h-3 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {filteredSlots.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun cours programmé</p>
                  {role === 'admin' && <p className="text-sm mt-2">Cliquez sur "Ajouter un créneau" ou "Génération auto"</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10"><Calendar className="w-5 h-5 text-primary" /></div>
                <div><p className="text-2xl font-bold">{slots.length}</p><p className="text-sm text-muted-foreground">Créneaux total</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-emerald-500/10"><BookOpen className="w-5 h-5 text-emerald-500" /></div>
                <div><p className="text-2xl font-bold">{filteredSlots.length}</p><p className="text-sm text-muted-foreground">Créneaux affichés</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-amber-500/10"><MapPin className="w-5 h-5 text-amber-500" /></div>
                <div><p className="text-2xl font-bold">{uniqueRooms.length}</p><p className="text-sm text-muted-foreground">Salles utilisées</p></div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Timetable;
