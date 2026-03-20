'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  LocalParticipant,
  RemoteParticipant,
  Track,
  TrackEvent,
  ParticipantEvent,
  VideoPresets,
  createLocalTracks,
  type LocalTrack,
  type RemoteTrack,
  type Participant,
} from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoCallProps {
  roomName: string;
  token: string;
  serverUrl: string;
  onLeave?: () => void;
}

interface ParticipantTile {
  participant: Participant;
  videoTrack: RemoteTrack | LocalTrack | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isLocal: boolean;
  isSpeaking: boolean;
}

function ParticipantVideoTile({ tile }: { tile: ParticipantTile }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current || !tile.videoTrack) return;
    tile.videoTrack.attach(videoRef.current);
    return () => {
      if (tile.videoTrack) tile.videoTrack.detach();
    };
  }, [tile.videoTrack]);

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center aspect-video',
        tile.isSpeaking && 'ring-2 ring-primary'
      )}
    >
      {tile.videoEnabled && tile.videoTrack ? (
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted={tile.isLocal} playsInline />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-white text-xl font-bold">
            {tile.participant.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
        </div>
      )}

      {/* Muted mic indicator */}
      {!tile.audioEnabled && (
        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
          <MicOff className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      {/* Participant name */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/70 to-transparent">
        <p className="text-white text-xs font-medium truncate">
          {tile.participant.name || tile.participant.identity}
          {tile.isLocal && ' (You)'}
        </p>
      </div>
    </div>
  );
}

export function VideoCall({ roomName, token, serverUrl, onLeave }: VideoCallProps) {
  const roomRef = useRef<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [tiles, setTiles] = useState<ParticipantTile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const buildTiles = useCallback((room: Room) => {
    const newTiles: ParticipantTile[] = [];

    // Local participant
    const local = room.localParticipant;
    const localVideoTrack = local.getTrackPublication(Track.Source.Camera)?.track ?? null;
    newTiles.push({
      participant: local,
      videoTrack: localVideoTrack as LocalTrack | null,
      audioEnabled: !local.isMicrophoneEnabled ? false : true,
      videoEnabled: local.isCameraEnabled,
      isLocal: true,
      isSpeaking: local.isSpeaking,
    });

    // Remote participants
    room.remoteParticipants.forEach((remote) => {
      const videoPublication = remote.getTrackPublication(Track.Source.Camera);
      const remoteVideoTrack = videoPublication?.isSubscribed ? (videoPublication.track as RemoteTrack) : null;
      newTiles.push({
        participant: remote,
        videoTrack: remoteVideoTrack,
        audioEnabled: !remote.audioLevel || remote.audioLevel > 0,
        videoEnabled: !!remoteVideoTrack,
        isLocal: false,
        isSpeaking: remote.isSpeaking,
      });
    });

    setTiles(newTiles);
  }, []);

  useEffect(() => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: VideoPresets.h540.resolution },
    });
    roomRef.current = room;

    const onConnected = () => {
      setConnected(true);
      buildTiles(room);
    };

    const onDisconnected = () => {
      setConnected(false);
      onLeave?.();
    };

    const onParticipantConnected = () => buildTiles(room);
    const onParticipantDisconnected = () => buildTiles(room);
    const onTrackSubscribed = () => buildTiles(room);
    const onTrackUnsubscribed = () => buildTiles(room);
    const onTrackMuted = () => buildTiles(room);
    const onTrackUnmuted = () => buildTiles(room);
    const onActiveSpeakersChanged = () => buildTiles(room);
    const onLocalTrackPublished = () => buildTiles(room);

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.TrackMuted, onTrackMuted);
    room.on(RoomEvent.TrackUnmuted, onTrackUnmuted);
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
    room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);

    room
      .connect(serverUrl, token, {
        autoSubscribe: true,
      })
      .then(() => {
        return room.localParticipant.enableCameraAndMicrophone();
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to connect to room.');
      });

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(RoomEvent.TrackMuted, onTrackMuted);
      room.off(RoomEvent.TrackUnmuted, onTrackUnmuted);
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
      room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
      room.disconnect();
    };
  }, [serverUrl, token, buildTiles, onLeave]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    setIsMuted(enabled); // muted = !enabled
    buildTiles(room);
  }, [buildTiles]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(!enabled);
    setIsCameraOff(enabled);
    buildTiles(room);
  }, [buildTiles]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!isScreenSharing);
      setIsScreenSharing((v) => !v);
      buildTiles(room);
    } catch {
      // User may have cancelled screen share picker
    }
  }, [isScreenSharing, buildTiles]);

  const handleLeave = useCallback(async () => {
    const room = roomRef.current;
    if (room) await room.disconnect();
    onLeave?.();
  }, [onLeave]);

  // Grid layout classes based on tile count
  const gridClass =
    tiles.length <= 1
      ? 'grid-cols-1'
      : tiles.length === 2
      ? 'grid-cols-2'
      : tiles.length <= 4
      ? 'grid-cols-2'
      : tiles.length <= 6
      ? 'grid-cols-3'
      : 'grid-cols-4';

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950 text-white">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">Connection failed</p>
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            onClick={onLeave}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white select-none">
      {/* Room name overlay */}
      <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-sm font-medium">
        {roomName}
      </div>

      {/* Participants panel toggle */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setShowParticipants((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-sm hover:bg-black/80 transition-colors"
        >
          <Users className="w-4 h-4" />
          {tiles.length}
        </button>
      </div>

      {/* Participants sidebar */}
      {showParticipants && (
        <div className="absolute top-16 right-4 z-10 w-56 bg-zinc-900/95 rounded-xl border border-zinc-700/50 shadow-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Participants ({tiles.length})
          </p>
          {tiles.map((tile) => (
            <div key={tile.participant.sid} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {tile.participant.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span className="text-sm truncate flex-1">
                {tile.participant.name || tile.participant.identity}
                {tile.isLocal && ' (You)'}
              </span>
              {!tile.audioEnabled && <MicOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {/* Main video grid */}
      <div className={cn('flex-1 p-4 grid gap-3 overflow-hidden relative', gridClass)}>
        {!connected && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Connecting...</p>
            </div>
          </div>
        )}
        {tiles.map((tile) => (
          <ParticipantVideoTile key={tile.participant.sid} tile={tile} />
        ))}
      </div>

      {/* Controls bar */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 py-4 px-6 bg-zinc-900/80 backdrop-blur-sm border-t border-zinc-800/50">
        {/* Mute/unmute */}
        <button
          onClick={toggleMic}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
            isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-700 hover:bg-zinc-600'
          )}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Camera */}
        <button
          onClick={toggleCamera}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
            isCameraOff ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-700 hover:bg-zinc-600'
          )}
          title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Screen share */}
        <button
          onClick={toggleScreenShare}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
            isScreenSharing ? 'bg-primary hover:bg-primary/90' : 'bg-zinc-700 hover:bg-zinc-600'
          )}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* Participants count */}
        <button
          onClick={() => setShowParticipants((v) => !v)}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
            showParticipants ? 'bg-primary hover:bg-primary/90' : 'bg-zinc-700 hover:bg-zinc-600'
          )}
          title="Participants"
        >
          <Users className="w-5 h-5" />
        </button>

        {/* Leave */}
        <button
          onClick={handleLeave}
          className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
          title="Leave call"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
