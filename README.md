# Maqola Payme Bot

grammY asosidagi Telegram bot foydalanuvchidan PDF yoki Word maqola qabul qiladi, Payme Subscribe API orqali pulni `hold` holatida ushlab turadi va admin qaroriga qarab holdni tasdiqlaydi yoki bekor qiladi.

## Ishlash oqimi

1. Foydalanuvchi `/start` bosadi va PDF/DOC/DOCX fayl yuboradi.
2. Bot Telegram Web App to'lov oynasini ochadigan tugma yuboradi.
3. Foydalanuvchi karta raqami va amal qilish muddatini Web App ichida kiritadi.
4. Web App karta ma'lumotini Payme APIga to'g'ridan-to'g'ri yuborib token oladi.
5. Web App `cards.create` orqali karta tokenini yaratadi.
6. Web App `cards.get_verify_code` orqali SMS kod yuboradi.
7. Foydalanuvchi SMS kodni Web App ichida kiritadi.
8. Web App `cards.verify` orqali kartani tasdiqlaydi.
9. Bot serveri Web App `initData` imzosini tekshiradi va faqat Payme karta tokenini qabul qiladi.
10. Bot `receipts.create` metodini `hold: true` bilan chaqiradi.
11. Bot `receipts.pay` metodini karta tokeni va `hold: true` bilan chaqiradi.
12. Payme `state: 5` qaytarsa, pul hold qilingan bo'ladi va maqola adminga yuboriladi.
13. Admin `Tasdiqlash` bossa `receipts.confirm_hold` ishlaydi.
14. Admin `Rad etish` bossa `receipts.cancel` ishlaydi.

## O'rnatish

```bash
npm install
cp .env.example .env
npm run dev
```

`.env` ichida Telegram bot tokeni, admin chat ID, Payme merchant ID va kassa passwordini to'ldiring.
Payme Businessdagi `To'lov rekvizitlari` sizdagi rasmga mos bo'lishi kerak:

```env
PAYME_PLAN_ID=article_review
```

Bot Payme `receipts.create` account qismiga aynan shuni yuboradi:

```json
{
  "user_id": "telegram_user_id",
  "plan_id": "PAYME_PLAN_ID qiymati"
}
```

`user_id` avtomatik Telegram foydalanuvchi ID dan olinadi. `plan_id` esa `.env` ichidagi `PAYME_PLAN_ID` dan olinadi.

PostgreSQL ulanishi ham kerak:

```env
DATABASE_URL=postgres://postgres:password@localhost:5432/maqola
UPLOAD_DIR=./uploads
```

Telegram ichida karta formasi ochilishi uchun public HTTPS URL kerak:

```env
WEB_APP_BASE_URL=https://your-domain.uz
WEB_APP_PATH=/pay/card
WEB_APP_PORT=3000
```

`WEB_APP_BASE_URL` Telegram ochadigan tashqi HTTPS manzil bo'lishi kerak. Odatda Nginx `https://your-domain.uz/pay/card` so'rovlarini bot ishlayotgan serverdagi `localhost:3000` ga proxy qiladi.

## Muhim Payme eslatmalari

- Bu versiya Payme Subscribe API `hold` dokumentatsiyasiga moslangan.
- `receipts.create` va `receipts.pay` metodlarida `hold: true` yuboriladi.
- `receipts.create` account maydonida Payme Business rekvizitlariga mos `user_id` va `plan_id` yuboriladi.
- Karta raqami Telegram chatiga yuborilmaydi va bot serveriga POST qilinmaydi; Web App uni Payme APIga yuborib token oladi.
- Admin tasdiqlasa `receipts.confirm_hold`, rad etsa `receipts.cancel` chaqiriladi.
- Hold ishlashi uchun Payme Business texnik mutaxassisi kassada hold funksiyasini yoqib berishi kerak.
- Payme hujjatiga ko'ra holdni test qilish faqat real rejimda bo'lishi mumkin.
- UZCARD holdni 30 kundan keyin avtomatik bekor qiladi. HUMO uchun 30 kundan keyin holdni faqat tasdiqlash mumkin.
- `SUBMISSION_PRICE_UZS` so'mda yoziladi, Payme API ga tiyin ko'rinishida yuboriladi.

## Xavfsizlik

- Bot karta raqamini qabul qilmaydi va saqlamaydi. Karta raqami Web App brauzeridan Payme `cards.create` chaqiruviga ketadi. Bot serveriga faqat tasdiqlangan Payme karta tokeni yuboriladi.
- Web App API Telegram `initData` HMAC imzosini tekshiradi va foydalanuvchi faqat o'z submissioni uchun to'lov boshlashi mumkin.
- Maqola metadata, Telegram user ID, Payme receipt ID, karta maskasi va buyurtma holati PostgreSQL bazasida saqlanadi.
- Maqola fayllari `UPLOAD_DIR/submissions` papkasida saqlanadi.
- Production uchun PostgreSQL backup va `UPLOAD_DIR` backupni muntazam qiling.
