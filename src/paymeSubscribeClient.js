export class PaymeSubscribeClient {
  constructor({ endpoint, merchantId, password, serviceTitle, detailCode, detailPackageCode, detailVatPercent }) {
    this.endpoint = endpoint;
    this.merchantId = merchantId;
    this.password = password;
    this.serviceTitle = serviceTitle;
    this.detailCode = detailCode;
    this.detailPackageCode = detailPackageCode;
    this.detailVatPercent = detailVatPercent;
  }

  async createCard({ number, expire }) {
    return this.call('cards.create', {
      card: { number, expire },
      save: false,
    }, 'card');
  }

  async sendVerifyCode(token) {
    return this.call('cards.get_verify_code', { token }, 'card');
  }

  async verifyCard({ token, code }) {
    return this.call('cards.verify', { token, code }, 'card');
  }

  async createHoldReceipt({ submissionId, userId, planId, amountTiyin }) {
    return this.call('receipts.create', {
      amount: amountTiyin,
      account: {
        user_id: String(userId),
        plan_id: String(planId),
      },
      description: `${this.serviceTitle}: ${submissionId}`,
      hold: true,
      detail: {
        receipt_type: 0,
        items: [
          {
            title: this.serviceTitle,
            price: amountTiyin,
            count: 1,
            code: this.detailCode,
            package_code: this.detailPackageCode,
            vat_percent: this.detailVatPercent,
          },
        ],
      },
    }, 'receipt');
  }

  async payHoldReceipt({ receiptId, token }) {
    return this.call('receipts.pay', {
      id: receiptId,
      token,
      hold: true,
    }, 'receipt');
  }

  async checkReceipt(receiptId) {
    return this.call('receipts.check', { id: receiptId }, 'receipt');
  }

  async confirmHold(receiptId) {
    return this.call('receipts.confirm_hold', { id: receiptId }, 'receipt');
  }

  async cancelReceipt(receiptId) {
    return this.call('receipts.cancel', { id: receiptId }, 'receipt');
  }

  async call(method, params, authMode) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Auth': this.getAuth(authMode),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new PaymeSubscribeError(`Payme HTTP ${response.status}`, body);
    }

    if (!body || body.error) {
      throw new PaymeSubscribeError(body?.error?.message ?? `Payme ${method} failed`, body?.error ?? body);
    }

    return body.result;
  }

  getAuth(authMode) {
    if (authMode === 'card') {
      return this.merchantId;
    }

    return `${this.merchantId}:${this.password}`;
  }
}

export class PaymeSubscribeError extends Error {
  constructor(message, details) {
    super(typeof message === 'string' ? message : JSON.stringify(message));
    this.name = 'PaymeSubscribeError';
    this.details = details;
  }
}
