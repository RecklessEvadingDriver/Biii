/*
  # Create Watch Party Schema

  1. New Tables
    - `rooms` - Watch party rooms with video URL and playback state
    - `participants` - Users in each room with mic/cam status

  2. Security
    - RLS enabled on both tables
    - Only authenticated users can create/join rooms
    - Users can only modify their own data
    - Hosts can control playback state
*/

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT 'Watch Party',
  video_url text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_playing boolean DEFAULT false,
  playback_position numeric DEFAULT 0,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Anonymous',
  is_host boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  left_at timestamptz,
  mic_enabled boolean DEFAULT false,
  cam_enabled boolean DEFAULT false,
  UNIQUE(room_id, user_id)
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can create rooms"
  ON rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Room participants can view rooms"
  ON rooms FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM participants
      WHERE participants.room_id = rooms.id
      AND participants.user_id = auth.uid()
      AND participants.left_at IS NULL
    )
  );

CREATE POLICY "Room creator can update rooms"
  ON rooms FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Hosts can update playback"
  ON rooms FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.room_id = rooms.id
      AND participants.user_id = auth.uid()
      AND participants.is_host = true
      AND participants.left_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.room_id = rooms.id
      AND participants.user_id = auth.uid()
      AND participants.is_host = true
      AND participants.left_at IS NULL
    )
  );

CREATE POLICY "Participants can view participants in their rooms"
  ON participants FOR SELECT
  TO authenticated
  USING (
    room_id IN (
      SELECT id FROM rooms WHERE created_by = auth.uid()
      UNION
      SELECT room_id FROM participants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join rooms"
  ON participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participant record"
  ON participants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms"
  ON participants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_participants_room ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id);
