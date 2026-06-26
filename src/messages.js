import { config } from './config.js';

export const messages = {
  start: [
    'Assalomu alaykum.',
    '',
    `Maqolangizni PDF, DOC yoki DOCX formatda yuboring. Xizmat narxi: ${formatUzs(config.submissionPriceUzs)}.`,
    'Toʻlov Payme hold orqali qilinadi: admin tasdiqlasa pul yechiladi, rad etsa hold bekor qilinadi.',
  ].join('\n'),
  sendDocument: 'Maqolangizni PDF, DOC yoki DOCX fayl sifatida yuboring.',
  invalidDocument: 'Faqat PDF, DOC yoki DOCX fayl qabul qilinadi.',
  fileTooLarge: 'Fayl hajmi limitdan katta. Iltimos, kichikroq fayl yuboring.',
  openPaymentWebApp: [
    'Fayl qabul qilindi.',
    '',
    'Payme hold toʻlovini boshlash uchun quyidagi tugmani bosing.',
    'Karta maʼlumotlari Telegram chatiga yozilmaydi.',
  ].join('\n'),
  openPaymentWebAppAgain: 'Toʻlovni yakunlash uchun quyidagi tugmani bosing.',
  finishPaymentInWebApp: 'SMS kodni toʻlov oynasida kiriting. Kerak bo‘lsa toʻlov tugmasini qayta oching.',
  paymentWebAppNotConfigured: 'Toʻlov oynasi serverda sozlanmagan. Administrator WEB_APP_BASE_URL ni .env ga yozishi kerak.',
  invalidCard: 'Karta maʼlumoti notoʻgʻri. Format: 8600123412341234 03/29',
  askOtp: (phone, wait) => {
    const seconds = wait ? Math.ceil(wait / 1000) : null;
    return [
      `SMS kod ${phone ?? 'kartaga ulangan telefon raqamiga'} yuborildi.`,
      seconds ? `Kod amal qilish muddati: ${seconds} soniya.` : null,
      'SMS kodni yuboring.',
    ].filter(Boolean).join('\n');
  },
  invalidOtp: 'SMS kod notoʻgʻri formatda. Kodni faqat raqamlar bilan yuboring.',
  paymentHeld: 'Pul Payme orqali hold qilindi. Maqolangiz admin ko‘rib chiqishiga yuborildi.',
  waitAdmin: 'Maqolangiz admin ko‘rib chiqishida. Natija bo‘yicha xabar beramiz.',
  approved: 'Maqolangiz tasdiqlandi. Hold tasdiqlandi va toʻlov yakunlandi.',
  rejected: 'Maqolangiz rad etildi. Hold bekor qilindi va pul kartangizda qoladi/qaytariladi.',
  paymentError: 'Toʻlov jarayonida xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko‘ring.',
};

export function formatUzs(value) {
  return new Intl.NumberFormat('uz-UZ').format(value) + ' soʻm';
}
