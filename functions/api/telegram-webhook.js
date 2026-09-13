// Cloudflare Pages Function — menerima update dari Bot Telegram (webhook).
//
// Saat peserta klik tombol "Sambungkan Telegram" di kalender-akademik.html,
// mereka diarahkan ke bot dengan perintah otomatis: /start <id_profil_mereka>.
// Telegram meneruskan pesan itu ke sini, dan fungsi ini menyimpan chat_id
// Telegram peserta itu ke tabel profil (pakai service_role, aman karena
// berjalan di server Cloudflare, bukan di browser).
//
// Env yang wajib diisi di Cloudflare Pages -> Settings -> Environment variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN

export async function onRequestPost(context) {
  const { request, env } = context;

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const pesan = update.message;
  if (!pesan || !pesan.text) return new Response("ok");

  const chatId = String(pesan.chat.id);
  const cocok = pesan.text.match(/^\/start\s+([0-9a-fA-F-]{36})/);

  if (!cocok) {
    await kirimPesan(env, chatId,
      "Halo! Untuk menyambungkan akun, buka aplikasi Kalender Akademik lalu klik tombol \"Sambungkan Telegram\".");
    return new Response("ok");
  }

  const userId = cocok[1];

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/profil?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ telegram_chat_id: chatId })
  });

  await kirimPesan(env, chatId, res.ok
    ? "✅ Telegram Anda berhasil disambungkan ke Kalender Akademik Radiologi FK USU. Anda akan menerima pengingat kegiatan secara otomatis (H-1 malam dan pagi hari-H)."
    : "Gagal menyambungkan akun. Coba klik lagi tombol \"Sambungkan Telegram\" dari aplikasi.");

  return new Response("ok");
}

async function kirimPesan(env, chatId, teks) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: teks })
  });
}
