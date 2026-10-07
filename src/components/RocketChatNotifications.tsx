import type { RocketChatNotificationMessage, RocketChatSubscription } from '../lib/rocket-chat';

export type RocketChatNotificationConfig = {
  serverUrl: string;
  userId: string;
  authToken: string;
  roomName: string;
};

type RocketChatNotificationsProps = {
  config: RocketChatNotificationConfig;
  onConfigChange: (nextConfig: Partial<RocketChatNotificationConfig>) => void;
  connectionState: 'idle' | 'connecting' | 'connected' | 'error';
  error: string | null;
  subscription: RocketChatSubscription | null;
  notificationHistory: RocketChatNotificationMessage[];
  isSyncing: boolean;
  onConnect: () => void;
  onSyncHistory: () => void;
};

export default function RocketChatNotifications({
  config,
  onConfigChange,
  connectionState,
  error,
  subscription,
  notificationHistory,
  isSyncing,
  onConnect,
  onSyncHistory,
}: RocketChatNotificationsProps) {
  const handleInputChange = (field: keyof RocketChatNotificationConfig, value: string) => {
    onConfigChange({ [field]: value });
  };

  return (
    <div className="card p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Rocket.Chat</p>
          <h2 className="mt-2 text-2xl font-bold text-white">TMT Notification</h2>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
              connectionState === 'connected'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : connectionState === 'connecting'
                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                  : 'border-slate-600 bg-slate-800 text-slate-200'
            }`}
          >
            {connectionState === 'connected' ? 'Online' : connectionState === 'connecting' ? 'Đang kết nối' : connectionState === 'error' ? 'Lỗi' : 'Offline'}
          </span>
          <button className="button-primary" onClick={onConnect} type="button">
            Kết nối
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-slate-300">
          <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">Server URL</span>
          <input
            className="input"
            type="url"
            value={config.serverUrl}
            onChange={(event) => handleInputChange('serverUrl', event.target.value)}
          />
        </label>

        <label className="block text-sm text-slate-300">
          <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">Room name</span>
          <input
            className="input"
            value={config.roomName}
            onChange={(event) => handleInputChange('roomName', event.target.value)}
          />
        </label>

        <label className="block text-sm text-slate-300">
          <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">User ID</span>
          <input
            className="input"
            value={config.userId}
            onChange={(event) => handleInputChange('userId', event.target.value)}
          />
        </label>

        <label className="block text-sm text-slate-300">
          <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">Auth token</span>
          <input
            className="input"
            type="password"
            value={config.authToken}
            onChange={(event) => handleInputChange('authToken', event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Push notification stream</p>
          </div>

          {subscription?.rid ? (
            <button
              className="button-secondary"
              onClick={onSyncHistory}
              type="button"
              disabled={isSyncing}
            >
              {isSyncing ? 'Đang sync...' : 'Sync lại'}
            </button>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
            <span>Room</span>
            <span className="font-medium text-emerald-300">{subscription?.fname ?? config.roomName}</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
            <span>Room ID</span>
            <span className="font-mono text-xs text-slate-300">{subscription?.rid ?? '—'}</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
            <span>WebSocket</span>
            <span className="font-medium text-slate-300">{connectionState === 'connected' ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="mb-3 text-sm uppercase tracking-[0.2em] text-slate-400">Thông báo mới</h3>
        {notificationHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
            Chưa có thông báo nào. Khi room TMT Notification nhận tin nhắn mới, app sẽ push vào đây ngay.
          </div>
        ) : (
          <div className="space-y-3">
            {notificationHistory.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span>{item.sender}</span>
                  <span>{new Date(item.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <p className="text-sm text-slate-100">{item.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
