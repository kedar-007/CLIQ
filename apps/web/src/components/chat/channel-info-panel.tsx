'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Hash, Lock, Users, Pin, Paperclip, Settings, Crown, Circle } from 'lucide-react';
import { fetchApi } from '@/lib/utils';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Channel, ChannelMember, Message, Attachment } from '@comms/types';

interface ChannelInfoPanelProps {
  channelId: string;
  onClose: () => void;
}

type Tab = 'about' | 'members' | 'files' | 'pinned';

const statusColors: Record<string, string> = {
  ONLINE: 'text-emerald-500',
  AWAY: 'text-amber-500',
  DND: 'text-red-500',
  OFFLINE: 'text-slate-400',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip')) return '🗜';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📑';
  if (mimeType.includes('text/')) return '📃';
  return '📎';
}

export function ChannelInfoPanel({ channelId, onClose }: ChannelInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('about');

  const { data: channelData, isLoading: channelLoading } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => fetchApi<{ success: boolean; data: Channel }>(`/api/chat/channels/${channelId}`),
    enabled: !!channelId,
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['channel-members', channelId],
    queryFn: () => fetchApi<{ success: boolean; data: ChannelMember[] }>(`/api/chat/channels/${channelId}/members`),
    enabled: !!channelId && activeTab === 'members',
  });

  const { data: pinsData, isLoading: pinsLoading } = useQuery({
    queryKey: ['channel-pins', channelId],
    queryFn: () => fetchApi<{ success: boolean; data: Message[] }>(`/api/chat/messages/${channelId}/pins`),
    enabled: !!channelId && activeTab === 'pinned',
  });

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['channel-files', channelId],
    queryFn: () => fetchApi<{ success: boolean; data: Attachment[] }>(`/api/files?channelId=${channelId}&limit=50`),
    enabled: !!channelId && activeTab === 'files',
  });

  const channel = channelData?.data;
  const members = membersData?.data || [];
  const pins = pinsData?.data || [];
  const files = filesData?.data || [];

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'about', label: 'About', icon: <Hash className="w-3.5 h-3.5" /> },
    { key: 'members', label: 'Members', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'files', label: 'Files', icon: <Paperclip className="w-3.5 h-3.5" /> },
    { key: 'pinned', label: 'Pinned', icon: <Pin className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          {channel?.type === 'PRIVATE' ? (
            <Lock className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Hash className="w-4 h-4 text-muted-foreground" />
          )}
          <h3 className="font-semibold text-sm truncate max-w-[160px]">{channel?.name || 'Channel Info'}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* About Tab */}
        {activeTab === 'about' && (
          <div className="p-4 space-y-4">
            {channelLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : channel ? (
              <>
                {channel.topic && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Topic</p>
                    <p className="text-sm text-foreground">{channel.topic}</p>
                  </div>
                )}
                {channel.description && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Description
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">{channel.description}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Channel Type
                  </p>
                  <div className="flex items-center gap-2">
                    {channel.type === 'PRIVATE' ? (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm text-foreground capitalize">{channel.type.toLowerCase().replace('_', ' ')}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Members</p>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">{channel.memberCount ?? '—'} members</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Created</p>
                  <p className="text-sm text-foreground">
                    {channel.createdAt ? format(new Date(channel.createdAt), 'MMMM d, yyyy') : '—'}
                  </p>
                </div>
                {channel.isReadOnly && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Read-only channel</span>
                  </div>
                )}
                {channel.retentionDays && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Message Retention
                    </p>
                    <p className="text-sm text-foreground">{channel.retentionDays} days</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Channel not found.</p>
            )}
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="py-2">
            {membersLoading ? (
              <div className="px-4 space-y-3 pt-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-muted rounded animate-pulse w-24" />
                      <div className="h-3 bg-muted rounded animate-pulse w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : members.length > 0 ? (
              <>
                <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {members.length} {members.length === 1 ? 'Member' : 'Members'}
                </p>
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="relative flex-shrink-0">
                      {member.user?.avatarUrl ? (
                        <img
                          src={member.user.avatarUrl}
                          alt={member.user.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold">
                          {member.user?.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                      <Circle
                        className={cn(
                          'absolute bottom-0 right-0 w-2.5 h-2.5 fill-current rounded-full ring-2 ring-card',
                          statusColors[member.user?.status || 'OFFLINE']
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{member.user?.name || 'Unknown'}</span>
                        {member.role === 'OWNER' && (
                          <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" title="Owner" />
                        )}
                        {member.role === 'MODERATOR' && (
                          <span className="text-xs px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                            Mod
                          </span>
                        )}
                      </div>
                      {member.user?.customStatusText && (
                        <p className="text-xs text-muted-foreground truncate">
                          {member.user.customStatusEmoji && `${member.user.customStatusEmoji} `}
                          {member.user.customStatusText}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Users className="w-8 h-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No members found.</p>
              </div>
            )}
          </div>
        )}

        {/* Files Tab */}
        {activeTab === 'files' && (
          <div className="p-4">
            {filesLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : files.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {files.length} {files.length === 1 ? 'File' : 'Files'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {files.map((file) => (
                    <a
                      key={file.id}
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors"
                    >
                      {file.mimeType.startsWith('image/') && file.thumbnailUrl ? (
                        <div className="relative">
                          <img
                            src={file.thumbnailUrl}
                            alt={file.fileName}
                            className="w-full h-24 object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        </div>
                      ) : (
                        <div className="h-24 flex flex-col items-center justify-center gap-2 bg-muted/50 group-hover:bg-muted transition-colors">
                          <span className="text-2xl">{getFileIcon(file.mimeType)}</span>
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium truncate" title={file.fileName}>
                          {file.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatBytes(file.fileSize)}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Paperclip className="w-8 h-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No files shared yet.</p>
              </div>
            )}
          </div>
        )}

        {/* Pinned Tab */}
        {activeTab === 'pinned' && (
          <div className="py-2">
            {pinsLoading ? (
              <div className="px-4 space-y-3 pt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-3 rounded-lg border border-border space-y-2">
                    <div className="h-3 bg-muted rounded animate-pulse w-16" />
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  </div>
                ))}
              </div>
            ) : pins.length > 0 ? (
              <>
                <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {pins.length} Pinned {pins.length === 1 ? 'Message' : 'Messages'}
                </p>
                <div className="px-4 space-y-2">
                  {pins.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        {msg.sender?.avatarUrl ? (
                          <img
                            src={msg.sender.avatarUrl}
                            alt={msg.sender.name}
                            className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
                            {msg.sender?.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                        <span className="text-xs font-semibold truncate">{msg.sender?.name || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                          {msg.createdAt ? format(new Date(msg.createdAt), 'MMM d') : ''}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed line-clamp-3">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Pin className="w-8 h-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No pinned messages yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Pin important messages to keep them handy.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
