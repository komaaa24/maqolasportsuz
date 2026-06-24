import 'dotenv/config';
import path from 'node:path';

const required = [
  'BOT_TOKEN',
  'ADMIN_CHAT_ID',
  'PAYME_MERCHANT_ID',
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

const paymeMode = process.env.PAYME_MODE ?? 'production';
const paymeCheckoutUrl = firstNonEmpty(
  process.env.PAYME_CHECKOUT_URL,
  paymeMode === 'test' ? 'https://test.paycom.uz' : 'https://checkout.paycom.uz',
);
const paymeMerchantApiKey = firstNonEmpty(
  process.env.PAYME_MERCHANT_API_KEY,
  paymeMode === 'test' ? process.env.PAYME_PASSWORD_TEST : process.env.PAYME_PASSWORD,
  process.env.PAYME_PASSWORD,
  process.env.PAYME_SECRET_KEY,
);

if (!paymeMerchantApiKey) {
  throw new Error('Missing Payme password: set PAYME_PASSWORD or PAYME_MERCHANT_API_KEY');
}

if (['secret_key_from_payme', 'production_key_password_from_payme', 'test_key_password_from_payme'].includes(paymeMerchantApiKey)) {
  throw new Error('PAYME_PASSWORD is still a placeholder. Put the real Payme cashbox key-password into .env');
}

export const config = {
  botToken: process.env.BOT_TOKEN,
  adminChatId: process.env.ADMIN_CHAT_ID,
  adminChatIds: process.env.ADMIN_CHAT_ID.split(',').map((id) => id.trim()).filter(Boolean),
  payme: {
    merchantId: process.env.PAYME_MERCHANT_ID,
    mode: paymeMode,
    checkoutUrl: paymeCheckoutUrl,
    returnUrl: firstNonEmpty(process.env.PAYME_RETURN_URL, null),
    merchantApiLogin: firstNonEmpty(process.env.PAYME_MERCHANT_API_LOGIN, process.env.PAYME_LOGIN, 'Paycom'),
    merchantApiKey: paymeMerchantApiKey,
    serviceTitle: process.env.PAYME_SERVICE_TITLE ?? 'Maqola tekshirish xizmati',
    detailCode: process.env.PAYME_DETAIL_CODE ?? '10305001001000000',
    detailPackageCode: process.env.PAYME_DETAIL_PACKAGE_CODE ?? '123456',
    detailVatPercent: Number(process.env.PAYME_DETAIL_VAT_PERCENT ?? 0),
  },
  server: {
    port: Number(process.env.PORT ?? 8382),
    paymePath: process.env.PAYME_MERCHANT_API_PATH ?? '/api/payme',
  },
  submissionPriceUzs: priceUzs,
  submissionAmountTiyin: Math.round(priceUzs * 100),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  logDir: path.resolve(process.env.LOG_DIR ?? './logs'),
  maxFileSizeBytes: Math.round(maxFileSizeMb * 1024 * 1024),
};

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}
