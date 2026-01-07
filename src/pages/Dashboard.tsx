import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Users, BookOpen, School, Bell, TrendingUp, Award, FileText, Calendar, GraduationCap, ClipboardList, CreditCard, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

interface Activity {
  id: string;
  type: string;
  message: string;
  time: string;
}

interface Publication {
  id: string;
  title: string;
  content: string;
  author_type: string;
  created_at: string;
  visibility: string;
}

interface StudentGrade {
  id: string;
  value: number;
  max_value: number;
  subject_name: string;
  created_at: string;
}

interface PaymentInfo {
  totalDue: number;
  totalPaid: number;
  remaining: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { role, studentId, teacherId, isPrincipal, loading: authLoading } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    averageGrade: 0,
  });
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [studentGrades, setStudentGrades] = useState<StudentGrade[]>([]);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({ totalDue: 0, totalPaid: 0, remaining: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      fetchDashboardData();
    }
  }, [role, authLoading, studentId, teacherId]);

  const fetchDashboardData = async () => {
    setLoading(true);

    if (role === 'admin') {
      await fetchAdminDashboard();
    } else if (role === 'teacher') {
      await fetchTeacherDashboard();
    } else if (role === 'student') {
      await fetchStudentDashboard();
    }

    setLoading(false);
  };

  const fetchAdminDashboard = async () => {
    // Fetch stats
    const [studentsRes, teachersRes, classesRes] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }),
      supabase.from('teachers').select('id', { count: 'exact', head: true }),
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    setStats({
      totalStudents: studentsRes.count || 0,
      totalTeachers: teachersRes.count || 0,
      totalClasses: classesRes.count || 0,
      averageGrade: 0,
    });

    // Fetch recent activities (based on recent records)
    const activities: Activity[] = [];

    const { data: recentStudents } = await supabase
      .from('students')
      .select('id, created_at, profiles!students_profile_id_fkey(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(3);

    recentStudents?.forEach((s: any) => {
      activities.push({
        id: `student-${s.id}`,
        type: 'student',
        message: `Nouvel apprenant: ${s.profiles?.first_name} ${s.profiles?.last_name}`,
        time: formatTimeAgo(s.created_at),
      });
    });

    const { data: recentTeachers } = await supabase
      .from('teachers')
      .select('id, created_at, profiles!teachers_profile_id_fkey(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(2);

    recentTeachers?.forEach((t: any) => {
      activities.push({
        id: `teacher-${t.id}`,
        type: 'teacher',
        message: `Nouvel enseignant: ${t.profiles?.first_name} ${t.profiles?.last_name}`,
        time: formatTimeAgo(t.created_at),
      });
    });

    const { data: recentPubs } = await supabase
      .from('publications')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(2);

    recentPubs?.forEach((p: any) => {
      activities.push({
        id: `pub-${p.id}`,
        type: 'publication',
        message: `Publication: ${p.title}`,
        time: formatTimeAgo(p.created_at),
      });
    });

    // Sort by most recent
    activities.sort((a, b) => {
      const timeA = parseTimeAgo(a.time);
      const timeB = parseTimeAgo(b.time);
      return timeA - timeB;
    });

    setRecentActivities(activities.slice(0, 5));
  };

  const fetchTeacherDashboard = async () => {
    if (!teacherId) return;

    // Fetch teacher's classes count and students count
    const { data: teacherClasses } = await supabase
      .from('teacher_classes')
      .select('class_id, is_principal')
      .eq('teacher_id', teacherId);

    const classIds = teacherClasses?.map(tc => tc.class_id) || [];
    const principalClasses = teacherClasses?.filter(tc => tc.is_principal).length || 0;

    let studentsCount = 0;
    if (classIds.length > 0) {
      const { count } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .in('class_id', classIds);
      studentsCount = count || 0;
    }

    // Fetch recent grades entered by this teacher
    const { data: recentGrades } = await supabase
      .from('grades')
      .select('id, created_at, students(profiles!students_profile_id_fkey(first_name, last_name)), subjects(name)')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
      .limit(5);

    const activities: Activity[] = recentGrades?.map((g: any) => ({
      id: `grade-${g.id}`,
      type: 'grade',
      message: `Note ajoutée en ${g.subjects?.name || 'N/A'} pour ${g.students?.profiles?.first_name || ''} ${g.students?.profiles?.last_name || ''}`,
      time: formatTimeAgo(g.created_at),
    })) || [];

    setRecentActivities(activities);

    setStats({
      totalStudents: studentsCount,
      totalTeachers: 0,
      totalClasses: classIds.length,
      averageGrade: principalClasses,
    });

    // Fetch publications for teachers
    const { data: pubs } = await supabase
      .from('publications')
      .select('*')
      .eq('is_published', true)
      .or('visibility.eq.all,visibility.eq.teachers')
      .order('created_at', { ascending: false })
      .limit(5);

    setPublications(pubs || []);
  };

  const fetchStudentDashboard = async () => {
    if (!studentId) return;

    // Fetch student's recent grades
    const { data: grades } = await supabase
      .from('grades')
      .select('id, value, max_value, created_at, subjects(name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5);

    const formattedGrades: StudentGrade[] = grades?.map((g: any) => ({
      id: g.id,
      value: g.value,
      max_value: g.max_value,
      subject_name: g.subjects?.name || 'N/A',
      created_at: g.created_at,
    })) || [];

    setStudentGrades(formattedGrades);

    // Calculate average
    const avg = formattedGrades.length > 0
      ? formattedGrades.reduce((sum, g) => sum + (g.value / g.max_value * 20), 0) / formattedGrades.length
      : 0;

    setStats({
      totalStudents: 0,
      totalTeachers: 0,
      totalClasses: 0,
      averageGrade: Math.round(avg * 10) / 10,
    });

    // Fetch student payment info
    const { data: invoices } = await supabase
      .from('invoices')
      .select('amount, amount_paid')
      .eq('student_id', studentId);

    const totalDue = invoices?.reduce((sum, inv) => sum + Number(inv.amount), 0) || 0;
    const totalPaid = invoices?.reduce((sum, inv) => sum + Number(inv.amount_paid), 0) || 0;

    setPaymentInfo({
      totalDue,
      totalPaid,
      remaining: totalDue - totalPaid,
    });

    // Fetch publications for students
    const { data: pubs } = await supabase
      .from('publications')
      .select('*')
      .eq('is_published', true)
      .or('visibility.eq.all,visibility.eq.students')
      .order('created_at', { ascending: false })
      .limit(5);

    setPublications(pubs || []);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-FR');
  };

  const parseTimeAgo = (timeStr: string): number => {
    if (timeStr.includes('min')) return parseInt(timeStr);
    if (timeStr.includes('h')) return parseInt(timeStr) * 60;
    if (timeStr.includes('j')) return parseInt(timeStr) * 1440;
    return 99999;
  };

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  // Admin Dashboard
  if (role === 'admin') {
    return (
      <DashboardLayout>
        <div className="space-y-8 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard Admin</h1>
            <p className="text-muted-foreground mt-1">Vue d'ensemble de l'établissement</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Apprenants" value={stats.totalStudents} icon={Users} variant="primary" />
            <StatCard title="Enseignants" value={stats.totalTeachers} icon={BookOpen} variant="accent" />
            <StatCard title="Classes actives" value={stats.totalClasses} icon={School} variant="success" />
            <StatCard title="Publications" value={publications.length} icon={Bell} variant="warning" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Activités Récentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivities.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Aucune activité récente</p>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{activity.message}</p>
                        <p className="text-xs text-muted-foreground">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Teacher Dashboard
  if (role === 'teacher') {
    return (
      <DashboardLayout>
        <div className="space-y-8 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard Enseignant</h1>
            <p className="text-muted-foreground mt-1">
              {isPrincipal ? "Vous êtes professeur principal" : "Votre espace de travail"}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Mes élèves" value={stats.totalStudents} icon={Users} variant="primary" />
            <StatCard title="Mes classes" value={stats.totalClasses} icon={School} variant="accent" />
            <StatCard title="Classes PP" value={stats.averageGrade} icon={Award} variant="success" subtitle="Prof. Principal" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  Dernières Notes Saisies
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentActivities.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Aucune note récente</p>
                ) : (
                  <div className="space-y-3">
                    {recentActivities.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{activity.message}</p>
                          <p className="text-xs text-muted-foreground">{activity.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-accent" />
                  Actualités
                </CardTitle>
              </CardHeader>
              <CardContent>
                {publications.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Aucune actualité</p>
                ) : (
                  <div className="space-y-3">
                    {publications.slice(0, 3).map((pub) => (
                      <div key={pub.id} className="p-3 rounded-lg border border-border">
                        <p className="font-medium text-sm">{pub.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatTimeAgo(pub.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Student Dashboard - Enhanced
  if (role === 'student') {
    const paymentProgress = paymentInfo.totalDue > 0 
      ? (paymentInfo.totalPaid / paymentInfo.totalDue) * 100 
      : 0;

    return (
      <DashboardLayout>
        <div className="space-y-8 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Mon Espace</h1>
            <p className="text-muted-foreground mt-1">Bienvenue sur votre tableau de bord</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Ma Moyenne" value={`${stats.averageGrade}/20`} icon={Award} variant="primary" />
            <StatCard title="Notes reçues" value={studentGrades.length} icon={FileText} variant="accent" />
            <StatCard 
              title="Total Payé" 
              value={`${paymentInfo.totalPaid.toLocaleString()}`} 
              icon={Wallet} 
              variant="success" 
              subtitle="FCFA"
            />
            <StatCard 
              title="Reste à payer" 
              value={`${paymentInfo.remaining.toLocaleString()}`} 
              icon={CreditCard} 
              variant={paymentInfo.remaining > 0 ? "warning" : "success"}
              subtitle="FCFA"
            />
          </div>

          {/* Payment Progress Card */}
          {paymentInfo.totalDue > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Suivi des Paiements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progression</span>
                  <span className="font-medium">{Math.round(paymentProgress)}%</span>
                </div>
                <Progress value={paymentProgress} className="h-3" />
                <div className="flex justify-between text-sm">
                  <div>
                    <p className="text-muted-foreground">Payé</p>
                    <p className="font-semibold text-green-600">{paymentInfo.totalPaid.toLocaleString()} FCFA</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">Reste</p>
                    <p className="font-semibold text-orange-600">{paymentInfo.remaining.toLocaleString()} FCFA</p>
                  </div>
                </div>
                <Button onClick={() => navigate('/invoices')} className="w-full" variant="outline">
                  Voir mes factures et payer
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-primary" />
                  Dernières Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {studentGrades.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Aucune note pour le moment</p>
                ) : (
                  <div className="space-y-3">
                    {studentGrades.map((grade) => (
                      <div key={grade.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{grade.subject_name}</p>
                          <p className="text-xs text-muted-foreground">{formatTimeAgo(grade.created_at)}</p>
                        </div>
                        <Badge variant={grade.value >= grade.max_value / 2 ? "default" : "destructive"}>
                          {grade.value}/{grade.max_value}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-accent" />
                  Actualités
                </CardTitle>
              </CardHeader>
              <CardContent>
                {publications.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Aucune actualité</p>
                ) : (
                  <div className="space-y-3">
                    {publications.slice(0, 4).map((pub) => (
                      <div key={pub.id} className="p-3 rounded-lg border border-border">
                        <p className="font-medium text-sm">{pub.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{pub.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">{formatTimeAgo(pub.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Default fallback
  return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement du tableau de bord...</p>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
