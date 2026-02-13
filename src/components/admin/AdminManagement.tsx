import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Shield, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface AdminUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  permissions: Record<string, boolean>;
  created_by_user_id: string | null;
  is_super: boolean;
}

const PERMISSION_LABELS: Record<string, string> = {
  can_manage_teachers: "Gérer les enseignants",
  can_manage_students: "Gérer les apprenants",
  can_manage_classes: "Gérer les classes",
  can_manage_subjects: "Gérer les matières",
  can_manage_articles: "Gérer les articles",
  can_manage_invoices: "Gérer la facturation",
  can_manage_publications: "Gérer les publications",
  can_manage_events: "Gérer les événements",
  can_manage_timetable: "Gérer l'emploi du temps",
  can_manage_documents: "Gérer les documents",
  can_manage_admins: "Créer d'autres admins",
  can_sign_bulletins: "Signer les bulletins",
};

const DEFAULT_PERMISSIONS = Object.keys(PERMISSION_LABELS).reduce((acc, key) => {
  acc[key] = key !== 'can_manage_admins';
  return acc;
}, {} as Record<string, boolean>);

export const AdminManagement = () => {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
  });
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({ ...DEFAULT_PERMISSIONS });

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      // Fetch all admin permissions (RLS handles visibility)
      const { data: permsData } = await supabase
        .from('admin_permissions')
        .select('*');

      if (!permsData || permsData.length === 0) {
        setAdmins([]);
        setLoading(false);
        return;
      }

      // Fetch profiles for each admin
      const adminUserIds = permsData.map(p => p.admin_user_id);
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', adminUserIds);

      const profilesMap = new Map(
        (profilesData || []).map(p => [p.user_id, p])
      );

      // Check who is super admin
      const adminsFormatted: AdminUser[] = permsData.map(perm => {
        const profile = profilesMap.get(perm.admin_user_id);
        return {
          user_id: perm.admin_user_id,
          first_name: profile?.first_name || '',
          last_name: profile?.last_name || '',
          email: profile?.email || '',
          permissions: {
            can_manage_teachers: perm.can_manage_teachers ?? true,
            can_manage_students: perm.can_manage_students ?? true,
            can_manage_classes: perm.can_manage_classes ?? true,
            can_manage_subjects: perm.can_manage_subjects ?? true,
            can_manage_articles: perm.can_manage_articles ?? true,
            can_manage_invoices: perm.can_manage_invoices ?? true,
            can_manage_publications: perm.can_manage_publications ?? true,
            can_manage_events: perm.can_manage_events ?? true,
            can_manage_timetable: perm.can_manage_timetable ?? true,
            can_manage_documents: perm.can_manage_documents ?? true,
            can_manage_admins: perm.can_manage_admins ?? false,
            can_sign_bulletins: perm.can_sign_bulletins ?? true,
          },
          created_by_user_id: perm.created_by_user_id,
          is_super: !perm.created_by_user_id,
        };
      });

      setAdmins(adminsFormatted);
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreateAdmin = async () => {
    if (!formData.email || !formData.firstName || !formData.lastName) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          userType: 'admin',
          permissions: formPermissions,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Admin créé",
        description: `Email: ${data.email} | Mot de passe: ${data.generatedPassword}`,
        duration: 15000,
      });
      setIsCreateDialogOpen(false);
      setFormData({ email: "", firstName: "", lastName: "" });
      setFormPermissions({ ...DEFAULT_PERMISSIONS });
      fetchAdmins();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleTogglePermission = async (adminUserId: string, permKey: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('admin_permissions')
        .update({ [permKey]: !currentValue })
        .eq('admin_user_id', adminUserId);

      if (error) throw error;

      setAdmins(prev => prev.map(a =>
        a.user_id === adminUserId
          ? { ...a, permissions: { ...a.permissions, [permKey]: !currentValue } }
          : a
      ));
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const canManageAdmin = (admin: AdminUser): boolean => {
    if (admin.user_id === user?.id) return false;
    if (admin.is_super) return false;
    if (admin.created_by_user_id === user?.id) return true;
    // Super admins can manage all
    const currentAdmin = admins.find(a => a.user_id === user?.id);
    return currentAdmin?.is_super || false;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Gestion des Administrateurs
            </CardTitle>
            <CardDescription>Créez et gérez les permissions des administrateurs</CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nouvel admin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Créer un administrateur</DialogTitle>
                <DialogDescription>
                  Définissez les informations et permissions du nouvel administrateur
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Prénom *</Label>
                    <Input
                      value={formData.firstName}
                      onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Nom *</Label>
                    <Input
                      value={formData.lastName}
                      onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="admin@exemple.com"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Permissions</Label>
                  <div className="space-y-3 mt-2 border rounded-lg p-3">
                    {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm">{label}</span>
                        <Switch
                          checked={formPermissions[key] || false}
                          onCheckedChange={(checked) =>
                            setFormPermissions({ ...formPermissions, [key]: checked })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={handleCreateAdmin} className="w-full">Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-center py-4">Chargement...</p>
        ) : admins.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Aucun administrateur configuré</p>
        ) : (
          <div className="space-y-4">
            {admins.map(admin => (
              <Card key={admin.user_id} className="border">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium">{admin.first_name} {admin.last_name}</p>
                      <p className="text-sm text-muted-foreground">{admin.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {admin.is_super && (
                        <Badge variant="default">Super Admin</Badge>
                      )}
                      {admin.user_id === user?.id && (
                        <Badge variant="secondary">Vous</Badge>
                      )}
                    </div>
                  </div>
                  {canManageAdmin(admin) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                          <span className="text-sm">{label}</span>
                          <Switch
                            checked={admin.permissions[key] || false}
                            onCheckedChange={() => handleTogglePermission(admin.user_id, key, admin.permissions[key])}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(admin.permissions)
                        .filter(([, v]) => v)
                        .map(([key]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {PERMISSION_LABELS[key]}
                          </Badge>
                        ))
                      }
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
