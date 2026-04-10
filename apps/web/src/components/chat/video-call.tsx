'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Video,
  VideoOff,
  Users,
  Wifi,
} from 'lucide-react';
import type {
  CallClientToServerEvents,
  CallJoinConfig,
  CallRoomParticipant,
  CallServerToClientEvents,
  IceServerConfig,
  WebRTCMediaState,
} from '@comms/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

type CallSocket = Socket<CallServerToClientEvents, CallClientToServerEvents>;

interface VideoCallProps {
  config: CallJoinConfig;
  onLeave?: () => void;
}

interface ParticipantTile {
  userId: string;
  name: string;
  avatarUrl?: string;
  stream: MediaStream | null;
  isLocal: boolean;
  media: WebRTCMediaState;
  joinedAt: string;
  connectionState?: RTCPeerConnectionState;
}

function formatDeviceAccessError(cause: unknown, context: 'media' | 'screen-share'): string {
  if (cause instanceof Error) {
    if (cause.message.includes('HTTPS on LAN URLs')) {
      return cause.message;
    }

    if (cause.name === 'NotAllowedError' || cause.name === 'PermissionDeniedError') {
      return context === 'screen-share'
        ? 'Screen sharing was blocked by the browser. Click the screen-share permission prompt or use the site-permission icon in the address bar, then try again.'
        : 'Microphone or camera access was blocked by the browser. Click the site-permission icon in the address bar, allow camera and microphone access, then retry joining the call.';
    }

    if (cause.name === 'NotFoundError' || cause.name === 'DevicesNotFoundError') {
      return context === 'screen-share'
        ? 'No shareable screen or window was found. Try selecting a window or entire screen again.'
        : 'No usable microphone or camera was found on this device.';
    }

    if (cause.name === 'NotReadableError' || cause.name === 'TrackStartError') {
      return context === 'screen-share'
        ? 'The browser could not start screen sharing. Close any other app that is locking screen capture, then try again.'
        : 'The browser could not start your microphone or camera. Another app may be using it.';
    }

    return cause.message;
  }

  return context === 'screen-share'
    ? 'Screen sharing could not start. Please try again.'
    : 'Unable to access microphone or camera.';
}

function ParticipantCard({ participant, isAudioCall }: { participant: ParticipantTile; isAudioCall: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!participant.stream) return;

    if (videoRef.current) {
      videoRef.current.srcObject = participant.stream;
    }

    if (!participant.isLocal && audioRef.current) {
      audioRef.current.srcObject = participant.stream;
    }
  }, [participant.stream, participant.isLocal]);

  useEffect(() => {
    if (!participant.stream || !participant.media.audioEnabled) {
      setIsSpeaking(false);
      return;
    }

    const audioTracks = participant.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setIsSpeaking(false);
      return;
    }

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;

    const source = ctx.createMediaStreamSource(participant.stream);
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    const intervalId = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);

      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const normalized = (samples[i] - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / samples.length);
      setIsSpeaking(rms > 0.045);
    }, 180);

    return () => {
      window.clearInterval(intervalId);
      source.disconnect();
      analyser.disconnect();
      ctx.close().catch(() => {});
    };
  }, [participant.media.audioEnabled, participant.stream]);

  const showVideo = participant.media.videoEnabled && !isAudioCall;
  const initials = participant.name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/80 shadow-[0_24px_80px_rgba(15,23,42,0.45)]',
        participant.media.screenSharing && 'ring-2 ring-cyan-400/80',
        isSpeaking && 'ring-2 ring-emerald-400/90 shadow-[0_0_0_1px_rgba(74,222,128,0.35),0_24px_80px_rgba(34,197,94,0.18)]'
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_52%),linear-gradient(180deg,rgba(15,23,42,0.05),rgba(15,23,42,0.75))]" />

      {showVideo ? (
        <video
          ref={videoRef}
          className="relative h-full w-full object-cover"
          autoPlay
          playsInline
          muted={participant.isLocal}
        />
      ) : (
        <div className="relative flex h-full min-h-[240px] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.22),_transparent_45%),linear-gradient(160deg,rgba(15,23,42,0.98),rgba(30,41,59,0.82))]">
          {participant.avatarUrl ? (
            <img
              src={participant.avatarUrl}
              alt={participant.name}
              className="h-24 w-24 rounded-3xl object-cover shadow-2xl"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/10 text-3xl font-semibold text-white shadow-2xl">
              {initials}
            </div>
          )}
        </div>
      )}

      {!participant.isLocal && <audio ref={audioRef} autoPlay playsInline />}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-white">
            {participant.name}
            {participant.isLocal ? ' (You)' : ''}
          </p>
          <p className="text-xs text-slate-300">
            {participant.media.screenSharing
              ? 'Presenting screen'
              : !participant.media.audioEnabled
              ? 'Muted'
              : isSpeaking
              ? 'Speaking'
              : participant.connectionState || 'Connected'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {participant.media.audioEnabled && isSpeaking && (
            <span className="rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-medium text-white">
              Speaking
            </span>
          )}
          {!participant.media.audioEnabled && (
            <span className="rounded-full bg-rose-500/90 p-2 text-white">
              <MicOff className="h-3.5 w-3.5" />
            </span>
          )}
          {participant.media.screenSharing && (
            <span className="rounded-full bg-cyan-500/90 p-2 text-white">
              <Monitor className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function toRtcIceServers(iceServers: IceServerConfig[]): RTCIceServer[] {
  return iceServers.map((server) => ({
    urls: server.urls,
    username: server.username,
    credential: server.credential,
  }));
}

function resolveCallSignalingUrl(signalingUrl: string): string {
  if (typeof window === 'undefined') {
    return signalingUrl;
  }

  const hostname = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  try {
    const url = new URL(signalingUrl);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname) && !['localhost', '127.0.0.1'].includes(hostname)) {
      url.hostname = hostname;
    }
    url.protocol = protocol;
    return url.toString();
  } catch {
    return `${protocol}//${hostname}:3003`;
  }
}

function resolveCallSignalingPath(): string {
  return process.env.NEXT_PUBLIC_CALL_SIGNALING_PATH || '/socket.io';
}

export function VideoCall({ config, onLeave }: VideoCallProps) {
  const { accessToken } = useAuthStore();
  const socketRef = useRef<CallSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const microphoneTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const disconnectTimeoutsRef = useRef<Map<string, number>>(new Map());
  const negotiatingPeersRef = useRef<Set<string>>(new Set());
  const ringbackContextRef = useRef<AudioContext | null>(null);
  const ringbackIntervalRef = useRef<number | null>(null);
  const participantsRef = useRef<Record<string, ParticipantTile>>({});
  const [participants, setParticipants] = useState<Record<string, ParticipantTile>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(config.callType === 'AUDIO');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [joinRetryNonce, setJoinRetryNonce] = useState(0);

  const rtcIceServers = useMemo(() => toRtcIceServers(config.iceServers), [config.iceServers]);
  const isAudioCall = config.callType === 'AUDIO';

  const updateParticipant = useCallback((userId: string, updater: (prev?: ParticipantTile) => ParticipantTile) => {
    setParticipants((prev) => {
      const next = {
        ...prev,
        [userId]: updater(prev[userId]),
      };
      participantsRef.current = next;
      return next;
    });
  }, []);

  const removeParticipant = useCallback((userId: string) => {
    setParticipants((prev) => {
      const next = { ...prev };
      delete next[userId];
      participantsRef.current = next;
      return next;
    });
  }, []);

  const localMediaState = useCallback((): WebRTCMediaState => ({
    audioEnabled: !isMuted,
    videoEnabled: !isCameraOff && !isAudioCall,
    screenSharing: isScreenSharing,
  }), [isMuted, isCameraOff, isAudioCall, isScreenSharing]);

  const emitMediaState = useCallback((media: WebRTCMediaState) => {
    socketRef.current?.emit('call:media-state', {
      callSessionId: config.callSessionId,
      media,
    });
  }, [config.callSessionId]);

  const syncLocalParticipant = useCallback((media = localMediaState()) => {
    const localStream = localStreamRef.current;
    updateParticipant(config.participant.id, (prev) => ({
      userId: config.participant.id,
      name: config.participant.name,
      avatarUrl: config.participant.avatarUrl,
      isLocal: true,
      joinedAt: prev?.joinedAt || new Date().toISOString(),
      stream: localStream,
      media,
      connectionState: 'connected',
    }));
  }, [config.participant, localMediaState, updateParticipant]);

  const closePeerConnection = useCallback((userId: string) => {
    const disconnectTimer = disconnectTimeoutsRef.current.get(userId);
    if (disconnectTimer) {
      window.clearTimeout(disconnectTimer);
      disconnectTimeoutsRef.current.delete(userId);
    }
    negotiatingPeersRef.current.delete(userId);

    const peer = peerConnectionsRef.current.get(userId);
    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onnegotiationneeded = null;
      peer.onconnectionstatechange = null;
      peer.close();
      peerConnectionsRef.current.delete(userId);
    }

    remoteStreamsRef.current.delete(userId);
    removeParticipant(userId);
  }, [removeParticipant]);

  const replaceOutgoingVideoTrack = useCallback(async (track: MediaStreamTrack | null) => {
    const peers = [...peerConnectionsRef.current.values()];
    await Promise.all(
      peers.map(async (peer) => {
        const sender = peer.getSenders().find((candidate) => candidate.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(track);
        } else if (track && localStreamRef.current) {
          peer.addTrack(track, localStreamRef.current);
        }
      })
    );

    const stream = localStreamRef.current;
    if (!stream) return;

    stream.getVideoTracks().forEach((existingTrack) => {
      if (existingTrack !== track) {
        stream.removeTrack(existingTrack);
      }
    });

    if (track && !stream.getVideoTracks().includes(track)) {
      stream.addTrack(track);
    }

  }, []);

  const offerPeer = useCallback(async (remoteUserId: string, peer: RTCPeerConnection) => {
    if (negotiatingPeersRef.current.has(remoteUserId) || peer.signalingState !== 'stable') {
      return;
    }

    negotiatingPeersRef.current.add(remoteUserId);
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socketRef.current?.emit('call:signal', {
        callSessionId: config.callSessionId,
        toUserId: remoteUserId,
        payload: {
          type: 'offer',
          sdp: offer,
        },
      });
    } finally {
      negotiatingPeersRef.current.delete(remoteUserId);
    }
  }, [config.callSessionId]);

  const addOutgoingScreenAudioTrack = useCallback(async (track: MediaStreamTrack) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    if (!stream.getAudioTracks().some((candidate) => candidate.id === track.id)) {
      stream.addTrack(track);
    }

    await Promise.all(
      [...peerConnectionsRef.current.values()].map(async (peer) => {
        const alreadySending = peer.getSenders().some((sender) => sender.track?.id === track.id);
        if (!alreadySending) {
          peer.addTrack(track, stream);
        }
      })
    );
  }, []);

  const removeOutgoingScreenAudioTrack = useCallback(async () => {
    const track = screenAudioTrackRef.current;
    const stream = localStreamRef.current;
    if (!track || !stream) return;

    await Promise.all(
      [...peerConnectionsRef.current.values()].map(async (peer) => {
        const sender = peer.getSenders().find((candidate) => candidate.track?.id === track.id);
        if (sender) {
          peer.removeTrack(sender);
        }
      })
    );

    stream.getAudioTracks().forEach((existingTrack) => {
      if (existingTrack.id === track.id) {
        stream.removeTrack(existingTrack);
      }
    });
  }, []);

  const restoreCameraTrack = useCallback(async () => {
    if (!cameraTrackRef.current || cameraTrackRef.current.readyState === 'ended') {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      cameraTrackRef.current = cameraStream.getVideoTracks()[0] || null;
    }

    await replaceOutgoingVideoTrack(cameraTrackRef.current);
  }, [replaceOutgoingVideoTrack]);

  const stopScreenShare = useCallback(async () => {
    if (screenAudioTrackRef.current) {
      screenAudioTrackRef.current.onended = null;
      await removeOutgoingScreenAudioTrack();
      screenAudioTrackRef.current.stop();
      screenAudioTrackRef.current = null;
    }

    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    setIsScreenSharing(false);

    if (!isAudioCall && !isCameraOff) {
      await restoreCameraTrack();
    } else {
      await replaceOutgoingVideoTrack(null);
    }

    const media = {
      audioEnabled: !isMuted,
      videoEnabled: !isCameraOff && !isAudioCall,
      screenSharing: false,
    };
    syncLocalParticipant(media);
    emitMediaState(media);
  }, [emitMediaState, isAudioCall, isCameraOff, isMuted, removeOutgoingScreenAudioTrack, replaceOutgoingVideoTrack, restoreCameraTrack, syncLocalParticipant]);

  const ensurePeerConnection = useCallback((remote: Pick<CallRoomParticipant, 'userId' | 'name' | 'avatarUrl'>) => {
    const existing = peerConnectionsRef.current.get(remote.userId);
    if (existing) return existing;

    const peer = new RTCPeerConnection({ iceServers: rtcIceServers });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current!);
      });
    }

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      socketRef.current?.emit('call:signal', {
        callSessionId: config.callSessionId,
        toUserId: remote.userId,
        payload: {
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        },
      });
    };

    peer.onnegotiationneeded = () => {
      void offerPeer(remote.userId, peer);
    };

    peer.ontrack = (event) => {
      const existingStream = remoteStreamsRef.current.get(remote.userId) || new MediaStream();
      event.streams[0]?.getTracks().forEach((track) => {
        if (!existingStream.getTracks().some((candidate) => candidate.id === track.id)) {
          existingStream.addTrack(track);
        }
      });
      if (event.track && !event.streams[0] && !existingStream.getTracks().some((candidate) => candidate.id === event.track.id)) {
        existingStream.addTrack(event.track);
      }
      remoteStreamsRef.current.set(remote.userId, existingStream);

      updateParticipant(remote.userId, (prev) => ({
        userId: remote.userId,
        name: remote.name,
        avatarUrl: remote.avatarUrl,
        stream: existingStream,
        isLocal: false,
        joinedAt: prev?.joinedAt || new Date().toISOString(),
        media: prev?.media || {
          audioEnabled: true,
          videoEnabled: !isAudioCall,
          screenSharing: false,
        },
        connectionState: peer.connectionState,
      }));
    };

    peer.onconnectionstatechange = () => {
      updateParticipant(remote.userId, (prev) => ({
        userId: remote.userId,
        name: remote.name,
        avatarUrl: remote.avatarUrl,
        stream: prev?.stream || remoteStreamsRef.current.get(remote.userId) || null,
        isLocal: false,
        joinedAt: prev?.joinedAt || new Date().toISOString(),
        media: prev?.media || {
          audioEnabled: true,
          videoEnabled: !isAudioCall,
          screenSharing: false,
        },
        connectionState: peer.connectionState,
      }));

      if (peer.connectionState === 'connected') {
        const disconnectTimer = disconnectTimeoutsRef.current.get(remote.userId);
        if (disconnectTimer) {
          window.clearTimeout(disconnectTimer);
          disconnectTimeoutsRef.current.delete(remote.userId);
        }
      }

      if (['failed', 'closed'].includes(peer.connectionState)) {
        closePeerConnection(remote.userId);
        return;
      }

      if (peer.connectionState === 'disconnected' && !disconnectTimeoutsRef.current.has(remote.userId)) {
        const timeoutId = window.setTimeout(() => {
          if (peer.connectionState === 'disconnected') {
            closePeerConnection(remote.userId);
          }
          disconnectTimeoutsRef.current.delete(remote.userId);
        }, 7000);
        disconnectTimeoutsRef.current.set(remote.userId, timeoutId);
      }
    };

    peerConnectionsRef.current.set(remote.userId, peer);
    return peer;
  }, [closePeerConnection, config.callSessionId, isAudioCall, rtcIceServers, updateParticipant]);

  const createOfferFor = useCallback(async (remote: CallRoomParticipant) => {
    const peer = ensurePeerConnection(remote);
    await offerPeer(remote.userId, peer);
  }, [ensurePeerConnection, offerPeer]);

  useEffect(() => {
    if (!accessToken) {
      setError('You must be signed in to join a call.');
      return;
    }

    let isMounted = true;

    const bootstrap = async () => {
      try {
        setError(null);
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          throw new Error('Microphone and camera access require HTTPS on LAN URLs. Open the app over HTTPS, or use a browser flag to treat this origin as secure.');
        }

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isAudioCall ? false : { width: 1280, height: 720 },
        });

        if (!isMounted) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = localStream;
        microphoneTrackRef.current = localStream.getAudioTracks()[0] || null;
        cameraTrackRef.current = localStream.getVideoTracks()[0] || null;
        syncLocalParticipant({
          audioEnabled: true,
          videoEnabled: !isAudioCall,
          screenSharing: false,
        });

        const socket = io(resolveCallSignalingUrl(config.signalingUrl), {
          auth: { token: accessToken },
          path: resolveCallSignalingPath(),
          transports: ['websocket'],
          reconnectionAttempts: 8,
        }) as CallSocket;

        socketRef.current = socket;

        socket.on('connect', () => {
          socket.emit('call:join-room', { callSessionId: config.callSessionId });
          emitMediaState({
            audioEnabled: true,
            videoEnabled: !isAudioCall,
            screenSharing: false,
          });
          setIsReady(true);
        });

        socket.on('disconnect', () => {
          setIsReady(false);
        });

        socket.on('call:room-state', async ({ participants: roomParticipants }) => {
          await Promise.all(
            roomParticipants.map(async (participant) => {
              updateParticipant(participant.userId, (prev) => ({
                userId: participant.userId,
                name: participant.name,
                avatarUrl: participant.avatarUrl,
                stream: prev?.stream || null,
                isLocal: false,
                joinedAt: participant.joinedAt,
                media: participant.media,
                connectionState: prev?.connectionState || 'new',
              }));
              await createOfferFor(participant);
            })
          );
        });

        socket.on('call:user-joined', ({ participant }) => {
          updateParticipant(participant.userId, (prev) => ({
            userId: participant.userId,
            name: participant.name,
            avatarUrl: participant.avatarUrl,
            stream: prev?.stream || null,
            isLocal: false,
            joinedAt: participant.joinedAt,
            media: participant.media,
            connectionState: prev?.connectionState || 'connecting',
          }));
        });

        socket.on('call:user-left', ({ userId }) => {
          closePeerConnection(userId);
        });

        socket.on('call:ended', () => {
          setError('The call ended.');
          onLeave?.();
        });

        socket.on('call:media-state', ({ userId, media }) => {
          updateParticipant(userId, (prev) => ({
            userId,
            name: prev?.name || 'Participant',
            avatarUrl: prev?.avatarUrl,
            stream: prev?.stream || null,
            isLocal: false,
            joinedAt: prev?.joinedAt || new Date().toISOString(),
            media,
            connectionState: prev?.connectionState,
          }));
        });

        socket.on('call:signal', async ({ fromUserId, payload }) => {
          const currentParticipant = participantsRef.current[fromUserId];
          const peer = ensurePeerConnection({
            userId: fromUserId,
            name: currentParticipant?.name || 'Participant',
            avatarUrl: currentParticipant?.avatarUrl,
          });

          if (payload.type === 'offer' && payload.sdp) {
            await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socket.emit('call:signal', {
              callSessionId: config.callSessionId,
              toUserId: fromUserId,
              payload: {
                type: 'answer',
                sdp: answer,
              },
            });
          }

          if (payload.type === 'answer' && payload.sdp) {
            await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          }

          if (payload.type === 'ice-candidate' && payload.candidate) {
            await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        });

        socket.on('call:error', ({ message }) => {
          setError(message);
        });
      } catch (cause) {
        const reason = formatDeviceAccessError(cause, 'media');
        setError(reason);
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
      socketRef.current?.emit('call:leave-room', { callSessionId: config.callSessionId });
      socketRef.current?.disconnect();
      peerConnectionsRef.current.forEach((peer) => peer.close());
      peerConnectionsRef.current.clear();
      disconnectTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      disconnectTimeoutsRef.current.clear();
      negotiatingPeersRef.current.clear();
      remoteStreamsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      microphoneTrackRef.current = null;
      cameraTrackRef.current = null;
      screenTrackRef.current = null;
      screenAudioTrackRef.current = null;
    };
    // This effect must only track call identity and auth state.
    // If it reruns on media-toggle callbacks, React tears down the room and
    // emits call:leave-room when users start screen sharing or toggle devices.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accessToken,
    config.callSessionId,
    config.signalingUrl,
    config.participant.id,
    config.participant.name,
    config.participant.avatarUrl,
    isAudioCall,
    joinRetryNonce,
  ]);

  const toggleMute = useCallback(() => {
    const track = microphoneTrackRef.current;
    if (!track) return;
    const nextMuted = !isMuted;
    track.enabled = !nextMuted;
    setIsMuted(nextMuted);
    const media = {
      audioEnabled: !nextMuted,
      videoEnabled: !isCameraOff && !isAudioCall,
      screenSharing: isScreenSharing,
    };
    syncLocalParticipant(media);
    emitMediaState(media);
  }, [emitMediaState, isAudioCall, isCameraOff, isMuted, isScreenSharing, syncLocalParticipant]);

  const toggleCamera = useCallback(async () => {
    if (isAudioCall) return;

    const nextOff = !isCameraOff;
    setIsCameraOff(nextOff);

    if (nextOff) {
      await replaceOutgoingVideoTrack(null);
    } else if (!isScreenSharing) {
      await restoreCameraTrack();
    }

    const media = {
      audioEnabled: !isMuted,
      videoEnabled: !nextOff,
      screenSharing: isScreenSharing,
    };
    syncLocalParticipant(media);
    emitMediaState(media);
  }, [emitMediaState, isAudioCall, isCameraOff, isMuted, isScreenSharing, replaceOutgoingVideoTrack, restoreCameraTrack, syncLocalParticipant]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    try {
      setNotice(null);
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error('Screen sharing requires HTTPS on LAN URLs. Open the app over HTTPS, or use a browser flag to treat this origin as secure.');
      }

      let stream: MediaStream;
      let audioCaptureUnavailable = false;

      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      } catch (cause) {
        if (cause instanceof Error && ['NotReadableError', 'NotAllowedError', 'OverconstrainedError', 'TypeError'].includes(cause.name)) {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
          });
          audioCaptureUnavailable = true;
        } else {
          throw cause;
        }
      }

      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const audioTrack = stream.getAudioTracks()[0] || null;

      screenTrackRef.current = track;
      track.onended = () => {
        void stopScreenShare();
      };

      if (audioTrack) {
        screenAudioTrackRef.current = audioTrack;
        audioTrack.onended = () => {
          void stopScreenShare();
        };
        await addOutgoingScreenAudioTrack(audioTrack);
      } else if (audioCaptureUnavailable) {
        setNotice('Screen sharing started, but this browser or selected window did not allow shared audio. Try sharing a Chrome tab and enable Share tab audio if you want others to hear it.');
      } else {
        setNotice('Screen sharing started without shared tab/system audio. In Chrome, choose a browser tab and enable Share tab audio if you want everyone on the call to hear it.');
      }

      await replaceOutgoingVideoTrack(track);
      setIsScreenSharing(true);
      setIsCameraOff(false);
      const media = {
        audioEnabled: !isMuted,
        videoEnabled: true,
        screenSharing: true,
      };
      syncLocalParticipant(media);
      emitMediaState(media);
    } catch (cause) {
      setNotice(formatDeviceAccessError(cause, 'screen-share'));
    }
  }, [addOutgoingScreenAudioTrack, emitMediaState, isMuted, isScreenSharing, replaceOutgoingVideoTrack, stopScreenShare, syncLocalParticipant]);

  const leaveCall = useCallback(async () => {
    try {
      socketRef.current?.emit('call:leave-room', { callSessionId: config.callSessionId });

      await fetch(`/api/calls/${config.callSessionId}/end`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
    } catch {
      // best effort
    }

    window.setTimeout(() => {
      onLeave?.();
    }, 150);
  }, [accessToken, config.callSessionId, onLeave]);

  const participantTiles = Object.values(participants).sort((left, right) => {
    if (left.isLocal) return -1;
    if (right.isLocal) return 1;
    return left.joinedAt.localeCompare(right.joinedAt);
  });

  const gridClass =
    participantTiles.length <= 1
      ? 'grid-cols-1'
      : participantTiles.length === 2
      ? 'grid-cols-2'
      : participantTiles.length <= 4
      ? 'grid-cols-2'
      : 'grid-cols-3';

  useEffect(() => {
    const shouldRingback = participantTiles.length <= 1 && isReady;

    if (!shouldRingback) {
      if (ringbackIntervalRef.current) {
        window.clearInterval(ringbackIntervalRef.current);
        ringbackIntervalRef.current = null;
      }
      ringbackContextRef.current?.close().catch(() => {});
      ringbackContextRef.current = null;
      return;
    }

    if (ringbackIntervalRef.current) return;

    const playRingback = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!ringbackContextRef.current) {
          ringbackContextRef.current = new AudioCtx();
        }

        const ctx = ringbackContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 480;
        gain.gain.value = 0.018;
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.35);
      } catch {
        // best effort only
      }
    };

    void playRingback();
    ringbackIntervalRef.current = window.setInterval(() => {
      void playRingback();
    }, 2200);

    return () => {
      if (ringbackIntervalRef.current) {
        window.clearInterval(ringbackIntervalRef.current);
        ringbackIntervalRef.current = null;
      }
      ringbackContextRef.current?.close().catch(() => {});
      ringbackContextRef.current = null;
    };
  }, [isReady, participantTiles.length]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-white">
        <div className="space-y-4 text-center">
          <p className="text-lg font-semibold">Call connection failed</p>
          <p className="max-w-lg text-sm leading-6 text-slate-300">{error}</p>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-left text-sm text-slate-300">
            <p className="font-medium text-white">How to allow access</p>
            <p className="mt-2">1. Click the camera or site-settings icon near the browser address bar.</p>
            <p>2. Set camera and microphone access to Allow.</p>
            <p>3. If you are on a LAN URL over plain HTTP, open the app on HTTPS instead.</p>
            <p>4. Click Retry below.</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setJoinRetryNonce((value) => value + 1)}
              className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Retry access
            </button>
            <button
              onClick={onLeave}
              className="rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_30%),linear-gradient(180deg,#020617_0%,#0f172a_65%,#111827_100%)] text-white">
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Live Workspace Call</p>
          <h2 className="mt-2 text-2xl font-semibold">{config.title || config.roomId}</h2>
          <p className="mt-1 text-sm text-slate-300">
            {participantTiles.length} participant{participantTiles.length === 1 ? '' : 's'} connected
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 backdrop-blur">
          <Wifi className={cn('h-4 w-4', isReady ? 'text-emerald-300' : 'text-amber-300')} />
          {isReady ? 'Signaling connected' : 'Connecting'}
        </div>
      </div>

      {notice && (
        <div className="mx-6 mb-2 flex items-start justify-between gap-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          <p>{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid flex-1 gap-4 px-6 pb-6" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
        <div className={cn('grid min-h-0 gap-4', gridClass)}>
          {participantTiles.map((participant) => (
            <ParticipantCard
              key={participant.userId}
              participant={participant}
              isAudioCall={isAudioCall}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 bg-slate-950/75 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Users className="h-4 w-4" />
            Mesh WebRTC
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMute}
              className={cn(
                'rounded-full border px-4 py-3 transition',
                isMuted ? 'border-rose-400/50 bg-rose-500/20 text-rose-100' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
              )}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button
              onClick={toggleCamera}
              disabled={isAudioCall}
              className={cn(
                'rounded-full border px-4 py-3 transition',
                isCameraOff ? 'border-amber-400/50 bg-amber-500/20 text-amber-100' : 'border-white/10 bg-white/5 text-white hover:bg-white/10',
                isAudioCall && 'cursor-not-allowed opacity-50'
              )}
              title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </button>
            <button
              onClick={toggleScreenShare}
              className={cn(
                'rounded-full border px-4 py-3 transition',
                isScreenSharing ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
              )}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </button>
            <button
              onClick={leaveCall}
              className="rounded-full border border-rose-400/50 bg-rose-500 px-5 py-3 text-white transition hover:bg-rose-400"
              title="Leave call"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
