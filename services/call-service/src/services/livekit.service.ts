import { RoomServiceClient, AccessToken, VideoGrant } from 'livekit-server-sdk';
import { createLogger } from '@comms/logger';

const logger = createLogger('call-service:livekit');

const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';

export const roomServiceClient = new RoomServiceClient(
  LIVEKIT_URL.replace('ws://', 'http://').replace('wss://', 'https://'),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

export async function createRoom(roomName: string, options?: {
  maxParticipants?: number;
  emptyTimeout?: number;
}): Promise<string> {
  const room = await roomServiceClient.createRoom({
    name: roomName,
    maxParticipants: options?.maxParticipants || 1000,
    emptyTimeout: options?.emptyTimeout || 300, // 5 min
  });
  logger.info('LiveKit room created', { roomName, sid: room.sid });
  return room.name;
}

export async function generateParticipantToken(params: {
  roomName: string;
  userId: string;
  userName: string;
  role: 'HOST' | 'PRESENTER' | 'ATTENDEE';
}): Promise<string> {
  const { roomName, userId, userName, role } = params;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    name: userName,
    ttl: '4h',
  });

  const grant: VideoGrant = {
    roomJoin: true,
    room: roomName,
    canPublish: role !== 'ATTENDEE',
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    roomAdmin: role === 'HOST',
    roomRecord: role === 'HOST',
  };

  at.addGrant(grant);
  return await at.toJwt();
}

export async function endRoom(roomName: string): Promise<void> {
  try {
    await roomServiceClient.deleteRoom(roomName);
    logger.info('LiveKit room ended', { roomName });
  } catch (err) {
    logger.error('Failed to end LiveKit room', { roomName, err });
  }
}

export async function listParticipants(roomName: string) {
  return roomServiceClient.listParticipants(roomName);
}

export async function muteParticipant(roomName: string, identity: string, trackSid: string, muted: boolean): Promise<void> {
  await roomServiceClient.mutePublishedTrack(roomName, identity, trackSid, muted);
}

export async function removeParticipant(roomName: string, identity: string): Promise<void> {
  await roomServiceClient.removeParticipant(roomName, identity);
}
