import { describe, expect, it } from 'vitest';
import { extractRocketChatSubscriptions, findNotificationSubscription, normalizeRocketChatMessage } from '../rocket-chat';

describe('rocket-chat helpers', () => {
  it('finds the TMT Notification direct room by type and name', () => {
    const subscriptions = [
      { _id: '1', t: 'c', fname: 'General', rid: 'room-1' },
      { _id: '2', t: 'd', fname: 'TMT Notification', rid: 'room-notify' },
    ];

    expect(findNotificationSubscription(subscriptions)).toEqual(subscriptions[1]);
  });

  it('extracts subscriptions from the real Rocket.Chat payload shape', () => {
    const payload = {
      success: true,
      update: [
        {
          _id: 'YGiAtgqKtyFZPz8Kd',
          rid: 'AQTaazTAjatGfdbGhxNRvRbNReFBiM9Z5Q',
          fname: 'TMT Notification',
          name: 'tmt',
          t: 'd',
        },
      ],
    };

    expect(extractRocketChatSubscriptions(payload)).toHaveLength(1);
    expect(findNotificationSubscription(extractRocketChatSubscriptions(payload))).toMatchObject({
      rid: 'AQTaazTAjatGfdbGhxNRvRbNReFBiM9Z5Q',
      fname: 'TMT Notification',
    });
  });

  it('normalizes websocket room messages into a notification payload', () => {
    const payload = {
      collection: 'stream-room-messages',
      fields: {
        eventName: 'stream-room-messages',
        args: [
          {
            _id: 'msg-1',
            rid: 'room-notify',
            msg: 'New TMT alert',
            ts: { $date: '2026-10-07T09:00:00.000Z' },
            u: { _id: 'user-1', username: 'bot' },
          },
        ],
      },
    };

    expect(normalizeRocketChatMessage(payload)).toMatchObject({
      roomId: 'room-notify',
      text: 'New TMT alert',
      sender: 'bot',
    });
  });
});
