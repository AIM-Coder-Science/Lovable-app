import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, UserCheck, Search, X, BookOpen, School, Eye, AlertCircle } from "lucide-react";
import { StatusToggle } from "@/components/ui/status-toggle";
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

interface Subject {
  id: string;
  name: string;
}

interface Class {
  id: string;
  name: string;
  level: string;
}

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
    firstName: "",
    lastName: "",
    phone: "",
    employeeId: "",
  });
  const [editSpecialties, setEditSpecialties] = useState<string[]>([]);
  // Form state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    employeeId: "",
  });
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  
  // Assignment state
  const [assignmentData, setAssignmentData] = useState({
    classId: "",
    subjectId: "",
    isPrincipal: false,
  });
  const [classHasPP, setClassHasPP] = useState(false);

  const fetchTeachers = async () => {
    setLoading(true);
    const { data: teachersData, error } = await supabase
      .from('teachers')
      .select(`
        id, user_id, profile_id, employee_id, is_active,
        profiles!teachers_profile_id_fkey (first_name, last_name, email, phone)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les enseignants", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Fetch specialties and classes for each teacher
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
            subject_id: s.subject_id,
            subject_name: s.subjects?.name || '',
          })),
          classes: (classesData || []).map((c: any) => ({
            class_id: c.class_id,
            class_name: c.classes?.name || '',
            subject_id: c.subject_id,
            subject_name: c.subjects?.name || '',
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

  // Check if selected class already has a PP
  useEffect(() => {
    const checkClassHasPP = async () => {
      if (!assignmentData.classId) {
        setClassHasPP(false);
        return;
      }
      
      const { data } = await supabase
        .from('teacher_classes')
        .select('id')
        .eq('class_id', assignmentData.classId)
        .eq('is_principal', true)
        .maybeSingle();
      
      setClassHasPP(!!data);
    };
    
    checkClassHasPP();
  }, [assignmentData.classId]);

  const handleCreateTeacher = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs obligatoires", variant: "destructive" });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Erreur", description: "Session expirée, veuillez vous reconnecter", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || null,
          userType: 'teacher',
          employeeId: formData.employeeId || null,
          specialties: selectedSpecialties,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ 
        title: "Enseignant créé", 
        description: `Mot de passe généré: ${data.generatedPassword}. Notez-le car il ne sera plus affiché.`,
      });
      setIsCreateDialogOpen(false);
      resetForm();
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleAssignClass = async () => {
    if (!selectedTeacher || !assignmentData.classId || !assignmentData.subjectId) {
      toast({ title: "Erreur", description: "Veuillez sélectionner une classe et une matière", variant: "destructive" });
      return;
    }

    try {
      // Check if teacher already teaches in this class
      const { data: existing } = await supabase
        .from('teacher_classes')
        .select('id')
        .eq('teacher_id', selectedTeacher.id)
        .eq('class_id', assignmentData.classId)
        .maybeSingle();

      if (existing) {
        toast({ title: "Erreur", description: "Cet enseignant enseigne déjà dans cette classe", variant: "destructive" });
        return;
      }

      // If setting as principal, remove existing principal for this class
      if (assignmentData.isPrincipal) {
        await supabase
          .from('teacher_classes')
          .update({ is_principal: false })
          .eq('class_id', assignmentData.classId)
          .eq('is_principal', true);
      }

      const { error } = await supabase
        .from('teacher_classes')
        .insert({
          teacher_id: selectedTeacher.id,
          class_id: assignmentData.classId,
          subject_id: assignmentData.subjectId,
          is_principal: assignmentData.isPrincipal,
        });

      if (error) throw error;

      toast({ title: "Succès", description: "Classe assignée avec succès" });
      setIsAssignDialogOpen(false);
      setAssignmentData({ classId: "", subjectId: "", isPrincipal: false });
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleRemoveClassAssignment = async (teacherId: string, classId: string) => {
    try {
      const { error } = await supabase
        .from('teacher_classes')
        .delete()
        .eq('teacher_id', teacherId)
        .eq('class_id', classId);

      if (error) throw error;

      toast({ title: "Succès", description: "Assignation supprimée" });
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (teacher: Teacher) => {
    try {
      const { error } = await supabase
        .from('teachers')
        .update({ is_active: !teacher.is_active })
        .eq('id', teacher.id);

      if (error) throw error;

      // Also update profile
      await supabase
        .from('profiles')
        .update({ is_active: !teacher.is_active })
        .eq('id', teacher.profile_id);

      toast({ title: "Succès", description: teacher.is_active ? "Enseignant désactivé" : "Enseignant activé" });
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    try {
      // Delete teacher_classes
      await supabase.from('teacher_classes').delete().eq('teacher_id', teacher.id);
      // Delete teacher_specialties
      await supabase.from('teacher_specialties').delete().eq('teacher_id', teacher.id);
      // Delete teacher
      await supabase.from('teachers').delete().eq('id', teacher.id);
      // Delete profile
      await supabase.from('profiles').delete().eq('id', teacher.profile_id);

      toast({ title: "Succès", description: "Enseignant supprimé avec succès" });
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleEditTeacher = async () => {
    if (!selectedTeacher) return;

    try {
      // Update profile
      await supabase
        .from('profiles')
        .update({
          first_name: editFormData.firstName,
          last_name: editFormData.lastName,
          phone: editFormData.phone || null,
        })
        .eq('id', selectedTeacher.profile_id);

      // Note: We don't update employee_id anymore since it's auto-generated

      // Update specialties
      await supabase.from('teacher_specialties').delete().eq('teacher_id', selectedTeacher.id);
      if (editSpecialties.length > 0) {
        await supabase.from('teacher_specialties').insert(
          editSpecialties.map(subjectId => ({
            teacher_id: selectedTeacher.id,
            subject_id: subjectId,
          }))
        );
      }

      toast({ title: "Succès", description: "Enseignant modifié avec succès" });
      setIsEditDialogOpen(false);
      fetchTeachers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const openEditDialog = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setEditFormData({
      firstName: teacher.profile.first_name,
      lastName: teacher.profile.last_name,
      phone: teacher.profile.phone || "",
      employeeId: teacher.employee_id || "",
    });
    setEditSpecialties(teacher.specialties.map(s => s.subject_id));
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ firstName: "", lastName: "", email: "", phone: "", employeeId: "" });
    setSelectedSpecialties([]);
  };

  const filteredTeachers = teachers.filter(teacher =>
    `${teacher.profile.first_name} ${teacher.profile.last_name} ${teacher.profile.email}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Enseignants</h1>
            <p className="text-muted-foreground">Gérez les enseignants de l'établissement</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nouvel enseignant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Créer un enseignant</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Prénom *</Label>
                    <Input 
                      value={formData.firstName} 
                      onChange={e => setFormData({...formData, firstName: e.target.value})} 
                    />
                  </div>
                  <div>
                    <Label>Nom *</Label>
                    <Input 
                      value={formData.lastName} 
                      onChange={e => setFormData({...formData, lastName: e.target.value})} 
                    />
                  </div>
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input 
                    type="email" 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                  />
                  <p className="text-xs text-muted-foreground mt-1">Un mot de passe sera généré automatiquement</p>
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Matricule employé</Label>
                  <Input 
                    value={formData.employeeId} 
                    onChange={e => setFormData({...formData, employeeId: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Spécialités (matières)</Label>
                  {subjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">Aucune matière disponible. Créez des matières d'abord.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-md p-2">
                      {subjects.map(subject => (
                        <label key={subject.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selectedSpecialties.includes(subject.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedSpecialties([...selectedSpecialties, subject.id]);
                              } else {
                                setSelectedSpecialties(selectedSpecialties.filter(id => id !== subject.id));
                              }
                            }}
                          />
                          {subject.name}
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

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un enseignant..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Table */}
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
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Chargement...
                    </TableCell>
                  </TableRow>
                ) : filteredTeachers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucun enseignant trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTeachers.map(teacher => (
                    <TableRow key={teacher.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{teacher.profile.first_name} {teacher.profile.last_name}</p>
                          <p className="text-sm text-muted-foreground">{teacher.profile.email}</p>
                          {teacher.employee_id && (
                            <p className="text-xs text-muted-foreground">ID: {teacher.employee_id}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {teacher.specialties.map(s => (
                            <Badge key={s.subject_id} variant="secondary" className="text-xs">
                              {s.subject_name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {teacher.classes.map(c => (
                            <div key={`${c.class_id}-${c.subject_id}`} className="flex items-center gap-2">
                              <Badge variant={c.is_principal ? "default" : "outline"} className="text-xs">
                                {c.class_name} - {c.subject_name}
                                {c.is_principal && " (PP)"}
                              </Badge>
                              <button
                                onClick={() => handleRemoveClassAssignment(teacher.id, c.class_id)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusToggle
                          isActive={teacher.is_active}
                          onToggle={() => handleToggleActive(teacher)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedTeacher(teacher);
                              setIsViewDialogOpen(true);
                            }}
                            title="Voir"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(teacher)}
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedTeacher(teacher);
                              setIsAssignDialogOpen(true);
                            }}
                            title="Assigner une classe"
                          >
                            <School className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Supprimer">
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer l'enseignant</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Êtes-vous sûr de vouloir supprimer {teacher.profile.first_name} {teacher.profile.last_name} ? Cette action est irréversible.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTeacher(teacher)}>
                                  Supprimer
                                </AlertDialogAction>
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

        {/* Assign Class Dialog */}
        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Assigner une classe à {selectedTeacher?.profile.first_name} {selectedTeacher?.profile.last_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Classe</Label>
                <Select value={assignmentData.classId} onValueChange={v => setAssignmentData({...assignmentData, classId: v})}>
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
                <Label>Matière enseignée dans cette classe</Label>
                <Select value={assignmentData.subjectId} onValueChange={v => setAssignmentData({...assignmentData, subjectId: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une matière" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.length > 0 ? (
                      subjects.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>Aucune matière disponible</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Spécialités de l'enseignant: {selectedTeacher?.specialties.map(s => s.subject_name).join(', ') || 'Aucune'}
                </p>
              </div>
              {classHasPP ? (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Cette classe a déjà un professeur principal</span>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={assignmentData.isPrincipal}
                    onCheckedChange={(checked) => setAssignmentData({...assignmentData, isPrincipal: !!checked})}
                  />
                  <span className="text-sm">Professeur principal de cette classe</span>
                </label>
              )}
              <Button onClick={handleAssignClass} className="w-full">Assigner</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Teacher Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Détails de l'enseignant</DialogTitle>
            </DialogHeader>
            {selectedTeacher && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Prénom</Label>
                    <p className="font-medium">{selectedTeacher.profile.first_name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Nom</Label>
                    <p className="font-medium">{selectedTeacher.profile.last_name}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedTeacher.profile.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Téléphone</Label>
                  <p className="font-medium">{selectedTeacher.profile.phone || "Non renseigné"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Matricule</Label>
                  <p className="font-medium">{selectedTeacher.employee_id || "Non renseigné"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Spécialités</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedTeacher.specialties.length > 0 ? (
                      selectedTeacher.specialties.map(s => (
                        <Badge key={s.subject_id} variant="secondary">{s.subject_name}</Badge>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">Aucune spécialité</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Classes assignées</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedTeacher.classes.length > 0 ? (
                      selectedTeacher.classes.map(c => (
                        <Badge key={`${c.class_id}-${c.subject_id}`} variant={c.is_principal ? "default" : "outline"}>
                          {c.class_name} - {c.subject_name} {c.is_principal && "(PP)"}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">Aucune classe</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Statut</Label>
                  <Badge variant={selectedTeacher.is_active ? "default" : "secondary"} className="mt-1">
                    {selectedTeacher.is_active ? "Actif" : "Inactif"}
                  </Badge>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Teacher Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier l'enseignant</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prénom</Label>
                  <Input 
                    value={editFormData.firstName} 
                    onChange={e => setEditFormData({...editFormData, firstName: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input 
                    value={editFormData.lastName} 
                    onChange={e => setEditFormData({...editFormData, lastName: e.target.value})} 
                  />
                </div>
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input 
                  value={editFormData.phone} 
                  onChange={e => setEditFormData({...editFormData, phone: e.target.value})} 
                />
              </div>
              <div>
                <Label>Matricule employé</Label>
                <Input 
                  value={editFormData.employeeId} 
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">Le matricule est généré automatiquement et ne peut pas être modifié</p>
              </div>
              <div>
                <Label>Spécialités (matières)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-md p-2">
                  {subjects.map(subject => (
                    <label key={subject.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={editSpecialties.includes(subject.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditSpecialties([...editSpecialties, subject.id]);
                          } else {
                            setEditSpecialties(editSpecialties.filter(id => id !== subject.id));
                          }
                        }}
                      />
                      {subject.name}
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
