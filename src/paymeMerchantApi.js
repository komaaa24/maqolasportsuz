import express from 'express';
import { config } from './config.js';
import {
  findSubmissionByPaymeTransactionId,
  getSubmission,
  updateSubmission,
} from './storage.js';

const errors = {
  invalidAmount: (id) => rpcError(id, -31001, 'Invalid amount', 'amount'),
  orderNotFound: (id) => rpcError(id, -31050, 'Order not found', 'order_id'),
  transactionNotFound: (id) => rpcError(id, -31003, 'Transaction not found'),
  cannotPerform: (id) => rpcError(id, -31008, 'Cannot perform operation'),
  delivered: (id) => rpcError(id, -31007, 'Order delivered. Cannot cancel transaction'),
  unauthorized: (id) => rpcError(id, -32504, 'Insufficient privileges'),
  methodNotFound: (id, method) => rpcError(id, -32601, 'Method not found', method),
  system: (id) => rpcError(id, -32400, 'System error'),
};

export function startPaymeMerchantApi({ bot, notifyAdmin }) {
  const app = express();
  app.use(express.json({ type: '*/*' }));

  app.get(config.server.paymePath, (req, res) => {
    res.json({
      ok: true,
      service: 'maqola-payme-merchant-api',
      path: config.server.paymePath,
      mode: config.payme.mode,
    });
  });

  app.post(config.server.paymePath, async (req, res) => {
    const requestId = req.body?.id ?? null;

    console.log('payme_merchant_api_request', {
      method: req.body?.method,
      requestId,
      account: req.body?.params?.account,
      amount: req.body?.params?.amount,
    });

    if (!isAuthorized(req.headers.authorization)) {
      console.warn('payme_merchant_api_unauthorized', {
        requestId,
        method: req.body?.method,
      });
      res.json(errors.unauthorized(requestId));
      return;
    }

    try {
      const result = await handlePaymeRequest(req.body, { bot, notifyAdmin });
      res.json({ result, id: requestId });
    } catch (error) {
      if (error?.rpcError) {
        res.json(error.rpcError);
        return;
      }

      console.error('payme_merchant_api_failed', error);
      res.json(errors.system(requestId));
    }
  });

  app.use(config.server.paymePath, (req, res) => {
    res.json(rpcError(null, -32300, 'Method must be POST'));
  });

  const server = app.listen(config.server.port, () => {
    console.log(`Payme Merchant API listening on ${config.server.paymePath} port ${config.server.port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${config.server.port} band. Eski bot processini to'xtating yoki PORT ni o'zgartiring.`);
      process.exit(1);
    }

    console.error('Payme Merchant API server error', error);
    process.exit(1);
  });

  return server;
}

async function handlePaymeRequest(body, context) {
  switch (body.method) {
    case 'CheckPerformTransaction':
      return checkPerformTransaction(body);
    case 'CreateTransaction':
      return createTransaction(body);
    case 'PerformTransaction':
      return performTransaction(body, context);
    case 'CancelTransaction':
      return cancelTransaction(body);
    case 'CheckTransaction':
      return checkTransaction(body);
    default:
      throwRpc(errors.methodNotFound(body.id, body.method));
  }
}

function checkPerformTransaction(body) {
  const submission = getValidSubmissionForPayment(body);

  return {
    allow: true,
    detail: createReceiptDetail(submission),
  };
}

async function createTransaction(body) {
  const submission = getValidSubmissionForPayment(body);
  const existingByPaymeId = findSubmissionByPaymeTransactionId(body.params.id);

  if (existingByPaymeId) {
    return formatTransaction(existingByPaymeId.payment.transaction);
  }

  if (submission.payment.transaction && ![-1, -2].includes(submission.payment.transaction.state)) {
    throwRpc(errors.cannotPerform(body.id));
  }

  const transaction = {
    paymeId: body.params.id,
    merchantId: `txn_${submission.id}`,
    createTime: Date.now(),
    performTime: 0,
    cancelTime: 0,
    state: 1,
    reason: null,
    amountTiyin: body.params.amount,
    paymeCreateTime: body.params.time,
  };

  await updateSubmission(submission.id, {
    status: 'payment_created',
    payment: {
      ...submission.payment,
      transaction,
    },
  });

  return formatTransaction(transaction);
}

async function performTransaction(body, context) {
  const submission = findSubmissionByPaymeTransactionId(body.params.id);
  if (!submission?.payment?.transaction) {
    throwRpc(errors.transactionNotFound(body.id));
  }

  const transaction = submission.payment.transaction;
  if (transaction.state === 2) {
    return formatTransaction(transaction);
  }

  if (transaction.state !== 1) {
    throwRpc(errors.cannotPerform(body.id));
  }

  const updatedTransaction = {
    ...transaction,
    performTime: Date.now(),
    state: 2,
  };

  const updated = await updateSubmission(submission.id, {
    status: 'pending_review',
    payment: {
      ...submission.payment,
      transaction: updatedTransaction,
      paidAt: new Date().toISOString(),
    },
  });

  void Promise.all([
    context.notifyAdmin(updated),
    context.bot.api.sendMessage(updated.user.id, 'Toʻlov qabul qilindi. Maqolangiz admin ko‘rib chiqishiga yuborildi.'),
  ]).catch((error) => {
    console.error('payme_post_payment_notification_failed', error);
  });

  return formatTransaction(updatedTransaction);
}

async function cancelTransaction(body) {
  const submission = findSubmissionByPaymeTransactionId(body.params.id);
  if (!submission?.payment?.transaction) {
    throwRpc(errors.transactionNotFound(body.id));
  }

  const transaction = submission.payment.transaction;
  if (submission.status === 'approved' && transaction.state === 2) {
    throwRpc(errors.delivered(body.id));
  }

  if (transaction.state === -1 || transaction.state === -2) {
    return formatTransaction(transaction);
  }

  const updatedTransaction = {
    ...transaction,
    cancelTime: Date.now(),
    state: transaction.state === 2 ? -2 : -1,
    reason: body.params.reason,
  };

  const nextStatus = transaction.state === 2 ? 'refunded' : 'payment_cancelled';
  await updateSubmission(submission.id, {
    status: nextStatus,
    payment: {
      ...submission.payment,
      transaction: updatedTransaction,
      cancelledAt: new Date().toISOString(),
    },
  });

  return formatTransaction(updatedTransaction);
}

function checkTransaction(body) {
  const submission = findSubmissionByPaymeTransactionId(body.params.id);
  if (!submission?.payment?.transaction) {
    throwRpc(errors.transactionNotFound(body.id));
  }

  return formatTransaction(submission.payment.transaction);
}

function getValidSubmissionForPayment(body) {
  const orderId = body.params?.account?.order_id;
  const submission = getSubmission(orderId);

  if (!submission) {
    throwRpc(errors.orderNotFound(body.id));
  }

  if (body.params.amount !== submission.payment.amountTiyin) {
    throwRpc(errors.invalidAmount(body.id));
  }

  if (!['awaiting_payment', 'payment_created', 'payment_cancelled'].includes(submission.status)) {
    throwRpc(errors.cannotPerform(body.id));
  }

  return submission;
}

function formatTransaction(transaction) {
  return {
    create_time: transaction.createTime,
    perform_time: transaction.performTime,
    cancel_time: transaction.cancelTime,
    transaction: transaction.merchantId,
    state: transaction.state,
    reason: transaction.reason,
  };
}

function createReceiptDetail(submission) {
  return {
    receipt_type: 0,
    items: [
      {
        title: config.payme.serviceTitle,
        price: submission.payment.amountTiyin,
        count: 1,
        code: config.payme.detailCode,
        package_code: config.payme.detailPackageCode,
        vat_percent: config.payme.detailVatPercent,
      },
    ],
  };
}

function isAuthorized(header) {
  if (!header?.startsWith('Basic ')) {
    return false;
  }

  const expected = `${config.payme.merchantApiLogin}:${config.payme.merchantApiKey}`;
  const actual = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  return actual === expected;
}

function rpcError(id, code, message, data) {
  return {
    error: {
      code,
      message,
      data,
    },
    id,
  };
}

function throwRpc(rpcErrorResponse) {
  const error = new Error('Payme RPC error');
  error.rpcError = rpcErrorResponse;
  throw error;
}
