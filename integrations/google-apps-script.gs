/**
 * Приём заявок с лендинга «Академия зарубежного YouTube».
 * Пишет заявку в Google Таблицу и (если настроено) присылает уведомление в Telegram.
 *
 * Установка — 5 минут:
 * 1. Создай Google Таблицу → Расширения → Apps Script → удали пример и вставь этот файл целиком.
 * 2. Уведомления в Telegram (необязательно): ⚙ Настройки проекта → Свойства скрипта → добавь
 *      TELEGRAM_TOKEN   — токен бота от @BotFather;
 *      TELEGRAM_CHAT_ID — id чата, куда слать заявки. Узнать: напиши своему боту любое сообщение
 *                         и открой https://api.telegram.org/bot<ТОКЕН>/getUpdates → поле chat.id.
 * 3. Развернуть → Новое развёртывание → Тип: «Веб-приложение».
 *      Выполнять как: «Я». У кого есть доступ: «Все».
 * 4. Скопируй URL веб-приложения (заканчивается на /exec) в assets/js/config.js → leadEndpoint.
 * 5. Отправь тестовую заявку с сайта — появится лист «Заявки» с первой строкой.
 *
 * Токен бота живёт только в свойствах скрипта — на сайт и в браузер он не попадает.
 * После правок кода: Развернуть → Управление развёртываниями → Изменить → Новая версия.
 */

const SHEET_NAME = "Заявки";
const HEADERS = [
  "Дата", "ID заявки", "Имя", "Телефон", "Страна", "Кнопка", "Вариант сайта",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "Страница", "Откуда пришёл",
];
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const BUTTONS = {
  hero: "Забронировать место (первый экран)",
  price: "Забрать место со скидкой и получить все бонусы",
};

/* сайт шлёт обычную форму (x-www-form-urlencoded) — поля лежат в e.parameter;
   на всякий случай понимаем и JSON в теле запроса */
function readLead_(e) {
  if (e && e.parameter && e.parameter.name) return e.parameter;
  try { return JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { return {}; }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const data = readLead_(e);
    if (data.website) return json_({ ok: true }); // ловушка для ботов — люди это поле не видят

    const name = clean_(data.name, 80);
    const phone = clean_(data.phone, 20).replace(/[^\d+]/g, "");
    if (!name || !/^\+\d{9,15}$/.test(phone)) return json_({ ok: false, error: "bad input" });

    const row = [
      new Date(),
      clean_(data.id, 32),
      name,
      phone,
      clean_(data.country, 4),
      BUTTONS[data.source] || clean_(data.source, 40),
      clean_(data.variant, 20),
      ...UTM.map(k => clean_(data[k], 200)),
      clean_(data.page, 300),
      clean_(data.referrer, 300),
    ];
    sheet_().appendRow(row.map(asText_));
    notify_(data, name, phone);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, hint: "Сюда приходят заявки методом POST" });
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }
  return sh;
}

function clean_(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/* значения, начинающиеся с = + - @, сохраняем как текст: так телефон не станет числом,
   а чужая «формула» в имени не выполнится в таблице */
function asText_(v) {
  return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function notify_(data, name, phone) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("TELEGRAM_TOKEN");
  const chat = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chat) return;
  const esc = s => String(s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const utm = UTM.map(k => clean_(data[k], 60)).filter(String).join(" / ");
  const text = [
    "<b>Новая бронь</b>",
    "Имя: " + esc(name),
    "Телефон: " + esc(phone) + (data.country ? " (" + esc(clean_(data.country, 4)) + ")" : ""),
    "Кнопка: " + esc(BUTTONS[data.source] || clean_(data.source, 40)),
    "Вариант сайта: " + esc(clean_(data.variant, 20)),
    utm ? "UTM: " + esc(utm) : "",
    "ID: " + esc(clean_(data.id, 32)),
  ].filter(String).join("\n");
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chat, text: text, parse_mode: "HTML", disable_web_page_preview: true }),
    muteHttpExceptions: true,
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
