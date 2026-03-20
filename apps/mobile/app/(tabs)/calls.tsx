import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, isYesterday } from 'date-fns';
import api from '@/lib/api';
import type { CallSession, User } from '@comms/types';

interface CallHistoryItem extends CallSession {
  otherParticipant?: User;
  status: 'missed' | 'incoming' | 'outgoing';
  duration?: number;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatCallTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
  return format(d, 'dd MMM HH:mm');
}

function CallIcon({ type, status }: { type: string; status: string }) {
  if (status === 'missed') return <Text className="text-red-500">📵</Text>;
  if (type === 'VIDEO') return <Text className="text-green-500">📹</Text>;
  return <Text className="text-green-500">📞</Text>;
}

export default function CallsScreen() {
  const [showNewCall, setShowNewCall] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ['call-history'],
    queryFn: async () => {
      const res = await api.get<{ data: CallHistoryItem[] }>('/calls/history');
      return res.data.data ?? [];
    },
  });

  async function searchContacts(query: string) {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get<{ data: User[] }>(`/users/search?q=${encodeURIComponent(query)}`);
      setSearchResults(res.data.data ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function initiateCall(userId: string, type: 'AUDIO' | 'VIDEO') {
    try {
      const res = await api.post<{ data: { callSessionId: string } }>('/calls/initiate', {
        userIds: [userId],
        type,
      });
      setShowNewCall(false);
      router.push(`/call/${res.data.data.callSessionId}`);
    } catch {
      Alert.alert('Error', 'Failed to start call');
    }
  }

  const renderCallItem = useCallback(({ item }: { item: CallHistoryItem }) => {
    const name = item.otherParticipant?.name ?? 'Unknown';
    const initials = name.slice(0, 2).toUpperCase();

    return (
      <TouchableOpacity
        className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
        onPress={() => initiateCall(item.otherParticipant?.id ?? '', 'AUDIO')}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View className="mr-3">
          {item.otherParticipant?.avatarUrl ? (
            <Image
              source={{ uri: item.otherParticipant.avatarUrl }}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <View className="w-12 h-12 rounded-full bg-primary-500 items-center justify-center">
              <Text className="text-white font-semibold">{initials}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View className="flex-1">
          <Text className={`text-base font-medium ${item.status === 'missed' ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
            {name}
          </Text>
          <View className="flex-row items-center gap-x-1 mt-0.5">
            <CallIcon type={item.type} status={item.status} />
            <Text className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {item.status}
              {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
            </Text>
          </View>
        </View>

        {/* Time + call back */}
        <View className="items-end gap-y-1">
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            {formatCallTime(item.startedAt)}
          </Text>
          <TouchableOpacity
            className="bg-green-500 rounded-full w-8 h-8 items-center justify-center"
            onPress={() => initiateCall(item.otherParticipant?.id ?? '', 'AUDIO')}
          >
            <Text className="text-white text-sm">📞</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100 dark:border-gray-800">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white">Calls</Text>
        <TouchableOpacity
          className="bg-primary-500 rounded-xl px-4 py-2"
          onPress={() => setShowNewCall(true)}
        >
          <Text className="text-white font-semibold text-sm">New Call</Text>
        </TouchableOpacity>
      </View>

      {/* Call history */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <FlashList
          data={calls}
          keyExtractor={(item) => item.id}
          renderItem={renderCallItem}
          estimatedItemSize={72}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-4xl mb-3">📞</Text>
              <Text className="text-base text-gray-500 dark:text-gray-400">
                No call history yet
              </Text>
            </View>
          }
        />
      )}

      {/* New Call Modal */}
      <Modal
        visible={showNewCall}
        animationType="slide"
        onRequestClose={() => setShowNewCall(false)}
      >
        <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
          <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <TouchableOpacity onPress={() => setShowNewCall(false)} className="mr-4">
              <Text className="text-primary-500 text-base">Cancel</Text>
            </TouchableOpacity>
            <Text className="text-lg font-semibold text-gray-900 dark:text-white flex-1">
              New Call
            </Text>
          </View>

          <View className="px-4 py-3">
            <TextInput
              className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
              placeholder="Search contacts..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={searchContacts}
              autoFocus
            />
          </View>

          {searching && (
            <View className="items-center py-4">
              <ActivityIndicator size="small" color="#3b82f6" />
            </View>
          )}

          <FlashList
            data={searchResults}
            keyExtractor={(item) => item.id}
            estimatedItemSize={64}
            renderItem={({ item }) => {
              const initials = item.name.slice(0, 2).toUpperCase();
              return (
                <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  {item.avatarUrl ? (
                    <Image
                      source={{ uri: item.avatarUrl }}
                      className="w-10 h-10 rounded-full mr-3"
                    />
                  ) : (
                    <View className="w-10 h-10 rounded-full bg-primary-500 items-center justify-center mr-3">
                      <Text className="text-white font-semibold text-sm">{initials}</Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-base font-medium text-gray-900 dark:text-white">
                      {item.name}
                    </Text>
                    <Text className="text-sm text-gray-500 dark:text-gray-400">{item.email}</Text>
                  </View>
                  <View className="flex-row gap-x-2">
                    <TouchableOpacity
                      className="bg-green-500 rounded-full w-10 h-10 items-center justify-center"
                      onPress={() => initiateCall(item.id, 'AUDIO')}
                    >
                      <Text className="text-white">📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="bg-primary-500 rounded-full w-10 h-10 items-center justify-center"
                      onPress={() => initiateCall(item.id, 'VIDEO')}
                    >
                      <Text className="text-white">📹</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              searchQuery.length > 1 && !searching ? (
                <View className="items-center py-10">
                  <Text className="text-gray-400 dark:text-gray-500">No contacts found</Text>
                </View>
              ) : null
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
