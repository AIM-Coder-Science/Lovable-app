import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { Plus, Pencil, Trash2, Package } from "lucide-react";

interface FeeArticle {
  id: string;
  name: string;
  price: number;
  description: string | null;
  is_required: boolean;
  target_group: string;
  is_active: boolean;
}

export const FeeArticlesSettings = () => {
  const { settings } = useSchoolSettings();
  const [articles, setArticles] = useState<FeeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<FeeArticle | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
    is_required: false,
    target_group: "all",
  });

  const fetchArticles = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('fee_articles')
      .select('*')
      .eq('academic_year', settings.academic_year)
      .order('name', { ascending: true });

    setArticles(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (settings.academic_year) {
      fetchArticles();
    }
  }, [settings.academic_year]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.price) {
      toast({ title: "Erreur", description: "Veuillez remplir les champs obligatoires", variant: "destructive" });
      return;
    }

    const articleData = {
      name: formData.name,
      price: parseFloat(formData.price),
      description: formData.description || null,
      is_required: formData.is_required,
      target_group: formData.target_group,
      academic_year: settings.academic_year,
    };

    if (editingArticle) {
      const { error } = await supabase
        .from('fee_articles')
        .update(articleData)
        .eq('id', editingArticle.id);

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Succès", description: "Article modifié" });
    } else {
      const { error } = await supabase
        .from('fee_articles')
        .insert(articleData);

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Succès", description: "Article ajouté" });
    }

    resetForm();
    fetchArticles();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('fee_articles')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Succès", description: "Article supprimé" });
    fetchArticles();
  };

  const toggleActive = async (article: FeeArticle) => {
    const { error } = await supabase
      .from('fee_articles')
      .update({ is_active: !article.is_active })
      .eq('id', article.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    fetchArticles();
  };

  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      description: "",
      is_required: false,
      target_group: "all",
    });
    setEditingArticle(null);
    setDialogOpen(false);
  };

  const openEdit = (article: FeeArticle) => {
    setEditingArticle(article);
    setFormData({
      name: article.name,
      price: article.price.toString(),
      description: article.description || "",
      is_required: article.is_required,
      target_group: article.target_group,
    });
    setDialogOpen(true);
  };

  const getTargetLabel = (target: string) => {
    switch (target) {
      case 'all': return 'Tous les apprenants';
      case 'new_students': return 'Nouveaux apprenants';
      default: return target;
    }
  };

  if (loading) {
    return <div className="text-muted-foreground text-center py-4">Chargement...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Articles Supplémentaires
            </CardTitle>
            <CardDescription>
              Tenue de sport, macaron, fournitures, etc.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingArticle ? "Modifier l'article" : "Nouvel article"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Nom de l'article *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Tenue de sport"
                  />
                </div>
                <div>
                  <Label>Prix (FCFA) *</Label>
                  <Input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="10000"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Description optionnelle"
                  />
                </div>
                <div>
                  <Label>Cible</Label>
                  <Select
                    value={formData.target_group}
                    onValueChange={(v) => setFormData({ ...formData, target_group: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les apprenants</SelectItem>
                      <SelectItem value="new_students">Nouveaux apprenants uniquement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Obligatoire</Label>
                  <Switch
                    checked={formData.is_required}
                    onCheckedChange={(v) => setFormData({ ...formData, is_required: v })}
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={handleSubmit} className="flex-1">
                    {editingArticle ? "Modifier" : "Ajouter"}
                  </Button>
                  <Button variant="outline" onClick={resetForm}>
                    Annuler
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {articles.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Aucun article. Cliquez sur "Ajouter" pour créer un article.
            </p>
          ) : (
            articles.map((article) => (
              <div
                key={article.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  article.is_active ? 'border-border bg-muted/30' : 'border-muted bg-muted/10 opacity-60'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{article.name}</p>
                    {article.is_required && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        Obligatoire
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getTargetLabel(article.target_group)} • {article.price.toLocaleString()} FCFA
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={article.is_active}
                    onCheckedChange={() => toggleActive(article)}
                  />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(article)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(article.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
