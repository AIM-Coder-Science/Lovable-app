import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  CalendarDays, Plus, Trash2, Pencil, MapPin, Clock, 
  PartyPopper, Trophy, Award, Users, Calendar, Search
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface Event {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  visibility: string;
  is_published: boolean;
}

const EVENT_TYPES = [
  { value: "general", label: "Général", icon: CalendarDays },
  { value: "cultural", label: "Journée culturelle", icon: PartyPopper },
  { value: "sport", label: "Événement sportif", icon: Trophy },
  { value: "ceremony", label: "Cérémonie", icon: Award },
  { value: "meeting", label: "Réunion", icon: Users },
  { value: "educational", label: "Éducatif", icon: CalendarDays },
];

const Events = () => {
  const { role, user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_type: "general",
    start_date: "",
    end_date: "",
    location: "",
    visibility: "all",
  });

  const fetchEvents = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: true });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les événements", variant: "destructive" });
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCreate = async () => {
    if (!formData.title || !formData.start_date) {
      toast({ title: "Erreur", description: "Le titre et la date sont requis", variant: "destructive" });
      return;
    }

    // Validate end date is not before start date
    if (formData.end_date && new Date(formData.end_date) < new Date(formData.start_date)) {
      toast({ title: "Erreur", description: "La date de fin ne peut pas être antérieure à la date de début", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from('events').insert({
        title: formData.title,
        description: formData.description || null,
        event_type: formData.event_type,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        location: formData.location || null,
        visibility: formData.visibility,
        created_by: user?.id,
        is_published: true,
      });

      if (error) throw error;

      toast({ title: "Succès", description: "Événement créé" });
      setIsDialogOpen(false);
      resetForm();
      fetchEvents();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!selectedEvent || !formData.title || !formData.start_date) {
      toast({ title: "Erreur", description: "Le titre et la date sont requis", variant: "destructive" });
      return;
    }

    // Validate end date is not before start date
    if (formData.end_date && new Date(formData.end_date) < new Date(formData.start_date)) {
      toast({ title: "Erreur", description: "La date de fin ne peut pas être antérieure à la date de début", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from('events')
        .update({
          title: formData.title,
          description: formData.description || null,
          event_type: formData.event_type,
          start_date: formData.start_date,
          end_date: formData.end_date || null,
          location: formData.location || null,
          visibility: formData.visibility,
        })
        .eq('id', selectedEvent.id);

      if (error) throw error;

      toast({ title: "Succès", description: "Événement modifié" });
      setIsEditDialogOpen(false);
      setSelectedEvent(null);
      resetForm();
      fetchEvents();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cet événement ?")) return;

    try {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;

      toast({ title: "Succès", description: "Événement supprimé" });
      fetchEvents();
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      event_type: "general",
      start_date: "",
      end_date: "",
      location: "",
      visibility: "all",
    });
  };

  const openEditDialog = (event: Event) => {
    setSelectedEvent(event);
    setFormData({
      title: event.title,
      description: event.description || "",
      event_type: event.event_type,
      start_date: event.start_date.slice(0, 16),
      end_date: event.end_date?.slice(0, 16) || "",
      location: event.location || "",
      visibility: event.visibility,
    });
    setIsEditDialogOpen(true);
  };

  const getEventTypeInfo = (type: string) => {
    return EVENT_TYPES.find(t => t.value === type) || EVENT_TYPES[0];
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "cultural":
        return "bg-accent/20 text-accent border-accent/30";
      case "sport":
        return "bg-success/20 text-success border-success/30";
      case "ceremony":
        return "bg-warning/20 text-warning border-warning/30";
      case "meeting":
        return "bg-primary/20 text-primary border-primary/30";
      case "educational":
        return "bg-blue-500/20 text-blue-600 border-blue-500/30";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const formatEventDate = (startDate: string, endDate: string | null) => {
    const start = new Date(startDate);
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    let dateStr = start.toLocaleDateString('fr-FR', options);
    
    if (endDate) {
      const end = new Date(endDate);
      if (start.toDateString() === end.toDateString()) {
        dateStr += ` - ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        dateStr += ` au ${end.toLocaleDateString('fr-FR', options)}`;
      }
    }
    
    return dateStr;
  };

  const isUpcoming = (date: string) => new Date(date) > new Date();
  const isPast = (date: string) => new Date(date) < new Date();

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (evt.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = filterType === "all" || evt.event_type === filterType;
    return matchesSearch && matchesFilter;
  });

  const upcomingEvents = filteredEvents.filter(e => isUpcoming(e.start_date));
  const pastEvents = filteredEvents.filter(e => isPast(e.start_date));

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Événements</h1>
            <p className="text-muted-foreground mt-1">
              {role === 'admin' ? 'Gérez les événements de l\'établissement' : 'Découvrez les prochains événements'}
            </p>
          </div>
          {role === 'admin' && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Nouvel événement
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Créer un événement</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
                  <div>
                    <Label>Titre *</Label>
                    <Input 
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Ex: Match de gala inter-classes"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea 
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Détails de l'événement..."
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Type</Label>
                      <Select 
                        value={formData.event_type} 
                        onValueChange={v => setFormData({ ...formData, event_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Lieu</Label>
                      <Input 
                        value={formData.location}
                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                        placeholder="Ex: Cour de l'école"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date/Heure début *</Label>
                      <Input 
                        type="datetime-local"
                        value={formData.start_date}
                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Date/Heure fin</Label>
                      <Input 
                        type="datetime-local"
                        value={formData.end_date}
                        onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Visibilité</Label>
                    <Select 
                      value={formData.visibility} 
                      onValueChange={v => setFormData({ ...formData, visibility: v })}
                    >
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
                  <Button onClick={handleCreate} className="w-full">Créer l'événement</Button>
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
              placeholder="Rechercher un événement..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {EVENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Upcoming Events */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {upcomingEvents.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-primary" />
                  À venir
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcomingEvents.map((event, idx) => {
                    const typeInfo = getEventTypeInfo(event.event_type);
                    const TypeIcon = typeInfo.icon;
                    return (
                      <Card 
                        key={event.id} 
                        className="group hover:shadow-lg transition-all duration-300 overflow-hidden animate-fade-in"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <Badge className={`gap-1 ${getEventTypeColor(event.event_type)}`}>
                              <TypeIcon className="w-3 h-3" />
                              {typeInfo.label}
                            </Badge>
                            {role === 'admin' && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditDialog(event)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleDelete(event.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <CardTitle className="text-lg mt-2">{event.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {event.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                          )}
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-foreground">
                              <Clock className="w-4 h-4 text-primary" />
                              <span className="capitalize">{formatEventDate(event.start_date, event.end_date)}</span>
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="w-4 h-4" />
                                <span>{event.location}</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {pastEvents.length > 0 && (
              <div className="space-y-4 mt-8">
                <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Événements passés
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                  {pastEvents.slice(0, 6).map((event) => {
                    const typeInfo = getEventTypeInfo(event.event_type);
                    const TypeIcon = typeInfo.icon;
                    return (
                      <Card key={event.id} className="group">
                        <CardHeader className="pb-3">
                          <Badge variant="secondary" className="gap-1 w-fit">
                            <TypeIcon className="w-3 h-3" />
                            {typeInfo.label}
                          </Badge>
                          <CardTitle className="text-base mt-2">{event.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span className="capitalize">{formatEventDate(event.start_date, event.end_date)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredEvents.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <CalendarDays className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Aucun événement</h3>
                  <p className="text-muted-foreground text-center max-w-sm">
                    {searchQuery ? "Aucun résultat pour votre recherche." : "Aucun événement programmé pour le moment."}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Modifier l'événement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <Label>Titre *</Label>
                <Input 
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea 
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select 
                    value={formData.event_type} 
                    onValueChange={v => setFormData({ ...formData, event_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lieu</Label>
                  <Input 
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date/Heure début *</Label>
                  <Input 
                    type="datetime-local"
                    value={formData.start_date}
                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Date/Heure fin</Label>
                  <Input 
                    type="datetime-local"
                    value={formData.end_date}
                    onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Visibilité</Label>
                <Select 
                  value={formData.visibility} 
                  onValueChange={v => setFormData({ ...formData, visibility: v })}
                >
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

export default Events;