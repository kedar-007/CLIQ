import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotifications,
  handleNotificationReceived,
  handleNotificationResponse,
} from '@/lib/notifications';
import { useAuthStore } from '@/store/auth.store';
import { connectSocket } from '@/lib/socket';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const { isAuthenticated, login } = useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = await SecureStore.getItemAsync('accessToken');
        if (token) {
          // Attempt to restore session from secure store
          const userJson = await SecureStore.getItemAsync('user');
          const refreshToken = await SecureStore.getItemAsync('refreshToken');
          if (userJson) {
            const user = JSON.parse(userJson);
            login(user, token, refreshToken ?? '');
            await connectSocket();
            router.replace('/(tabs)');
          } else {
            router.replace('/(auth)/login');
          }
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotifications();

      notificationListener.current = Notifications.addNotificationReceivedListener(
        handleNotificationReceived,
      );
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );
    }

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [isAuthenticated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="chat/[channelId]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="chat/thread/[messageId]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="call/[roomId]"
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
            />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
