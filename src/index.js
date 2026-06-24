import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config } from './config.js';
import { messages, formatUzs } from './messages.js';
import { createPaymeCheckoutUrl } from './paymeCheckout.js';
import { startPaymeMerchantApi } from './paymeMerchantApi.js';
import {
  clearUserDraft,
  createSubmission,
  getFilesDir,
  getSubmission,
  initStorage,
  listUserSubmissions,
  updateSubmission,
} from './storage.js';
import { getExtension, isAllowedDocument } from './validators.js';

const bot = new Bot(config.botToken);
let merchantApiServer;

bot.command('start', async (ctx) => {
  await ctx.reply(messages.start);
});

bot.command('new', async (ctx) => {
  await clearUserDraft(ctx.from.id);
  await ctx.reply(messages.sendDocument);
});

bot.command('status', async (ctx) => {
  const submissions = listUserSubmissions(ctx.from.id).slice(0, 5);

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
      status: 'awaiting_payment',
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

    const paymentKeyboard = new InlineKeyboard()
      .url('Payme orqali toʻlash', createPaymeCheckoutUrl(submission))
      .row()
      .text('Toʻlovni tekshirish', `checkpay:${submission.id}`);

    await ctx.reply(messages.payWithPayme, {
      reply_markup: paymentKeyboard,
    });
  } catch (error) {
    console.error('document_handling_failed', error);
    await ctx.reply('Faylni qabul qilishda xatolik yuz berdi. Qayta yuborib ko‘ring.');
  }
});

bot.on('message:text', async (ctx) => {
  await ctx.reply(messages.sendDocument);
});

bot.callbackQuery(/^checkpay:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const submission = getSubmission(ctx.match[1]);

  if (!submission || submission.user.id !== ctx.from.id) {
    await ctx.reply('Maqola topilmadi.');
    return;
  }

  if (submission.status === 'pending_review') {
    await ctx.reply(messages.waitAdmin);
    return;
  }

  if (submission.status === 'approved') {
    await ctx.reply(messages.approved);
    return;
  }

  await ctx.reply('Toʻlov hali Payme tomonidan tasdiqlanmadi. Toʻlovni Payme oynasida yakunlang.');
});

bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleAdminDecision(ctx, ctx.match[1], 'approve');
});

bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleAdminDecision(ctx, ctx.match[1], 'reject');
});

async function notifyAdmin(submission) {
  const userName = formatUser(submission.user);
  const caption = [
    `Yangi maqola: ${submission.id}`,
    `Foydalanuvchi: ${userName}`,
    `Fayl: ${submission.file.originalName}`,
    `Summa: ${formatUzs(submission.payment.amountUzs)}`,
    `Tranzaksiya: ${submission.payment.transaction?.paymeId ?? 'nomaʼlum'}`,
    `Holat: toʻlangan`,
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

  const submission = getSubmission(submissionId);
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
      await updateSubmission(submission.id, {
        status: 'approved',
        payment: {
          ...submission.payment,
          approvedAt: new Date().toISOString(),
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

    await updateSubmission(submission.id, {
      status: 'rejected_pending_refund',
      payment: {
        ...submission.payment,
        rejectedAt: new Date().toISOString(),
      },
      admin: {
        id: ctx.from.id,
        decision: 'rejected',
        decidedAt: new Date().toISOString(),
      },
    });

    await bot.api.sendMessage(submission.user.id, messages.rejected);
    await clearAdminKeyboard(ctx);
    await ctx.reply(`Rad etildi: ${submission.id}. Pulni qaytarish uchun Payme kabinetida refund qiling; Payme CancelTransaction yuborsa bot holatni yangilaydi.`);
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
    awaiting_payment: 'toʻlov kutilmoqda',
    payment_created: 'Payme tranzaksiyasi yaratildi',
    pending_review: 'admin ko‘rib chiqmoqda',
    approved: 'tasdiqlangan',
    rejected: 'rad etilgan',
    rejected_pending_refund: 'rad etilgan, refund kutilmoqda',
    payment_cancelled: 'toʻlov bekor qilingan',
    refunded: 'pul qaytarilgan',
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
merchantApiServer = startPaymeMerchantApi({ bot, notifyAdmin });

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

function shutdown(signal) {
  merchantApiServer?.close();
  bot.stop(signal);
}
