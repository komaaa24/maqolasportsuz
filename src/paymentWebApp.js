import http from 'node:http';
import { config } from './config.js';
import { messages } from './messages.js';
import {
  clearUserDraft,
  getSubmission,
  updateSubmission,
} from './storage.js';
import { validateTelegramWebAppInitData } from './telegramWebAppAuth.js';
import { parseCardInput, parseOtp } from './validators.js';

const jsonLimitBytes = 20 * 1024;

export function createPaymentWebAppUrl(submissionId) {
  if (!config.webApp.url && !config.webApp.baseUrl) {
    return null;
  }

  const url = config.webApp.url
    ? new URL(config.webApp.url)
    : new URL(config.webApp.path, config.webApp.baseUrl);

  url.searchParams.set('submission_id', submissionId);
  return url.toString();
}

export function startPaymentWebAppServer({ payme, notifyAdmin }) {
  const server = http.createServer(async (request, response) => {
    try {
      await routeRequest({ request, response, payme, notifyAdmin });
    } catch (error) {
      console.error('payment_web_app_failed', error);
      sendJson(response, 500, { ok: false, error: 'SERVER_ERROR' });
    }
  });

  server.listen(config.webApp.port, () => {
    console.log(`Payment Web App listening on port ${config.webApp.port}`);
  });

  return server;
}

async function routeRequest({ request, response, payme, notifyAdmin }) {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);

  console.log('web_app_request', {
    method: request.method,
    path: url.pathname,
    query: url.search,
  });

  if (request.method === 'GET' && isPaymentPagePath(url.pathname)) {
    sendHtml(response, renderPaymentPage());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'payment-web-app' });
    return;
  }

  if (request.method === 'POST' && isPaymentConfirmPath(url.pathname)) {
    await handlePaymentPost({ request, response, payme, notifyAdmin });
    return;
  }

  sendJson(response, 404, { ok: false, error: 'NOT_FOUND' });
}

function isPaymentPagePath(pathname) {
  return pathname === config.webApp.path || pathname === '/api/webapp/';
}

function isPaymentConfirmPath(pathname) {
  return pathname === config.webApp.apiPath || pathname === '/api/webapp/payment/confirm';
}

async function handlePaymentPost({ request, response, payme, notifyAdmin }) {
  const body = await readJsonBody(request);

  if (body.action === 'start') {
    await startCardVerification({ body, response, payme });
    return;
  }

  await confirmHoldPayment({ body, response, payme, notifyAdmin });
}

async function startCardVerification({ body, response, payme }) {
  const auth = authenticateWebApp(body.initData);
  if (!auth) {
    sendJson(response, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Telegram sessiya tasdiqlanmadi.' });
    return;
  }

  const submission = await getOwnedSubmission(body.submissionId, auth.user.id, 'awaiting_card');
  if (!submission) {
    sendJson(response, 404, { ok: false, error: 'SUBMISSION_NOT_FOUND', message: 'Buyurtma topilmadi yoki toʻlov boshlangan.' });
    return;
  }

  const card = parseCardInput(`${body.cardNumber ?? ''} ${body.cardExpire ?? ''}`);
  if (!card) {
    sendJson(response, 400, { ok: false, error: 'INVALID_CARD', message: messages.invalidCard });
    return;
  }

  try {
    const cardResult = await payme.createCard(card);
    const verifyResult = await payme.sendVerifyCode(cardResult.card.token);

    if (!verifyResult.sent) {
      throw new Error('Payme did not send verification code');
    }

    await updateSubmission(submission.id, {
      status: 'awaiting_otp',
      payment: {
        ...submission.payment,
        cardToken: cardResult.card.token,
        cardMask: cardResult.card.number,
        cardExpire: cardResult.card.expire,
      },
    });

    sendJson(response, 200, {
      ok: true,
      phone: verifyResult.phone ?? null,
      wait: verifyResult.wait ?? null,
      cardMask: cardResult.card.number ?? null,
    });
  } catch (error) {
    console.error('web_app_card_verification_start_failed', error);
    sendJson(response, 502, {
      ok: false,
      error: 'PAYME_CARD_ERROR',
      message: getPaymeErrorMessage(error),
    });
  }
}

async function confirmHoldPayment({ body, response, payme, notifyAdmin }) {
  const auth = authenticateWebApp(body.initData);
  if (!auth) {
    sendJson(response, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Telegram sessiya tasdiqlanmadi.' });
    return;
  }

  const submission = await getOwnedSubmission(body.submissionId, auth.user.id, 'awaiting_otp');
  if (!submission) {
    sendJson(response, 404, { ok: false, error: 'SUBMISSION_NOT_FOUND', message: 'Buyurtma topilmadi yoki allaqachon qayta ishlangan.' });
    return;
  }

  const code = parseOtp(String(body.otp ?? ''));
  if (!code) {
    sendJson(response, 400, { ok: false, error: 'INVALID_OTP', message: messages.invalidOtp });
    return;
  }

  try {
    const verified = await payme.verifyCard({
      token: submission.payment.cardToken,
      code,
    });

    const created = await payme.createHoldReceipt({
      submissionId: submission.id,
      userId: submission.user.id,
      planId: config.payme.planId,
      amountTiyin: submission.payment.amountTiyin,
    });

    const receiptId = created.receipt._id;
    const paid = await payme.payHoldReceipt({
      receiptId,
      token: verified.card.token,
    });

    const receipt = paid.receipt;
    if (receipt.state !== 5) {
      throw new Error(`Unexpected Payme hold state: ${receipt.state}`);
    }

    const updated = await updateSubmission(submission.id, {
      status: 'pending_review',
      payment: {
        ...submission.payment,
        cardToken: null,
        cardMask: verified.card.number,
        cardExpire: verified.card.expire,
        receiptId,
        receiptState: receipt.state,
        account: {
          user_id: String(submission.user.id),
          plan_id: String(config.payme.planId),
        },
        heldAt: new Date().toISOString(),
      },
    });

    await clearUserDraft(auth.user.id);
    await notifyAdmin(updated);

    sendJson(response, 200, { ok: true, message: messages.paymentHeld });
  } catch (error) {
    console.error('web_app_hold_payment_failed', error);
    sendJson(response, 502, {
      ok: false,
      error: 'PAYME_HOLD_ERROR',
      message: getPaymeErrorMessage(error),
    });
  }
}

function authenticateWebApp(initData) {
  const auth = validateTelegramWebAppInitData(initData, config.botToken);
  if (!auth?.user?.id) {
    return null;
  }

  return auth;
}

async function getOwnedSubmission(submissionId, userId, expectedStatus) {
  if (!submissionId || typeof submissionId !== 'string') {
    return null;
  }

  const submission = await getSubmission(submissionId);
  if (!submission || String(submission.user.id) !== String(userId)) {
    return null;
  }

  if (submission.status !== expectedStatus) {
    return null;
  }

  return submission;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > jsonLimitBytes) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody);
}

function getPaymeErrorMessage(error) {
  const message = error?.details?.message ?? error?.message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return messages.paymentError;
}

function normalizeNullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(html);
}

function renderPaymentPage() {
  const webAppApiUrl = JSON.stringify(config.webApp.apiUrl ?? config.webApp.apiPath);

  return `<!doctype html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Payme hold</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--tg-theme-bg-color, #f4f7fb);
      --text: var(--tg-theme-text-color, #182230);
      --hint: var(--tg-theme-hint-color, #667085);
      --button: var(--tg-theme-button-color, #0797d8);
      --button-text: var(--tg-theme-button-text-color, #ffffff);
      --field: var(--tg-theme-secondary-bg-color, #ffffff);
      --border: rgba(102, 112, 133, 0.22);
      --danger: #d92d20;
      --success: #027a48;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(460px, 100%);
      margin: 0 auto;
      padding: 18px 16px 28px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 4px 0 18px;
    }
    .mark {
      width: 76px;
      height: 38px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--button);
      color: var(--button-text);
      font-weight: 800;
      font-size: 17px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    .sub {
      margin: 3px 0 0;
      color: var(--hint);
      font-size: 13px;
      line-height: 1.4;
    }
    form {
      display: grid;
      gap: 14px;
      margin-top: 16px;
    }
    label {
      display: grid;
      gap: 7px;
      font-size: 13px;
      color: var(--hint);
    }
    input {
      width: 100%;
      height: 48px;
      padding: 0 13px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--field);
      color: var(--text);
      font-size: 18px;
      letter-spacing: 0;
      outline: none;
    }
    input:focus {
      border-color: var(--button);
      box-shadow: 0 0 0 3px rgba(7, 151, 216, 0.14);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    button {
      width: 100%;
      height: 48px;
      border: 0;
      border-radius: 8px;
      background: var(--button);
      color: var(--button-text);
      font-size: 16px;
      font-weight: 700;
    }
    button:disabled {
      opacity: 0.6;
    }
    .message {
      min-height: 22px;
      margin-top: 14px;
      font-size: 14px;
      line-height: 1.45;
      color: var(--hint);
      white-space: pre-line;
    }
    .message.error { color: var(--danger); }
    .message.success { color: var(--success); }
    .notice {
      margin-top: 14px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--field);
      color: var(--hint);
      font-size: 12px;
      line-height: 1.45;
    }
    .notice a {
      color: var(--button);
      text-decoration: none;
      font-weight: 700;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <div class="mark">payme</div>
      <div>
        <h1>Payme hold to'lovi</h1>
        <p class="sub">Powered by Payme</p>
      </div>
    </div>

    <form id="cardForm" autocomplete="off">
      <label>
        Karta raqami
        <input id="cardNumber" inputmode="numeric" autocomplete="cc-number" placeholder="8600 0000 0000 0000" maxlength="19" required>
      </label>
      <label>
        Amal qilish muddati
        <input id="cardExpire" inputmode="numeric" autocomplete="cc-exp" placeholder="03/29" maxlength="5" required>
      </label>
      <button id="cardButton" type="submit">SMS kod olish</button>
    </form>

    <form id="otpForm" class="hidden" autocomplete="off">
      <label>
        SMS kod
        <input id="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="8" required>
      </label>
      <button id="otpButton" type="submit">Hold qilish</button>
    </form>

    <div id="message" class="message"></div>
    <div class="notice">
      Karta ma'lumotlari bizning serverda saqlanmaydi. Karta Payme Business orqali tokenlanadi, bot serveri faqat Payme token bilan hold to'lovini yakunlaydi.
      <a href="https://cdn.payme.uz/terms/main.html?target=_blank" target="_blank" rel="noopener noreferrer">Payme ofertasi</a>
    </div>
  </main>

  <script>
    const WEB_APP_API_URL = ${webAppApiUrl};
    const tg = window.Telegram?.WebApp;
    const params = new URLSearchParams(window.location.search);
    const submissionId = params.get('submission_id');
    const message = document.getElementById('message');
    const cardForm = document.getElementById('cardForm');
    const otpForm = document.getElementById('otpForm');
    const cardNumber = document.getElementById('cardNumber');
    const cardExpire = document.getElementById('cardExpire');
    const otp = document.getElementById('otp');
    const cardButton = document.getElementById('cardButton');
    const otpButton = document.getElementById('otpButton');

    tg?.ready();
    tg?.expand();

    if (!tg?.initData || !submissionId) {
      setMessage('Bu oynani Telegram bot ichidagi to\\'lov tugmasi orqali oching.', 'error');
      cardButton.disabled = true;
    }

    cardNumber.addEventListener('input', () => {
      const digits = cardNumber.value.replace(/\\D/g, '').slice(0, 16);
      cardNumber.value = digits.replace(/(.{4})/g, '$1 ').trim();
    });

    cardExpire.addEventListener('input', () => {
      const digits = cardExpire.value.replace(/\\D/g, '').slice(0, 4);
      cardExpire.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
    });

    otp.addEventListener('input', () => {
      otp.value = otp.value.replace(/\\D/g, '').slice(0, 8);
    });

    cardForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitCard();
    });

    otpForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitOtp();
    });

    async function submitCard() {
      setBusy(cardButton, true);
      setMessage('Karta Payme orqali tokenlanmoqda...');
      try {
        const card = parseCard();
        if (!card) throw new Error('Karta maʼlumoti notoʻgʻri. Format: 8600123412341234 03/29');

        const result = await postJson(WEB_APP_API_URL, {
          action: 'start',
          initData: tg.initData,
          submissionId,
          cardNumber: card.number,
          cardExpire: card.expire,
        });

        if (!result.ok) throw new Error(result.message || 'SMS kod yuborilmadi.');

        cardForm.classList.add('hidden');
        otpForm.classList.remove('hidden');
        otp.focus();
        const seconds = result.wait ? Math.ceil(result.wait / 1000) : null;
        setMessage('SMS kod ' + (result.phone || 'kartaga ulangan telefon raqamiga') + ' yuborildi.' + (seconds ? '\\nKod muddati: ' + seconds + ' soniya.' : ''));
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        setBusy(cardButton, false);
      }
    }

    async function submitOtp() {
      setBusy(otpButton, true);
      setMessage('Hold bajarilmoqda...');
      try {
        const result = await postJson(WEB_APP_API_URL, {
          action: 'confirm',
          initData: tg.initData,
          submissionId,
          otp: otp.value,
        });

        if (!result.ok) throw new Error(result.message || 'Hold bajarilmadi.');

        otpForm.classList.add('hidden');
        setMessage(result.message, 'success');
        tg?.MainButton.setText('Yopish');
        tg?.MainButton.show();
        tg?.MainButton.onClick(() => tg.close());
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        setBusy(otpButton, false);
      }
    }

    function parseCard() {
      const number = cardNumber.value.replace(/\\D/g, '');
      const expire = cardExpire.value.replace(/\\D/g, '');
      const month = Number(expire.slice(0, 2));
      if (!/^\\d{16}$/.test(number) || !/^\\d{4}$/.test(expire) || month < 1 || month > 12) {
        return null;
      }
      return { number, expire };
    }

    async function postJson(url, payload) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.json();
    }

    function setBusy(button, busy) {
      button.disabled = busy;
    }

    function setMessage(text, type) {
      message.textContent = text || '';
      message.className = 'message' + (type ? ' ' + type : '');
    }
  </script>
</body>
</html>`;
}
