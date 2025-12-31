import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Search, Download, Trash2, FileText, FolderOpen } from "lucide-react";

interface Document {
  id: string;
  title: string;
  doc_type: string;
  file_url: string;
  visibility: string;
  class_id: string | null;
  created_at: string;
  class_name?: string;
}

const DOC_TYPES = [
  { value: "bulletin", label: "Bulletin" },
  { value: "schedule", label: "Emploi du temps" },
  { value: "info", label: "Information" },
  { value: "other", label: "Autre" },
];

const Documents = () => {
  const { role, user, loading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [uploadData, setUploadData] = useState({
    title: "",
    docType: "info",
    visibility: "all",
    classId: "",
    file: null as File | null,
  });

  const fetchDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('documents')
      .select(`
        id, title, doc_type, file_url, visibility, class_id, created_at,
        classes (name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les documents", variant: "destructive" });
    } else {
      const formattedData = (data || []).map((d: any) => ({
        ...d,
        class_name: d.classes?.name,
      }));
      setDocuments(formattedData);
    }
    setLoading(false);
  };

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (data) setClasses(data);
  };

  useEffect(() => {
    fetchDocuments();
    fetchClasses();
  }, []);

  const handleUpload = async () => {
    if (!uploadData.title || !uploadData.file) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs obligatoires", variant: "destructive" });
      return;
    }

    setUploading(true);

    try {
      // Upload file to storage
      const fileExt = uploadData.file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, uploadData.file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Create document record
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          title: uploadData.title,
          doc_type: uploadData.docType,
          file_url: urlData.publicUrl,
          visibility: uploadData.visibility,
          class_id: uploadData.classId || null,
          uploaded_by: user?.id,
        });

      if (insertError) throw insertError;

      toast({ title: "Succès", description: "Document téléchargé avec succès" });
      setIsUploadDialogOpen(false);
      setUploadData({ title: "", docType: "info", visibility: "all", classId: "", file: null });
      fetchDocuments();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce document ?")) return;

    try {
      // Delete from storage
      const fileName = doc.file_url.split('/').pop();
      if (fileName) {
        await supabase.storage
          .from('documents')
          .remove([`documents/${fileName}`]);
      }

      // Delete record
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Document supprimé" });
      fetchDocuments();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || doc.doc_type === filterType;
    return matchesSearch && matchesType;
  });

  const getDocTypeLabel = (type: string) => {
    return DOC_TYPES.find(t => t.value === type)?.label || type;
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <FolderOpen className="w-8 h-8" />
              Documents
            </h1>
            <p className="text-muted-foreground">Gérez les documents de l'établissement</p>
          </div>
          {role === 'admin' && (
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Nouveau document
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Télécharger un document</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Titre *</Label>
                    <Input
                      value={uploadData.title}
                      onChange={e => setUploadData({ ...uploadData, title: e.target.value })}
                      placeholder="Nom du document"
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={uploadData.docType} onValueChange={v => setUploadData({ ...uploadData, docType: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Visibilité</Label>
                    <Select value={uploadData.visibility} onValueChange={v => setUploadData({ ...uploadData, visibility: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous</SelectItem>
                        <SelectItem value="class">Une classe spécifique</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {uploadData.visibility === "class" && (
                    <div>
                      <Label>Classe</Label>
                      <Select value={uploadData.classId} onValueChange={v => setUploadData({ ...uploadData, classId: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une classe" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Fichier *</Label>
                    <Input
                      type="file"
                      onChange={e => setUploadData({ ...uploadData, file: e.target.files?.[0] || null })}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    />
                  </div>
                  <Button onClick={handleUpload} className="w-full" disabled={uploading}>
                    {uploading ? "Téléchargement..." : "Télécharger"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un document..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrer par type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {DOC_TYPES.map(type => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Documents Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="table-header">
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Visibilité</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Chargement...
                    </TableCell>
                  </TableRow>
                ) : filteredDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucun document trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDocuments.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{doc.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getDocTypeLabel(doc.doc_type)}</Badge>
                      </TableCell>
                      <TableCell>
                        {doc.visibility === "all" ? (
                          <Badge>Tous</Badge>
                        ) : (
                          <Badge variant="secondary">{doc.class_name || "Classe"}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                          >
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="Télécharger">
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                          {role === 'admin' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(doc)}
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Documents;
