'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
  startOfDay,
  getDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, X, MapPin, Clock, Users } from 'lucide-react';
import { cn, fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  type?: 'MEETING' | 'TASK' | 'REMINDER' | 'EXTERNAL';
  attendees?: { id: string; name: string; avatarUrl?: string }[];
  meetingLink?: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  MEETING: 'bg-blue-500',
  TASK: 'bg-purple-500',
  REMINDER: 'bg-yellow-500',
  EXTERNAL: 'bg-green-500',
  DEFAULT: 'bg-indigo-500',
};

const EVENT_BORDER_COLORS: Record<string, string> = {
  MEETING: 'border-blue-500',
  TASK: 'border-purple-500',
  REMINDER: 'border-yellow-500',
  EXTERNAL: 'border-green-500',
  DEFAULT: 'border-indigo-500',
};

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:00',
    attendees: '',
    location: '',
    description: '',
  });

  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['calendar-events', format(monthStart, 'yyyy-MM'), format(monthEnd, 'yyyy-MM')],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: calendarStart.toISOString(),
        end: calendarEnd.toISOString(),
      });
      const res = await fetchApi<{ success: boolean; data: CalendarEvent[] }>(
        `/api/calendar?${params}`
      );
      return res.data ?? [];
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (eventData: typeof newEvent) => {
      const startAt = new Date(`${eventData.date}T${eventData.startTime}:00`).toISOString();
      const endAt = new Date(`${eventData.date}T${eventData.endTime}:00`).toISOString();
      const attendeeEmails = eventData.attendees
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      return fetchApi('/api/calendar', {
        method: 'POST',
        body: JSON.stringify({
          title: eventData.title,
          description: eventData.description,
          location: eventData.location,
          startAt,
          endAt,
          isAllDay: false,
          attendeeEmails,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setShowEventDialog(false);
      setNewEvent({
        title: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '09:00',
        endTime: '10:00',
        attendees: '',
        location: '',
        description: '',
      });
    },
  });

  const events: CalendarEvent[] = eventsData ?? [];

  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return events.filter((evt) => isSameDay(parseISO(evt.startAt), day));
  };

  const selectedDayEvents = getEventsForDay(selectedDay);

  const prevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const nextMonth = () => setCurrentMonth((m) => addMonths(m, 1));

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-lg font-semibold min-w-[160px] text-center">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <button
                onClick={nextMonth}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => {
                setCurrentMonth(new Date());
                setSelectedDay(new Date());
              }}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => setShowEventDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Event
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
          {/* Week day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEK_DAYS.map((day) => (
              <div
                key={day}
                className="py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isDaySelected = isSameDay(day, selectedDay);
              const isDayToday = isToday(day);
              const visibleEvents = dayEvents.slice(0, 3);
              const moreCount = dayEvents.length - 3;

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    'min-h-[100px] p-2 border-b border-r border-border cursor-pointer transition-colors hover:bg-muted/50',
                    !isCurrentMonth && 'bg-muted/20',
                    idx % 7 === 6 && 'border-r-0',
                    calendarDays.length - idx <= 7 && 'border-b-0'
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span
                      className={cn(
                        'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors',
                        !isCurrentMonth && 'text-muted-foreground',
                        isDayToday && !isDaySelected && 'ring-2 ring-primary text-primary',
                        isDaySelected && 'bg-primary text-primary-foreground',
                        !isDayToday && !isDaySelected && isCurrentMonth && 'text-foreground'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {visibleEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className={cn(
                          'w-2 h-2 rounded-full inline-block mr-0.5',
                          EVENT_TYPE_COLORS[evt.type ?? 'DEFAULT']
                        )}
                        title={evt.title}
                      />
                    ))}
                    {visibleEvents.length > 0 && (
                      <div className="text-xs text-muted-foreground truncate">
                        {visibleEvents[0].title}
                        {visibleEvents.length > 1 && ` +${visibleEvents.length - 1}`}
                      </div>
                    )}
                    {moreCount > 0 && (
                      <div className="text-xs text-muted-foreground">+{moreCount} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Events */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">
            {isToday(selectedDay) ? 'Today' : format(selectedDay, 'EEEE, MMMM d')}
            {selectedDayEvents.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? 's' : ''})
              </span>
            )}
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : selectedDayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <div className="text-4xl mb-3">📅</div>
              <p className="font-medium">No events for this day</p>
              <p className="text-sm mt-1">Click "New Event" to schedule something</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayEvents
                .sort(
                  (a, b) =>
                    new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
                )
                .map((evt) => (
                  <div
                    key={evt.id}
                    className={cn(
                      'flex gap-4 p-4 rounded-lg border-l-4 bg-muted/40 hover:bg-muted/60 transition-colors',
                      EVENT_BORDER_COLORS[evt.type ?? 'DEFAULT']
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">{evt.title}</h3>
                      <div className="flex flex-wrap gap-3 mt-1.5">
                        {!evt.isAllDay && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              {format(parseISO(evt.startAt), 'h:mm a')} –{' '}
                              {format(parseISO(evt.endAt), 'h:mm a')}
                            </span>
                          </div>
                        )}
                        {evt.isAllDay && (
                          <span className="text-sm text-muted-foreground">All day</span>
                        )}
                        {evt.location && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[200px]">{evt.location}</span>
                          </div>
                        )}
                        {evt.attendees && evt.attendees.length > 0 && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Users className="w-3.5 h-3.5" />
                            <span>
                              {evt.attendees.length} attendee
                              {evt.attendees.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                      {evt.description && (
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                          {evt.description}
                        </p>
                      )}
                    </div>
                    {evt.meetingLink && (
                      <a
                        href={evt.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 self-start px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                      >
                        Join
                      </a>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* New Event Dialog */}
      {showEventDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowEventDialog(false)}
          />
          <div className="relative bg-card rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-foreground">New Event</h2>
              <button
                onClick={() => setShowEventDialog(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newEvent.title.trim()) {
                  createEventMutation.mutate(newEvent);
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
                  placeholder="Event title"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Date</label>
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={newEvent.startTime}
                    onChange={(e) =>
                      setNewEvent((prev) => ({ ...prev, startTime: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={newEvent.endTime}
                    onChange={(e) =>
                      setNewEvent((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  placeholder="Add location or meeting link"
                  value={newEvent.location}
                  onChange={(e) =>
                    setNewEvent((prev) => ({ ...prev, location: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Attendees
                </label>
                <input
                  type="text"
                  placeholder="Comma-separated emails"
                  value={newEvent.attendees}
                  onChange={(e) =>
                    setNewEvent((prev) => ({ ...prev, attendees: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Optional description"
                  value={newEvent.description}
                  onChange={(e) =>
                    setNewEvent((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEventDialog(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createEventMutation.isPending || !newEvent.title.trim()}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createEventMutation.isPending ? 'Creating...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
