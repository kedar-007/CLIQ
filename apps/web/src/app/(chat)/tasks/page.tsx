'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format,
  isToday,
  isThisWeek,
  isPast,
  parseISO,
  isFuture,
  startOfDay,
  addDays,
} from 'date-fns';
import { Plus, X, CheckCircle2, Circle, Calendar, User, Flag } from 'lucide-react';
import { cn, fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Task, TaskStatus, TaskPriority, User as UserType } from '@comms/types';

type Tab = 'my-tasks' | 'team' | 'board';

const BOARD_COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'TODO', label: 'Backlog', color: 'bg-gray-500' },
  { id: 'TODO', label: 'Todo', color: 'bg-blue-500' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-yellow-500' },
  { id: 'IN_PROGRESS', label: 'Review', color: 'bg-purple-500' },
  { id: 'DONE', label: 'Done', color: 'bg-green-500' },
];

const BOARD_STAGES = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'] as const;
type BoardStage = typeof BOARD_STAGES[number];

const STATUS_TO_STAGE: Record<TaskStatus, BoardStage> = {
  TODO: 'Todo',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
  CANCELLED: 'Backlog',
};

const STAGE_TO_STATUS: Record<BoardStage, TaskStatus> = {
  Backlog: 'TODO',
  Todo: 'TODO',
  'In Progress': 'IN_PROGRESS',
  Review: 'IN_PROGRESS',
  Done: 'DONE',
};

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; dotClass: string; chipClass: string }
> = {
  URGENT: {
    label: 'Urgent',
    dotClass: 'bg-red-500',
    chipClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  HIGH: {
    label: 'High',
    dotClass: 'bg-orange-500',
    chipClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  MEDIUM: {
    label: 'Medium',
    dotClass: 'bg-blue-500',
    chipClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  LOW: {
    label: 'Low',
    dotClass: 'bg-gray-400',
    chipClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
};

interface TaskWithStage extends Task {
  boardStage?: BoardStage;
}

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<Tab>('my-tasks');
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [boardTasks, setBoardTasks] = useState<Record<BoardStage, Task[]>>({
    Backlog: [],
    Todo: [],
    'In Progress': [],
    Review: [],
    Done: [],
  });
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignee: '',
    priority: 'MEDIUM' as TaskPriority,
    dueDate: '',
  });

  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: myTasksData, isLoading: myTasksLoading } = useQuery({
    queryKey: ['tasks', 'my'],
    queryFn: async () => {
      const res = await fetchApi<{ success: boolean; data: Task[] }>(
        `/api/tasks?assignee=${user?.id}`
      );
      return res.data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: teamTasksData, isLoading: teamTasksLoading } = useQuery({
    queryKey: ['tasks', 'team'],
    queryFn: async () => {
      const res = await fetchApi<{ success: boolean; data: Task[] }>('/api/tasks');
      return res.data ?? [];
    },
    onSuccess: (data: Task[]) => {
      const grouped: Record<BoardStage, Task[]> = {
        Backlog: [],
        Todo: [],
        'In Progress': [],
        Review: [],
        Done: [],
      };
      data.forEach((task) => {
        const stage = STATUS_TO_STAGE[task.status] ?? 'Todo';
        grouped[stage].push(task);
      });
      setBoardTasks(grouped);
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      status,
    }: {
      taskId: string;
      status: TaskStatus;
    }) => {
      return fetchApi(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: typeof newTask) => {
      return fetchApi('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskData.title,
          description: taskData.description,
          priority: taskData.priority,
          assigneeIds: taskData.assignee ? [taskData.assignee] : [],
          dueAt: taskData.dueDate ? new Date(taskData.dueDate).toISOString() : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowTaskDialog(false);
      setNewTask({
        title: '',
        description: '',
        assignee: '',
        priority: 'MEDIUM',
        dueDate: '',
      });
    },
  });

  const moveBoardTask = (taskId: string, toStage: BoardStage) => {
    setBoardTasks((prev) => {
      const newBoard = { ...prev };
      let movedTask: Task | null = null;
      for (const stage of BOARD_STAGES) {
        const idx = newBoard[stage].findIndex((t) => t.id === taskId);
        if (idx !== -1) {
          movedTask = newBoard[stage][idx];
          newBoard[stage] = newBoard[stage].filter((t) => t.id !== taskId);
          break;
        }
      }
      if (movedTask) {
        newBoard[toStage] = [...newBoard[toStage], movedTask];
        const newStatus = STAGE_TO_STATUS[toStage];
        toggleTaskMutation.mutate({ taskId, status: newStatus });
      }
      return newBoard;
    });
  };

  const myTasks = myTasksData ?? [];

  const todayTasks = myTasks.filter(
    (t) => t.dueAt && isToday(parseISO(t.dueAt instanceof Date ? t.dueAt.toISOString() : String(t.dueAt))) && t.status !== 'DONE'
  );
  const thisWeekTasks = myTasks.filter(
    (t) =>
      t.dueAt &&
      !isToday(parseISO(String(t.dueAt))) &&
      isThisWeek(parseISO(String(t.dueAt)), { weekStartsOn: 1 }) &&
      t.status !== 'DONE'
  );
  const laterTasks = myTasks.filter(
    (t) =>
      t.dueAt &&
      !isToday(parseISO(String(t.dueAt))) &&
      !isThisWeek(parseISO(String(t.dueAt)), { weekStartsOn: 1 }) &&
      isFuture(parseISO(String(t.dueAt))) &&
      t.status !== 'DONE'
  );
  const noDateTasks = myTasks.filter((t) => !t.dueAt && t.status !== 'DONE');
  const completedTasks = myTasks.filter((t) => t.status === 'DONE');

  const renderTaskRow = (task: Task) => {
    const isDone = task.status === 'DONE';
    const priority = PRIORITY_CONFIG[task.priority];
    const dueDate = task.dueAt ? parseISO(String(task.dueAt)) : null;
    const isOverdue = dueDate && isPast(dueDate) && !isDone;

    return (
      <div
        key={task.id}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 rounded-lg group transition-colors"
      >
        <button
          onClick={() =>
            toggleTaskMutation.mutate({
              taskId: task.id,
              status: isDone ? 'TODO' : 'DONE',
            })
          }
          className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          {isDone ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        <div
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            priority.dotClass
          )}
        />

        <span
          className={cn(
            'flex-1 text-sm text-foreground',
            isDone && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </span>

        {task.assignees && task.assignees.length > 0 && (
          <div className="flex -space-x-1">
            {task.assignees.slice(0, 3).map((assignee) => (
              <div
                key={assignee.id}
                className="w-6 h-6 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-xs font-medium"
                title={assignee.name}
              >
                {assignee.avatarUrl ? (
                  <img
                    src={assignee.avatarUrl}
                    alt={assignee.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  assignee.name.charAt(0).toUpperCase()
                )}
              </div>
            ))}
          </div>
        )}

        {dueDate && (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              isOverdue
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {format(dueDate, 'MMM d')}
          </span>
        )}
      </div>
    );
  };

  const renderTaskGroup = (label: string, tasks: Task[]) => {
    if (tasks.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 mb-2">
          {label} ({tasks.length})
        </h3>
        <div className="space-y-0.5">{tasks.map(renderTaskRow)}</div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h1 className="text-xl font-bold text-foreground">Tasks</h1>
          <button
            onClick={() => setShowTaskDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-0 border-b border-border px-6">
          {(
            [
              { id: 'my-tasks', label: 'My Tasks' },
              { id: 'team', label: 'Team' },
              { id: 'board', label: 'Board' },
            ] as { id: Tab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {/* My Tasks Tab */}
          {activeTab === 'my-tasks' && (
            <div className="p-6">
              {myTasksLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : myTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-medium">No tasks assigned to you</p>
                  <p className="text-sm mt-1">Create a new task to get started</p>
                </div>
              ) : (
                <>
                  {renderTaskGroup('Today', todayTasks)}
                  {renderTaskGroup('This Week', thisWeekTasks)}
                  {renderTaskGroup('Later', laterTasks)}
                  {renderTaskGroup('No Due Date', noDateTasks)}
                  {renderTaskGroup('Completed', completedTasks)}
                </>
              )}
            </div>
          )}

          {/* Team Tab */}
          {activeTab === 'team' && (
            <div className="p-6">
              {teamTasksLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (teamTasksData ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <div className="text-4xl mb-3">👥</div>
                  <p className="font-medium">No team tasks yet</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {(teamTasksData ?? []).map(renderTaskRow)}
                </div>
              )}
            </div>
          )}

          {/* Board Tab */}
          {activeTab === 'board' && (
            <div className="flex gap-4 p-6 overflow-x-auto min-h-[calc(100vh-140px)]">
              {BOARD_STAGES.map((stage) => {
                const stageTasks = boardTasks[stage];
                const stageColor = BOARD_COLUMNS.find((c) => c.label === stage)?.color ?? 'bg-gray-500';
                return (
                  <div
                    key={stage}
                    className="flex-shrink-0 w-72 flex flex-col"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragTaskId) {
                        moveBoardTask(dragTaskId, stage);
                        setDragTaskId(null);
                      }
                    }}
                  >
                    {/* Column Header */}
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <div className={cn('w-2.5 h-2.5 rounded-full', stageColor)} />
                      <span className="text-sm font-semibold text-foreground">{stage}</span>
                      <span className="ml-auto text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {stageTasks.length}
                      </span>
                    </div>

                    {/* Task Cards */}
                    <div className="flex-1 space-y-2 min-h-[40px]">
                      {stageTasks.map((task) => {
                        const priority = PRIORITY_CONFIG[task.priority];
                        const dueDate = task.dueAt ? parseISO(String(task.dueAt)) : null;
                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={() => setDragTaskId(task.id)}
                            onDragEnd={() => setDragTaskId(null)}
                            className={cn(
                              'bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow',
                              dragTaskId === task.id && 'opacity-50'
                            )}
                          >
                            <p className="text-sm font-medium text-foreground mb-2 line-clamp-2">
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  'text-xs px-1.5 py-0.5 rounded font-medium',
                                  priority.chipClass
                                )}
                              >
                                {priority.label}
                              </span>
                              {dueDate && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Calendar className="w-3 h-3" />
                                  {format(dueDate, 'MMM d')}
                                </span>
                              )}
                              {task.assignees && task.assignees.length > 0 && (
                                <div className="ml-auto flex -space-x-1">
                                  {task.assignees.slice(0, 2).map((a) => (
                                    <div
                                      key={a.id}
                                      className="w-5 h-5 rounded-full bg-primary/20 border border-background flex items-center justify-center text-xs"
                                      title={a.name}
                                    >
                                      {a.avatarUrl ? (
                                        <img
                                          src={a.avatarUrl}
                                          alt={a.name}
                                          className="w-full h-full rounded-full object-cover"
                                        />
                                      ) : (
                                        a.name.charAt(0)
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Drop placeholder */}
                      {stageTasks.length === 0 && (
                        <div className="h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                          Drop tasks here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Task Dialog */}
      {showTaskDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowTaskDialog(false)}
          />
          <div className="relative bg-card rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-foreground">New Task</h2>
              <button
                onClick={() => setShowTaskDialog(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newTask.title.trim()) {
                  createTaskMutation.mutate(newTask);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Task title"
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Optional description"
                  value={newTask.description}
                  onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Priority
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask((p) => ({ ...p, priority: e.target.value as TaskPriority }))
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Assignee (User ID)
                </label>
                <input
                  type="text"
                  placeholder="Enter user ID"
                  value={newTask.assignee}
                  onChange={(e) => setNewTask((p) => ({ ...p, assignee: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowTaskDialog(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTaskMutation.isPending || !newTask.title.trim()}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
