import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Settings, User, Lock, School, Sliders, CreditCard } from "lucide-react";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { ClassFeesSettings } from "@/components/settings/ClassFeesSettings";
import { FeeArticlesSettings } from "@/components/settings/FeeArticlesSettings";
import { TeacherRatesSettings } from "@/components/settings/TeacherRatesSettings";
import { PaymentReminderSettings } from "@/components/settings/PaymentReminderSettings";

const Parametres = () => {
  const { user, profileId, role, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
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
  });

  const fetchProfile = async () => {
    if (!profileId) return;

    const { data, error } = await supabase
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
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (error) throw error;

      toast({ title: "Succès", description: "Mot de passe mis à jour avec succès" });
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
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
        })
        .eq('id', schoolSettings.id);

      if (error) throw error;

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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-8 h-8" />
            Paramètres
          </h1>
          <p className="text-muted-foreground">Gérez vos paramètres et préférences</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" />
              Profil
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Lock className="w-4 h-4" />
              Sécurité
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="school" className="gap-2">
                  <School className="w-4 h-4" />
                  Établissement
                </TabsTrigger>
                <TabsTrigger value="fees" className="gap-2">
                  <CreditCard className="w-4 h-4" />
                  Facturation
                </TabsTrigger>
                <TabsTrigger value="system" className="gap-2">
                  <Sliders className="w-4 h-4" />
                  Système
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Informations du profil</CardTitle>
                <CardDescription>Mettez à jour vos informations personnelles</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar Upload */}
                {user && profileId && (
                  <div className="flex justify-center pb-4 border-b">
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
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Prénom</Label>
                    <Input
                      value={profileData.firstName}
                      onChange={e => setProfileData({ ...profileData, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Nom</Label>
                    <Input
                      value={profileData.lastName}
                      onChange={e => setProfileData({ ...profileData, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={profileData.email}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-sm text-muted-foreground mt-1">L'email ne peut pas être modifié</p>
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input
                    value={profileData.phone}
                    onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
                    placeholder="+229 XX XX XX XX"
                  />
                </div>
                <Button onClick={handleUpdateProfile} disabled={loading}>
                  {loading ? "Enregistrement..." : "Enregistrer les modifications"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Changer le mot de passe</CardTitle>
                <CardDescription>Assurez-vous d'utiliser un mot de passe sécurisé</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Nouveau mot de passe</Label>
                  <Input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    placeholder="Minimum 6 caractères"
                  />
                </div>
                <div>
                  <Label>Confirmer le nouveau mot de passe</Label>
                  <Input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  />
                </div>
                <Button onClick={handleUpdatePassword} disabled={loading}>
                  {loading ? "Mise à jour..." : "Mettre à jour le mot de passe"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* School Settings Tab */}
          {isAdmin && (
            <TabsContent value="school">
              <Card>
                <CardHeader>
                  <CardTitle>Paramètres de l'établissement</CardTitle>
                  <CardDescription>Configurez les informations de votre établissement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Nom de l'établissement</Label>
                    <Input
                      value={schoolSettings.schoolName}
                      onChange={e => setSchoolSettings({ ...schoolSettings, schoolName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Année scolaire en cours</Label>
                    <Input
                      value={schoolSettings.academicYear}
                      onChange={e => setSchoolSettings({ ...schoolSettings, academicYear: e.target.value })}
                      placeholder="2024-2025"
                    />
                  </div>
                  <Button onClick={handleUpdateSchoolSettings} disabled={loading}>
                    {loading ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Fees Settings Tab */}
          {isAdmin && (
            <TabsContent value="fees">
              <div className="space-y-6">
                <ClassFeesSettings />
                <FeeArticlesSettings />
                <TeacherRatesSettings />
                <PaymentReminderSettings
                  value={schoolSettings.paymentReminderFrequency}
                  onChange={(v) => {
                    setSchoolSettings({ ...schoolSettings, paymentReminderFrequency: v });
                  }}
                />
                <Button onClick={handleUpdateSchoolSettings} disabled={loading} className="w-full">
                  {loading ? "Enregistrement..." : "Enregistrer les paramètres de facturation"}
                </Button>
              </div>
            </TabsContent>
          )}

          {/* System Settings Tab */}
          {isAdmin && (
            <TabsContent value="system">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Système de périodes</CardTitle>
                    <CardDescription>Choisissez le système de découpage de l'année scolaire</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={schoolSettings.periodSystem}
                      onValueChange={v => setSchoolSettings({ ...schoolSettings, periodSystem: v })}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                        <RadioGroupItem value="trimester" id="trimester" />
                        <div className="flex-1">
                          <Label htmlFor="trimester" className="font-medium cursor-pointer">Trimestriel</Label>
                          <p className="text-sm text-muted-foreground">3 trimestres par année scolaire</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
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
                  <CardHeader>
                    <CardTitle>Système de notation</CardTitle>
                    <CardDescription>Choisissez le format de notation utilisé</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={schoolSettings.gradingSystem}
                      onValueChange={v => setSchoolSettings({ ...schoolSettings, gradingSystem: v })}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                        <RadioGroupItem value="numeric_10" id="numeric_10" />
                        <div className="flex-1">
                          <Label htmlFor="numeric_10" className="font-medium cursor-pointer">Sur 10</Label>
                          <p className="text-sm text-muted-foreground">Notes de 0 à 10</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                        <RadioGroupItem value="numeric_20" id="numeric_20" />
                        <div className="flex-1">
                          <Label htmlFor="numeric_20" className="font-medium cursor-pointer">Sur 20</Label>
                          <p className="text-sm text-muted-foreground">Notes de 0 à 20 (système français)</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                        <RadioGroupItem value="numeric_100" id="numeric_100" />
                        <div className="flex-1">
                          <Label htmlFor="numeric_100" className="font-medium cursor-pointer">Sur 100</Label>
                          <p className="text-sm text-muted-foreground">Notes de 0 à 100 (pourcentage)</p>
                        </div>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>

                <Button onClick={handleUpdateSchoolSettings} disabled={loading} className="w-full">
                  {loading ? "Enregistrement..." : "Enregistrer les paramètres système"}
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Parametres;
