// main.ts
// Deno 1.42+ / Deno Deploy

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

// ПОДСТАВЬ СЮДА СВОЙ API-URL Lalafo
// ВАЖНО: не HTML-страницу, а именно URL запроса к /api/search/v3/feed/search?...,
// который ты увидишь в DevTools → Network → Copy as fetch.
const LALAFO_API_URL =
  "https://lalafo.kg/api/search/v3/feed/search?expand=url&per-page=40&category_id=1357";

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars");
}

// забираем список объявлений из Lalafo API
async function fetchLalafoItems(): Promise<any[]> {
  const res = await fetch(LALAFO_API_URL, {
    method: "GET",
    headers: {
      "accept": "application/json, text/plain, */*",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "device": "pc",
      "referer":
        "https://lalafo.kg/kyrgyzstan/kvartiry/arenda-kvartir/dolgosrochnaya-arenda-kvartir/1-bedroom/2-bedrooms/owner?price[to]=60000",
      "cache-control": "no-cache",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Lalafo API raw body snippet:", body.slice(0, 500));
    throw new Error(`Lalafo API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const items = (data as any)?.items;
  return Array.isArray(items) ? items : [];
}

// формируем текст для телеги по одному объявлению
function formatItem(item: any): string {
  const title =
    item.title || item.subject || item.caption || "Объявление без названия";

  const price =
    item.price_text ||
    item.price_formatted ||
    (item.price ? `${item.price} KGS` : "Цена не указана");

  const city =
    item.city?.name || item.city || item.region?.name || "Город не указан";

  let url = item.url as string | undefined;
  if (!url && item.id) {
    url = `https://lalafo.kg/a/${item.id}`;
  }

  return [
    `🏠 ${title}`,
    `💰 ${price}`,
    `📍 ${city}`,
    url ? `🔗 ${url}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// отправка одного сообщения в Telegram
async function sendToTelegram(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: false,
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Telegram error:", res.status, res.statusText, body);
  }
}

// основная логика: взяли последние объявления и отправили пачкой
export async function runOnce() {
  try {
    const items = await fetchLalafoItems();

    if (!items.length) {
      console.log("Нет объявлений из Lalafo (items пустой)");
      return;
    }

    const slice = items.slice(0, 10);

    const message = slice.map(formatItem).join("\n\n---\n\n");

    if (!message.trim()) {
      console.log("Нечего отправлять в Telegram");
      return;
    }

    await sendToTelegram(message);
    console.log(`Отправлено объявлений: ${slice.length}`);
  } catch (e) {
    console.error("Ошибка в runOnce:", e);
  }
}

// локальный запуск: deno run --allow-net --allow-env main.ts
if (import.meta.main) {
  await runOnce();
}

// Автозапуск по расписанию на Deno Deploy (каждые 5 минут).
Deno.cron("lalafo-to-telegram", "*/5 * * * *", async () => {
  await runOnce();
});
