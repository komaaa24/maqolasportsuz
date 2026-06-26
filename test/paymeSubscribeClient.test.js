import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymeSubscribeClient } from '../src/paymeSubscribeClient.js';

test('builds Payme Subscribe API hold requests according to documentation', async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ url, options, payload });

    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: payload.id,
      result: responseFor(payload.method),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PaymeSubscribeClient({
    endpoint: 'https://checkout.paycom.uz/api',
    merchantId: 'merchant-id',
    password: 'merchant-password',
    serviceTitle: 'Maqola tekshirish xizmati',
    detailCode: '10305001001000000',
    detailPackageCode: '123456',
    detailVatPercent: 0,
  });

  await client.createCard({ number: '8600123412341234', expire: '0329' });
  await client.sendVerifyCode('card-token');
  await client.verifyCard({ token: 'card-token', code: '123456' });
  await client.createHoldReceipt({
    submissionId: 'mql_1',
    userId: '7789445876',
    planId: 'article_review',
    amountTiyin: 5000000,
  });
  await client.payHoldReceipt({ receiptId: 'receipt-id', token: 'verified-token' });
  await client.checkReceipt('receipt-id');
  await client.confirmHold('receipt-id');
  await client.cancelReceipt('receipt-id');

  const byMethod = Object.fromEntries(calls.map((call) => [call.payload.method, call]));

  assert.equal(byMethod['cards.create'].options.headers['X-Auth'], 'merchant-id');
  assert.equal(byMethod['cards.get_verify_code'].options.headers['X-Auth'], 'merchant-id');
  assert.equal(byMethod['cards.verify'].options.headers['X-Auth'], 'merchant-id');

  assert.equal(byMethod['receipts.create'].options.headers['X-Auth'], 'merchant-id:merchant-password');
  assert.equal(byMethod['receipts.pay'].options.headers['X-Auth'], 'merchant-id:merchant-password');
  assert.equal(byMethod['receipts.check'].options.headers['X-Auth'], 'merchant-id:merchant-password');
  assert.equal(byMethod['receipts.confirm_hold'].options.headers['X-Auth'], 'merchant-id:merchant-password');
  assert.equal(byMethod['receipts.cancel'].options.headers['X-Auth'], 'merchant-id:merchant-password');

  assert.equal(byMethod['receipts.create'].payload.params.hold, true);
  assert.equal(byMethod['receipts.create'].payload.params.amount, 5000000);
  assert.equal(byMethod['receipts.create'].payload.params.account.user_id, '7789445876');
  assert.equal(byMethod['receipts.create'].payload.params.account.plan_id, 'article_review');
  assert.equal(byMethod['receipts.create'].payload.params.account.order_id, undefined);
  assert.equal(byMethod['receipts.pay'].payload.params.hold, true);
  assert.equal(byMethod['receipts.pay'].payload.params.id, 'receipt-id');
  assert.equal(byMethod['receipts.pay'].payload.params.token, 'verified-token');
  assert.equal(byMethod['receipts.confirm_hold'].payload.params.id, 'receipt-id');
  assert.equal(byMethod['receipts.cancel'].payload.params.id, 'receipt-id');
});

function responseFor(method) {
  if (method === 'cards.get_verify_code') {
    return { sent: true, phone: '99890*****31', wait: 60000 };
  }

  if (method.startsWith('cards.')) {
    return {
      card: {
        number: '860012******1234',
        expire: '03/29',
        token: method === 'cards.verify' ? 'verified-token' : 'card-token',
        recurrent: true,
        verify: method === 'cards.verify',
      },
    };
  }

  if (method === 'receipts.check') {
    return { state: 5 };
  }

  return {
    receipt: {
      _id: 'receipt-id',
      state: method === 'receipts.confirm_hold' ? 4 : 5,
    },
  };
}
