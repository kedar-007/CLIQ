'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatLayout } from '@/components/chat/chat-layout';

interface Props {
  params: { userId: string };
}

export default function DirectMessagePage({ params }: Props) {
  const { userId } = params;
  const router = useRouter();
  const [dmChannelId, setDmChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getOrCreateDmChannel() {
      try {
        const response = await fetch(`/api/chat/channels/dm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: userId }),
        });

        if (!response.ok) {
          throw new Error('Failed to get or create DM channel');
        }

        const data = await response.json();
        setDmChannelId(data.channelId ?? data.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    getOrCreateDmChannel();
  }, [userId, router]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!dmChannelId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Opening conversation...</p>
      </div>
    );
  }

  return <ChatLayout channelId={dmChannelId} />;
}
