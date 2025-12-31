import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock, Plus, Trash2, Calendar, BookOpen, MapPin } from "lucide-react";
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
}

interface Subject {
  id: string;
  name: string;
}

interface Teacher {
  id: string;
  profile: { first_name: string; last_name: string };
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
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00"
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
  const [studentClassId, setStudentClassId] = useState<string>("");
  
  const [formData, setFormData] = useState({
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
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
        supabase.from('classes').select('id, name').eq('is_active', true),
        supabase.from('subjects').select('id, name').eq('is_active', true),
        supabase.from('teachers').select('id, profile:profiles(first_name, last_name)').eq('is_active', true)
      ]);
      
      setClasses(classesRes.data || []);
      setSubjects(subjectsRes.data || []);
      setTeachers(teachersRes.data as any || []);
    }
    
    // Fetch student's class
    if (role === 'student' && studentId) {
      const { data: student } = await supabase
        .from('students')
        .select('class_id')
        .eq('id', studentId)
        .single();
      
      if (student?.class_id) {
        setStudentClassId(student.class_id);
        setSelectedClass(student.class_id);
      }
    }
    
    // Fetch teacher's classes
    if (role === 'teacher' && teacherId) {
      const { data: teacherClasses } = await supabase
        .from('teacher_classes')
        .select('class_id, class:classes(id, name)')
        .eq('teacher_id', teacherId);
      
      const uniqueClasses = [...new Map((teacherClasses || []).map(tc => [tc.class_id, tc.class])).values()] as Class[];
      setClasses(uniqueClasses);
      if (uniqueClasses.length > 0) {
        setSelectedClass(uniqueClasses[0].id);
      }
    }

    await fetchSlots();
    setLoading(false);
  };

  const fetchSlots = async () => {
    let query = supabase
      .from('timetable_slots')
      .select(`
        *,
        class:classes(name),
        subject:subjects(name),
        teacher:teachers(profile:profiles(first_name, last_name))
      `)
      .order('day_of_week')
      .order('start_time');

    if (role === 'teacher' && teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query;
    
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger l'emploi du temps", variant: "destructive" });
    } else {
      setSlots(data || []);
    }
  };

  const handleCreate = async () => {
    if (!formData.class_id || !formData.subject_id || !formData.teacher_id) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs requis", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from('timetable_slots').insert({
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        class_id: formData.class_id,
        subject_id: formData.subject_id,
        teacher_id: formData.teacher_id,
        room: formData.room || null,
      });

      if (error) throw error;

      toast({ title: "Succès", description: "Créneau ajouté" });
      setIsDialogOpen(false);
      setFormData({
        day_of_week: 1,
        start_time: "08:00",
        end_time: "09:00",
        class_id: "",
        subject_id: "",
        teacher_id: "",
        room: "",
      });
      fetchSlots();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
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

  const filteredSlots = selectedClass 
    ? slots.filter(s => s.class_id === selectedClass)
    : slots;

  const getSlotsByDayAndTime = (day: number, time: string) => {
    return filteredSlots.filter(s => 
      s.day_of_week === day && 
      s.start_time.slice(0, 5) === time
    );
  };

  const getColorForSubject = (subjectName: string) => {
    const colors = [
      'bg-primary/20 border-primary/40 text-primary',
      'bg-accent/20 border-accent/40 text-accent',
      'bg-success/20 border-success/40 text-success',
      'bg-warning/20 border-warning/40 text-warning',
      'bg-destructive/20 border-destructive/40 text-destructive',
    ];
    const hash = subjectName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Emploi du temps</h1>
            <p className="text-muted-foreground mt-1">
              {role === 'admin' ? 'Configurez les horaires' : 
               role === 'teacher' ? 'Vos cours de la semaine' : 
               'Vos horaires de cours'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {(role === 'admin' || (role === 'teacher' && classes.length > 0)) && (
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Sélectionner une classe" />
                </SelectTrigger>
                <SelectContent>
                  {role === 'admin' && <SelectItem value="all">Toutes les classes</SelectItem>}
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {role === 'admin' && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Ajouter un créneau
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Nouveau créneau</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
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
                        <Label>Salle</Label>
                        <Input 
                          value={formData.room}
                          onChange={e => setFormData({ ...formData, room: e.target.value })}
                          placeholder="Ex: Salle 101"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Heure début</Label>
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
                        <Label>Heure fin</Label>
                        <Select 
                          value={formData.end_time} 
                          onValueChange={v => setFormData({ ...formData, end_time: v })}
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
                    </div>
                    <div>
                      <Label>Classe</Label>
                      <Select 
                        value={formData.class_id} 
                        onValueChange={v => setFormData({ ...formData, class_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Matière</Label>
                      <Select 
                        value={formData.subject_id} 
                        onValueChange={v => setFormData({ ...formData, subject_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Enseignant</Label>
                      <Select 
                        value={formData.teacher_id} 
                        onValueChange={v => setFormData({ ...formData, teacher_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner" />
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
                    <Button onClick={handleCreate} className="w-full">Ajouter</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Timetable Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header Row */}
                <div className="grid grid-cols-7 border-b bg-muted/50">
                  <div className="p-3 font-semibold text-muted-foreground text-sm border-r">
                    <Clock className="w-4 h-4 inline mr-2" />
                    Horaire
                  </div>
                  {DAYS.map(day => (
                    <div key={day.value} className="p-3 font-semibold text-foreground text-center text-sm">
                      {day.label}
                    </div>
                  ))}
                </div>

                {/* Time Slots */}
                {TIME_SLOTS.slice(0, -1).map((time, idx) => (
                  <div key={time} className="grid grid-cols-7 border-b last:border-b-0">
                    <div className="p-3 text-sm text-muted-foreground border-r bg-muted/30 font-medium">
                      {time} - {TIME_SLOTS[idx + 1]}
                    </div>
                    {DAYS.map(day => {
                      const daySlots = getSlotsByDayAndTime(day.value, time);
                      return (
                        <div key={day.value} className="p-1 min-h-[80px] relative group">
                          {daySlots.map(slot => (
                            <div 
                              key={slot.id}
                              className={`p-2 rounded-lg border text-xs ${getColorForSubject(slot.subject?.name || '')} relative group/slot`}
                            >
                              <div className="font-semibold truncate">{slot.subject?.name}</div>
                              {role !== 'student' && (
                                <div className="text-[10px] opacity-80 truncate">
                                  {slot.class?.name}
                                </div>
                              )}
                              {role === 'student' && slot.teacher?.profile && (
                                <div className="text-[10px] opacity-80 truncate">
                                  {slot.teacher.profile.first_name} {slot.teacher.profile.last_name}
                                </div>
                              )}
                              {slot.room && (
                                <div className="text-[10px] opacity-70 flex items-center gap-0.5 mt-0.5">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {slot.room}
                                </div>
                              )}
                              {role === 'admin' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute -top-1 -right-1 h-5 w-5 opacity-0 group-hover/slot:opacity-100 bg-background shadow-sm"
                                  onClick={() => handleDelete(slot.id)}
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
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Légende</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[...new Set(filteredSlots.map(s => s.subject?.name))].filter(Boolean).map(subjectName => (
                <Badge key={subjectName} className={`${getColorForSubject(subjectName!)} border`}>
                  <BookOpen className="w-3 h-3 mr-1" />
                  {subjectName}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Timetable;