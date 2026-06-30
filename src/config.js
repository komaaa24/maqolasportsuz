import 'dotenv/config';
import path from 'node:path';

const required = [
  'BOT_TOKEN',
  'ADMIN_CHAT_ID',
  'PAYME_MERCHANT_ID',
  'PAYME_PLAN_ID',
  'SUBMISSION_PRICE_UZS',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const priceUzs = Number(process.env.SUBMISSION_PRICE_UZS);
if (!Number.isFinite(priceUzs) || priceUzs <= 0) {
  throw new Error('SUBMISSION_PRICE_UZS must be a positive number');
}

const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB ?? 20);
if (!Number.isFinite(maxFileSizeMb) || maxFileSizeMb <= 0) {
  throw new Error('MAX_FILE_SIZE_MB must be a positive number');
}

const webAppUrl = normalizeFullUrl(firstNonEmpty(process.env.WEB_APP_URL, null));
const webAppApiUrl = normalizeFullUrl(firstNonEmpty(process.env.WEB_APP_API_URL, null));
const webAppPort = Number(process.env.WEB_APP_PORT ?? 3000);
if (!Number.isInteger(webAppPort) || webAppPort <= 0 || webAppPort > 65535) {
  throw new Error('WEB_APP_PORT must be a valid TCP port');
}

const databaseUrl = firstNonEmpty(process.env.DATABASE_URL, null);
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL for PostgreSQL storage');
}

const paymeMode = process.env.PAYME_MODE ?? 'production';
const paymeSubscribeApiUrl = firstNonEmpty(
  process.env.PAYME_SUBSCRIBE_API_URL,
  paymeMode === 'test' ? 'https://checkout.test.paycom.uz/api' : 'https://checkout.paycom.uz/api',
);
const paymeCashboxPassword = firstNonEmpty(
  paymeMode === 'test' ? process.env.PAYME_PASSWORD_TEST : process.env.PAYME_PASSWORD,
  process.env.PAYME_PASSWORD,
  process.env.PAYME_SECRET_KEY,
);

if (!paymeCashboxPassword) {
  throw new Error('Missing Payme password: set PAYME_PASSWORD or PAYME_MERCHANT_API_KEY');
}

if (['secret_key_from_payme', 'production_key_password_from_payme', 'test_key_password_from_payme'].includes(paymeCashboxPassword)) {
  throw new Error('PAYME_PASSWORD is still a placeholder. Put the real Payme cashbox key-password into .env');
}

export const config = {
  botToken: process.env.BOT_TOKEN,
  adminChatId: process.env.ADMIN_CHAT_ID,
  adminChatIds: process.env.ADMIN_CHAT_ID.split(',').map((id) => id.trim()).filter(Boolean),
  payme: {
    merchantId: process.env.PAYME_MERCHANT_ID,
    planId: process.env.PAYME_PLAN_ID,
    mode: paymeMode,
    subscribeApiUrl: paymeSubscribeApiUrl,
    merchantApiLogin: firstNonEmpty(process.env.PAYME_MERCHANT_API_LOGIN, process.env.PAYME_LOGIN, 'Paycom'),
    cashboxPassword: paymeCashboxPassword,
    serviceTitle: process.env.PAYME_SERVICE_TITLE ?? 'Maqola tekshirish xizmati',
    detailCode: process.env.PAYME_DETAIL_CODE ?? '10305001001000000',
    detailPackageCode: process.env.PAYME_DETAIL_PACKAGE_CODE ?? '123456',
    detailVatPercent: Number(process.env.PAYME_DETAIL_VAT_PERCENT ?? 0),
  },
  submissionPriceUzs: priceUzs,
  submissionAmountTiyin: Math.round(priceUzs * 100),
  databaseUrl,
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  maxFileSizeBytes: Math.round(maxFileSizeMb * 1024 * 1024),
  webApp: {
    url: webAppUrl,
    baseUrl: normalizeBaseUrl(firstNonEmpty(process.env.WEB_APP_BASE_URL, null)),
    path: normalizePath(process.env.WEB_APP_PATH ?? getPathFromUrl(webAppUrl) ?? '/pay/card'),
    apiUrl: webAppApiUrl,
    apiPath: normalizePath(process.env.WEB_APP_API_PATH ?? getPathFromUrl(webAppApiUrl) ?? '/api/webapp/payment/confirm'),
    port: webAppPort,
  },
};

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function normalizeBaseUrl(value) {
  if (!value) {
    return null;
  }

  return String(value).replace(/\/+$/, '');
}

function normalizePath(value) {
  const normalized = String(value || '/pay/card').trim();
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeFullUrl(value) {
  if (!value) {
    return null;
  }

  const url = new URL(String(value).trim());
  if (url.protocol !== 'https:') {
    throw new Error(`${url.toString()} must use HTTPS`);
  }

  return url.toString().replace(/[?&]$/, '');
}

function getPathFromUrl(value) {
  if (!value) {
    return null;
  }

  return new URL(value).pathname;
}
