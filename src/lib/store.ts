import { create } from "zustand";
import {
  DEFAULT_SETTINGS,
  buildDayReport,
  calculateWorkedMinutes,
  monthReport,
  weekReport,
} from "./calculator";
import {
  deleteWorkLog,
  getCarryOvers,
  getLeaveRecords,
  getSettings,
  getWorkLogs,
  saveSettings,
  upsertWorkLog,
} from "./db";
import { clockTimeSeconds, hmToMinutes, mondayOf, nowHm, todayIso } from "./time";
import type { CarryOver, LeaveRecord, Settings, WorkLog } from "./types";

let logWriteQueue: Promise<void> = Promise.resolve();

interface AppState {
  settings: Settings;
  logs: WorkLog[];
  leaves: LeaveRecord[];
  carryOvers: CarryOver[];
  todayDate: string;
  isLoading: boolean;
  load: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  saveLog: (
    log: Partial<WorkLog> & {
      date: string;
      checkIn?: string | null;
      checkOut?: string | null;
      note?: string;
    },
  ) => Promise<void>;
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
  saveLog(log) {
    const write = logWriteQueue.then(async () => {
      const current = get();
      const existing = current.logs.find((item) => item.date === log.date);
      if (log.checkInSource === "AUTO_START" && existing?.checkIn) return;
      const automatic = log.checkInSource === "AUTO_NOTIFICATION" || log.checkOutSource === "AUTO_NOTIFICATION";
      if (automatic && existing?.checkOut && existing.checkOutSource !== "AUTO_NOTIFICATION") return;

      const keepManualStart = automatic && existing?.checkInSource === "MANUAL" && !!existing.checkIn;
      const checkIn = keepManualStart ? existing.checkIn : log.checkIn ?? null;
      let checkOut = log.checkOut ?? null;
      if (automatic && existing?.checkOutSource === "AUTO_NOTIFICATION" && existing.checkOut &&
          (!checkOut || (clockTimeSeconds(existing.checkOut) ?? -1) > (clockTimeSeconds(checkOut) ?? -1))) checkOut = existing.checkOut;
      if (automatic && checkIn && checkOut &&
          (clockTimeSeconds(checkOut) ?? -1) <= (clockTimeSeconds(checkIn) ?? Infinity)) checkOut = null;
      const workedMinutes = automatic
        ? checkIn && checkOut ? (calculateWorkedMinutes(checkIn, checkOut, current.settings) ?? 0) : 0
        : log.workedMinutes ?? 0;

      const normalized: WorkLog = {
        id: existing?.id ?? Date.now(),
        date: log.date,
        checkIn,
        checkInSource: checkIn ? (keepManualStart ? "MANUAL" : log.checkInSource ?? "MANUAL") : null,
        checkOut,
        checkOutSource: checkOut ? (automatic ? "AUTO_NOTIFICATION" : log.checkOutSource ?? "MANUAL") : null,
        workedMinutes,
        requiredMinutes: log.requiredMinutes ?? existing?.requiredMinutes ?? null,
        note: log.note ?? existing?.note ?? "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await upsertWorkLog(normalized);
      set({ logs: await getWorkLogs() });
    });
    logWriteQueue = write.catch(() => undefined);
    return write;
  },
  async deleteLog(date: string) {
    await deleteWorkLog(date);
    set((state) => ({ logs: state.logs.filter((log) => log.date !== date) }));
  },
}));

export function getDashboardData(
  date: string,
  logs: WorkLog[],
  leaves: LeaveRecord[],
  carryOvers: CarryOver[],
  settings: Settings,
) {
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
