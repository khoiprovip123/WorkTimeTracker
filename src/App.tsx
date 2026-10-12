declare const __APP_VERSION__: string;

import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import CalendarTab from "./components/CalendarTab";
import DashboardTab from "./components/DashboardTab";
import DesignTab from "./components/DesignTab";
import RocketChatConnection from "./components/RocketChatConnection";
import { attendanceNotificationTime, type RocketChatNotificationMessage } from "./lib/rocket-chat";
import SettingsTab from "./components/SettingsTab";
import {
  calculateLateMinutes,
  calculateWorkedMinutes,
  isDailyTargetMet,
  projectCheckout,
} from "./lib/calculator";
import { getDashboardData, useAppStore } from "./lib/store";
import {
  formatMinutes,
  formatViDate,
  hmToMinutes,
  minutesToHm,
  nowHm,
  todayIso,
} from "./lib/time";

const GITHUB_RELEASE_REPO = "khoiprovip123/WorkTimeTracker";
type AppView = "dashboard" | "calendar" | "settings" | "notifications" | "design";
const navigation: { id: AppView; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "calendar", label: "Lịch", icon: "▣" },
  { id: "notifications", label: "TMT Notify", icon: "◉" },
  { id: "settings", label: "Cài đặt", icon: "⚙" },
];

function formatDurationHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function parseVersion(value: string): number[] {
  return (value || "0.0.0")
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(local: string, remote: string): number {
  const left = parseVersion(local);
  const right = parseVersion(remote);
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

function detectRuntimePlatform(): "windows" | "linux" | "mac" | "other" {
  if (typeof navigator === "undefined") return "other";
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  if (userAgent.includes("mac")) return "mac";
  return "other";
}

function pickBestReleaseAsset(
  assets: Array<{ name?: string; browser_download_url?: string }> = [],
  platform: "windows" | "linux" | "mac" | "other",
) {
  const preferredPatterns: Record<
    "windows" | "linux" | "mac" | "other",
    string[]
  > = {
    windows: [".msi", ".exe"],
    linux: [".deb", ".appimage", ".rpm"],
    mac: [".dmg", ".zip"],
    other: [".deb", ".appimage", ".msi", ".exe", ".dmg", ".zip"],
  };

  const patterns = preferredPatterns[platform];
  const validAssets = assets.filter((item) => {
    const name = (item.name ?? "").toLowerCase();
    if (!patterns.some((pattern) => name.includes(pattern))) return false;
    if (
      name.includes(".xml") ||
      name.includes(".json") ||
      name.includes(".sig") ||
      name.includes(".txt")
    )
      return false;
    return Boolean(item.browser_download_url);
  });

  return validAssets[0]?.browser_download_url ?? "";
}

// function StatusBadge({ value }: { value: number }) {
//   if (value === 0) return <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">✓ Đủ giờ</span>;
//   if (value > 0) return <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">+ Dư {formatMinutes(value)}</span>;
//   return <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">⚠ Thiếu {formatMinutes(Math.abs(value))}</span>;
// }

export default function App() {
  const [today, setToday] = useState(todayIso);
  const {
    logs,
    leaves,
    carryOvers,
    settings,
    isLoading,
    load,
    saveLog,
    saveSettings,
    deleteLog,
  } = useAppStore();
  const [form, setForm] = useState(() => ({
    date: today,
    checkIn: nowHm(),
    checkOut: "17:30",
  }));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<RocketChatNotificationMessage[]>([]);
  const syncingAttendance = useRef(false);
  const autoStartedDates = useRef(new Set<string>());
  const [attendanceSyncRevision, setAttendanceSyncRevision] = useState(0);
  const [liveNow, setLiveNow] = useState(Date.now());
  const [view, setView] = useState<AppView>("dashboard");
  const [designDirty, setDesignDirty] = useState(false);
  const [menuCollapsed, setMenuCollapsed] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem("app-menu-collapsed") === "true",
  );

  useEffect(() => {
    window.localStorage.setItem("app-menu-collapsed", String(menuCollapsed));
  }, [menuCollapsed]);
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [appVersion, setAppVersion] = useState(__APP_VERSION__);
  const [updateStatus, setUpdateStatus] = useState<{
    state: "idle" | "checking" | "up-to-date" | "new-version" | "error";
    message: string;
    latestVersion?: string;
    downloadUrl?: string;
  }>({
    state: "idle",
    message: "Chưa kiểm tra phiên bản.",
  });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setToday(todayIso()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (isLoading || syncingAttendance.current || notificationHistory.length === 0) return;
    const attendance = notificationHistory
      .map(attendanceNotificationTime)
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const openPrevious = logs
      .filter((entry) => entry.date < today && entry.checkIn && !entry.checkOut)
      .sort((a, b) => a.date.localeCompare(b.date));
    const work = async () => {
      let changed = false;
      for (const entry of openPrevious) {
        const latest = attendance
          .filter((item) => item.date === entry.date && item.time > entry.checkIn!)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        if (!latest) continue;
        await saveLog({
          date: entry.date,
          checkIn: entry.checkIn,
          checkOut: latest.time,
          workedMinutes: calculateWorkedMinutes(entry.checkIn!, latest.time, settings) ?? 0,
          requiredMinutes: entry.requiredMinutes,
          note: entry.note,
        });
        changed = true;
      }
      const todayLog = logs.find((entry) => entry.date === today);
      if (!todayLog || (autoStartedDates.current.has(today) && !todayLog.checkOut)) {
        const first = attendance
          .filter((item) => item.date === today)
          .sort((a, b) => a.timestamp - b.timestamp)[0];
        if (first) {
          await saveLog({ date: today, checkIn: first.time, checkOut: null, workedMinutes: 0, requiredMinutes: null });
          autoStartedDates.current.delete(today);
          changed = true;
          setForm((previous) => ({ ...previous, date: today, checkIn: first.time, checkOut: "" }));
          setStatusMessage(`⏱️ TMT đã bắt đầu ca lúc ${first.time}.`);
        }
      }
      return changed;
    };
    syncingAttendance.current = true;
    void work().then((changed) => {
      if (changed) setAttendanceSyncRevision((value) => value + 1);
    }).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Không thể đồng bộ chấm công TMT.");
    }).finally(() => { syncingAttendance.current = false; });
  }, [isLoading, notificationHistory, logs, saveLog, settings, today, attendanceSyncRevision]);

  useEffect(() => {
    void getVersion()
      .then((version) => setAppVersion(version))
      .catch(() => setAppVersion(__APP_VERSION__));
  }, []);

  useEffect(() => {
    if (
      !logs.some(
        (entry) => entry.date === today && entry.checkIn && !entry.checkOut,
      )
    ) {
      return;
    }

    const intervalId = window.setInterval(() => setLiveNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [logs, today]);

  const dashboard = useMemo(
    () => getDashboardData(today, logs, leaves, carryOvers, settings),
    [today, logs, leaves, carryOvers, settings],
  );
  const currentLog = logs.find((entry) => entry.date === today);
  const activeSession =
    currentLog && currentLog.checkIn && !currentLog.checkOut
      ? currentLog
      : null;

  useEffect(() => {
    if (
      !settings.autoStartWorkSession ||
      isLoading ||
      currentLog ||
      activeSession
    )
      return;

    const startedAt = nowHm() || "08:00";
    autoStartedDates.current.add(today);
    void saveLog({
      date: today,
      checkIn: startedAt,
      checkOut: null,
      workedMinutes: 0,
      requiredMinutes: null,
    });
    setForm((prev) => ({
      ...prev,
      date: today,
      checkIn: startedAt,
      checkOut: "",
    }));
    setStatusMessage("⚙️ Tự động bắt đầu ca làm khi mở ứng dụng.");
  }, [
    activeSession,
    currentLog,
    isLoading,
    saveLog,
    settings.autoStartWorkSession,
    today,
  ]);

  const elapsedSeconds = useMemo(() => {
    if (!activeSession?.checkIn) return 0;
    const startedAt = Date.parse(`${today}T${activeSession.checkIn}:00`);
    if (Number.isNaN(startedAt)) return 0;

    const breakStart = Date.parse(
      `${today}T${minutesToHm(settings.morningEnd)}:00`,
    );
    const breakEnd = Date.parse(
      `${today}T${minutesToHm(settings.afternoonStart)}:00`,
    );
    const totalMs = Math.max(0, liveNow - startedAt);
    const excludedMs = Math.max(
      0,
      Math.min(liveNow, breakEnd) - Math.max(startedAt, breakStart),
    );
    return Math.max(0, Math.round((totalMs - excludedMs) / 1000));
  }, [
    activeSession,
    liveNow,
    settings.afternoonStart,
    settings.morningEnd,
    today,
  ]);
  const targetSeconds = (settings.dailyRequiredMinutes ?? 480) * 60;
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
  const progressPercent = activeSession
    ? Math.min(100, (elapsedSeconds / targetSeconds) * 100)
    : 0;

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
      return;

    const trayVisible = settings.showTrayIcon ?? true;
    void invoke("set_tray_visibility", { enabled: trayVisible });

    if (!trayVisible) return;

    if (!activeSession) {
      const title = settings.showTrayTitle ? "Idle" : "";
      void invoke("update_tray_status", {
        title,
        tooltip: "Work Time Tracker",
      });
      return;
    }

    const chartLength = 10;
    const percent = progressPercent || 0;
    const filled = Math.max(1, Math.min(chartLength, Math.round(percent / 10)));
    const bar = `${"█".repeat(filled)}${"░".repeat(chartLength - filled)} ${Math.round(percent)}%`;
    const title = settings.showTrayTitle
      ? formatDurationHms(elapsedSeconds)
      : "";
    const tooltip = settings.showTrayTitle ? `${title} | ${bar}` : bar;

    void invoke("update_tray_status", { title, tooltip });
  }, [
    activeSession,
    elapsedSeconds,
    progressPercent,
    settings.showTrayIcon,
    settings.showTrayTitle,
  ]);

  const late = calculateLateMinutes(
    currentLog?.checkIn ?? form.checkIn,
    settings,
  );
  const worked =
    calculateWorkedMinutes(form.checkIn, form.checkOut, settings) ?? 0;
  const targetCheckout = projectCheckout({
    checkIn: form.checkIn,
    requiredMinutes: 480,
    workedMinutes: worked,
    nowMinutes: hmToMinutes(nowHm()) ?? 0,
    layout: settings,
  });

  const dailyRequiredMinutes = settings.dailyRequiredMinutes ?? 480;
  const currentWorkedMinutes = activeSession
    ? Math.max(0, Math.round(elapsedSeconds / 60))
    : (currentLog?.workedMinutes ?? 0);
  const remainingTodayMinutes = dailyRequiredMinutes - currentWorkedMinutes;
  const todayStatus: "idle" | "working" | "complete" | "missing" = activeSession
    ? "working"
    : currentLog?.checkOut
      ? currentWorkedMinutes >= dailyRequiredMinutes
        ? "complete"
        : "missing"
      : "idle";

  const notifyIfFullDay = (minutes: number) => {
    if (isDailyTargetMet(minutes, settings)) {
      setStatusMessage("✅ Đủ 8h làm việc rồi!");
      window.alert("✅ Bạn đã làm đủ 8h hôm nay!");
    }
  };

  const handleStartWork = async () => {
    const startedAt = form.checkIn || nowHm() || "08:00";
    if (activeSession) {
      setStatusMessage("⚠️ Ca làm hôm nay đã bắt đầu rồi.");
      return;
    }

    const nextLog = {
      date: today,
      checkIn: startedAt,
      checkOut: null,
      workedMinutes: 0,
      requiredMinutes: null,
    };

    await saveLog(nextLog);
    setForm((prev) => ({
      ...prev,
      date: today,
      checkIn: startedAt,
      checkOut: "",
    }));
    setStatusMessage(`⏱️ Bắt đầu ca làm lúc ${startedAt}`);
    await load();
  };

  const handleFinishWork = async () => {
    const checkIn = currentLog?.checkIn ?? (form.checkIn || "08:00");
    const checkOut = nowHm() ?? "17:30";
    const minutes = calculateWorkedMinutes(checkIn, checkOut, settings) ?? 0;

    if (!checkIn) {
      setStatusMessage("⚠️ Chưa có giờ bắt đầu ca.");
      return;
    }

    await saveLog({
      date: today,
      checkIn,
      checkOut,
      workedMinutes: minutes,
      requiredMinutes: null,
    });

    setForm((prev) => ({ ...prev, date: today, checkIn, checkOut }));
    notifyIfFullDay(minutes);
    setStatusMessage(
      `⏹️ Kết thúc ca lúc ${checkOut}. Đã làm ${formatMinutes(minutes)}.`,
    );
    await load();
  };

  const handlePrimaryAction = async () => {
    if (activeSession) {
      await handleFinishWork();
      return;
    }

    await handleStartWork();
  };

  const handleLunchSettingChange = async (
    field: "morningEnd" | "afternoonStart",
    value: string,
  ) => {
    const minutes = hmToMinutes(value);
    if (minutes === null) return;

    const nextSettings = {
      ...settings,
      [field]: minutes,
    };

    await saveSettings(nextSettings);
    await load();
  };

  const handleTrayDisplayToggle = async (
    field: "showTrayIcon" | "showTrayTitle",
    value: boolean,
  ) => {
    await saveSettings({
      ...settings,
      [field]: value,
    });
    await load();
  };

  const handleStartupToggle = async (
    field: "autoStartOnBoot" | "autoStartWorkSession",
    value: boolean,
  ) => {
    await saveSettings({
      ...settings,
      [field]: value,
    });
    await load();
  };

  const handleCheckVersion = async () => {
    setUpdateStatus({
      state: "checking",
      message: "Đang kiểm tra phiên bản mới...",
    });

    if (import.meta.env.DEV) {
      setUpdateStatus({
        state: "up-to-date",
        message:
          "Bạn đang chạy bản dev local. Chỉ kiểm tra release trên GitHub khi build release thật.",
        latestVersion: appVersion,
      });
      return;
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_RELEASE_REPO}/releases/latest`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "KTimeTracker",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Không thể lấy thông tin release từ GitHub (HTTP ${response.status}).`);
      }

      const data = (await response.json()) as {
        tag_name?: string;
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string }>;
      };
      const latestVersion = data.tag_name ? String(data.tag_name) : "0.0.0";
      const platform = detectRuntimePlatform();
      const downloadUrl =
        pickBestReleaseAsset(data.assets ?? [], platform) ||
        data.html_url ||
        "";
      const diff = compareVersions(appVersion, latestVersion);

      if (diff >= 0) {
        setUpdateStatus({
          state: "up-to-date",
          message: `Bạn đang dùng phiên bản mới nhất (${appVersion}).`,
          latestVersion,
          downloadUrl: "",
        });
        return;
      }

      setUpdateStatus({
        state: "new-version",
        message: `Có bản mới ${latestVersion}. Bạn đang dùng ${appVersion}.`,
        latestVersion,
        downloadUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể kiểm tra phiên bản mới.";
      setUpdateStatus({ state: "error", message });
    }
  };

  const handleInstallUpdate = async () => {
    if (import.meta.env.DEV) {
      setUpdateStatus({
        state: "error",
        message:
          "Bản dev không install update trực tiếp. Hãy build release thật và mở link download trên GitHub.",
      });
      return;
    }

    if (!updateStatus.downloadUrl) {
      setUpdateStatus({
        state: "error",
        message: "Không có link download hợp lệ cho bản cập nhật.",
      });
      return;
    }

    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        await openUrl(updateStatus.downloadUrl);
        return;
      }
    } catch (error) {
      console.warn(
        "Open URL via Tauri failed, falling back to browser:",
        error,
      );
    }

    window.open(updateStatus.downloadUrl, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = async () => {
    const targetDate = form.date || today;
    const checkIn = form.checkIn || null;
    const checkOut = form.checkOut || null;
    const minutes =
      checkIn && checkOut
        ? (calculateWorkedMinutes(checkIn, checkOut, settings) ?? 0)
        : 0;

    await saveLog({
      date: targetDate,
      checkIn,
      checkOut,
      workedMinutes: minutes,
      requiredMinutes: null,
    });

    if (isDailyTargetMet(minutes, settings)) {
      setStatusMessage("✅ Đủ 8h làm việc rồi!");
      window.alert("✅ Bạn đã làm đủ 8h hôm nay!");
    } else {
      setStatusMessage("💾 Đã lưu thay đổi cho ngày này.");
    }
    await load();
  };

  const handleEditLog = async (date: string, checkIn: string | null, checkOut: string | null) => {
    const original = logs.find((entry) => entry.date === date);
    const minutes = checkIn && checkOut
      ? (calculateWorkedMinutes(checkIn, checkOut, settings) ?? 0)
      : 0;
    await saveLog({ date, checkIn, checkOut, workedMinutes: minutes, requiredMinutes: original?.requiredMinutes ?? null, note: original?.note ?? "" });
    if (date === today) setForm({ date, checkIn: checkIn ?? "", checkOut: checkOut ?? "" });
    setStatusMessage("💾 Đã cập nhật thông tin chấm công.");
    await load();
  };

  return (
    <div className="app-shell bg-slate-950 text-slate-100">
      <aside className={`app-menu ${menuCollapsed ? "is-collapsed" : ""}`}>
        <div className="app-menu-brand">
          {!menuCollapsed && <span>Work Time Tracker</span>}
          <button type="button" className="app-menu-toggle" aria-label={menuCollapsed ? "Mở rộng menu" : "Thu gọn menu"} title={menuCollapsed ? "Mở rộng menu" : "Thu gọn menu"} onClick={() => setMenuCollapsed((value) => !value)}>{menuCollapsed ? "☰" : "‹"}</button>
        </div>
        <nav className="app-menu-links" aria-label="Menu chính">
          {navigation.map((item) => <button key={item.id} type="button" className={`app-menu-link ${view === item.id ? "is-active" : ""}`} aria-current={view === item.id ? "page" : undefined} aria-label={item.label} title={menuCollapsed ? item.label : undefined} onClick={() => {
            if (item.id === view) return;
            if (view === "design" && designDirty && !window.confirm("Tài liệu có thay đổi chưa lưu. Bỏ các thay đổi này?")) return;
            setDesignDirty(false);
            setView(item.id);
          }}>
            <span className="app-menu-icon" aria-hidden="true">{item.icon}</span>
            {!menuCollapsed && <span className="app-menu-label">{item.label}</span>}
          </button>)}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <span className="app-topbar-title">{navigation.find((item) => item.id === view)?.label}</span>
          <span className="app-topbar-date">{formatViDate(today)}</span>
        </header>
        <div className={view === "design" ? "app-content app-content-workspace" : "app-content app-content-standard"}>
        {view !== "design" && <RocketChatConnection activeTab={view} onNotificationHistory={setNotificationHistory} />}

        {view === "dashboard" && (
          <DashboardTab
            today={today}
            currentLog={currentLog}
            activeSession={activeSession}
            form={form}
            settings={settings}
            statusMessage={statusMessage}
            elapsedSeconds={elapsedSeconds}
            remainingSeconds={remainingSeconds}
            progressPercent={progressPercent}
            todayStatus={todayStatus}
            dailyRequiredMinutes={dailyRequiredMinutes}
            currentWorkedMinutes={currentWorkedMinutes}
            remainingTodayMinutes={remainingTodayMinutes}
            late={late}
            worked={worked}
            targetCheckout={targetCheckout}
            dashboard={dashboard}
            logs={logs}
            onPrimaryAction={handlePrimaryAction}
            onLunchSettingChange={handleLunchSettingChange}
            onSubmit={handleSubmit}
            setForm={setForm}
            onEditLog={handleEditLog}
            deleteLog={deleteLog}
          />
        )}

        {view === "calendar" && (
          <CalendarTab
            today={today}
            settings={settings}
            logs={logs.map((log) => ({
              date: log.date,
              workedMinutes: log.workedMinutes,
            }))}
            calendarView={calendarView}
            setCalendarView={setCalendarView}
          />
        )}

        {view === "settings" && (
          <SettingsTab
            settings={settings}
            appVersion={appVersion}
            updateStatus={updateStatus}
            onTrayDisplayToggle={handleTrayDisplayToggle}
            onStartupToggle={handleStartupToggle}
            onCheckVersion={handleCheckVersion}
            onInstallUpdate={handleInstallUpdate}
          />
        )}
        {view === "design" && <DesignTab onDirtyChange={setDesignDirty} />}
        </div>
      </div>
    </div>
  );
}
