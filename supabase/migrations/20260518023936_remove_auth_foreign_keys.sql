/*
  # Remove Foreign Key on rooms.created_by

  1. Changes
    - Drop the foreign key constraint on rooms.created_by that references auth.users(id)
    - This allows the column to store any UUID (e.g., anonymous user IDs from localStorage)
    - The column remains nullable and is still used to track who created the room

  2. Also drop the foreign key on participants.user_id for the same reason
    - Anonymous user IDs are not in auth.users, so the FK constraint must be removed
*/

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_created_by_fkey;
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_user_id_fkey;
