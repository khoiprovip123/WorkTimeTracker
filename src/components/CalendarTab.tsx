import { formatMinutes, formatMonthVi, formatRange, mondayOf, parseIso, weekDates } from '../lib/time';
import type { Settings } from '../lib/types';

export type CalendarTabProps = {
  today: string;
  settings: Settings;
  logs: Array<{ date: string; workedMinutes: number }>;
  calendarView: 'week' | 'month';
  setCalendarView: (value: 'week' | 'month') => void;
};

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
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    cells.push({
      date: iso,
      workedMinutes: logMap.get(iso) ?? 0,
      isCurrentMonth: date.getMonth() === (month ?? 1) - 1,
      isToday: iso === anchorDate,
    });
  }

  return cells;
}

export default function CalendarTab({ today, settings, logs, calendarView, setCalendarView }: CalendarTabProps) {
  const calendarDays = getCalendarDays(calendarView, today, logs);

  const calendarRange = calendarView === 'week'
    ? (() => {
        const start = mondayOf(today);
        const end = weekDates(start)[6];
        return `${formatRange(start, end)}`;
      })()
    : formatMonthVi(today.slice(0, 7));

  return (
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
  );
}
