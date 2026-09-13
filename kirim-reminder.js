// Cloudflare Pages Function — dipanggil TERJADWAL (lewat cron-job.org, bukan
// oleh pengguna) untuk mengirim reminder Telegram atas kegiatan yang sudah
// disetujui di Kalender Akademik.
//
// Panggil dengan:  GET /api/kirim-reminder?jenis=h1     (malam sebelumnya)
//                   GET /api/kirim-reminder?jenis=harih  (pagi hari-H)
// Header wajib:     x-reminder-key: <REMINDER_SECRET>
//
// Env yang wajib diisi di Cloudflare Pages -> Settings -> Environment variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, REMINDER_SECRET

const JENIS_LABEL = {
  case_report: "Case Report",
  referat: "Referat",
  jurnal_ppds_radiologi: "Pembacaan Jurnal PPDS Radiologi",
  ujian_stase: "Ujian Stase",
  jurnal_ppds_luar: "Pembacaan Jurnal PPDS Luar",
  paper_koas: "Pembacaan Paper Koas",
  ujian_koas: "Ujian Koas"
};

const MODE_LABEL = { daring: "Daring", luring: "Luring", hybrid: "Hybrid" };

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.headers.get("x-reminder-key") !== env.REMINDER_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const jenis = url.searchParams.get("jenis");
  if (jenis !== "h1" && jenis !== "harih") {
    return new Response('parameter "jenis" wajib h1 atau harih', { status: 400 });
  }

  const sekarang = new Date();
  const keTanggal = d => d.toISOString().slice(0, 10);
  const targetTanggal = jenis === "h1"
    ? keTanggal(new Date(sekarang.getTime() + 24 * 60 * 60 * 1000))
    : keTanggal(sekarang);
  const kolomStatus = jenis === "h1" ? "reminder_h1_terkirim" : "reminder_harih_terkirim";

  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };

  const rKegiatan = await fetch(
    `${env.SUPABASE_URL}/rest/v1/jadwal_akademik?status=eq.disetujui&tanggal=eq.${targetTanggal}&${kolomStatus}=eq.false&select=*`,
    { headers }
  );
  const daftarKegiatan = await rKegiatan.json();

  if (!Array.isArray(daftarKegiatan) || daftarKegiatan.length === 0) {
    return new Response(JSON.stringify({ tanggal: targetTanggal, kegiatan: 0, terkirim: 0 }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  const rPeserta = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profil?telegram_chat_id=not.is.null&status_akun=eq.aktif&select=telegram_chat_id`,
    { headers }
  );
  const daftarPenerima = await rPeserta.json();

  let terkirim = 0;
  for (const k of daftarKegiatan) {
    const teks = susunPesan(k, jenis);
    for (const p of daftarPenerima) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: p.telegram_chat_id, text: teks, parse_mode: "HTML" })
      });
      terkirim++;
    }
    await fetch(`${env.SUPABASE_URL}/rest/v1/jadwal_akademik?id=eq.${k.id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ [kolomStatus]: true })
    });
  }

  return new Response(JSON.stringify({ tanggal: targetTanggal, kegiatan: daftarKegiatan.length, terkirim }), {
    headers: { "Content-Type": "application/json" }
  });
}

function susunPesan(k, jenis) {
  const judul = JENIS_LABEL[k.jenis_kegiatan] || k.judul_kegiatan || "Kegiatan";
  const kapan = jenis === "h1" ? "besok" : "hari ini";
  let teks = `📅 <b>Pengingat kegiatan ${kapan}</b>\n\n<b>${judul}</b>\n`;
  if (k.jam) teks += `🕐 Jam ${String(k.jam).slice(0, 5)}\n`;
  if (k.mode_pelaksanaan) teks += `💻 Mode: ${MODE_LABEL[k.mode_pelaksanaan] || k.mode_pelaksanaan}\n`;
  if (k.lokasi) teks += `📍 Lokasi: ${k.lokasi}\n`;
  if (k.judul_kegiatan && JENIS_LABEL[k.jenis_kegiatan]) teks += `📝 ${k.judul_kegiatan}\n`;
  if (k.nama_presentan) teks += `👤 Presentan: ${k.nama_presentan}\n`;
  if (k.nama_pembimbing) teks += `👨‍⚕️ Pembimbing: ${k.nama_pembimbing}\n`;
  if (k.link_zoom) teks += `🔗 Zoom: ${k.link_zoom}\n`;
  return teks;
}
