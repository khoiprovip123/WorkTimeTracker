import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { calculateLateMinutes, calculateRequiredCheckout, calculateWorkedMinutes, isDailyTargetMet, projectCheckout } from './lib/calculator';
import { getDashboardData, useAppStore } from './lib/store';
import { formatMinutes, formatMonthVi, formatRange, formatSigned, formatViDate, hmOrDash, hmToMinutes, isoDate, minutesToHm, mondayOf, nowHm, parseIso, todayIso, weekDates } from './lib/time';

function formatDurationHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

// function StatusBadge({ value }: { value: number }) {
//   if (value === 0) return <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">✓ Đủ giờ</span>;
//   if (value > 0) return <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">+ Dư {formatMinutes(value)}</span>;
//   return <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">⚠ Thiếu {formatMinutes(Math.abs(value))}</span>;
// }

function getCalendarDays(view: 'week' | 'month', anchorDate: string, logs: { date: string; workedMinutes: number }[]) {
  const logMap = new Map(logs.map((log) => [log.date, log.workedMinutes]));

  if (view === 'week') {
    const start = mondayOf(anchorDate);
    return weekDates(start).map((date) => ({
      date,
      workedMinutes: logMap.get(date) ?? 0,
      isCurrentMonth: true,
      isToday: date === anchorDate,
    }));
  }

  const [year, month] = anchorDate.slice(0, 7).split('-').map(Number);
  const firstDay = new Date(year, (month ?? 1) - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - startOffset);

  const cells: { date: string; workedMinutes: number; isCurrentMonth: boolean; isToday: boolean }[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const iso = isoDate(date);
    cells.push({
      date: iso,
      workedMinutes: logMap.get(iso) ?? 0,
      isCurrentMonth: date.getMonth() === (month ?? 1) - 1,
      isToday: iso === anchorDate,
    });
  }

  return cells;
}

export default function App() {
  const today = todayIso();
  const { logs, leaves, carryOvers, settings, load, saveLog, saveSettings, deleteLog } = useAppStore();
  const [form, setForm] = useState(() => ({
    date: today,
    checkIn: nowHm(),
    checkOut: '17:30',
  }));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [liveNow, setLiveNow] = useState(Date.now());
  const [view, setView] = useState<'dashboard' | 'calendar' | 'settings'>('dashboard');
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week');
  const [editingDate, setEditingDate] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!logs.some((entry) => entry.date === today && entry.checkIn && !entry.checkOut)) {
      return;
    }

    const intervalId = window.setInterval(() => setLiveNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [logs, today]);

  const dashboard = useMemo(() => getDashboardData(today, logs, leaves, carryOvers, settings), [today, logs, leaves, carryOvers, settings]);
  const currentLog = logs.find((entry) => entry.date === today);
  const activeSession = currentLog && currentLog.checkIn && !currentLog.checkOut ? currentLog : null;
  const elapsedSeconds = useMemo(() => {
    if (!activeSession?.checkIn) return 0;
    const startedAt = Date.parse(`${today}T${activeSession.checkIn}:00`);
    if (Number.isNaN(startedAt)) return 0;

    const breakStart = Date.parse(`${today}T${minutesToHm(settings.morningEnd)}:00`);
    const breakEnd = Date.parse(`${today}T${minutesToHm(settings.afternoonStart)}:00`);
    const totalMs = Math.max(0, liveNow - startedAt);
    const excludedMs = Math.max(0, Math.min(liveNow, breakEnd) - Math.max(startedAt, breakStart));
    return Math.max(0, Math.round((totalMs - excludedMs) / 1000));
  }, [activeSession, liveNow, settings.afternoonStart, settings.morningEnd, today]);
  const targetSeconds = (settings.dailyRequiredMinutes ?? 480) * 60;
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
  const progressPercent = activeSession ? Math.min(100, (elapsedSeconds / targetSeconds) * 100) : 0;

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

    const trayVisible = settings.showTrayIcon ?? true;
    void invoke('set_tray_visibility', { enabled: trayVisible });

    if (!trayVisible) return;

    if (!activeSession) {
      const title = settings.showTrayTitle ? 'Idle' : '';
      void invoke('update_tray_status', { title, tooltip: 'Work Time Tracker' });
      return;
    }

    const chartLength = 10;
    const percent = progressPercent || 0;
    const filled = Math.max(1, Math.min(chartLength, Math.round(percent / 10)));
    const bar = `${'█'.repeat(filled)}${'░'.repeat(chartLength - filled)} ${Math.round(percent)}%`;
    const title = settings.showTrayTitle ? formatDurationHms(elapsedSeconds) : '';
    const tooltip = settings.showTrayTitle ? `${title} | ${bar}` : bar;

    void invoke('update_tray_status', { title, tooltip });
  }, [activeSession, elapsedSeconds, progressPercent, settings.showTrayIcon, settings.showTrayTitle]);

  const late = calculateLateMinutes(currentLog?.checkIn ?? form.checkIn, settings);
  const worked = calculateWorkedMinutes(form.checkIn, form.checkOut, settings) ?? 0;
  const targetCheckout = projectCheckout({
    checkIn: form.checkIn,
    requiredMinutes: 480,
    workedMinutes: worked,
    nowMinutes: hmToMinutes(nowHm()) ?? 0,
    layout: settings,
  });

  const dailyRequiredMinutes = settings.dailyRequiredMinutes ?? 480;
  const currentWorkedMinutes = activeSession ? Math.max(0, Math.round(elapsedSeconds / 60)) : (currentLog?.workedMinutes ?? 0);
  const remainingTodayMinutes = dailyRequiredMinutes - currentWorkedMinutes;
  const todayStatus: 'idle' | 'working' | 'complete' | 'missing' = activeSession
    ? 'working'
    : currentLog?.checkOut
      ? (currentWorkedMinutes >= dailyRequiredMinutes ? 'complete' : 'missing')
      : 'idle';

  const calendarDays = useMemo(() => {
    const aggregatedLogs = logs.map((log) => ({ date: log.date, workedMinutes: log.workedMinutes }));
    return getCalendarDays(calendarView, today, aggregatedLogs);
  }, [calendarView, logs, today]);

  const calendarRange = useMemo(() => {
    if (calendarView === 'week') {
      const start = mondayOf(today);
      const end = weekDates(start)[6];
      return `${formatRange(start, end)}`;
    }
    return formatMonthVi(today.slice(0, 7));
  }, [calendarView, today]);

  const notifyIfFullDay = (minutes: number) => {
    if (isDailyTargetMet(minutes, settings)) {
      setStatusMessage('✅ Đủ 8h làm việc rồi!');
      window.alert('✅ Bạn đã làm đủ 8h hôm nay!');
    }
  };

  const handleStartWork = async () => {
    const startedAt = form.checkIn || nowHm() || '08:00';
    if (activeSession) {
      setStatusMessage('⚠️ Ca làm hôm nay đã bắt đầu rồi.');
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
    setForm((prev) => ({ ...prev, date: today, checkIn: startedAt, checkOut: '' }));
    setStatusMessage(`⏱️ Bắt đầu ca làm lúc ${startedAt}`);
    await load();
  };

  const handleFinishWork = async () => {
    const checkIn = currentLog?.checkIn ?? (form.checkIn || '08:00');
    const checkOut = nowHm() ?? '17:30';
    const minutes = calculateWorkedMinutes(checkIn, checkOut, settings) ?? 0;

    if (!checkIn) {
      setStatusMessage('⚠️ Chưa có giờ bắt đầu ca.');
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
    setStatusMessage(`⏹️ Kết thúc ca lúc ${checkOut}. Đã làm ${formatMinutes(minutes)}.`);
    await load();
  };

  const handlePrimaryAction = async () => {
    if (activeSession) {
      await handleFinishWork();
      return;
    }

    await handleStartWork();
  };

  const handleLunchSettingChange = async (field: 'morningEnd' | 'afternoonStart', value: string) => {
    const minutes = hmToMinutes(value);
    if (minutes === null) return;

    const nextSettings = {
      ...settings,
      [field]: minutes,
    };

    await saveSettings(nextSettings);
    await load();
  };

  const handleTrayDisplayToggle = async (field: 'showTrayIcon' | 'showTrayTitle', value: boolean) => {
    await saveSettings({
      ...settings,
      [field]: value,
    });
    await load();
  };

  const handleSubmit = async () => {
    const targetDate = form.date || today;
    const checkIn = form.checkIn || null;
    const checkOut = form.checkOut || null;
    const minutes = checkIn && checkOut ? calculateWorkedMinutes(checkIn, checkOut, settings) ?? 0 : 0;

    await saveLog({
      date: targetDate,
      checkIn,
      checkOut,
      workedMinutes: minutes,
      requiredMinutes: null,
    });

    if (editingDate && editingDate !== targetDate) {
      await deleteLog(editingDate);
    }

    setEditingDate(null);
    if (isDailyTargetMet(minutes, settings)) {
      setStatusMessage('✅ Đủ 8h làm việc rồi!');
      window.alert('✅ Bạn đã làm đủ 8h hôm nay!');
    } else {
      setStatusMessage(editingDate ? '💾 Đã cập nhật thông tin chấm công.' : '💾 Đã lưu thay đổi cho ngày này.');
    }
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">Work Time Tracker</p>
            {/* <h1 className="mt-1 text-3xl font-bold text-white">Dashboard thời gian làm việc</h1> */}
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 p-1">
              <button
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${view === 'dashboard' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => setView('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${view === 'calendar' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => setView('calendar')}
              >
                Lịch
              </button>
              <button
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${view === 'settings' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => setView('settings')}
              >
                Cài đặt
              </button>
            </nav>

            <div className="card flex items-center gap-3 px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-sm text-slate-300">{formatViDate(today)}</span>
            </div>
          </div>
        </header>

        {view === 'dashboard' ? (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm text-slate-400">HÔM NAY</p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      todayStatus === 'working'
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                        : todayStatus === 'complete'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                          : todayStatus === 'missing'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                            : 'border-slate-600 bg-slate-800 text-slate-200'
                    }`}
                  >
                    {todayStatus === 'working' ? 'Đang làm' : todayStatus === 'complete' ? 'Đủ giờ' : todayStatus === 'missing' ? 'Thiếu giờ' : 'Chưa bắt đầu'}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-slate-200">
                  <div className="flex justify-between"><span>Check-in</span><span>{hmOrDash(currentLog?.checkIn ?? '--')}</span></div>
                  <div className="flex justify-between"><span>Check-out</span><span>{!currentLog?.checkOut ? '--' : hmOrDash(currentLog.checkOut)}</span></div>
                  <div className="flex justify-between"><span>Đã làm</span><span>{formatMinutes(currentWorkedMinutes)}</span></div>
                  <div className="flex justify-between"><span>Mục tiêu</span><span>{formatMinutes(dailyRequiredMinutes)}</span></div>
                  <div className="flex justify-between">
                    <span>{activeSession ? 'Còn lại' : currentLog?.checkOut ? (currentWorkedMinutes >= dailyRequiredMinutes ? 'Còn lại' : 'Thiếu') : 'Còn lại'}</span>
                    <span>
                      {activeSession
                        ? formatSigned(remainingTodayMinutes)
                        : currentLog?.checkOut
                          ? currentWorkedMinutes >= dailyRequiredMinutes
                            ? formatSigned(remainingTodayMinutes)
                            : `-${formatMinutes(Math.abs(remainingTodayMinutes))}`
                          : formatMinutes(dailyRequiredMinutes)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{activeSession ? 'Dự kiến đủ giờ' : 'Trạng thái'}</span>
                    <span>
                      {activeSession
                        ? calculateRequiredCheckout(currentLog?.checkIn ?? form.checkIn, dailyRequiredMinutes, settings).time ?? '—'
                        : currentLog?.checkOut
                          ? (currentWorkedMinutes >= dailyRequiredMinutes ? 'Đủ giờ' : 'Thiếu giờ')
                          : 'Chưa bắt đầu'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm text-slate-400">TUẦN NÀY</p>
                </div>
                <div className="space-y-2 text-sm text-slate-200">
                  <div className="flex justify-between"><span>Đã làm</span><span>{formatMinutes(dashboard.week.workedMinutes)}</span></div>
                  <div className="flex justify-between"><span>Yêu cầu</span><span>{formatMinutes(dashboard.week.requiredMinutes || 2400)}</span></div>
                  <div className="flex justify-between"><span>Thiếu/Dư</span><span>{formatSigned(dashboard.week.balance)}</span></div>
                  <div className="flex justify-between"><span>Carry-over</span><span>{formatSigned(0)}</span></div>
                </div>
              </div>

              <div className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm text-slate-400">THÁNG NÀY</p>
                </div>
                <div className="space-y-2 text-sm text-slate-200">
                  <div className="flex justify-between"><span>Đã làm</span><span>{formatMinutes(dashboard.month.workedMinutes)}</span></div>
                  <div className="flex justify-between"><span>Yêu cầu</span><span>{formatMinutes(dashboard.month.requiredMinutes || 0)}</span></div>
                  <div className="flex justify-between"><span>Thiếu/Dư</span><span>{formatSigned(dashboard.month.balance)}</span></div>
                </div>
              </div>
            </section>

            <section className="mb-6 grid gap-6 lg:grid-cols-[1.1fr_1.8fr]">
              <div className="card p-5">
                <h2 className="mb-4 text-lg font-semibold text-white">Nhập giờ làm</h2>
                <div className="space-y-3">
                  <label className="block text-sm text-slate-300">
                    <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">Giờ bắt đầu</span>
                    <input
                      className="input mt-1 w-full"
                      type="time"
                      value={form.checkIn}
                      onChange={(e) => setForm((prev) => ({ ...prev, checkIn: e.target.value }))}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm text-slate-300">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">Nghỉ trưa từ</span>
                      <input
                        className="input mt-1 w-full"
                        type="time"
                        value={minutesToHm(settings.morningEnd)}
                        onChange={(e) => void handleLunchSettingChange('morningEnd', e.target.value)}
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">đến</span>
                      <input
                        className="input mt-1 w-full"
                        type="time"
                        value={minutesToHm(settings.afternoonStart)}
                        onChange={(e) => void handleLunchSettingChange('afternoonStart', e.target.value)}
                      />
                    </label>
                  </div>

                  {!currentLog?.checkOut && (
                    <button className="button-primary w-full" onClick={() => void handlePrimaryAction()}>
                      {activeSession ? 'Kết thúc ca' : 'Bắt đầu giờ làm'}
                    </button>
                  )}

                  <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-center">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Thời gian đang làm</div>
                    <div className="mt-2 font-mono text-3xl font-bold text-emerald-300">
                      {activeSession ? formatDurationHms(elapsedSeconds) : '00:00:00'}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {activeSession ? `Bắt đầu lúc ${activeSession.checkIn} · Còn lại ${formatDurationHms(remainingSeconds)}` : 'Chưa có ca làm nào đang chạy'}
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400">
                        <span>Tiến độ</span>
                        <span>{Math.round(progressPercent)}%</span>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-emerald-400 via-cyan-400 to-sky-500 transition-all duration-1000"
                          style={{ width: `${activeSession ? progressPercent : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {statusMessage && (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                      {statusMessage}
                    </div>
                  )}

                  <label className="block text-sm text-slate-300">
                    <span>Ngày</span>
                    <input className="input mt-1" type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm text-slate-300">
                      <span>Check-in</span>
                      <input className="input mt-1" type="time" value={form.checkIn} onChange={(e) => setForm((prev) => ({ ...prev, checkIn: e.target.value }))} />
                    </label>
                    <label className="block text-sm text-slate-300">
                      <span>Check-out</span>
                      <input className="input mt-1" type="time" value={form.checkOut} onChange={(e) => setForm((prev) => ({ ...prev, checkOut: e.target.value }))} />
                    </label>
                  </div>
                  <div className="rounded-xl bg-slate-800/80 p-3 text-sm text-slate-200">
                    <div className="flex justify-between"><span>Đi trễ</span><span>{formatMinutes(late)}</span></div>
                    <div className="mt-2 flex justify-between"><span>Đã làm</span><span>{formatMinutes(worked)}</span></div>
                    <div className="mt-2 flex justify-between"><span>Giờ dự kiến về</span><span>{targetCheckout.time ?? '—'}</span></div>
                  </div>
                  <button className="button-primary w-full" onClick={() => void handleSubmit()}>
                    {editingDate ? 'Cập nhật chấm công' : 'Lưu chấm công'}
                  </button>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="mb-4 text-lg font-semibold text-white">Lịch sử công</h2>
                <div className="overflow-hidden rounded-xl border border-slate-700">
                  <table className="w-full text-left text-sm text-slate-200">
                    <thead className="bg-slate-800/90 text-slate-300">
                      <tr>
                        <th className="px-3 py-2">Ngày</th>
                        <th className="px-3 py-2">Check-in</th>
                        <th className="px-3 py-2">Check-out</th>
                        <th className="px-3 py-2">Giờ</th>
                        <th className="px-3 py-2">Balance</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((entry) => (
                        <tr key={entry.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">{formatViDate(entry.date)}</td>
                          <td className="px-3 py-2">{hmOrDash(entry.checkIn)}</td>
                          <td className="px-3 py-2">{hmOrDash(entry.checkOut)}</td>
                          <td className="px-3 py-2">{formatMinutes(entry.workedMinutes)}</td>
                          <td className="px-3 py-2">{formatSigned(entry.workedMinutes - (settings.dailyRequiredMinutes ?? 480))}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                className="button-secondary px-2 py-1 text-xs"
                                onClick={() => {
                                  setEditingDate(entry.date);
                                  setForm({
                                    date: entry.date,
                                    checkIn: entry.checkIn ?? '',
                                    checkOut: entry.checkOut ?? '',
                                  });
                                }}
                              >
                                Sửa
                              </button>
                              <button className="button-secondary px-2 py-1 text-xs" onClick={() => void deleteLog(entry.date)}>Xoá</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : view === 'calendar' ? (
          <section className="mb-6">
            <div className="card p-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Lịch công</h2>
                  <p className="text-sm text-slate-400">{calendarRange}</p>
                </div>
                <div className="inline-flex rounded-full border border-slate-700 bg-slate-900/70 p-1">
                  <button
                    className={`rounded-full px-3 py-1.5 text-sm transition ${calendarView === 'week' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
                    onClick={() => setCalendarView('week')}
                  >
                    Tuần
                  </button>
                  <button
                    className={`rounded-full px-3 py-1.5 text-sm transition ${calendarView === 'month' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
                    onClick={() => setCalendarView('month')}
                  >
                    Tháng
                  </button>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-7 gap-2 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map(({ date, workedMinutes, isCurrentMonth, isToday }) => {
                  const requiredMinutes = settings.dailyRequiredMinutes || 480;
                  const balanceMinutes = workedMinutes - requiredMinutes;
                  const percent = Math.min(100, (workedMinutes / requiredMinutes) * 100);
                  const hasWorkData = workedMinutes > 0;

                  return (
                    <div
                      key={date}
                      className={`rounded-xl border p-2 transition ${
                        isToday
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : isCurrentMonth
                            ? 'border-slate-700 bg-slate-900/50'
                            : 'border-slate-800 bg-slate-900/30 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">{parseIso(date).getDate()}</span>
                        {isToday && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">H</span>}
                      </div>

                      {hasWorkData ? (
                        <>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                              style={{ width: `${Math.max(6, percent)}%` }}
                            />
                          </div>
                          <div className="mt-2 space-y-0.5 text-[11px] text-slate-200">
                            <div className="font-medium text-emerald-300">{formatMinutes(workedMinutes)}</div>
                            <div className={balanceMinutes >= 0 ? 'text-emerald-300' : 'text-amber-300'}>
                              {balanceMinutes >= 0 ? '+' : '-'}{formatMinutes(Math.abs(balanceMinutes)).replace(/^-/, '')}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="mt-6 text-center text-[10px] text-slate-500">—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <div className="card p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Cài đặt hệ thống</h2>
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                  <span>Hiện icon tray</span>
                  <input
                    type="checkbox"
                    checked={settings.showTrayIcon}
                    onChange={(e) => void handleTrayDisplayToggle('showTrayIcon', e.target.checked)}
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                  <span>Hiện thời gian trên header tray</span>
                  <input
                    type="checkbox"
                    checked={settings.showTrayTitle}
                    disabled={!settings.showTrayIcon}
                    onChange={(e) => void handleTrayDisplayToggle('showTrayTitle', e.target.checked)}
                  />
                </label>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Thông tin tray</h2>
              <div className="space-y-3 text-sm text-slate-200">
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Trạng thái hiện tại</div>
                  <div className="mt-2 font-medium text-white">{settings.showTrayIcon ? 'Tray đang hiển thị' : 'Tray đang tắt'}</div>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Header time</div>
                  <div className="mt-2 font-medium text-white">{settings.showTrayTitle ? 'Đang hiển thị' : 'Đang ẩn'}</div>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-slate-300">
                  Gợi ý: trên Ubuntu GNOME/Wayland, tray icon hoạt động tốt nhất khi AppIndicator được bật và menu tray có sẵn.
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
