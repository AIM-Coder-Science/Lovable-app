
-- Add chat_enabled to school_settings
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT false;

-- Create chat_rooms table
CREATE TABLE public.chat_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL DEFAULT 'class', -- 'class' (students of same class), 'teachers' (all teachers), 'teacher_class' (teacher + students of class)
  class_id UUID REFERENCES public.classes(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create chat_room_members table
CREATE TABLE public.chat_room_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;

-- RLS for chat_rooms: members can view rooms they belong to
CREATE POLICY "Users can view their chat rooms"
ON public.chat_rooms FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    WHERE crm.room_id = chat_rooms.id AND crm.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin')
);

-- RLS for chat_messages: members of the room can read/write
CREATE POLICY "Members can view messages in their rooms"
ON public.chat_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    WHERE crm.room_id = chat_messages.room_id AND crm.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Members can send messages in their rooms"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    WHERE crm.room_id = chat_messages.room_id AND crm.user_id = auth.uid()
  )
);

-- RLS for chat_room_members
CREATE POLICY "Users can view members of their rooms"
ON public.chat_room_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    WHERE crm.room_id = chat_room_members.room_id AND crm.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin')
);

-- Admins can manage rooms and members
CREATE POLICY "Admins can manage chat rooms"
ON public.chat_rooms FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage chat room members"
ON public.chat_room_members FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
