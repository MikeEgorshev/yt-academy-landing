// Приём заявок с формы «Забронировать место» — функция Vercel (POST /api/lead).
//
// Куда уходит заявка, задают переменные окружения проекта на Vercel
// (Project → Settings → Environment Variables), можно одно или оба:
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — уведомление в Telegram (токен от @BotFather и id чата, куда слать);
//   GOOGLE_SCRIPT_URL — URL веб-приложения из integrations/google-apps-script.gs (заканчивается на /exec):
//                       заявка ещё и строкой в Google Таблице.
// Пока ничего не задано, функция отвечает 503 и форма показывает человеку ошибку — заявки не теряются молча.
//
// Принимает JSON (форма на этом же сайте, leadEndpoint: "/api/lead") и обычную форму
// application/x-www-form-urlencoded (страница на другом домене, например на Тильде, с полным URL в leadEndpoint).

const str = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BUTTONS = { hero: "Забронировать место (первый экран)", price: "Забрать место со скидкой (блок цены)" };
const FIELDS = { id: 40, country: 8, source: 32, variant: 32, page: 500, referrer: 500, utm_source: 200, utm_medium: 200, utm_campaign: 200, utm_content: 200, utm_term: 200 };

const fail = (res, status, code, message = "") => res.status(status).json({ error: { code, message } });

function readBody(req) {
  const b = req.body;
  if (b && typeof b === "object") return b;
  if (typeof b === "string" && b) {
    try { return JSON.parse(b); } catch { return Object.fromEntries(new URLSearchParams(b)); }
  }
  return {};
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "method_not_allowed");
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  const sheet = process.env.GOOGLE_SCRIPT_URL;
  if (!(token && chat) && !sheet) {
    return fail(res, 503, "not_configured", "Приём заявок ещё не настроен. Напишите нам в Telegram.");
  }

  const b = readBody(req);
  const name = str(b.name, 80).replace(/\s+/g, " ");
  const phone = str(b.phone, 20);
  if (!name) return fail(res, 400, "bad_name", "Введите имя");
  if (!/^\+\d{9,15}$/.test(phone)) return fail(res, 400, "bad_phone", "Проверьте номер телефона");
  const lead = { name, phone };
  for (const [key, max] of Object.entries(FIELDS)) lead[key] = str(b[key], max);

  const jobs = [];
  if (token && chat) {
    const utm = [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ");
    const text = [
      "<b>Новая заявка</b>",
      `${esc(name)} · ${esc(phone)}${lead.country ? ` (${esc(lead.country)})` : ""}`,
      `Кнопка: ${esc(BUTTONS[lead.source] || lead.source || "—")}`,
      utm ? `UTM: ${esc(utm)}` : "",
      lead.page ? `Страница: ${esc(lead.page)}` : "",
      lead.id ? `ID: <code>${esc(lead.id)}</code>` : "",
    ].filter(Boolean).join("\n");
    jobs.push(fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    }).then(r => r.ok));
  }
  if (sheet) {
    jobs.push(fetch(sheet, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams(lead).toString(),
    }).then(r => r.ok));
  }

  const results = await Promise.allSettled(jobs);
  if (!results.some(r => r.status === "fulfilled" && r.value === true)) {
    console.error("lead delivery failed", results.map(r => (r.status === "fulfilled" ? r.value : String(r.reason))));
    return fail(res, 502, "delivery_failed", "Не получилось отправить заявку. Попробуйте ещё раз через минуту.");
  }
  return res.status(200).json({ ok: true, id: lead.id });
};
