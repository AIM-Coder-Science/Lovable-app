
-- Rooms table
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 30,
  room_type text NOT NULL DEFAULT 'classroom',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rooms" ON public.rooms FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view rooms" ON public.rooms FOR SELECT TO authenticated
  USING (true);

-- Room reservations table
CREATE TABLE public.room_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  event_type text NOT NULL DEFAULT 'cours',
  day_of_week integer,
  start_time time NOT NULL,
  end_time time NOT NULL,
  specific_date date,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  admin_modified_room_id uuid REFERENCES public.rooms(id),
  admin_modified_start_time time,
  admin_modified_end_time time,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can create reservations" ON public.room_reservations FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Teachers can view own reservations" ON public.room_reservations FOR SELECT TO authenticated
  USING (requested_by = auth.uid());

CREATE POLICY "Admins can manage all reservations" ON public.room_reservations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add room_id FK to timetable_slots (optional, keep room text for backward compat)
ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id);

-- Trigger for updated_at
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_room_reservations_updated_at BEFORE UPDATE ON public.room_reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for reservations (for notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_reservations;
