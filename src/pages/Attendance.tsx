import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ClipboardCheck, Users, Calendar, Save, Filter, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

interface StudentRow {
  id: string;
  profile: { first_name: string; last_name: string };
  matricule: string;
}

interface AttendanceRecord {
  student_id: string;
  status: "present" | "absent" | "late" | "excused";
  reason: string;
}

const STATUS_CONFIG = {
  present: { label: "Présent", icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
  absent: { label: "Absent", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  late: { label: "En retard", icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
  excused: { label: "Excusé", icon: AlertTriangle, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
};

const Attendance = () => {
  const { role, teacherId } = useAuth();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingLoaded, setExistingLoaded] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<{ studentId: string; status: string } | null>(null);
  const [reasonText, setReasonText] = useState("");

  // Stats
  const stats = Object.values(records);
  const presentCount = stats.filter(r => r.status === "present").length;
  const absentCount = stats.filter(r => r.status === "absent").length;
  const lateCount = stats.filter(r => r.status === "late").length;

  useEffect(() => {
    fetchClasses();
  }, [role, teacherId]);

  const fetchClasses = async () => {
    setLoading(true);
    if (role === "admin") {
      const { data } = await supabase.from("classes").select("id, name").eq("is_active", true).order("name");
      setClasses(data || []);
    } else if (role === "teacher" && teacherId) {
      const { data } = await supabase.from("teacher_classes").select("class_id, class:classes(id, name), subject_id").eq("teacher_id", teacherId);
      const uniqueClasses = [...new Map((data || []).map((d: any) => [d.class_id, d.class])).values()] as any[];
      setClasses(uniqueClasses.filter(Boolean));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!selectedClass) return;
    const fetchSubjects = async () => {
      if (role === "teacher" && teacherId) {
        const { data } = await supabase.from("teacher_classes").select("subject_id, subject:subjects(id, name)").eq("teacher_id", teacherId).eq("class_id", selectedClass);
        setSubjects((data || []).map((d: any) => d.subject).filter(Boolean));
      } else {
        const { data } = await supabase.from("teacher_classes").select("subject_id, subject:subjects(id, name)").eq("class_id", selectedClass);
        const unique = [...new Map((data || []).map((d: any) => [d.subject_id, d.subject])).values()] as any[];
        setSubjects(unique.filter(Boolean));
      }
    };
    fetchSubjects();
    setSelectedSubject("");
  }, [selectedClass, role, teacherId]);

  useEffect(() => {
    if (!selectedClass) return;
    const fetchStudents = async () => {
      const { data } = await supabase.from("students").select("id, matricule, profile:profiles(first_name, last_name)")
        .eq("class_id", selectedClass).eq("is_active", true).order("matricule");
      setStudents((data as any) || []);
      // Initialize all as present
      const initial: Record<string, AttendanceRecord> = {};
      (data || []).forEach((s: any) => {
        initial[s.id] = { student_id: s.id, status: "present", reason: "" };
      });
      setRecords(initial);
      setExistingLoaded(false);
    };
    fetchStudents();
  }, [selectedClass]);

  // Load existing attendance when date/subject change
  useEffect(() => {
    if (!selectedClass || !selectedDate || students.length === 0) return;
    const loadExisting = async () => {
      let query = (supabase as any).from("attendance").select("*")
        .eq("class_id", selectedClass).eq("date", selectedDate);
      if (selectedSubject) query = query.eq("subject_id", selectedSubject);
      const { data } = await query;
      if (data && data.length > 0) {
        const updated = { ...records };
        data.forEach((r: any) => {
          if (updated[r.student_id]) {
            updated[r.student_id] = { student_id: r.student_id, status: r.status, reason: r.reason || "" };
          }
        });
        setRecords(updated);
        setExistingLoaded(true);
      } else {
        setExistingLoaded(false);
      }
    };
    loadExisting();
  }, [selectedDate, selectedSubject, students]);

  const toggleStatus = (studentId: string) => {
    const current = records[studentId]?.status || "present";
    const order: ("present" | "absent" | "late" | "excused")[] = ["present", "absent", "late", "excused"];
    const next = order[(order.indexOf(current) + 1) % order.length];
    if (next === "absent" || next === "excused") {
      setReasonDialog({ studentId, status: next });
      setReasonText(records[studentId]?.reason || "");
    } else {
      setRecords(prev => ({ ...prev, [studentId]: { ...prev[studentId], status: next, reason: "" } }));
    }
  };

  const confirmReason = () => {
    if (!reasonDialog) return;
    setRecords(prev => ({
      ...prev,
      [reasonDialog.studentId]: {
        ...prev[reasonDialog.studentId],
        status: reasonDialog.status as any,
        reason: reasonText,
      },
    }));
    setReasonDialog(null);
    setReasonText("");
  };

  const handleSave = async () => {
    if (!selectedClass || !selectedSubject) {
      toast({ title: "Erreur", description: "Sélectionnez une classe et une matière", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Delete existing for this class/date/subject
      await (supabase as any).from("attendance").delete()
        .eq("class_id", selectedClass).eq("date", selectedDate).eq("subject_id", selectedSubject);

      const rows = Object.values(records).map(r => ({
        student_id: r.student_id,
        class_id: selectedClass,
        subject_id: selectedSubject,
        teacher_id: teacherId || null,
        date: selectedDate,
        status: r.status,
        reason: r.reason || null,
      }));

      const { error } = await (supabase as any).from("attendance").insert(rows);
      if (error) throw error;
      toast({ title: "Présences enregistrées", description: `${presentCount} présents, ${absentCount} absents, ${lateCount} en retard` });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const markAllPresent = () => {
    const updated = { ...records };
    Object.keys(updated).forEach(k => { updated[k] = { ...updated[k], status: "present", reason: "" }; });
    setRecords(updated);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-primary" />
            Gestion des présences
          </h1>
          <p className="text-muted-foreground mt-1">Enregistrez les présences et absences par séance</p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-[180px]">
                <Label className="text-xs mb-1 block">Classe</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger><SelectValue placeholder="Classe" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="w-[180px]">
                <Label className="text-xs mb-1 block">Matière</Label>
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger><SelectValue placeholder="Matière" /></SelectTrigger>
                  <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="w-[160px]">
                <Label className="text-xs mb-1 block">Date</Label>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-10" />
              </div>
              <Button variant="outline" size="sm" onClick={markAllPresent} className="gap-1.5">
                <CheckCircle className="w-4 h-4" />Tous présents
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        {selectedClass && students.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-3 flex items-center gap-3">
              <Users className="w-5 h-5 text-muted-foreground" />
              <div><p className="text-xl font-bold">{students.length}</p><p className="text-xs text-muted-foreground">Total</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <div><p className="text-xl font-bold text-emerald-600">{presentCount}</p><p className="text-xs text-muted-foreground">Présents</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-destructive" />
              <div><p className="text-xl font-bold text-destructive">{absentCount}</p><p className="text-xs text-muted-foreground">Absents</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div><p className="text-xl font-bold text-amber-600">{lateCount}</p><p className="text-xs text-muted-foreground">En retard</p></div>
            </CardContent></Card>
          </div>
        )}

        {/* Attendance table */}
        {selectedClass && students.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Liste des apprenants</CardTitle>
                  <CardDescription>Cliquez sur le statut pour le modifier</CardDescription>
                </div>
                {existingLoaded && <Badge variant="outline" className="text-xs">Données existantes chargées</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Matricule</TableHead>
                      <TableHead className="w-32">Statut</TableHead>
                      <TableHead>Motif</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((s, i) => {
                      const rec = records[s.id];
                      const st = STATUS_CONFIG[rec?.status || "present"];
                      const Icon = st.icon;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.profile?.first_name} {s.profile?.last_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">{s.matricule}</TableCell>
                          <TableCell>
                            <button
                              onClick={() => toggleStatus(s.id)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${st.bg} ${st.color}`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {st.label}
                            </button>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {rec?.reason || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={handleSave} disabled={saving || !selectedSubject} className="gap-2">
                  <Save className="w-4 h-4" />{saving ? "Enregistrement..." : "Enregistrer les présences"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : selectedClass ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Aucun apprenant dans cette classe</p>
          </CardContent></Card>
        ) : (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Sélectionnez une classe pour commencer</p>
          </CardContent></Card>
        )}

        {/* Reason dialog */}
        <Dialog open={!!reasonDialog} onOpenChange={() => setReasonDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Motif {reasonDialog?.status === "absent" ? "d'absence" : "d'excuse"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Textarea value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="Raison (optionnel)..." rows={3} />
              <div className="flex gap-2">
                <Button onClick={confirmReason} className="flex-1">Confirmer</Button>
                <Button variant="outline" onClick={() => setReasonDialog(null)}>Annuler</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Attendance;
