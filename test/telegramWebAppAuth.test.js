import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateTelegramWebAppInitData } from '../src/telegramWebAppAuth.js';

test('validates Telegram Web App init data signature', () => {
  const botToken = '123456:bot-token';
  const initData = buildInitData({
    botToken,
    params: {
      auth_date: '1800000000',
      query_id: 'query-id',
      user: JSON.stringify({ id: 7789445876, first_name: 'Ali' }),
    },
  });

  const auth = validateTelegramWebAppInitData(initData, botToken, 1800000005);

  assert.equal(auth.user.id, 7789445876);
  assert.equal(auth.authDate, 1800000000);
});

test('rejects tampered Telegram Web App init data', () => {
  const botToken = '123456:bot-token';
  const initData = buildInitData({
    botToken,
    params: {
      auth_date: '1800000000',
      user: JSON.stringify({ id: 7789445876 }),
    },
  });

  const tampered = initData.replace('7789445876', '1');

  assert.equal(validateTelegramWebAppInitData(tampered, botToken, 1800000005), null);
});

function buildInitData({ botToken, params }) {
  const dataCheckString = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const searchParams = new URLSearchParams(params);
  searchParams.set('hash', hash);

  return searchParams.toString();
}
