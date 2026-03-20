import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Linking,
  Dimensions,
} from 'react-native';
import { format } from 'date-fns';
import type { Message, Attachment, MessageReaction } from '@comms/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.72;

interface Props {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showSenderName: boolean;
  onLongPress: (message: Message) => void;
  onReactionPress: (emoji: string) => void;
  onReplyPress?: () => void;
  onImagePress?: (url: string) => void;
}

function formatTime(date: Date | string): string {
  return format(date instanceof Date ? date : new Date(date), 'HH:mm');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function linkifyText(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <Text
          key={i}
          className="text-blue-400 underline"
          onPress={() => Linking.openURL(part)}
        >
          {part}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

const FileAttachment: React.FC<{ attachment: Attachment; isOwn: boolean }> = ({
  attachment,
  isOwn,
}) => {
  const isImage = attachment.mimeType.startsWith('image/');

  if (isImage && attachment.thumbnailUrl) {
    return (
      <TouchableOpacity
        onPress={() => Linking.openURL(attachment.fileUrl)}
        className="mt-1"
      >
        <Image
          source={{ uri: attachment.thumbnailUrl ?? attachment.fileUrl }}
          style={{ width: MAX_BUBBLE_WIDTH - 32, height: 180, borderRadius: 8 }}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      className={`flex-row items-center mt-1 p-2 rounded-lg ${isOwn ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
      onPress={() => Linking.openURL(attachment.fileUrl)}
    >
      <Text className="text-2xl mr-2">📎</Text>
      <View className="flex-1 min-w-0">
        <Text
          className={`text-sm font-medium ${isOwn ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}
          numberOfLines={1}
        >
          {attachment.fileName}
        </Text>
        <Text className={`text-xs ${isOwn ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
          {formatFileSize(attachment.fileSize)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const ReactionsRow: React.FC<{
  reactions: MessageReaction[];
  isOwn: boolean;
  onReactionPress: (emoji: string) => void;
}> = ({ reactions, isOwn, onReactionPress }) => {
  if (!reactions.length) return null;
  return (
    <View className={`flex-row flex-wrap mt-1 gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {reactions.map((r) => (
        <TouchableOpacity
          key={r.emoji}
          onPress={() => onReactionPress(r.emoji)}
          className={`flex-row items-center px-2 py-0.5 rounded-full border ${r.hasReacted ? 'bg-blue-100 border-blue-400 dark:bg-blue-900 dark:border-blue-600' : 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600'}`}
        >
          <Text className="text-sm">{r.emoji}</Text>
          {r.count > 1 && (
            <Text className="text-xs text-gray-600 dark:text-gray-300 ml-1">{r.count}</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
};

export const MessageBubble: React.FC<Props> = ({
  message,
  isOwn,
  showAvatar,
  showSenderName,
  onLongPress,
  onReactionPress,
}) => {
  if (message.deletedAt) {
    return (
      <View className={`flex-row my-0.5 px-4 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <Text className="text-sm italic text-gray-400 dark:text-gray-600">
          This message was deleted
        </Text>
      </View>
    );
  }

  const senderInitials = (message.sender?.name ?? 'U').slice(0, 2).toUpperCase();

  return (
    <View className={`flex-row my-0.5 px-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar placeholder (spacing) */}
      <View className="w-8 items-end justify-end mb-1">
        {!isOwn && showAvatar ? (
          message.sender?.avatarUrl ? (
            <Image
              source={{ uri: message.sender.avatarUrl }}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <View className="w-8 h-8 rounded-full bg-primary-500 items-center justify-center">
              <Text className="text-white text-xs font-semibold">{senderInitials}</Text>
            </View>
          )
        ) : (
          <View className="w-8 h-8" />
        )}
      </View>

      <View className={`max-w-[72%] ml-2 ${isOwn ? 'mr-2 ml-0' : ''}`}>
        {!isOwn && showSenderName && (
          <Text className="text-xs font-semibold text-primary-500 mb-0.5 ml-1">
            {message.sender?.name ?? 'Unknown'}
          </Text>
        )}

        <TouchableOpacity
          onLongPress={() => onLongPress(message)}
          activeOpacity={0.85}
          delayLongPress={350}
        >
          <View
            className={`rounded-2xl px-3 py-2 ${
              isOwn
                ? 'bg-primary-500 rounded-tr-sm'
                : 'bg-white dark:bg-gray-800 rounded-tl-sm shadow-sm'
            }`}
          >
            {/* Text content */}
            {message.content ? (
              <Text
                className={`text-sm leading-5 ${isOwn ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}
              >
                {linkifyText(message.content)}
              </Text>
            ) : null}

            {/* Attachments */}
            {message.attachments?.map((att) => (
              <FileAttachment key={att.id} attachment={att} isOwn={isOwn} />
            ))}

            {/* Timestamp + edited */}
            <View className={`flex-row items-center mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {message.isEdited && (
                <Text className={`text-xs mr-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                  edited
                </Text>
              )}
              <Text className={`text-xs ${isOwn ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                {formatTime(message.createdAt)}
              </Text>
              {isOwn && <Text className="text-xs text-blue-200 ml-1">✓</Text>}
            </View>
          </View>
        </TouchableOpacity>

        {/* Thread reply count */}
        {message.replyCount && message.replyCount > 0 ? (
          <TouchableOpacity className={`mt-1 ${isOwn ? 'items-end' : 'items-start'}`}>
            <Text className="text-xs text-primary-500">
              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Reactions */}
        <ReactionsRow
          reactions={message.reactions ?? []}
          isOwn={isOwn}
          onReactionPress={onReactionPress}
        />
      </View>
    </View>
  );
};

export default MessageBubble;
