import { useRef, useCallback, useState } from 'react';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface WebRTCSignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  target: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface WebRTCSignalChannel {
  send: (message: {
    type: 'broadcast';
    event: 'webrtc-signal';
    payload: WebRTCSignalMessage;
  }) => void;
}

export function useWebRTC(_roomId: string, userId: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const channelRef = useRef<WebRTCSignalChannel | null>(null);
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  const broadcastStream = useCallback((stream: MediaStream) => {
    connectionsRef.current.forEach((pc) => {
      const senders = pc.getSenders();
      stream.getTracks().forEach((track) => {
        if (!senders.find((s) => s.track?.kind === track.kind)) {
          pc.addTrack(track, stream);
        }
      });
    });
  }, []);

  const initLocalStream = useCallback(async (enableCam: boolean, enableMic: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: enableCam ? { width: 320, height: 240, facingMode: 'user' } : false,
        audio: enableMic,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCamOn(enableCam);
      setMicOn(enableMic);
      return stream;
    } catch (err) {
      console.error('Failed to get media devices:', err);
      return null;
    }
  }, []);

  const toggleMic = useCallback(async () => {
    const stream = localStreamRef.current;
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((track) => { track.enabled = !track.enabled; });
        setMicOn((prev) => !prev);
      } else {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        const audioTrack = newStream.getAudioTracks()[0];
        stream.addTrack(audioTrack);
        broadcastStream(stream);
        setMicOn(true);
      }
    } else {
      const newStream = await initLocalStream(false, true);
      if (newStream) {
        broadcastStream(newStream);
      }
    }
  }, [initLocalStream, broadcastStream]);

  const toggleCam = useCallback(async () => {
    const stream = localStreamRef.current;
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((track) => { track.enabled = !track.enabled; });
        setCamOn((prev) => !prev);
      } else {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          audio: false,
        });
        const videoTrack = newStream.getVideoTracks()[0];
        stream.addTrack(videoTrack);
        broadcastStream(stream);
        setCamOn(true);
      }
    } else {
      const newStream = await initLocalStream(true, false);
      if (newStream) {
        broadcastStream(newStream);
      }
    }
  }, [initLocalStream, broadcastStream]);

  const createOffer = useCallback(async (targetId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    connectionsRef.current.set(targetId, pc);

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    pc.ontrack = (event) => {
      setPeerStreams((prev) => {
        const next = new Map(prev);
        next.set(targetId, event.streams[0]);
        return next;
      });
    };

    pc.onicecandidate = (event) => {
      const { candidate } = event;
      if (!candidate || !channelRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: {
          type: 'ice-candidate',
          candidate: candidate.toJSON(),
          target: targetId,
          from: userId,
        },
      });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: {
          type: 'offer',
          offer,
          target: targetId,
          from: userId,
        },
      });
    }
  }, [userId]);

  const handleSignaling = useCallback(async (message: WebRTCSignalMessage) => {
    const { type, from, offer, answer, candidate } = message;
    if (from === userId) return;

    if (type === 'offer') {
      if (!offer) return;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      connectionsRef.current.set(from, pc);

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      pc.ontrack = (event) => {
        setPeerStreams((prev) => {
          const next = new Map(prev);
          next.set(from, event.streams[0]);
          return next;
        });
      };

      pc.onicecandidate = (event) => {
        const { candidate } = event;
        if (!candidate || !channelRef.current) return;
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'ice-candidate',
            candidate: candidate.toJSON(),
            target: from,
            from: userId,
          },
        });
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const localAnswer = await pc.createAnswer();
      await pc.setLocalDescription(localAnswer);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'answer',
            answer: localAnswer,
            target: from,
            from: userId,
          },
        });
      }
    }

    if (type === 'answer') {
      if (!answer) return;
      const pc = connectionsRef.current.get(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    }

    if (type === 'ice-candidate') {
      if (!candidate) return;
      const pc = connectionsRef.current.get(from);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  }, [userId]);

  const setChannel = useCallback((channel: WebRTCSignalChannel) => {
    channelRef.current = channel;
  }, []);

  const cleanup = useCallback(() => {
    connectionsRef.current.forEach((pc) => pc.close());
    connectionsRef.current.clear();
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
    setLocalStream(null);
    setPeerStreams(new Map());
  }, []);

  return {
    localStream,
    peerStreams,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    createOffer,
    handleSignaling,
    setChannel,
    cleanup,
  };
}
