import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Eye, Award, TrendingUp } from "lucide-react";

const Bulletins = () => {
  // Mock data for a student's grades
  const studentInfo = {
    name: "Jean Dupont",
    class: "3ème A",
    matricule: "2024-001",
    period: "1er Trimestre",
    academicYear: "2024-2025",
  };

  const grades = [
    { subject: "Mathématiques", coef: 4, interrogations: [14, 12, 16], exam: 15, average: 14.5 },
    { subject: "Français", coef: 4, interrogations: [13, 15, 14], exam: 14, average: 14.0 },
    { subject: "Physique-Chimie", coef: 3, interrogations: [16, 14, 15], exam: 16, average: 15.5 },
    { subject: "SVT", coef: 2, interrogations: [12, 13, 14], exam: 13, average: 13.0 },
    { subject: "Histoire-Géo", coef: 3, interrogations: [15, 14, 16], exam: 15, average: 15.0 },
    { subject: "Anglais", coef: 2, interrogations: [17, 16, 18], exam: 17, average: 17.0 },
    { subject: "Éducation Physique", coef: 1, interrogations: [14, 15], exam: 15, average: 14.5 },
  ];

  const generalAverage = 14.78;
  const rank = 3;
  const classSize = 32;

  const getGradeClass = (grade: number) => {
    if (grade >= 16) return "grade-excellent";
    if (grade >= 14) return "grade-good";
    if (grade >= 10) return "grade-average";
    return "grade-poor";
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Bulletins</h1>
            <p className="text-muted-foreground mt-1">
              Consultez vos notes et bulletins scolaires
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Aperçu
            </Button>
            <Button>
              <Download className="w-4 h-4 mr-2" />
              Télécharger PDF
            </Button>
          </div>
        </div>

        {/* Student Info Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Nom</p>
                <p className="font-semibold">{studentInfo.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Classe</p>
                <p className="font-semibold">{studentInfo.class}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Matricule</p>
                <p className="font-semibold">{studentInfo.matricule}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Période</p>
                <p className="font-semibold">{studentInfo.period}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Année</p>
                <p className="font-semibold">{studentInfo.academicYear}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Award className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-primary">{generalAverage.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Moyenne Générale</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-accent">{rank}<sup>ème</sup></p>
                  <p className="text-sm text-muted-foreground">Rang / {classSize}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-success/20 bg-success/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-success" />
                </div>
                <div>
                  <Badge className="bg-success text-success-foreground">Excellent</Badge>
                  <p className="text-sm text-muted-foreground mt-1">Appréciation</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Grades Table */}
        <Card>
          <CardHeader>
            <CardTitle>Détail des Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="table-header">Matière</TableHead>
                  <TableHead className="table-header text-center">Coef</TableHead>
                  <TableHead className="table-header text-center">Interrogations</TableHead>
                  <TableHead className="table-header text-center">Examen</TableHead>
                  <TableHead className="table-header text-center">Moyenne</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.map((grade, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{grade.subject}</TableCell>
                    <TableCell className="text-center">{grade.coef}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-2">
                        {grade.interrogations.map((note, i) => (
                          <span key={i} className={getGradeClass(note)}>
                            {note}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className={`text-center ${getGradeClass(grade.exam)}`}>
                      {grade.exam}
                    </TableCell>
                    <TableCell className={`text-center font-bold ${getGradeClass(grade.average)}`}>
                      {grade.average.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Bulletins;
