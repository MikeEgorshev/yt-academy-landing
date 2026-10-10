# Академия зарубежного YouTube — лендинг

Страница воронки мини-курса, версия без геймификации (основная). Обычный статический сайт: HTML, CSS и JavaScript, ничего собирать не нужно.

## Версии (ветки)

| Ветка | Для чего |
|---|---|
| `main` | обычный статический сайт для любого хостинга: GitHub Pages, Netlify, свой сервер |
| [`vercel`](https://github.com/MikeEgorshev/yt-academy-landing/tree/vercel) | для Vercel: настройки `vercel.json` и обработчик заявок `api/lead` (заявки уходят в Telegram и/или Google Таблицу) |
| [`tilda`](https://github.com/MikeEgorshev/yt-academy-landing/tree/tilda) | для Тильды: код для блока «HTML-код» (T123) и для HEAD страницы в папке `tilda/` |

| Файл | Что это |
|---|---|
| `index.html` | сама страница |
| `privacy.html` | политика конфиденциальности (черновик: впишите реквизиты) |
| `assets/css`, `assets/js`, `assets/img` | стили, скрипты, картинки |
| `assets/js/config.js` | все настройки страницы |
| `integrations/google-apps-script.gs` | приём заявок в Google Таблицу с уведомлением в Telegram |
| `dist/landing-single-file.html` | та же страница одним файлом: стили, скрипты, библиотеки и шрифты встроены, открывается двойным кликом и без интернета |
| `api/lead.js` | **ветка vercel:** обработчик заявок на Vercel (`POST /api/lead`) |
| `vercel.json`, `.vercelignore` | **ветка vercel:** адреса без `.html`, заголовки, что не выкладывать |

## Деплой на Vercel (эта ветка)

1. [vercel.com](https://vercel.com) → **Add New → Project** → **Import** репозитория `yt-academy-landing`. Framework Preset — **Other**, команду сборки и папку не трогайте: сайт статический.
2. **Settings → Git → Production Branch** — впишите `vercel` и сделайте **Redeploy**: в рабочую версию пойдёт эта ветка, а не `main`.
3. **Settings → Environment Variables** — куда отправлять заявки (одно или оба), потом **Redeploy**:
   - `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` — уведомление о заявке в Telegram: токен бота от @BotFather и id чата, куда слать;
   - `GOOGLE_SCRIPT_URL` — URL веб-приложения из `integrations/google-apps-script.gs`: каждая заявка ещё и строкой в Google Таблице.
4. Отправьте тестовую заявку с сайта. Пока переменные не заданы, форма честно покажет ошибку — заявки не пропадают молча.

Свой домен: **Settings → Domains**. Тот же обработчик может принимать заявки и со страницы на Тильде: в её настройках укажите `leadEndpoint: "https://<ваш-проект>.vercel.app/api/lead"`.

## Настройки — `assets/js/config.js`

- `youtubeId` — ролик на первом экране (ID из ссылки `youtube.com/watch?v=…`).
- `leadEndpoint` — куда уходят заявки из формы «Забронировать место». В этой ветке — `/api/lead` (обработчик на Vercel, см. выше). Можно указать URL Google Apps Script (как подключить — в начале `integrations/google-apps-script.gs`); пусто — демо-режим, заявка только печатается в консоль браузера.
- `telegramBot` — бот, куда человек переходит после заявки.
- `spotsTotal`, `spotsLeft`, `spotsEveryMs`, `spotsJitter`, `spotsMin` — счётчик мест.
- `metrikaId` — Яндекс Метрика.

## Как открыть и выложить

- Посмотреть: открыть `index.html` в браузере (или `dist/landing-single-file.html`).
- Выложить: загрузить папку целиком на любой статический хостинг — GitHub Pages, Cloudflare Pages, Netlify. Сборка не нужна.

Рабочий сайт с уроками, входом через Google и профилем ученика: https://yt-academy.pages.dev
