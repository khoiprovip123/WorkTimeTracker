export interface RocketChatSubscription {
  _id?: string;
  rid?: string;
  t?: string;
  fname?: string;
  name?: string;
}

export interface RocketChatNotificationMessage {
  id: string;
  roomId: string;
  text: string;
  createdAt: string;
  sender: string;
}

export function extractRocketChatSubscriptions(payload: unknown): RocketChatSubscription[] {
  const response = payload as {
    subscriptions?: RocketChatSubscription[];
    result?: RocketChatSubscription[];
    update?: RocketChatSubscription[];
  };

  if (Array.isArray(payload)) return payload as RocketChatSubscription[];
  if (Array.isArray(response?.subscriptions)) return response.subscriptions;
  if (Array.isArray(response?.result)) return response.result;
  if (Array.isArray(response?.update)) return response.update;
  return [];
}

export function findNotificationSubscription(
  subscriptions: RocketChatSubscription[] = [],
  targetName = 'TMT Notification',
): RocketChatSubscription | null {
  const normalizedTarget = targetName.trim().toLowerCase();

  return subscriptions.find((subscription) => {
    const type = subscription.t ?? '';
    const fname = (subscription.fname ?? '').trim();
    const name = (subscription.name ?? '').trim();
    const candidate = fname ? fname : name;
    const normalizedCandidate = candidate.toLowerCase();

    return type === 'd' && (normalizedCandidate === normalizedTarget || normalizedCandidate.includes(normalizedTarget));
  }) ?? null;
}

export function buildStreamRoomSubscription(roomId: string) {
  return {
    msg: 'sub',
    id: 'stream-room-messages',
    name: 'stream-room-messages',
    params: [roomId, false],
  };
}

export function buildRocketChatLoginPayload(token: string) {
  return {
    msg: 'method',
    method: 'login',
    id: 'rocket-chat-login',
    params: [{ resume: token }],
  };
}

export function normalizeRocketChatMessage(payload: unknown): RocketChatNotificationMessage | null {
  const item = (payload as any)?.fields?.args?.[0] ?? (payload as any)?.args?.[0] ?? (payload as any)?.data ?? (payload as any);

  if (!item || typeof item !== 'object') {
    return null;
  }

  const roomId = item.rid ?? (payload as any)?.fields?.rid ?? '';
  const text = typeof item.msg === 'string' ? item.msg : typeof item.text === 'string' ? item.text : '';

  if (!roomId || !text) {
    return null;
  }

  const ts = item.ts;
  const createdAt = typeof ts === 'object' && ts !== null && '$date' in ts ? String((ts as { $date?: string }).$date ?? new Date().toISOString()) : (typeof ts === 'string' ? ts : new Date().toISOString());

  return {
    id: String((item as any)._id ?? `${roomId}-${createdAt}`),
    roomId: String(roomId),
    text,
    createdAt,
    sender: (item as any)?.u?.username ?? (item as any)?.user?.username ?? 'unknown',
  };
}
