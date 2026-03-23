import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  Building2, Plus, Pencil, Trash2, Users, Search, DoorOpen,
  BookOpen, Beaker, Monitor, Landmark, Mic, Library, Calendar,
  Clock, CheckCircle, XCircle, AlertCircle, Send
} from "lucide-react";

const ROOM_TYPES = [
  { value: "classroom", label: "Salle de cours", icon: BookOpen },
  { value: "lab", label: "Laboratoire", icon: Beaker },
  { value: "computer_lab", label: "Salle informatique", icon: Monitor },
  { value: "library", label: "Bibliothèque", icon: Library },
  { value: "conference", label: "Salle de conférence", icon: Mic },
  { value: "admin", label: "Administratif", icon: Landmark },
];

const getRoomTypeLabel = (type: string) => ROOM_TYPES.find(t => t.value === type)?.label || type;
const getRoomTypeIcon = (type: string) => ROOM_TYPES.find(t => t.value === type)?.icon || DoorOpen;

interface Room {
  id: string;
  name: string;
  capacity: number;
  room_type: string;
  description: string | null;
  is_active: boolean;
}

interface RoomReservation {
  id: string;
  room_id: string;
  requested_by: string;
  reason: string;
  event_type: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  specific_date: string | null;
  status: string;
  admin_notes: string | null;
  admin_modified_room_id: string | null;
  admin_modified_start_time: string | null;
  admin_modified_end_time: string | null;
  created_at: string;
  room?: { name: string };
  requester_profile?: { first_name: string; last_name: string } | null;
}

const DAYS_MAP: Record<number, string> = {
  1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi"
};

const Salles = () => {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const isTeacher = role === "teacher";

  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<RoomReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("rooms");

  // Room form
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomForm, setRoomForm] = useState({
    name: "", capacity: 30, room_type: "classroom", description: "", is_active: true,
  });

  // Reservation form (teacher)
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const [reserveForm, setReserveForm] = useState({
    reason: "", event_type: "cours", day_of_week: 1,
    start_time: "08:00", end_time: "10:00",
    specific_date: "", search_capacity: 0,
  });
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [selectedRoomForReserve, setSelectedRoomForReserve] = useState<string>("");
  const [searchedAvailability, setSearchedAvailability] = useState(false);

  // Admin review
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewingReservation, setReviewingReservation] = useState<RoomReservation | null>(null);
  const [reviewForm, setReviewForm] = useState({
    admin_notes: "", admin_modified_room_id: "", 
    admin_modified_start_time: "", admin_modified_end_time: "",
  });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchRooms(), fetchReservations()]);
    setLoading(false);
  };

  const fetchRooms = async () => {
    const { data } = await supabase.from("rooms").select("*").order("name");
    setRooms((data as any) || []);
  };

  const fetchReservations = async () => {
    const { data } = await supabase
      .from("room_reservations")
      .select("*, room:rooms(name)")
      .order("created_at", { ascending: false });
    
    if (data) {
      // Fetch requester profiles
      const userIds = [...new Set((data as any[]).map((r: any) => r.requested_by))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);
      
      const profileMap: Record<string, { first_name: string; last_name: string }> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });
      
      setReservations((data as any[]).map((r: any) => ({
        ...r,
        requester_profile: profileMap[r.requested_by] || null,
      })));
    }
  };

  // Room CRUD
  const handleSaveRoom = async () => {
    try {
      if (editingRoom) {
        const { error } = await supabase.from("rooms").update({
          name: roomForm.name, capacity: roomForm.capacity,
          room_type: roomForm.room_type, description: roomForm.description || null,
          is_active: roomForm.is_active,
        } as any).eq("id", editingRoom.id);
        if (error) throw error;
        toast({ title: "Succès", description: "Salle modifiée" });
      } else {
        const { error } = await supabase.from("rooms").insert({
          name: roomForm.name, capacity: roomForm.capacity,
          room_type: roomForm.room_type, description: roomForm.description || null,
          is_active: roomForm.is_active,
        } as any);
        if (error) throw error;
        toast({ title: "Succès", description: "Salle créée" });
      }
      setRoomDialogOpen(false);
      setEditingRoom(null);
      resetRoomForm();
      fetchRooms();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm("Supprimer cette salle ?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Salle supprimée" });
      fetchRooms();
    }
  };

  const openEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomForm({
      name: room.name, capacity: room.capacity, room_type: room.room_type,
      description: room.description || "", is_active: room.is_active,
    });
    setRoomDialogOpen(true);
  };

  const resetRoomForm = () => {
    setRoomForm({ name: "", capacity: 30, room_type: "classroom", description: "", is_active: true });
  };

  // Search available rooms
  const searchAvailableRooms = async () => {
    // Find rooms that are free at the given time
    const { data: occupiedSlots } = await supabase
      .from("timetable_slots")
      .select("room_id, room")
      .eq("day_of_week", reserveForm.day_of_week)
      .lt("start_time", reserveForm.end_time)
      .gt("end_time", reserveForm.start_time);

    const occupiedRoomIds = new Set((occupiedSlots || []).map((s: any) => s.room_id).filter(Boolean));
    const occupiedRoomNames = new Set((occupiedSlots || []).map((s: any) => s.room).filter(Boolean));

    // Also check approved reservations
    const { data: occupiedReservations } = await supabase
      .from("room_reservations")
      .select("room_id, admin_modified_room_id")
      .eq("day_of_week", reserveForm.day_of_week)
      .in("status", ["approved", "pending"])
      .lt("start_time", reserveForm.end_time)
      .gt("end_time", reserveForm.start_time);

    (occupiedReservations || []).forEach((r: any) => {
      if (r.room_id) occupiedRoomIds.add(r.room_id);
      if (r.admin_modified_room_id) occupiedRoomIds.add(r.admin_modified_room_id);
    });

    const available = rooms.filter(r => 
      r.is_active && 
      !occupiedRoomIds.has(r.id) &&
      !occupiedRoomNames.has(r.name) &&
      (reserveForm.search_capacity <= 0 || r.capacity >= reserveForm.search_capacity)
    );

    setAvailableRooms(available);
    setSearchedAvailability(true);
  };

  // Submit reservation
  const handleSubmitReservation = async () => {
    if (!selectedRoomForReserve || !reserveForm.reason) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs requis", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.from("room_reservations").insert({
        room_id: selectedRoomForReserve,
        requested_by: user?.id,
        reason: reserveForm.reason,
        event_type: reserveForm.event_type,
        day_of_week: reserveForm.day_of_week,
        start_time: reserveForm.start_time,
        end_time: reserveForm.end_time,
        specific_date: reserveForm.specific_date || null,
      } as any);
      if (error) throw error;

      // Notify admins
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) {
        const { data: profile } = await supabase.from("profiles").select("first_name, last_name").eq("user_id", user?.id || "").single();
        const requesterName = profile ? `${profile.first_name} ${profile.last_name}` : "Un enseignant";
        const roomName = rooms.find(r => r.id === selectedRoomForReserve)?.name || "une salle";
        
        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            title: "Demande de réservation de salle",
            message: `${requesterName} souhaite réserver ${roomName} - ${reserveForm.reason}`,
            type: "reservation",
          });
        }
      }

      toast({ title: "Demande envoyée", description: "Votre demande de réservation a été envoyée à l'administration" });
      setReserveDialogOpen(false);
      setSelectedRoomForReserve("");
      setSearchedAvailability(false);
      setAvailableRooms([]);
      fetchReservations();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  // Admin review reservation
  const openReview = (reservation: RoomReservation) => {
    setReviewingReservation(reservation);
    setReviewForm({
      admin_notes: reservation.admin_notes || "",
      admin_modified_room_id: reservation.admin_modified_room_id || reservation.room_id,
      admin_modified_start_time: reservation.admin_modified_start_time || reservation.start_time.slice(0, 5),
      admin_modified_end_time: reservation.admin_modified_end_time || reservation.end_time.slice(0, 5),
    });
    setReviewDialogOpen(true);
  };

  const handleApproveReservation = async (approved: boolean) => {
    if (!reviewingReservation) return;
    try {
      const updateData: any = {
        status: approved ? "approved" : "rejected",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        admin_notes: reviewForm.admin_notes || null,
      };
      if (approved) {
        updateData.admin_modified_room_id = reviewForm.admin_modified_room_id || null;
        updateData.admin_modified_start_time = reviewForm.admin_modified_start_time || null;
        updateData.admin_modified_end_time = reviewForm.admin_modified_end_time || null;

        // Create timetable slot if approved
        const finalRoomId = reviewForm.admin_modified_room_id || reviewingReservation.room_id;
        const finalRoom = rooms.find(r => r.id === finalRoomId);
        
        if (reviewingReservation.day_of_week) {
          // Find teacher from user
          const { data: teacher } = await supabase
            .from("teachers")
            .select("id")
            .eq("user_id", reviewingReservation.requested_by)
            .single();
          
          if (teacher) {
            // Get first class & subject of teacher for the slot
            const { data: tc } = await supabase
              .from("teacher_classes")
              .select("class_id, subject_id")
              .eq("teacher_id", teacher.id)
              .limit(1)
              .single();
            
            if (tc) {
              await supabase.from("timetable_slots").insert({
                day_of_week: reviewingReservation.day_of_week,
                start_time: reviewForm.admin_modified_start_time || reviewingReservation.start_time,
                end_time: reviewForm.admin_modified_end_time || reviewingReservation.end_time,
                class_id: tc.class_id,
                subject_id: tc.subject_id,
                teacher_id: teacher.id,
                room: finalRoom?.name || null,
                room_id: finalRoomId,
              });
            }
          }
        }
      }

      const { error } = await supabase
        .from("room_reservations")
        .update(updateData)
        .eq("id", reviewingReservation.id);
      if (error) throw error;

      // Notify the requester
      await supabase.from("notifications").insert({
        user_id: reviewingReservation.requested_by,
        title: approved ? "Réservation approuvée" : "Réservation refusée",
        message: approved
          ? `Votre demande de réservation a été approuvée.${reviewForm.admin_notes ? ` Note: ${reviewForm.admin_notes}` : ""}`
          : `Votre demande de réservation a été refusée.${reviewForm.admin_notes ? ` Raison: ${reviewForm.admin_notes}` : ""}`,
        type: "reservation",
      });

      toast({ title: "Succès", description: approved ? "Réservation approuvée" : "Réservation refusée" });
      setReviewDialogOpen(false);
      setReviewingReservation(null);
      fetchReservations();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const filteredRooms = rooms.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    getRoomTypeLabel(r.room_type).toLowerCase().includes(search.toLowerCase())
  );

  const pendingReservations = reservations.filter(r => r.status === "pending");
  const otherReservations = reservations.filter(r => r.status !== "pending");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">En attente</Badge>;
      case "approved": return <Badge className="bg-emerald-500">Approuvée</Badge>;
      case "rejected": return <Badge variant="destructive">Refusée</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-7 h-7" />
              Gestion des salles
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? "Gérez les salles et les demandes de réservation" : "Consultez et réservez des salles"}
            </p>
          </div>
          <div className="flex gap-2">
            {isTeacher && (
              <Dialog open={reserveDialogOpen} onOpenChange={setReserveDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Calendar className="w-4 h-4" />Réserver une salle</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Demande de réservation</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Jour</Label>
                        <Select value={String(reserveForm.day_of_week)} onValueChange={v => setReserveForm({...reserveForm, day_of_week: Number(v)})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(DAYS_MAP).map(([v, l]) => (
                              <SelectItem key={v} value={v}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Type d'événement</Label>
                        <Select value={reserveForm.event_type} onValueChange={v => setReserveForm({...reserveForm, event_type: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cours">Cours</SelectItem>
                            <SelectItem value="presentation">Présentation</SelectItem>
                            <SelectItem value="reunion">Réunion</SelectItem>
                            <SelectItem value="examen">Examen</SelectItem>
                            <SelectItem value="autre">Autre</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Heure début</Label>
                        <Input type="time" value={reserveForm.start_time} onChange={e => setReserveForm({...reserveForm, start_time: e.target.value})} />
                      </div>
                      <div>
                        <Label>Heure fin</Label>
                        <Input type="time" value={reserveForm.end_time} onChange={e => setReserveForm({...reserveForm, end_time: e.target.value})} />
                      </div>
                    </div>
                    <div>
                      <Label>Capacité minimale souhaitée</Label>
                      <Input type="number" value={reserveForm.search_capacity} onChange={e => setReserveForm({...reserveForm, search_capacity: Number(e.target.value)})} />
                    </div>
                    <div>
                      <Label>Raison / Description</Label>
                      <Textarea value={reserveForm.reason} onChange={e => setReserveForm({...reserveForm, reason: e.target.value})} placeholder="Décrivez la raison de la réservation..." />
                    </div>
                    <Button variant="outline" onClick={searchAvailableRooms} className="w-full gap-2">
                      <Search className="w-4 h-4" />Rechercher les salles disponibles
                    </Button>
                    {searchedAvailability && (
                      <div className="space-y-2">
                        {availableRooms.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Aucune salle disponible pour ce créneau</p>
                        ) : (
                          <>
                            <p className="text-sm font-medium">{availableRooms.length} salle(s) disponible(s) :</p>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {availableRooms.map(r => (
                                <div
                                  key={r.id}
                                  onClick={() => setSelectedRoomForReserve(r.id)}
                                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                    selectedRoomForReserve === r.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">{r.name}</p>
                                      <p className="text-xs text-muted-foreground">{getRoomTypeLabel(r.room_type)} • {r.capacity} places</p>
                                    </div>
                                    {selectedRoomForReserve === r.id && <CheckCircle className="w-5 h-5 text-primary" />}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <Button onClick={handleSubmitReservation} disabled={!selectedRoomForReserve || !reserveForm.reason} className="w-full gap-2">
                      <Send className="w-4 h-4" />Envoyer la demande
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {isAdmin && (
              <Dialog open={roomDialogOpen} onOpenChange={(open) => {
                setRoomDialogOpen(open);
                if (!open) { setEditingRoom(null); resetRoomForm(); }
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Plus className="w-4 h-4" />Ajouter une salle</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingRoom ? "Modifier la salle" : "Nouvelle salle"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label>Nom *</Label>
                      <Input value={roomForm.name} onChange={e => setRoomForm({...roomForm, name: e.target.value})} placeholder="Ex: Salle 101" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Capacité</Label>
                        <Input type="number" value={roomForm.capacity} onChange={e => setRoomForm({...roomForm, capacity: Number(e.target.value)})} />
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select value={roomForm.room_type} onValueChange={v => setRoomForm({...roomForm, room_type: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROOM_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea value={roomForm.description} onChange={e => setRoomForm({...roomForm, description: e.target.value})} placeholder="Description optionnelle..." />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Active</Label>
                      <Switch checked={roomForm.is_active} onCheckedChange={v => setRoomForm({...roomForm, is_active: v})} />
                    </div>
                    <Button onClick={handleSaveRoom} className="w-full" disabled={!roomForm.name}>
                      {editingRoom ? "Modifier" : "Créer"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="rooms" className="gap-1"><DoorOpen className="w-4 h-4" />Salles</TabsTrigger>
            <TabsTrigger value="reservations" className="gap-1">
              <Calendar className="w-4 h-4" />
              Réservations
              {pendingReservations.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{pendingReservations.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rooms" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Liste des salles</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Rechercher..."
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : filteredRooms.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <DoorOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Aucune salle trouvée</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredRooms.map(room => {
                      const TypeIcon = getRoomTypeIcon(room.room_type);
                      return (
                        <Card key={room.id} className={`transition-all hover:shadow-md ${!room.is_active ? "opacity-60" : ""}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                  <TypeIcon className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                  <h3 className="font-semibold">{room.name}</h3>
                                  <p className="text-xs text-muted-foreground">{getRoomTypeLabel(room.room_type)}</p>
                                </div>
                              </div>
                              {!room.is_active && <Badge variant="secondary">Inactive</Badge>}
                            </div>
                            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{room.capacity} places</span>
                            </div>
                            {room.description && (
                              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{room.description}</p>
                            )}
                            {isAdmin && (
                              <div className="mt-3 flex gap-2 justify-end">
                                <Button variant="ghost" size="sm" onClick={() => openEditRoom(room)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteRoom(room.id)} className="text-destructive hover:text-destructive">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reservations" className="mt-4 space-y-4">
            {isAdmin && pendingReservations.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                    <AlertCircle className="w-5 h-5" />
                    Demandes en attente ({pendingReservations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingReservations.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                        <div>
                          <p className="font-medium">{r.requester_profile ? `${r.requester_profile.first_name} ${r.requester_profile.last_name}` : "Inconnu"}</p>
                          <p className="text-sm text-muted-foreground">
                            {r.room?.name} • {r.day_of_week ? DAYS_MAP[r.day_of_week] : ""} {r.start_time.slice(0, 5)}-{r.end_time.slice(0, 5)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
                        </div>
                        <Button size="sm" onClick={() => openReview(r)}>Examiner</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Historique des réservations</CardTitle>
              </CardHeader>
              <CardContent>
                {reservations.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Aucune réservation</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Demandeur</TableHead>
                        <TableHead>Salle</TableHead>
                        <TableHead>Créneau</TableHead>
                        <TableHead>Raison</TableHead>
                        <TableHead>Statut</TableHead>
                        {isAdmin && <TableHead></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reservations.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.requester_profile ? `${r.requester_profile.first_name} ${r.requester_profile.last_name}` : "—"}
                          </TableCell>
                          <TableCell>{r.room?.name || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {r.day_of_week ? DAYS_MAP[r.day_of_week] : ""} {r.start_time.slice(0, 5)}-{r.end_time.slice(0, 5)}
                          </TableCell>
                          <TableCell className="text-sm max-w-48 truncate">{r.reason}</TableCell>
                          <TableCell>{getStatusBadge(r.status)}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              {r.status === "pending" && (
                                <Button size="sm" variant="outline" onClick={() => openReview(r)}>Examiner</Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Admin Review Dialog */}
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Examiner la demande</DialogTitle>
            </DialogHeader>
            {reviewingReservation && (
              <div className="space-y-4 mt-4">
                <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                  <p className="text-sm"><strong>Demandeur :</strong> {reviewingReservation.requester_profile ? `${reviewingReservation.requester_profile.first_name} ${reviewingReservation.requester_profile.last_name}` : "Inconnu"}</p>
                  <p className="text-sm"><strong>Raison :</strong> {reviewingReservation.reason}</p>
                  <p className="text-sm"><strong>Type :</strong> {reviewingReservation.event_type}</p>
                </div>
                <div>
                  <Label>Salle (modifiable)</Label>
                  <Select value={reviewForm.admin_modified_room_id} onValueChange={v => setReviewForm({...reviewForm, admin_modified_room_id: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rooms.filter(r => r.is_active).map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name} ({r.capacity} places)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Heure début</Label>
                    <Input type="time" value={reviewForm.admin_modified_start_time} onChange={e => setReviewForm({...reviewForm, admin_modified_start_time: e.target.value})} />
                  </div>
                  <div>
                    <Label>Heure fin</Label>
                    <Input type="time" value={reviewForm.admin_modified_end_time} onChange={e => setReviewForm({...reviewForm, admin_modified_end_time: e.target.value})} />
                  </div>
                </div>
                <div>
                  <Label>Notes admin</Label>
                  <Textarea value={reviewForm.admin_notes} onChange={e => setReviewForm({...reviewForm, admin_notes: e.target.value})} placeholder="Remarques optionnelles..." />
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => handleApproveReservation(false)} variant="destructive" className="flex-1 gap-2">
                    <XCircle className="w-4 h-4" />Refuser
                  </Button>
                  <Button onClick={() => handleApproveReservation(true)} className="flex-1 gap-2">
                    <CheckCircle className="w-4 h-4" />Approuver
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Salles;
