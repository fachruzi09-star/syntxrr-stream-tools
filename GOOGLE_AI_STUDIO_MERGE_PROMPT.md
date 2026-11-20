# SYNTXRR STREAM — V109 TikTok Transport Merge (Google AI Studio)

Kerjakan hanya di branch **`main`** pada repo `fachruzi09-star/syntxrr-stream-tools`.

## Tujuan
Lakukan **selective merge**, bukan penggantian buta, terhadap transport TikTok LIVE pada sumber V109 yang disertakan. Baseline `main` yang diaudit adalah `f3a0c40b68555f0b946fea4a62f5c5ac1ee4a689`. Sebelum mengubah file, baca versi `main` saat ini dan bandingkan dengan enam file referensi di ZIP ini.

## File dalam lingkup perubahan
Lima file produksi:
- `android/app/src/main/java/com/syntxrr/streamtools/TikTokLiveConnector.java`
- `android/app/src/main/java/com/syntxrr/streamtools/TikTokRoomResolver.java`
- `android/app/src/main/java/com/syntxrr/streamtools/TikTokWebSocketTransport.java`
- `android/app/src/main/java/com/syntxrr/streamtools/TikTokWebcastDecoder.java`
- `android/app/src/main/java/com/syntxrr/streamtools/EulerStreamTransport.java`

Satu file test referensi:
- `android/app/src/test/java/com/syntxrr/streamtools/TikTokTransportProtocolTest.java`

Jangan mengubah file lain kecuali ada dependensi compile yang terbukti dan jelaskan alasannya terlebih dahulu. Jangan mengubah UI, preset, Studio, Mode B, Gradle, `package.json`, atau `bun.lock` dalam pekerjaan ini.

## Perilaku V109 yang harus dipertahankan atau digabungkan
1. **Direct TikTok tetap jalur utama tanpa Euler API key.** Resolver harus membedakan akun tidak ditemukan, benar-benar offline, room tidak terbaca, dan gangguan jaringan.
2. Jika room lookup tidak mengembalikan `roomId`, mengembalikan status yang belum tervalidasi, atau tampak offline, gunakan fallback halaman LIVE publik yang tersedia sebelum menyimpulkan `NOT_LIVE`. Jangan mengubah `ROOM_UNREADABLE` menjadi offline tanpa bukti.
3. Pertahankan retry berulang dengan backoff untuk `NOT_LIVE` dan `ROOM_UNREADABLE`. Pemantauan tidak boleh diam-diam berhenti hanya karena batas percobaan habis; berhenti hanya saat pengguna memutus koneksi atau kondisi terminal yang benar-benar terverifikasi.
4. Untuk Direct WebSocket, gabungkan alur V109 yang mengirim frame `im_enter_room` setelah handshake, menggunakan heartbeat aplikasi TikTok yang berisi room ID dan sequence yang meningkat, serta tetap mengirim ACK untuk frame yang memerlukannya.
5. Jangan menganggap koneksi berhasil hanya karena handshake WebSocket sukses. Status `connected_direct` harus menunggu respons room-entry yang valid atau data Webcast yang benar-benar diterima.
6. Saat LIVE berakhir, pindahkan status ke `waiting_for_live` dan jadwalkan resolusi ulang agar koneksi dapat menemukan sesi LIVE berikutnya. Ketika room ID berubah, reset cursor, `internalExt`, dan retry state yang berasal dari room sebelumnya.
7. Pertahankan pemulihan setelah koneksi terputus lama: cooldown, resolve ulang room, lalu sambung kembali. Jangan mengakhiri sesi Direct hanya karena fallback Euler tidak tersedia.
8. Integrasikan koneksi Euler WebSocket V109 dengan pemrosesan **JSON text frames** dan normalisasi event ke format Webcast yang sudah dipakai `onEventDecoded`. Dukung batch `events`/`messages` dan envelope yang memiliki lapisan `data` tambahan.
9. Heartbeat harus dibedakan menurut transport: RFC 6455 Ping/Pong untuk menjaga WebSocket; heartbeat protobuf TikTok hanya untuk Direct TikTok. Jangan mengirim heartbeat protobuf TikTok ke endpoint Euler JSON.
10. Event chat/comment, gift, like, follow/share, member/join, viewer count, dan stream-ended harus dipetakan ke bentuk event Webcast yang dikenali sistem saat ini. Jangan membuat event atau status sukses palsu.

## Kontrak EulerStream terkini
Gunakan endpoint WebSocket resmi `wss://ws.eulerstream.com`. Koneksi memerlukan tepat satu kredensial: `apiKey` atau `jwtKey`, serta `uniqueId`; versi skema yang didokumentasikan adalah `v1`. Fitur yang dipakai V109 adalah `bundleEvents=true`, `rawMessages=false`, `normalizeUniqueId=true`, dan `syntheticPresence=true`.

**Jangan hardcode, mencatat ke log, atau mengekspos API key/JWT.** Direct TikTok tetap bisa dipakai tanpa kredensial Euler. Euler adalah fallback/opsi terpisah yang harus menyampaikan kebutuhan autentikasi secara jujur; jangan mewajibkan pengguna menyiapkan API key untuk jalur Direct.

Sebelum memutuskan menghapus `EulerStreamTransport.fetch(...)` yang sudah ada di `main`, telusuri semua pemanggil dan verifikasi kontrak endpoint-nya. Jika helper fetch lama masih diperlukan, pertahankan sebagai jalur terpisah yang jelas; jangan menggabungkan protokol HTTP-fetch dengan WebSocket JSON sehingga event/heartbeat salah penanganan.

## Test dan kompatibilitas
- **Pertahankan seluruh pengujian yang sudah ada di `main`.** Jangan mengganti file test `main` dengan file V109 secara utuh.
- Tambahkan cakupan V109 untuk frame room-entry, validasi room ID/sequence heartbeat, URL Euler WebSocket, credential wajib, dan parameter query yang ter-encode.
- Pertahankan pengujian yang ada di `main` untuk ACK, URL TikTok WebSocket, serta fetch helper jika helper itu tetap dipakai.
- Jangan melemahkan assertion untuk membuat tes lulus. Perbaiki implementasi berdasarkan protokol yang benar.
- Jaga signature bridge/listener dan bentuk event yang sudah dipakai aplikasi. Jangan memperkenalkan dependency baru jika tidak benar-benar diperlukan.

## Prosedur kerja wajib
1. Audit keenam file dari `main` dan referensi V109; tulis ringkasan perbedaan penting sebelum patch.
2. Terapkan patch kecil yang mempertahankan perbaikan `main` yang masih valid. Jangan menimpa seluruh file hanya karena versi V109 lebih panjang.
3. Jalankan test Java/Gradle yang tersedia. Jika Google AI Studio tidak dapat menjalankan tes, nyatakan itu dan jangan mengklaim tes lulus; biarkan GitHub Actions menjadi validasi.
4. Periksa `git diff` untuk memastikan hanya file dalam lingkup yang berubah, tidak ada credential, log sensitif, file lock, atau perubahan tak terkait.
5. Laporkan daftar file berubah, perilaku yang digabung, test yang benar-benar dijalankan, dan risiko yang masih tersisa.

## Guardrail penting
- Jangan menghapus fitur `main` yang belum terbukti usang.
- Jangan mengedit tujuh file Mode B hanya untuk menyamakan V109; itu audit terpisah.
- Jangan mengubah 105/106 file Java atau mengekstrak ulang arsip.
- Jangan membuat klaim koneksi TikTok/Euler runtime berhasil hanya dari compile/test unit.
- Jangan mengubah atau meregenerasi `bun.lock`.
