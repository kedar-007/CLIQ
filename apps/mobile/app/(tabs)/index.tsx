import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { useQuery } from '@tanstack/react-query';
import ChannelListItem from '@/components/ChannelListItem';
import api from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { connectSocket, getSocket } from '@/lib/socket';
import type { Channel, Message } from '@comms/types';

interface ChannelWithMeta extends Channel {
  lastMessage?: Message;
  isMuted?: boolean;
}

export default function ChatsScreen() {
  const { channels, setChannels, upsertChannel, addMessage, incrementUnread, unreadCounts } =
    useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const { isLoading, refetch } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const res = await api.get<{ data: ChannelWithMeta[] }>('/channels');
      const list = res.data.data ?? [];
      setChannels(list);
      return list;
    },
  });

  useEffect(() => {
    async function setupSocket() {
      const sock = await connectSocket();

      sock.on('message:new', (message: Message) => {
        addMessage(message.channelId, message);
        incrementUnread(message.channelId);
        // Re-order channels so latest message is on top
        refetch();
      });

      sock.on('channel:updated', (partial) => {
        const existing = channels.find((c) => c.id === partial.id);
        if (existing) {
          upsertChannel({ ...existing, ...partial } as Channel);
        }
      });
    }
    setupSocket();

    return () => {
      const sock = getSocket();
      if (sock) {
        sock.off('message:new');
        sock.off('channel:updated');
      }
    };
  }, []);

  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleMute(channelId: string) {
    try {
      await api.patch(`/channels/${channelId}/mute`);
      refetch();
    } catch {
      Alert.alert('Error', 'Failed to mute channel');
    }
  }

  async function handleArchive(channelId: string) {
    try {
      await api.patch(`/channels/${channelId}/archive`);
      refetch();
    } catch {
      Alert.alert('Error', 'Failed to archive channel');
    }
  }

  async function handleCreateChannel() {
    if (!newChannelName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ data: Channel }>('/channels', {
        name: newChannelName.trim(),
        type: 'PUBLIC',
      });
      upsertChannel(res.data.data);
      setShowNewDialog(false);
      setNewChannelName('');
      router.push(`/chat/${res.data.data.id}`);
    } catch {
      Alert.alert('Error', 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  }

  const renderRightActions = useCallback(
    (channelId: string, progress: Animated.AnimatedInterpolation<number>) => {
      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [160, 0],
      });
      return (
        <Animated.View
          className="flex-row"
          style={{ transform: [{ translateX }] }}
        >
          <TouchableOpacity
            className="bg-yellow-500 w-20 justify-center items-center"
            onPress={() => {
              swipeableRefs.current.get(channelId)?.close();
              handleMute(channelId);
            }}
          >
            <Text className="text-white font-semibold text-sm">Mute</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-red-500 w-20 justify-center items-center"
            onPress={() => {
              swipeableRefs.current.get(channelId)?.close();
              handleArchive(channelId);
            }}
          >
            <Text className="text-white font-semibold text-sm">Archive</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChannelWithMeta }) => {
      const initials = item.name.slice(0, 2).toUpperCase();
      const unread = unreadCounts[item.id] ?? 0;

      return (
        <Swipeable
          ref={(ref) => {
            if (ref) swipeableRefs.current.set(item.id, ref);
          }}
          renderRightActions={(progress) => renderRightActions(item.id, progress)}
          rightThreshold={40}
        >
          <ChannelListItem
            id={item.id}
            title={item.type === 'DM' ? item.name : `# ${item.name}`}
            subtitle={item.lastMessage?.content}
            avatarInitials={initials}
            timestamp={item.lastMessage?.createdAt ?? item.createdAt}
            unreadCount={unread}
            isMuted={item.isMuted}
            onPress={() => router.push(`/chat/${item.id}`)}
          />
        </Swipeable>
      );
    },
    [unreadCounts, renderRightActions],
  );

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-4 pt-2 pb-3 border-b border-gray-100 dark:border-gray-800">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Chats</Text>
        <TextInput
          className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2.5 text-base text-gray-900 dark:text-white"
          placeholder="Search channels..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={filteredChannels}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-4xl mb-3">💬</Text>
              <Text className="text-base text-gray-500 dark:text-gray-400">
                No channels yet. Create one!
              </Text>
            </View>
          }
          contentContainerStyle={filteredChannels.length === 0 ? { flex: 1 } : undefined}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-500 rounded-full items-center justify-center shadow-lg"
        onPress={() => setShowNewDialog(true)}
        activeOpacity={0.85}
      >
        <Text className="text-white text-3xl leading-none">+</Text>
      </TouchableOpacity>

      {/* New Channel Modal */}
      <Modal
        visible={showNewDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewDialog(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50 justify-center items-center px-6"
          activeOpacity={1}
          onPress={() => setShowNewDialog(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full"
            onPress={() => {}}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              New Channel
            </Text>
            <TextInput
              className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white mb-4"
              placeholder="Channel name"
              placeholderTextColor="#9ca3af"
              value={newChannelName}
              onChangeText={setNewChannelName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateChannel}
            />
            <View className="flex-row gap-x-3">
              <TouchableOpacity
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl py-3 items-center"
                onPress={() => setShowNewDialog(false)}
              >
                <Text className="text-gray-700 dark:text-gray-300 font-medium">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 bg-primary-500 rounded-xl py-3 items-center ${creating ? 'opacity-70' : ''}`}
                onPress={handleCreateChannel}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-semibold">Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
