import { ArrowLeft, Bell, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { formatIndianDate, getTodayIso } from '../domain/calculations';
import { dispatchLocalNotification, requestLocalNotificationPermission } from '../hooks/usePWA';

export const TasksRemindersScreen: React.FC = () => {
  const {
    animals,
    farmTasks,
    reminders,
    settings,
    saveSettings,
    upsertTask,
    toggleTaskComplete,
    deleteTask,
    addCustomReminder,
    dismissReminder,
    navigate,
    notify,
  } = useFarm();

  const [tab, setTab] = useState<'tasks' | 'reminders'>('tasks');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE' | 'COMPLETED'>('ALL');
  const today = getTodayIso();

  // Task Form
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [dueTime, setDueTime] = useState('07:00');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [animalId, setAnimalId] = useState('');

  // Custom Reminder Form
  const [remTitle, setRemTitle] = useState('');
  const [remMessage, setRemMessage] = useState('');
  const [remDate, setRemDate] = useState(today);
  const [remAnimalId, setRemAnimalId] = useState('');

  const animalMap = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  const filteredTasks = useMemo(() => {
    return farmTasks
      .filter((t) => {
        const isOverdue = t.status === 'PENDING' && t.dueDate < today;
        if (filter === 'PENDING') return t.status === 'PENDING';
        if (filter === 'OVERDUE') return isOverdue;
        if (filter === 'COMPLETED') return t.status === 'COMPLETED';
        return true;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [farmTasks, filter, today]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      notify('Task title is required.', 'error');
      return;
    }
    await upsertTask({
      title: title.trim(),
      description: desc.trim() || undefined,
      dueDate,
      dueTime: dueTime || undefined,
      priority,
      status: 'PENDING',
      animalId: animalId || undefined,
    });
    setTitle('');
    setDesc('');
    notify('Added farm task.');
  };

  const handleCreateCustomReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim()) {
      notify('Reminder title is required.', 'error');
      return;
    }
    await addCustomReminder({
      category: 'CUSTOM',
      title: remTitle.trim(),
      message: remMessage.trim() || 'Scheduled farm reminder',
      triggerDate: remDate,
      animalId: remAnimalId || undefined,
    });
    setRemTitle('');
    setRemMessage('');
    notify('Scheduled custom local reminder.');
  };

  const handleEnableBrowserNotifications = async () => {
    const perm = await requestLocalNotificationPermission();
    if (perm === 'granted') {
      await saveSettings({ notificationsEnabled: true });
      await dispatchLocalNotification(
        'DairyTrack Local Reminders Enabled',
        'Vaccination, calving, stock, and task alerts will notify offline on this phone.',
        'dairytrack-test'
      );
      notify('Local notifications enabled and verified!');
    } else {
      notify('Notification permission was not granted by browser settings.', 'error');
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ name: 'more' })}
            className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-stone-900">Tasks & Local Notifications</h1>
            <p className="text-sm text-stone-600">
              Daily barn tasks and deduplicated offline reminders for vaccines, calving, vet visits, and stock.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setTab('tasks')}
            className={`min-h-[38px] rounded-lg px-3.5 text-xs font-semibold transition-colors ${
              tab === 'tasks' ? 'bg-[#1B4D3E] text-white' : 'text-stone-600'
            }`}
          >
            Tasks ({farmTasks.filter((t) => t.status === 'PENDING').length})
          </button>
          <button
            type="button"
            onClick={() => setTab('reminders')}
            className={`min-h-[38px] rounded-lg px-3.5 text-xs font-semibold transition-colors ${
              tab === 'reminders' ? 'bg-[#1B4D3E] text-white' : 'text-stone-600'
            }`}
          >
            Reminders ({reminders.length})
          </button>
        </div>
      </div>

      {tab === 'tasks' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleCreateTask}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <h2 className="text-base font-bold text-stone-900">Add Farm Task</h2>

            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title (e.g. Deworm calves, Clean water trough) *"
              className="min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Due Date *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Time</label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Priority</label>
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Related Animal</label>
                <select
                  value={animalId}
                  onChange={(e) => setAnimalId(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      Tag #{a.tagNumber}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description or instructions"
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              <Plus className="h-4 w-4" />
              Save Task
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-stone-900">Farm Tasks</h2>
              <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1">
                {(['ALL', 'PENDING', 'OVERDUE', 'COMPLETED'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`min-h-[30px] rounded-md px-2.5 text-xs font-semibold ${
                      filter === f ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-600'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No tasks match the current filter.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {filteredTasks.map((task) => {
                  const isOverdue = task.status === 'PENDING' && task.dueDate < today;
                  const a = task.animalId ? animalMap.get(task.animalId) : undefined;
                  return (
                    <li key={task.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <button
                        type="button"
                        onClick={() => toggleTaskComplete(task.id)}
                        className="flex min-h-[44px] flex-1 items-center gap-3 text-left"
                      >
                        {task.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B4D3E]" />
                        ) : (
                          <Circle className="h-5 w-5 shrink-0 text-stone-400" />
                        )}
                        <div>
                          <p
                            className={`font-semibold ${
                              task.status === 'COMPLETED'
                                ? 'line-through text-stone-400'
                                : 'text-stone-900'
                            }`}
                          >
                            {task.title}
                          </p>
                          <p className="font-mono text-xs text-stone-500 tabular-nums">
                            {isOverdue ? 'OVERDUE · ' : ''}
                            {formatIndianDate(task.dueDate)}
                            {task.dueTime ? ` ${task.dueTime}` : ''} · {task.priority}
                            {a ? ` · Tag #${a.tagNumber}` : ''}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        aria-label="Delete task"
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center text-stone-400 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'reminders' && (
        <div className="space-y-5">
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200/90 bg-white p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Offline Device Notification Permission
              </h2>
              <p className="mt-0.5 text-xs text-stone-600">
                Reminders are generated locally from your vaccination due dates, expected calvings, vet follow-ups, medicine expiry, and low stock without requiring internet.
              </p>
            </div>
            <button
              type="button"
              onClick={handleEnableBrowserNotifications}
              className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl bg-[#1B4D3E] px-4 text-xs font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
            >
              <Bell className="h-4 w-4" />
              {settings.notificationsEnabled
                ? 'Verify / Test Notification'
                : 'Enable Notifications'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <form
              onSubmit={handleCreateCustomReminder}
              className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
            >
              <h2 className="text-base font-bold text-stone-900">Create Custom Reminder</h2>
              <input
                type="text"
                required
                value={remTitle}
                onChange={(e) => setRemTitle(e.target.value)}
                placeholder="Reminder Title *"
                className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
              <input
                type="date"
                value={remDate}
                onChange={(e) => setRemDate(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
              <select
                value={remAnimalId}
                onChange={(e) => setRemAnimalId(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                <option value="">— Optional Related Animal —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={remMessage}
                onChange={(e) => setRemMessage(e.target.value)}
                placeholder="Reminder message"
                className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
              <button
                type="submit"
                className="min-h-[46px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
              >
                Schedule Reminder
              </button>
            </form>

            <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
              <h2 className="text-base font-bold text-stone-900">
                Active Scheduled Reminders ({reminders.length})
              </h2>
              {reminders.length === 0 ? (
                <p className="mt-6 text-sm text-stone-500">
                  No active reminders triggered right now.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-stone-100">
                  {reminders.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-stone-900">{r.title}</p>
                        <p className="text-xs text-stone-600">{r.message}</p>
                        <p className="font-mono text-[11px] text-stone-500 tabular-nums">
                          {r.category.replace(/_/g, ' ')} · Trigger {formatIndianDate(r.triggerDate)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissReminder(r.id)}
                        className="min-h-[36px] shrink-0 rounded-lg border border-stone-200 px-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                      >
                        Dismiss
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
