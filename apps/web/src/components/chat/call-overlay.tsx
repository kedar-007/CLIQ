'use client';

import { VideoCall } from './video-call';
import type { CallJoinConfig } from '@comms/types';

interface CallOverlayProps {
  config: CallJoinConfig;
  onLeave: () => void;
  participants: { name: string; avatarUrl?: string }[];
}

export function CallOverlay({ config, onLeave }: CallOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950">
      <VideoCall config={config} onLeave={onLeave} />
    </div>
  );
}
