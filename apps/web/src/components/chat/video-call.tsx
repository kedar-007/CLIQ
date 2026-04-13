'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Check,
  Hand,
  Heart,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Plus,
  PartyPopper,
  ThumbsUp,
  Video,
  VideoOff,
  Users,
  Wifi,
} from 'lucide-react';
import type {
  CallClientToServerEvents,
  CallJoinConfig,
  CallReactionType,
  CallRoomParticipant,
  CallServerToClientEvents,
  IceServerConfig,
  WebRTCMediaState,
} from '@comms/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';

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
  handRaised?: boolean;
  activeReaction?: string | null;
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

function ParticipantCard({
  participant,
  isAudioCall,
  featured = false,
}: {
  participant: ParticipantTile;
  isAudioCall: boolean;
  featured?: boolean;
}) {
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
        'relative overflow-hidden rounded-[30px] border border-white/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.72))] shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl',
        featured ? 'min-h-[420px]' : 'min-h-[188px]',
        participant.media.screenSharing && 'ring-2 ring-cyan-400/80',
        isSpeaking && 'ring-2 ring-emerald-400/90 shadow-[0_0_0_1px_rgba(74,222,128,0.35),0_24px_80px_rgba(34,197,94,0.18)]'
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.12),_transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.1),rgba(226,232,240,0.5))]" />

      {showVideo ? (
        <video
          ref={videoRef}
          className="relative h-full w-full object-cover"
          autoPlay
          playsInline
          muted={participant.isLocal}
        />
      ) : (
        <div className="relative flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_35%),linear-gradient(160deg,rgba(248,250,252,0.96),rgba(226,232,240,0.84))] dark:bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_35%),linear-gradient(160deg,rgba(15,23,42,0.98),rgba(30,41,59,0.82))]">
          {participant.avatarUrl ? (
            <img
              src={participant.avatarUrl}
              alt={participant.name}
              className={cn('rounded-[28px] object-cover shadow-2xl', featured ? 'h-28 w-28' : 'h-20 w-20')}
            />
          ) : (
            <div className={cn('flex items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#1A56DB,#7C3AED)] font-semibold text-white shadow-2xl', featured ? 'h-28 w-28 text-4xl' : 'h-20 w-20 text-2xl')}>
              {initials}
            </div>
          )}
        </div>
      )}

      {!participant.isLocal && <audio ref={audioRef} autoPlay playsInline />}

      {participant.activeReaction ? (
        <div className="absolute left-1/2 top-5 z-10 -translate-x-1/2 rounded-full bg-slate-950/70 px-4 py-2 text-3xl shadow-[0_18px_40px_rgba(15,23,42,0.35)] backdrop-blur">
          {participant.activeReaction}
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-slate-950/80 via-slate-950/45 to-transparent px-4 py-4">
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
          {participant.handRaised && (
            <span className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-medium text-white">
              Hand raised
            </span>
          )}
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
  const { members } = useWorkspaceStore();
  const socketRef = useRef<CallSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const microphoneTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const disconnectTimeoutsRef = useRef<Map<string, number>>(new Map());
  const negotiationRetryTimeoutsRef = useRef<Map<string, number>>(new Map());
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
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [invitingUserIds, setInvitingUserIds] = useState<string[]>([]);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

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
        handRaised: prev?.handRaised || false,
        activeReaction: prev?.activeReaction || null,
      }));
  }, [config.participant, localMediaState, updateParticipant]);

  const closePeerConnection = useCallback((userId: string) => {
    const disconnectTimer = disconnectTimeoutsRef.current.get(userId);
    if (disconnectTimer) {
      window.clearTimeout(disconnectTimer);
      disconnectTimeoutsRef.current.delete(userId);
    }
    const negotiationTimer = negotiationRetryTimeoutsRef.current.get(userId);
    if (negotiationTimer) {
      window.clearTimeout(negotiationTimer);
      negotiationRetryTimeoutsRef.current.delete(userId);
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

  const requestPeerOffer = useCallback((remoteUserId: string, peer: RTCPeerConnection, retryCount = 0) => {
    const existingRetry = negotiationRetryTimeoutsRef.current.get(remoteUserId);
    if (existingRetry) {
      window.clearTimeout(existingRetry);
      negotiationRetryTimeoutsRef.current.delete(remoteUserId);
    }

    if (negotiatingPeersRef.current.has(remoteUserId) || peer.signalingState !== 'stable') {
      if (retryCount >= 10) return;
      const timeoutId = window.setTimeout(() => {
        negotiationRetryTimeoutsRef.current.delete(remoteUserId);
        requestPeerOffer(remoteUserId, peer, retryCount + 1);
      }, 250);
      negotiationRetryTimeoutsRef.current.set(remoteUserId, timeoutId);
      return;
    }

    void offerPeer(remoteUserId, peer);
  }, [offerPeer]);

  const renegotiateAllPeers = useCallback(() => {
    peerConnectionsRef.current.forEach((peer, userId) => {
      requestPeerOffer(userId, peer);
    });
  }, [requestPeerOffer]);

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
    renegotiateAllPeers();
  }, [renegotiateAllPeers]);

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
    renegotiateAllPeers();
  }, [renegotiateAllPeers]);

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
      requestPeerOffer(remote.userId, peer);
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
        handRaised: prev?.handRaised || false,
        activeReaction: prev?.activeReaction || null,
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
        handRaised: prev?.handRaised || false,
        activeReaction: prev?.activeReaction || null,
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
        }, 15000);
        disconnectTimeoutsRef.current.set(remote.userId, timeoutId);
      }
    };

    peerConnectionsRef.current.set(remote.userId, peer);
    return peer;
  }, [closePeerConnection, config.callSessionId, isAudioCall, requestPeerOffer, rtcIceServers, updateParticipant]);

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
            handRaised: prev?.handRaised || false,
            activeReaction: prev?.activeReaction || null,
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
            handRaised: prev?.handRaised || false,
            activeReaction: prev?.activeReaction || null,
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
            handRaised: prev?.handRaised || false,
            activeReaction: prev?.activeReaction || null,
          }));
        });

        socket.on('call:reaction', ({ userId, reaction, raisedHand }) => {
          updateParticipant(userId, (prev) => ({
            userId,
            name: prev?.name || 'Participant',
            avatarUrl: prev?.avatarUrl,
            stream: prev?.stream || null,
            isLocal: userId === config.participant.id,
            joinedAt: prev?.joinedAt || new Date().toISOString(),
            media: prev?.media || {
              audioEnabled: true,
              videoEnabled: !isAudioCall,
              screenSharing: false,
            },
            connectionState: prev?.connectionState,
            handRaised: reaction === '✋' ? !!raisedHand : prev?.handRaised || false,
            activeReaction: reaction === '✋' ? prev?.activeReaction || null : reaction,
          }));

          if (reaction !== '✋') {
            window.setTimeout(() => {
              updateParticipant(userId, (prev) => ({
                userId,
                name: prev?.name || 'Participant',
                avatarUrl: prev?.avatarUrl,
                stream: prev?.stream || null,
                isLocal: userId === config.participant.id,
                joinedAt: prev?.joinedAt || new Date().toISOString(),
                media: prev?.media || {
                  audioEnabled: true,
                  videoEnabled: !isAudioCall,
                  screenSharing: false,
                },
                connectionState: prev?.connectionState,
                handRaised: prev?.handRaised || false,
                activeReaction: null,
              }));
            }, 2200);
          }
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
      negotiationRetryTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      negotiationRetryTimeoutsRef.current.clear();
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
          const currentTrack = screenAudioTrackRef.current;
          if (!currentTrack || currentTrack.id !== audioTrack.id) return;
          void removeOutgoingScreenAudioTrack().finally(() => {
            if (screenAudioTrackRef.current?.id === audioTrack.id) {
              screenAudioTrackRef.current = null;
            }
            setNotice('Shared audio stopped, but screen sharing is still active. Re-share a Chrome tab with Share tab audio enabled if you want others to hear it again.');
          });
        };
        await addOutgoingScreenAudioTrack(audioTrack);
      } else if (audioCaptureUnavailable) {
        setNotice('Screen sharing started, but this browser or selected window did not allow shared audio. Try sharing a Chrome tab and enable Share tab audio if you want others to hear it.');
      } else {
        setNotice('Screen sharing started without shared tab/system audio. In Chrome, choose a browser tab and enable Share tab audio if you want everyone on the call to hear it.');
      }

      await replaceOutgoingVideoTrack(track);
      renegotiateAllPeers();
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
  }, [addOutgoingScreenAudioTrack, emitMediaState, isMuted, isScreenSharing, removeOutgoingScreenAudioTrack, renegotiateAllPeers, replaceOutgoingVideoTrack, stopScreenShare, syncLocalParticipant]);

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

  const displayTitle = useMemo(() => {
    const nonLocal = participantTiles
      .filter((participant) => !participant.isLocal)
      .map((participant) => participant.name)
      .filter(Boolean);

    if (nonLocal.length === 0) {
      return config.title || 'Workspace call';
    }

    if (nonLocal.length <= 3) {
      return nonLocal.join(', ');
    }

    return `${nonLocal.slice(0, 3).join(', ')} +${nonLocal.length - 3}`;
  }, [config.title, participantTiles]);

  const participantIds = useMemo(
    () => new Set(participantTiles.map((participant) => participant.userId)),
    [participantTiles]
  );

  const availableInvitees = useMemo(() => {
    const query = inviteQuery.trim().toLowerCase();
    return members.filter((member) => {
      if (participantIds.has(member.id)) return false;
      const haystack = `${member.name} ${member.email}`.toLowerCase();
      return query ? haystack.includes(query) : true;
    });
  }, [inviteQuery, members, participantIds]);

  const featuredParticipant = useMemo(() => {
    if (participantTiles.length === 0) return null;
    const screenSharer = participantTiles.find((participant) => participant.media.screenSharing);
    if (screenSharer) return screenSharer;
    const speaker = participantTiles.find(
      (participant) => participant.media.audioEnabled && participant.connectionState === 'connected'
    );
    return speaker || participantTiles.find((participant) => !participant.isLocal) || participantTiles[0];
  }, [participantTiles]);

  const secondaryParticipants = participantTiles.filter((participant) => participant.userId !== featuredParticipant?.userId);

  const inviteToCall = useCallback(async (userId: string) => {
    if (invitingUserIds.includes(userId)) return;
    setInvitingUserIds((current) => [...current, userId]);
    setInviteFeedback(null);

    try {
      const response = await fetch(`/api/calls/${config.callSessionId}/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ userIds: [userId] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to invite teammate');
      }
      setInviteFeedback('Invite sent. They can join from their incoming call alert.');
    } catch (cause) {
      setInviteFeedback(cause instanceof Error ? cause.message : 'Failed to invite teammate');
    } finally {
      setInvitingUserIds((current) => current.filter((id) => id !== userId));
    }
  }, [accessToken, config.callSessionId, invitingUserIds]);

  const sendReaction = useCallback((reaction: CallReactionType) => {
    const raisedHand = reaction === '✋'
      ? !participantsRef.current[config.participant.id]?.handRaised
      : undefined;

    updateParticipant(config.participant.id, (prev) => ({
      userId: config.participant.id,
      name: config.participant.name,
      avatarUrl: config.participant.avatarUrl,
      stream: prev?.stream || localStreamRef.current,
      isLocal: true,
      joinedAt: prev?.joinedAt || new Date().toISOString(),
      media: prev?.media || localMediaState(),
      connectionState: prev?.connectionState || 'connected',
      handRaised: reaction === '✋' ? !!raisedHand : prev?.handRaised || false,
      activeReaction: reaction === '✋' ? prev?.activeReaction || null : reaction,
    }));

    socketRef.current?.emit('call:reaction', {
      callSessionId: config.callSessionId,
      reaction,
      raisedHand,
    });

    if (reaction !== '✋') {
      window.setTimeout(() => {
        updateParticipant(config.participant.id, (prev) => ({
          userId: config.participant.id,
          name: config.participant.name,
          avatarUrl: config.participant.avatarUrl,
          stream: prev?.stream || localStreamRef.current,
          isLocal: true,
          joinedAt: prev?.joinedAt || new Date().toISOString(),
          media: prev?.media || localMediaState(),
          connectionState: prev?.connectionState || 'connected',
          handRaised: prev?.handRaised || false,
          activeReaction: null,
        }));
      }, 2200);
    }
  }, [config.callSessionId, config.participant, localMediaState, updateParticipant]);

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
    <div className="flex h-full flex-col bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.10),transparent_26%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_48%,#e2e8f0_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.16),transparent_24%),linear-gradient(180deg,#020617_0%,#0f172a_65%,#111827_100%)] dark:text-white">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#FF5F57] shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
            <span className="h-3 w-3 rounded-full bg-[#FEBC2E] shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
            <span className="h-3 w-3 rounded-full bg-[#28C840] shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
          </div>
          <p className="text-xs uppercase tracking-[0.32em] text-primary/70 dark:text-cyan-200/80">DSV Connect Conference</p>
          <h2 className="mt-2 text-2xl font-semibold">{displayTitle}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            {participantTiles.length} participant{participantTiles.length === 1 ? '' : 's'} connected
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInvitePanel((current) => !current)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-sm backdrop-blur transition-colors',
              showInvitePanel
                ? 'border-primary/25 bg-primary/10 text-primary'
                : 'border-white/60 bg-white/80 text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
            )}
          >
            <Plus className="h-4 w-4" />
            Add people
          </button>
          <div className="flex items-center gap-3 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
            <Wifi className={cn('h-4 w-4', isReady ? 'text-emerald-500 dark:text-emerald-300' : 'text-amber-500 dark:text-amber-300')} />
            {isReady ? 'Connected' : 'Connecting'}
          </div>
        </div>
      </div>

      {notice && (
        <div className="mx-6 mb-2 flex items-start justify-between gap-4 rounded-[24px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100">
          <p>{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 rounded-full border border-amber-300/40 px-2 py-1 text-xs transition hover:bg-amber-100 dark:border-white/10 dark:hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid flex-1 gap-4 px-6 pb-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
          <div className="overflow-hidden rounded-[34px] border border-white/60 bg-white/72 p-4 shadow-[0_26px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
            <div className="mb-4 flex items-center justify-between rounded-[22px] border border-border/70 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Meeting room</p>
                <p className="mt-1 text-sm font-medium text-foreground dark:text-white">Design review and live collaboration</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-primary">Recording ready</span>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-emerald-600 dark:text-emerald-300">HD</span>
              </div>
            </div>
            {featuredParticipant ? (
              <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <ParticipantCard participant={featuredParticipant} isAudioCall={isAudioCall} featured />
                <div className="dsv-scroll grid min-h-0 gap-3 overflow-y-auto">
                  {secondaryParticipants.length > 0 ? (
                    secondaryParticipants.map((participant) => (
                      <ParticipantCard
                        key={participant.userId}
                        participant={participant}
                        isAudioCall={isAudioCall}
                      />
                    ))
                  ) : (
                    <div className="flex min-h-[188px] items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-[linear-gradient(135deg,rgba(26,86,219,0.06),rgba(124,58,237,0.04))] text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
                      Waiting for teammates to join this conversation.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 rounded-[30px] border border-white/60 bg-white/80 px-5 py-4 shadow-[0_22px_44px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75">
            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-300">
              <Users className="h-4 w-4" />
              Team conference
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => sendReaction('✋')}
              className={cn(
                'rounded-full border px-3 py-2 text-sm transition',
                participantTiles.find((participant) => participant.userId === config.participant.id)?.handRaised
                  ? 'border-amber-400/50 bg-amber-500/20 text-amber-700 dark:text-amber-100'
                  : 'border-white/60 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
              )}
              title="Raise hand"
            >
              <Hand className="h-4 w-4" />
            </button>
            <button
              onClick={() => sendReaction('👍')}
              className="rounded-full border border-white/60 bg-white px-3 py-2 text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              title="Thumbs up"
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => sendReaction('❤️')}
              className="rounded-full border border-white/60 bg-white px-3 py-2 text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              title="Send love"
            >
              <Heart className="h-4 w-4" />
            </button>
            <button
              onClick={() => sendReaction('🎉')}
              className="rounded-full border border-white/60 bg-white px-3 py-2 text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              title="Celebrate"
            >
              <PartyPopper className="h-4 w-4" />
            </button>
            <button
              onClick={toggleMute}
              className={cn(
                'rounded-full border px-4 py-3 transition',
                isMuted ? 'border-rose-400/50 bg-rose-500/20 text-rose-700 dark:text-rose-100' : 'border-white/60 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
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
                isCameraOff ? 'border-amber-400/50 bg-amber-500/20 text-amber-700 dark:text-amber-100' : 'border-white/60 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10',
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
                isScreenSharing ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-700 dark:text-cyan-100' : 'border-white/60 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
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

        <aside className="dsv-scroll min-h-0 overflow-y-auto rounded-[32px] border border-white/60 bg-white/78 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-primary/70 dark:text-cyan-200/70">Session details</p>
              <h3 className="mt-2 text-lg font-semibold">Conference room</h3>
            </div>
            <button
              onClick={() => setShowInvitePanel((current) => !current)}
              className="rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/20 hover:text-primary dark:border-white/10 dark:text-slate-200"
            >
              {showInvitePanel ? 'People' : 'Invite'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[22px] border border-border/70 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live now</p>
              <p className="mt-2 text-2xl font-semibold">{participantTiles.length}</p>
            </div>
            <div className="rounded-[22px] border border-border/70 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mode</p>
              <p className="mt-2 text-2xl font-semibold">{isAudioCall ? 'Audio' : 'Video'}</p>
            </div>
          </div>

          {showInvitePanel ? (
            <>
              <div className="mt-4 rounded-2xl border border-border/70 bg-white/85 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/35">
                <input
                  value={inviteQuery}
                  onChange={(event) => setInviteQuery(event.target.value)}
                  placeholder="Search teammates by name or email"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-white"
                />
              </div>

              {inviteFeedback ? (
                <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-100">
                  {inviteFeedback}
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                {availableInvitees.length > 0 ? (
                  availableInvitees.map((member) => {
                    const inviting = invitingUserIds.includes(member.id);
                    const initials = member.name
                      .split(' ')
                      .map((part) => part.charAt(0))
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 rounded-[22px] border border-border/70 bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#1A56DB,#7C3AED)] text-sm font-semibold text-white">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{member.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        </div>
                        <button
                          onClick={() => inviteToCall(member.id)}
                          disabled={inviting}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition-colors',
                            inviting
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-primary/10 text-primary hover:bg-primary/15'
                          )}
                        >
                          {inviting ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          {inviting ? 'Inviting…' : 'Invite'}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[22px] border border-border/70 bg-white/80 px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
                    Everyone available is already in this call.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              {participantTiles.map((participant) => (
                <div
                  key={participant.userId}
                  className="flex items-center gap-3 rounded-[22px] border border-border/70 bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="relative">
                    {participant.avatarUrl ? (
                      <img src={participant.avatarUrl} alt={participant.name} className="h-11 w-11 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#1A56DB,#7C3AED)] text-sm font-semibold text-white">
                        {participant.name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}
                    <span className={cn('absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-950', participant.media.audioEnabled ? 'bg-emerald-500' : 'bg-rose-500')} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{participant.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {participant.media.screenSharing
                        ? 'Presenting'
                        : participant.handRaised
                        ? 'Hand raised'
                        : participant.media.audioEnabled
                        ? 'In conversation'
                        : 'Muted'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
