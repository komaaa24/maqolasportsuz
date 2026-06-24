import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BOT_TOKEN ??= '123:test';
process.env.ADMIN_CHAT_ID ??= '1';
process.env.PAYME_MERCHANT_ID ??= 'merchant-id';
process.env.PAYME_PASSWORD ??= 'test-payme-password';
process.env.SUBMISSION_PRICE_UZS ??= '50000';

const { createPaymeCheckoutUrl } = await import('../src/paymeCheckout.js');

test('creates Payme checkout URL without collecting card data in bot', () => {
  const url = createPaymeCheckoutUrl({
    id: 'mql_test_1',
    payment: {
      amountTiyin: 5000000,
    },
  });

  const encoded = url.split('/').at(-1);
  const decoded = Buffer.from(decodeURIComponent(encoded), 'base64').toString('utf8');

  assert.match(url, /^https:\/\/checkout\.paycom\.uz\//);
  assert.match(decoded, /m=/);
  assert.match(decoded, /ac\.order_id=mql_test_1/);
  assert.match(decoded, /a=5000000/);
  assert.match(decoded, /l=uz/);
  assert.doesNotMatch(decoded, /card/i);
  assert.doesNotMatch(decoded, /8600123412341234/);
});
