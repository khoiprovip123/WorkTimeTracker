import { formatMinutes, formatSigned, formatViDate, hmOrDash, minutesToHm } from '../lib/time';
import type { Settings, WorkLog } from '../lib/types';

export type DashboardTabProps = {
  today: string;
  currentLog: WorkLog | undefined;
  activeSession: WorkLog | null;
  form: { date: string; checkIn: string; checkOut: string };
  settings: Settings;
  statusMessage: string | null;
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
  todayStatus: 'idle' | 'working' | 'complete' | 'missing';
  dailyRequiredMinutes: number;
  currentWorkedMinutes: number;
  remainingTodayMinutes: number;
  late: number;
  worked: number;
  targetCheckout: { time: string | null };
  dashboard: {
    week: { workedMinutes: number; requiredMinutes: number; balance: number };
    month: { workedMinutes: number; requiredMinutes: number; balance: number };
  };
  logs: WorkLog[];
  onPrimaryAction: () => void;
  onLunchSettingChange: (field: 'morningEnd' | 'afternoonStart', value: string) => void;
  onSubmit: () => void;
  setForm: React.Dispatch<React.SetStateAction<{ date: string; checkIn: string; checkOut: string }>>;
  setEditingDate: (date: string | null) => void;
  deleteLog: (date: string) => Promise<void>;
};

function formatDurationHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export default function DashboardTab({
  today,
  currentLog,
  activeSession,
  form,
  settings,
  statusMessage,
  elapsedSeconds,
  remainingSeconds,
  progressPercent,
  todayStatus,
  dailyRequiredMinutes,
  currentWorkedMinutes,
  remainingTodayMinutes,
  late,
  worked,
  targetCheckout,
  dashboard,
  logs,
  onPrimaryAction,
  onLunchSettingChange,
  onSubmit,
  setForm,
  setEditingDate,
  deleteLog,
}: DashboardTabProps) {
  return (
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
                  ? (currentLog?.checkIn ? `Ngày ${today}` : '—')
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
                  onChange={(e) => void onLunchSettingChange('morningEnd', e.target.value)}
                />
              </label>
              <label className="block text-sm text-slate-300">
                <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">đến</span>
                <input
                  className="input mt-1 w-full"
                  type="time"
                  value={minutesToHm(settings.afternoonStart)}
                  onChange={(e) => void onLunchSettingChange('afternoonStart', e.target.value)}
                />
              </label>
            </div>

            {!currentLog?.checkOut && (
              <button className="button-primary w-full" onClick={() => void onPrimaryAction()}>
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
            <button className="button-primary w-full" onClick={() => void onSubmit()}>
              Lưu chấm công
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
  );
}
