'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { fetchApi } from '@/lib/utils';
import type { CallJoinConfig } from '@comms/types';

interface IncomingCallData {
  callSessionId: string;
  channelId?: string;
  channelName?: string;
  channelType?: string;
  callType: 'AUDIO' | 'VIDEO';
  roomId: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatarUrl?: string | null;
  startedAt?: string;
}

interface IncomingCallAlertProps {
  onAccept: (config: CallJoinConfig) => void;
}

interface IncomingCallResponse {
  success: boolean;
  data: IncomingCallData | null;
}

export function IncomingCallAlert({ onAccept }: IncomingCallAlertProps) {
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [busy, setBusy] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetchApi<IncomingCallResponse>('/api/calls/incoming');
        if (cancelled) return;
        setIncomingCall(response.data || null);
      } catch {
        if (!cancelled) setIncomingCall(null);
      }
    };

    void poll();
    const timer = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!incomingCall) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
      return;
    }

    if (intervalRef.current) return;

    const playTone = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const playBurst = (frequency: number, startOffset: number, duration: number, gainValue: number) => {
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          oscillator.type = 'triangle';
          oscillator.frequency.value = frequency;
          gainNode.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
          gainNode.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + startOffset + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          oscillator.start(ctx.currentTime + startOffset);
          oscillator.stop(ctx.currentTime + startOffset + duration + 0.02);
        };

        playBurst(740, 0, 0.22, 0.03);
        playBurst(880, 0.26, 0.24, 0.028);
      } catch {
        // Best effort only; some browsers block autoplay audio.
      }
    };

    void playTone();
    intervalRef.current = window.setInterval(() => {
      void playTone();
    }, 2200);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    };
  }, [incomingCall]);

  const handleDecline = async () => {
    if (!incomingCall) return;
    setBusy(true);
    await fetchApi(`/api/calls/${incomingCall.callSessionId}/decline`, {
      method: 'POST',
    }).catch(() => {});
    setIncomingCall(null);
    setBusy(false);
  };

  const handleAccept = async () => {
    if (!incomingCall) return;
    setBusy(true);

    try {
      const response = await fetchApi<{ success: boolean; data: CallJoinConfig }>(`/api/calls/${incomingCall.callSessionId}/join`, {
        method: 'POST',
      });

      setIncomingCall(null);
      if (response.success && response.data) {
        onAccept(response.data);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!incomingCall) return null;

  return (
    <div className="fixed right-6 top-6 z-[60] w-[360px] rounded-[28px] border border-cyan-400/20 bg-slate-950/95 p-5 text-white shadow-[0_30px_80px_rgba(15,23,42,0.55)] backdrop-blur-xl">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15">
          {incomingCall.callType === 'VIDEO' ? <Video className="h-5 w-5 text-cyan-300" /> : <Phone className="h-5 w-5 text-cyan-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Incoming Call</p>
          <p className="mt-2 text-lg font-semibold">{incomingCall.fromUserName}</p>
          <p className="mt-1 text-sm text-slate-300">
            {incomingCall.callType === 'VIDEO' ? 'Video call' : 'Audio call'} is ringing
          </p>
          {incomingCall.channelName && (
            <p className="mt-1 text-xs text-slate-400">From {incomingCall.channelName}</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          onClick={handleDecline}
          disabled={busy}
          className="rounded-full border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/25 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-2">
            <PhoneOff className="h-4 w-4" />
            Decline
          </span>
        </button>
        <button
          onClick={handleAccept}
          disabled={busy}
          className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Accept
          </span>
        </button>
      </div>
    </div>
  );
}
