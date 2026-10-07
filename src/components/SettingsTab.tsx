import type { Settings } from '../lib/types';

export type SettingsTabProps = {
  settings: Settings;
  appVersion: string;
  updateStatus: { state: 'idle' | 'checking' | 'up-to-date' | 'new-version' | 'error'; message: string; latestVersion?: string; downloadUrl?: string };
  onTrayDisplayToggle: (field: 'showTrayIcon' | 'showTrayTitle', value: boolean) => void;
  onStartupToggle: (field: 'autoStartOnBoot' | 'autoStartWorkSession', value: boolean) => void;
  onCheckVersion: () => void;
  onInstallUpdate: () => void;
};

export default function SettingsTab({ settings, appVersion, updateStatus, onTrayDisplayToggle, onStartupToggle, onCheckVersion, onInstallUpdate }: SettingsTabProps) {
  return (
    <section className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <div className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Cài đặt hệ thống</h2>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
            <span>Hiện icon tray</span>
            <input
              type="checkbox"
              checked={settings.showTrayIcon}
              onChange={(e) => void onTrayDisplayToggle('showTrayIcon', e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
            <span>Hiện thời gian trên header tray</span>
            <input
              type="checkbox"
              checked={settings.showTrayTitle}
              disabled={!settings.showTrayIcon}
              onChange={(e) => void onTrayDisplayToggle('showTrayTitle', e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
            <span>Tự khởi động cùng máy</span>
            <input
              type="checkbox"
              checked={settings.autoStartOnBoot}
              onChange={(e) => void onStartupToggle('autoStartOnBoot', e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
            <span>Tự bắt đầu ca làm khi mở app</span>
            <input
              type="checkbox"
              checked={settings.autoStartWorkSession}
              onChange={(e) => void onStartupToggle('autoStartWorkSession', e.target.checked)}
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

      <div className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Cập nhật</h2>
        <div className="space-y-3 text-sm text-slate-200">
          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <span>Phiên bản hiện tại</span>
            <span className="font-semibold text-white">{appVersion}</span>
          </div>

          <button
            className="button-primary w-full"
            onClick={() => void onCheckVersion()}
            disabled={updateStatus.state === 'checking'}
          >
            {updateStatus.state === 'checking' ? 'Đang kiểm tra...' : 'Check update'}
          </button>

          {updateStatus.state === 'new-version' && updateStatus.downloadUrl && (
            <button
              className="button-secondary w-full"
              onClick={() => void onInstallUpdate()}
            >
              Mở download release
            </button>
          )}

          <div className={`rounded-xl border p-3 text-sm ${
            updateStatus.state === 'new-version'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
              : updateStatus.state === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                : 'border-slate-700 bg-slate-900/60 text-slate-200'
          }`}>
            {updateStatus.message}
          </div>
        </div>
      </div>
    </section>
  );
}
