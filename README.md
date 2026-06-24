# Maqola Payme Bot

grammY asosidagi Telegram bot foydalanuvchidan PDF yoki Word maqola qabul qiladi, Payme checkout oynasiga to'lov linkini beradi, Payme Merchant API orqali to'lov holatini qabul qiladi va to'lovdan keyin maqolani adminga yuboradi.

## Ishlash oqimi

1. Foydalanuvchi `/start` bosadi va PDF/DOC/DOCX fayl yuboradi.
2. Bot Payme checkout oynasiga olib boradigan `Payme orqali to'lash` tugmasini yuboradi.
3. Foydalanuvchi karta ma'lumotini faqat Payme oynasida kiritadi.
4. Payme bot serveridagi Merchant API endpointga `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction` so'rovlarini yuboradi.
5. `PerformTransaction` muvaffaqiyatli bo'lsa, bot maqolani adminga yuboradi.
6. Admin `Tasdiqlash` tugmasini bossa maqola tasdiqlanadi.
7. Admin `Rad etish` tugmasini bossa maqola rad etiladi va refund Payme kabineti orqali bajarilishi kerak. Payme refund jarayonida `CancelTransaction` chaqirsa, bot holatni yangilaydi.

## O'rnatish

```bash
npm install
cp .env.example .env
npm run dev
```

`.env` ichida Telegram bot tokeni, admin chat ID va Payme kalitlarini to'ldiring.

Payme Business kabinetida Merchant API URL sifatida serveringizdagi endpointni ko'rsating:

```text
http://213.230.110.176:8382/api/payme
```

Server tashqaridan `213.230.110.176:8382` port orqali ko'rinishi kerak. Firewall yoki hosting panelida `8382` port ochiq bo'lishi zarur.

## Muhim Payme eslatmalari

- Bu versiyada karta raqami bot ichida so'ralmaydi. To'lov to'liq Payme oynasida bo'ladi.
- Payme oynasi Merchant API oqimida ishlaydi. Bu Subscribe API `hold` oqimi emas.
- Rasmiy `hold` hujjatida hold uchun karta tokeni talab qilinadi. Payme checkout URL hujjatida `hold: true` parametri ko'rsatilmagan.
- Admin rad etsa avtomatik `confirm_hold/cancel_hold` emas, refund Payme kabineti/Payme jarayoni orqali bajariladi.
- `SUBMISSION_PRICE_UZS` so'mda yoziladi, Payme API ga tiyin ko'rinishida yuboriladi.

## Xavfsizlik

- Bot karta raqamini saqlamaydi.
- Saqlanadigan ma'lumotlar: maqola fayli, Telegram user ID, Payme transaction ID va buyurtma holati.
- Production uchun `data/` papkasini serverda himoyalang va muntazam backup qiling.
