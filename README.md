# Maqola Payme Bot

grammY asosidagi Telegram bot foydalanuvchidan PDF yoki Word maqola qabul qiladi, Payme Subscribe API orqali pulni `hold` holatida ushlab turadi va admin qaroriga qarab holdni tasdiqlaydi yoki bekor qiladi.

## Ishlash oqimi

1. Foydalanuvchi `/start` bosadi va PDF/DOC/DOCX fayl yuboradi.
2. Bot Telegram Web App to'lov oynasini ochadigan tugma yuboradi.
3. Foydalanuvchi karta raqami va amal qilish muddatini Web App ichida kiritadi.
4. Web App karta ma'lumotini HTTPS orqali bot serveriga yuboradi.
5. Bot serveri `cards.create` orqali karta tokenini yaratadi.
6. Bot serveri `cards.get_verify_code` orqali SMS kod yuboradi.
7. Foydalanuvchi SMS kodni Web App ichida kiritadi.
8. Bot serveri `cards.verify` orqali kartani tasdiqlaydi.
9. Bot serveri Web App `initData` imzosini tekshiradi.
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

Maqolalarni avtomatik Telegram kanalga yuborish uchun botni kanalga admin qiling va `.env`ga kanal ID yozing:

```env
SUBMISSION_CHANNEL_ID=@your_channel_username
SUBMISSION_CHANNEL_STAGE=approved
```

`SUBMISSION_CHANNEL_STAGE` qiymatlari:

- `uploaded`: fayl qabul qilingan zahoti yuboradi.
- `held`: Payme pulni hold qilgandan keyin yuboradi.
- `approved`: admin tasdiqlagandan keyin yuboradi.

PostgreSQL ulanishi ham kerak:

```env
DATABASE_URL=postgres://postgres:password@localhost:5432/maqola
UPLOAD_DIR=./uploads
```

Telegram ichida karta formasi ochilishi uchun public HTTPS URL kerak:

```env
WEB_APP_URL=https://programmsoft.uz/sports_web.php
WEB_APP_API_URL=https://programmsoft.uz/sports_pay.php
WEB_APP_PORT=9001
```

`WEB_APP_URL` Telegram ochadigan tashqi HTTPS sahifa. `WEB_APP_API_URL` Web App to'lovni yakunlash uchun POST qiladigan tashqi HTTPS endpoint.

Apache/PHP ishlatilsa, [deploy/sports_web.php](deploy/sports_web.php) va [deploy/sports_pay.php](deploy/sports_pay.php) fayllarini sayt rootiga joylashtiring. Bu PHP fayllar tashqi HTTPS so'rovlarni ichkaridagi Node Web App serverga uzatadi:

```text
https://programmsoft.uz/sports_web.php -> http://127.0.0.1:9001/sports_web.php
https://programmsoft.uz/sports_pay.php -> http://127.0.0.1:9001/sports_pay.php
```

## Muhim Payme eslatmalari

- Bu versiya Payme Subscribe API `hold` dokumentatsiyasiga moslangan.
- `receipts.create` va `receipts.pay` metodlarida `hold: true` yuboriladi.
- `receipts.create` account maydonida Payme Business rekvizitlariga mos `user_id` va `plan_id` yuboriladi.
- Karta raqami Telegram chatiga yuborilmaydi va bazaga saqlanmaydi; bot serveri uni faqat Payme `cards.create` chaqiruvi uchun ishlatadi.
- Admin tasdiqlasa `receipts.confirm_hold`, rad etsa `receipts.cancel` chaqiriladi.
- Hold ishlashi uchun Payme Business texnik mutaxassisi kassada hold funksiyasini yoqib berishi kerak.
- Payme hujjatiga ko'ra holdni test qilish faqat real rejimda bo'lishi mumkin.
- UZCARD holdni 30 kundan keyin avtomatik bekor qiladi. HUMO uchun 30 kundan keyin holdni faqat tasdiqlash mumkin.
- `SUBMISSION_PRICE_UZS` so'mda yoziladi, Payme API ga tiyin ko'rinishida yuboriladi.

## Xavfsizlik

- Bot karta raqamini bazaga saqlamaydi. Karta raqami Web App orqali HTTPS bilan keladi va faqat Payme `cards.create` chaqiruvi uchun ishlatiladi.
- Web App API Telegram `initData` HMAC imzosini tekshiradi va foydalanuvchi faqat o'z submissioni uchun to'lov boshlashi mumkin.
- Maqola metadata, Telegram user ID, Payme receipt ID, karta maskasi va buyurtma holati PostgreSQL bazasida saqlanadi.
- Maqola fayllari `UPLOAD_DIR/submissions` papkasida saqlanadi.
- Production uchun PostgreSQL backup va `UPLOAD_DIR` backupni muntazam qiling.
