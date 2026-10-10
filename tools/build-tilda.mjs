// Сборка лендинга под Тильду: код для HEAD страницы и для блока «HTML-код» (T123).
//
//   node tools/build-tilda.mjs                      ссылки на файлы — jsDelivr, тег tilda-v1 этого репозитория
//   node tools/build-tilda.mjs --tag tilda-v2       новый тег (после правок стилей или скриптов: git tag tilda-v2 && git push --tags)
//   node tools/build-tilda.mjs --cdn http://localhost:8794/   проверка на своём компьютере
//
// Что получается в папке tilda/:
//   head.html          → Тильда: Настройки страницы → Дополнительно → «HTML-код для вставки внутрь HEAD»
//   block.html         → блок T123 «HTML-код»: вся страница; настройки (window.SITE_CONFIG) — прямо в начале кода
//   privacy-block.html → блок T123 на отдельной странице Тильды с адресом /privacy
//   yta-tilda.css      → стили страницы; Тильда берёт их с jsDelivr по ссылке из head.html
//
// Почему стили переписываются: у Тильды есть общие правила вроде «#allrecords a { color: #ff8562 }»,
// они перекрасили бы все ссылки-кнопки страницы. Поэтому каждое правило из assets/css/classic.css
// получает приставку #yta#yta (страница лежит в <div id="yta">): так оно сильнее любых правил Тильды
// и не задевает остальные блоки сайта. Правила для <html> (запрет прокрутки под окном заявки,
// классы плавной прокрутки Lenis) остаются общими.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "MikeEgorshev/yt-academy-landing";
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const TAG = arg("--tag") || "tilda-v1";
const CDN = (arg("--cdn") || `https://cdn.jsdelivr.net/gh/${REPO}@${TAG}/`).replace(/\/?$/, "/");
const SCOPE = "#yta#yta";
const read = p => readFileSync(join(ROOT, p), "utf8");
const OUT = join(ROOT, "tilda");
mkdirSync(OUT, { recursive: true });

/* ---------- CSS: приставка #yta#yta к каждому селектору ---------- */
function splitSelectors(list) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

function scopeSelector(sel) {
  if (/^html(?![\w-])/.test(sel) || /^\.lenis(?![\w-])/.test(sel)) return sel; // это классы и правила <html> — общие
  if (sel === ":root" || sel === "body") return SCOPE;                          // переменные и основа — на обёртке
  if (/^body(?![\w-])/.test(sel)) return SCOPE + sel.slice(4);
  return `${SCOPE} ${sel}`;
}

export function scopeCss(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const n = css.length;
  let i = 0;
  // до одного из символов stop на верхнем уровне, строки в кавычках пропускаем
  const readUntil = stops => {
    const start = i;
    for (let q = null; i < n; i++) {
      const c = css[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (stops.includes(c)) break;
    }
    return css.slice(start, i);
  };
  // тело блока после «{» до парной «}» (с вложенными блоками, как в @keyframes)
  const readBody = () => {
    const start = i;
    for (let depth = 1, q = null; i < n; i++) {
      const c = css[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    const body = css.slice(start, i);
    i++;
    return body;
  };
  const parseRules = nested => {
    let out = "";
    while (i < n) {
      while (i < n && /\s/.test(css[i])) i++;
      if (i >= n) break;
      if (css[i] === "}") { i++; if (nested) return out; continue; }
      const prelude = readUntil("{;}").trim();
      if (css[i] === ";") { i++; if (prelude) out += `${prelude};\n`; continue; }
      if (css[i] !== "{") continue;
      i++;
      if (prelude.startsWith("@")) {
        const kind = (prelude.match(/^@([\w-]+)/) || [])[1];
        out += ["media", "supports", "container", "layer"].includes(kind)
          ? `${prelude} {\n${parseRules(true)}}\n`
          : `${prelude} {${readBody()}}\n`; // @keyframes, @font-face, @property — как есть
      } else {
        out += `${splitSelectors(prelude).map(scopeSelector).join(", ")} {${readBody()}}\n`;
      }
    }
    return out;
  };
  return parseRules(false);
}

/* ---------- страница ---------- */
const html = read("index.html");
const bodyInner = html.slice(html.indexOf(">", html.indexOf("<body")) + 1, html.lastIndexOf("</body>"));
const markup = bodyInner
  .replace(/<script\b[\s\S]*?<\/script>\s*/g, "")                 // скрипты подключаются ниже, со ссылками на CDN
  .replace(/(\s(?:src|href|data-full|poster)=")assets\//g, `$1${CDN}assets/`)
  .replace(/href="privacy\.html"/g, 'href="/privacy"')
  .trim();
const config = read("assets/js/config.js").trim();
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)?.[0];
const libs = (html.match(/<script defer src="https:\/\/[^"]+"><\/script>/g) || []).join("\n");
if (!fonts || !libs || !markup.includes('class="page"')) throw new Error("index.html изменилась: не нашёл шрифты, библиотеки или .page — проверьте build-tilda.mjs");

const banner = (what, where) => `<!-- Академия зарубежного YouTube — ${what}.
     Куда вставить: ${where}.
     Сгенерировано: node tools/build-tilda.mjs (${TAG}). Стили и скрипты — с jsDelivr из репозитория ${REPO}. -->`;

writeFileSync(join(OUT, "yta-tilda.css"),
  `/* Академия зарубежного YouTube — стили для Тильды. Сгенерировано tools/build-tilda.mjs из assets/css/classic.css, вручную не править. */\n` +
  // Тильда снимает подчёркивание со всех ссылок (#allrecords a) — возвращаем как в браузере;
  // кнопки, меню и логотип сами ставят text-decoration: none более сильными правилами
  `${SCOPE} a { text-decoration: underline; }\n` +
  scopeCss(read("assets/css/classic.css")));

writeFileSync(join(OUT, "head.html"), `${banner("код для HEAD страницы", "Настройки страницы → Дополнительно → «HTML-код для вставки внутрь HEAD»")}
<meta name="theme-color" content="#0a0709">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<link rel="stylesheet" href="${CDN}tilda/yta-tilda.css">
<style>body { background: #0a0709; }</style>
`);

writeFileSync(join(OUT, "block.html"), `${banner("вся страница для блока «HTML-код» (T123)", "блок T123 → Контент. На странице больше ничего не нужно: шапка и подвал — свои")}

<!-- Настройки страницы: видео, куда уходят заявки, бот, счётчик мест. Меняйте прямо здесь. -->
<script>
${config}
</script>

<div id="yta">
${markup}
</div>

${libs}
<script defer src="${CDN}assets/js/core.js"></script>
<script defer src="${CDN}assets/js/scene3d.js"></script>
<script defer src="${CDN}assets/js/classic.js"></script>
`);

/* ---------- политика конфиденциальности: самостоятельный блок со своими стилями ---------- */
const privacy = read("privacy.html");
const pStyle = privacy.match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
const pMain = privacy.match(/<main>[\s\S]*?<\/main>/)?.[0] || "";
writeFileSync(join(OUT, "privacy-block.html"), `${banner("политика конфиденциальности для блока «HTML-код» (T123)", "отдельная страница Тильды с адресом privacy, блок T123 → Контент")}
<style>
${SCOPE} a { text-decoration: underline; }
${scopeCss(pStyle).trim()}
</style>
<div id="yta">
${pMain.replace('href="index.html"', 'href="/"')}
</div>
`);

console.log(`tilda/: head.html, block.html, privacy-block.html, yta-tilda.css — ссылки на ${CDN}`);
