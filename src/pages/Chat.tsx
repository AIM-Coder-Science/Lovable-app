import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Send, Users, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatRoom {
  id: string;
  name: string;
  room_type: string;
  class_id: string | null;
  last_message?: string;
  last_message_at?: string;
}

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
}

const Chat = () => {
  const { user, role, loading: authLoading } = useAuth();
  const [chatEnabled, setChatEnabled] = useState<boolean | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if chat is enabled
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

  // Auto-create rooms for the user if needed
  const ensureRooms = async () => {
    if (!user || !role || role === 'admin') return;

    if (role === 'student') {
      // Find student's class
      const { data: student } = await supabase
        .from('students')
        .select('class_id, classes(name)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!student?.class_id) return;

      // Check if class chat room exists
      const { data: existingRoom } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('class_id', student.class_id)
        .eq('room_type', 'class')
        .maybeSingle();

      if (!existingRoom) {
        // Create class chat room (via admin-like approach - we'll use an edge function or just check)
        // For now, rooms are created by auto-setup
      }
    }
  };

  // Fetch rooms
  const fetchRooms = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('chat_room_members')
      .select('room_id, chat_rooms(id, name, room_type, class_id)')
      .eq('user_id', user.id);

    if (!error && data) {
      const roomList: ChatRoom[] = data
        .filter((d: any) => d.chat_rooms)
        .map((d: any) => ({
          id: d.chat_rooms.id,
          name: d.chat_rooms.name,
          room_type: d.chat_rooms.room_type,
          class_id: d.chat_rooms.class_id,
        }));
      setRooms(roomList);
      if (roomList.length > 0 && !selectedRoom) {
        setSelectedRoom(roomList[0].id);
      }
    }
    setLoading(false);
  };

  // Fetch messages for selected room
  const fetchMessages = async () => {
    if (!selectedRoom) return;

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', selectedRoom)
      .order('created_at', { ascending: true })
      .limit(200);

    if (!error && data) {
      // Fetch sender names
      const senderIds = [...new Set(data.map((m: any) => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', senderIds);

      const nameMap: Record<string, string> = {};
      profiles?.forEach((p: any) => {
        nameMap[p.user_id] = `${p.first_name} ${p.last_name}`;
      });
      setProfilesMap(prev => ({ ...prev, ...nameMap }));

      setMessages(data.map((m: any) => ({
        ...m,
        sender_name: nameMap[m.sender_id] || 'Inconnu',
      })));
    }
  };

  useEffect(() => {
    if (chatEnabled && user) {
      fetchRooms();
    }
  }, [chatEnabled, user]);

  useEffect(() => {
    if (selectedRoom) {
      fetchMessages();
    }
  }, [selectedRoom]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedRoom) return;

    const channel = supabase
      .channel(`chat-${selectedRoom}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${selectedRoom}`,
        },
        async (payload) => {
          const msg = payload.new as any;
          // Get sender name
          let senderName = profilesMap[msg.sender_id];
          if (!senderName) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('user_id', msg.sender_id)
              .maybeSingle();
            senderName = profile ? `${profile.first_name} ${profile.last_name}` : 'Inconnu';
            setProfilesMap(prev => ({ ...prev, [msg.sender_id]: senderName! }));
          }
          setMessages(prev => [...prev, { ...msg, sender_name: senderName }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoom, profilesMap]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom || !user) return;

    const { error } = await supabase.from('chat_messages').insert({
      room_id: selectedRoom,
      sender_id: user.id,
      content: newMessage.trim(),
    });

    if (error) {
      toast({ title: "Erreur", description: "Impossible d'envoyer le message", variant: "destructive" });
    } else {
      setNewMessage("");
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
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!chatEnabled) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <Lock className="w-16 h-16 text-muted-foreground" />
          <h2 className="text-2xl font-bold text-foreground">Chat désactivé</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Le système de chat n'est pas encore activé par l'administration. Contactez votre administrateur pour l'activer.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const selectedRoomData = rooms.find(r => r.id === selectedRoom);

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in h-[calc(100vh-8rem)]">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="w-8 h-8" />
            Messagerie
          </h1>
          <p className="text-muted-foreground">Discutez avec vos camarades et enseignants</p>
        </div>

        <div className="flex gap-4 h-[calc(100%-5rem)]">
          {/* Room list */}
          <Card className="w-72 flex-shrink-0 flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" />
                Conversations
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-2 overflow-y-auto">
              {rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">
                  Aucune conversation disponible
                </p>
              ) : (
                rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg mb-1 transition-colors",
                      selectedRoom === room.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <p className="font-medium text-sm truncate">{room.name}</p>
                    <Badge variant="outline" className="text-xs mt-1">
                      {room.room_type === 'class' ? 'Classe' : room.room_type === 'teachers' ? 'Enseignants' : 'Mixte'}
                    </Badge>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Messages area */}
          <Card className="flex-1 flex flex-col">
            {selectedRoomData ? (
              <>
                <CardHeader className="pb-2 border-b">
                  <CardTitle className="text-base">{selectedRoomData.name}</CardTitle>
                </CardHeader>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {messages.map(msg => {
                      const isMe = msg.sender_id === user?.id;
                      return (
                        <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[70%] rounded-2xl px-4 py-2",
                            isMe
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm"
                          )}>
                            {!isMe && (
                              <p className="text-xs font-semibold mb-1 opacity-70">{msg.sender_name}</p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            <p className={cn("text-xs mt-1 opacity-50", isMe ? "text-right" : "")}>
                              {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                <div className="p-4 border-t flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Écrire un message..."
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} size="icon" disabled={!newMessage.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Sélectionnez une conversation</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Chat;
