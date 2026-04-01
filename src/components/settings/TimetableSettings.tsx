import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Save, BookOpen, UserCog, Settings2, Pencil, Wand2,
  Loader2, CheckCircle, AlertCircle, Building2, Clock,
} from "lucide-react";

// ─── URL de l'API Python OR-Tools sur Render ───────────────────────────────
const SOLVER_API = "https://school-timetable-solver-api.onrender.com";

// ─── Types ─────────────────────────────────────────────────────────────────

interface SubjectConfig {
  id: string;
  name: string;
  hours_per_week: number;
  max_sessions_per_week: number;
  preferred_block_size: number; // en minutes dans la DB (ex: 60)
  is_single_session_only: boolean;
}

interface TeacherConfig {
  id: string;
  profile: { first_name: string; last_name: string };
  max_hours_per_day: number;
  max_hours_per_week: number;
  // Format : [{ day: 1, hour?: 8, reason?: "Formation" }, ...]
  unavailable_slots: { day: number; hour?: number; reason?: string }[];
}

interface TeacherClass {
  teacher_id: string;
  class_id: string;
  subject_id: string;
}

interface RoomConfig {
  id: string;
  name: string;
  capacity: number;
  room_type: string;
  is_active: boolean;
}

interface ClassConfig {
  id: string;
  name: string;
  level: string;
  size?: number;
}

interface ConstraintForm {
  id?: string;
  constraint_name: string;
  period_start: string;
  period_end: string;
  lunch_start: string;
  lunch_end: string;
  days_of_week: number[];
  max_consecutive_hours: number;
  is_active: boolean;
}

// Payload envoyé à l'API Python
interface SolverPayload {
  classes: { id: string; name: string; size: number }[];
  subjects: {
    id: string;
    name: string;
    hours_per_week: number;
    preferred_block_minutes: number;
    is_single_session_only: boolean;
  }[];
  teachers: {
    id: string;
    name: string;
    max_hours_per_day: number;
    max_hours_per_week: number;
    unavailable_slots: { day: number; hour?: number }[];
  }[];
  rooms: { id: string; name: string; capacity: number; room_type: string }[];
  assignments: { teacher_id: string; class_id: string; subject_id: string }[];
  constraints: {
    period_start: string;
    period_end: string;
    lunch_start: string;
    lunch_end: string;
    days_of_week: number[];
    max_consecutive_hours: number;
  };
  max_time_seconds: number;
}

const DAYS_MAP: Record<number, string> = {
  1: "Lun", 2: "Mar", 3: "Mer", 4: "Jeu", 5: "Ven", 6: "Sam",
};

const ROOM_TYPE_LABELS: Record<string, string> = {
  classroom: "Salle de cours",
  lab: "Laboratoire",
  computer_lab: "Informatique",
  library: "Bibliothèque",
  conference: "Conférence",
  admin: "Administratif",
};

// ─── Composant principal ────────────────────────────────────────────────────

export const TimetableSettings = () => {
  const [subjects, setSubjects] = useState<SubjectConfig[]>([]);
  const [teachers, setTeachers] = useState<TeacherConfig[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [rooms, setRooms] = useState<RoomConfig[]>([]);
  const [classes, setClasses] = useState<ClassConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [apiStatus, setApiStatus] = useState<"unknown" | "online" | "offline">("unknown");

  const [editingTeacher, setEditingTeacher] = useState<TeacherConfig | null>(null);
  const [teacherDialogOpen, setTeacherDialogOpen] = useState(false);

  const [constraintForm, setConstraintForm] = useState<ConstraintForm>({
    constraint_name: "Par défaut",
    period_start: "07:00",
    period_end: "18:00",
    lunch_start: "12:00",
    lunch_end: "13:00",
    days_of_week: [1, 2, 3, 4, 5, 6],
    max_consecutive_hours: 4,
    is_active: true,
  });

  const [maxTimeSec, setMaxTimeSec] = useState(60);
  const [solverResult, setSolverResult] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchAll();
    pingApi();
  }, []);

  // ── Ping API Render ──────────────────────────────────────────────────────
  const pingApi = async () => {
    try {
      const res = await fetch(`${SOLVER_API}/health`, { signal: AbortSignal.timeout(8000) });
      setApiStatus(res.ok ? "online" : "offline");
    } catch {
      setApiStatus("offline");
    }
  };

  // ── Fetch data depuis Supabase ───────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    const [subRes, teacherRes, tcRes, roomRes, classRes, constraintRes] = await Promise.all([
      supabase
        .from("subjects")
        .select("id, name, hours_per_week, max_sessions_per_week, preferred_block_size, is_single_session_only")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("teachers")
        .select("id, max_hours_per_day, max_hours_per_week, unavailable_slots, profile:profiles(first_name, last_name)")
        .eq("is_active", true),
      supabase
        .from("teacher_classes")
        .select("teacher_id, class_id, subject_id"),
      supabase
        .from("rooms")
        .select("id, name, capacity, room_type, is_active")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("classes")
        .select("id, name, level")
        .eq("is_active", true)
        .order("name"),
      (supabase as any)
        .from("timetable_constraints")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    setSubjects((subRes.data as any) || []);
    setTeachers((teacherRes.data as any) || []);
    setTeacherClasses((tcRes.data as any) || []);
    setRooms((roomRes.data as any) || []);
    setClasses((classRes.data as any) || []);

    if (constraintRes.data?.length) {
      const c = constraintRes.data[0] as any;
      setConstraintForm(c);
    }
    setLoading(false);
  };

  // ── Sauvegarder matières ─────────────────────────────────────────────────
  const saveSubjects = async () => {
    setSaving(true);
    try {
      for (const s of subjects) {
        await supabase.from("subjects").update({
          hours_per_week: s.hours_per_week,
          max_sessions_per_week: s.max_sessions_per_week,
          preferred_block_size: s.preferred_block_size,
          is_single_session_only: s.is_single_session_only,
        } as any).eq("id", s.id);
      }
      toast({ title: "Matières sauvegardées" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ── Sauvegarder enseignant ───────────────────────────────────────────────
  const saveTeacher = async () => {
    if (!editingTeacher) return;
    setSaving(true);
    try {
      await supabase.from("teachers").update({
        max_hours_per_day: editingTeacher.max_hours_per_day,
        max_hours_per_week: editingTeacher.max_hours_per_week,
        unavailable_slots: editingTeacher.unavailable_slots,
      } as any).eq("id", editingTeacher.id);
      setTeachers(prev => prev.map(t => t.id === editingTeacher.id ? editingTeacher : t));
      setTeacherDialogOpen(false);
      toast({ title: "Enseignant mis à jour" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ── Sauvegarder contraintes ──────────────────────────────────────────────
  const saveConstraints = async () => {
    setSaving(true);
    try {
      if (constraintForm.id) {
        await (supabase as any).from("timetable_constraints").update({
          constraint_name: constraintForm.constraint_name,
          period_start: constraintForm.period_start,
          period_end: constraintForm.period_end,
          lunch_start: constraintForm.lunch_start,
          lunch_end: constraintForm.lunch_end,
          days_of_week: constraintForm.days_of_week,
          max_consecutive_hours: constraintForm.max_consecutive_hours,
          is_active: constraintForm.is_active,
        }).eq("id", constraintForm.id);
      } else {
        await (supabase as any).from("timetable_constraints").insert({
          constraint_name: constraintForm.constraint_name || "Par défaut",
          period_start: constraintForm.period_start,
          period_end: constraintForm.period_end,
          lunch_start: constraintForm.lunch_start,
          lunch_end: constraintForm.lunch_end,
          days_of_week: constraintForm.days_of_week,
          max_consecutive_hours: constraintForm.max_consecutive_hours,
          is_active: true,
        });
      }
      toast({ title: "Contraintes sauvegardées" });
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ── Construire le payload JSON pour l'API Python ─────────────────────────
  const buildSolverPayload = (): SolverPayload => {
    return {
      classes: classes.map(c => ({
        id: c.id,
        name: c.name,
        size: (c as any).size || 30,
      })),

      subjects: subjects.map(s => ({
        id: s.id,
        name: s.name,
        hours_per_week: s.hours_per_week,
        // preferred_block_size est en minutes dans la DB
        preferred_block_minutes: s.preferred_block_size || 60,
        is_single_session_only: s.is_single_session_only,
      })),

      teachers: teachers.map(t => ({
        id: t.id,
        name: `${t.profile?.first_name || ""} ${t.profile?.last_name || ""}`.trim(),
        max_hours_per_day: t.max_hours_per_day,
        max_hours_per_week: t.max_hours_per_week,
        unavailable_slots: (t.unavailable_slots || []).map(u => ({
          day: u.day,
          ...(u.hour !== undefined ? { hour: u.hour } : {}),
        })),
      })),

      rooms: rooms.map(r => ({
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        room_type: r.room_type,
      })),

      // Assignations explicites : qui enseigne quoi à quelle classe
      assignments: teacherClasses.map(tc => ({
        teacher_id: tc.teacher_id,
        class_id: tc.class_id,
        subject_id: tc.subject_id,
      })),

      constraints: {
        period_start: constraintForm.period_start,
        period_end: constraintForm.period_end,
        lunch_start: constraintForm.lunch_start,
        lunch_end: constraintForm.lunch_end,
        days_of_week: constraintForm.days_of_week,
        max_consecutive_hours: constraintForm.max_consecutive_hours,
      },

      max_time_seconds: maxTimeSec,
    };
  };

  // ── Tester la génération via l'API Render ────────────────────────────────
  const testGeneration = async () => {
    if (rooms.length === 0) {
      toast({ title: "Aucune salle disponible", description: "Ajoutez des salles dans la gestion des salles.", variant: "destructive" });
      return;
    }
    if (teacherClasses.length === 0) {
      toast({ title: "Aucune assignation", description: "Assignez des enseignants aux classes et matières.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    setSolverResult(null);
    const payload = buildSolverPayload();

    try {
      const res = await fetch(`${SOLVER_API}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout((maxTimeSec + 15) * 1000),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Erreur API");
      }

      setSolverResult(data);
      toast({
        title: data.status === "success" ? "Génération réussie !" : "Génération partielle",
        description: data.message,
        variant: data.status === "success" ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Erreur de génération", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  // ── Afficher le JSON payload (debug) ────────────────────────────────────
  const [showPayload, setShowPayload] = useState(false);

  if (loading) return <div className="py-8 text-center text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6">

      {/* Statut API */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  apiStatus === "online" ? "bg-emerald-500" :
                  apiStatus === "offline" ? "bg-red-500" : "bg-amber-400"
                }`} />
                <span className="text-sm font-medium">
                  API Solver : {apiStatus === "online" ? "En ligne" : apiStatus === "offline" ? "Hors ligne" : "Vérification..."}
                </span>
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-xs">{SOLVER_API}</span>
            </div>
            <Button variant="outline" size="sm" onClick={pingApi} className="gap-1.5 h-7 text-xs">
              <Clock className="w-3 h-3" />Ping
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Matières */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4" />Heures par matière
          </CardTitle>
          <CardDescription>Volume horaire hebdomadaire et taille des blocs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matière</TableHead>
                  <TableHead className="w-24">H/semaine</TableHead>
                  <TableHead className="w-24">Max séances</TableHead>
                  <TableHead className="w-28">Bloc (min)</TableHead>
                  <TableHead className="w-24">Séance unique</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Input type="number" min={1} max={20} value={s.hours_per_week} className="h-8 w-20"
                        onChange={e => setSubjects(prev => prev.map(x => x.id === s.id ? { ...x, hours_per_week: Number(e.target.value) } : x))} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={1} max={10} value={s.max_sessions_per_week} className="h-8 w-20"
                        onChange={e => setSubjects(prev => prev.map(x => x.id === s.id ? { ...x, max_sessions_per_week: Number(e.target.value) } : x))} />
                    </TableCell>
                    <TableCell>
                      <Select value={String(s.preferred_block_size || 60)}
                        onValueChange={v => setSubjects(prev => prev.map(x => x.id === s.id ? { ...x, preferred_block_size: Number(v) } : x))}>
                        <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[30, 60, 90, 120, 180].map(m => (
                            <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch checked={s.is_single_session_only}
                        onCheckedChange={v => setSubjects(prev => prev.map(x => x.id === s.id ? { ...x, is_single_session_only: v } : x))} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button onClick={saveSubjects} disabled={saving} className="mt-4 gap-2" size="sm">
            <Save className="w-4 h-4" />{saving ? "..." : "Sauvegarder matières"}
          </Button>
        </CardContent>
      </Card>

      {/* Salles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />Salles disponibles
          </CardTitle>
          <CardDescription>
            {rooms.length} salle(s) active(s) — gestion complète dans la page Salles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-24">Capacité</TableHead>
                  <TableHead className="w-16">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {ROOM_TYPE_LABELS[r.room_type] || r.room_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.capacity} places</TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-500 text-xs">Active</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {rooms.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">
                      Aucune salle — ajoutez-en dans la page Salles
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Enseignants */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="w-4 h-4" />Disponibilité enseignants
          </CardTitle>
          <CardDescription>Heures max et créneaux d'indisponibilité</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enseignant</TableHead>
                  <TableHead className="w-24">Max h/jour</TableHead>
                  <TableHead className="w-28">Max h/sem.</TableHead>
                  <TableHead className="w-32">Indispo.</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.profile?.first_name} {t.profile?.last_name}
                    </TableCell>
                    <TableCell>{t.max_hours_per_day}h</TableCell>
                    <TableCell>{t.max_hours_per_week}h</TableCell>
                    <TableCell>
                      {(t.unavailable_slots || []).length > 0
                        ? <Badge variant="outline" className="text-xs">{t.unavailable_slots.length} créneau(x)</Badge>
                        : <span className="text-xs text-muted-foreground">Aucune</span>}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditingTeacher({ ...t }); setTeacherDialogOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Contraintes globales */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" />Contraintes globales
          </CardTitle>
          <CardDescription>Ces paramètres alimentent directement le solveur OR-Tools</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Début journée</Label>
              <Input type="time" value={constraintForm.period_start} className="h-8"
                onChange={e => setConstraintForm({ ...constraintForm, period_start: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Fin journée</Label>
              <Input type="time" value={constraintForm.period_end} className="h-8"
                onChange={e => setConstraintForm({ ...constraintForm, period_end: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Début pause</Label>
              <Input type="time" value={constraintForm.lunch_start} className="h-8"
                onChange={e => setConstraintForm({ ...constraintForm, lunch_start: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Fin pause</Label>
              <Input type="time" value={constraintForm.lunch_end} className="h-8"
                onChange={e => setConstraintForm({ ...constraintForm, lunch_end: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Heures consécutives max</Label>
              <Input type="number" min={1} max={8} value={constraintForm.max_consecutive_hours} className="h-8 w-24"
                onChange={e => setConstraintForm({ ...constraintForm, max_consecutive_hours: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Timeout solveur (sec.)</Label>
              <Input type="number" min={10} max={300} step={10} value={maxTimeSec} className="h-8 w-28"
                onChange={e => setMaxTimeSec(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">Jours actifs</Label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(DAYS_MAP).map(([val, label]) => {
                const num = Number(val);
                const active = (constraintForm.days_of_week || []).includes(num);
                return (
                  <Badge key={val} variant={active ? "default" : "outline"} className="cursor-pointer select-none"
                    onClick={() => {
                      const days = constraintForm.days_of_week || [];
                      setConstraintForm({
                        ...constraintForm,
                        days_of_week: active ? days.filter(d => d !== num) : [...days, num].sort(),
                      });
                    }}>
                    {label}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={saveConstraints} disabled={saving} className="gap-2" size="sm">
              <Save className="w-4 h-4" />{saving ? "..." : "Sauvegarder contraintes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test génération via API Render */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="w-4 h-4" />Tester la génération OR-Tools
          </CardTitle>
          <CardDescription>
            Envoie le JSON complet au solveur Python sur Render et affiche le résultat
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Résumé du payload */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Classes", value: classes.length },
              { label: "Matières", value: subjects.length },
              { label: "Enseignants", value: teachers.length },
              { label: "Salles", value: rooms.length },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xl font-semibold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={testGeneration} disabled={generating || apiStatus === "offline"} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {generating ? "Génération en cours..." : "Lancer le solveur"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPayload(!showPayload)} className="gap-1.5">
              {showPayload ? "Masquer" : "Voir"} le JSON envoyé
            </Button>
          </div>

          {/* Aperçu JSON */}
          {showPayload && (
            <pre className="text-xs bg-muted rounded-lg p-4 overflow-auto max-h-64 leading-relaxed">
              {JSON.stringify(buildSolverPayload(), null, 2)}
            </pre>
          )}

          {/* Résultat */}
          {solverResult && (
            <div className={`rounded-lg border p-4 space-y-2 ${solverResult.status === "success" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"}`}>
              <div className="flex items-center gap-2">
                {solverResult.status === "success"
                  ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                  : <AlertCircle className="w-4 h-4 text-amber-600" />}
                <span className="font-medium text-sm">{solverResult.message}</span>
              </div>
              {solverResult.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <span>{solverResult.stats.num_entries} créneaux générés</span>
                  <span>Statut : {solverResult.stats.solver_status}</span>
                  <span>Temps : {solverResult.stats.wall_time_s}s</span>
                  {solverResult.stats.missing_hours?.length > 0 && (
                    <span className="text-amber-600">{solverResult.stats.missing_hours.length} heure(s) non placée(s)</span>
                  )}
                </div>
              )}
              {solverResult.conflicts?.length > 0 && (
                <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 mt-1">
                  {solverResult.conflicts.map((c: string, i: number) => (
                    <li key={i}>• {c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog édition enseignant */}
      <Dialog open={teacherDialogOpen} onOpenChange={setTeacherDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTeacher?.profile?.first_name} {editingTeacher?.profile?.last_name}
            </DialogTitle>
          </DialogHeader>
          {editingTeacher && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Max heures/jour</Label>
                  <Input type="number" min={1} max={12} value={editingTeacher.max_hours_per_day}
                    onChange={e => setEditingTeacher({ ...editingTeacher, max_hours_per_day: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Max heures/semaine</Label>
                  <Input type="number" min={1} max={50} value={editingTeacher.max_hours_per_week}
                    onChange={e => setEditingTeacher({ ...editingTeacher, max_hours_per_week: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <Label className="mb-1 block">Indisponibilités par jour</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Cliquez sur les jours où l'enseignant n'est pas disponible (journée entière).
                </p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(DAYS_MAP).map(([val, label]) => {
                    const num = Number(val);
                    const isUnavail = (editingTeacher.unavailable_slots || []).some(u => u.day === num && !u.hour);
                    return (
                      <Badge key={val} variant={isUnavail ? "destructive" : "outline"} className="cursor-pointer select-none"
                        onClick={() => {
                          const slots = editingTeacher.unavailable_slots || [];
                          if (isUnavail) {
                            setEditingTeacher({ ...editingTeacher, unavailable_slots: slots.filter(u => !(u.day === num && !u.hour)) });
                          } else {
                            setEditingTeacher({ ...editingTeacher, unavailable_slots: [...slots, { day: num }] });
                          }
                        }}>
                        {label}
                      </Badge>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Indisponibilités actuelles : {(editingTeacher.unavailable_slots || []).length === 0
                    ? "aucune"
                    : (editingTeacher.unavailable_slots || []).map(u => `${DAYS_MAP[u.day]}${u.hour !== undefined ? ` ${u.hour}h` : ""}`).join(", ")}
                </p>
              </div>

              <Button onClick={saveTeacher} disabled={saving} className="w-full gap-2">
                <Save className="w-4 h-4" />{saving ? "..." : "Sauvegarder"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
