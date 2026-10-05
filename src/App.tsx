import { useEffect, useMemo, useState } from 'react';
import { calculateLateMinutes, calculateRequiredCheckout, calculateWorkedMinutes, isDailyTargetMet, projectCheckout } from './lib/calculator';
import { getDashboardData, useAppStore } from './lib/store';
import { formatMinutes, formatSigned, formatViDate, hmOrDash, hmToMinutes, nowHm, todayIso } from './lib/time';

function StatusBadge({ value }: { value: number }) {
  if (value === 0) return <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">✓ Đủ giờ</span>;
  if (value > 0) return <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">+ Dư {formatMinutes(value)}</span>;
  return <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">⚠ Thiếu {formatMinutes(Math.abs(value))}</span>;
}

export default function App() {
  const today = todayIso();
  const { logs, leaves, carryOvers, settings, load, saveLog, deleteLog } = useAppStore();
  const [form, setForm] = useState({
    date: today,
    checkIn: '08:00',
    checkOut: '17:30',
    note: '',
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const dashboard = useMemo(() => getDashboardData(today, logs, leaves, carryOvers, settings), [today, logs, leaves, carryOvers, settings]);
  const day = dashboard.todayReport;
  const currentLog = logs.find((entry) => entry.date === today);
  const activeSession = currentLog && currentLog.checkIn && !currentLog.checkOut ? currentLog : null;
  const late = calculateLateMinutes(currentLog?.checkIn ?? form.checkIn, settings);
  const worked = calculateWorkedMinutes(form.checkIn, form.checkOut, settings) ?? 0;
  const targetCheckout = projectCheckout({
    checkIn: form.checkIn,
    requiredMinutes: 480,
    workedMinutes: worked,
    nowMinutes: hmToMinutes(nowHm()) ?? 0,
    layout: settings,
  });

  const notifyIfFullDay = (minutes: number) => {
    if (isDailyTargetMet(minutes, settings)) {
      setStatusMessage('✅ Đủ 8h làm việc rồi!');
      window.alert('✅ Bạn đã làm đủ 8h hôm nay!');
    }
  };

  const handleStartWork = async () => {
    const startedAt = nowHm() ?? '08:00';
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
      note: form.note,
    };

    await saveLog(nextLog);
    setForm((prev) => ({ ...prev, date: today, checkIn: startedAt, checkOut: '', note: prev.note }));
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
      note: form.note || currentLog?.note || '',
    });

    setForm((prev) => ({ ...prev, date: today, checkIn, checkOut, note: prev.note || currentLog?.note || '' }));
    notifyIfFullDay(minutes);
    setStatusMessage(`⏹️ Kết thúc ca lúc ${checkOut}. Đã làm ${formatMinutes(minutes)}.`);
    await load();
  };

  const handleSubmit = async () => {
    const checkIn = form.checkIn || null;
    const checkOut = form.checkOut || null;
    const minutes = checkIn && checkOut ? calculateWorkedMinutes(checkIn, checkOut, settings) ?? 0 : 0;
    await saveLog({
      date: form.date,
      checkIn,
      checkOut,
      workedMinutes: minutes,
      requiredMinutes: null,
      note: form.note,
    });
    if (isDailyTargetMet(minutes, settings)) {
      setStatusMessage('✅ Đủ 8h làm việc rồi!');
      window.alert('✅ Bạn đã làm đủ 8h hôm nay!');
    } else {
      setStatusMessage('💾 Đã lưu thay đổi cho ngày này.');
    }
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">Work Time Tracker</p>
            <h1 className="mt-1 text-3xl font-bold text-white">Dashboard thời gian làm việc</h1>
          </div>
          <div className="card flex items-center gap-3 px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="text-sm text-slate-300">{formatViDate(today)}</span>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-slate-400">HÔM NAY</p>
              <StatusBadge value={day.balance} />
            </div>
            <div className="space-y-2 text-sm text-slate-200">
              <div className="flex justify-between"><span>Check-in</span><span>{hmOrDash(currentLog?.checkIn ?? '08:00')}</span></div>
              <div className="flex justify-between"><span>Check-out</span><span>{hmOrDash(currentLog?.checkOut ?? '17:30')}</span></div>
              <div className="flex justify-between"><span>Đã làm</span><span>{formatMinutes(day.workedMinutes)}</span></div>
              <div className="flex justify-between"><span>Mục tiêu</span><span>{formatMinutes(day.requiredMinutes || 480)}</span></div>
              <div className="flex justify-between"><span>Còn lại</span><span>{formatSigned(day.balance)}</span></div>
              <div className="flex justify-between"><span>Đủ giờ</span><span>{calculateRequiredCheckout(currentLog?.checkIn ?? '08:00', 480, settings).time ?? '—'}</span></div>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-slate-400">TUẦN NÀY</p>
              <StatusBadge value={dashboard.week.balance} />
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
              <StatusBadge value={dashboard.month.balance} />
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
              <div className="grid grid-cols-2 gap-2">
                <button className="button-primary" onClick={() => void handleStartWork()} disabled={Boolean(activeSession)}>
                  Bắt đầu
                </button>
                <button className="button-secondary" onClick={() => void handleFinishWork()} disabled={!activeSession && !currentLog?.checkIn}>
                  Kết thúc
                </button>
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
              <label className="block text-sm text-slate-300">
                <span>Ghi chú</span>
                <textarea className="input mt-1 min-h-24" value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} />
              </label>
              <div className="rounded-xl bg-slate-800/80 p-3 text-sm text-slate-200">
                <div className="flex justify-between"><span>Đi trễ</span><span>{formatMinutes(late)}</span></div>
                <div className="mt-2 flex justify-between"><span>Đã làm</span><span>{formatMinutes(worked)}</span></div>
                <div className="mt-2 flex justify-between"><span>Giờ dự kiến về</span><span>{targetCheckout.time ?? '—'}</span></div>
              </div>
              <button className="button-primary w-full" onClick={() => void handleSubmit()}>Lưu chấm công</button>
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
                    <th className="px-3 py-2">Ghi chú</th>
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
                      <td className="px-3 py-2">{entry.note || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="button-secondary px-2 py-1 text-xs"
                            onClick={() => setForm({
                              date: entry.date,
                              checkIn: entry.checkIn ?? '',
                              checkOut: entry.checkOut ?? '',
                              note: entry.note ?? '',
                            })}
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
      </div>
    </div>
  );
}
