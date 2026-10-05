import { create } from 'zustand';
import { DEFAULT_SETTINGS, buildDayReport, monthReport, weekReport } from './calculator';
import { deleteWorkLog, getCarryOvers, getLeaveRecords, getSettings, getWorkLogs, saveSettings, upsertWorkLog } from './db';
import { hmToMinutes, mondayOf, nowHm, todayIso } from './time';
import type { CarryOver, LeaveRecord, Settings, WorkLog } from './types';

interface AppState {
  settings: Settings;
  logs: WorkLog[];
  leaves: LeaveRecord[];
  carryOvers: CarryOver[];
  todayDate: string;
  isLoading: boolean;
  load: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  saveLog: (log: Partial<WorkLog> & { date: string; checkIn?: string | null; checkOut?: string | null; note?: string }) => Promise<void>;
  deleteLog: (date: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  logs: [],
  leaves: [],
  carryOvers: [],
  todayDate: todayIso(),
  isLoading: true,
  async load() {
    set({ isLoading: true });
    const [settings, logs, leaves, carryOvers] = await Promise.all([
      getSettings(),
      getWorkLogs(),
      getLeaveRecords(),
      getCarryOvers(),
    ]);

    set({ settings, logs, leaves, carryOvers, isLoading: false });
  },
  async saveSettings(settings: Settings) {
    await saveSettings(settings);
    set({ settings });
  },
  async saveLog(log) {
    const current = get();
    const checkIn = log.checkIn ?? null;
    const checkOut = log.checkOut ?? null;
    const workedMinutes = log.workedMinutes ?? (checkIn && checkOut ? 0 : 0);
    const date = log.date;

    const normalized: WorkLog = {
      id: current.logs.find((item) => item.date === date)?.id ?? Date.now(),
      date,
      checkIn,
      checkOut,
      workedMinutes,
      requiredMinutes: null,
      note: log.note ?? '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertWorkLog(normalized);
    const next = await getWorkLogs();
    set({ logs: next });
  },
  async deleteLog(date: string) {
    await deleteWorkLog(date);
    set((state) => ({ logs: state.logs.filter((log) => log.date !== date) }));
  },
}));

export function getDashboardData(date: string, logs: WorkLog[], leaves: LeaveRecord[], carryOvers: CarryOver[], settings: Settings) {
  const log = logs.find((item) => item.date === date) ?? undefined;
  const nowMinutes = hmToMinutes(nowHm()) ?? 0;

  const todayReport = buildDayReport({
    date,
    log,
    leaveMinutes: leaves.find((leave) => leave.date === date)?.minutes ?? 0,
    settings,
    weekendDays: [0, 6],
    today: todayIso(),
    nowMinutes,
  });

  const monday = mondayOf(date);
  const week = weekReport({
    monday,
    logs,
    leaves,
    carryOvers,
    settings,
    weekendDays: [0, 6],
    today: todayIso(),
    nowMinutes,
  });

  const month = monthReport({
    monthKey: date.slice(0, 7),
    logs,
    leaves,
    carryOvers,
    settings,
    weekendDays: [0, 6],
    today: todayIso(),
    nowMinutes,
  });

  return { todayReport, week, month, monday };
}
