// Cloudflare Pages Function — menghasilkan berkas .ics (iCalendar) berisi
// semua kegiatan Kalender Akademik yang SUDAH DISETUJUI, supaya bisa
// "dilanggan" (subscribe) langsung dari Kalender iPhone, Google Calendar,
// Outlook, dll -- sekali disambungkan, otomatis update tanpa perlu buka
// aplikasi kita lagi.
//
// Datanya publik (sama seperti yang tampil di kalender-akademik.html tanpa
// perlu masuk), jadi aman pakai kunci publik (anon key) yang sama dengan
// yang dipakai di halaman web-nya -- TIDAK perlu service_role/rahasia apa pun.
//
// URL untuk dilanggan:  https://<domain-anda>/kalender.ics

const SUPABASE_URL = "https://tqkohogieytxyqdmyqep.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ieJ1OhHTke5qJMjK0_IEJw_C9qFt2um";

const JENIS_LABEL = {
  case_report: "Case Report",
  referat: "Referat",
  jurnal_ppds_radiologi: "Pembacaan Jurnal PPDS Radiologi",
  ujian_stase: "Ujian Stase",
  jurnal_ppds_luar: "Pembacaan Jurnal PPDS Luar",
  paper_koas: "Pembacaan Paper Koas",
  ujian_koas: "Ujian Koas"
};

export async function onRequestGet() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/jadwal_akademik?status=eq.disetujui&select=*&order=tanggal.asc`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const daftar = res.ok ? await res.json() : [];

  const baris = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kalender Akademik Radiologi FK USU//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Kalender Akademik Radiologi FK USU",
    "X-WR-TIMEZONE:Asia/Jakarta"
  ];

  for (const k of Array.isArray(daftar) ? daftar : []) {
    baris.push(...susunEvent(k));
  }

  baris.push("END:VCALENDAR");

  return new Response(baris.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="kalender-akademik.ics"',
      "Cache-Control": "public, max-age=1800"
    }
  });
}

function escTeks(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function susunEvent(k) {
  const judul = JENIS_LABEL[k.jenis_kegiatan] || k.judul_kegiatan || "Kegiatan";
  const deskripsi = [];
  if (k.judul_kegiatan && JENIS_LABEL[k.jenis_kegiatan]) deskripsi.push(k.judul_kegiatan);
  if (k.nama_presentan) deskripsi.push("Presentan: " + k.nama_presentan);
  if (k.nama_pembimbing) deskripsi.push("Pembimbing: " + k.nama_pembimbing);
  if (k.keterangan) deskripsi.push(k.keterangan);
  if (k.link_zoom) deskripsi.push("Zoom: " + k.link_zoom);

  const tgl = k.tanggal.replace(/-/g, "");
  const baris = ["BEGIN:VEVENT", `UID:${k.id}@radiologifkusu.pages.dev`, `DTSTAMP:${keUTC(new Date())}`];

  if (k.jam) {
    const jam = String(k.jam).slice(0, 5).replace(":", "");
    baris.push(`DTSTART;TZID=Asia/Jakarta:${tgl}T${jam}00`);
    baris.push(`DTEND;TZID=Asia/Jakarta:${tgl}T${tambahSatuJam(jam)}00`);
  } else {
    baris.push(`DTSTART;VALUE=DATE:${tgl}`);
    baris.push(`DTEND;VALUE=DATE:${tglBesok(k.tanggal)}`);
  }

  baris.push(`SUMMARY:${escTeks(judul)}`);
  if (deskripsi.length) baris.push(`DESCRIPTION:${escTeks(deskripsi.join("\n"))}`);
  if (k.link_zoom) baris.push(`URL:${escTeks(k.link_zoom)}`);
  baris.push("END:VEVENT");
  return baris;
}

function keUTC(d) {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function tambahSatuJam(hhmm) {
  let jam = parseInt(hhmm.slice(0, 2), 10) + 1;
  if (jam > 23) jam = 23;
  return String(jam).padStart(2, "0") + hhmm.slice(2);
}

function tglBesok(tanggalISO) {
  const [y, m, d] = tanggalISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, "");
}
