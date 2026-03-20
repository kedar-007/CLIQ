import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Switch,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store/auth.store';
import { disconnectSocket } from '@/lib/socket';
import api from '@/lib/api';
import type { UserStatus } from '@comms/types';

interface StatusOption {
  value: UserStatus;
  label: string;
  emoji: string;
  description: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'ONLINE', label: 'Available', emoji: '🟢', description: 'Available to chat' },
  { value: 'AWAY', label: 'Away', emoji: '🟡', description: 'Stepped away' },
  { value: 'DND', label: 'Do Not Disturb', emoji: '🔴', description: 'No notifications' },
  { value: 'OFFLINE', label: 'Offline', emoji: '⚫', description: 'Appear offline' },
];

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuthStore();
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const statusMutation = useMutation({
    mutationFn: async (status: UserStatus) => {
      return api.patch('/users/me/status', { status });
    },
    onSuccess: (_, status) => {
      updateUser({ status });
      setShowStatusPicker(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update status');
    },
  });

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('accessToken');
          await SecureStore.deleteItemAsync('refreshToken');
          await SecureStore.deleteItemAsync('user');
          disconnectSocket();
          logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === user?.status) ?? STATUS_OPTIONS[0];
  const userInitials = (user?.name ?? 'U').slice(0, 2).toUpperCase();

  interface SettingsSectionProps {
    title: string;
    children: React.ReactNode;
  }

  function SettingsSection({ title, children }: SettingsSectionProps) {
    return (
      <View className="mb-4">
        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-4 mb-1">
          {title}
        </Text>
        <View className="bg-white dark:bg-gray-900 rounded-2xl mx-4 overflow-hidden">
          {children}
        </View>
      </View>
    );
  }

  interface SettingsRowProps {
    icon: string;
    label: string;
    value?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    isLast?: boolean;
    destructive?: boolean;
  }

  function SettingsRow({ icon, label, value, onPress, rightElement, isLast, destructive }: SettingsRowProps) {
    return (
      <TouchableOpacity
        className={`flex-row items-center px-4 py-3.5 ${!isLast ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        disabled={!onPress && !rightElement}
      >
        <Text className="text-xl w-8">{icon}</Text>
        <Text
          className={`flex-1 text-base ml-1 ${
            destructive
              ? 'text-red-500'
              : 'text-gray-800 dark:text-gray-200'
          }`}
        >
          {label}
        </Text>
        {value && (
          <Text className="text-sm text-gray-400 dark:text-gray-500 mr-2">{value}</Text>
        )}
        {rightElement ?? (onPress ? (
          <Text className="text-gray-300 dark:text-gray-600">›</Text>
        ) : null)}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top']}>
      <ScrollView className="flex-1">
        {/* Profile header */}
        <View className="items-center px-4 py-8">
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              className="w-24 h-24 rounded-full mb-4"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-primary-500 items-center justify-center mb-4">
              <Text className="text-white text-3xl font-bold">{userInitials}</Text>
            </View>
          )}

          <Text className="text-xl font-bold text-gray-900 dark:text-white">{user?.name}</Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user?.email}</Text>
          {user?.jobTitle && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user.jobTitle}</Text>
          )}

          {/* Status button */}
          <TouchableOpacity
            className="flex-row items-center gap-x-2 mt-4 bg-white dark:bg-gray-900 px-4 py-2 rounded-full shadow-sm border border-gray-200 dark:border-gray-800"
            onPress={() => setShowStatusPicker(true)}
          >
            <Text className="text-base">{currentStatus.emoji}</Text>
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {currentStatus.label}
            </Text>
            <Text className="text-gray-400 text-xs">▾</Text>
          </TouchableOpacity>
        </View>

        {/* Settings Sections */}
        <SettingsSection title="Preferences">
          <SettingsRow
            icon="🔔"
            label="Notifications"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ true: '#3b82f6' }}
              />
            }
          />
          <SettingsRow
            icon="🌙"
            label="Dark Mode"
            isLast
            rightElement={
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ true: '#3b82f6' }}
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="Account">
          <SettingsRow
            icon="🔒"
            label="Privacy"
            onPress={() => Alert.alert('Privacy', 'Privacy settings coming soon')}
          />
          <SettingsRow
            icon="💾"
            label="Storage"
            value="2.3 GB used"
            onPress={() => Alert.alert('Storage', 'Storage management coming soon')}
          />
          <SettingsRow
            icon="🔗"
            label="Integrations"
            onPress={() => Alert.alert('Integrations', 'Integrations coming soon')}
            isLast
          />
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingsRow
            icon="❓"
            label="Help & Support"
            onPress={() => Alert.alert('Help', 'Visit help.dsvcliq.com')}
          />
          <SettingsRow
            icon="ℹ️"
            label="About"
            value="v1.0.0"
            onPress={() => Alert.alert('DSV-CLIQ', 'Version 1.0.0')}
            isLast
          />
        </SettingsSection>

        <View className="mx-4 mb-8">
          <TouchableOpacity
            className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl py-4 items-center"
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text className="text-red-500 font-semibold text-base">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Status Picker Modal */}
      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50 justify-center items-center px-6"
          activeOpacity={1}
          onPress={() => setShowStatusPicker(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            className="bg-white dark:bg-gray-900 rounded-2xl w-full overflow-hidden"
            onPress={() => {}}
          >
            <View className="px-4 py-4 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                Set Status
              </Text>
            </View>

            {STATUS_OPTIONS.map((option, index) => (
              <TouchableOpacity
                key={option.value}
                className={`flex-row items-center px-4 py-4 ${
                  index < STATUS_OPTIONS.length - 1
                    ? 'border-b border-gray-100 dark:border-gray-800'
                    : ''
                } ${user?.status === option.value ? 'bg-primary-50 dark:bg-primary-950/30' : ''}`}
                onPress={() => statusMutation.mutate(option.value)}
                disabled={statusMutation.isPending}
              >
                <Text className="text-2xl mr-3">{option.emoji}</Text>
                <View className="flex-1">
                  <Text className="text-base font-medium text-gray-900 dark:text-white">
                    {option.label}
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    {option.description}
                  </Text>
                </View>
                {user?.status === option.value && (
                  <Text className="text-primary-500">✓</Text>
                )}
                {statusMutation.isPending && statusMutation.variables === option.value && (
                  <ActivityIndicator size="small" color="#3b82f6" />
                )}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
