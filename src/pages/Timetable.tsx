import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Clock, Plus, Trash2, Calendar, MapPin, GripVertical, User, BookOpen } from "lucide-react";
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
  class?: { name: string };
  subject?: { name: string };
  teacher?: { profile?: { first_name: string; last_name: string } };
}

interface Class {
  id: string;
  name: string;
  level: string;
}

interface Subject {
  id: string;
  name: string;
}

interface Teacher {
  id: string;
  profile: { first_name: string; last_name: string };
}

interface ConflictInfo {
  type: 'teacher' | 'class' | 'room';
  message: string;
}

const DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
];

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", 
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", 
  "16:00", "16:30", "17:00", "17:30", "18:00"
];

const DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 heure" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2 heures" },
];

const Timetable = () => {
  const { role, teacherId, studentId } = useAuth();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [viewMode, setViewMode] = useState<'class' | 'teacher' | 'room'>('class');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>("");
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  
  const [formData, setFormData] = useState({
    day_of_week: 1,
    start_time: "08:00",
    duration: 60,
    class_id: "",
    subject_id: "",
    teacher_id: "",
    room: "",
  });

  useEffect(() => {
    fetchData();
  }, [role, teacherId, studentId]);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch classes, subjects, teachers for admin
    if (role === 'admin') {
      const [classesRes, subjectsRes, teachersRes] = await Promise.all([
        supabase.from('classes').select('id, name, level').eq('is_active', true).order('name'),
        supabase.from('subjects').select('id, name').eq('is_active', true).order('name'),
        supabase.from('teachers').select('id, profile:profiles(first_name, last_name)').eq('is_active', true)
      ]);
      
      setClasses(classesRes.data || []);
      setSubjects(subjectsRes.data || []);
      setTeachers(teachersRes.data as any || []);
      if (classesRes.data && classesRes.data.length > 0) {
        setSelectedClass(classesRes.data[0].id);
      }
    }
    
    // Fetch student's class
    if (role === 'student' && studentId) {
      const { data: student } = await supabase
        .from('students')
        .select('class_id')
        .eq('id', studentId)
        .single();
      
      if (student?.class_id) {
        setSelectedClass(student.class_id);
      }
    }
    
    // Fetch teacher's classes
    if (role === 'teacher' && teacherId) {
      const { data: teacherClasses } = await supabase
        .from('teacher_classes')
        .select('class_id, class:classes(id, name, level)')
        .eq('teacher_id', teacherId);
      
      const uniqueClasses = [...new Map((teacherClasses || []).map(tc => [tc.class_id, tc.class])).values()].filter(Boolean) as Class[];
      setClasses(uniqueClasses);
      if (uniqueClasses.length > 0) {
        setSelectedClass(uniqueClasses[0].id);
      }
    }

    await fetchSlots();
    setLoading(false);
  };

  const fetchSlots = async () => {
    const { data, error } = await supabase
      .from('timetable_slots')
      .select(`
        *,
        class:classes(name),
        subject:subjects(name),
        teacher:teachers(profile:profiles(first_name, last_name))
      `)
      .order('day_of_week')
      .order('start_time');
    
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger l'emploi du temps", variant: "destructive" });
    } else {
      setSlots(data || []);
    }
  };

  // Conflict detection function
  const checkConflicts = useCallback((
    newSlot: { day_of_week: number; start_time: string; end_time: string; class_id: string; teacher_id: string; room: string },
    excludeSlotId?: string
  ): ConflictInfo[] => {
    const conflictList: ConflictInfo[] = [];
    
    const newStart = newSlot.start_time;
    const newEnd = newSlot.end_time;
    
    // Helper to check time overlap
    const hasOverlap = (existingStart: string, existingEnd: string) => {
      return newStart < existingEnd && newEnd > existingStart;
    };

    slots.forEach(slot => {
      if (excludeSlotId && slot.id === excludeSlotId) return;
      if (slot.day_of_week !== newSlot.day_of_week) return;
      
      const slotEnd = slot.end_time.slice(0, 5);
      const slotStart = slot.start_time.slice(0, 5);
      
      if (!hasOverlap(slotStart, slotEnd)) return;
      
      // Check teacher conflict
      if (slot.teacher_id === newSlot.teacher_id) {
        const teacherName = slot.teacher?.profile ? 
          `${slot.teacher.profile.first_name} ${slot.teacher.profile.last_name}` : 'Ce professeur';
        conflictList.push({
          type: 'teacher',
          message: `${teacherName} enseigne déjà ${slot.subject?.name || ''} à ${slot.class?.name || ''} de ${slotStart} à ${slotEnd}`
        });
      }
      
      // Check class conflict
      if (slot.class_id === newSlot.class_id) {
        conflictList.push({
          type: 'class',
          message: `${slot.class?.name || 'Cette classe'} a déjà ${slot.subject?.name || 'un cours'} de ${slotStart} à ${slotEnd}`
        });
      }
      
      // Check room conflict
      if (newSlot.room && slot.room && slot.room === newSlot.room) {
        conflictList.push({
          type: 'room',
          message: `La salle ${slot.room} est déjà utilisée de ${slotStart} à ${slotEnd}`
        });
      }
    });
    
    return conflictList;
  }, [slots]);

  // Calculate end time from start time and duration
  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  };

  // Update conflicts when form changes
  useEffect(() => {
    if (formData.class_id && formData.teacher_id && formData.start_time) {
      const endTime = calculateEndTime(formData.start_time, formData.duration);
      const conflictList = checkConflicts({
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: endTime,
        class_id: formData.class_id,
        teacher_id: formData.teacher_id,
        room: formData.room,
      }, editingSlot?.id);
      setConflicts(conflictList);
    } else {
      setConflicts([]);
    }
  }, [formData, checkConflicts, editingSlot]);

  const handleCreate = async () => {
    if (!formData.class_id || !formData.subject_id || !formData.teacher_id) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs requis", variant: "destructive" });
      return;
    }

    if (conflicts.length > 0) {
      toast({ title: "Conflit détecté", description: "Veuillez résoudre les conflits avant de continuer", variant: "destructive" });
      return;
    }

    const endTime = calculateEndTime(formData.start_time, formData.duration);

    try {
      if (editingSlot) {
        // Update existing slot
        const { error } = await supabase
          .from('timetable_slots')
          .update({
            day_of_week: formData.day_of_week,
            start_time: formData.start_time,
            end_time: endTime,
            class_id: formData.class_id,
            subject_id: formData.subject_id,
            teacher_id: formData.teacher_id,
            room: formData.room || null,
          })
          .eq('id', editingSlot.id);

        if (error) throw error;
        toast({ title: "Succès", description: "Créneau modifié" });
      } else {
        // Create new slot
        const { error } = await supabase.from('timetable_slots').insert({
          day_of_week: formData.day_of_week,
          start_time: formData.start_time,
          end_time: endTime,
          class_id: formData.class_id,
          subject_id: formData.subject_id,
          teacher_id: formData.teacher_id,
          room: formData.room || null,
        });

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
    setFormData({
      day_of_week: 1,
      start_time: "08:00",
      duration: 60,
      class_id: "",
      subject_id: "",
      teacher_id: "",
      room: "",
    });
    setEditingSlot(null);
    setConflicts([]);
  };

  const openEditDialog = (slot: TimetableSlot) => {
    const startTime = slot.start_time.slice(0, 5);
    const endTime = slot.end_time.slice(0, 5);
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    const duration = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    
    setFormData({
      day_of_week: slot.day_of_week,
      start_time: startTime,
      duration: duration,
      class_id: slot.class_id,
      subject_id: slot.subject_id,
      teacher_id: slot.teacher_id,
      room: slot.room || "",
    });
    setEditingSlot(slot);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce créneau ?")) return;

    try {
      const { error } = await supabase.from('timetable_slots').delete().eq('id', id);
      if (error) throw error;

      toast({ title: "Succès", description: "Créneau supprimé" });
      fetchSlots();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  // Filter slots based on view mode
  const getFilteredSlots = () => {
    switch (viewMode) {
      case 'class':
        return selectedClass ? slots.filter(s => s.class_id === selectedClass) : slots;
      case 'teacher':
        return selectedTeacherFilter ? slots.filter(s => s.teacher_id === selectedTeacherFilter) : slots;
      case 'room':
        return slots;
      default:
        return slots;
    }
  };

  const filteredSlots = getFilteredSlots();

  const getSlotsByDayAndTime = (day: number, time: string) => {
    return filteredSlots.filter(s => 
      s.day_of_week === day && 
      s.start_time.slice(0, 5) === time
    );
  };

  const getColorForSubject = (subjectName: string) => {
    const colors = [
      'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300',
      'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300',
      'bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300',
      'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300',
      'bg-pink-100 border-pink-300 text-pink-800 dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-300',
      'bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-900/30 dark:border-teal-700 dark:text-teal-300',
    ];
    const hash = subjectName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Get unique rooms for room view
  const uniqueRooms = [...new Set(slots.filter(s => s.room).map(s => s.room))].filter(Boolean) as string[];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Emploi du temps</h1>
            <p className="text-muted-foreground mt-1">
              {role === 'admin' ? 'Gérez les emplois du temps des classes' : 
               role === 'teacher' ? 'Vos cours de la semaine' : 
               'Vos horaires de cours'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {role === 'admin' && (
              <>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                  <TabsList>
                    <TabsTrigger value="class" className="gap-1">
                      <BookOpen className="w-4 h-4" />
                      Par classe
                    </TabsTrigger>
                    <TabsTrigger value="teacher" className="gap-1">
                      <User className="w-4 h-4" />
                      Par enseignant
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {viewMode === 'class' && (
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sélectionner une classe" />
              </SelectTrigger>
              <SelectContent>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {viewMode === 'teacher' && role === 'admin' && (
            <Select value={selectedTeacherFilter} onValueChange={setSelectedTeacherFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sélectionner un enseignant" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.profile?.first_name} {t.profile?.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {role === 'admin' && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="gap-2 ml-auto">
                  <Plus className="w-4 h-4" />
                  Ajouter un créneau
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingSlot ? 'Modifier le créneau' : 'Nouveau créneau'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  {/* Conflicts Alert */}
                  {conflicts.length > 0 && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-medium text-destructive">Conflits détectés :</p>
                          {conflicts.map((conflict, i) => (
                            <p key={i} className="text-sm text-destructive/80">• {conflict.message}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Jour</Label>
                      <Select 
                        value={String(formData.day_of_week)} 
                        onValueChange={v => setFormData({ ...formData, day_of_week: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS.map(d => (
                            <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Salle (optionnel)</Label>
                      <Input 
                        value={formData.room}
                        onChange={e => setFormData({ ...formData, room: e.target.value })}
                        placeholder="Ex: Salle 101"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Heure de début</Label>
                      <Select 
                        value={formData.start_time} 
                        onValueChange={v => setFormData({ ...formData, start_time: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Durée</Label>
                      <Select 
                        value={String(formData.duration)} 
                        onValueChange={v => setFormData({ ...formData, duration: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATIONS.map(d => (
                            <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Classe *</Label>
                    <Select 
                      value={formData.class_id} 
                      onValueChange={v => setFormData({ ...formData, class_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une classe" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name} ({c.level})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Matière *</Label>
                    <Select 
                      value={formData.subject_id} 
                      onValueChange={v => setFormData({ ...formData, subject_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une matière" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Enseignant *</Label>
                    <Select 
                      value={formData.teacher_id} 
                      onValueChange={v => setFormData({ ...formData, teacher_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un enseignant" />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.profile?.first_name} {t.profile?.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Preview */}
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-sm text-muted-foreground">
                      <strong>Créneau :</strong> {DAYS.find(d => d.value === formData.day_of_week)?.label} de {formData.start_time} à {calculateEndTime(formData.start_time, formData.duration)}
                    </p>
                  </div>
                  
                  <Button 
                    onClick={handleCreate} 
                    className="w-full"
                    disabled={conflicts.length > 0}
                  >
                    {editingSlot ? 'Modifier' : 'Ajouter'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Timetable Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <div className="min-w-[900px]">
                {/* Header Row */}
                <div className="grid grid-cols-7 border-b bg-muted/50">
                  <div className="p-3 font-semibold text-muted-foreground text-sm border-r flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Horaire
                  </div>
                  {DAYS.map(day => (
                    <div key={day.value} className="p-3 font-semibold text-foreground text-center text-sm">
                      {day.label}
                    </div>
                  ))}
                </div>

                {/* Time Slots */}
                {TIME_SLOTS.filter((_, i) => i % 2 === 0 && i < TIME_SLOTS.length - 1).map((time, idx) => {
                  const nextTime = TIME_SLOTS[TIME_SLOTS.indexOf(time) + 2] || TIME_SLOTS[TIME_SLOTS.length - 1];
                  return (
                    <div key={time} className="grid grid-cols-7 border-b last:border-b-0">
                      <div className="p-2 text-xs text-muted-foreground border-r bg-muted/30 font-medium flex items-center">
                        {time} - {nextTime}
                      </div>
                      {DAYS.map(day => {
                        const daySlots = getSlotsByDayAndTime(day.value, time);
                        // Also check for slots starting at half hour
                        const halfHourTime = TIME_SLOTS[TIME_SLOTS.indexOf(time) + 1];
                        const halfHourSlots = halfHourTime ? getSlotsByDayAndTime(day.value, halfHourTime) : [];
                        const allSlots = [...daySlots, ...halfHourSlots];
                        
                        return (
                          <div key={day.value} className="p-1 min-h-[70px] relative group border-r last:border-r-0">
                            {allSlots.map(slot => (
                              <div 
                                key={slot.id}
                                className={`p-2 rounded-lg border text-xs mb-1 cursor-pointer hover:shadow-md transition-shadow ${getColorForSubject(slot.subject?.name || '')} relative group/slot`}
                                onClick={() => role === 'admin' && openEditDialog(slot)}
                              >
                                <div className="font-semibold truncate">{slot.subject?.name}</div>
                                <div className="text-[10px] opacity-80 truncate mt-0.5">
                                  {viewMode === 'teacher' ? slot.class?.name : 
                                   slot.teacher?.profile ? `${slot.teacher.profile.first_name} ${slot.teacher.profile.last_name}` : ''}
                                </div>
                                <div className="text-[10px] opacity-70 flex items-center gap-1 mt-0.5">
                                  <Clock className="w-2.5 h-2.5" />
                                  {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                </div>
                                {slot.room && (
                                  <div className="text-[10px] opacity-70 flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5" />
                                    {slot.room}
                                  </div>
                                )}
                                {role === 'admin' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-1 -right-1 h-5 w-5 opacity-0 group-hover/slot:opacity-100 bg-background shadow-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(slot.id);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{slots.length}</p>
                  <p className="text-sm text-muted-foreground">Créneaux total</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-500/10">
                  <BookOpen className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{filteredSlots.length}</p>
                  <p className="text-sm text-muted-foreground">Créneaux affichés</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-orange-500/10">
                  <MapPin className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{uniqueRooms.length}</p>
                  <p className="text-sm text-muted-foreground">Salles utilisées</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Timetable;
