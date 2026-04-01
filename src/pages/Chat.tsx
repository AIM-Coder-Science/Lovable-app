import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Send, Users, Lock, RefreshCw } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";

interface ChatRoom {
  id: string;
  name: string;
  room_type: string;
  class_id: string | null;
}

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
}

const getRoomIcon = (type: string) => {
  switch (type) {
    case 'class': return '🎓';
    case 'teachers': return '👨‍🏫';
    case 'teacher_class': return '📚';
    default: return '💬';
  }
};

const getRoomLabel = (type: string) => {
  switch (type) {
    case 'class': return 'Classe';
    case 'teachers': return 'Enseignants';
    case 'teacher_class': return 'Mixte';
    default: return 'Chat';
  }
};

const getInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const Chat = () => {
  const { user, role, loading: authLoading } = useAuth();
  const [chatEnabled, setChatEnabled] = useState<boolean | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [mobileShowRooms, setMobileShowRooms] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase
        .from('school_settings')
        .select('chat_enabled')
        .limit(1)
        .maybeSingle();
      setChatEnabled(data?.chat_enabled ?? false);
    };
    check();
  }, []);

  const fetchRooms = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('chat_rooms')
      .select('id, name, room_type, class_id')
      .order('name', { ascending: true });

    if (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de charger les salons de discussion",
        variant: "destructive",
      });
      setRooms([]);
      setSelectedRoom(null);
      setLoading(false);
      return;
    }

    const roomList: ChatRoom[] = (data || []).map((room: any) => ({
      id: room.id,
      name: room.name,
      room_type: room.room_type,
      class_id: room.class_id,
    }));

    const uniqueRooms = Array.from(new Map(roomList.map((room) => [room.id, room])).values());
    setRooms(uniqueRooms);

    if (uniqueRooms.length > 0) {
      if (!selectedRoom || !uniqueRooms.some((room) => room.id === selectedRoom)) {
        setSelectedRoom(uniqueRooms[0].id);
      }
      setMobileShowRooms(false);
    } else {
      setSelectedRoom(null);
    }

    setLoading(false);
  };

  const fetchMessages = async () => {
    if (!selectedRoom) return;
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', selectedRoom)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les messages", variant: "destructive" });
      return;
    }

    const senderIds = [...new Set((data || []).map((m: any) => m.sender_id))];
    
    // Fetch profiles with fallback to user_credentials email prefix
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, email')
      .in('user_id', senderIds);

    const nameMap: Record<string, string> = {};
    profiles?.forEach((p: any) => {
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
      // Use email prefix as last resort if name fields are empty
      nameMap[p.user_id] = fullName || (p.email ? p.email.split('@')[0] : 'Utilisateur');
    });
    setProfilesMap(prev => ({ ...prev, ...nameMap }));

    setMessages((data || []).map((m: any) => ({
      ...m,
      sender_name: nameMap[m.sender_id] || profilesMap[m.sender_id] || 'Utilisateur',
    })));
  };

  useEffect(() => {
    if (chatEnabled && user) fetchRooms();
  }, [chatEnabled, user]);

  useEffect(() => {
    if (selectedRoom) fetchMessages();
  }, [selectedRoom]);

  useEffect(() => {
    if (!selectedRoom) return;
    const channel = supabase
      .channel(`chat-${selectedRoom}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `room_id=eq.${selectedRoom}`,
      }, async (payload) => {
        const msg = payload.new as any;
        let senderName = profilesMap[msg.sender_id];
        if (!senderName) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', msg.sender_id)
            .maybeSingle();
          senderName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || 'Utilisateur' : 'Utilisateur';
          setProfilesMap(prev => ({ ...prev, [msg.sender_id]: senderName! }));
        }
        setMessages(prev => [...prev, { ...msg, sender_name: senderName }]);
        if (msg.sender_id !== user?.id) {
          sonnerToast(`${senderName}`, {
            description: msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content,
            duration: 5000,
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedRoom, profilesMap]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom || !user) return;
    const content = newMessage.trim();
    setNewMessage("");
    const { error } = await supabase.from('chat_messages').insert({
      room_id: selectedRoom,
      sender_id: user.id,
      content,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message || "Impossible d'envoyer le message", variant: "destructive" });
      setNewMessage(content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (authLoading || chatEnabled === null) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground text-sm">Chargement...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!chatEnabled) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
            <Lock className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Chat désactivé</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Le système de messagerie n'est pas encore activé. Contactez votre administrateur.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const selectedRoomData = rooms.find(r => r.id === selectedRoom);

  // Group messages by date
  const groupedMessages: { date: string; messages: ChatMessage[] }[] = [];
  messages.forEach(msg => {
    const date = new Date(msg.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === date) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ date, messages: [msg] });
    }
  });

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Messagerie</h1>
            <p className="text-xs text-muted-foreground">{rooms.length} conversation{rooms.length > 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex rounded-xl border border-border bg-card overflow-hidden shadow-sm min-h-0">
          {/* Sidebar */}
          <div className={cn(
            "w-72 border-r border-border flex flex-col bg-muted/30",
            mobileShowRooms ? "flex" : "hidden md:flex"
          )}>
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground px-1">
                <Users className="w-4 h-4" />
                Conversations
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {rooms.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <MessageCircle className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Aucune conversation</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Demandez à l'administrateur de configurer les salons depuis Paramètres &gt; Système.
                    </p>
                    <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={fetchRooms}>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Actualiser
                    </Button>
                  </div>
                ) : (
                  rooms.map(room => (
                    <button
                      key={room.id}
                      onClick={() => { setSelectedRoom(room.id); setMobileShowRooms(false); }}
                      className={cn(
                        "w-full text-left p-3 rounded-lg transition-all duration-150 group",
                        selectedRoom === room.id
                          ? "bg-primary/10 border border-primary/20 shadow-sm"
                          : "hover:bg-muted border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getRoomIcon(room.room_type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "font-medium text-sm truncate",
                            selectedRoom === room.id ? "text-primary" : "text-foreground"
                          )}>{room.name}</p>
                          <Badge variant="outline" className="text-[10px] mt-1 px-1.5 py-0">
                            {getRoomLabel(room.room_type)}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Messages */}
          <div className={cn(
            "flex-1 flex flex-col min-w-0",
            !mobileShowRooms ? "flex" : "hidden md:flex"
          )}>
            {selectedRoomData ? (
              <>
                {/* Room header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card">
                  <button
                    className="md:hidden text-muted-foreground hover:text-foreground"
                    onClick={() => setMobileShowRooms(true)}
                  >
                    ←
                  </button>
                  <span className="text-lg">{getRoomIcon(selectedRoomData.room_type)}</span>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground">{selectedRoomData.name}</h3>
                    <p className="text-xs text-muted-foreground">{getRoomLabel(selectedRoomData.room_type)}</p>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-1">
                    {groupedMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-3">
                          <MessageCircle className="w-8 h-8 text-muted-foreground/40" />
                        </div>
                        <p className="font-medium text-sm">Aucun message</p>
                        <p className="text-xs mt-1">Soyez le premier à écrire !</p>
                      </div>
                    ) : (
                      groupedMessages.map((group, gi) => (
                        <div key={gi}>
                          <div className="flex items-center gap-3 my-4">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-card px-2">{group.date}</span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                          {group.messages.map((msg, mi) => {
                            const isMe = msg.sender_id === user?.id;
                            const showAvatar = !isMe && (mi === 0 || group.messages[mi - 1]?.sender_id !== msg.sender_id);
                            const showName = showAvatar;
                            return (
                              <div key={msg.id} className={cn("flex gap-2 mb-1", isMe ? "justify-end" : "justify-start")}>
                                {!isMe && (
                                  <div className="w-7 flex-shrink-0">
                                    {showAvatar && (
                                      <Avatar className="w-7 h-7">
                                        <AvatarFallback className={cn("text-[10px] text-white font-bold", getAvatarColor(msg.sender_name || ''))}>
                                          {getInitials(msg.sender_name || '?')}
                                        </AvatarFallback>
                                      </Avatar>
                                    )}
                                  </div>
                                )}
                                <div className={cn("max-w-[75%]", isMe ? "items-end" : "items-start")}>
                                  {showName && (
                                    <p className="text-[11px] font-semibold text-muted-foreground mb-0.5 ml-1">{msg.sender_name}</p>
                                  )}
                                  <div className={cn(
                                    "px-3 py-2 rounded-2xl text-sm leading-relaxed",
                                    isMe
                                      ? "bg-primary text-primary-foreground rounded-br-md"
                                      : "bg-muted rounded-bl-md"
                                  )}>
                                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                  </div>
                                  <p className={cn("text-[10px] mt-0.5 px-1", isMe ? "text-right text-muted-foreground/50" : "text-muted-foreground/50")}>
                                    {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="p-3 border-t border-border bg-card">
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-1">
                    <Input
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Écrire un message..."
                      className="border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm h-9"
                    />
                    <Button
                      onClick={sendMessage}
                      size="icon"
                      disabled={!newMessage.trim()}
                      className="h-8 w-8 rounded-lg flex-shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <MessageCircle className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p className="font-medium text-foreground">Sélectionnez une conversation</p>
                  <p className="text-xs text-muted-foreground mt-1">Choisissez un salon pour commencer</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Chat;
