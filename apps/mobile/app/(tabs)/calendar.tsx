import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { CalendarEvent } from '@comms/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventAllDay, setNewEventAllDay] = useState(false);
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({
    queryKey: ['events', format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      const res = await api.get<{ data: CalendarEvent[] }>(
        `/calendar/events?start=${start}&end=${end}`,
      );
      return res.data.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const startAt = new Date(selectedDate);
      startAt.setHours(9, 0, 0, 0);
      const endAt = new Date(selectedDate);
      endAt.setHours(10, 0, 0, 0);
      return api.post('/calendar/events', {
        title: newEventTitle.trim(),
        description: newEventDesc.trim(),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        isAllDay: newEventAllDay,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setShowCreateModal(false);
      setNewEventTitle('');
      setNewEventDesc('');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create event');
    },
  });

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const start = startOfWeek(monthStart);
    const end = endOfWeek(monthEnd);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const eventsOnDate = (date: Date): CalendarEvent[] =>
    events.filter((e) => isSameDay(new Date(e.startAt), date));

  const selectedDayEvents = eventsOnDate(selectedDate);

  function renderCalendarDay(date: Date) {
    const dayEvents = eventsOnDate(date);
    const isSelected = isSameDay(date, selectedDate);
    const isCurrentMonth = isSameMonth(date, currentMonth);
    const isToday = isSameDay(date, new Date());

    return (
      <TouchableOpacity
        key={date.toISOString()}
        className="flex-1 items-center py-1"
        onPress={() => setSelectedDate(date)}
      >
        <View
          className={`w-8 h-8 rounded-full items-center justify-center ${
            isSelected
              ? 'bg-primary-500'
              : isToday
              ? 'border-2 border-primary-500'
              : ''
          }`}
        >
          <Text
            className={`text-sm ${
              isSelected
                ? 'text-white font-semibold'
                : isCurrentMonth
                ? isToday
                  ? 'text-primary-500 font-semibold'
                  : 'text-gray-800 dark:text-gray-200'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          >
            {format(date, 'd')}
          </Text>
        </View>
        {/* Event dots */}
        <View className="flex-row gap-x-0.5 mt-0.5 h-1">
          {dayEvents.slice(0, 3).map((e) => (
            <View key={e.id} className="w-1 h-1 rounded-full bg-primary-400" />
          ))}
        </View>
      </TouchableOpacity>
    );
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="px-4 pt-2 pb-4">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">Calendar</Text>
            <View className="flex-row items-center gap-x-4">
              <TouchableOpacity onPress={() => setCurrentMonth((m) => subMonths(m, 1))}>
                <Text className="text-primary-500 text-xl">‹</Text>
              </TouchableOpacity>
              <Text className="text-base font-semibold text-gray-800 dark:text-gray-200 min-w-[120px] text-center">
                {format(currentMonth, 'MMMM yyyy')}
              </Text>
              <TouchableOpacity onPress={() => setCurrentMonth((m) => addMonths(m, 1))}>
                <Text className="text-primary-500 text-xl">›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Weekday labels */}
          <View className="flex-row mb-1">
            {WEEKDAYS.map((d) => (
              <View key={d} className="flex-1 items-center">
                <Text className="text-xs font-medium text-gray-400 dark:text-gray-500">{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar weeks */}
          {weeks.map((week, i) => (
            <View key={i} className="flex-row">
              {week.map((day) => renderCalendarDay(day))}
            </View>
          ))}
        </View>

        {/* Divider */}
        <View className="h-2 bg-gray-50 dark:bg-gray-900" />

        {/* Selected day events */}
        <View className="px-4 py-4">
          <Text className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
            {isSameDay(selectedDate, new Date())
              ? 'Today'
              : format(selectedDate, 'EEEE, MMM d')}
          </Text>

          {selectedDayEvents.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-gray-400 dark:text-gray-500">No events this day</Text>
            </View>
          ) : (
            <View className="gap-y-2">
              {selectedDayEvents.map((event) => (
                <TouchableOpacity
                  key={event.id}
                  className="bg-primary-50 dark:bg-primary-900/30 rounded-xl p-3 border-l-4 border-primary-500"
                >
                  <Text className="text-base font-semibold text-gray-900 dark:text-white">
                    {event.title}
                  </Text>
                  {!event.isAllDay && (
                    <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {format(new Date(event.startAt), 'HH:mm')} –{' '}
                      {format(new Date(event.endAt), 'HH:mm')}
                    </Text>
                  )}
                  {event.isAllDay && (
                    <Text className="text-sm text-primary-500 mt-0.5">All day</Text>
                  )}
                  {event.location && (
                    <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      📍 {event.location}
                    </Text>
                  )}
                  {event.description && (
                    <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1" numberOfLines={2}>
                      {event.description}
                    </Text>
                  )}
                  {event.attendees.length > 0 && (
                    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-500 rounded-full items-center justify-center shadow-lg"
        onPress={() => setShowCreateModal(true)}
        activeOpacity={0.85}
      >
        <Text className="text-white text-3xl leading-none">+</Text>
      </TouchableOpacity>

      {/* Create Event Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-gray-900 rounded-t-3xl p-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                New Event
              </Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text className="text-gray-500 text-xl">✕</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </Text>

            <View className="gap-y-3">
              <TextInput
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
                placeholder="Event title"
                placeholderTextColor="#9ca3af"
                value={newEventTitle}
                onChangeText={setNewEventTitle}
                autoFocus
              />
              <TextInput
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
                placeholder="Description (optional)"
                placeholderTextColor="#9ca3af"
                value={newEventDesc}
                onChangeText={setNewEventDesc}
                multiline
                numberOfLines={3}
              />
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-base text-gray-700 dark:text-gray-300">All day</Text>
                <Switch
                  value={newEventAllDay}
                  onValueChange={setNewEventAllDay}
                  trackColor={{ true: '#3b82f6' }}
                />
              </View>
            </View>

            <TouchableOpacity
              className={`bg-primary-500 rounded-xl py-4 items-center mt-4 ${createMutation.isPending ? 'opacity-70' : ''}`}
              onPress={() => {
                if (!newEventTitle.trim()) {
                  Alert.alert('Error', 'Please enter an event title');
                  return;
                }
                createMutation.mutate();
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Create Event</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
