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
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, UserCheck, School, Eye, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Student {
  id: string;
  user_id: string;
  profile_id: string;
  matricule: string;
  class_id: string | null;
  birthday: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  is_active: boolean;
  profile: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
  class: {
    name: string;
    level: string;
  } | null;
}

interface Class {
  id: string;
  name: string;
  level: string;
}

const Apprenants = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  const [editFormData, setEditFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    matricule: "",
    birthday: "",
    parentName: "",
    parentPhone: "",
  });
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    matricule: "",
    birthday: "",
    parentName: "",
    parentPhone: "",
    classId: "",
  });

  const fetchStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select(`
        id, user_id, profile_id, matricule, class_id, birthday, parent_name, parent_phone, is_active,
        profiles!students_profile_id_fkey (first_name, last_name, email, phone),
        classes (name, level)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les apprenants", variant: "destructive" });
      setLoading(false);
      return;
    }

    const formattedData = (data || []).map((s: any) => ({
      ...s,
      profile: s.profiles,
      class: s.classes,
    }));

    setStudents(formattedData);
    setLoading(false);
  };

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name, level')
      .eq('is_active', true)
      .order('name');
    if (data) setClasses(data);
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const handleCreateStudent = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.matricule) {
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
          userType: 'student',
          matricule: formData.matricule,
          classId: formData.classId || null,
          birthday: formData.birthday || null,
          parentName: formData.parentName || null,
          parentPhone: formData.parentPhone || null,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ 
        title: "Apprenant créé", 
        description: `Mot de passe généré: ${data.generatedPassword}. Notez-le car il ne sera plus affiché.`,
      });
      setIsCreateDialogOpen(false);
      resetForm();
      fetchStudents();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleAssignClass = async () => {
    if (!selectedStudent) return;

    try {
      const { error } = await supabase
        .from('students')
        .update({ class_id: formData.classId || null })
        .eq('id', selectedStudent.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Classe assignée avec succès" });
      setIsAssignDialogOpen(false);
      setSelectedStudent(null);
      setFormData(prev => ({ ...prev, classId: "" }));
      fetchStudents();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (student: Student) => {
    try {
      const { error } = await supabase
        .from('students')
        .update({ is_active: !student.is_active })
        .eq('id', student.id);

      if (error) throw error;

      await supabase
        .from('profiles')
        .update({ is_active: !student.is_active })
        .eq('id', student.profile_id);

      toast({ title: "Succès", description: student.is_active ? "Apprenant désactivé" : "Apprenant activé" });
      fetchStudents();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    try {
      // Delete grades
      await supabase.from('grades').delete().eq('student_id', student.id);
      // Delete bulletins
      await supabase.from('bulletins').delete().eq('student_id', student.id);
      // Delete student
      await supabase.from('students').delete().eq('id', student.id);
      // Delete profile
      await supabase.from('profiles').delete().eq('id', student.profile_id);

      toast({ title: "Succès", description: "Apprenant supprimé avec succès" });
      fetchStudents();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleEditStudent = async () => {
    if (!selectedStudent) return;

    try {
      // Update profile
      await supabase
        .from('profiles')
        .update({
          first_name: editFormData.firstName,
          last_name: editFormData.lastName,
          phone: editFormData.phone || null,
        })
        .eq('id', selectedStudent.profile_id);

      // Update student
      await supabase
        .from('students')
        .update({
          matricule: editFormData.matricule,
          birthday: editFormData.birthday || null,
          parent_name: editFormData.parentName || null,
          parent_phone: editFormData.parentPhone || null,
        })
        .eq('id', selectedStudent.id);

      toast({ title: "Succès", description: "Apprenant modifié avec succès" });
      setIsEditDialogOpen(false);
      fetchStudents();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const openEditDialog = (student: Student) => {
    setSelectedStudent(student);
    setEditFormData({
      firstName: student.profile.first_name,
      lastName: student.profile.last_name,
      phone: student.profile.phone || "",
      matricule: student.matricule,
      birthday: student.birthday || "",
      parentName: student.parent_name || "",
      parentPhone: student.parent_phone || "",
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      matricule: "",
      birthday: "",
      parentName: "",
      parentPhone: "",
      classId: "",
    });
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = `${student.profile.first_name} ${student.profile.last_name} ${student.matricule}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesClass = filterClass === "all" || student.class_id === filterClass;
    return matchesSearch && matchesClass;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Apprenants</h1>
            <p className="text-muted-foreground">Gérez les apprenants de l'établissement</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nouvel apprenant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Créer un apprenant</DialogTitle>
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
                  <Label>Mot de passe *</Label>
                  <Input 
                    type="password" 
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Matricule *</Label>
                  <Input 
                    value={formData.matricule} 
                    onChange={e => setFormData({...formData, matricule: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Date de naissance</Label>
                  <Input 
                    type="date" 
                    value={formData.birthday} 
                    onChange={e => setFormData({...formData, birthday: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Classe</Label>
                  <Select value={formData.classId} onValueChange={v => setFormData({...formData, classId: v})}>
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
                  <Label>Nom du parent</Label>
                  <Input 
                    value={formData.parentName} 
                    onChange={e => setFormData({...formData, parentName: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Téléphone du parent</Label>
                  <Input 
                    value={formData.parentPhone} 
                    onChange={e => setFormData({...formData, parentPhone: e.target.value})} 
                  />
                </div>
                <Button onClick={handleCreateStudent} className="w-full">Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un apprenant..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrer par classe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              {classes.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="table-header">
                  <TableHead>Apprenant</TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Chargement...
                    </TableCell>
                  </TableRow>
                ) : filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucun apprenant trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map(student => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{student.profile.first_name} {student.profile.last_name}</p>
                          <p className="text-sm text-muted-foreground">{student.profile.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{student.matricule}</Badge>
                      </TableCell>
                      <TableCell>
                        {student.class ? (
                          <Badge>{student.class.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Non assigné</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.parent_name && (
                          <div>
                            <p className="text-sm">{student.parent_name}</p>
                            {student.parent_phone && (
                              <p className="text-xs text-muted-foreground">{student.parent_phone}</p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={student.is_active ? "default" : "secondary"}>
                          {student.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedStudent(student);
                              setIsViewDialogOpen(true);
                            }}
                            title="Voir"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(student)}
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedStudent(student);
                              setFormData(prev => ({ ...prev, classId: student.class_id || "" }));
                              setIsAssignDialogOpen(true);
                            }}
                            title="Changer de classe"
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
                                <AlertDialogTitle>Supprimer l'apprenant</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Êtes-vous sûr de vouloir supprimer {student.profile.first_name} {student.profile.last_name} ? Cette action est irréversible et supprimera toutes ses notes et bulletins.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteStudent(student)}>
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
                Assigner une classe à {selectedStudent?.profile.first_name} {selectedStudent?.profile.last_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Classe</Label>
                <Select value={formData.classId} onValueChange={v => setFormData({...formData, classId: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une classe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucune classe</SelectItem>
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} ({c.level})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAssignClass} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Student Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Détails de l'apprenant</DialogTitle>
            </DialogHeader>
            {selectedStudent && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Prénom</Label>
                    <p className="font-medium">{selectedStudent.profile.first_name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Nom</Label>
                    <p className="font-medium">{selectedStudent.profile.last_name}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedStudent.profile.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Matricule</Label>
                  <p className="font-medium">{selectedStudent.matricule}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date de naissance</Label>
                  <p className="font-medium">{selectedStudent.birthday || "Non renseignée"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Classe</Label>
                  <p className="font-medium">{selectedStudent.class?.name || "Non assigné"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Parent</Label>
                  <p className="font-medium">{selectedStudent.parent_name || "Non renseigné"}</p>
                  <p className="text-sm text-muted-foreground">{selectedStudent.parent_phone || ""}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Statut</Label>
                  <Badge variant={selectedStudent.is_active ? "default" : "secondary"} className="mt-1">
                    {selectedStudent.is_active ? "Actif" : "Inactif"}
                  </Badge>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Student Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Modifier l'apprenant</DialogTitle>
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
                <Label>Matricule</Label>
                <Input 
                  value={editFormData.matricule} 
                  onChange={e => setEditFormData({...editFormData, matricule: e.target.value})} 
                />
              </div>
              <div>
                <Label>Date de naissance</Label>
                <Input 
                  type="date" 
                  value={editFormData.birthday} 
                  onChange={e => setEditFormData({...editFormData, birthday: e.target.value})} 
                />
              </div>
              <div>
                <Label>Nom du parent</Label>
                <Input 
                  value={editFormData.parentName} 
                  onChange={e => setEditFormData({...editFormData, parentName: e.target.value})} 
                />
              </div>
              <div>
                <Label>Téléphone du parent</Label>
                <Input 
                  value={editFormData.parentPhone} 
                  onChange={e => setEditFormData({...editFormData, parentPhone: e.target.value})} 
                />
              </div>
              <Button onClick={handleEditStudent} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Apprenants;
