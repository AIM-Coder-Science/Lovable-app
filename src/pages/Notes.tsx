import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BookOpen, Users, TrendingUp, Award, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface Student {
  id: string;
  matricule: string;
  profile: { first_name: string; last_name: string };
}

interface TeacherClass {
  class_id: string;
  subject_id: string;
  class_name: string;
  class_level: string;
  subject_name: string;
  subject_coefficient: number;
}

interface StudentGrades {
  interros: (number | null)[];
  devoirs: (number | null)[];
  exam: number | null;
}

interface GradeEntry {
  id?: string;
  student_id: string;
  value: number;
  grade_type: string;
  grade_index: number;
}

const PERIODS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
const MAX_INTERROS = 5;
const MAX_DEVOIRS = 3;

const Notes = () => {
  const { teacherId, loading: authLoading } = useAuth();
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [gradesMap, setGradesMap] = useState<Record<string, StudentGrades>>({});
  const [gradeIds, setGradeIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("Trimestre 1");
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());

  // Get unique classes for selection
  const uniqueClasses = useMemo(() => {
    const classMap = new Map<string, { id: string; name: string; level: string }>();
    teacherClasses.forEach(tc => {
      if (!classMap.has(tc.class_id)) {
        classMap.set(tc.class_id, { id: tc.class_id, name: tc.class_name, level: tc.class_level });
      }
    });
    return Array.from(classMap.values());
  }, [teacherClasses]);

  // Get subject for selected class
  const selectedSubject = useMemo(() => {
    return teacherClasses.find(tc => tc.class_id === selectedClassId);
  }, [teacherClasses, selectedClassId]);

  const fetchTeacherClasses = async () => {
    if (!teacherId) return;

    const { data, error } = await supabase
      .from('teacher_classes')
      .select(`
        class_id, subject_id,
        classes (name, level),
        subjects (name, coefficient)
      `)
      .eq('teacher_id', teacherId);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger vos classes", variant: "destructive" });
      return;
    }

    // Also fetch level-specific coefficients
    const { data: levelCoeffs } = await supabase
      .from('subject_level_coefficients')
      .select('*');

    const coeffMap = new Map<string, number>();
    levelCoeffs?.forEach((lc: any) => {
      coeffMap.set(`${lc.subject_id}-${lc.level}`, lc.coefficient);
    });

    const formattedData = (data || []).map((tc: any) => {
      const level = tc.classes?.level || '';
      const levelCoeff = coeffMap.get(`${tc.subject_id}-${level}`);
      return {
        class_id: tc.class_id,
        subject_id: tc.subject_id,
        class_name: tc.classes?.name || '',
        class_level: level,
        subject_name: tc.subjects?.name || '',
        subject_coefficient: levelCoeff ?? tc.subjects?.coefficient ?? 1,
      };
    });

    setTeacherClasses(formattedData);
    
    if (formattedData.length > 0) {
      setSelectedClassId(formattedData[0].class_id);
      setSelectedSubjectId(formattedData[0].subject_id);
    }
  };

  const fetchStudentsAndGrades = async () => {
    if (!selectedClassId || !selectedSubjectId || !teacherId) return;

    setLoading(true);

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

    const formattedStudents = (studentsData || []).map((s: any) => ({
      id: s.id,
      matricule: s.matricule,
      profile: s.profiles,
    }));

    setStudents(formattedStudents);

    const { data: gradesData, error: gradesError } = await supabase
      .from('grades')
      .select('*')
      .eq('class_id', selectedClassId)
      .eq('subject_id', selectedSubjectId)
      .eq('period', selectedPeriod);

    if (gradesError) {
      toast({ title: "Erreur", description: "Impossible de charger les notes", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Build grades map
    const newGradesMap: Record<string, StudentGrades> = {};
    const newGradeIds: Record<string, string> = {};

    formattedStudents.forEach(student => {
      newGradesMap[student.id] = {
        interros: Array(MAX_INTERROS).fill(null),
        devoirs: Array(MAX_DEVOIRS).fill(null),
        exam: null,
      };
    });

    (gradesData || []).forEach((g: any) => {
      if (!newGradesMap[g.student_id]) return;

      // Parse grade_type to extract type and index (e.g., "interro_1", "devoir_2", "exam")
      const parts = g.grade_type.split('_');
      const type = parts[0];
      const index = parts[1] ? parseInt(parts[1]) - 1 : 0;

      if (type === 'interro' && index >= 0 && index < MAX_INTERROS) {
        newGradesMap[g.student_id].interros[index] = g.value;
        newGradeIds[`${g.student_id}-interro-${index}`] = g.id;
      } else if (type === 'devoir' && index >= 0 && index < MAX_DEVOIRS) {
        newGradesMap[g.student_id].devoirs[index] = g.value;
        newGradeIds[`${g.student_id}-devoir-${index}`] = g.id;
      } else if (type === 'exam') {
        newGradesMap[g.student_id].exam = g.value;
        newGradeIds[`${g.student_id}-exam-0`] = g.id;
      }
    });

    setGradesMap(newGradesMap);
    setGradeIds(newGradeIds);
    setPendingChanges(new Set());
    setLoading(false);
  };

  useEffect(() => {
    if (teacherId) {
      fetchTeacherClasses();
    }
  }, [teacherId]);

  useEffect(() => {
    if (selectedClassId) {
      const tc = teacherClasses.find(t => t.class_id === selectedClassId);
      if (tc) {
        setSelectedSubjectId(tc.subject_id);
      }
    }
  }, [selectedClassId, teacherClasses]);

  useEffect(() => {
    fetchStudentsAndGrades();
  }, [selectedClassId, selectedSubjectId, selectedPeriod, teacherId]);

  const handleGradeChange = (studentId: string, type: 'interro' | 'devoir' | 'exam', index: number, value: string) => {
    const numValue = value === '' ? null : Math.min(20, Math.max(0, parseFloat(value) || 0));
    
    setGradesMap(prev => {
      const studentGrades = { ...prev[studentId] };
      if (type === 'interro') {
        studentGrades.interros = [...studentGrades.interros];
        studentGrades.interros[index] = numValue;
      } else if (type === 'devoir') {
        studentGrades.devoirs = [...studentGrades.devoirs];
        studentGrades.devoirs[index] = numValue;
      } else {
        studentGrades.exam = numValue;
      }
      return { ...prev, [studentId]: studentGrades };
    });

    setPendingChanges(prev => new Set(prev).add(`${studentId}-${type}-${index}`));
  };

  const saveAllChanges = async () => {
    if (!teacherId || pendingChanges.size === 0) return;

    setSaving(true);

    try {
      const upserts: any[] = [];
      const inserts: any[] = [];

      pendingChanges.forEach(key => {
        const [studentId, type, indexStr] = key.split('-');
        const index = parseInt(indexStr);
        const studentGrades = gradesMap[studentId];
        if (!studentGrades) return;

        let value: number | null = null;
        let gradeType = '';

        if (type === 'interro') {
          value = studentGrades.interros[index];
          gradeType = `interro_${index + 1}`;
        } else if (type === 'devoir') {
          value = studentGrades.devoirs[index];
          gradeType = `devoir_${index + 1}`;
        } else if (type === 'exam') {
          value = studentGrades.exam;
          gradeType = 'exam';
        }

        const existingId = gradeIds[key];

        if (value !== null) {
          if (existingId) {
            upserts.push({
              id: existingId,
              student_id: studentId,
              subject_id: selectedSubjectId,
              class_id: selectedClassId,
              teacher_id: teacherId,
              value,
              max_value: 20,
              grade_type: gradeType,
              coefficient: 1,
              period: selectedPeriod,
            });
          } else {
            inserts.push({
              student_id: studentId,
              subject_id: selectedSubjectId,
              class_id: selectedClassId,
              teacher_id: teacherId,
              value,
              max_value: 20,
              grade_type: gradeType,
              coefficient: 1,
              period: selectedPeriod,
            });
          }
        } else if (existingId) {
          // Delete the grade if value is null
          supabase.from('grades').delete().eq('id', existingId).then(() => {});
        }
      });

      if (upserts.length > 0) {
        const { error } = await supabase.from('grades').upsert(upserts);
        if (error) throw error;
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from('grades').insert(inserts);
        if (error) throw error;
      }

      toast({ title: "Succès", description: "Notes enregistrées avec succès" });
      setPendingChanges(new Set());
      fetchStudentsAndGrades();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Calculate averages and stats
  const calculateStudentStats = (studentGrades: StudentGrades) => {
    const validInterros = studentGrades.interros.filter(n => n !== null) as number[];
    const validDevoirs = studentGrades.devoirs.filter(n => n !== null) as number[];
    
    const interroAvg = validInterros.length > 0 
      ? validInterros.reduce((a, b) => a + b, 0) / validInterros.length 
      : null;
    
    const devoirAvg = validDevoirs.length > 0 
      ? validDevoirs.reduce((a, b) => a + b, 0) / validDevoirs.length 
      : null;

    let totalAvg: number | null = null;
    if (interroAvg !== null && devoirAvg !== null) {
      totalAvg = (interroAvg + devoirAvg) / 2;
    } else if (interroAvg !== null) {
      totalAvg = interroAvg;
    } else if (devoirAvg !== null) {
      totalAvg = devoirAvg;
    }

    // Include exam if exists
    if (totalAvg !== null && studentGrades.exam !== null) {
      totalAvg = (totalAvg + studentGrades.exam) / 2;
    } else if (studentGrades.exam !== null) {
      totalAvg = studentGrades.exam;
    }

    return { interroAvg, devoirAvg, totalAvg };
  };

  // Calculate rankings
  const rankedStudents = useMemo(() => {
    const studentsWithStats = students.map(student => {
      const studentGrades = gradesMap[student.id] || { interros: [], devoirs: [], exam: null };
      const stats = calculateStudentStats(studentGrades);
      const coefAvg = stats.totalAvg !== null && selectedSubject 
        ? stats.totalAvg * selectedSubject.subject_coefficient 
        : null;
      return { ...student, ...stats, coefAvg };
    });

    // Sort by totalAvg descending for ranking
    const sorted = [...studentsWithStats].sort((a, b) => {
      if (a.totalAvg === null && b.totalAvg === null) return 0;
      if (a.totalAvg === null) return 1;
      if (b.totalAvg === null) return -1;
      return b.totalAvg - a.totalAvg;
    });

    // Assign ranks
    let currentRank = 1;
    sorted.forEach((student, idx) => {
      if (student.totalAvg !== null) {
        if (idx > 0 && sorted[idx - 1].totalAvg === student.totalAvg) {
          (student as any).rank = (sorted[idx - 1] as any).rank;
        } else {
          (student as any).rank = currentRank;
        }
        currentRank++;
      } else {
        (student as any).rank = null;
      }
    });

    // Return in original order with ranks
    return studentsWithStats.map(s => {
      const ranked = sorted.find(r => r.id === s.id);
      return { ...s, rank: (ranked as any)?.rank || null };
    });
  }, [students, gradesMap, selectedSubject]);

  // Statistics
  const stats = useMemo(() => {
    const withAvg = rankedStudents.filter(s => s.totalAvg !== null);
    const aboveAvg = withAvg.filter(s => s.totalAvg! >= 10);
    return {
      totalStudents: students.length,
      studentsWithGrades: withAvg.length,
      aboveAverageCount: aboveAvg.length,
      aboveAveragePercent: withAvg.length > 0 ? ((aboveAvg.length / withAvg.length) * 100).toFixed(1) : '0',
    };
  }, [rankedStudents, students]);

  const getGradeColor = (value: number | null) => {
    if (value === null) return '';
    return value >= 10 ? 'text-success font-semibold' : 'text-destructive font-semibold';
  };

  const isExamClass = selectedSubject?.class_level?.includes('Terminale') || 
                       selectedSubject?.class_level?.includes('3ème') ||
                       selectedSubject?.class_level?.includes('BEPC') ||
                       selectedSubject?.class_level?.includes('BAC');

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Saisie des Notes</h1>
            <p className="text-muted-foreground">Interface de saisie rapide des notes</p>
          </div>
          <Button 
            onClick={saveAllChanges} 
            disabled={pendingChanges.size === 0 || saving}
            className="gap-2"
            size="lg"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement...' : `Enregistrer (${pendingChanges.size})`}
          </Button>
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
                    {uniqueClasses.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Matière</Label>
                <div className="h-11 flex items-center px-3 rounded-md border bg-muted/50">
                  <BookOpen className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="font-medium">
                    {selectedSubject?.subject_name || 'Aucune matière'}
                  </span>
                  {selectedSubject && (
                    <Badge variant="secondary" className="ml-2">
                      Coef. {selectedSubject.subject_coefficient}
                    </Badge>
                  )}
                </div>
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
            </div>
          </CardContent>
        </Card>

        {/* Main Grade Table */}
        {selectedSubject && (
          <Card className="glass-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Notes - {selectedSubject.class_name} - {selectedSubject.subject_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="w-full">
                <div className="min-w-[1200px]">
                  {/* Table Header */}
                  <div className="grid grid-cols-[200px_60px_repeat(5,60px)_80px_repeat(3,60px)_80px_60px_80px_80px_60px] bg-muted/80 border-b sticky top-0 z-10">
                    <div className="p-3 font-semibold text-sm border-r flex items-center">Apprenant</div>
                    <div className="p-3 font-semibold text-sm text-center border-r">Coef</div>
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={`int-${i}`} className="p-3 font-semibold text-xs text-center border-r bg-blue-50 dark:bg-blue-950/30">
                        Int {i}
                      </div>
                    ))}
                    <div className="p-3 font-semibold text-xs text-center border-r bg-blue-100 dark:bg-blue-900/40">Moy Int</div>
                    {[1, 2, 3].map(i => (
                      <div key={`dev-${i}`} className="p-3 font-semibold text-xs text-center border-r bg-amber-50 dark:bg-amber-950/30">
                        Dev {i}
                      </div>
                    ))}
                    <div className="p-3 font-semibold text-xs text-center border-r bg-amber-100 dark:bg-amber-900/40">Moy Dev</div>
                    {isExamClass && (
                      <div className="p-3 font-semibold text-xs text-center border-r bg-purple-50 dark:bg-purple-950/30">Exam</div>
                    )}
                    <div className="p-3 font-semibold text-xs text-center border-r bg-primary/10">Moy</div>
                    <div className="p-3 font-semibold text-xs text-center border-r bg-primary/20">Moy×Coef</div>
                    <div className="p-3 font-semibold text-xs text-center bg-accent/20">Rang</div>
                  </div>

                  {/* Table Body */}
                  {loading ? (
                    <div className="p-8 text-center text-muted-foreground">Chargement...</div>
                  ) : students.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">Aucun élève dans cette classe</div>
                  ) : (
                    rankedStudents.map((student, idx) => {
                      const studentGrades = gradesMap[student.id] || { interros: Array(5).fill(null), devoirs: Array(3).fill(null), exam: null };
                      const devoirAvg = student.devoirAvg;
                      
                      return (
                        <div 
                          key={student.id} 
                          className={`grid grid-cols-[200px_60px_repeat(5,60px)_80px_repeat(3,60px)_80px_60px_80px_80px_60px] border-b hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}
                        >
                          {/* Student Name */}
                          <div className="p-2 border-r flex items-center">
                            <div>
                              <p className="font-medium text-sm truncate">
                                {student.profile.last_name} {student.profile.first_name}
                              </p>
                              <p className="text-xs text-muted-foreground">{student.matricule}</p>
                            </div>
                          </div>

                          {/* Coefficient */}
                          <div className="p-2 border-r flex items-center justify-center">
                            <Badge variant="outline" className="text-xs">
                              {selectedSubject.subject_coefficient}
                            </Badge>
                          </div>

                          {/* Interros */}
                          {[0, 1, 2, 3, 4].map(i => (
                            <div key={`int-${i}`} className="p-1 border-r bg-blue-50/50 dark:bg-blue-950/20">
                              <Input
                                type="number"
                                min="0"
                                max="20"
                                step="0.5"
                                className={`h-8 text-center text-sm p-1 ${getGradeColor(studentGrades.interros[i])}`}
                                value={studentGrades.interros[i] ?? ''}
                                onChange={e => handleGradeChange(student.id, 'interro', i, e.target.value)}
                                placeholder="-"
                              />
                            </div>
                          ))}

                          {/* Interro Average */}
                          <div className={`p-2 border-r flex items-center justify-center text-sm font-semibold bg-blue-100/50 dark:bg-blue-900/30 ${getGradeColor(student.interroAvg)}`}>
                            {student.interroAvg !== null ? student.interroAvg.toFixed(2) : '-'}
                          </div>

                          {/* Devoirs */}
                          {[0, 1, 2].map(i => (
                            <div key={`dev-${i}`} className="p-1 border-r bg-amber-50/50 dark:bg-amber-950/20">
                              <Input
                                type="number"
                                min="0"
                                max="20"
                                step="0.5"
                                className={`h-8 text-center text-sm p-1 ${getGradeColor(studentGrades.devoirs[i])}`}
                                value={studentGrades.devoirs[i] ?? ''}
                                onChange={e => handleGradeChange(student.id, 'devoir', i, e.target.value)}
                                placeholder="-"
                              />
                            </div>
                          ))}

                          {/* Devoir Average */}
                          <div className={`p-2 border-r flex items-center justify-center text-sm font-semibold bg-amber-100/50 dark:bg-amber-900/30 ${getGradeColor(devoirAvg)}`}>
                            {devoirAvg !== null ? devoirAvg.toFixed(2) : '-'}
                          </div>

                          {/* Exam (if applicable) */}
                          {isExamClass && (
                            <div className="p-1 border-r bg-purple-50/50 dark:bg-purple-950/20">
                              <Input
                                type="number"
                                min="0"
                                max="20"
                                step="0.5"
                                className={`h-8 text-center text-sm p-1 ${getGradeColor(studentGrades.exam)}`}
                                value={studentGrades.exam ?? ''}
                                onChange={e => handleGradeChange(student.id, 'exam', 0, e.target.value)}
                                placeholder="-"
                              />
                            </div>
                          )}

                          {/* Total Average */}
                          <div className={`p-2 border-r flex items-center justify-center text-sm font-bold bg-primary/10 ${getGradeColor(student.totalAvg)}`}>
                            {student.totalAvg !== null ? student.totalAvg.toFixed(2) : '-'}
                          </div>

                          {/* Coefficient Average */}
                          <div className={`p-2 border-r flex items-center justify-center text-sm font-bold bg-primary/20 ${getGradeColor(student.coefAvg)}`}>
                            {student.coefAvg !== null ? student.coefAvg.toFixed(2) : '-'}
                          </div>

                          {/* Rank */}
                          <div className="p-2 flex items-center justify-center bg-accent/10">
                            {student.rank !== null ? (
                              <Badge 
                                variant={student.rank <= 3 ? "default" : "outline"}
                                className={student.rank === 1 ? 'bg-yellow-500' : student.rank === 2 ? 'bg-gray-400' : student.rank === 3 ? 'bg-amber-600' : ''}
                              >
                                {student.rank}e
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Statistics Footer */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="stat-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalStudents}</p>
                  <p className="text-xs text-muted-foreground">Élèves total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <BookOpen className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.studentsWithGrades}</p>
                  <p className="text-xs text-muted-foreground">Notes renseignées</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <TrendingUp className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-success">{stats.aboveAveragePercent}%</p>
                  <p className="text-xs text-muted-foreground">Moyenne ≥ 10</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Award className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.aboveAverageCount}/{stats.studentsWithGrades}</p>
                  <p className="text-xs text-muted-foreground">Élèves au-dessus</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Notes;
