import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  Calculator, Save, Award, Users, TrendingUp, Target, 
  ChevronLeft, ChevronRight, FileText, CheckCircle2, 
  AlertCircle, BarChart3, Medal, Star
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Student {
  id: string;
  matricule: string;
  profile: { first_name: string; last_name: string };
}

interface GradeDetail {
  grade_type: string;
  value: number;
}

interface SubjectGrade {
  subject_id: string;
  subject_name: string;
  coefficient: number;
  grades: GradeDetail[];
  average: number | null;
  weightedAverage: number | null;
}

interface StudentWithGrades {
  student: Student;
  subjectGrades: SubjectGrade[];
  generalAverage: number | null;
  weightedTotal: number | null;
  totalCoefficient: number;
  rank: number | null;
  bulletin?: {
    id: string;
    teacher_appreciation: string | null;
    principal_appreciation: string | null;
  };
}

interface PrincipalClass {
  class_id: string;
  class_name: string;
  class_level: string;
}

const PERIODS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];

const Appreciations = () => {
  const { teacherId, loading: authLoading } = useAuth();
  const [principalClasses, setPrincipalClasses] = useState<PrincipalClass[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string; coefficient: number }[]>([]);
  const [studentsWithGrades, setStudentsWithGrades] = useState<StudentWithGrades[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("Trimestre 1");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [appreciation, setAppreciation] = useState<string>("");

  // Fetch principal classes
  const fetchPrincipalClasses = async () => {
    if (!teacherId) return;

    const { data, error } = await supabase
      .from('teacher_classes')
      .select(`
        class_id,
        classes (name, level)
      `)
      .eq('teacher_id', teacherId)
      .eq('is_principal', true);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger vos classes", variant: "destructive" });
      return;
    }

    const formattedData = (data || []).map((tc: any) => ({
      class_id: tc.class_id,
      class_name: tc.classes?.name || '',
      class_level: tc.classes?.level || '',
    }));

    setPrincipalClasses(formattedData);
    if (formattedData.length > 0) {
      setSelectedClassId(formattedData[0].class_id);
    }
  };

  // Fetch subjects with level-specific coefficients
  const fetchSubjects = async () => {
    const { data } = await supabase
      .from('subjects')
      .select('id, name, coefficient')
      .eq('is_active', true)
      .order('name');
    if (data) setSubjects(data);
  };

  // Fetch students, grades, and bulletins
  const fetchStudentsAndGrades = async () => {
    if (!selectedClassId) return;

    setLoading(true);

    const selectedClass = principalClasses.find(pc => pc.class_id === selectedClassId);

    // Fetch level-specific coefficients
    const { data: levelCoeffs } = await supabase
      .from('subject_level_coefficients')
      .select('*')
      .eq('level', selectedClass?.class_level || '');

    const coeffMap = new Map<string, number>();
    levelCoeffs?.forEach((lc: any) => {
      coeffMap.set(lc.subject_id, lc.coefficient);
    });

    // Fetch students
    const { data: studentsData, error: studentsError } = await supabase
      .from('students')
      .select(`
        id, matricule,
        profiles!students_profile_id_fkey (first_name, last_name)
      `)
      .eq('class_id', selectedClassId)
      .eq('is_active', true)
      .order('matricule');

    if (studentsError) {
      toast({ title: "Erreur", description: "Impossible de charger les élèves", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Fetch all grades for this class and period
    const { data: gradesData } = await supabase
      .from('grades')
      .select('student_id, subject_id, value, max_value, coefficient, grade_type')
      .eq('class_id', selectedClassId)
      .eq('period', selectedPeriod);

    // Fetch existing bulletins
    const { data: bulletinsData } = await supabase
      .from('bulletins')
      .select('id, student_id, teacher_appreciation, principal_appreciation, average, rank')
      .eq('class_id', selectedClassId)
      .eq('period', selectedPeriod);

    const bulletinsMap = new Map((bulletinsData || []).map(b => [b.student_id, b]));

    // Calculate averages for each student
    const studentsWithCalculations: StudentWithGrades[] = (studentsData || []).map((s: any) => {
      const student = {
        id: s.id,
        matricule: s.matricule,
        profile: s.profiles,
      };

      const studentGrades = (gradesData || []).filter(g => g.student_id === s.id);
      
      // Group by subject and calculate subject averages
      const subjectGradesMap = new Map<string, { grades: GradeDetail[], total: number, count: number }>();
      
      studentGrades.forEach(g => {
        const normalized = (g.value / g.max_value) * 20;
        const current = subjectGradesMap.get(g.subject_id) || { grades: [], total: 0, count: 0 };
        current.grades.push({ grade_type: g.grade_type, value: normalized });
        current.total += normalized;
        current.count += 1;
        subjectGradesMap.set(g.subject_id, current);
      });

      let weightedTotal = 0;
      let totalCoefficient = 0;

      const subjectGrades: SubjectGrade[] = subjects.map(subject => {
        const gradeData = subjectGradesMap.get(subject.id);
        const levelCoeff = coeffMap.get(subject.id) ?? subject.coefficient;
        const average = gradeData && gradeData.count > 0 
          ? gradeData.total / gradeData.count 
          : null;
        
        const weightedAverage = average !== null ? average * levelCoeff : null;
        
        if (average !== null) {
          weightedTotal += average * levelCoeff;
          totalCoefficient += levelCoeff;
        }

        return {
          subject_id: subject.id,
          subject_name: subject.name,
          coefficient: levelCoeff,
          grades: gradeData?.grades || [],
          average,
          weightedAverage,
        };
      });

      const generalAverage = totalCoefficient > 0 ? weightedTotal / totalCoefficient : null;
      const bulletin = bulletinsMap.get(s.id);

      return {
        student,
        subjectGrades,
        generalAverage,
        weightedTotal,
        totalCoefficient,
        rank: null,
        bulletin: bulletin ? { 
          id: bulletin.id, 
          teacher_appreciation: bulletin.teacher_appreciation,
          principal_appreciation: bulletin.principal_appreciation
        } : undefined,
      };
    });

    // Sort by general average and assign ranks
    const sortedStudents = [...studentsWithCalculations]
      .filter(s => s.generalAverage !== null)
      .sort((a, b) => (b.generalAverage || 0) - (a.generalAverage || 0));

    let currentRank = 1;
    sortedStudents.forEach((s, index) => {
      if (index > 0 && sortedStudents[index - 1].generalAverage === s.generalAverage) {
        s.rank = sortedStudents[index - 1].rank;
      } else {
        s.rank = currentRank;
      }
      currentRank++;
    });

    // Apply ranks to original list
    studentsWithCalculations.forEach(s => {
      const ranked = sortedStudents.find(rs => rs.student.id === s.student.id);
      if (ranked) s.rank = ranked.rank;
    });

    setStudentsWithGrades(studentsWithCalculations);

    // Select first student if none selected
    if (!selectedStudentId && studentsWithCalculations.length > 0) {
      const firstStudent = studentsWithCalculations[0];
      setSelectedStudentId(firstStudent.student.id);
      setAppreciation(firstStudent.bulletin?.teacher_appreciation || '');
    }

    setLoading(false);
  };

  useEffect(() => {
    if (teacherId) {
      fetchPrincipalClasses();
      fetchSubjects();
    }
  }, [teacherId]);

  useEffect(() => {
    fetchStudentsAndGrades();
  }, [selectedClassId, selectedPeriod, subjects, principalClasses]);

  useEffect(() => {
    const student = studentsWithGrades.find(s => s.student.id === selectedStudentId);
    if (student) {
      setAppreciation(student.bulletin?.teacher_appreciation || '');
    }
  }, [selectedStudentId, studentsWithGrades]);

  // Get selected student data
  const selectedStudent = useMemo(() => {
    return studentsWithGrades.find(s => s.student.id === selectedStudentId);
  }, [studentsWithGrades, selectedStudentId]);

  // Calculate class statistics
  const classStats = useMemo(() => {
    const withAvg = studentsWithGrades.filter(s => s.generalAverage !== null);
    const aboveAvg = withAvg.filter(s => s.generalAverage! >= 10);
    const classAverage = withAvg.length > 0 
      ? withAvg.reduce((sum, s) => sum + (s.generalAverage || 0), 0) / withAvg.length 
      : 0;
    const maxAvg = withAvg.length > 0 ? Math.max(...withAvg.map(s => s.generalAverage!)) : 0;
    const minAvg = withAvg.length > 0 ? Math.min(...withAvg.map(s => s.generalAverage!)) : 0;

    return {
      totalStudents: studentsWithGrades.length,
      studentsWithGrades: withAvg.length,
      aboveAverageCount: aboveAvg.length,
      successRate: withAvg.length > 0 ? (aboveAvg.length / withAvg.length) * 100 : 0,
      classAverage,
      maxAverage: maxAvg,
      minAverage: minAvg,
    };
  }, [studentsWithGrades]);

  // Navigate between students
  const navigateStudent = (direction: 'prev' | 'next') => {
    const currentIndex = studentsWithGrades.findIndex(s => s.student.id === selectedStudentId);
    if (direction === 'prev' && currentIndex > 0) {
      setSelectedStudentId(studentsWithGrades[currentIndex - 1].student.id);
    } else if (direction === 'next' && currentIndex < studentsWithGrades.length - 1) {
      setSelectedStudentId(studentsWithGrades[currentIndex + 1].student.id);
    }
  };

  // Save appreciation
  const handleSaveAppreciation = async () => {
    if (!selectedStudent) return;
    setSaving(true);

    try {
      if (selectedStudent.bulletin?.id) {
        const { error } = await supabase
          .from('bulletins')
          .update({ 
            teacher_appreciation: appreciation,
            average: selectedStudent.generalAverage,
            rank: selectedStudent.rank,
            total_students: studentsWithGrades.length,
          })
          .eq('id', selectedStudent.bulletin.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bulletins')
          .insert({
            student_id: selectedStudentId,
            class_id: selectedClassId,
            period: selectedPeriod,
            teacher_appreciation: appreciation,
            average: selectedStudent.generalAverage,
            rank: selectedStudent.rank,
            total_students: studentsWithGrades.length,
          });

        if (error) throw error;
      }

      toast({ title: "Succès", description: "Bulletin enregistré avec succès" });
      fetchStudentsAndGrades();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Save all bulletins
  const handleSaveAllBulletins = async () => {
    setSaving(true);

    try {
      for (const studentData of studentsWithGrades) {
        if (studentData.bulletin?.id) {
          await supabase
            .from('bulletins')
            .update({ 
              average: studentData.generalAverage,
              rank: studentData.rank,
              total_students: studentsWithGrades.length,
            })
            .eq('id', studentData.bulletin.id);
        } else {
          await supabase
            .from('bulletins')
            .insert({
              student_id: studentData.student.id,
              class_id: selectedClassId,
              period: selectedPeriod,
              average: studentData.generalAverage,
              rank: studentData.rank,
              total_students: studentsWithGrades.length,
            });
        }
      }

      toast({ title: "Succès", description: "Tous les bulletins ont été générés" });
      fetchStudentsAndGrades();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getGradeColor = (value: number | null) => {
    if (value === null) return 'text-muted-foreground';
    if (value >= 16) return 'text-emerald-600 dark:text-emerald-400';
    if (value >= 14) return 'text-green-600 dark:text-green-400';
    if (value >= 10) return 'text-blue-600 dark:text-blue-400';
    if (value >= 8) return 'text-orange-600 dark:text-orange-400';
    return 'text-destructive';
  };

  const getGradeBg = (value: number | null) => {
    if (value === null) return 'bg-muted';
    if (value >= 16) return 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300';
    if (value >= 14) return 'bg-green-100 dark:bg-green-900/30 border-green-300';
    if (value >= 10) return 'bg-blue-100 dark:bg-blue-900/30 border-blue-300';
    if (value >= 8) return 'bg-orange-100 dark:bg-orange-900/30 border-orange-300';
    return 'bg-red-100 dark:bg-red-900/30 border-red-300';
  };

  const getRankBadge = (rank: number | null, total: number) => {
    if (rank === null) return null;
    if (rank === 1) return <Medal className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return null;
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (principalClasses.length === 0 && !authLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Award className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground">Accès réservé</h2>
          <p className="text-muted-foreground mt-2">
            Cette page est réservée aux professeurs principaux.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const currentStudentIndex = studentsWithGrades.findIndex(s => s.student.id === selectedStudentId);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Bulletins & Appréciations</h1>
            <p className="text-muted-foreground">Gérez les bulletins et appréciations de vos élèves</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleSaveAllBulletins} 
              disabled={saving}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              Générer tous les bulletins
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Classe</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Sélectionner une classe" />
                  </SelectTrigger>
                  <SelectContent>
                    {principalClasses.map(pc => (
                      <SelectItem key={pc.class_id} value={pc.class_id}>
                        {pc.class_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Période</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODS.map(period => (
                      <SelectItem key={period} value={period}>{period}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Élève</Label>
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Sélectionner un élève" />
                  </SelectTrigger>
                  <SelectContent>
                    {studentsWithGrades.map(({ student, rank, generalAverage }) => (
                      <SelectItem key={student.id} value={student.id}>
                        <div className="flex items-center gap-2">
                          {rank && <span className="text-xs text-muted-foreground">#{rank}</span>}
                          <span>{student.profile.first_name} {student.profile.last_name}</span>
                          {generalAverage !== null && (
                            <span className={`text-xs font-medium ${getGradeColor(generalAverage)}`}>
                              ({generalAverage.toFixed(2)})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Class Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{classStats.totalStudents}</p>
                  <p className="text-xs text-muted-foreground">Élèves</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{classStats.classAverage.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Moy. classe</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{classStats.maxAverage.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Meilleure</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{classStats.minAverage.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Plus faible</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{classStats.aboveAverageCount}</p>
                  <p className="text-xs text-muted-foreground">≥ 10/20</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Target className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{classStats.successRate.toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">Réussite</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">Chargement des données...</p>
            </CardContent>
          </Card>
        ) : selectedStudent ? (
          <>
            {/* Student Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => navigateStudent('prev')}
                disabled={currentStudentIndex <= 0}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </Button>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Élève {currentStudentIndex + 1} sur {studentsWithGrades.length}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigateStudent('next')}
                disabled={currentStudentIndex >= studentsWithGrades.length - 1}
                className="gap-2"
              >
                Suivant
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Student Info Card */}
            <Card className="glass-card border-2 border-primary/20">
              <CardHeader className="pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-2xl font-bold text-primary-foreground">
                      {selectedStudent.student.profile.first_name.charAt(0)}
                      {selectedStudent.student.profile.last_name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-2xl">
                        {selectedStudent.student.profile.first_name} {selectedStudent.student.profile.last_name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <span>Matricule: {selectedStudent.student.matricule}</span>
                        <span>•</span>
                        <span>{principalClasses.find(pc => pc.class_id === selectedClassId)?.class_name}</span>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="flex items-center gap-2">
                        {getRankBadge(selectedStudent.rank, studentsWithGrades.length)}
                        <span className="text-3xl font-bold text-primary">
                          {selectedStudent.rank || '-'}
                        </span>
                        <span className="text-lg text-muted-foreground">/{studentsWithGrades.filter(s => s.generalAverage !== null).length}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Rang</p>
                    </div>
                    <div className={`text-center px-4 py-2 rounded-xl ${getGradeBg(selectedStudent.generalAverage)} border`}>
                      <p className={`text-3xl font-bold ${getGradeColor(selectedStudent.generalAverage)}`}>
                        {selectedStudent.generalAverage?.toFixed(2) || '-'}
                      </p>
                      <p className="text-sm text-muted-foreground">Moyenne Générale</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Grades Table */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Récapitulatif des Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="w-full">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Matière</TableHead>
                        <TableHead className="text-center font-semibold">Coef.</TableHead>
                        <TableHead className="text-center font-semibold">I1</TableHead>
                        <TableHead className="text-center font-semibold">I2</TableHead>
                        <TableHead className="text-center font-semibold">I3</TableHead>
                        <TableHead className="text-center font-semibold">I4</TableHead>
                        <TableHead className="text-center font-semibold">I5</TableHead>
                        <TableHead className="text-center font-semibold">D1</TableHead>
                        <TableHead className="text-center font-semibold">D2</TableHead>
                        <TableHead className="text-center font-semibold">D3</TableHead>
                        <TableHead className="text-center font-semibold bg-primary/10">Moyenne</TableHead>
                        <TableHead className="text-center font-semibold bg-primary/10">Moy. Coef.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedStudent.subjectGrades.map((sg) => {
                        const getGradeValue = (type: string, index: number) => {
                          const grade = sg.grades.find(g => g.grade_type === `${type}_${index + 1}`);
                          return grade ? grade.value : null;
                        };

                        return (
                          <TableRow key={sg.subject_id} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{sg.subject_name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{sg.coefficient}</Badge>
                            </TableCell>
                            {[0, 1, 2, 3, 4].map(i => {
                              const val = getGradeValue('interro', i);
                              return (
                                <TableCell key={`i${i}`} className="text-center">
                                  <span className={`font-medium ${getGradeColor(val)}`}>
                                    {val !== null ? val.toFixed(1) : '-'}
                                  </span>
                                </TableCell>
                              );
                            })}
                            {[0, 1, 2].map(i => {
                              const val = getGradeValue('devoir', i);
                              return (
                                <TableCell key={`d${i}`} className="text-center">
                                  <span className={`font-medium ${getGradeColor(val)}`}>
                                    {val !== null ? val.toFixed(1) : '-'}
                                  </span>
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center bg-primary/5">
                              <span className={`font-bold ${getGradeColor(sg.average)}`}>
                                {sg.average !== null ? sg.average.toFixed(2) : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-center bg-primary/5">
                              <span className={`font-bold ${getGradeColor(sg.average)}`}>
                                {sg.weightedAverage !== null ? sg.weightedAverage.toFixed(2) : '-'}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Total Row */}
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-center">{selectedStudent.totalCoefficient}</TableCell>
                        <TableCell colSpan={8}></TableCell>
                        <TableCell className={`text-center text-lg ${getGradeColor(selectedStudent.generalAverage)}`}>
                          {selectedStudent.generalAverage?.toFixed(2) || '-'}
                        </TableCell>
                        <TableCell className={`text-center text-lg ${getGradeColor(selectedStudent.generalAverage)}`}>
                          {selectedStudent.weightedTotal?.toFixed(2) || '-'}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Student Performance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-card">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Star className="w-5 h-5 text-yellow-500" />
                    <span className="font-medium">Position vs Classe</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rang</span>
                      <span className="font-medium">{selectedStudent.rank || '-'} / {studentsWithGrades.filter(s => s.generalAverage !== null).length}</span>
                    </div>
                    <Progress 
                      value={selectedStudent.rank ? 100 - ((selectedStudent.rank - 1) / studentsWithGrades.filter(s => s.generalAverage !== null).length * 100) : 0} 
                      className="h-2" 
                    />
                    <p className="text-xs text-muted-foreground">
                      {selectedStudent.rank && selectedStudent.rank <= 3 
                        ? "Excellent! Dans le top 3 de la classe" 
                        : selectedStudent.rank && selectedStudent.rank <= studentsWithGrades.length / 2
                          ? "Bien! Dans la première moitié"
                          : "Peut mieux faire"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    <span className="font-medium">Comparaison</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Élève</span>
                      <span className={`font-medium ${getGradeColor(selectedStudent.generalAverage)}`}>
                        {selectedStudent.generalAverage?.toFixed(2) || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Moyenne classe</span>
                      <span className="font-medium">{classStats.classAverage.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Écart</span>
                      <span className={`font-medium ${
                        selectedStudent.generalAverage && selectedStudent.generalAverage >= classStats.classAverage 
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {selectedStudent.generalAverage 
                          ? (selectedStudent.generalAverage - classStats.classAverage > 0 ? '+' : '') + 
                            (selectedStudent.generalAverage - classStats.classAverage).toFixed(2)
                          : '-'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    <span className="font-medium">Matières notées</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Avec notes</span>
                      <span className="font-medium">
                        {selectedStudent.subjectGrades.filter(sg => sg.average !== null).length} / {selectedStudent.subjectGrades.length}
                      </span>
                    </div>
                    <Progress 
                      value={(selectedStudent.subjectGrades.filter(sg => sg.average !== null).length / selectedStudent.subjectGrades.length) * 100} 
                      className="h-2" 
                    />
                    <p className="text-xs text-muted-foreground">
                      {selectedStudent.subjectGrades.filter(sg => sg.average !== null).length === selectedStudent.subjectGrades.length
                        ? "Toutes les matières ont des notes"
                        : `${selectedStudent.subjectGrades.length - selectedStudent.subjectGrades.filter(sg => sg.average !== null).length} matière(s) sans notes`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Appreciation */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Appréciation du Professeur Principal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={appreciation}
                  onChange={(e) => setAppreciation(e.target.value)}
                  placeholder="Rédigez l'appréciation pour cet élève... (Comportement, progression, conseils, encouragements...)"
                  className="min-h-[120px] text-base"
                />
                <div className="flex justify-end gap-2">
                  <Button 
                    onClick={handleSaveAppreciation} 
                    disabled={saving}
                    className="gap-2"
                    size="lg"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Enregistrement...' : 'Enregistrer le bulletin'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucun élève dans cette classe</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Appreciations;
