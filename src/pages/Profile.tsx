import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  User, Mail, Phone, Calendar, GraduationCap, Users, 
  BookOpen, MapPin, Shield, Save, Lock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfileSettings } from "@/hooks/useProfileSettings";
import { toast } from "@/hooks/use-toast";
import { AvatarUpload } from "@/components/profile/AvatarUpload";

interface TeacherProfile {
  id: string;
  employee_id: string | null;
  profile: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    user_id: string;
  };
  specialties: { name: string }[];
  classes: { name: string; is_principal: boolean }[];
}

interface StudentProfile {
  id: string;
  matricule: string;
  birthday: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  profile: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    user_id: string;
  };
  class: { name: string; level: string } | null;
}

const Profile = () => {
  const { user, role, teacherId, studentId } = useAuth();
  const { settings } = useProfileSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [editablePhone, setEditablePhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const canEditPhone = role === 'teacher' 
    ? settings.teachers_can_edit_phone 
    : settings.students_can_edit_phone;
    
  const canEditAvatar = role === 'teacher'
    ? settings.teachers_can_edit_avatar
    : settings.students_can_edit_avatar;

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      setLoading(true);

      if (role === 'teacher' && teacherId) {
        const { data: teacher } = await supabase
          .from('teachers')
          .select(`
            id, employee_id,
            profiles!teachers_profile_id_fkey (id, first_name, last_name, email, phone, avatar_url, user_id)
          `)
          .eq('id', teacherId)
          .single();

        if (teacher) {
          // Fetch specialties
          const { data: specialties } = await supabase
            .from('teacher_specialties')
            .select('subjects(name)')
            .eq('teacher_id', teacherId);

          // Fetch classes
          const { data: classes } = await supabase
            .from('teacher_classes')
            .select('is_principal, classes(name)')
            .eq('teacher_id', teacherId);

          setTeacherProfile({
            ...teacher,
            profile: (teacher as any).profiles,
            specialties: (specialties || []).map((s: any) => ({ name: s.subjects?.name || '' })),
            classes: (classes || []).map((c: any) => ({ name: c.classes?.name || '', is_principal: c.is_principal })),
          });
          setEditablePhone((teacher as any).profiles?.phone || '');
          setAvatarUrl((teacher as any).profiles?.avatar_url);
        }
      }

      if (role === 'student' && studentId) {
        const { data: student } = await supabase
          .from('students')
          .select(`
            id, matricule, birthday, parent_name, parent_phone,
            profiles!students_profile_id_fkey (id, first_name, last_name, email, phone, avatar_url, user_id),
            classes (name, level)
          `)
          .eq('id', studentId)
          .single();

        if (student) {
          setStudentProfile({
            ...student,
            profile: (student as any).profiles,
            class: (student as any).classes,
          });
          setEditablePhone((student as any).profiles?.phone || '');
          setAvatarUrl((student as any).profiles?.avatar_url);
        }
      }

      setLoading(false);
    };

    fetchProfile();
  }, [user, role, teacherId, studentId]);

  const handleSavePhone = async () => {
    if (!canEditPhone) return;
    
    setSaving(true);
    try {
      const profileId = role === 'teacher' 
        ? teacherProfile?.profile.id 
        : studentProfile?.profile.id;

      if (!profileId) throw new Error("Profile non trouvé");

      const { error } = await supabase
        .from('profiles')
        .update({ phone: editablePhone || null })
        .eq('id', profileId);

      if (error) throw error;

      toast({ title: "Succès", description: "Téléphone mis à jour" });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpdate = (url: string) => {
    setAvatarUrl(url);
    if (teacherProfile) {
      setTeacherProfile({
        ...teacherProfile,
        profile: { ...teacherProfile.profile, avatar_url: url }
      });
    }
    if (studentProfile) {
      setStudentProfile({
        ...studentProfile,
        profile: { ...studentProfile.profile, avatar_url: url }
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const profile = teacherProfile?.profile || studentProfile?.profile;
  const initials = profile 
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : 'U';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Mon Profil</h1>
          <p className="text-muted-foreground mt-1">
            Consultez vos informations personnelles
          </p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Avatar */}
              <div className="relative">
                {canEditAvatar && user && profile ? (
                  <AvatarUpload
                    currentAvatarUrl={avatarUrl}
                    userId={user.id}
                    profileId={profile.id}
                    firstName={profile.first_name}
                    lastName={profile.last_name}
                    onUploadComplete={handleAvatarUpdate}
                    size="lg"
                  />
                ) : (
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={avatarUrl || undefined} />
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
              
              <div className="text-center sm:text-left flex-1">
                <CardTitle className="text-2xl">
                  {profile?.first_name} {profile?.last_name}
                </CardTitle>
                <CardDescription className="text-base mt-1">
                  {role === 'teacher' ? 'Enseignant' : 'Apprenant'}
                </CardDescription>
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                  {role === 'teacher' && teacherProfile?.employee_id && (
                    <Badge variant="outline" className="gap-1">
                      <Shield className="w-3 h-3" />
                      {teacherProfile.employee_id}
                    </Badge>
                  )}
                  {role === 'student' && studentProfile?.matricule && (
                    <Badge variant="outline" className="gap-1">
                      <Shield className="w-3 h-3" />
                      {studentProfile.matricule}
                    </Badge>
                  )}
                  {role === 'student' && studentProfile?.class && (
                    <Badge className="gap-1">
                      <GraduationCap className="w-3 h-3" />
                      {studentProfile.class.name}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" />
              Informations de contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  Email
                </Label>
                <Input value={profile?.email || ''} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Non modifiable
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  Téléphone
                </Label>
                <div className="flex gap-2">
                  <Input 
                    value={editablePhone} 
                    onChange={(e) => setEditablePhone(e.target.value)}
                    disabled={!canEditPhone}
                    className={!canEditPhone ? "bg-muted" : ""}
                    placeholder="+229 XX XX XX XX"
                  />
                  {canEditPhone && (
                    <Button 
                      onClick={handleSavePhone} 
                      disabled={saving}
                      size="icon"
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {!canEditPhone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Contactez l'administration pour modifier
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student-specific info */}
        {role === 'student' && studentProfile && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" />
                  Informations scolaires
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Matricule</Label>
                    <Input value={studentProfile.matricule} disabled className="bg-muted font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Classe</Label>
                    <Input 
                      value={studentProfile.class 
                        ? `${studentProfile.class.name} (${studentProfile.class.level})`
                        : 'Non assigné'
                      } 
                      disabled 
                      className="bg-muted" 
                    />
                  </div>
                  {studentProfile.birthday && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        Date de naissance
                      </Label>
                      <Input 
                        value={new Date(studentProfile.birthday).toLocaleDateString('fr-FR')} 
                        disabled 
                        className="bg-muted" 
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {(studentProfile.parent_name || studentProfile.parent_phone) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Informations du parent/tuteur
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {studentProfile.parent_name && (
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Nom</Label>
                        <Input value={studentProfile.parent_name} disabled className="bg-muted" />
                      </div>
                    )}
                    {studentProfile.parent_phone && (
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Téléphone</Label>
                        <Input value={studentProfile.parent_phone} disabled className="bg-muted" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Teacher-specific info */}
        {role === 'teacher' && teacherProfile && (
          <>
            {teacherProfile.specialties.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    Spécialités
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {teacherProfile.specialties.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-sm">
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {teacherProfile.classes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <GraduationCap className="w-5 h-5" />
                    Classes assignées
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {teacherProfile.classes.map((c, i) => (
                      <Badge 
                        key={i} 
                        variant={c.is_principal ? "default" : "secondary"}
                        className="text-sm"
                      >
                        {c.name}
                        {c.is_principal && " (Principal)"}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Security notice */}
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-warning">Modification des informations</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Pour modifier votre nom, prénom ou mot de passe, veuillez contacter l'administration. 
                  Vous pouvez demander une réinitialisation de mot de passe depuis la page de connexion.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
