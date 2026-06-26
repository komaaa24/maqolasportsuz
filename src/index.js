import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config } from './config.js';
import { messages, formatUzs } from './messages.js';
import { PaymeSubscribeClient } from './paymeSubscribeClient.js';
import {
  clearUserDraft,
  closeStorage,
  createSubmission,
  getFilesDir,
  getSubmission,
  getUserDraft,
  initStorage,
  listUserSubmissions,
  saveUserDraft,
  updateSubmission,
} from './storage.js';
import { getExtension, isAllowedDocument, parseCardInput, parseOtp } from './validators.js';

const bot = new Bot(config.botToken);
const payme = new PaymeSubscribeClient({
  endpoint: config.payme.subscribeApiUrl,
  merchantId: config.payme.merchantId,
  password: config.payme.cashboxPassword,
  serviceTitle: config.payme.serviceTitle,
  detailCode: config.payme.detailCode,
  detailPackageCode: config.payme.detailPackageCode,
  detailVatPercent: config.payme.detailVatPercent,
});

bot.command('start', async (ctx) => {
  await ctx.reply(messages.start);
});

bot.command('new', async (ctx) => {
  await clearUserDraft(ctx.from.id);
  await ctx.reply(messages.sendDocument);
});

bot.command('status', async (ctx) => {
  const submissions = (await listUserSubmissions(ctx.from.id)).slice(0, 5);

  if (submissions.length === 0) {
    await ctx.reply('Hali maqola yuborilmagan.');
    return;
  }

  const lines = submissions.map((submission) => {
    return `${submission.id}: ${statusLabel(submission.status)} (${submission.file.originalName})`;
  });

  await ctx.reply(lines.join('\n'));
});

bot.on('message:document', async (ctx) => {
  const document = ctx.message.document;

  if (!isAllowedDocument(document)) {
    await ctx.reply(messages.invalidDocument);
    return;
  }

  if (document.file_size > config.maxFileSizeBytes) {
    await ctx.reply(messages.fileTooLarge);
    return;
  }

  const submissionId = createSubmissionId();
  const ext = getExtension(document.file_name) || '.bin';
  const storedName = `${submissionId}${ext}`;
  const storedPath = path.join(getFilesDir(), storedName);

  try {
    await downloadTelegramFile(ctx, document.file_id, storedPath);

    const submission = await createSubmission({
      id: submissionId,
      status: 'awaiting_card',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        id: ctx.from.id,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        lastName: ctx.from.last_name ?? null,
      },
      file: {
        telegramFileId: document.file_id,
        originalName: document.file_name ?? storedName,
        mimeType: document.mime_type ?? null,
        size: document.file_size,
        path: storedPath,
      },
      payment: {
        amountUzs: config.submissionPriceUzs,
        amountTiyin: config.submissionAmountTiyin,
      },
    });

    await saveUserDraft(ctx.from.id, {
      step: 'card',
      submissionId: submission.id,
    });

    await ctx.reply(messages.askCard);
  } catch (error) {
    console.error('document_handling_failed', error);
    await ctx.reply('Faylni qabul qilishda xatolik yuz berdi. Qayta yuborib ko‘ring.');
  }
});

bot.on('message:text', async (ctx) => {
  const draft = await getUserDraft(ctx.from.id);

  if (!draft) {
    await ctx.reply(messages.sendDocument);
    return;
  }

  if (draft.step === 'card') {
    await handleCardInput(ctx, draft);
    return;
  }

  if (draft.step === 'otp') {
    await handleOtpInput(ctx, draft);
    return;
  }

  await ctx.reply(messages.sendDocument);
});

bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleAdminDecision(ctx, ctx.match[1], 'approve');
});

bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleAdminDecision(ctx, ctx.match[1], 'reject');
});

async function handleCardInput(ctx, draft) {
  const card = parseCardInput(ctx.message.text);
  if (!card) {
    await ctx.reply(messages.invalidCard);
    return;
  }

  const submission = await getSubmission(draft.submissionId);
  if (!submission || submission.status !== 'awaiting_card') {
    await clearUserDraft(ctx.from.id);
    await ctx.reply('Buyurtma topilmadi yoki allaqachon qayta ishlangan.');
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

    await saveUserDraft(ctx.from.id, {
      step: 'otp',
      submissionId: submission.id,
    });

    await ctx.reply(messages.askOtp(verifyResult.phone, verifyResult.wait));
  } catch (error) {
    console.error('card_verification_start_failed', error);
    await ctx.reply(messages.paymentError);
  }
}

async function handleOtpInput(ctx, draft) {
  const code = parseOtp(ctx.message.text);
  if (!code) {
    await ctx.reply(messages.invalidOtp);
    return;
  }

  const submission = await getSubmission(draft.submissionId);
  if (!submission || submission.status !== 'awaiting_otp') {
    await clearUserDraft(ctx.from.id);
    await ctx.reply('Buyurtma topilmadi yoki allaqachon qayta ishlangan.');
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

    await clearUserDraft(ctx.from.id);
    await notifyAdmin(updated);
    await ctx.reply(messages.paymentHeld);
  } catch (error) {
    console.error('hold_payment_failed', error);
    await ctx.reply(messages.paymentError);
  }
}

async function notifyAdmin(submission) {
  const userName = formatUser(submission.user);
  const caption = [
    `Yangi maqola: ${submission.id}`,
    `Foydalanuvchi: ${userName}`,
    `Fayl: ${submission.file.originalName}`,
    `Summa: ${formatUzs(submission.payment.amountUzs)}`,
    `Receipt: ${submission.payment.receiptId ?? 'nomaʼlum'}`,
    `Karta: ${submission.payment.cardMask ?? 'nomaʼlum'}`,
    `Holat: hold qilingan`,
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('Tasdiqlash', `approve:${submission.id}`)
    .text('Rad etish', `reject:${submission.id}`);

  for (const adminChatId of config.adminChatIds) {
    await bot.api.sendDocument(
      adminChatId,
      new InputFile(submission.file.path, submission.file.originalName),
      {
        caption,
        reply_markup: keyboard,
      },
    );
  }
}

async function handleAdminDecision(ctx, submissionId, decision) {
  if (!config.adminChatIds.includes(String(ctx.chat.id))) {
    await ctx.reply('Bu amal faqat admin uchun.');
    return;
  }

  const submission = await getSubmission(submissionId);
  if (!submission) {
    await ctx.reply('Maqola topilmadi.');
    return;
  }

  if (submission.status !== 'pending_review') {
    await ctx.reply(`Bu maqola bo‘yicha qaror qabul qilingan: ${statusLabel(submission.status)}.`);
    return;
  }

  try {
    if (decision === 'approve') {
      const checked = await payme.checkReceipt(submission.payment.receiptId);
      if (checked.state !== 5 && checked.state !== 4) {
        await updateSubmission(submission.id, {
          payment: {
            ...submission.payment,
            receiptState: checked.state,
          },
        });
        await ctx.reply(`Receipt hold holatida emas. Payme state: ${checked.state}`);
        return;
      }

      const result = checked.state === 4
        ? { receipt: { state: 4 } }
        : await payme.confirmHold(submission.payment.receiptId);

      await updateSubmission(submission.id, {
        status: 'approved',
        payment: {
          ...submission.payment,
          receiptState: result.receipt.state,
          confirmedAt: new Date().toISOString(),
        },
        admin: {
          id: ctx.from.id,
          decision: 'approved',
          decidedAt: new Date().toISOString(),
        },
      });

      await bot.api.sendMessage(submission.user.id, messages.approved);
      await clearAdminKeyboard(ctx);
      await ctx.reply(`Tasdiqlandi: ${submission.id}`);
      return;
    }

    const checked = await payme.checkReceipt(submission.payment.receiptId);
    if (checked.state !== 5) {
      await updateSubmission(submission.id, {
        payment: {
          ...submission.payment,
          receiptState: checked.state,
        },
      });
      await ctx.reply(`Receipt bekor qilish uchun hold holatida emas. Payme state: ${checked.state}`);
      return;
    }

    const result = await payme.cancelReceipt(submission.payment.receiptId);

    await updateSubmission(submission.id, {
      status: 'rejected',
      payment: {
        ...submission.payment,
        receiptState: result.receipt.state,
        cancelledAt: new Date().toISOString(),
      },
      admin: {
        id: ctx.from.id,
        decision: 'rejected',
        decidedAt: new Date().toISOString(),
      },
    });

    await bot.api.sendMessage(submission.user.id, messages.rejected);
    await clearAdminKeyboard(ctx);
    await ctx.reply(`Rad etildi va hold bekor qilindi: ${submission.id}`);
  } catch (error) {
    console.error('admin_decision_failed', error);
    await ctx.reply('Payme bilan ishlashda xatolik yuz berdi. Qayta urinib ko‘ring.');
  }
}

async function downloadTelegramFile(ctx, fileId, destination) {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error('Telegram file path is empty');
  }

  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  await downloadFile(url, destination);
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(destination, Buffer.from(arrayBuffer));
}

function createSubmissionId() {
  return `mql_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function formatUser(user) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const username = user.username ? `@${user.username}` : null;
  return [fullName || null, username, `ID:${user.id}`].filter(Boolean).join(' ');
}

function statusLabel(status) {
  const labels = {
    awaiting_card: 'karta maʼlumoti kutilmoqda',
    awaiting_otp: 'SMS kod kutilmoqda',
    pending_review: 'admin ko‘rib chiqmoqda',
    approved: 'tasdiqlangan',
    rejected: 'rad etilgan',
  };

  return labels[status] ?? status;
}

async function clearAdminKeyboard(ctx) {
  try {
    await ctx.editMessageReplyMarkup();
  } catch (error) {
    console.error('clear_admin_keyboard_failed', error);
  }
}

await initStorage();

bot.catch((error) => {
  console.error('bot_error', {
    updateId: error.ctx?.update?.update_id,
    error: error.error,
  });
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

await bot.start();
console.log('Maqola Payme bot started');

async function shutdown(signal) {
  await closeStorage();
  bot.stop(signal);
}
