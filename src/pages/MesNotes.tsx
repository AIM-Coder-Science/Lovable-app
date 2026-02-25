import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BookOpen, TrendingUp, Award, BarChart3, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SubjectGrade {
  subject_id: string;
  subject_name: string;
  coefficient: number;
  grades: { grade_type: string; value: number }[];
  average: number | null;
  weightedAverage: number | null;
}

const PERIODS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];

const MesNotes = () => {
  const { studentId, loading: authLoading } = useAuth();
  const [subjectGrades, setSubjectGrades] = useState<SubjectGrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("Trimestre 1");
  const [studentClassId, setStudentClassId] = useState<string | null>(null);
  const [className, setClassName] = useState("");

  const fetchStudentGrades = async () => {
    if (!studentId) return;
    setLoading(true);

    // Get student class
    const { data: studentData } = await supabase
      .from('students')
      .select('class_id, classes(name, level)')
      .eq('id', studentId)
      .single();

    if (!studentData?.class_id) {
      setLoading(false);
      return;
    }

    setStudentClassId(studentData.class_id);
    setClassName((studentData as any).classes?.name || '');
    const classLevel = (studentData as any).classes?.level || '';

    // Fetch subjects
    const { data: subjects } = await supabase
      .from('subjects')
      .select('id, name, coefficient')
      .eq('is_active', true)
      .order('name');

    // Fetch coefficients
    const { data: levelCoeffs } = await supabase
      .from('subject_level_coefficients')
      .select('*');

    const coeffMap = new Map<string, number>();
    levelCoeffs?.filter((lc: any) => !lc.class_id && lc.level === classLevel).forEach((lc: any) => {
      coeffMap.set(lc.subject_id, lc.coefficient);
    });
    levelCoeffs?.filter((lc: any) => lc.class_id === studentData.class_id).forEach((lc: any) => {
      coeffMap.set(lc.subject_id, lc.coefficient);
    });

    // Fetch grades
    const { data: gradesData } = await supabase
      .from('grades')
      .select('subject_id, value, max_value, grade_type')
      .eq('student_id', studentId)
      .eq('class_id', studentData.class_id)
      .eq('period', selectedPeriod);

    // Build subject grades
    const gradesBySubject = new Map<string, { grades: { grade_type: string; value: number }[]; total: number; count: number }>();
    (gradesData || []).forEach(g => {
      const normalized = (g.value / g.max_value) * 20;
      const current = gradesBySubject.get(g.subject_id) || { grades: [], total: 0, count: 0 };
      current.grades.push({ grade_type: g.grade_type, value: normalized });
      current.total += normalized;
      current.count += 1;
      gradesBySubject.set(g.subject_id, current);
    });

    const results: SubjectGrade[] = (subjects || [])
      .filter(s => {
        const coeff = coeffMap.get(s.id) ?? s.coefficient;
        return coeff > 0;
      })
      .map(subject => {
        const coeff = coeffMap.get(subject.id) ?? subject.coefficient;
        const gradeData = gradesBySubject.get(subject.id);
        const average = gradeData && gradeData.count > 0 ? gradeData.total / gradeData.count : null;
        return {
          subject_id: subject.id,
          subject_name: subject.name,
          coefficient: coeff,
          grades: gradeData?.grades || [],
          average,
          weightedAverage: average !== null ? average * coeff : null,
        };
      });

    setSubjectGrades(results);
    setLoading(false);
  };

  useEffect(() => {
    if (studentId) fetchStudentGrades();
  }, [studentId, selectedPeriod]);

  const stats = useMemo(() => {
    let weightedTotal = 0;
    let totalCoeff = 0;
    const withGrades = subjectGrades.filter(sg => sg.average !== null);

    withGrades.forEach(sg => {
      weightedTotal += sg.average! * sg.coefficient;
      totalCoeff += sg.coefficient;
    });

    const generalAverage = totalCoeff > 0 ? weightedTotal / totalCoeff : null;
    const bestSubject = withGrades.length > 0 ? withGrades.reduce((best, sg) => sg.average! > (best.average || 0) ? sg : best, withGrades[0]) : null;
    const worstSubject = withGrades.length > 0 ? withGrades.reduce((worst, sg) => sg.average! < (worst.average || 20) ? sg : worst, withGrades[0]) : null;

    return {
      generalAverage,
      totalCoeff,
      weightedTotal,
      subjectsWithGrades: withGrades.length,
      totalSubjects: subjectGrades.length,
      bestSubject,
      worstSubject,
    };
  }, [subjectGrades]);

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
    if (value >= 10) return 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300';
    return 'bg-red-100 dark:bg-red-900/30 border-red-300';
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mes Notes</h1>
          <p className="text-muted-foreground">Consultez vos notes et moyennes - {className}</p>
        </div>

        {/* Period Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="max-w-xs">
              <Label className="text-sm font-medium mb-2 block">Période</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={`border ${getGradeBg(stats.generalAverage)}`}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Award className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${getGradeColor(stats.generalAverage)}`}>
                    {stats.generalAverage?.toFixed(2) || '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">Moyenne Générale</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.subjectsWithGrades}/{stats.totalSubjects}</p>
                  <p className="text-xs text-muted-foreground">Matières notées</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {stats.bestSubject && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${getGradeColor(stats.bestSubject.average)}`}>
                      {stats.bestSubject.average?.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{stats.bestSubject.subject_name}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {stats.worstSubject && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Target className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${getGradeColor(stats.worstSubject.average)}`}>
                      {stats.worstSubject.average?.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{stats.worstSubject.subject_name}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Grades Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Détail des notes - {selectedPeriod}
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
                    <TableHead className="text-center font-semibold bg-primary/10">Moy×Coef</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        Chargement...
                      </TableCell>
                    </TableRow>
                  ) : subjectGrades.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        Aucune matière trouvée
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {subjectGrades.map(sg => {
                        const getGradeVal = (type: string, idx: number) => {
                          const g = sg.grades.find(gr => gr.grade_type === `${type}_${idx + 1}`);
                          return g ? g.value : null;
                        };

                        return (
                          <TableRow key={sg.subject_id} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{sg.subject_name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{sg.coefficient}</Badge>
                            </TableCell>
                            {[0, 1, 2, 3, 4].map(i => {
                              const val = getGradeVal('interro', i);
                              return (
                                <TableCell key={`i${i}`} className="text-center">
                                  <span className={`font-medium ${getGradeColor(val)}`}>
                                    {val !== null ? val.toFixed(1) : '-'}
                                  </span>
                                </TableCell>
                              );
                            })}
                            {[0, 1, 2].map(i => {
                              const val = getGradeVal('devoir', i);
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
                      {/* Total */}
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-center">{stats.totalCoeff}</TableCell>
                        <TableCell colSpan={8}></TableCell>
                        <TableCell className={`text-center text-lg ${getGradeColor(stats.generalAverage)}`}>
                          {stats.generalAverage?.toFixed(2) || '-'}
                        </TableCell>
                        <TableCell className={`text-center text-lg ${getGradeColor(stats.generalAverage)}`}>
                          {stats.weightedTotal?.toFixed(2) || '-'}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Performance */}
        {stats.subjectsWithGrades > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Performance par matière</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {subjectGrades.filter(sg => sg.average !== null).sort((a, b) => (b.average || 0) - (a.average || 0)).map(sg => (
                <div key={sg.subject_id} className="flex items-center gap-4">
                  <span className="text-sm font-medium w-40 truncate">{sg.subject_name}</span>
                  <Progress value={(sg.average || 0) * 5} className="flex-1 h-3" />
                  <span className={`text-sm font-bold w-16 text-right ${getGradeColor(sg.average)}`}>
                    {sg.average?.toFixed(2)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MesNotes;
