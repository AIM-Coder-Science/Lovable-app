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
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, UserCheck, Users, UserCog, Eye, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface ClassItem {
  id: string;
  name: string;
  level: string;
  academic_year: string;
  is_active: boolean;
  students_count: number;
  teachers: { id: string; name: string; subject: string; is_principal: boolean }[];
}

const LEVELS = ["6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale"];

const Classes = () => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditPrincipalOpen, setIsEditPrincipalOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [selectedPrincipalId, setSelectedPrincipalId] = useState<string>("");
  
  const [editFormData, setEditFormData] = useState({
    name: "",
    level: "",
    academicYear: "",
  });
  const [formData, setFormData] = useState({
    name: "",
    level: "",
    academicYear: "2024-2025",
  });

  const fetchClasses = async () => {
    setLoading(true);
    const { data: classesData, error } = await supabase
      .from('classes')
      .select('id, name, level, academic_year, is_active')
      .order('name');

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les classes", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Fetch additional data for each class
    const classesWithDetails = await Promise.all(
      (classesData || []).map(async (cls) => {
        // Count students
        const { count: studentsCount } = await supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', cls.id);

        // Get teachers
        const { data: teacherClasses } = await supabase
          .from('teacher_classes')
          .select(`
            teacher_id, is_principal, subject_id,
            teachers!teacher_classes_teacher_id_fkey (
              id,
              profiles!teachers_profile_id_fkey (first_name, last_name)
            ),
            subjects!teacher_classes_subject_id_fkey (name)
          `)
          .eq('class_id', cls.id);

        const teachers = (teacherClasses || []).map((tc: any) => ({
          id: tc.teacher_id,
          name: `${tc.teachers?.profiles?.first_name || ''} ${tc.teachers?.profiles?.last_name || ''}`.trim(),
          subject: tc.subjects?.name || '',
          is_principal: tc.is_principal,
        }));

        return {
          ...cls,
          students_count: studentsCount || 0,
          teachers,
        };
      })
    );

    setClasses(classesWithDetails);
    setLoading(false);
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleCreateClass = async () => {
    if (!formData.name || !formData.level) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs obligatoires", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from('classes')
        .insert({
          name: formData.name,
          level: formData.level,
          academic_year: formData.academicYear,
        });

      if (error) throw error;

      toast({ title: "Succès", description: "Classe créée avec succès" });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", level: "", academicYear: "2024-2025" });
      fetchClasses();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (cls: ClassItem) => {
    try {
      const { error } = await supabase
        .from('classes')
        .update({ is_active: !cls.is_active })
        .eq('id', cls.id);

      if (error) throw error;

      toast({ title: "Succès", description: cls.is_active ? "Classe désactivée" : "Classe activée" });
      fetchClasses();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleSetPrincipal = async () => {
    if (!selectedClass || !selectedPrincipalId) {
      toast({ title: "Erreur", description: "Veuillez sélectionner un professeur principal", variant: "destructive" });
      return;
    }

    try {
      // Remove current principal
      await supabase
        .from('teacher_classes')
        .update({ is_principal: false })
        .eq('class_id', selectedClass.id)
        .eq('is_principal', true);

      // Set new principal
      const { error } = await supabase
        .from('teacher_classes')
        .update({ is_principal: true })
        .eq('class_id', selectedClass.id)
        .eq('teacher_id', selectedPrincipalId);

      if (error) throw error;

      toast({ title: "Succès", description: "Professeur principal défini avec succès" });
      setIsEditPrincipalOpen(false);
      setSelectedClass(null);
      setSelectedPrincipalId("");
      fetchClasses();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteClass = async (cls: ClassItem) => {
    try {
      // Check if class has students
      if (cls.students_count > 0) {
        toast({ title: "Erreur", description: "Impossible de supprimer une classe avec des élèves", variant: "destructive" });
        return;
      }
      // Delete teacher_classes
      await supabase.from('teacher_classes').delete().eq('class_id', cls.id);
      // Delete class
      await supabase.from('classes').delete().eq('id', cls.id);

      toast({ title: "Succès", description: "Classe supprimée avec succès" });
      fetchClasses();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleEditClass = async () => {
    if (!selectedClass || !editFormData.name || !editFormData.level) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from('classes')
        .update({
          name: editFormData.name,
          level: editFormData.level,
          academic_year: editFormData.academicYear,
        })
        .eq('id', selectedClass.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Classe modifiée avec succès" });
      setIsEditDialogOpen(false);
      fetchClasses();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const openEditDialog = (cls: ClassItem) => {
    setSelectedClass(cls);
    setEditFormData({
      name: cls.name,
      level: cls.level,
      academicYear: cls.academic_year,
    });
    setIsEditDialogOpen(true);
  };

  const filteredClasses = classes.filter(cls =>
    `${cls.name} ${cls.level}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Classes</h1>
            <p className="text-muted-foreground">Gérez les classes de l'établissement</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nouvelle classe
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer une classe</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Nom de la classe *</Label>
                  <Input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: 3ème A"
                  />
                </div>
                <div>
                  <Label>Niveau *</Label>
                  <Select value={formData.level} onValueChange={v => setFormData({...formData, level: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un niveau" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map(level => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Année scolaire</Label>
                  <Input 
                    value={formData.academicYear} 
                    onChange={e => setFormData({...formData, academicYear: e.target.value})}
                  />
                </div>
                <Button onClick={handleCreateClass} className="w-full">Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une classe..."
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
                  <TableHead>Classe</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>Élèves</TableHead>
                  <TableHead>Professeur Principal</TableHead>
                  <TableHead>Enseignants</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Chargement...
                    </TableCell>
                  </TableRow>
                ) : filteredClasses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucune classe trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClasses.map(cls => {
                    const principal = cls.teachers.find(t => t.is_principal);
                    return (
                      <TableRow key={cls.id}>
                        <TableCell className="font-medium">{cls.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{cls.level}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            {cls.students_count}
                          </div>
                        </TableCell>
                        <TableCell>
                          {principal ? (
                            <Badge variant="default">{principal.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Non défini</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {cls.teachers.filter(t => !t.is_principal).slice(0, 3).map(t => (
                              <Badge key={t.id} variant="secondary" className="text-xs">
                                {t.name}
                              </Badge>
                            ))}
                            {cls.teachers.length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{cls.teachers.length - 4}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cls.is_active ? "default" : "secondary"}>
                            {cls.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedClass(cls);
                                setIsViewDialogOpen(true);
                              }}
                              title="Voir"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(cls)}
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedClass(cls);
                                setSelectedPrincipalId(principal?.id || "");
                                setIsEditPrincipalOpen(true);
                              }}
                              title="Définir le professeur principal"
                              disabled={cls.teachers.length === 0}
                            >
                              <UserCog className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" title="Supprimer" disabled={cls.students_count > 0}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Supprimer la classe</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Êtes-vous sûr de vouloir supprimer la classe {cls.name} ? Cette action est irréversible.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteClass(cls)}>
                                    Supprimer
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Principal Dialog */}
        <Dialog open={isEditPrincipalOpen} onOpenChange={setIsEditPrincipalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Définir le professeur principal - {selectedClass?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Professeur principal</Label>
                <Select value={selectedPrincipalId} onValueChange={setSelectedPrincipalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un enseignant" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedClass?.teachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.subject})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  Seuls les enseignants assignés à cette classe peuvent être professeur principal.
                </p>
              </div>
              <Button onClick={handleSetPrincipal} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Class Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Détails de la classe</DialogTitle>
            </DialogHeader>
            {selectedClass && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Nom</Label>
                    <p className="font-medium">{selectedClass.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Niveau</Label>
                    <Badge variant="outline">{selectedClass.level}</Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Année scolaire</Label>
                  <p className="font-medium">{selectedClass.academic_year}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Nombre d'élèves</Label>
                  <p className="font-medium">{selectedClass.students_count}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Professeur principal</Label>
                  <p className="font-medium">
                    {selectedClass.teachers.find(t => t.is_principal)?.name || "Non défini"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Enseignants</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedClass.teachers.length > 0 ? (
                      selectedClass.teachers.map(t => (
                        <Badge key={t.id} variant="secondary">
                          {t.name} ({t.subject})
                        </Badge>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">Aucun enseignant</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Statut</Label>
                  <Badge variant={selectedClass.is_active ? "default" : "secondary"} className="mt-1">
                    {selectedClass.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Class Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier la classe</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Nom de la classe</Label>
                <Input 
                  value={editFormData.name} 
                  onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                />
              </div>
              <div>
                <Label>Niveau</Label>
                <Select value={editFormData.level} onValueChange={v => setEditFormData({...editFormData, level: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(level => (
                      <SelectItem key={level} value={level}>{level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Année scolaire</Label>
                <Input 
                  value={editFormData.academicYear} 
                  onChange={e => setEditFormData({...editFormData, academicYear: e.target.value})}
                />
              </div>
              <Button onClick={handleEditClass} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Classes;
