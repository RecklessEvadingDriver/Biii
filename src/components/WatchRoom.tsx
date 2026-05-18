import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useWebRTC } from '../hooks/useWebRTC';
import { formatTime, copyToClipboard } from '../lib/utils';
import { getOrCreateUserId, getDisplayName } from '../lib/session';
import type { Room, Participant } from '../lib/types';
import {
  Play, Pause, Volume2, VolumeX, Mic, MicOff,
  Video, VideoOff, Copy, Users, ArrowLeft, Maximize,
  Minimize, MessageCircle, Send
} from 'lucide-react';

interface ChatMessage {
  id: string;
  user: string;
  text: string;
  time: number;
}

const PLAYERJS_SCRIPT_SRC = 'https://recklessevadingdriver.github.io/Player/playerjs.js';

function loadPlayerJSScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).Playerjs) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${PLAYERJS_SCRIPT_SRC}"]`);
    if (existing) {
      const check = setInterval(() => {
        if ((window as any).Playerjs) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = PLAYERJS_SCRIPT_SRC;
    script.type = 'text/javascript';
    script.onload = () => resolve();
    script.onerror = () => {
      console.error('Failed to load PlayerJS script');
      resolve();
    };
    document.head.appendChild(script);
  });
}

export default function WatchRoom({ roomId }: { roomId: string }) {
  const userId = getOrCreateUserId();
  const displayName = getDisplayName();
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const syncLockRef = useRef(false);
  const channelRef = useRef<any>(null);
  const containerIdRef = useRef<string>('');

  const {
    localStream,
    peerStreams,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    createOffer,
    handleSignaling,
    setChannel,
    cleanup: webrtcCleanup,
  } = useWebRTC(roomId, userId);

  // Load room data
  useEffect(() => {
    const fetchRoom = async () => {
      const { data, error: dbError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (dbError || !data) {
        setError('Room not found');
        setLoading(false);
        return;
      }

      setRoom(data);

      const { data: parts } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .is('left_at', null);

      setParticipants(parts || []);
      setLoading(false);
    };

    fetchRoom();
  }, [roomId]);

  // Initialize PlayerJS when room data is available
  useEffect(() => {
    if (!room) return;

    const initPlayer = async () => {
      await loadPlayerJSScript();

      if (!playerContainerRef.current) return;
      if (playerRef.current) return;

      const containerId = `playerjs-${room.id}`;
      containerIdRef.current = containerId;
      playerContainerRef.current.id = containerId;

      const startFrom = Number(room.playback_position) || 0;

      // Global event handler for PlayerJS
      (window as any).PlayerjsEvents = (event: string, id: string, data: any) => {
        if (id !== containerIdRef.current) return;

        if (event === 'time') {
          setVideoProgress(Number(data));
        }
        if (event === 'duration') {
          setVideoDuration(Number(data));
        }
        if (event === 'play' || event === 'userplay') {
          setIsPlaying(true);
        }
        if (event === 'pause' || event === 'userpause') {
          setIsPlaying(false);
        }
        if (event === 'mute') {
          setIsMuted(true);
        }
        if (event === 'unmute') {
          setIsMuted(false);
        }
        if (event === 'seek' || event === 'userseek') {
          setVideoProgress(Number(data));
        }
        if (event === 'fullscreen') {
          setIsFullscreen(true);
        }
        if (event === 'exitfullscreen') {
          setIsFullscreen(false);
        }
      };

      const PlayerjsConstructor = (window as any).Playerjs;
      if (!PlayerjsConstructor) {
        console.error('Playerjs constructor not found on window');
        return;
      }

      try {
        playerRef.current = new PlayerjsConstructor({
          id: containerId,
          file: room.video_url,
          autoplay: room.is_playing ? 1 : 0,
          start: startFrom > 0 ? startFrom : undefined,
        });
      } catch (err) {
        console.error('Failed to initialize PlayerJS:', err);
      }
    };

    initPlayer();

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.api('destroy');
        } catch {}
        playerRef.current = null;
      }
      // Reset container id so it can be re-assigned on remount
      if (playerContainerRef.current) {
        playerContainerRef.current.id = '';
      }
    };
  }, [room?.id]);

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: true } },
    });

    channelRef.current = channel;
    setChannel(channel);

    channel
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      }, (payload: any) => {
        setRoom(payload.new);
        if (playerRef.current && !syncLockRef.current) {
          syncLockRef.current = true;
          const newTime = Number(payload.new.playback_position);
          let currentTime = 0;
          try { currentTime = playerRef.current.api('time') || 0; } catch {}

          if (Math.abs(newTime - currentTime) > 1.5) {
            try { playerRef.current.api('seek', newTime); } catch {}
          }
          let currentlyPlaying = false;
          try { currentlyPlaying = playerRef.current.api('playing'); } catch {}

          if (payload.new.is_playing && !currentlyPlaying) {
            try { playerRef.current.api('play'); } catch {}
          } else if (!payload.new.is_playing && currentlyPlaying) {
            try { playerRef.current.api('pause'); } catch {}
          }
          setTimeout(() => { syncLockRef.current = false; }, 500);
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'participants',
        filter: `room_id=eq.${roomId}`,
      }, async () => {
        const { data } = await supabase
          .from('participants')
          .select('*')
          .eq('room_id', roomId)
          .is('left_at', null);
        setParticipants(data || []);
      })
      .on('broadcast', { event: 'webrtc-signal' }, (payload: any) => {
        handleSignaling(payload.payload);
      })
      .on('broadcast', { event: 'chat' }, (payload: any) => {
        setChatMessages((prev) => [...prev, payload.payload]);
      })
      .on('broadcast', { event: 'user-joined' }, (payload: any) => {
        if (payload.payload.userId !== userId) {
          createOffer(payload.payload.userId);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'user-joined',
            payload: { userId, displayName },
          });
        }
      });

    return () => {
      channel.unsubscribe();
      webrtcCleanup();
    };
  }, [roomId, userId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const isHost = participants.find((p) => p.user_id === userId)?.is_host ?? false;

  const syncPlayback = useCallback(async (playing: boolean, position?: number) => {
    if (!isHost || !room) return;
    const updates: any = { is_playing: playing, last_synced_at: new Date().toISOString() };
    if (position !== undefined) updates.playback_position = position;
    await supabase.from('rooms').update(updates).eq('id', room.id);
  }, [isHost, room]);

  const handlePlayPause = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      try { playerRef.current.api('pause'); } catch {}
      let t = 0;
      try { t = playerRef.current.api('time'); } catch {}
      syncPlayback(false, t);
    } else {
      try { playerRef.current.api('play'); } catch {}
      let t = 0;
      try { t = playerRef.current.api('time'); } catch {}
      syncPlayback(true, t);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerRef.current || !videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * videoDuration;
    try { playerRef.current.api('seek', newTime); } catch {}
    syncPlayback(isPlaying, newTime);
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      try { playerRef.current.api('unmute'); } catch {}
    } else {
      try { playerRef.current.api('mute'); } catch {}
    }
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!playerRef.current) return;
    if (!isFullscreen) {
      try { playerRef.current.api('fullscreen'); } catch {}
    } else {
      try { playerRef.current.api('exitfullscreen'); } catch {}
    }
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !channelRef.current) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      user: displayName,
      text: chatInput.trim(),
      time: Date.now(),
    };
    channelRef.current.send({
      type: 'broadcast',
      event: 'chat',
      payload: msg,
    });
    setChatInput('');
  };

  const handleCopyCode = () => {
    if (room) {
      copyToClipboard(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const leaveRoom = async () => {
    await supabase
      .from('participants')
      .update({ left_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (playerRef.current) {
      try { playerRef.current.api('destroy'); } catch {}
      playerRef.current = null;
    }
    webrtcCleanup();
    window.location.hash = '#/';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error || 'Room not found'}</p>
          <a href="#/" className="text-emerald-400 hover:underline">Go back home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={leaveRoom} className="p-2 hover:bg-gray-800 rounded-lg transition-all text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-white font-semibold text-sm sm:text-base">{room.name}</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Code: {room.code}</span>
                <button onClick={handleCopyCode} className="text-emerald-400 hover:text-emerald-300 transition-colors">
                  {copied ? <span className="text-emerald-400">Copied!</span> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-800/50 rounded-lg">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">{participants.length}</span>
            </div>
            <button
              onClick={() => setShowChat(!showChat)}
              className={`p-2 rounded-lg transition-all ${showChat ? 'bg-emerald-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video + Cams Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video Player - PlayerJS container */}
          <div className="relative flex-1 bg-black flex items-center justify-center">
            <div
              ref={playerContainerRef}
              className="w-full h-full"
              style={{ minHeight: '400px' }}
            />
          </div>

          {/* Custom Controls Bar */}
          <div className="bg-gray-900/90 border-t border-gray-800/50 px-4 py-2">
            <div className="flex items-center gap-3">
              <button onClick={handlePlayPause} className="p-2 hover:bg-gray-800 rounded-lg transition-all text-gray-300 hover:text-white">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button onClick={toggleMute} className="p-2 hover:bg-gray-800 rounded-lg transition-all text-gray-300 hover:text-white">
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              {/* Progress bar */}
              <div className="flex-1 cursor-pointer" onClick={handleSeek}>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden hover:h-2.5 transition-all">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${videoDuration ? (videoProgress / videoDuration) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-gray-500">
                  <span>{formatTime(videoProgress)}</span>
                  <span>{formatTime(videoDuration)}</span>
                </div>
              </div>
              <button onClick={toggleFullscreen} className="p-2 hover:bg-gray-800 rounded-lg transition-all text-gray-300 hover:text-white">
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Face Cams Strip */}
          <div className="bg-gray-900/80 border-t border-gray-800/50 p-3">
            <div className="flex gap-3 overflow-x-auto">
              {/* Local cam */}
              <div className="relative flex-shrink-0">
                <div className={`w-28 h-20 rounded-xl overflow-hidden border-2 ${camOn ? 'border-emerald-500' : 'border-gray-700'} bg-gray-800`}>
                  {camOn && localStream ? (
                    <video
                      autoPlay
                      muted
                      playsInline
                      ref={(el) => {
                        if (el && localStream) el.srcObject = localStream;
                      }}
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoOff className="w-6 h-6 text-gray-600" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                  <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded truncate">
                    You
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full ${micOn ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                </div>
              </div>

              {/* Peer cams */}
              {Array.from(peerStreams.entries()).map(([peerId, stream]) => {
                const participant = participants.find((p) => p.user_id === peerId);
                return (
                  <div key={peerId} className="relative flex-shrink-0">
                    <div className="w-28 h-20 rounded-xl overflow-hidden border-2 border-teal-500 bg-gray-800">
                      <video
                        autoPlay
                        playsInline
                        ref={(el) => {
                          if (el) el.srcObject = stream;
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute bottom-1 left-1 right-1">
                      <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded truncate">
                        {participant?.display_name || 'Friend'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Empty slots for participants without cam */}
              {participants
                .filter((p) => p.user_id !== userId && !peerStreams.has(p.user_id))
                .map((p) => (
                  <div key={p.user_id} className="relative flex-shrink-0">
                    <div className="w-28 h-20 rounded-xl overflow-hidden border-2 border-gray-700 bg-gray-800 flex items-center justify-center">
                      <Users className="w-6 h-6 text-gray-600" />
                    </div>
                    <div className="absolute bottom-1 left-1 right-1">
                      <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded truncate">
                        {p.display_name}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Media Controls */}
          <div className="bg-gray-900 border-t border-gray-800/50 px-4 py-3 flex items-center justify-center gap-3">
            <button
              onClick={toggleMic}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                micOn
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {micOn ? 'Mic On' : 'Mic Off'}
            </button>
            <button
              onClick={toggleCam}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                camOn
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              {camOn ? 'Cam On' : 'Cam Off'}
            </button>
            <button
              onClick={leaveRoom}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-all"
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div className="w-80 border-l border-gray-800/50 bg-gray-900/50 flex flex-col">
            <div className="p-4 border-b border-gray-800/50">
              <h3 className="text-white font-semibold">Chat</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <p className="text-gray-600 text-sm text-center mt-8">No messages yet. Say hi!</p>
              )}
              {chatMessages.map((msg) => (
                <div key={msg.id} className="group">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-emerald-400">{msg.user}</span>
                    <span className="text-[10px] text-gray-600">
                      {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mt-0.5">{msg.text}</p>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChat} className="p-3 border-t border-gray-800/50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 bg-gray-800/80 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="p-2 bg-emerald-600 rounded-lg text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
