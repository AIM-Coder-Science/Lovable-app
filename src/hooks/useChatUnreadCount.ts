import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const getStorageKey = (userId: string) => `chat_last_seen_${userId}`;

export const useChatUnreadCount = (enabled: boolean, onChatPage: boolean) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const markAllAsRead = useCallback(() => {
    if (!userId) return;
    localStorage.setItem(getStorageKey(userId), new Date().toISOString());
    setUnreadCount(0);
  }, [userId]);

  const refreshUnreadCount = useCallback(async (targetUserId: string, targetRoomIds: string[]) => {
    if (targetRoomIds.length === 0) {
      setUnreadCount(0);
      return;
    }

    const lastSeenAt = localStorage.getItem(getStorageKey(targetUserId)) ?? new Date(0).toISOString();

    const { count, error } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .in("room_id", targetRoomIds)
      .neq("sender_id", targetUserId)
      .gt("created_at", lastSeenAt);

    if (!error) {
      setUnreadCount(count ?? 0);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setUserId(null);
      setRoomIds([]);
      setUnreadCount(0);
      return;
    }

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    };

    loadUser();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !userId) return;

    const loadRooms = async () => {
      const { data, error } = await supabase
        .from("chat_room_members")
        .select("room_id")
        .eq("user_id", userId);

      if (error) {
        setRoomIds([]);
        setUnreadCount(0);
        return;
      }

      const uniqueRoomIds = [...new Set((data ?? []).map((row) => row.room_id))];
      setRoomIds(uniqueRoomIds);
      await refreshUnreadCount(userId, uniqueRoomIds);
    };

    loadRooms();
  }, [enabled, userId, refreshUnreadCount]);

  useEffect(() => {
    if (enabled && userId && onChatPage) {
      markAllAsRead();
    }
  }, [enabled, userId, onChatPage, markAllAsRead]);

  useEffect(() => {
    if (!enabled || !userId || roomIds.length === 0) return;

    const channel = supabase
      .channel(`chat-unread-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const message = payload.new as {
            room_id: string;
            sender_id: string;
            created_at: string;
          };

          if (!roomIds.includes(message.room_id) || message.sender_id === userId) return;

          if (onChatPage) {
            localStorage.setItem(getStorageKey(userId), new Date().toISOString());
            setUnreadCount(0);
            return;
          }

          const lastSeenAt = localStorage.getItem(getStorageKey(userId)) ?? new Date(0).toISOString();
          if (message.created_at > lastSeenAt) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, roomIds, onChatPage]);

  return { unreadCount, markAllAsRead };
};
