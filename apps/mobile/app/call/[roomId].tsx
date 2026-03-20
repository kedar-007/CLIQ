import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Room,
  RoomEvent,
  Participant,
  Track,
  LocalParticipant,
  RemoteParticipant,
  ConnectionState,
  VideoQuality,
} from '@livekit/react-native';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { getSocket } from '@/lib/socket';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface CallInfo {
  liveKitToken: string;
  liveKitUrl: string;
  callSessionId: string;
  type: 'AUDIO' | 'VIDEO';
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface ParticipantTileProps {
  participant: Participant;
  isLocal: boolean;
}

function ParticipantTile({ participant, isLocal }: ParticipantTileProps) {
  const isMuted = !participant.isMicrophoneEnabled;
  const isCameraOff = !participant.isCameraEnabled;
  const name = participant.name ?? participant.identity ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <View
      style={{ width: SCREEN_WIDTH / 2 - 6, aspectRatio: 3 / 4 }}
      className="bg-gray-900 rounded-2xl m-1 overflow-hidden relative"
    >
      {/* Video track placeholder — in real app use VideoView from LiveKit */}
      {isCameraOff ? (
        <View className="flex-1 items-center justify-center bg-gray-800">
          <View className="w-16 h-16 rounded-full bg-primary-500 items-center justify-center mb-2">
            <Text className="text-white text-2xl font-bold">{initials}</Text>
          </View>
          <Text className="text-white text-sm font-medium">{name}</Text>
        </View>
      ) : (
        <View className="flex-1 bg-gray-800 items-center justify-center">
          {/* VideoView component would go here */}
          <Text className="text-gray-400 text-xs">Video</Text>
        </View>
      )}

      {/* Name overlay */}
      <View className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1 flex-row items-center">
        {isLocal && (
          <View className="bg-primary-500 rounded px-1 mr-1">
            <Text className="text-white text-[10px] font-semibold">You</Text>
          </View>
        )}
        <Text className="text-white text-xs flex-1" numberOfLines={1}>{name}</Text>
        {isMuted && <Text className="text-red-400 text-xs ml-1">🔇</Text>}
      </View>
    </View>
  );
}

export default function CallScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuthStore();

  const [room] = useState(() => new Room());
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: callInfo } = useQuery({
    queryKey: ['call-token', roomId],
    queryFn: async () => {
      const res = await api.post<{ data: CallInfo }>('/calls/join', { callSessionId: roomId });
      return res.data.data;
    },
  });

  useEffect(() => {
    if (!callInfo) return;

    const connect = async () => {
      try {
        await room.connect(callInfo.liveKitUrl, callInfo.liveKitToken, {
          autoSubscribe: true,
        });

        await room.localParticipant.enableCameraAndMicrophone();
        setLocalParticipant(room.localParticipant);
        setConnectionState(ConnectionState.Connected);

        // Start timer
        durationTimerRef.current = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
      } catch (err) {
        console.error('[Call] Failed to connect:', err);
        Alert.alert('Call Error', 'Failed to connect to call', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    };

    room.on(RoomEvent.ParticipantConnected, updateParticipants);
    room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
    room.on(RoomEvent.TrackPublished, updateParticipants);
    room.on(RoomEvent.TrackUnpublished, updateParticipants);
    room.on(RoomEvent.TrackSubscribed, updateParticipants);
    room.on(RoomEvent.TrackUnsubscribed, updateParticipants);
    room.on(RoomEvent.Disconnected, handleRoomDisconnected);
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      setConnectionState(state);
    });

    connect();

    return () => {
      room.disconnect();
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [callInfo]);

  function updateParticipants() {
    const remotes = Array.from(room.remoteParticipants.values());
    setParticipants(remotes);
  }

  function handleRoomDisconnected() {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    router.back();
  }

  async function toggleMute() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!room.localParticipant) return;
    await room.localParticipant.setMicrophoneEnabled(isMuted);
    setIsMuted(!isMuted);
  }

  async function toggleCamera() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!room.localParticipant) return;
    await room.localParticipant.setCameraEnabled(isCameraOff);
    setIsCameraOff(!isCameraOff);
  }

  async function flipCamera() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // LiveKit doesn't expose direct flip in all versions — this is a best-effort call
    setIsFrontCamera(!isFrontCamera);
  }

  function toggleSpeaker() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSpeakerOn(!isSpeakerOn);
  }

  async function endCall() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const sock = getSocket();
    if (sock) sock.emit('call:end', { callSessionId: roomId });
    room.disconnect();
    router.back();
  }

  async function toggleScreenShare() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!room.localParticipant) return;
    if (isScreenSharing) {
      await room.localParticipant.setScreenShareEnabled(false);
    } else {
      await room.localParticipant.setScreenShareEnabled(true);
    }
    setIsScreenSharing(!isScreenSharing);
  }

  const allParticipants: Participant[] = [
    ...(localParticipant ? [localParticipant as Participant] : []),
    ...participants,
  ];

  const isConnecting = connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;

  return (
    <View className="flex-1 bg-gray-950">
      <StatusBar barStyle="light-content" backgroundColor="#030712" />
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-2">
          <View>
            {isConnecting ? (
              <Text className="text-yellow-400 text-sm font-medium">Connecting...</Text>
            ) : connectionState === ConnectionState.Connected ? (
              <Text className="text-green-400 text-sm font-medium">
                {formatDuration(duration)}
              </Text>
            ) : (
              <Text className="text-gray-400 text-sm">Disconnected</Text>
            )}
          </View>
          <Text className="text-white font-semibold">
            {participants.length + 1} participant{participants.length !== 0 ? 's' : ''}
          </Text>
          <View className="w-16" />
        </View>

        {/* Participant grid */}
        <View className="flex-1 px-1">
          {allParticipants.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-gray-400 text-base">Waiting for others to join...</Text>
            </View>
          ) : allParticipants.length <= 2 ? (
            // Full screen for 1-2 participants
            <View className="flex-1 gap-y-2">
              {allParticipants.map((p) => (
                <View key={p.identity} className="flex-1">
                  <ParticipantTile
                    participant={p}
                    isLocal={p === (localParticipant as Participant)}
                  />
                </View>
              ))}
            </View>
          ) : (
            // Grid for 3+ participants
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {allParticipants.map((p) => (
                <ParticipantTile
                  key={p.identity}
                  participant={p}
                  isLocal={p === (localParticipant as Participant)}
                />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Controls */}
        <View className="px-6 pb-6 pt-4">
          <View className="flex-row justify-evenly items-center">
            {/* Mute */}
            <TouchableOpacity
              className={`w-14 h-14 rounded-full items-center justify-center ${
                isMuted ? 'bg-red-500' : 'bg-gray-800'
              }`}
              onPress={toggleMute}
            >
              <Text className="text-2xl">{isMuted ? '🔇' : '🎤'}</Text>
            </TouchableOpacity>

            {/* Camera */}
            <TouchableOpacity
              className={`w-14 h-14 rounded-full items-center justify-center ${
                isCameraOff ? 'bg-red-500' : 'bg-gray-800'
              }`}
              onPress={toggleCamera}
            >
              <Text className="text-2xl">{isCameraOff ? '📵' : '📹'}</Text>
            </TouchableOpacity>

            {/* End call */}
            <TouchableOpacity
              className="w-16 h-16 rounded-full items-center justify-center bg-red-500"
              onPress={endCall}
            >
              <Text className="text-2xl">📵</Text>
            </TouchableOpacity>

            {/* Flip camera */}
            <TouchableOpacity
              className="w-14 h-14 rounded-full items-center justify-center bg-gray-800"
              onPress={flipCamera}
            >
              <Text className="text-2xl">🔄</Text>
            </TouchableOpacity>

            {/* Speaker */}
            <TouchableOpacity
              className={`w-14 h-14 rounded-full items-center justify-center ${
                isSpeakerOn ? 'bg-gray-800' : 'bg-yellow-600'
              }`}
              onPress={toggleSpeaker}
            >
              <Text className="text-2xl">{isSpeakerOn ? '🔊' : '🔈'}</Text>
            </TouchableOpacity>
          </View>

          {/* Screen share */}
          <TouchableOpacity
            className={`mt-3 py-2.5 rounded-xl items-center ${
              isScreenSharing ? 'bg-primary-500' : 'bg-gray-800'
            }`}
            onPress={toggleScreenShare}
          >
            <Text className="text-white text-sm font-medium">
              {isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
