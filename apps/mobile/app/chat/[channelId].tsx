import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  ActionSheetIOS,
  Clipboard,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { differenceInMinutes } from 'date-fns';
import MessageBubble from '@/components/MessageBubble';
import api from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { connectSocket, getSocket } from '@/lib/socket';
import type { Message, Channel } from '@comms/types';

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '👏', '🔥'];
const TYPING_TIMEOUT = 3000;
const GROUP_THRESHOLD_MINUTES = 5;

function shouldGroup(a: Message, b: Message): boolean {
  if (a.senderId !== b.senderId) return false;
  const diff = differenceInMinutes(
    new Date(b.createdAt),
    new Date(a.createdAt),
  );
  return diff <= GROUP_THRESHOLD_MINUTES;
}

export default function ChatScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const { user } = useAuthStore();
  const {
    messages: messagesMap,
    setMessages,
    addMessage,
    updateMessage,
    deleteMessage: deleteMessageInStore,
    typingUsers,
    setTypingUser,
    clearUnread,
    setLastRead,
    setActiveChannel,
  } = useChatStore();

  const messages = messagesMap[channelId] ?? [];
  const channelTypers = typingUsers[channelId] ?? [];

  const [inputText, setInputText] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [oldestCursor, setOldestCursor] = useState<string | undefined>();
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);

  const listRef = useRef<FlashList<Message>>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  // Load channel info
  useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      const res = await api.get<{ data: Channel }>(`/channels/${channelId}`);
      setChannel(res.data.data);
      return res.data.data;
    },
  });

  // Load initial messages
  const { isLoading } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: async () => {
      const res = await api.get<{ data: Message[]; nextCursor?: string; hasMore: boolean }>(
        `/channels/${channelId}/messages?limit=50`,
      );
      const { data, nextCursor, hasMore: more } = res.data;
      setMessages(channelId, data);
      setOldestCursor(nextCursor);
      setHasMore(more ?? false);
      if (data.length > 0) {
        markRead(data[data.length - 1].id);
      }
      return data;
    },
  });

  useEffect(() => {
    setActiveChannel(channelId);
    clearUnread(channelId);

    return () => {
      setActiveChannel(null);
      stopTyping();
    };
  }, [channelId]);

  useEffect(() => {
    async function setupSocket() {
      const sock = await connectSocket();

      sock.emit('channel:join', { channelId });

      sock.on('message:new', (message: Message) => {
        if (message.channelId !== channelId) return;
        addMessage(channelId, message);
        markRead(message.id);
        setTimeout(() => {
          listRef.current?.scrollToEnd({ animated: true });
        }, 100);
      });

      sock.on('message:updated', (partial) => {
        if (!partial.channelId || partial.channelId !== channelId) return;
        updateMessage(channelId, partial.id, partial as Partial<Message>);
      });

      sock.on('message:deleted', ({ messageId, channelId: cId }) => {
        if (cId !== channelId) return;
        deleteMessageInStore(channelId, messageId);
      });

      sock.on('message:reaction', ({ messageId, emoji, userId, action, count }) => {
        const msg = messages.find((m) => m.id === messageId);
        if (!msg) return;
        const existing = msg.reactions ?? [];
        const updated = existing.map((r) => {
          if (r.emoji !== emoji) return r;
          const users = action === 'add'
            ? [...new Set([...r.users, userId])]
            : r.users.filter((u) => u !== userId);
          return { ...r, count, users, hasReacted: userId === user?.id ? action === 'add' : r.hasReacted };
        });
        if (!updated.find((r) => r.emoji === emoji)) {
          updated.push({ emoji, count, users: [userId], hasReacted: userId === user?.id });
        }
        updateMessage(channelId, messageId, { reactions: updated });
      });

      sock.on('typing:user', ({ channelId: cId, userId: uid, user: u, isTyping }) => {
        if (cId !== channelId) return;
        setTypingUser(channelId, { userId: uid, name: u.name, avatarUrl: u.avatarUrl }, isTyping);
      });
    }

    setupSocket();

    return () => {
      const sock = getSocket();
      if (sock) {
        sock.emit('channel:leave', { channelId });
        sock.off('message:new');
        sock.off('message:updated');
        sock.off('message:deleted');
        sock.off('message:reaction');
        sock.off('typing:user');
      }
    };
  }, [channelId]);

  function markRead(messageId: string) {
    const sock = getSocket();
    if (sock) {
      sock.emit('read:mark', { channelId, messageId });
      setLastRead(channelId, messageId);
    }
  }

  function startTyping() {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      const sock = getSocket();
      if (sock) sock.emit('typing:start', { channelId });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(stopTyping, TYPING_TIMEOUT);
  }

  function stopTyping() {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      const sock = getSocket();
      if (sock) sock.emit('typing:stop', { channelId });
    }
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }

  async function sendMessage() {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');
    stopTyping();

    const sock = getSocket();
    if (sock) {
      sock.emit('message:send', { channelId, content: text });
    } else {
      try {
        await api.post(`/channels/${channelId}/messages`, { content: text });
      } catch {
        Alert.alert('Error', 'Failed to send message');
        setInputText(text);
      }
    }
  }

  async function sendImageMessage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'image.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      formData.append('channelId', channelId);

      const uploadRes = await api.post<{ data: { fileId: string } }>(
        '/files/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      const sock = getSocket();
      if (sock) {
        sock.emit('message:send', {
          channelId,
          content: '',
          attachmentIds: [uploadRes.data.data.fileId],
        });
      }
    } catch {
      Alert.alert('Error', 'Failed to send image');
    }
  }

  async function handleLoadMore() {
    if (isLoadingMore || !hasMore || !oldestCursor) return;
    setIsLoadingMore(true);
    try {
      const res = await api.get<{ data: Message[]; nextCursor?: string; hasMore: boolean }>(
        `/channels/${channelId}/messages?limit=50&before=${oldestCursor}`,
      );
      const { data, nextCursor, hasMore: more } = res.data;
      const store = useChatStore.getState();
      store.prependMessages(channelId, data);
      setOldestCursor(nextCursor);
      setHasMore(more ?? false);
    } catch {
      // silently fail
    } finally {
      setIsLoadingMore(false);
    }
  }

  function handleLongPress(message: Message) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessage(message);
    setShowReactionPicker(true);
  }

  async function handleReaction(emoji: string) {
    if (!selectedMessage) return;
    setShowReactionPicker(false);
    const sock = getSocket();
    if (sock) {
      const existing = selectedMessage.reactions?.find((r) => r.emoji === emoji);
      const action = existing?.hasReacted ? 'remove' : 'add';
      sock.emit('message:react', { messageId: selectedMessage.id, emoji, action });
    }
  }

  function handleMessageOptions() {
    if (!selectedMessage) return;
    setShowReactionPicker(false);

    const isOwn = selectedMessage.senderId === user?.id;
    const options = ['Reply in Thread', 'Copy Text', 'Save Message', ...(isOwn ? ['Delete Message'] : []), 'Cancel'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: isOwn ? options.length - 2 : undefined,
        },
        (index) => handleOptionSelected(index, options, isOwn),
      );
    } else {
      // Android fallback — show alert
      Alert.alert('Message Options', undefined, options.slice(0, -1).map((label, i) => ({
        text: label,
        style: (isOwn && i === options.length - 2) ? 'destructive' : 'default',
        onPress: () => handleOptionSelected(i, options, isOwn),
      })));
    }
  }

  function handleOptionSelected(index: number, options: string[], isOwn: boolean) {
    if (!selectedMessage) return;
    const option = options[index];
    if (option === 'Reply in Thread') {
      router.push(`/chat/thread/${selectedMessage.id}`);
    } else if (option === 'Copy Text' && selectedMessage.content) {
      Clipboard.setString(selectedMessage.content);
    } else if (option === 'Save Message') {
      const sock = getSocket();
      if (sock) sock.emit('message:save', { messageId: selectedMessage.id });
    } else if (option === 'Delete Message' && isOwn) {
      Alert.alert('Delete Message', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const sock = getSocket();
            if (sock) sock.emit('message:delete', { messageId: selectedMessage.id });
          },
        },
      ]);
    }
    setSelectedMessage(null);
  }

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwn = item.senderId === user?.id;
      const prevMsg = index > 0 ? messages[index - 1] : null;
      const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

      const isGroupedWithPrev = prevMsg ? shouldGroup(prevMsg, item) : false;
      const isGroupedWithNext = nextMsg ? shouldGroup(item, nextMsg) : false;

      const showAvatar = !isOwn && !isGroupedWithNext;
      const showSenderName = !isOwn && !isGroupedWithPrev;

      return (
        <MessageBubble
          message={item}
          isOwn={isOwn}
          showAvatar={showAvatar}
          showSenderName={showSenderName}
          onLongPress={handleLongPress}
          onReactionPress={(emoji) => {
            setSelectedMessage(item);
            handleReaction(emoji);
          }}
          onReplyPress={() => router.push(`/chat/thread/${item.id}`)}
        />
      );
    },
    [messages, user?.id],
  );

  const channelName = channel
    ? channel.type === 'DM'
      ? channel.name
      : `#${channel.name}`
    : channelId;

  const typingText =
    channelTypers.length === 1
      ? `${channelTypers[0].name} is typing...`
      : channelTypers.length === 2
      ? `${channelTypers[0].name} and ${channelTypers[1].name} are typing...`
      : channelTypers.length > 2
      ? 'Several people are typing...'
      : '';

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <TouchableOpacity
          className="w-9 h-9 items-center justify-center rounded-full mr-1"
          onPress={() => router.back()}
        >
          <Text className="text-primary-500 text-xl">‹</Text>
        </TouchableOpacity>

        <View className="flex-1 mx-2">
          <Text className="text-base font-semibold text-gray-900 dark:text-white" numberOfLines={1}>
            {channelName}
          </Text>
          {channel?.memberCount && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {channel.memberCount} members
            </Text>
          )}
        </View>

        <View className="flex-row gap-x-1">
          <TouchableOpacity
            className="w-9 h-9 items-center justify-center"
            onPress={() => {
              router.push(`/call/${channelId}` as never);
            }}
          >
            <Text className="text-xl">📹</Text>
          </TouchableOpacity>
          <TouchableOpacity className="w-9 h-9 items-center justify-center">
            <Text className="text-xl">📞</Text>
          </TouchableOpacity>
          <TouchableOpacity className="w-9 h-9 items-center justify-center">
            <Text className="text-xl">ℹ️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Message list */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            estimatedItemSize={60}
            inverted={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={
              isLoadingMore ? (
                <View className="py-3 items-center">
                  <ActivityIndicator size="small" color="#3b82f6" />
                </View>
              ) : null
            }
            contentContainerStyle={{ paddingVertical: 8 }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text className="text-4xl mb-3">👋</Text>
                <Text className="text-base text-gray-500 dark:text-gray-400">
                  Start the conversation!
                </Text>
              </View>
            }
          />
        )}

        {/* Typing indicator */}
        {typingText ? (
          <View className="px-4 py-1.5">
            <Text className="text-xs text-gray-500 dark:text-gray-400 italic">{typingText}</Text>
          </View>
        ) : null}

        {/* Composer */}
        <View className="flex-row items-end px-3 py-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 gap-x-2">
          <TouchableOpacity
            className="w-9 h-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 mb-0.5"
            onPress={sendImageMessage}
          >
            <Text className="text-lg">📎</Text>
          </TouchableOpacity>

          <View className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2 min-h-[40px] max-h-32 justify-center">
            <TextInput
              ref={inputRef}
              className="text-base text-gray-900 dark:text-white"
              placeholder="Type a message..."
              placeholderTextColor="#9ca3af"
              value={inputText}
              onChangeText={(text) => {
                setInputText(text);
                if (text.length > 0) startTyping();
                else stopTyping();
              }}
              multiline
              returnKeyType="default"
              style={{ maxHeight: 100 }}
            />
          </View>

          <TouchableOpacity
            className={`w-9 h-9 items-center justify-center rounded-full mb-0.5 ${
              inputText.trim() ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'
            }`}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <Text className="text-white text-lg">➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Reaction Picker Modal */}
      <Modal
        visible={showReactionPicker}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowReactionPicker(false);
          setSelectedMessage(null);
        }}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-center items-center"
          activeOpacity={1}
          onPress={() => {
            setShowReactionPicker(false);
            setSelectedMessage(null);
          }}
        >
          <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 mx-4">
            {/* Quick reactions */}
            <View className="flex-row gap-x-2 mb-4">
              {EMOJI_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  className="w-10 h-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"
                  onPress={() => handleReaction(emoji)}
                >
                  <Text className="text-2xl">{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Message actions */}
            <View className="border-t border-gray-100 dark:border-gray-800 pt-3 gap-y-1">
              <TouchableOpacity
                className="flex-row items-center py-2 px-2"
                onPress={handleMessageOptions}
              >
                <Text className="text-gray-700 dark:text-gray-300 text-base">More options...</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
