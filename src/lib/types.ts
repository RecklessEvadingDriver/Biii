export interface Room {
  id: string;
  code: string;
  name: string;
  video_url: string;
  created_by: string;
  is_playing: boolean;
  playback_position: number;
  last_synced_at: string;
  created_at: string;
}

export interface Participant {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  is_host: boolean;
  joined_at: string;
  left_at: string | null;
  mic_enabled: boolean;
  cam_enabled: boolean;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}
