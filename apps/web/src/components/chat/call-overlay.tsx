'use client';

import { VideoCall } from './video-call';

interface CallOverlayProps {
  roomName: string;
  token: string;
  livekitUrl: string;
  callType: 'AUDIO' | 'VIDEO';
  onLeave: () => void;
  participants: { name: string; avatarUrl?: string }[];
}

export function CallOverlay({ roomName, token, livekitUrl, callType, onLeave }: CallOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950">
      <VideoCall
        roomName={roomName}
        token={token}
        serverUrl={livekitUrl}
        onLeave={onLeave}
      />
      {callType === 'AUDIO' && (
        <style>{`
          video { display: none !important; }
        `}</style>
      )}
    </div>
  );
}
