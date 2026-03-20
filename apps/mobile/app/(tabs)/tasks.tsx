import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isToday, isThisWeek, isPast } from 'date-fns';
import api from '@/lib/api';
import type { Task, TaskPriority, TaskStatus, User } from '@comms/types';

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW: 'bg-gray-200 text-gray-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

type TaskGroup = 'Today' | 'This Week' | 'Later' | 'Completed';

function groupTasks(tasks: Task[]): Record<TaskGroup, Task[]> {
  const groups: Record<TaskGroup, Task[]> = {
    Today: [],
    'This Week': [],
    Later: [],
    Completed: [],
  };

  for (const task of tasks) {
    if (task.status === 'DONE' || task.status === 'CANCELLED') {
      groups.Completed.push(task);
    } else if (!task.dueAt) {
      groups.Later.push(task);
    } else {
      const due = new Date(task.dueAt);
      if (isToday(due)) groups.Today.push(task);
      else if (isThisWeek(due)) groups['This Week'].push(task);
      else groups.Later.push(task);
    }
  }

  return groups;
}

interface TaskItemProps {
  task: Task;
  onToggle: (id: string, done: boolean) => void;
}

function TaskItem({ task, onToggle }: TaskItemProps) {
  const isDone = task.status === 'DONE' || task.status === 'CANCELLED';
  const isOverdue = task.dueAt && isPast(new Date(task.dueAt)) && !isDone;
  const assignee = task.assignees?.[0];
  const assigneeInitials = (assignee?.name ?? '?').slice(0, 2).toUpperCase();

  return (
    <TouchableOpacity
      className="flex-row items-start px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
      activeOpacity={0.7}
    >
      {/* Checkbox */}
      <TouchableOpacity
        className={`w-5 h-5 rounded border-2 mr-3 mt-0.5 items-center justify-center ${
          isDone ? 'bg-primary-500 border-primary-500' : 'border-gray-400 dark:border-gray-600'
        }`}
        onPress={() => onToggle(task.id, !isDone)}
      >
        {isDone && <Text className="text-white text-xs">✓</Text>}
      </TouchableOpacity>

      {/* Content */}
      <View className="flex-1 min-w-0">
        <Text
          className={`text-base ${
            isDone
              ? 'line-through text-gray-400 dark:text-gray-600'
              : 'text-gray-900 dark:text-white'
          }`}
          numberOfLines={2}
        >
          {task.title}
        </Text>

        <View className="flex-row items-center gap-x-2 mt-1 flex-wrap">
          {/* Priority badge */}
          <View className={`px-2 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority]}`}>
            <Text className="text-xs font-medium">{task.priority}</Text>
          </View>

          {/* Due date */}
          {task.dueAt && (
            <Text
              className={`text-xs ${
                isOverdue
                  ? 'text-red-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {format(new Date(task.dueAt), 'MMM d')}
            </Text>
          )}
        </View>
      </View>

      {/* Assignee avatar */}
      {assignee && (
        <View className="ml-2">
          {assignee.avatarUrl ? (
            <Image
              source={{ uri: assignee.avatarUrl }}
              className="w-7 h-7 rounded-full"
            />
          ) : (
            <View className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-700 items-center justify-center">
              <Text className="text-gray-600 dark:text-gray-300 text-xs font-semibold">
                {assigneeInitials}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function TasksScreen() {
  const [activeTab, setActiveTab] = useState<'my' | 'team'>('my');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('MEDIUM');
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', activeTab],
    queryFn: async () => {
      const endpoint = activeTab === 'my' ? '/tasks/my' : '/tasks/team';
      const res = await api.get<{ data: Task[] }>(endpoint);
      return res.data.data ?? [];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const status: TaskStatus = done ? 'DONE' : 'TODO';
      return api.patch(`/tasks/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return api.post('/tasks', {
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        status: 'TODO',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowCreateModal(false);
      setNewTaskTitle('');
      setNewTaskPriority('MEDIUM');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create task');
    },
  });

  const grouped = groupTasks(tasks);
  const groupOrder: TaskGroup[] = ['Today', 'This Week', 'Later', 'Completed'];

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-4 pt-2 pb-0 border-b border-gray-100 dark:border-gray-800">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Tasks</Text>
        {/* Tabs */}
        <View className="flex-row gap-x-4">
          {(['my', 'team'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              className={`pb-3 border-b-2 ${activeTab === tab ? 'border-primary-500' : 'border-transparent'}`}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                className={`text-sm font-semibold ${
                  activeTab === tab
                    ? 'text-primary-500'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {tab === 'my' ? 'My Tasks' : 'Team Tasks'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <ScrollView className="flex-1">
          {groupOrder.map((group) => {
            const groupTasks = grouped[group];
            if (groupTasks.length === 0) return null;
            return (
              <View key={group}>
                <View className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50">
                  <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {group} ({groupTasks.length})
                  </Text>
                </View>
                {groupTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={(id, done) => toggleMutation.mutate({ id, done })}
                  />
                ))}
              </View>
            );
          })}

          {tasks.length === 0 && (
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-4xl mb-3">✅</Text>
              <Text className="text-base text-gray-500 dark:text-gray-400">
                No tasks yet. Create one!
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-14 h-14 bg-primary-500 rounded-full items-center justify-center shadow-lg"
        onPress={() => setShowCreateModal(true)}
        activeOpacity={0.85}
      >
        <Text className="text-white text-3xl leading-none">+</Text>
      </TouchableOpacity>

      {/* Create Task Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-gray-900 rounded-t-3xl p-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-gray-900 dark:text-white">New Task</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text className="text-gray-500 text-xl">✕</Text>
              </TouchableOpacity>
            </View>

            <View className="gap-y-3">
              <TextInput
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
                placeholder="Task title"
                placeholderTextColor="#9ca3af"
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                autoFocus
              />

              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Priority
                </Text>
                <View className="flex-row gap-x-2">
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map((p) => (
                    <TouchableOpacity
                      key={p}
                      className={`flex-1 py-2 rounded-xl border items-center ${
                        newTaskPriority === p
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                      onPress={() => setNewTaskPriority(p)}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          newTaskPriority === p ? 'text-white' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {p}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <TouchableOpacity
              className={`bg-primary-500 rounded-xl py-4 items-center mt-4 ${createMutation.isPending ? 'opacity-70' : ''}`}
              onPress={() => {
                if (!newTaskTitle.trim()) {
                  Alert.alert('Error', 'Please enter a task title');
                  return;
                }
                createMutation.mutate();
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Create Task</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
