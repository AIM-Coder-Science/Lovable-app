import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Phone, Mail, Building2, Users, Crown, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface AdminMember {
  id: string;
  title: string;
  role_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  order_index: number;
  is_active: boolean;
}

const ROLE_ICONS: Record<string, React.ElementType> = {
  "Directeur": Crown,
  "Censeur": Shield,
  "Surveillant": Users,
  "Secrétaire": Building2,
};

const Administration = () => {
  const { role } = useAuth();
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<AdminMember | null>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    role_name: "",
    phone: "",
    email: "",
    photo_url: "",
    order_index: 0,
  });

  const fetchMembers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('administration_members')
      .select('*')
      .eq('is_active', true)
      .order('order_index');

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les données", variant: "destructive" });
    } else {
      setMembers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleCreate = async () => {
    if (!formData.title || !formData.role_name) {
      toast({ title: "Erreur", description: "Le nom et le titre sont requis", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from('administration_members').insert({
        title: formData.title,
        role_name: formData.role_name,
        phone: formData.phone || null,
        email: formData.email || null,
        photo_url: formData.photo_url || null,
        order_index: formData.order_index,
      });

      if (error) throw error;

      toast({ title: "Succès", description: "Membre ajouté" });
      setIsDialogOpen(false);
      resetForm();
      fetchMembers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!selectedMember || !formData.title || !formData.role_name) {
      toast({ title: "Erreur", description: "Le nom et le titre sont requis", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from('administration_members')
        .update({
          title: formData.title,
          role_name: formData.role_name,
          phone: formData.phone || null,
          email: formData.email || null,
          photo_url: formData.photo_url || null,
          order_index: formData.order_index,
        })
        .eq('id', selectedMember.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Membre modifié" });
      setIsEditDialogOpen(false);
      setSelectedMember(null);
      resetForm();
      fetchMembers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce membre ?")) return;

    try {
      const { error } = await supabase
        .from('administration_members')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;

      toast({ title: "Succès", description: "Membre supprimé" });
      fetchMembers();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      role_name: "",
      phone: "",
      email: "",
      photo_url: "",
      order_index: members.length,
    });
  };

  const openEditDialog = (member: AdminMember) => {
    setSelectedMember(member);
    setFormData({
      title: member.title,
      role_name: member.role_name,
      phone: member.phone || "",
      email: member.email || "",
      photo_url: member.photo_url || "",
      order_index: member.order_index,
    });
    setIsEditDialogOpen(true);
  };

  const getRoleColor = (roleName: string) => {
    switch (roleName.toLowerCase()) {
      case "directeur":
        return "bg-primary/20 text-primary border-primary/30";
      case "censeur":
        return "bg-accent/20 text-accent border-accent/30";
      case "surveillant":
        return "bg-warning/20 text-warning border-warning/30";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const getRoleIcon = (roleName: string) => {
    const Icon = ROLE_ICONS[roleName] || Building2;
    return Icon;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Administration</h1>
            <p className="text-muted-foreground mt-1">
              {role === 'admin' ? 'Gérez les membres de l\'administration' : 'L\'équipe administrative de l\'établissement'}
            </p>
          </div>
          {role === 'admin' && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Ajouter un membre
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nouveau membre</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Nom complet *</Label>
                    <Input 
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Ex: M. Jean DUPONT"
                    />
                  </div>
                  <div>
                    <Label>Fonction *</Label>
                    <Input 
                      value={formData.role_name}
                      onChange={e => setFormData({ ...formData, role_name: e.target.value })}
                      placeholder="Ex: Directeur, Censeur, Surveillant..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Téléphone</Label>
                      <Input 
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+229 XX XX XX XX"
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="email@exemple.com"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Ordre d'affichage</Label>
                    <Input 
                      type="number"
                      value={formData.order_index}
                      onChange={e => setFormData({ ...formData, order_index: Number(e.target.value) })}
                      min={0}
                    />
                  </div>
                  <Button onClick={handleCreate} className="w-full">Ajouter</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Members Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : members.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Aucun membre</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                L'administration n'a pas encore été configurée.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {members.map((member, idx) => {
              const RoleIcon = getRoleIcon(member.role_name);
              return (
                <Card 
                  key={member.id} 
                  className="group hover:shadow-lg transition-all duration-300 overflow-hidden animate-fade-in"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center">
                      <Avatar className="w-20 h-20 mb-4 ring-4 ring-background shadow-lg">
                        <AvatarImage src={member.photo_url || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xl font-semibold">
                          {member.title.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      
                      <h3 className="font-semibold text-foreground text-lg">{member.title}</h3>
                      
                      <Badge className={`mt-2 gap-1 ${getRoleColor(member.role_name)}`}>
                        <RoleIcon className="w-3 h-3" />
                        {member.role_name}
                      </Badge>
                      
                      <div className="mt-4 space-y-2 w-full">
                        {member.phone && (
                          <a 
                            href={`tel:${member.phone}`}
                            className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Phone className="w-4 h-4" />
                            {member.phone}
                          </a>
                        )}
                        {member.email && (
                          <a 
                            href={`mailto:${member.email}`}
                            className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors truncate"
                          >
                            <Mail className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{member.email}</span>
                          </a>
                        )}
                      </div>
                      
                      {role === 'admin' && (
                        <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(member)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(member.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier le membre</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Nom complet *</Label>
                <Input 
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Fonction *</Label>
                <Input 
                  value={formData.role_name}
                  onChange={e => setFormData({ ...formData, role_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Téléphone</Label>
                  <Input 
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input 
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Ordre d'affichage</Label>
                <Input 
                  type="number"
                  value={formData.order_index}
                  onChange={e => setFormData({ ...formData, order_index: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <Button onClick={handleUpdate} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Administration;