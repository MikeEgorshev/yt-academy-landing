# Академия зарубежного YouTube — лендинг

Страница воронки мини-курса, версия без геймификации (основная). Обычный статический сайт: HTML, CSS и JavaScript, ничего собирать не нужно.

| Файл | Что это |
|---|---|
| `index.html` | сама страница |
| `privacy.html` | политика конфиденциальности (черновик: впишите реквизиты) |
| `assets/css`, `assets/js`, `assets/img` | стили, скрипты, картинки |
| `assets/js/config.js` | все настройки страницы |
| `integrations/google-apps-script.gs` | приём заявок в Google Таблицу с уведомлением в Telegram |
| `dist/landing-single-file.html` | та же страница одним файлом: стили, скрипты, библиотеки и шрифты встроены, открывается двойным кликом и без интернета |

## Настройки — `assets/js/config.js`

- `youtubeId` — ролик на первом экране (ID из ссылки `youtube.com/watch?v=…`).
- `leadEndpoint` — куда уходят заявки из формы «Забронировать место». Пусто — демо-режим, заявка только печатается в консоль браузера. Как подключить Google Таблицу — в начале `integrations/google-apps-script.gs`.
- `telegramBot` — бот, куда человек переходит после заявки.
- `spotsTotal`, `spotsLeft`, `spotsEveryMs`, `spotsJitter`, `spotsMin` — счётчик мест.
- `metrikaId` — Яндекс Метрика.

## Как открыть и выложить

- Посмотреть: открыть `index.html` в браузере (или `dist/landing-single-file.html`).
- Выложить: загрузить папку целиком на любой статический хостинг — GitHub Pages, Cloudflare Pages, Netlify. Сборка не нужна.

Рабочий сайт с уроками, входом через Google и профилем ученика: https://yt-academy.pages.dev
