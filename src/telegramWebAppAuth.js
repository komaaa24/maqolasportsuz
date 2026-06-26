import crypto from 'node:crypto';

const maxAuthAgeSeconds = 24 * 60 * 60;

export function validateTelegramWebAppInitData(initData, botToken, now = Math.floor(Date.now() / 1000)) {
  if (!initData || typeof initData !== 'string') {
    return null;
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));

  if (!receivedHash || !Number.isFinite(authDate)) {
    return null;
  }

  if (Math.abs(now - authDate) > maxAuthAgeSeconds) {
    return null;
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  if (!timingSafeEqualHex(calculatedHash, receivedHash)) {
    return null;
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    return null;
  }

  try {
    return {
      user: JSON.parse(userRaw),
      authDate,
    };
  } catch {
    return null;
  }
}

function timingSafeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
