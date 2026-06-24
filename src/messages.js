import { config } from './config.js';

export const messages = {
  start: [
    'Assalomu alaykum.',
    '',
    `Maqolangizni PDF, DOC yoki DOCX formatda yuboring. Xizmat narxi: ${formatUzs(config.submissionPriceUzs)}.`,
    'Toʻlov Payme oynasida amalga oshiriladi. Toʻlovdan keyin maqola admin ko‘rib chiqishiga yuboriladi.',
  ].join('\n'),
  sendDocument: 'Maqolangizni PDF, DOC yoki DOCX fayl sifatida yuboring.',
  invalidDocument: 'Faqat PDF, DOC yoki DOCX fayl qabul qilinadi.',
  fileTooLarge: 'Fayl hajmi limitdan katta. Iltimos, kichikroq fayl yuboring.',
  payWithPayme: [
    'Fayl qabul qilindi.',
    '',
    'Toʻlovni Payme oynasida amalga oshiring. Toʻlov muvaffaqiyatli bo‘lsa, maqola avtomatik adminga yuboriladi.',
  ].join('\n'),
  paymentHeld: 'Toʻlov qabul qilindi. Maqolangiz admin ko‘rib chiqishiga yuborildi.',
  waitAdmin: 'Maqolangiz admin ko‘rib chiqishida. Natija bo‘yicha xabar beramiz.',
  approved: 'Maqolangiz tasdiqlandi. Toʻlov muvaffaqiyatli yakunlandi.',
  rejected: 'Maqolangiz rad etildi. Toʻlovni qaytarish jarayoni Payme orqali amalga oshiriladi.',
  paymentError: 'Toʻlov jarayonida xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko‘ring.',
};

export function formatUzs(value) {
  return new Intl.NumberFormat('uz-UZ').format(value) + ' soʻm';
}
