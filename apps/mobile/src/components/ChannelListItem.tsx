import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { format, isToday, isYesterday } from 'date-fns';

interface Props {
  id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  avatarInitials: string;
  timestamp?: Date | string;
  unreadCount?: number;
  isMuted?: boolean;
  onPress: () => void;
}

function formatTimestamp(ts?: Date | string): string {
  if (!ts) return '';
  const date = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(date.getTime())) return '';
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'dd/MM/yy');
}

export const ChannelListItem: React.FC<Props> = ({
  title,
  subtitle,
  avatarUrl,
  avatarInitials,
  timestamp,
  unreadCount = 0,
  isMuted = false,
  onPress,
}) => {
  const hasUnread = unreadCount > 0 && !isMuted;

  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800"
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View className="mr-3">
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            className="w-12 h-12 rounded-full"
          />
        ) : (
          <View className="w-12 h-12 rounded-full bg-primary-500 items-center justify-center">
            <Text className="text-white font-semibold text-base">
              {avatarInitials.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        {/* Online dot could be added here */}
      </View>

      {/* Content */}
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center justify-between mb-0.5">
          <Text
            className={`text-base flex-1 mr-2 ${hasUnread ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-200'}`}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
            {formatTimestamp(timestamp)}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Text
            className={`text-sm flex-1 mr-2 ${hasUnread ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}
            numberOfLines={1}
          >
            {subtitle ?? 'No messages yet'}
          </Text>

          {hasUnread && (
            <View className="bg-primary-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1">
              <Text className="text-white text-xs font-bold">
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          )}

          {isMuted && (
            <Text className="text-gray-400 text-xs">🔇</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default ChannelListItem;
