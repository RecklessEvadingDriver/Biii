/*
  # Remove Auth Requirements from RLS Policies

  1. Changes
    - Replace all authenticated-only policies with permissive policies
    - Allow anonymous access to rooms and participants tables
    - This removes the need for user authentication entirely

  2. Security
    - RLS remains enabled but policies are now open for the watch party use case
    - Anyone with a room code can join and participate
*/

-- Drop existing policies on rooms
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON rooms;
DROP POLICY IF EXISTS "Room participants can view rooms" ON rooms;
DROP POLICY IF EXISTS "Room creator can update rooms" ON rooms;
DROP POLICY IF EXISTS "Hosts can update playback" ON rooms;

-- Drop existing policies on participants
DROP POLICY IF EXISTS "Participants can view participants in their rooms" ON participants;
DROP POLICY IF EXISTS "Users can join rooms" ON participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON participants;
DROP POLICY IF EXISTS "Users can leave rooms" ON participants;

-- New open policies on rooms
CREATE POLICY "Anyone can create rooms" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can update rooms" ON rooms FOR UPDATE USING (true) WITH CHECK (true);

-- New open policies on participants
CREATE POLICY "Anyone can view participants" ON participants FOR SELECT USING (true);
CREATE POLICY "Anyone can join rooms" ON participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update participants" ON participants FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can leave rooms" ON participants FOR DELETE USING (true);

-- Make created_by nullable since we no longer require auth
ALTER TABLE rooms ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE participants ALTER COLUMN user_id DROP NOT NULL;
