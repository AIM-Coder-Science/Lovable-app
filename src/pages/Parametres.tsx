import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { 
  Settings, User, Lock, School, Sliders, CreditCard, Shield,
  ChevronRight, Save, MessageCircle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AdminManagement } from "@/components/admin/AdminManagement";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { ClassFeesSettings } from "@/components/settings/ClassFeesSettings";
import { FeeArticlesSettings } from "@/components/settings/FeeArticlesSettings";
import { TeacherRatesSettings } from "@/components/settings/TeacherRatesSettings";
import { PaymentReminderSettings } from "@/components/settings/PaymentReminderSettings";
import { ProfileEditSettings } from "@/components/settings/ProfileEditSettings";

interface NavSection {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const sections: NavSection[] = [
  { id: "profile", label: "Profil", icon: User },
  { id: "security", label: "Sécurité", icon: Lock },
  { id: "school", label: "Établissement", icon: School, adminOnly: true },
  { id: "fees", label: "Facturation", icon: CreditCard, adminOnly: true },
  { id: "system", label: "Système", icon: Sliders, adminOnly: true },
  { id: "admins", label: "Administrateurs", icon: Shield, adminOnly: true },
];

const Parametres = () => {
  const { user, profileId, role, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("profile");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [schoolSettings, setSchoolSettings] = useState({
    id: "",
    schoolName: "TinTin Kapi",
    academicYear: "2024-2025",
    periodSystem: "trimester",
    gradingSystem: "numeric_20",
    paymentReminderFrequency: "monthly",
    chatEnabled: false,
  });

  const fetchProfile = async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, phone, avatar_url')
      .eq('id', profileId)
      .single();

    if (data) {
      setProfileData({
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phone: data.phone || "",
      });
      setAvatarUrl(data.avatar_url);
    }
  };

  const fetchSchoolSettings = async () => {
    const { data } = await supabase
      .from('school_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (data) {
      setSchoolSettings({
        id: data.id,
        schoolName: data.school_name,
        academicYear: data.academic_year,
        periodSystem: data.period_system,
        gradingSystem: data.grading_system,
        paymentReminderFrequency: data.payment_reminder_frequency || 'monthly',
        chatEnabled: (data as any).chat_enabled ?? false,
      });
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchSchoolSettings();
  }, [profileId]);

  const handleUpdateProfile = async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profileData.firstName,
          last_name: profileData.lastName,
          phone: profileData.phone || null,
        })
        .eq('id', profileId);
      if (error) throw error;
      toast({ title: "Succès", description: "Profil mis à jour avec succès" });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 6 caractères", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordData.newPassword });
      if (error) throw error;
      toast({ title: "Succès", description: "Mot de passe mis à jour avec succès" });
      setPasswordData({ newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSchoolSettings = async () => {
    if (!schoolSettings.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('school_settings')
        .update({
          school_name: schoolSettings.schoolName,
          academic_year: schoolSettings.academicYear,
          period_system: schoolSettings.periodSystem,
          grading_system: schoolSettings.gradingSystem,
          payment_reminder_frequency: schoolSettings.paymentReminderFrequency,
          chat_enabled: schoolSettings.chatEnabled,
        } as any)
        .eq('id', schoolSettings.id);
      if (error) throw error;

      // If chat was just enabled, setup chat rooms
      if (schoolSettings.chatEnabled) {
        try {
          await supabase.functions.invoke('setup-chat-rooms');
        } catch (e) {
          console.error('Chat room setup error:', e);
        }
      }

      toast({ title: "Succès", description: "Paramètres enregistrés avec succès" });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
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

  const isAdmin = role === 'admin';
  const filteredSections = sections.filter(s => !s.adminOnly || isAdmin);

  const renderContent = () => {
    switch (activeSection) {
      case "profile":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Informations du profil</h2>
              <p className="text-sm text-muted-foreground">Mettez à jour vos informations personnelles</p>
            </div>
            <Separator />
            {user && profileId && (
              <div className="flex justify-center pb-4">
                <AvatarUpload
                  currentAvatarUrl={avatarUrl}
                  userId={user.id}
                  profileId={profileId}
                  firstName={profileData.firstName}
                  lastName={profileData.lastName}
                  onUploadComplete={(url) => setAvatarUrl(url)}
                  size="lg"
                />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Prénom</Label>
                <Input
                  value={profileData.firstName}
                  onChange={e => setProfileData({ ...profileData, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={profileData.lastName}
                  onChange={e => setProfileData({ ...profileData, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={profileData.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">L'email ne peut pas être modifié</p>
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={profileData.phone}
                onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
                placeholder="+229 XX XX XX XX"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleUpdateProfile} disabled={loading} className="gap-2">
                <Save className="w-4 h-4" />
                {loading ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        );

      case "security":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Sécurité du compte</h2>
              <p className="text-sm text-muted-foreground">
                {isAdmin ? "Modifiez votre mot de passe" : "Les modifications de mot de passe doivent être demandées à l'administration"}
              </p>
            </div>
            <Separator />
            {isAdmin ? (
              <div className="max-w-md space-y-4">
                <div className="space-y-2">
                  <Label>Nouveau mot de passe</Label>
                  <Input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    placeholder="Minimum 6 caractères"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmer le nouveau mot de passe</Label>
                  <Input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  />
                </div>
                <Button onClick={handleUpdatePassword} disabled={loading} className="gap-2">
                  <Save className="w-4 h-4" />
                  {loading ? "Mise à jour..." : "Mettre à jour le mot de passe"}
                </Button>
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Pour des raisons de sécurité, veuillez contacter l'administration pour toute demande de réinitialisation.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case "school":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Paramètres de l'établissement</h2>
              <p className="text-sm text-muted-foreground">Configurez les informations de votre établissement</p>
            </div>
            <Separator />
            <div className="max-w-lg space-y-4">
              <div className="space-y-2">
                <Label>Nom de l'établissement</Label>
                <Input
                  value={schoolSettings.schoolName}
                  onChange={e => setSchoolSettings({ ...schoolSettings, schoolName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Année scolaire en cours</Label>
                <Input
                  value={schoolSettings.academicYear}
                  onChange={e => setSchoolSettings({ ...schoolSettings, academicYear: e.target.value })}
                  placeholder="2024-2025"
                />
              </div>
              <Button onClick={handleUpdateSchoolSettings} disabled={loading} className="gap-2">
                <Save className="w-4 h-4" />
                {loading ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        );

      case "fees":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Facturation</h2>
              <p className="text-sm text-muted-foreground">Gérez les frais, articles et taux horaires</p>
            </div>
            <Separator />
            <ClassFeesSettings />
            <FeeArticlesSettings />
            <TeacherRatesSettings />
            <PaymentReminderSettings
              value={schoolSettings.paymentReminderFrequency}
              onChange={(v) => setSchoolSettings({ ...schoolSettings, paymentReminderFrequency: v })}
            />
            <Button onClick={handleUpdateSchoolSettings} disabled={loading} className="w-full gap-2">
              <Save className="w-4 h-4" />
              {loading ? "Enregistrement..." : "Enregistrer les paramètres de facturation"}
            </Button>
          </div>
        );

      case "system":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Paramètres système</h2>
              <p className="text-sm text-muted-foreground">Configurez le système de notation et de périodes</p>
            </div>
            <Separator />
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Système de périodes</CardTitle>
                <CardDescription>Découpage de l'année scolaire</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={schoolSettings.periodSystem}
                  onValueChange={v => setSchoolSettings({ ...schoolSettings, periodSystem: v })}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                    <RadioGroupItem value="trimester" id="trimester" />
                    <div className="flex-1">
                      <Label htmlFor="trimester" className="font-medium cursor-pointer">Trimestriel</Label>
                      <p className="text-sm text-muted-foreground">3 trimestres par année scolaire</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                    <RadioGroupItem value="semester" id="semester" />
                    <div className="flex-1">
                      <Label htmlFor="semester" className="font-medium cursor-pointer">Semestriel</Label>
                      <p className="text-sm text-muted-foreground">2 semestres par année scolaire</p>
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Système de notation</CardTitle>
                <CardDescription>Format de notation utilisé</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={schoolSettings.gradingSystem}
                  onValueChange={v => setSchoolSettings({ ...schoolSettings, gradingSystem: v })}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                    <RadioGroupItem value="numeric_10" id="numeric_10" />
                    <div className="flex-1">
                      <Label htmlFor="numeric_10" className="font-medium cursor-pointer">Sur 10</Label>
                      <p className="text-sm text-muted-foreground">Notes de 0 à 10</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                    <RadioGroupItem value="numeric_20" id="numeric_20" />
                    <div className="flex-1">
                      <Label htmlFor="numeric_20" className="font-medium cursor-pointer">Sur 20</Label>
                      <p className="text-sm text-muted-foreground">Notes de 0 à 20 (système français)</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                    <RadioGroupItem value="numeric_100" id="numeric_100" />
                    <div className="flex-1">
                      <Label htmlFor="numeric_100" className="font-medium cursor-pointer">Sur 100</Label>
                      <p className="text-sm text-muted-foreground">Notes de 0 à 100 (pourcentage)</p>
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            <ProfileEditSettings />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Messagerie
                </CardTitle>
                <CardDescription>Activer ou désactiver le système de chat</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Chat activé</Label>
                    <p className="text-sm text-muted-foreground">Les enseignants et apprenants pourront utiliser la messagerie</p>
                  </div>
                  <Switch
                    checked={schoolSettings.chatEnabled}
                    onCheckedChange={v => setSchoolSettings({ ...schoolSettings, chatEnabled: v })}
                  />
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleUpdateSchoolSettings} disabled={loading} className="w-full gap-2">
              <Save className="w-4 h-4" />
              {loading ? "Enregistrement..." : "Enregistrer les paramètres système"}
            </Button>
          </div>
        );

      case "admins":
        return <AdminManagement />;

      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-8 h-8" />
            Paramètres
          </h1>
          <p className="text-muted-foreground">Gérez vos paramètres et préférences</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <nav className="lg:w-64 shrink-0">
            <Card>
              <CardContent className="p-2">
                <div className="space-y-1">
                  {filteredSections.map(section => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1 text-left">{section.label}</span>
                        {isActive && <ChevronRight className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </nav>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            <Card>
              <CardContent className="p-6">
                {renderContent()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Parametres;
