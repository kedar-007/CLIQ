import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';

interface TabIconProps {
  focused: boolean;
  label: string;
  icon: string;
}

function TabIcon({ focused, icon, label }: TabIconProps) {
  return (
    <View className="items-center justify-center pt-1">
      <Text className={`text-2xl ${focused ? 'opacity-100' : 'opacity-50'}`}>{icon}</Text>
      <Text
        className={`text-[10px] mt-0.5 ${
          focused
            ? 'text-primary-500 font-semibold'
            : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          height: 60,
          paddingBottom: 4,
          backgroundColor: '#ffffff',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="💬" label="Chats" />
          ),
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: 'Calls',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📞" label="Calls" />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📅" label="Calendar" />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="✅" label="Tasks" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="👤" label="Profile" />
          ),
        }}
      />
    </Tabs>
  );
}
