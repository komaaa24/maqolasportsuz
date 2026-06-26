# Maqola Payme Bot

grammY asosidagi Telegram bot foydalanuvchidan PDF yoki Word maqola qabul qiladi, Payme Subscribe API orqali pulni `hold` holatida ushlab turadi va admin qaroriga qarab holdni tasdiqlaydi yoki bekor qiladi.

## Ishlash oqimi

1. Foydalanuvchi `/start` bosadi va PDF/DOC/DOCX fayl yuboradi.
2. Bot karta raqami va amal qilish muddatini so'raydi.
3. Bot `cards.create` orqali karta tokenini yaratadi.
4. Bot `cards.get_verify_code` orqali SMS kod yuboradi.
5. Foydalanuvchi SMS kodni yuboradi.
6. Bot `cards.verify` orqali kartani tasdiqlaydi.
7. Bot `receipts.create` metodini `hold: true` bilan chaqiradi.
8. Bot `receipts.pay` metodini karta tokeni va `hold: true` bilan chaqiradi.
9. Payme `state: 5` qaytarsa, pul hold qilingan bo'ladi va maqola adminga yuboriladi.
10. Admin `Tasdiqlash` bossa `receipts.confirm_hold` ishlaydi.
11. Admin `Rad etish` bossa `receipts.cancel` ishlaydi.

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

## Muhim Payme eslatmalari

- Bu versiya Payme Subscribe API `hold` dokumentatsiyasiga moslangan.
- `receipts.create` va `receipts.pay` metodlarida `hold: true` yuboriladi.
- `receipts.create` account maydonida Payme Business rekvizitlariga mos `user_id` va `plan_id` yuboriladi.
- Admin tasdiqlasa `receipts.confirm_hold`, rad etsa `receipts.cancel` chaqiriladi.
- Hold ishlashi uchun Payme Business texnik mutaxassisi kassada hold funksiyasini yoqib berishi kerak.
- Payme hujjatiga ko'ra holdni test qilish faqat real rejimda bo'lishi mumkin.
- UZCARD holdni 30 kundan keyin avtomatik bekor qiladi. HUMO uchun 30 kundan keyin holdni faqat tasdiqlash mumkin.
- `SUBMISSION_PRICE_UZS` so'mda yoziladi, Payme API ga tiyin ko'rinishida yuboriladi.

## Xavfsizlik

- Bot karta raqamini saqlamaydi. Karta tokeni faqat SMS/hold jarayoni tugaguncha vaqtincha saqlanadi va holddan keyin tozalanadi.
- Maqola metadata, Telegram user ID, Payme receipt ID, karta maskasi va buyurtma holati PostgreSQL bazasida saqlanadi.
- Maqola fayllari `UPLOAD_DIR/submissions` papkasida saqlanadi.
- Production uchun PostgreSQL backup va `UPLOAD_DIR` backupni muntazam qiling.
