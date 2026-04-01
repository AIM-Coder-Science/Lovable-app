import { useState, useEffect, useCallback } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  Building2, Plus, Pencil, Trash2, Users, Search, DoorOpen,
  BookOpen, Beaker, Monitor, Landmark, Mic, Library, Calendar,
  CheckCircle, XCircle, AlertCircle, Send, Hash, Info, RefreshCw,
} from "lucide-react";

const ROOM_TYPES = [
  { value: "classroom",    label: "Salle de cours",      icon: BookOpen,  prefix: "S" },
  { value: "lab",          label: "Laboratoire",          icon: Beaker,    prefix: "LAB" },
  { value: "computer_lab", label: "Salle informatique",   icon: Monitor,   prefix: "INFO" },
  { value: "library",      label: "Bibliothèque",         icon: Library,   prefix: "BIB" },
  { value: "conference",   label: "Salle de conférence",  icon: Mic,       prefix: "CONF" },
  { value: "admin",        label: "Administratif",        icon: Landmark,  prefix: "ADM" },
];

const getRoomType    = (type: string) => ROOM_TYPES.find(t => t.value === type);
const getRoomTypeLabel  = (type: string) => getRoomType(type)?.label  || type;
const getRoomTypeIcon   = (type: string) => getRoomType(type)?.icon   || DoorOpen;
const getRoomTypePrefix = (type: string) => getRoomType(type)?.prefix || "S";

interface Room {
  id: string;
  room_code: string;
  name: string;
  capacity: number;
  room_type: string;
  floor: string | null;
  building: string | null;
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
  room?: { name: string; room_code: string };
  requester_profile?: { first_name: string; last_name: string } | null;
}

interface RoomForm {
  room_code: string; name: string; capacity: number;
  room_type: string; floor: string; building: string;
  description: string; is_active: boolean;
}

const DAYS_MAP: Record<number, string> = {
  1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi",
};

function generateRoomCode(type: string, existingRooms: Room[], building?: string): string {
  const prefix = getRoomTypePrefix(type);
  const buildingPart = building?.toUpperCase().replace(/\s+/g, "").slice(0, 3) || "";
  const base = buildingPart ? `${prefix}-${buildingPart}` : prefix;
  const existing = existingRooms
    .map(r => r.room_code || "")
    .filter(code => code.startsWith(base + "-") || code.startsWith(prefix + "-"))
    .map(code => { const parts = code.split("-"); const num = parseInt(parts[parts.length - 1]); return isNaN(num) ? 0 : num; });
  const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${base}-${String(nextNum).padStart(2, "0")}`;
}

const Salles = () => {
  const { role, user } = useAuth();
  const isAdmin   = role === "admin";
  const isTeacher = role === "teacher";

  const [rooms, setRooms]               = useState<Room[]>([]);
  const [reservations, setReservations] = useState<RoomReservation[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [filterType, setFilterType]     = useState("all");
  const [activeTab, setActiveTab]       = useState("rooms");

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom]       = useState<Room | null>(null);
  const [codeConflict, setCodeConflict]     = useState(false);
  const [nameConflict, setNameConflict]     = useState(false);

  const defaultForm = (): RoomForm => ({
    room_code: "", name: "", capacity: 30,
    room_type: "classroom", floor: "", building: "", description: "", is_active: true,
  });
  const [roomForm, setRoomForm] = useState<RoomForm>(defaultForm());

  const refreshCode = useCallback(() => {
    if (editingRoom) return;
    const code = generateRoomCode(roomForm.room_type, rooms, roomForm.building);
    setRoomForm(prev => ({ ...prev, room_code: code }));
  }, [roomForm.room_type, roomForm.building, rooms, editingRoom]);

  useEffect(() => { refreshCode(); }, [roomForm.room_type, roomForm.building]);

  useEffect(() => {
    const code = roomForm.room_code.trim().toUpperCase();
    const name = roomForm.name.trim().toLowerCase();
    const excludeId = editingRoom?.id;
    setCodeConflict(rooms.some(r => r.id !== excludeId && (r.room_code || "").toUpperCase() === code && code !== ""));
    setNameConflict(rooms.some(r => r.id !== excludeId && r.name.toLowerCase() === name && name !== ""));
  }, [roomForm.room_code, roomForm.name, rooms, editingRoom]);

  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const [reserveForm, setReserveForm] = useState({
    reason: "", event_type: "cours", day_of_week: 1,
    start_time: "08:00", end_time: "10:00", specific_date: "", search_capacity: 0,
  });
  const [availableRooms, setAvailableRooms]                 = useState<Room[]>([]);
  const [selectedRoomForReserve, setSelectedRoomForReserve] = useState("");
  const [searchedAvailability, setSearchedAvailability]     = useState(false);

  const [reviewDialogOpen, setReviewDialogOpen]           = useState(false);
  const [reviewingReservation, setReviewingReservation]   = useState<RoomReservation | null>(null);
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
    const { data } = await supabase.from("rooms").select("*").order("room_code");
    setRooms((data as any) || []);
  };

  const fetchReservations = async () => {
    const { data } = await supabase
      .from("room_reservations")
      .select("*, room:rooms(name, room_code)")
      .order("created_at", { ascending: false });
    if (data) {
      const userIds = [...new Set((data as any[]).map((r: any) => r.requested_by))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });
      setReservations((data as any[]).map((r: any) => ({ ...r, requester_profile: profileMap[r.requested_by] || null })));
    }
  };

  const handleSaveRoom = async () => {
    if (codeConflict) { toast({ title: "Code déjà utilisé", variant: "destructive" }); return; }
    if (nameConflict) { toast({ title: "Nom déjà utilisé", variant: "destructive" }); return; }
    if (!roomForm.room_code.trim() || !roomForm.name.trim()) {
      toast({ title: "Champs requis", description: "Le code et le nom sont obligatoires.", variant: "destructive" }); return;
    }
    const payload = {
      room_code: roomForm.room_code.trim().toUpperCase(),
      name: roomForm.name.trim(), capacity: roomForm.capacity,
      room_type: roomForm.room_type,
      floor: roomForm.floor.trim() || null, building: roomForm.building.trim() || null,
      description: roomForm.description.trim() || null, is_active: roomForm.is_active,
    };
    try {
      if (editingRoom) {
        const { error } = await supabase.from("rooms").update(payload as any).eq("id", editingRoom.id);
        if (error) throw error;
        toast({ title: "Salle modifiée" });
      } else {
        const { error } = await supabase.from("rooms").insert(payload as any);
        if (error) throw error;
        toast({ title: "Salle créée", description: `Code : ${payload.room_code}` });
      }
      setRoomDialogOpen(false); setEditingRoom(null); setRoomForm(defaultForm()); fetchRooms();
    } catch (e: any) {
      const msg = e.message?.includes("unique") ? "Ce code ou nom est déjà utilisé." : e.message;
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm("Supprimer cette salle ? Cette action est irréversible.")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: "Salle supprimée" }); fetchRooms(); }
  };

  const openEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomForm({ room_code: room.room_code || "", name: room.name, capacity: room.capacity,
      room_type: room.room_type, floor: room.floor || "", building: room.building || "",
      description: room.description || "", is_active: room.is_active });
    setRoomDialogOpen(true);
  };

  const searchAvailableRooms = async () => {
    const { data: occupiedSlots } = await supabase.from("timetable_slots").select("room_id")
      .eq("day_of_week", reserveForm.day_of_week).lt("start_time", reserveForm.end_time).gt("end_time", reserveForm.start_time);
    const { data: occupiedRes } = await supabase.from("room_reservations")
      .select("room_id, admin_modified_room_id")
      .eq("day_of_week", reserveForm.day_of_week).in("status", ["approved", "pending"])
      .lt("start_time", reserveForm.end_time).gt("end_time", reserveForm.start_time);
    const occupiedIds = new Set<string>();
    (occupiedSlots || []).forEach((s: any) => s.room_id && occupiedIds.add(s.room_id));
    (occupiedRes   || []).forEach((r: any) => { if (r.room_id) occupiedIds.add(r.room_id); if (r.admin_modified_room_id) occupiedIds.add(r.admin_modified_room_id); });
    setAvailableRooms(rooms.filter(r => r.is_active && !occupiedIds.has(r.id) && (reserveForm.search_capacity <= 0 || r.capacity >= reserveForm.search_capacity)));
    setSearchedAvailability(true);
  };

  const handleSubmitReservation = async () => {
    if (!selectedRoomForReserve || !reserveForm.reason) {
      toast({ title: "Champs requis", variant: "destructive" }); return;
    }
    try {
      const { error } = await supabase.from("room_reservations").insert({
        room_id: selectedRoomForReserve, requested_by: user?.id, reason: reserveForm.reason,
        event_type: reserveForm.event_type, day_of_week: reserveForm.day_of_week,
        start_time: reserveForm.start_time, end_time: reserveForm.end_time,
        specific_date: reserveForm.specific_date || null,
      } as any);
      if (error) throw error;
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) {
        const { data: profile } = await supabase.from("profiles").select("first_name, last_name").eq("user_id", user?.id || "").single();
        const name = profile ? `${profile.first_name} ${profile.last_name}` : "Un enseignant";
        const room = rooms.find(r => r.id === selectedRoomForReserve);
        const roomLabel = room ? `${room.room_code} — ${room.name}` : "une salle";
        for (const admin of admins) {
          await supabase.from("notifications").insert({ user_id: admin.user_id,
            title: "Demande de réservation de salle",
            message: `${name} souhaite réserver ${roomLabel} — ${reserveForm.reason}`, type: "reservation" });
        }
      }
      toast({ title: "Demande envoyée" });
      setReserveDialogOpen(false); setSelectedRoomForReserve(""); setSearchedAvailability(false); setAvailableRooms([]); fetchReservations();
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
  };

  const openReview = (reservation: RoomReservation) => {
    setReviewingReservation(reservation);
    setReviewForm({ admin_notes: reservation.admin_notes || "",
      admin_modified_room_id: reservation.admin_modified_room_id || reservation.room_id,
      admin_modified_start_time: reservation.admin_modified_start_time || reservation.start_time.slice(0, 5),
      admin_modified_end_time:   reservation.admin_modified_end_time   || reservation.end_time.slice(0, 5) });
    setReviewDialogOpen(true);
  };

  const handleApproveReservation = async (approved: boolean) => {
    if (!reviewingReservation) return;
    try {
      const updateData: any = { status: approved ? "approved" : "rejected", approved_by: user?.id,
        approved_at: new Date().toISOString(), admin_notes: reviewForm.admin_notes || null };
      if (approved) {
        updateData.admin_modified_room_id        = reviewForm.admin_modified_room_id || null;
        updateData.admin_modified_start_time     = reviewForm.admin_modified_start_time || null;
        updateData.admin_modified_end_time       = reviewForm.admin_modified_end_time   || null;
        const finalRoomId = reviewForm.admin_modified_room_id || reviewingReservation.room_id;
        const finalRoom   = rooms.find(r => r.id === finalRoomId);
        if (reviewingReservation.day_of_week) {
          const { data: teacher } = await supabase.from("teachers").select("id").eq("user_id", reviewingReservation.requested_by).single();
          if (teacher) {
            const { data: tc } = await supabase.from("teacher_classes").select("class_id, subject_id").eq("teacher_id", teacher.id).limit(1).single();
            if (tc) await supabase.from("timetable_slots").insert({
              day_of_week: reviewingReservation.day_of_week,
              start_time: reviewForm.admin_modified_start_time || reviewingReservation.start_time,
              end_time:   reviewForm.admin_modified_end_time   || reviewingReservation.end_time,
              class_id: tc.class_id, subject_id: tc.subject_id, teacher_id: teacher.id,
              room: finalRoom?.name || null, room_id: finalRoomId });
          }
        }
      }
      const { error } = await supabase.from("room_reservations").update(updateData).eq("id", reviewingReservation.id);
      if (error) throw error;
      await supabase.from("notifications").insert({ user_id: reviewingReservation.requested_by,
        title: approved ? "Réservation approuvée" : "Réservation refusée",
        message: approved ? `Votre demande a été approuvée.${reviewForm.admin_notes ? ` Note : ${reviewForm.admin_notes}` : ""}`
                          : `Votre demande a été refusée.${reviewForm.admin_notes ? ` Raison : ${reviewForm.admin_notes}` : ""}`,
        type: "reservation" });
      toast({ title: approved ? "Réservation approuvée" : "Réservation refusée" });
      setReviewDialogOpen(false); setReviewingReservation(null); fetchReservations();
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
  };

  const filteredRooms = rooms.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !search || r.name.toLowerCase().includes(q) || (r.room_code || "").toLowerCase().includes(q)
      || getRoomTypeLabel(r.room_type).toLowerCase().includes(q) || (r.building || "").toLowerCase().includes(q);
    return matchSearch && (filterType === "all" || r.room_type === filterType);
  });

  const pendingReservations = reservations.filter(r => r.status === "pending");

  const getStatusBadge = (status: string) => {
    if (status === "pending")  return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">En attente</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-500">Approuvée</Badge>;
    if (status === "rejected") return <Badge variant="destructive">Refusée</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Building2 className="w-7 h-7" />Gestion des salles
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
                  <DialogHeader><DialogTitle>Demande de réservation</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Jour</Label>
                        <Select value={String(reserveForm.day_of_week)} onValueChange={v => setReserveForm({ ...reserveForm, day_of_week: Number(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(DAYS_MAP).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Type d'événement</Label>
                        <Select value={reserveForm.event_type} onValueChange={v => setReserveForm({ ...reserveForm, event_type: v })}>
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
                      <div><Label>Heure début</Label><Input type="time" value={reserveForm.start_time} onChange={e => setReserveForm({ ...reserveForm, start_time: e.target.value })} /></div>
                      <div><Label>Heure fin</Label><Input type="time" value={reserveForm.end_time} onChange={e => setReserveForm({ ...reserveForm, end_time: e.target.value })} /></div>
                    </div>
                    <div><Label>Capacité minimale</Label><Input type="number" min={0} value={reserveForm.search_capacity} onChange={e => setReserveForm({ ...reserveForm, search_capacity: Number(e.target.value) })} /></div>
                    <div><Label>Raison *</Label><Textarea value={reserveForm.reason} onChange={e => setReserveForm({ ...reserveForm, reason: e.target.value })} placeholder="Décrivez la raison..." /></div>
                    <Button variant="outline" onClick={searchAvailableRooms} className="w-full gap-2"><Search className="w-4 h-4" />Rechercher les salles disponibles</Button>
                    {searchedAvailability && (
                      <div className="space-y-2">
                        {availableRooms.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Aucune salle disponible</p> : (
                          <>
                            <p className="text-sm font-medium">{availableRooms.length} salle(s) disponible(s) :</p>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {availableRooms.map(r => (
                                <div key={r.id} onClick={() => setSelectedRoomForReserve(r.id)}
                                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedRoomForReserve === r.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs font-mono">{r.room_code}</Badge>
                                        <p className="font-medium text-sm">{r.name}</p>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-0.5">{getRoomTypeLabel(r.room_type)} • {r.capacity} places{r.building ? ` • ${r.building}` : ""}{r.floor ? ` — Ét. ${r.floor}` : ""}</p>
                                    </div>
                                    {selectedRoomForReserve === r.id && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <Button onClick={handleSubmitReservation} disabled={!selectedRoomForReserve || !reserveForm.reason} className="w-full gap-2"><Send className="w-4 h-4" />Envoyer la demande</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {isAdmin && (
              <Dialog open={roomDialogOpen} onOpenChange={open => { setRoomDialogOpen(open); if (!open) { setEditingRoom(null); setRoomForm(defaultForm()); } }}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Plus className="w-4 h-4" />Ajouter une salle</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{editingRoom ? "Modifier la salle" : "Nouvelle salle"}</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">

                    <div>
                      <Label>Type de salle *</Label>
                      <Select value={roomForm.room_type} onValueChange={v => setRoomForm({ ...roomForm, room_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROOM_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>
                              <span className="flex items-center gap-2">
                                <t.icon className="w-4 h-4 opacity-60" />{t.label}
                                <span className="text-xs text-muted-foreground ml-1">(préfixe : {t.prefix})</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Bâtiment</Label><Input value={roomForm.building} onChange={e => setRoomForm({ ...roomForm, building: e.target.value })} placeholder="Ex: Bât. A, Principal..." /></div>
                      <div><Label>Étage / Niveau</Label><Input value={roomForm.floor} onChange={e => setRoomForm({ ...roomForm, floor: e.target.value })} placeholder="Ex: RDC, 1, 2..." /></div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5" />Code salle *
                          <Tooltip>
                            <TooltipTrigger asChild><Info className="w-3 h-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                            <TooltipContent><p className="text-xs max-w-48">Identifiant unique et immuable. Généré automatiquement selon le type et le bâtiment.</p></TooltipContent>
                          </Tooltip>
                        </Label>
                        {!editingRoom && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={refreshCode}>
                            <RefreshCw className="w-3 h-3" />Régénérer
                          </Button>
                        )}
                      </div>
                      <Input value={roomForm.room_code}
                        onChange={e => setRoomForm({ ...roomForm, room_code: e.target.value.toUpperCase() })}
                        placeholder="Ex: S-01, LAB-03..."
                        className={`font-mono ${codeConflict ? "border-destructive" : ""}`}
                        disabled={!!editingRoom} />
                      {codeConflict && <p className="text-xs text-destructive mt-1">Ce code est déjà utilisé.</p>}
                      {editingRoom && <p className="text-xs text-muted-foreground mt-1">Le code ne peut pas être modifié après création.</p>}
                    </div>

                    <div>
                      <Label>Nom de la salle *</Label>
                      <Input value={roomForm.name} onChange={e => setRoomForm({ ...roomForm, name: e.target.value })}
                        placeholder="Ex: Salle de Mathématiques, Labo de Chimie..."
                        className={nameConflict ? "border-destructive" : ""} />
                      {nameConflict && <p className="text-xs text-destructive mt-1">Ce nom est déjà utilisé.</p>}
                    </div>

                    <div>
                      <Label>Capacité (places) *</Label>
                      <Input type="number" min={1} max={500} value={roomForm.capacity} onChange={e => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })} />
                    </div>

                    <div>
                      <Label>Description <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                      <Textarea value={roomForm.description} onChange={e => setRoomForm({ ...roomForm, description: e.target.value })}
                        placeholder="Équipements, remarques particulières..." rows={2} />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <div>
                        <p className="text-sm font-medium">Salle active</p>
                        <p className="text-xs text-muted-foreground">Une salle inactive n'est plus proposée à la réservation</p>
                      </div>
                      <Switch checked={roomForm.is_active} onCheckedChange={v => setRoomForm({ ...roomForm, is_active: v })} />
                    </div>

                    {roomForm.room_code && roomForm.name && (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                        <p className="font-medium text-primary text-xs mb-1">Aperçu :</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono text-xs">{roomForm.room_code}</Badge>
                          <span className="font-medium">{roomForm.name}</span>
                          {roomForm.building && <span className="text-muted-foreground text-xs">— {roomForm.building}</span>}
                          {roomForm.floor && <span className="text-muted-foreground text-xs">Ét. {roomForm.floor}</span>}
                          <span className="text-muted-foreground text-xs">({roomForm.capacity} places)</span>
                        </div>
                      </div>
                    )}

                    <Button onClick={handleSaveRoom} className="w-full"
                      disabled={!roomForm.room_code || !roomForm.name || codeConflict || nameConflict}>
                      {editingRoom ? "Enregistrer les modifications" : "Créer la salle"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total",     value: rooms.length,                         color: "" },
              { label: "Actives",   value: rooms.filter(r => r.is_active).length, color: "text-emerald-600" },
              { label: "Inactives", value: rooms.filter(r => !r.is_active).length,color: "text-muted-foreground" },
              { label: "En attente",value: pendingReservations.length,           color: "text-amber-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
                <p className={`text-xl font-semibold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="rooms" className="gap-1.5"><DoorOpen className="w-4 h-4" />Salles</TabsTrigger>
            <TabsTrigger value="reservations" className="gap-1.5">
              <Calendar className="w-4 h-4" />Réservations
              {pendingReservations.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{pendingReservations.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rooms" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <CardTitle className="text-lg">{filteredRooms.length} salle{filteredRooms.length !== 1 ? "s" : ""}</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative flex-1 sm:w-56">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Code, nom, bâtiment..." className="pl-9 h-9" />
                    </div>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les types</SelectItem>
                        {ROOM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                ) : filteredRooms.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground"><DoorOpen className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Aucune salle trouvée</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-28">Code</TableHead>
                          <TableHead>Nom</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="w-20">Places</TableHead>
                          <TableHead className="w-36">Localisation</TableHead>
                          <TableHead className="w-20">Statut</TableHead>
                          {isAdmin && <TableHead className="w-20"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRooms.map(room => {
                          const TypeIcon = getRoomTypeIcon(room.room_type);
                          return (
                            <TableRow key={room.id} className={!room.is_active ? "opacity-50" : ""}>
                              <TableCell><Badge variant="outline" className="font-mono text-xs tracking-wide">{room.room_code || "—"}</Badge></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2"><TypeIcon className="w-4 h-4 text-muted-foreground shrink-0" /><span className="font-medium">{room.name}</span></div>
                                {room.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{room.description}</p>}
                              </TableCell>
                              <TableCell><span className="text-sm text-muted-foreground">{getRoomTypeLabel(room.room_type)}</span></TableCell>
                              <TableCell><span className="flex items-center gap-1 text-sm"><Users className="w-3.5 h-3.5 text-muted-foreground" />{room.capacity}</span></TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {room.building && <span>{room.building}</span>}
                                {room.building && room.floor && <span> — </span>}
                                {room.floor && <span>Ét. {room.floor}</span>}
                                {!room.building && !room.floor && <span>—</span>}
                              </TableCell>
                              <TableCell>
                                {room.is_active
                                  ? <Badge className="bg-emerald-500 text-xs">Active</Badge>
                                  : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                              </TableCell>
                              {isAdmin && (
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRoom(room)}><Pencil className="w-3.5 h-3.5" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteRoom(room.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reservations" className="mt-4 space-y-4">
            {isAdmin && pendingReservations.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-5 h-5" />Demandes en attente ({pendingReservations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingReservations.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                        <div>
                          <p className="font-medium">{r.requester_profile ? `${r.requester_profile.first_name} ${r.requester_profile.last_name}` : "Inconnu"}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                            {r.room?.room_code && <Badge variant="outline" className="font-mono text-[10px] px-1">{r.room.room_code}</Badge>}
                            {r.room?.name} • {r.day_of_week ? DAYS_MAP[r.day_of_week] : ""} {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                        </div>
                        <Button size="sm" onClick={() => openReview(r)}>Examiner</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Historique des réservations</CardTitle></CardHeader>
              <CardContent>
                {reservations.length === 0 ? <p className="text-center py-8 text-muted-foreground">Aucune réservation</p> : (
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
                          <TableCell className="font-medium">{r.requester_profile ? `${r.requester_profile.first_name} ${r.requester_profile.last_name}` : "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {r.room?.room_code && <Badge variant="outline" className="font-mono text-[10px] px-1">{r.room.room_code}</Badge>}
                              <span className="text-sm">{r.room?.name || "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{r.day_of_week ? DAYS_MAP[r.day_of_week] : ""} {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</TableCell>
                          <TableCell className="text-sm max-w-48 truncate">{r.reason}</TableCell>
                          <TableCell>{getStatusBadge(r.status)}</TableCell>
                          {isAdmin && <TableCell>{r.status === "pending" && <Button size="sm" variant="outline" onClick={() => openReview(r)}>Examiner</Button>}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Examiner la demande</DialogTitle></DialogHeader>
            {reviewingReservation && (
              <div className="space-y-4 mt-4">
                <div className="p-3 bg-muted/50 rounded-lg space-y-1 text-sm">
                  <p><strong>Demandeur :</strong> {reviewingReservation.requester_profile ? `${reviewingReservation.requester_profile.first_name} ${reviewingReservation.requester_profile.last_name}` : "Inconnu"}</p>
                  <p><strong>Raison :</strong> {reviewingReservation.reason}</p>
                  <p><strong>Type :</strong> {reviewingReservation.event_type}</p>
                </div>
                <div>
                  <Label>Salle (modifiable)</Label>
                  <Select value={reviewForm.admin_modified_room_id} onValueChange={v => setReviewForm({ ...reviewForm, admin_modified_room_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rooms.filter(r => r.is_active).map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs opacity-60">{r.room_code}</span>{r.name} ({r.capacity} places)
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Heure début</Label><Input type="time" value={reviewForm.admin_modified_start_time} onChange={e => setReviewForm({ ...reviewForm, admin_modified_start_time: e.target.value })} /></div>
                  <div><Label>Heure fin</Label><Input type="time" value={reviewForm.admin_modified_end_time} onChange={e => setReviewForm({ ...reviewForm, admin_modified_end_time: e.target.value })} /></div>
                </div>
                <div><Label>Notes admin</Label><Textarea value={reviewForm.admin_notes} onChange={e => setReviewForm({ ...reviewForm, admin_notes: e.target.value })} placeholder="Remarques optionnelles..." /></div>
                <div className="flex gap-3">
                  <Button onClick={() => handleApproveReservation(false)} variant="destructive" className="flex-1 gap-2"><XCircle className="w-4 h-4" />Refuser</Button>
                  <Button onClick={() => handleApproveReservation(true)} className="flex-1 gap-2"><CheckCircle className="w-4 h-4" />Approuver</Button>
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
