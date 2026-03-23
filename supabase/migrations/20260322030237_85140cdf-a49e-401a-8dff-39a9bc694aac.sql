-- Avoid recursive RLS checks for chat membership by moving membership lookup into a SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.is_chat_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_room_members
    WHERE room_id = _room_id
      AND user_id = _user_id
  )
$$;

-- Chat room members policy (remove self-referential query)
DROP POLICY IF EXISTS "Users can view members of their rooms" ON public.chat_room_members;
CREATE POLICY "Users can view members of their rooms"
ON public.chat_room_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_chat_room_member(room_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Chat rooms policy (use secure function for membership check)
DROP POLICY IF EXISTS "Users can view their chat rooms" ON public.chat_rooms;
CREATE POLICY "Users can view their chat rooms"
ON public.chat_rooms
FOR SELECT
TO authenticated
USING (
  public.is_chat_room_member(id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Chat messages policies (use secure membership check)
DROP POLICY IF EXISTS "Members can view messages in their rooms" ON public.chat_messages;
CREATE POLICY "Members can view messages in their rooms"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  public.is_chat_room_member(room_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Members can send messages in their rooms" ON public.chat_messages;
CREATE POLICY "Members can send messages in their rooms"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_chat_room_member(room_id, auth.uid())
);