import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Bell, Calendar, Plus, Pencil, Trash2, Megaphone, Users, GraduationCap, Search, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ExpandableText } from "@/components/ui/expandable-text";

interface Publication {
  id: string;
  title: string;
  content: string;
  author_id: string | null;
  author_type: string;
  visibility: string;
  is_published: boolean;
  created_at: string;
}

const Actualites = () => {
  const { role, user } = useAuth();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPub, setSelectedPub] = useState<Publication | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisibility, setFilterVisibility] = useState<string>("all");
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    visibility: "all",
  });

  const fetchPublications = async () => {
    setLoading(true);
    
    let query = supabase
      .from('publications')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (role === 'student') {
      query = query.or('visibility.eq.all,visibility.eq.students');
    } else if (role === 'teacher') {
      query = query.or('visibility.eq.all,visibility.eq.teachers');
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les actualités", variant: "destructive" });
    } else {
      setPublications(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (role) {
      fetchPublications();
    }
  }, [role]);

  const handleCreate = async () => {
    if (!formData.title || !formData.content) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from('publications').insert({
        title: formData.title,
        content: formData.content,
        visibility: formData.visibility,
        author_id: user?.id,
        author_type: 'admin',
        is_published: true,
      });

      if (error) throw error;

      toast({ title: "Succès", description: "Publication créée" });
      setIsCreateDialogOpen(false);
      setFormData({ title: "", content: "", visibility: "all" });
      fetchPublications();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!selectedPub || !formData.title || !formData.content) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from('publications')
        .update({
          title: formData.title,
          content: formData.content,
          visibility: formData.visibility,
        })
        .eq('id', selectedPub.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Publication modifiée" });
      setIsEditDialogOpen(false);
      setSelectedPub(null);
      setFormData({ title: "", content: "", visibility: "all" });
      fetchPublications();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette publication ?")) return;

    try {
      const { error } = await supabase.from('publications').delete().eq('id', id);
      if (error) throw error;

      toast({ title: "Succès", description: "Publication supprimée" });
      fetchPublications();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const getVisibilityBadge = (visibility: string) => {
    switch (visibility) {
      case "all":
        return <Badge variant="secondary" className="gap-1"><Users className="w-3 h-3" /> Tous</Badge>;
      case "teachers":
        return <Badge className="bg-accent text-accent-foreground gap-1"><Users className="w-3 h-3" /> Enseignants</Badge>;
      case "students":
        return <Badge className="bg-primary text-primary-foreground gap-1"><GraduationCap className="w-3 h-3" /> Apprenants</Badge>;
      default:
        return null;
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case "teachers":
        return <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center"><Users className="w-5 h-5 text-accent" /></div>;
      case "students":
        return <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-primary" /></div>;
      default:
        return <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"><Megaphone className="w-5 h-5 text-foreground" /></div>;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return `Il y a ${minutes} min`;
      }
      return `Il y a ${hours}h`;
    } else if (days === 1) {
      return "Hier";
    } else if (days < 7) {
      return `Il y a ${days} jours`;
    }
    
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const filteredPublications = publications.filter(pub => {
    const matchesSearch = pub.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          pub.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterVisibility === "all" || pub.visibility === filterVisibility;
    return matchesSearch && (role !== 'admin' || matchesFilter);
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Actualités</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              {role === 'admin' ? 'Gérez les publications' : 'Restez informé des dernières nouvelles'}
            </p>
          </div>
          {role === 'admin' && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto">
                  <Plus className="w-4 h-4" />
                  Nouvelle publication
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg mx-4 sm:mx-auto">
                <DialogHeader>
                  <DialogTitle>Créer une publication</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Titre *</Label>
                    <Input 
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Titre de la publication"
                    />
                  </div>
                  <div>
                    <Label>Contenu *</Label>
                    <Textarea 
                      value={formData.content}
                      onChange={e => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Contenu de la publication..."
                      rows={5}
                    />
                  </div>
                  <div>
                    <Label>Visibilité</Label>
                    <Select value={formData.visibility} onValueChange={v => setFormData({ ...formData, visibility: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous (enseignants et apprenants)</SelectItem>
                        <SelectItem value="teachers">Enseignants uniquement</SelectItem>
                        <SelectItem value="students">Apprenants uniquement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreate} className="w-full">Publier</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Rechercher une actualité..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {role === 'admin' && (
            <Select value={filterVisibility} onValueChange={setFilterVisibility}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="teachers">Enseignants</SelectItem>
                <SelectItem value="students">Apprenants</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Stats Cards for Admin */}
        {role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Megaphone className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{publications.length}</p>
                  <p className="text-sm text-muted-foreground">Publications totales</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {publications.filter(p => p.visibility === 'teachers').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Pour enseignants</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {publications.filter(p => p.visibility === 'students').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Pour apprenants</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Publications List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredPublications.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Aucune actualité</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                {searchQuery ? "Aucun résultat pour votre recherche." : "Il n'y a pas d'actualités pour le moment."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredPublications.map((pub, index) => (
              <Card 
                key={pub.id} 
                className="group hover:shadow-lg transition-all duration-300 overflow-hidden animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-4">
                    {getVisibilityIcon(pub.visibility)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-semibold text-foreground line-clamp-2">{pub.title}</h3>
                        {role === 'admin' && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedPub(pub);
                                setFormData({ title: pub.title, content: pub.content, visibility: pub.visibility });
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDelete(pub.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(pub.created_at)}
                        </span>
                        {role === 'admin' && getVisibilityBadge(pub.visibility)}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ExpandableText text={pub.content} maxLength={200} className="text-foreground/80 leading-relaxed" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg mx-4 sm:mx-auto">
            <DialogHeader>
              <DialogTitle>Modifier la publication</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Titre *</Label>
                <Input 
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Contenu *</Label>
                <Textarea 
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  rows={5}
                />
              </div>
              <div>
                <Label>Visibilité</Label>
                <Select value={formData.visibility} onValueChange={v => setFormData({ ...formData, visibility: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="teachers">Enseignants uniquement</SelectItem>
                    <SelectItem value="students">Apprenants uniquement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleUpdate} className="w-full">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Actualites;