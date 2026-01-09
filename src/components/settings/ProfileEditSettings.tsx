import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, User, Users } from "lucide-react";

interface ProfileEditSettingsType {
  students_can_edit_avatar: boolean;
  students_can_edit_phone: boolean;
  teachers_can_edit_avatar: boolean;
  teachers_can_edit_phone: boolean;
}

const defaultSettings: ProfileEditSettingsType = {
  students_can_edit_avatar: true,
  students_can_edit_phone: false,
  teachers_can_edit_avatar: true,
  teachers_can_edit_phone: false,
};

export const ProfileEditSettings = () => {
  const [settings, setSettings] = useState<ProfileEditSettingsType>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [settingsId, setSettingsId] = useState<string>("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('school_settings')
      .select('id, profile_edit_settings')
      .limit(1)
      .maybeSingle();

    if (data) {
      setSettingsId(data.id);
      if (data.profile_edit_settings && typeof data.profile_edit_settings === 'object') {
        const parsed = data.profile_edit_settings as unknown as ProfileEditSettingsType;
        setSettings({
          ...defaultSettings,
          ...parsed,
        });
      }
    }
  };

  const handleSave = async () => {
    if (!settingsId) {
      toast({ title: "Erreur", description: "Paramètres non trouvés", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('school_settings')
        .update({ profile_edit_settings: JSON.parse(JSON.stringify(settings)) })
        .eq('id', settingsId);

      if (error) throw error;

      toast({ title: "Succès", description: "Paramètres de profil enregistrés" });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Permissions de modification de profil
        </CardTitle>
        <CardDescription>
          Contrôlez les informations que les utilisateurs peuvent modifier dans leur profil
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Students Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="w-4 h-4" />
            Apprenants
          </div>
          <div className="ml-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Photo de profil</Label>
                <p className="text-sm text-muted-foreground">
                  Les apprenants peuvent modifier leur photo de profil
                </p>
              </div>
              <Switch
                checked={settings.students_can_edit_avatar}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, students_can_edit_avatar: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Numéro de téléphone</Label>
                <p className="text-sm text-muted-foreground">
                  Les apprenants peuvent modifier leur numéro de téléphone
                </p>
              </div>
              <Switch
                checked={settings.students_can_edit_phone}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, students_can_edit_phone: checked })
                }
              />
            </div>
          </div>
        </div>

        {/* Teachers Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <User className="w-4 h-4" />
            Enseignants
          </div>
          <div className="ml-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Photo de profil</Label>
                <p className="text-sm text-muted-foreground">
                  Les enseignants peuvent modifier leur photo de profil
                </p>
              </div>
              <Switch
                checked={settings.teachers_can_edit_avatar}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, teachers_can_edit_avatar: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Numéro de téléphone</Label>
                <p className="text-sm text-muted-foreground">
                  Les enseignants peuvent modifier leur numéro de téléphone
                </p>
              </div>
              <Switch
                checked={settings.teachers_can_edit_phone}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, teachers_can_edit_phone: checked })
                }
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-4">
            <strong>Note :</strong> Les noms, emails et mots de passe ne peuvent être modifiés que par un administrateur.
            Les demandes de changement de mot de passe sont soumises à validation.
          </p>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Enregistrement..." : "Enregistrer les permissions"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
