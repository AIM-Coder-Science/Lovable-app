import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Pencil, Settings, Trash2 } from "lucide-react";
import { StatusToggle } from "@/components/ui/status-toggle";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Subject {
  id: string;
  name: string;
  coefficient: number;
  is_active: boolean;
}

interface LevelCoefficient {
  id: string;
  subject_id: string;
  level: string;
  coefficient: number;
}

const CLASS_LEVELS = ["6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale"];

const Matieres = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [levelCoefficients, setLevelCoefficients] = useState<LevelCoefficient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCoeffDialogOpen, setIsCoeffDialogOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    coefficient: "1",
  });
  
  const [coeffFormData, setCoeffFormData] = useState<Record<string, string>>({});

  const fetchSubjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .order('name');

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les matières", variant: "destructive" });
    } else {
      setSubjects(data || []);
    }
    setLoading(false);
  };

  const fetchLevelCoefficients = async () => {
    const { data } = await supabase
      .from('subject_level_coefficients')
      .select('*');
    setLevelCoefficients(data || []);
  };

  useEffect(() => {
    fetchSubjects();
    fetchLevelCoefficients();
  }, []);

  const handleCreateSubject = async () => {
    if (!formData.name) {
      toast({ title: "Erreur", description: "Veuillez entrer un nom", variant: "destructive" });
      return;
    }

    try {
      const { data: newSubject, error } = await supabase
        .from('subjects')
        .insert({
          name: formData.name,
          coefficient: parseInt(formData.coefficient) || 1,
        })
        .select()
        .single();

      if (error) throw error;

      // Create default coefficients for all levels
      const levelCoeffs = CLASS_LEVELS.map(level => ({
        subject_id: newSubject.id,
        level,
        coefficient: parseInt(formData.coefficient) || 1,
      }));

      await supabase.from('subject_level_coefficients').insert(levelCoeffs);

      toast({ title: "Succès", description: "Matière créée avec succès" });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", coefficient: "1" });
      fetchSubjects();
      fetchLevelCoefficients();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdateSubject = async () => {
    if (!selectedSubject || !formData.name) {
      toast({ title: "Erreur", description: "Veuillez entrer un nom", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from('subjects')
        .update({
          name: formData.name,
          coefficient: parseInt(formData.coefficient) || 1,
        })
        .eq('id', selectedSubject.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Matière modifiée avec succès" });
      setIsEditDialogOpen(false);
      setSelectedSubject(null);
      setFormData({ name: "", coefficient: "1" });
      fetchSubjects();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (subject: Subject) => {
    try {
      const { error } = await supabase
        .from('subjects')
        .update({ is_active: !subject.is_active })
        .eq('id', subject.id);

      if (error) throw error;

      toast({ title: "Succès", description: subject.is_active ? "Matière désactivée" : "Matière activée" });
      fetchSubjects();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteSubject = async (subject: Subject) => {
    try {
      // Delete level coefficients
      await supabase.from('subject_level_coefficients').delete().eq('subject_id', subject.id);
      // Delete teacher_specialties
      await supabase.from('teacher_specialties').delete().eq('subject_id', subject.id);
      // Delete teacher_classes
      await supabase.from('teacher_classes').delete().eq('subject_id', subject.id);
      // Delete subject
      await supabase.from('subjects').delete().eq('id', subject.id);

      toast({ title: "Succès", description: "Matière supprimée avec succès" });
      fetchSubjects();
      fetchLevelCoefficients();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const openCoefficientsDialog = (subject: Subject) => {
    setSelectedSubject(subject);
    // Load existing coefficients for this subject
    const subjectCoeffs = levelCoefficients.filter(c => c.subject_id === subject.id);
    const coeffData: Record<string, string> = {};
    CLASS_LEVELS.forEach(level => {
      const existing = subjectCoeffs.find(c => c.level === level);
      coeffData[level] = existing ? existing.coefficient.toString() : subject.coefficient.toString();
    });
    setCoeffFormData(coeffData);
    setIsCoeffDialogOpen(true);
  };

  const handleSaveCoefficients = async () => {
    if (!selectedSubject) return;

    try {
      // Delete existing coefficients for this subject
      await supabase
        .from('subject_level_coefficients')
        .delete()
        .eq('subject_id', selectedSubject.id);

      // Insert new coefficients
      const newCoeffs = CLASS_LEVELS.map(level => ({
        subject_id: selectedSubject.id,
        level,
        coefficient: parseInt(coeffFormData[level]) || 1,
      }));

      const { error } = await supabase
        .from('subject_level_coefficients')
        .insert(newCoeffs);

      if (error) throw error;

      toast({ title: "Succès", description: "Coefficients enregistrés" });
      setIsCoeffDialogOpen(false);
      setSelectedSubject(null);
      fetchLevelCoefficients();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const getCoefficientsDisplay = (subjectId: string) => {
    const coeffs = levelCoefficients.filter(c => c.subject_id === subjectId);
    if (coeffs.length === 0) return null;
    return coeffs.slice(0, 3).map(c => `${c.level}: x${c.coefficient}`).join(', ') + (coeffs.length > 3 ? '...' : '');
  };

  const filteredSubjects = subjects.filter(subject =>
    subject.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Matières</h1>
            <p className="text-muted-foreground">Gérez les matières enseignées avec coefficients par niveau</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nouvelle matière
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer une matière</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Nom de la matière *</Label>
                  <Input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: Mathématiques"
                  />
                </div>
                <div>
                  <Label>Coefficient par défaut</Label>
                  <Input 
                    type="number"
                    min="1"
                    max="10"
                    value={formData.coefficient} 
                    onChange={e => setFormData({...formData, coefficient: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Vous pourrez ajuster les coefficients par niveau après création
                  </p>
                </div>
                <Button onClick={handleCreateSubject} className="w-full">Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une matière..."
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
                  <TableHead>Matière</TableHead>
                  <TableHead>Coeff. par défaut</TableHead>
                  <TableHead>Coefficients par niveau</TableHead>
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
                ) : filteredSubjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucune matière trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubjects.map(subject => (
                    <TableRow key={subject.id}>
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">x{subject.coefficient}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">
                          {getCoefficientsDisplay(subject.id) || 'Non définis'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <StatusToggle
                          isActive={subject.is_active}
                          onToggle={() => handleToggleActive(subject)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openCoefficientsDialog(subject)}
                            title="Gérer les coefficients par niveau"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedSubject(subject);
                              setFormData({ name: subject.name, coefficient: subject.coefficient.toString() });
                              setIsEditDialogOpen(true);
                            }}
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Supprimer">
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer la matière</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Êtes-vous sûr de vouloir supprimer {subject.name} ? Cette action supprimera également les assignations et coefficients associés.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSubject(subject)}>
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

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier la matière</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Nom de la matière *</Label>
                <Input 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <Label>Coefficient par défaut</Label>
                <Input 
                  type="number"
                  min="1"
                  max="10"
                  value={formData.coefficient} 
                  onChange={e => setFormData({...formData, coefficient: e.target.value})}
                />
              </div>
              <Button onClick={handleUpdateSubject} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Coefficients by Level Dialog */}
        <Dialog open={isCoeffDialogOpen} onOpenChange={setIsCoeffDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Coefficients par niveau - {selectedSubject?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Définissez le coefficient de cette matière pour chaque niveau de classe
              </p>
              <div className="space-y-3">
                {CLASS_LEVELS.map(level => (
                  <div key={level} className="flex items-center justify-between gap-4">
                    <Label className="font-medium">{level}</Label>
                    <Input 
                      type="number"
                      min="1"
                      max="10"
                      className="w-24"
                      value={coeffFormData[level] || "1"} 
                      onChange={e => setCoeffFormData({...coeffFormData, [level]: e.target.value})}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={handleSaveCoefficients} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Matieres;