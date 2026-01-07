import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Search, X, School, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Teacher {
  id: string;
  user_id: string;
  profile_id: string;
  employee_id: string | null;
  is_active: boolean;
  profile: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
  specialties: { subject_id: string; subject_name: string }[];
  classes: { class_id: string; class_name: string; subject_id: string; subject_name: string; is_principal: boolean }[];
}

interface Subject { id: string; name: string; }
interface Class { id: string; name: string; level: string; }

const Enseignants = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  
  const [editFormData, setEditFormData] = useState({
    firstName: "", lastName: "", phone: "", employeeId: "",
  });
  const [editSpecialties, setEditSpecialties] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", employeeId: "",
  });
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [assignmentData, setAssignmentData] = useState({
    classId: "", subjectId: "", isPrincipal: false,
  });

  const fetchTeachers = async () => {
    setLoading(true);
    const { data: teachersData, error } = await supabase
      .from('teachers')
      .select('id, user_id, profile_id, employee_id, is_active, profiles!teachers_profile_id_fkey (first_name, last_name, email, phone)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les enseignants", variant: "destructive" });
      setLoading(false);
      return;
    }

    const teachersWithDetails = await Promise.all(
      (teachersData || []).map(async (teacher) => {
        const { data: specialtiesData } = await supabase
          .from('teacher_specialties')
          .select('subject_id, subjects(name)')
          .eq('teacher_id', teacher.id);

        const { data: classesData } = await supabase
          .from('teacher_classes')
          .select('class_id, subject_id, is_principal, classes(name), subjects(name)')
          .eq('teacher_id', teacher.id);

        return {
          ...teacher,
          profile: teacher.profiles,
          specialties: (specialtiesData || []).map((s: any) => ({
            subject_id: s.subject_id, subject_name: s.subjects?.name || '',
          })),
          classes: (classesData || []).map((c: any) => ({
            class_id: c.class_id, class_name: c.classes?.name || '',
            subject_id: c.subject_id, subject_name: c.subjects?.name || '',
            is_principal: c.is_principal,
          })),
        };
      })
    );
    setTeachers(teachersWithDetails as Teacher[]);
    setLoading(false);
  };

  const fetchSubjectsAndClasses = async () => {
    const [subjectsRes, classesRes] = await Promise.all([
      supabase.from('subjects').select('id, name').eq('is_active', true).order('name'),
      supabase.from('classes').select('id, name, level').eq('is_active', true).order('name'),
    ]);
    if (subjectsRes.data) setSubjects(subjectsRes.data);
    if (classesRes.data) setClasses(classesRes.data);
  };

  useEffect(() => {
    fetchTeachers();
    fetchSubjectsAndClasses();
  }, []);

  const handleCreateTeacher = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs obligatoires", variant: "destructive" });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Erreur", description: "Session expirée", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: formData.email, firstName: formData.firstName, lastName: formData.lastName,
          phone: formData.phone || null, userType: 'teacher', employeeId: formData.employeeId || null,
          specialties: selectedSpecialties,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ title: "Enseignant créé", description: `Mot de passe: ${data.generatedPassword}` });
      setIsCreateDialogOpen(false);
      resetForm();
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleAssignClass = async () => {
    if (!selectedTeacher || !assignmentData.classId || !assignmentData.subjectId) {
      toast({ title: "Erreur", description: "Sélectionnez classe et matière", variant: "destructive" });
      return;
    }

    try {
      const { data: existing } = await supabase
        .from('teacher_classes').select('id')
        .eq('teacher_id', selectedTeacher.id).eq('class_id', assignmentData.classId).maybeSingle();

      if (existing) {
        toast({ title: "Erreur", description: "Déjà assigné", variant: "destructive" });
        return;
      }

      if (assignmentData.isPrincipal) {
        await supabase.from('teacher_classes').update({ is_principal: false })
          .eq('class_id', assignmentData.classId).eq('is_principal', true);
      }

      const { error } = await supabase.from('teacher_classes').insert({
        teacher_id: selectedTeacher.id, class_id: assignmentData.classId,
        subject_id: assignmentData.subjectId, is_principal: assignmentData.isPrincipal,
      });

      if (error) throw error;
      toast({ title: "Succès", description: "Classe assignée" });
      setIsAssignDialogOpen(false);
      setAssignmentData({ classId: "", subjectId: "", isPrincipal: false });
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleRemoveClassAssignment = async (teacherId: string, classId: string) => {
    try {
      await supabase.from('teacher_classes').delete().eq('teacher_id', teacherId).eq('class_id', classId);
      toast({ title: "Succès", description: "Assignation supprimée" });
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    try {
      await supabase.from('teacher_classes').delete().eq('teacher_id', teacher.id);
      await supabase.from('teacher_specialties').delete().eq('teacher_id', teacher.id);
      await supabase.from('teachers').delete().eq('id', teacher.id);
      await supabase.from('profiles').delete().eq('id', teacher.profile_id);
      toast({ title: "Succès", description: "Supprimé" });
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleEditTeacher = async () => {
    if (!selectedTeacher) return;
    try {
      await supabase.from('profiles').update({
        first_name: editFormData.firstName, last_name: editFormData.lastName,
        phone: editFormData.phone || null,
      }).eq('id', selectedTeacher.profile_id);

      await supabase.from('teachers').update({ employee_id: editFormData.employeeId || null })
        .eq('id', selectedTeacher.id);

      await supabase.from('teacher_specialties').delete().eq('teacher_id', selectedTeacher.id);
      if (editSpecialties.length > 0) {
        await supabase.from('teacher_specialties').insert(
          editSpecialties.map(sid => ({ teacher_id: selectedTeacher.id, subject_id: sid }))
        );
      }

      toast({ title: "Succès", description: "Modifié" });
      setIsEditDialogOpen(false);
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const openEditDialog = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setEditFormData({
      firstName: teacher.profile.first_name, lastName: teacher.profile.last_name,
      phone: teacher.profile.phone || "", employeeId: teacher.employee_id || "",
    });
    setEditSpecialties(teacher.specialties.map(s => s.subject_id));
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ firstName: "", lastName: "", email: "", phone: "", employeeId: "" });
    setSelectedSpecialties([]);
  };

  const filteredTeachers = teachers.filter(t =>
    `${t.profile.first_name} ${t.profile.last_name} ${t.profile.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Enseignants</h1>
            <p className="text-muted-foreground">Gérez les enseignants</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" />Nouvel enseignant</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Créer un enseignant</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Prénom *</Label>
                    <Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                  </div>
                  <div><Label>Nom *</Label>
                    <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                  </div>
                </div>
                <div><Label>Email *</Label>
                  <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  <p className="text-xs text-muted-foreground mt-1">Mot de passe généré automatiquement</p>
                </div>
                <div><Label>Téléphone</Label>
                  <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div><Label>Matricule</Label>
                  <Input value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} />
                </div>
                <div>
                  <Label>Spécialités</Label>
                  {subjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">Créez des matières d'abord</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-md p-2">
                      {subjects.map(sub => (
                        <label key={sub.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selectedSpecialties.includes(sub.id)}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedSpecialties([...selectedSpecialties, sub.id]);
                              else setSelectedSpecialties(selectedSpecialties.filter(id => id !== sub.id));
                            }}
                          />
                          {sub.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={handleCreateTeacher} className="w-full">Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="table-header">
                  <TableHead>Enseignant</TableHead>
                  <TableHead>Spécialités</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Chargement...</TableCell></TableRow>
                ) : filteredTeachers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Aucun enseignant</TableCell></TableRow>
                ) : (
                  filteredTeachers.map(teacher => (
                    <TableRow key={teacher.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{teacher.profile.first_name} {teacher.profile.last_name}</p>
                          <p className="text-sm text-muted-foreground">{teacher.profile.email}</p>
                          {teacher.employee_id && <p className="text-xs text-muted-foreground">ID: {teacher.employee_id}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {teacher.specialties.map(s => (
                            <Badge key={s.subject_id} variant="secondary" className="text-xs">{s.subject_name}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {teacher.classes.map(c => (
                            <div key={`${c.class_id}-${c.subject_id}`} className="flex items-center gap-2">
                              <Badge variant={c.is_principal ? "default" : "outline"} className="text-xs">
                                {c.class_name} - {c.subject_name}{c.is_principal && " (PP)"}
                              </Badge>
                              <button onClick={() => handleRemoveClassAssignment(teacher.id, c.class_id)}
                                className="text-destructive hover:text-destructive/80">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={teacher.is_active ? "default" : "secondary"}>
                          {teacher.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon"
                            onClick={() => { setSelectedTeacher(teacher); setIsViewDialogOpen(true); }}
                            title="Voir"><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(teacher)}
                            title="Modifier"><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon"
                            onClick={() => { setSelectedTeacher(teacher); setIsAssignDialogOpen(true); }}
                            title="Assigner"><School className="w-4 h-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Supprimer">
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Supprimer {teacher.profile.first_name} {teacher.profile.last_name} ?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTeacher(teacher)}>Supprimer</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dialogs suite dans commentaire */}
        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Assigner - {selectedTeacher?.profile.first_name}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div><Label>Classe</Label>
                <Select value={assignmentData.classId} onValueChange={v => setAssignmentData({...assignmentData, classId: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.level})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Matière</Label>
                <Select value={assignmentData.subjectId} onValueChange={v => setAssignmentData({...assignmentData, subjectId: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={assignmentData.isPrincipal}
                  onCheckedChange={(checked) => setAssignmentData({...assignmentData, isPrincipal: !!checked})} />
                <span className="text-sm">Professeur principal</span>
              </label>
              <Button onClick={handleAssignClass} className="w-full">Assigner</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Détails</DialogTitle></DialogHeader>
            {selectedTeacher && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground">Prénom</Label>
                    <p className="font-medium">{selectedTeacher.profile.first_name}</p></div>
                  <div><Label className="text-muted-foreground">Nom</Label>
                    <p className="font-medium">{selectedTeacher.profile.last_name}</p></div>
                </div>
                <div><Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedTeacher.profile.email}</p></div>
                <div><Label className="text-muted-foreground">Téléphone</Label>
                  <p className="font-medium">{selectedTeacher.profile.phone || "Non renseigné"}</p></div>
                <div><Label className="text-muted-foreground">Matricule</Label>
                  <p className="font-medium">{selectedTeacher.employee_id || "Non renseigné"}</p></div>
                <div><Label className="text-muted-foreground">Spécialités</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedTeacher.specialties.length > 0 ? (
                      selectedTeacher.specialties.map(s => <Badge key={s.subject_id} variant="secondary">{s.subject_name}</Badge>)
                    ) : <p className="text-sm">Aucune</p>}
                  </div>
                </div>
                <div><Label className="text-muted-foreground">Classes</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedTeacher.classes.length > 0 ? (
                      selectedTeacher.classes.map(c =>
                        <Badge key={`${c.class_id}-${c.subject_id}`} variant={c.is_principal ? "default" : "outline"}>
                          {c.class_name} - {c.subject_name} {c.is_principal && "(PP)"}
                        </Badge>
                      )
                    ) : <p className="text-sm">Aucune</p>}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Modifier</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Prénom</Label>
                  <Input value={editFormData.firstName} onChange={e => setEditFormData({...editFormData, firstName: e.target.value})} />
                </div>
                <div><Label>Nom</Label>
                  <Input value={editFormData.lastName} onChange={e => setEditFormData({...editFormData, lastName: e.target.value})} />
                </div>
              </div>
              <div><Label>Téléphone</Label>
                <Input value={editFormData.phone} onChange={e => setEditFormData({...editFormData, phone: e.target.value})} />
              </div>
              <div><Label>Matricule</Label>
                <Input value={editFormData.employeeId} onChange={e => setEditFormData({...editFormData, employeeId: e.target.value})} />
              </div>
              <div><Label>Spécialités</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-md p-2">
                  {subjects.map(sub => (
                    <label key={sub.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={editSpecialties.includes(sub.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setEditSpecialties([...editSpecialties, sub.id]);
                          else setEditSpecialties(editSpecialties.filter(id => id !== sub.id));
                        }}
                      />
                      {sub.name}
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={handleEditTeacher} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Enseignants;