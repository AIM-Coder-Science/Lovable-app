import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileText, CheckCircle, Eye, Download, Printer } from "lucide-react";
import { printBulletin } from "@/utils/bulletinPdf";

interface BulletinData {
  id: string;
  student_id: string;
  student_name: string;
  student_matricule: string;
  average: number | null;
  rank: number | null;
  total_students: number | null;
  teacher_appreciation: string | null;
  principal_appreciation: string | null;
  admin_signature: boolean;
  subjectGrades: {
    subject_name: string;
    coefficient: number;
    average: number | null;
  }[];
}

interface Class {
  id: string;
  name: string;
  level?: string;
}

const PERIODS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];

const BulletinsPage = () => {
  const { role, studentId, loading: authLoading } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [bulletins, setBulletins] = useState<BulletinData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("Trimestre 1");
  const [selectedBulletin, setSelectedBulletin] = useState<BulletinData | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [principalAppreciation, setPrincipalAppreciation] = useState("");
  const [schoolSettings, setSchoolSettings] = useState<{ school_name: string; academic_year: string }>({ school_name: '', academic_year: '' });
  const [studentHasUnpaidFees, setStudentHasUnpaidFees] = useState(false);
  const [checkingFees, setCheckingFees] = useState(false);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name, level')
      .eq('is_active', true)
      .order('name');
    if (data) setClasses(data);
  };

  const fetchBulletins = async () => {
    setLoading(true);

    let query = supabase
      .from('bulletins')
      .select(`
        id, student_id, average, rank, total_students, teacher_appreciation, principal_appreciation, admin_signature,
        students!bulletins_student_id_fkey (
          matricule,
          profiles!students_profile_id_fkey (first_name, last_name)
        ),
        classes!bulletins_class_id_fkey (name)
      `)
      .eq('period', selectedPeriod);

    if (role === 'student' && studentId) {
      // Students can only see their own bulletins - we need to get student record first
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('id', studentId)
        .maybeSingle();
      
      if (studentData) {
        query = query.eq('student_id', studentData.id);
      }
    } else if (selectedClassId !== "all") {
      query = query.eq('class_id', selectedClassId);
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les bulletins", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Get subjects for grade details
    const { data: subjects } = await supabase
      .from('subjects')
      .select('id, name, coefficient')
      .eq('is_active', true);

    // Fetch level coefficients for class-specific coefficients
    const { data: levelCoeffs } = await supabase
      .from('subject_level_coefficients')
      .select('*');

    // Process bulletins
    const processedBulletins: BulletinData[] = await Promise.all(
      (data || []).map(async (b: any) => {
        const bulletinClassId = b.class_id || selectedClassId;
        
        // Get class level for coefficient resolution
        const bulletinClass = classes.find(c => c.id === bulletinClassId);
        
        // Build coefficient map for this class
        const coeffMap = new Map<string, number>();
        // Level-based defaults
        if (bulletinClass) {
          levelCoeffs?.filter((lc: any) => !lc.class_id).forEach((lc: any) => {
            coeffMap.set(lc.subject_id, lc.coefficient);
          });
        }
        // Class-specific overrides
        levelCoeffs?.filter((lc: any) => lc.class_id === bulletinClassId).forEach((lc: any) => {
          coeffMap.set(lc.subject_id, lc.coefficient);
        });

        // Get grades for this student in their class
        const { data: grades } = await supabase
          .from('grades')
          .select('subject_id, value, max_value, coefficient')
          .eq('student_id', b.student_id)
          .eq('class_id', bulletinClassId)
          .eq('period', selectedPeriod);

        // Calculate subject averages
        const subjectGrades = (subjects || [])
          .filter(subject => {
            const coeff = coeffMap.get(subject.id) ?? subject.coefficient;
            return coeff > 0;
          })
          .map(subject => {
            const studentGrades = (grades || []).filter(g => g.subject_id === subject.id);
            const coeff = coeffMap.get(subject.id) ?? subject.coefficient;
          
            if (studentGrades.length === 0) {
              return {
                subject_name: subject.name,
                coefficient: coeff,
                average: null,
              };
            }

            let total = 0;
            let count = 0;
            studentGrades.forEach(g => {
              const normalized = (g.value / g.max_value) * 20;
              total += normalized;
              count += 1;
            });

            return {
              subject_name: subject.name,
              coefficient: coeff,
              average: count > 0 ? total / count : null,
            };
          });

        return {
          id: b.id,
          student_id: b.student_id,
          student_name: `${b.students?.profiles?.first_name || ''} ${b.students?.profiles?.last_name || ''}`.trim(),
          student_matricule: b.students?.matricule || '',
          average: b.average,
          rank: b.rank,
          total_students: b.total_students,
          teacher_appreciation: b.teacher_appreciation,
          principal_appreciation: b.principal_appreciation,
          admin_signature: b.admin_signature || false,
          subjectGrades,
        };
      })
    );

    setBulletins(processedBulletins);
    setLoading(false);
  };

  // Check if student has fully paid all fees
  const checkStudentFees = async () => {
    if (role !== 'student' || !studentId) return;
    setCheckingFees(true);

    // Check invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('amount, amount_paid, status')
      .eq('student_id', studentId);

    const hasUnpaidInvoices = (invoices || []).some(inv => inv.status !== 'paid');

    // Check student articles
    const { data: articles } = await supabase
      .from('student_articles')
      .select('amount, amount_paid, status')
      .eq('student_id', studentId);

    const hasUnpaidArticles = (articles || []).some(a => a.status !== 'paid');

    // Check class fees (tuition)
    const { data: studentData } = await supabase
      .from('students')
      .select('class_id')
      .eq('id', studentId)
      .maybeSingle();

    let hasUnpaidTuition = false;
    if (studentData?.class_id) {
      const { data: classFee } = await supabase
        .from('class_fees')
        .select('amount')
        .eq('class_id', studentData.class_id)
        .maybeSingle();

      if (classFee && classFee.amount > 0) {
        // Check if there's a paid tuition invoice
        const tuitionPaid = (invoices || []).some(
          inv => (inv.status === 'paid') && inv.amount >= classFee.amount
        );
        if (!tuitionPaid) hasUnpaidTuition = true;
      }
    }

    setStudentHasUnpaidFees(hasUnpaidInvoices || hasUnpaidArticles || hasUnpaidTuition);
    setCheckingFees(false);
  };

  useEffect(() => {
    if (role === 'admin') {
      fetchClasses();
    }
    supabase.from('school_settings').select('school_name, academic_year').maybeSingle().then(({ data }) => {
      if (data) setSchoolSettings(data);
    });
  }, [role]);

  useEffect(() => {
    if (!authLoading) {
      fetchBulletins();
      checkStudentFees();
    }
  }, [selectedClassId, selectedPeriod, authLoading, role, studentId]);

  const handleSignBulletin = async (bulletinId: string) => {
    try {
      const { error } = await supabase
        .from('bulletins')
        .update({ 
          admin_signature: true,
          admin_signed_at: new Date().toISOString(),
        })
        .eq('id', bulletinId);

      if (error) throw error;

      toast({ title: "Succès", description: "Bulletin signé avec succès" });
      fetchBulletins();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleSavePrincipalAppreciation = async () => {
    if (!selectedBulletin) return;

    try {
      const { error } = await supabase
        .from('bulletins')
        .update({ principal_appreciation: principalAppreciation })
        .eq('id', selectedBulletin.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Appréciation enregistrée" });
      setIsViewDialogOpen(false);
      fetchBulletins();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handlePrintBulletin = (bulletin: BulletinData) => {
    const selectedClass = classes.find(c => c.id === selectedClassId);
    printBulletin({
      schoolName: schoolSettings.school_name || 'École',
      academicYear: schoolSettings.academic_year || '',
      period: selectedPeriod,
      studentName: bulletin.student_name,
      studentMatricule: bulletin.student_matricule,
      className: selectedClass?.name || '',
      average: bulletin.average,
      rank: bulletin.rank,
      totalStudents: bulletin.total_students,
      teacherAppreciation: bulletin.teacher_appreciation,
      principalAppreciation: bulletin.principal_appreciation,
      adminSigned: bulletin.admin_signature,
      subjectGrades: bulletin.subjectGrades,
    });
  };

  const getGradeClass = (value: number) => {
    if (value >= 16) return "grade-excellent";
    if (value >= 14) return "grade-good";
    if (value >= 10) return "grade-average";
    return "grade-poor";
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

  if (role === 'student' && (checkingFees || studentHasUnpaidFees)) {
    if (checkingFees) {
      return (
        <DashboardLayout>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Vérification des paiements...</p>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <FileText className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Accès aux bulletins restreint</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Vous devez avoir soldé l'intégralité de vos frais de scolarité et articles avant de pouvoir consulter ou imprimer vos bulletins.
          </p>
          <p className="text-sm text-muted-foreground">
            Veuillez vous rendre dans la section <strong>Facturation</strong> pour effectuer vos paiements.
          </p>
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
            <h1 className="text-3xl font-bold text-foreground">Bulletins</h1>
            <p className="text-muted-foreground">
              {role === 'student' ? 'Consultez vos bulletins' : 'Gérez les bulletins des élèves'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {role === 'admin' && (
                <div>
                  <Label>Classe</Label>
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Toutes les classes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les classes</SelectItem>
                      {classes.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Période</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
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

        {/* Bulletins Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {selectedPeriod}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="table-header">
                  <TableHead>Élève</TableHead>
                  <TableHead className="text-center">Moyenne</TableHead>
                  <TableHead className="text-center">Rang</TableHead>
                  <TableHead className="text-center">Signé</TableHead>
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
                ) : bulletins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucun bulletin trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  bulletins.map(bulletin => (
                    <TableRow key={bulletin.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{bulletin.student_name}</p>
                          <p className="text-sm text-muted-foreground">{bulletin.student_matricule}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {bulletin.average !== null ? (
                          <Badge className={getGradeClass(bulletin.average)}>
                            {bulletin.average.toFixed(2)}/20
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {bulletin.rank && bulletin.total_students ? (
                          <Badge variant={bulletin.rank <= 3 ? "default" : "outline"}>
                            {bulletin.rank}/{bulletin.total_students}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {bulletin.admin_signature ? (
                          <CheckCircle className="w-5 h-5 text-success mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">Non</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedBulletin(bulletin);
                              setPrincipalAppreciation(bulletin.principal_appreciation || '');
                              setIsViewDialogOpen(true);
                            }}
                            title="Voir le bulletin"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrintBulletin(bulletin)}
                            title="Imprimer le bulletin"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          {role === 'admin' && !bulletin.admin_signature && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSignBulletin(bulletin.id)}
                              title="Signer le bulletin"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* View Bulletin Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="flex flex-row items-center justify-between">
              <DialogTitle>Bulletin de {selectedBulletin?.student_name}</DialogTitle>
              {selectedBulletin && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrintBulletin(selectedBulletin)}>
                  <Printer className="w-4 h-4" /> Imprimer
                </Button>
              )}
            </DialogHeader>
            {selectedBulletin && (
              <div className="space-y-6 mt-4">
                {/* Info */}
                <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{selectedBulletin.student_name}</p>
                    <p className="text-sm text-muted-foreground">Matricule: {selectedBulletin.student_matricule}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{selectedPeriod}</p>
                    {selectedBulletin.admin_signature && (
                      <Badge variant="default" className="mt-1">Signé</Badge>
                    )}
                  </div>
                </div>

                {/* Grades Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matière</TableHead>
                      <TableHead className="text-center">Coefficient</TableHead>
                      <TableHead className="text-center">Moyenne</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBulletin.subjectGrades.map((sg, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{sg.subject_name}</TableCell>
                        <TableCell className="text-center">{sg.coefficient}</TableCell>
                        <TableCell className="text-center">
                          {sg.average !== null ? (
                            <span className={getGradeClass(sg.average)}>{sg.average.toFixed(2)}</span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Summary */}
                <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg">
                  <span className="font-semibold">Moyenne Générale</span>
                  <span className={`text-xl font-bold ${selectedBulletin.average ? getGradeClass(selectedBulletin.average) : ''}`}>
                    {selectedBulletin.average?.toFixed(2) || '-'}/20
                  </span>
                </div>

                {selectedBulletin.rank && selectedBulletin.total_students && (
                  <div className="text-center">
                    <Badge variant="outline" className="text-lg px-4 py-2">
                      Rang: {selectedBulletin.rank}/{selectedBulletin.total_students}
                    </Badge>
                  </div>
                )}

                {/* Appreciations */}
                <div className="space-y-4">
                  {selectedBulletin.teacher_appreciation && (
                    <div>
                      <Label className="text-muted-foreground">Appréciation du professeur principal</Label>
                      <p className="mt-1 p-3 bg-muted rounded-lg">{selectedBulletin.teacher_appreciation}</p>
                    </div>
                  )}
                  
                  {role === 'admin' ? (
                    <div>
                      <Label>Appréciation du chef d'établissement</Label>
                      <Textarea
                        value={principalAppreciation}
                        onChange={e => setPrincipalAppreciation(e.target.value)}
                        className="mt-1"
                        rows={3}
                      />
                      <Button onClick={handleSavePrincipalAppreciation} className="mt-2">
                        Enregistrer l'appréciation
                      </Button>
                    </div>
                  ) : selectedBulletin.principal_appreciation && (
                    <div>
                      <Label className="text-muted-foreground">Appréciation du chef d'établissement</Label>
                      <p className="mt-1 p-3 bg-muted rounded-lg">{selectedBulletin.principal_appreciation}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default BulletinsPage;
