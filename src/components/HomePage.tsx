import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateRoomCode } from '../lib/utils';
import { getOrCreateUserId, getDisplayName } from '../lib/session';
import {
  Tv, Link, Users, ArrowRight, Sparkles, Globe, MessageCircle
} from 'lucide-react';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function HomePage() {
  const [videoUrl, setVideoUrl] = useState('');
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState(getDisplayName());
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState(getDisplayName());
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    setError('');
    setCreating(true);
    try {
      const userId = getOrCreateUserId();
      localStorage.setItem('watchparty_displayname', displayName.trim() || 'Anonymous');
      const code = generateRoomCode();
      const name = roomName.trim() || 'Watch Party';
      const { data, error: dbError } = await supabase
        .from('rooms')
        .insert({
          code,
          name,
          video_url: videoUrl.trim(),
          created_by: userId,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      const { error: participantError } = await supabase
        .from('participants')
        .insert({
          room_id: data.id,
          user_id: userId,
          display_name: displayName.trim() || 'Anonymous',
          is_host: true,
        });

      if (participantError) throw participantError;

      window.location.hash = `#/room/${data.id}`;
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create room'));
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError('');
    setJoining(true);
    try {
      const userId = getOrCreateUserId();
      localStorage.setItem('watchparty_displayname', joinName.trim() || 'Anonymous');
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id')
        .eq('code', joinCode.trim().toUpperCase())
        .maybeSingle();

      if (roomError) throw roomError;
      if (!room) throw new Error('Room not found. Check the code and try again.');

      const { data: existing } = await supabase
        .from('participants')
        .select('id')
        .eq('room_id', room.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('participants')
          .update({ left_at: null, display_name: joinName.trim() || 'Anonymous' })
          .eq('id', existing.id);
      } else {
        const { error: pError } = await supabase
          .from('participants')
          .insert({
            room_id: room.id,
            user_id: userId,
            display_name: joinName.trim() || 'Anonymous',
            is_host: false,
          });
        if (pError) throw pError;
      }

      window.location.hash = `#/room/${room.id}`;
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to join room'));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800/50 bg-gray-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Tv className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">WatchParty</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm mb-6">
          <Sparkles className="w-4 h-4" />
          Watch with friends in real-time
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold text-white tracking-tight leading-tight">
          Binge Together,<br />
          <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Laugh Together
          </span>
        </h1>
        <p className="text-gray-400 text-lg mt-4 max-w-xl mx-auto">
          Paste a video link, create a room, and invite your friends. Video sync, face cam, and voice chat -- all in one place.
        </p>
      </section>

      {/* Main Actions */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Room */}
          <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 sm:p-8 hover:border-emerald-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Create a Room</h2>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Video URL</label>
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="url"
                    placeholder="https://example.com/video.mp4"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    required
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Room Name (optional)</label>
                <input
                  type="text"
                  placeholder="Friday Night Movies"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium rounded-xl hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Create Room
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Join Room */}
          <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 sm:p-8 hover:border-teal-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-teal-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Join a Room</h2>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Room Code</label>
                <input
                  type="text"
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  required
                  maxLength={6}
                  className="w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all text-center text-2xl tracking-[0.3em] font-mono uppercase"
                />
              </div>
              <p className="text-sm text-gray-500">Ask the room host for the 6-character code</p>
              <button
                type="submit"
                disabled={joining}
                className="w-full py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium rounded-xl hover:from-teal-500 hover:to-cyan-500 transition-all shadow-lg shadow-teal-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {joining ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Join Room
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-center max-w-md mx-auto">
            {error}
          </div>
        )}

        {/* Features */}
        <div className="mt-16 grid sm:grid-cols-3 gap-6">
          <div className="text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <Tv className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Synced Playback</h3>
            <p className="text-gray-500 text-sm">Play, pause, and seek in perfect sync with everyone in the room.</p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-6 h-6 text-teal-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Voice Chat</h3>
            <p className="text-gray-500 text-sm">Talk to your friends in real-time with built-in voice chat.</p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Face Cam</h3>
            <p className="text-gray-500 text-sm">See your friends' reactions with live face cam feeds.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
