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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { differenceInMinutes } from 'date-fns';
import MessageBubble from '@/components/MessageBubble';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { connectSocket, getSocket } from '@/lib/socket';
import type { Message } from '@comms/types';

const GROUP_THRESHOLD_MINUTES = 5;

function shouldGroup(a: Message, b: Message): boolean {
  if (a.senderId !== b.senderId) return false;
  const diff = differenceInMinutes(new Date(b.createdAt), new Date(a.createdAt));
  return diff <= GROUP_THRESHOLD_MINUTES;
}

export default function ThreadScreen() {
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const { user } = useAuthStore();

  const [parentMessage, setParentMessage] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlashList<Message>>(null);

  const { isLoading } = useQuery({
    queryKey: ['thread', messageId],
    queryFn: async () => {
      const res = await api.get<{ data: { parent: Message; replies: Message[] } }>(
        `/messages/${messageId}/thread`,
      );
      setParentMessage(res.data.data.parent);
      setReplies(res.data.data.replies ?? []);
      return res.data.data;
    },
  });

  useEffect(() => {
    async function setupSocket() {
      const sock = await connectSocket();

      sock.emit('thread:subscribe', { threadId: messageId });

      sock.on('message:new', (message: Message) => {
        if (message.parentId !== messageId) return;
        setReplies((prev) => [...prev, message]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      });

      sock.on('message:updated', (partial) => {
        setReplies((prev) =>
          prev.map((m) => (m.id === partial.id ? { ...m, ...partial } as Message : m)),
        );
      });

      sock.on('message:deleted', ({ messageId: mid }) => {
        setReplies((prev) =>
          prev.map((m) =>
            m.id === mid ? { ...m, deletedAt: new Date() } : m,
          ),
        );
      });
    }

    setupSocket();

    return () => {
      const sock = getSocket();
      if (sock) {
        sock.off('message:new');
        sock.off('message:updated');
        sock.off('message:deleted');
      }
    };
  }, [messageId]);

  async function sendReply() {
    const text = inputText.trim();
    if (!text || !parentMessage) return;

    setInputText('');
    setIsSending(true);
    try {
      const sock = getSocket();
      if (sock) {
        sock.emit('message:send', {
          channelId: parentMessage.channelId,
          content: text,
          parentId: messageId,
        });
      } else {
        await api.post(`/messages/${messageId}/replies`, { content: text });
      }
    } catch {
      Alert.alert('Error', 'Failed to send reply');
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  }

  const renderReply = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwn = item.senderId === user?.id;
      const prevMsg = index > 0 ? replies[index - 1] : null;
      const nextMsg = index < replies.length - 1 ? replies[index + 1] : null;
      const showAvatar = !isOwn && (nextMsg ? !shouldGroup(item, nextMsg) : true);
      const showSenderName = !isOwn && (prevMsg ? !shouldGroup(prevMsg, item) : true);

      return (
        <MessageBubble
          message={item}
          isOwn={isOwn}
          showAvatar={showAvatar}
          showSenderName={showSenderName}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
          onReactionPress={() => {}}
        />
      );
    },
    [replies, user?.id],
  );

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <TouchableOpacity
          className="w-9 h-9 items-center justify-center mr-2"
          onPress={() => router.back()}
        >
          <Text className="text-primary-500 text-xl">‹</Text>
        </TouchableOpacity>
        <Text className="text-base font-semibold text-gray-900 dark:text-white">Thread</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={[...(parentMessage ? [parentMessage] : []), ...replies]}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              if (index === 0 && parentMessage && item.id === parentMessage.id) {
                // Parent message with divider
                return (
                  <View>
                    <MessageBubble
                      message={item}
                      isOwn={item.senderId === user?.id}
                      showAvatar
                      showSenderName
                      onLongPress={() => {}}
                      onReactionPress={() => {}}
                    />
                    {replies.length > 0 && (
                      <View className="flex-row items-center px-4 my-2">
                        <View className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                        <Text className="text-xs text-gray-400 dark:text-gray-500 mx-3">
                          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                        </Text>
                        <View className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                      </View>
                    )}
                  </View>
                );
              }
              // Adjust index to account for parent
              const replyIndex = index - 1;
              return renderReply({ item, index: replyIndex });
            }}
            estimatedItemSize={60}
            contentContainerStyle={{ paddingVertical: 8 }}
          />
        )}

        {/* Composer */}
        <View className="flex-row items-end px-3 py-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 gap-x-2">
          <View className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2 min-h-[40px] max-h-32 justify-center">
            <TextInput
              className="text-base text-gray-900 dark:text-white"
              placeholder="Reply in thread..."
              placeholderTextColor="#9ca3af"
              value={inputText}
              onChangeText={setInputText}
              multiline
              style={{ maxHeight: 100 }}
            />
          </View>

          <TouchableOpacity
            className={`w-9 h-9 items-center justify-center rounded-full mb-0.5 ${
              inputText.trim() && !isSending
                ? 'bg-primary-500'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
            onPress={sendReply}
            disabled={!inputText.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white text-lg">➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
