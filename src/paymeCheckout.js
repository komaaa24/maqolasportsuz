import { config } from './config.js';

export function createPaymeCheckoutUrl(submission) {
  const params = [
    `m=${config.payme.merchantId}`,
    `ac.order_id=${submission.id}`,
    `a=${submission.payment.amountTiyin}`,
    'l=uz',
    'cr=860',
    'ct=15000',
  ];

  if (config.payme.returnUrl) {
    params.push(`c=${encodeParam(config.payme.returnUrl)}`);
  }

  const encoded = Buffer.from(params.join(';'), 'utf8').toString('base64');
  return `${config.payme.checkoutUrl.replace(/\/$/, '')}/${encodeURIComponent(encoded)}`;
}

function encodeParam(value) {
  return encodeURIComponent(value).replace(/%20/g, '+');
}
