import { useEffect, useRef, useState } from 'react';
import { buildRocketChatLoginPayload, buildStreamRoomSubscription, extractRocketChatSubscriptions, findNotificationSubscription, normalizeRocketChatMessage, type RocketChatNotificationMessage, type RocketChatSubscription } from '../lib/rocket-chat';

const STORAGE_KEY = 'ktt-rocket-chat-config';
const DEFAULT_CONFIG = {
  serverUrl: 'https://rc.public.tpos.app',
  userId: '',
  authToken: '',
  roomName: 'TMT Notification',
};

function getStoredConfig() {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;

    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function buildHeaders(config: typeof DEFAULT_CONFIG) {
  const authToken = (config.authToken ?? '').trim();
  const userId = (config.userId ?? '').trim();

  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
    'X-Auth-Token': authToken,
    Authorization: authToken ? `Bearer ${authToken}` : '',
  };
}

async function readRocketChatError(response: Response) {
  try {
    const payload = await response.json() as { error?: string; message?: string; reason?: string; details?: string };
    const message = payload.error || payload.message || payload.reason || payload.details || 'Rocket.Chat trả về lỗi không rõ nguyên nhân.';
    return `${response.status} ${response.statusText}: ${message}`;
  } catch {
    return `${response.status} ${response.statusText}: Rocket.Chat trả về lỗi không xác định.`;
  }
}

export default function RocketChatNotifications() {
  const [config, setConfig] = useState(() => getStoredConfig());
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<RocketChatSubscription | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<RocketChatNotificationMessage[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const roomIdRef = useRef<string>('');
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const isManualCloseRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      disconnectSocket();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      disconnectSocket();
    };
  }, []);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const clearPingTimer = () => {
    if (pingTimerRef.current !== null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  };

  const disconnectSocket = () => {
    isManualCloseRef.current = true;
    clearReconnectTimer();
    clearPingTimer();

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();

    reconnectTimerRef.current = window.setTimeout(() => {
      if (!isManualCloseRef.current) {
        void connect();
      }
    }, 4000);
  };

  const syncInitialHistory = async (roomId: string, serverUrl: string) => {
    if (!roomId || !config.userId || !config.authToken) return;

    setIsSyncing(true);
    try {
      const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/v1/im.history?roomId=${encodeURIComponent(roomId)}&count=20`, {
        headers: buildHeaders(config),
      });

      if (!response.ok) {
        throw new Error(`Không thể load lịch sử khi kết nối Rocket.Chat: ${await readRocketChatError(response)}`);
      }

      const payload = await response.json() as { messages?: Array<{ _id?: string; rid?: string; msg?: string; text?: string; ts?: string | { $date?: string }; u?: { username?: string } }> };
      const messages = (payload.messages ?? []).map((item) => normalizeRocketChatMessage({ fields: { rid: item.rid, args: [item] } })).filter(Boolean) as RocketChatNotificationMessage[];

      setNotificationHistory((previous) => {
        const seen = new Set(previous.map((entry) => entry.id));
        const next = [...messages.filter((entry) => !seen.has(entry.id)), ...previous].slice(0, 20);
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đồng bộ lịch sử ban đầu.';
      setError(message);
    } finally {
      setIsSyncing(false);
    }
  };

  const connect = async () => {
    if (!config.userId || !config.authToken) {
      setError('Vui lòng nhập Rocket.Chat UserId và AuthToken.');
      setConnectionState('error');
      return;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    isManualCloseRef.current = false;
    const serverUrl = normalizeServerUrl(config.serverUrl);
    setError(null);
    setConnectionState('connecting');

    try {
      const subscriptionsResponse = await fetch(`${serverUrl}/api/v1/subscriptions.get`, {
        headers: buildHeaders(config),
      });

      if (!subscriptionsResponse.ok) {
        throw new Error(`Không thể lấy danh sách subscription từ Rocket.Chat: ${await readRocketChatError(subscriptionsResponse)}`);
      }

      const subscriptionsPayload = await subscriptionsResponse.json();
      const subscriptions = extractRocketChatSubscriptions(subscriptionsPayload);
      const nextSubscription = findNotificationSubscription(subscriptions, config.roomName);

      if (!nextSubscription?.rid) {
        throw new Error(`Không tìm thấy room "${config.roomName}" trong danh sách subscriptions.`);
      }

      setSubscription(nextSubscription);
      roomIdRef.current = nextSubscription.rid;
      disconnectSocket();

      const socket = new WebSocket(`${serverUrl.replace(/^http/, 'ws')}/websocket`);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1', 'pre2', 'pre1'] }));

        const loginPayload = buildRocketChatLoginPayload(config.authToken);
        socket.send(JSON.stringify(loginPayload));

        if (nextSubscription.rid) {
          socket.send(JSON.stringify(buildStreamRoomSubscription(nextSubscription.rid)));
        }

        clearPingTimer();
        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ msg: 'ping' }));
          }
        }, 30000);

        setConnectionState('connecting');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;

          if (payload.msg === 'result' && payload.id === 'rocket-chat-login') {
            setConnectionState('connected');
            return;
          }

          if (payload.collection === 'stream-room-messages') {
            const message = normalizeRocketChatMessage(payload);
            if (!message || message.roomId !== nextSubscription.rid) {
              return;
            }

            setNotificationHistory((previous) => [message, ...previous.filter((item) => item.id !== message.id)].slice(0, 20));
          }
        } catch {
          // Ignore malformed payloads from websocket; app should keep the socket alive.
        }
      };

      socket.onerror = () => {
        setConnectionState('error');
        setError('WebSocket đang lỗi hoặc server không phản hồi.');
      };

      socket.onclose = () => {
        clearPingTimer();

        if (wsRef.current === socket) {
          wsRef.current = null;
        }

        if (!isManualCloseRef.current) {
          setConnectionState('idle');
          scheduleReconnect();
        }
      };

      await syncInitialHistory(nextSubscription.rid, serverUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể kết nối Rocket.Chat';
      setError(message);
      setConnectionState('error');
    }
  };

  const handleInputChange = (field: keyof typeof DEFAULT_CONFIG, value: string) => {
    setConfig((previous: typeof DEFAULT_CONFIG) => ({ ...previous, [field]: value }));
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
          <button className="button-primary" onClick={connect} type="button">
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
              onClick={() => void syncInitialHistory(subscription.rid!, normalizeServerUrl(config.serverUrl))}
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
            <span className="font-mono text-xs text-slate-300">{subscription?.rid ?? (roomIdRef.current || '—')}</span>
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
