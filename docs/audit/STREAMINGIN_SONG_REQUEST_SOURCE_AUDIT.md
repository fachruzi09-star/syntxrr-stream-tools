# SYNTXRR STREAM — Audit Sumber Lagu (Song Request Source Parity Audit)

**Tanggal Audit:** 2026-11-27  
**Lingkup Kerja:** Audit read-only atas kode SYNTXRR STREAM dan pemeriksaan artefak referensi StreamingIn (`reference/streamingin/`)  
**Status Artefak Referensi:** ⚠️ **APK Referensi `reference/streamingin/Streamingin-Android-full-usb.apk` TIDAK DITEMUKAN di workspace.**

---

## 1. Hasil Pemeriksaan APK dan Bukti yang Ditemukan

### 1.1 Pemeriksaan Lokasi APK & Workspace

Pemeriksaan langsung pada sistem file workspace `/app/applet` menunjukkan temuan faktual berikut:

1. **Direktori `reference/streamingin/`**:
   - Hanya berisi satu berkas: `reference/streamingin/README.md` (`4.454` byte).
   - Berkas biner `reference/streamingin/Streamingin-Android-full-usb.apk` **tidak ada** di direktori tersebut.
2. **Pencarian seluruh workspace**:
   - Pencarian `find . -iname '*.apk'` menghasilkan **0 berkas APK**.
   - Pencarian `find . -maxdepth 4 -iname '*streamingin*'` hanya menemukan tiga jalur:
     - `reference/streamingin/README.md` (panduan umum ruang lingkup audit produk StreamingIn; tidak menyebut daftar provider Song Request maupun endpoint spesifik).
     - `docs/STREAMINGIN_FUNCTIONAL_GAP_TRACKER.md` (catatan gap historis checkpoint V26–V64 untuk Studio, Preset, Group/Supergroup, Mode B screen capture/reshare, dan Screensaver; **tidak memuat temuan apa pun tentang provider atau endpoint Song Request StreamingIn**).
     - `public/assets/aistudio/Screenshot_2026-11-23-01-28-09-437_app.streamingin.device_d60450ae.jpg` (tangkapan layar antarmuka kanvas Studio StreamingIn, bukan antarmuka Song Request).
3. **Ketersediaan alat inspeksi APK di container**:
   - Alat tersedia: `/usr/bin/unzip`, `/usr/bin/python3`, `/usr/bin/strings`.
   - Alat tidak terpasang: `aapt`, `aapt2`, `apktool`, `jadx`, `dexdump`.
   - Meskipun `unzip`/`python3`/`strings` tersedia untuk inspeksi awal ZIP/manifest/DEX strings, **hambatan utama adalah file biner APK sendiri memang tidak tersedia di workspace**.

### 1.2 Bukti yang Ditemukan vs Batasan Audit

- **Terverifikasi dari repositori SYNTXRR:** Seluruh kode Song Request, konektor katalog, mesin pemutaran HTML5/Native Android, manajemen antrean, portal permintaan, dan layanan lirik telah diaudit langsung dari kode sumber.
- **Belum terverifikasi dari StreamingIn:** Tidak ada manifest APK, kelas DEX, string endpoint, konfigurasi network security, atau aset JSON Song Request dari `Streamingin-Android-full-usb.apk` yang dapat dibaca karena biner APK belum tersedia.

---

## 2. Daftar Sumber/Provider StreamingIn yang Berhasil Diverifikasi

> **Status Umum:** **BELUM DAPAT DIVERIFIKASI (`APK_MISSING`) — 0 provider terverifikasi dari biner APK.**

Karena `reference/streamingin/Streamingin-Android-full-usb.apk` tidak ada di workspace dan `docs/STREAMINGIN_FUNCTIONAL_GAP_TRACKER.md` tidak mencatat inventaris Song Request StreamingIn, tidak ada satu pun provider Song Request StreamingIn yang dapat diklaim sebagai terverifikasi dari APK.

Untuk menjaga akurasi teknis dan menghindari asumsi:
- **Klaim provider StreamingIn (misalnya YouTube, Spotify, Audius, SoundCloud, Deezer, Jamendo, iTunes, atau katalog lokal):** **Belum terverifikasi**.
- **Endpoint, skema autentikasi, batas API, cara pencarian, toleransi typo/remix, dan jalur playback StreamingIn:** **Belum terverifikasi** sampai file APK `Streamingin-Android-full-usb.apk` (atau hasil ekstraksi manifest/DEX/string-nya) tersedia untuk diaudit.

---

## 3. Daftar Sumber/Provider SYNTXRR Saat Ini

Audit langsung terhadap kode sumber SYNTXRR menunjukkan bahwa subsistem musik dan Song Request saat ini terbagi menjadi **dua jalur terpisah** (jalur otomatis chat Mode A via `songRequestEngine.ts` dan jalur manual UI via `MusicCenterView.tsx` + `localAudioEngine.ts`) ditambah **satu layanan lirik pendukung** (`lyricsService.ts`).

### 3.1 Jalur Otomatis Chat Mode A (`src/services/songRequestEngine.ts`)

`SongRequestEngine` berlangganan `streamEventBus` (baris 763–794) untuk memproses perintah `!play`, `!sr`, `!songrequest`, `!queue`, `!np`, dan `!nowplaying` saat `operatingMode` adalah Mode A (`MODE_A_TIKTOK_COMPANION` / `MODE_A_OVERLAY`).

Urutan resolusi sumber pada `resolveSongFromProviders()` (baris 900–1026) adalah sebagai berikut:

| Urutan | Provider | Berkas Kode | Endpoint / Mekanisme | Status Playback (`playable`) | Kredensial | Catatan Teknis Terverifikasi |
|---|---|---|---|---|---|---|
| **1** | **Audius REST API v1** | `src/services/audiusService.ts` | `GET https://api.audius.co/v1/tracks/search?query=...&app_name=SYNTXRR_STREAM` + `HEAD/GET Range` ke `/v1/tracks/{id}/stream` + validasi host redirect terhadap `/validators` / `/content-nodes` | ✅ **Playable (`remote_url`)** bila lolos verifikasi lisensi & stream | Tidak perlu API key (pakai `app_name=SYNTXRR_STREAM`) | Mengizinkan **Open Music License (OML)**, **CC0**, **CC BY**, **CC BY-SA**. Menolak **NC** (NonCommercial) dan secara konservatif menolak **ND** (NoDerivatives). Mengecek `is_available`, `!is_unlisted`, `!is_delete`, `is_streamable`, `!is_stream_gated`, `access.stream`, MIME, dan magic bytes audio (`ID3`, `OggS`, `fLaC`, `RIFF..WAVE`, `FORM..AIFF`, `ftyp`, EBML, MPEG/ADTS). |
| **2** | **YouTube Data API v3** | `src/services/youtubeService.ts` | `GET https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&type=video&q=...` | ❌ **Metadata-only (`youtube_metadata`, `playable: false`)** | Wajib `settings.youtubeApiKey` | Mengambil judul, channel, thumbnail, dan URL `youtube.com/watch?v=...`. Tanpa durasi (`durationSec: 0`). Tidak ada ekstraksi audio. Ditolak saat `playItem()` (baris 1142–1164) karena bukan sumber playback berizin. |
| **3** | **Spotify Web API** | `src/services/spotifyService.ts` | `GET https://api.spotify.com/v1/search?q=...&type=track&limit=10` | ❌ **Metadata-only (`spotify_metadata`, `playable: false`)** | Wajib `settings.spotifyAccessToken` (OAuth client-side implicit token, scope `user-read-private playlist-read-private`) | Mengambil judul, artis, album, artwork, durasi, dan URL `open.spotify.com/track/...`. Tanpa ekstraksi audio (dan tidak memakai `preview_url` maupun SDK playback). Ditolak saat `playItem()`. |
| **(Khusus item terstruktur / requeue)** | **Authorized Direct Stream (`authorized_stream`)** | `src/services/songRequestEngine.ts` | `sourceType: 'remote_url'`, `playable: true`, `audioUrl: http(s)://...` | ✅ **Playable (`remote_url`)** | Bergantung pada sumber URL | Didukung oleh `playItem()` dan `sanitizeHistoryTrackSnapshot()`, tetapi **tidak pernah di-resolve otomatis** dari perintah chat `!play` oleh `resolveSongFromProviders()`. |

#### Perilaku Penting pada `resolveSongFromProviders()` & Pemutaran Saat Ini:
1. **Short-circuit pada Audius (`songRequestEngine.ts` baris 937–944):**  
   Jika Audius menemukan hasil pencarian (`hasMatchedTracks === true`), namun seluruh kandidat gagal lolos cek lisensi (mis. berlisensi `CC BY-NC` / `CC BY-ND`) atau gagal verifikasi stream, **fungsi langsung mengembalikan error dan TIDAK melanjutkan ke provider fallback berikutnya** (tidak lanjut ke YouTube/Spotify atau sumber lain).
2. **Pemilihan kandidat `first-pass` tanpa re-ranking:**  
   - Di Audius (`resolvePlayableTrack`, `audiusService.ts` baris 1111–1125), kandidat yang lolos cek lisensi langsung dicoba berurutan sesuai urutan API dan kandidat pertama yang stream-nya valid langsung dipilih.
   - Di YouTube (`songRequestEngine.ts` baris 956) dan Spotify (`songRequestEngine.ts` baris 987), selalu mengambil `results[0]` tanpa skor kecocokan judul/artis.
3. **Nol normalisasi query & nol toleransi typo/remix:**  
   - `AudiusService.searchCatalog`, `YouTubeService.searchCatalog`, dan `SpotifyService.searchCatalog` hanya memanggil `.trim()`.
   - Tidak ada normalisasi tanda baca/karakter khusus, pemisahan `"Artis - Judul"`, stripping tag noise (`(Official Audio)`, `[Lyrics]`, dll.), toleransi typo (fuzzy matching / edit distance / n-gram), maupun pembobotan khusus untuk query `remix`, `dj`, `edit`, `bootleg`, `acoustic`, `sped up`, atau `slowed`.
4. **Mesin Pemutaran (`playItem()`, baris 1136–1371):**  
   - **Android APK:** `NativeMusicPlayer.java` menggunakan `android.media.MediaPlayer` + `MediaSession` + `PARTIAL_WAKE_LOCK` yang berjalan di proses foreground `CompanionService`, mendukung `sourceUri` (`http://`, `https://`, `content://`, `file://`) dan `playBase64` (batas 25 MB).  
   - **Web:** `HTMLAudioElement`.  
   - **History & Refresh (`MAX_SONG_REQUEST_HISTORY = 100`):** Untuk Audius, stream URL disegarkan ulang via `AudiusService.refreshStreamForTrackId()` saat requeue agar signature/CDN URL kedaluwarsa tetap berfungsi.

### 3.2 Jalur Manual Music Center (`src/components/MusicCenterView.tsx`, `src/services/localAudioEngine.ts`, `src/App.tsx`)

Antarmuka `MusicCenterView.tsx` mengelola antrean dan sumber musik manual yang **terpisah dari `songRequestEngine`**:

1. **Local Audio Engine (`src/services/localAudioEngine.ts` & `src/components/music/LocalAudioPlayer.tsx`):**
   - Memilih file audio lokal (`.mp3`, `.wav`, `.ogg`, `.aac`, `.m4a`, `.flac`, `.webm`) melalui `<input type="file">`.
   - Metadata disimpan di `localTracksMeta` (`LocalAudioTrackMeta[]`) dengan parsing nama file sederhana berbasis pemisah `"-"` (`Artist - Title`, `App.tsx` baris 1924–1928).
   - File `File` mentah disimpan di `localFilesMap` (in-memory per sesi, `URL.createObjectURL(file)`) dan diputar melalui HTML5 `Audio` (`audioEngine`).
   - **Batasan kritis:** Pustaka audio lokal ini **tidak terhubung sebagai sumber pencarian untuk perintah chat Mode A (`!play`)** dan `File` hilang setelah sesi/reload browser/WebView sehingga user harus memilih ulang berkas.
2. **YouTubeConnector & SpotifyConnector (`src/components/music/`):**
   - Pencarian manual di UI (`YouTubeService.searchCatalog` / `SpotifyService.searchCatalog`) yang menghasilkan kartu metadata untuk dimasukkan ke `unifiedQueue` (`UnifiedQueueItem[]`) atau dibuka ke aplikasi eksternal (`window.open`). Tidak memiliki kontrol playback in-app.
3. **ViewerRequestPortal (`src/components/music/ViewerRequestPortal.tsx`):**
   - Form simulasi/manual untuk memasukkan judul atau tautan YouTube/Spotify ke `unifiedQueue`, dengan deteksi duplikasi eksak (URL atau `title.toLowerCase() + artist.toLowerCase()`).
4. **Preset Music Packs (`handleLoadPresetPack` di `src/App.tsx` baris 1900–1916):**
   - Menambahkan item contoh statis (`Cyber City Run`, `Laser Grid Odyssey`, `Tokyo Rain Walk`) ke state legacy `songRequests` tanpa URL audio yang dapat diputar.

### 3.3 Layanan Lirik Pendukung (`src/services/lyricsService.ts`)

- **LRCLIB (`https://lrclib.net/api/get`):** Layanan baca-saja untuk lirik tersinkron (LRC) / teks polos berdasarkan `track_name`, `artist_name`, `album_name`, dan `duration` dari lagu aktif (`SongRequestState` atau `LocalAudioEngine`).
- Bukan sumber katalog pencarian lagu/audio, namun saat ini mengirim `trackName` dan `artistName` secara mentah (`trim()` saja) tanpa pembersihan tag seperti `(Official Audio)`, `[Remix]`, atau `feat.`, sehingga sensitif terhadap format penamaan judul track dari katalog.

---

## 4. Tabel Perbandingan dan GAP

| Komponen | StreamingIn | SYNTXRR | Kekurangan/GAP | Rekomendasi |
|---|---|---|---|---|
| **Sumber Playable Resmi (Streaming Online Tanpa Key User)** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | Hanya **Audius REST API v1** (wajib lolos OML / CC0 / CC BY / CC BY-SA & cek magic bytes stream). | Ketergantungan pada satu katalog playable online (Audius). Banyak lagu populer, remix regional/DJ, atau katalog CC lain tidak tersedia atau tertolak oleh filter NC/ND sehingga request viewer langsung gagal. | Tambahkan katalog berizin terbuka/legal kedua (mis. **Jamendo Music API** dengan lisensi streaming komersial/CC yang jelas dan/atau direktori audio berizin milik kreator) sebagai sumber playable pendamping Audius. |
| **Sumber Metadata Eksternal (YouTube & Spotify)** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | **YouTube Data API v3** (perlu API key user) & **Spotify Web API** (perlu OAuth token user). Hanya metadata + deep-link (`playable: false`). | Membutuhkan kredensial manual dari user; hasil metadata ditolak saat pemutaran otomatis Mode A (`playItem`), serta hanya mengambil `results[0]` mentah. | Pertahankan kebijakan zero-audio-extraction (patuh ToS), namun perjelas pemisahan UI antara *metadata request card* vs *auto-playable catalog*, serta tambahkan opsi resolusi silang (cross-lookup judul+artis dari hasil metadata ke katalog berizin / pustaka lokal milik streamer). |
| **Audio Lokal / Pustaka Perangkat dalam `!play`** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | `localAudioEngine.ts` + `LocalAudioPlayer.tsx` hanya untuk pemutaran manual UI; tidak tersambung ke `songRequestEngine` Mode A. | Streamer yang sudah memiliki koleksi lagu bebas royalti/DJ edit berizin di HP tidak bisa memutarnya lewat perintah `!play <judul>` viewer; `localFilesMap` juga tidak persisten antar sesi WebView. | Tambahkan resolver opsional **Local/Owned Library** pada `SongRequestEngine` (cocokkan `!play` terhadap daftar lagu lokal/URI `content://` yang diizinkan di `NativeMusicPlayer.java` dengan persetujuan SAF/MediaStore Android). |
| **Normalisasi Query Pencarian** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | Hanya `query.trim()` di semua konektor (`audiusService`, `youtubeService`, `spotifyService`). | Query dengan tanda baca berlebih, format `"Artis - Judul"`, `"Judul by Artis"`, huruf kapital/aksen, atau karakter emoji/noise dari chat TikTok sering gagal ditemukan atau menghasilkan skor buruk di API pencarian. | Bangun modul normalisasi query deterministik (hapus noise chat/emoji, normalisasi spasi & Unicode, ekstraksi pola artis vs judul, pembuatan varian query fallback bertingkat). |
| **Toleransi Typo (Fuzzy Matching)** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | **Tidak ada**. Pencocokan sepenuhnya bergantung pada mesin pencari sisi server API eksternal (`results[0]`). | Kesalahan ketik ringan dari penonton di chat TikTok (mis. huruf hilang/tertukar) langsung menyebabkan 0 hasil di Audius atau hasil salah di `results[0]`. | Terapkan skoring & fuzzy re-ranking sisi klien atas seluruh daftar kandidat API (mis. batas hasil `limit=15–20` lalu hitung skor gabungan token overlap + Levenshtein/trigram similarity) serta fallback pencarian bertahap dengan token inti. |
| **Pencocokan Remix / DJ Edit / Versi Lagu** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | **Tidak ada**. Tidak ada deteksi atau pembobotan modifier versi lagu. | Query seperti `"lagu X dj remix"` atau `"lagu X acoustic"` bisa memilih versi acak atau versi asli/snippet berdurasi 10 detik jika muncul di posisi pertama API; sebaliknya query normal bisa terkena remix/loop tidak diinginkan. | Tambahkan *version-modifier classifier* (`remix`, `dj`, `edit`, `bootleg`, `sped up`, `slowed`, `acoustic`, `live`, `instrumental`, `cover`) + bobot penalti/bonus kesesuaian modifier dan filter kewajaran durasi. |
| **Fallback Multi-Provider** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | Audius → YouTube → Spotify, **tetapi terhenti dini** di `songRequestEngine.ts` baris 937–944 jika Audius punya hasil yang tertolak lisensi/stream. | Jika lagu ada di Audius sebagai `CC BY-NC` / `CC BY-ND`, engine berhenti total tanpa mencoba provider playable lain (atau menampilkan metadata alternatif sesuai kebijakan). | Pisahkan status *"found playable"* vs *"found restricted/unplayable"*, dan lanjutkan pencarian ke provider playable terkonfigurasi berikutnya (serta pustaka lokal streamer jika diaktifkan) sebelum mengembalikan error akhir. |
| **Sinkronisasi Queue & State Musik** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | Dua sistem antrean terpisah: `songRequestEngine.state.queue` (Mode A `!play`) dan `App.tsx unifiedQueue` / `songRequests`. | Memicu inkonsistensi UX antara tab Queue, Now Playing deck, History, dan aksi preset pack; item preset pack (`handleLoadPresetPack`) bahkan tidak dapat diputar. | Jaga `songRequestEngine` & `NativeMusicPlayer` tetap utuh, tetapi dokumentasikan/satukan kontrak antrean dan status `playable` vs `metadata_only` secara konsisten di `MusicCenterView`. |
| **Pencarian Lirik (`LRCLIB`)** | Belum dapat diverifikasi (APK tidak tersedia di workspace) | `lyricsService.ts` memanggil `https://lrclib.net/api/get` dengan `trackName` dan `artistName` mentah. | Judul dengan suffix seperti `(Official Audio)`, `[CC BY]`, atau nama channel YouTube/handle Audius gagal cocok di LRCLIB. | Tambahkan pembersihan judul/artis saat lookup LRCLIB (sebagai fallback jika lookup mentah 404) untuk meningkatkan tingkat kecocokan lirik tersinkron. |

---

## 5. Rekomendasi Penyamaan Sumber

Semua rekomendasi berikut dirancang **strictly legal** (hanya memakai API resmi, katalog lisensi terbuka, atau aset milik streamer sendiri) tanpa bypass DRM atau ekstraksi audio pihak ketiga:

### 5.1 Prasyarat Wajib: Verifikasi Ulang dengan APK StreamingIn Asli
- Sebelum menambah atau mengubah provider eksternal demi *parity* dengan StreamingIn, lengkapi `reference/streamingin/Streamingin-Android-full-usb.apk` di repositori lalu lakukan inspeksi statis (`AndroidManifest.xml`, daftar package/class di `classes*.dex`, URL API, dan library audio/network) agar keputusan penambahan provider berbasis bukti nyata, bukan tebakan.

### 5.2 Arsitektur Multi-Sumber Playable yang Legal & Tahan Gagal
1. **Tambahkan Katalog Playable Legal ke-2 (Jamendo Music API v3.0):**
   - Menyediakan katalog besar musik independen, elektronik, lo-fi, instrumental, dan remix kreator dengan metadata lisensi Creative Commons eksplisit (`license_ccurl`) dan URL stream audio resmi.
   - Cocok ditempatkan sejajar/setelah Audius dalam rantai fallback playable, tetap dengan policy filter lisensi (blokir NC jika siaran komersial/monetized, wajibkan atribusi kreator di overlay/history).
2. **Aktifkan Resolver Pustaka Audio Lokal / Perangkat Milik Streamer (Opt-in):**
   - `NativeMusicPlayer.java` (baris 317–323) **sudah mendukung pemutaran `content://` dan `file://` URI secara native** di foreground service.
   - Dengan menambahkan indeks lokal yang persisten (mis. Android Storage Access Framework / `content://` URI persistable permission atau pemilihan folder musik bebas-royalti streamer), perintah chat `!play <judul>` dapat mencocokkan lagu dari koleksi lokal streamer terlebih dahulu (atau sebagai fallback) dengan latensi nol dan keandalan offline 100%.
3. **Opsional: Katalog Terkurasi JSON / Direct Authorized Feed Streamer:**
   - Memungkinkan streamer menautkan daftar lagu berlisensi/royalty-free milik sendiri (judul, artis, tag remix, license label, URL stream HTTPS langsung) untuk diputar via `authorized_stream`.

### 5.3 Lapisan Normalisasi Query, Toleransi Typo, & Pencocokan Remix/DJ Edit
Tambahkan modul murni TypeScript (`songQueryMatcher.ts`) sebelum dan sesudah pemanggilan API katalog:
1. **Query Normalization Pipeline:**
   - Hapus karakter kontrol, emoji chat, tag berlebih (`[mv]`, `(official audio)`, `(lyric video)`), serta samakan Unicode/diakritik dan tanda baca.
   - Deteksi pola pemisah `"Artis - Judul"` maupun `"Judul - Artis"` dan hasilkan *cleaned query* + *token set*.
2. **Modifier & Intent Extraction (Remix / DJ Edit):**
   - Ekstrak token niat versi: `remix`, `dj`, `edit`, `rework`, `bootleg`, `mashup`, `vip`, `acoustic`, `live`, `instrumental`, `karaoke`, `sped up`, `slowed`, `reverb`.
   - Jika viewer meminta `"lathi dj remix"`, kandidat yang memiliki token `dj`/`remix` dan kata inti `lathi` diberi bonus skor tinggi, sedangkan kandidat tanpa kecocokan modifier diberi penalti. Sebaliknya, jika viewer hanya mengetik `"lathi"`, kandidat versi asli/normal diprioritaskan di atas `"1 hour loop"`, `"nightcore"`, atau `"dj tiktok slowed"`.
3. **Candidate Scoring & Typo Tolerance (Re-ranking):**
   - Naikkan `limit` pencarian katalog menjadi mis. `15–20` item, lalu beri peringkat kandidat menggunakan kombinasi:
     - *Exact / substring match* pada judul & artis,
     - *Token overlap* (Jaccard / weighted token match),
     - *Fuzzy similarity* (Damerau-Levenshtein / bigram-trigram similarity) per token untuk menangani typo ringan (`"alann walker"` → `"alan walker"`, `"faded"` vs `"fadde"`),
     - *Duration sanity check* (hindari teaser/intro `< 30 detik` atau kompilasi `> 15 menit` kecuali query menyebut `mix`/`megamix`/`set`).
4. **Multi-Stage Query Fallback:**
   - Jika pencarian persis menghasilkan 0 kandidat, jalankan maksimal 1–2 variasi query (mis. hapus stopwords/filler seperti `"lagu"`, `"tolong putar"`, atau fallback ke kata kunci inti tanpa modifier minor), dengan rate-limit guard agar tidak memicu HTTP `429`.

### 5.4 Perbaikan Alur Fallback Antar-Provider
- Ubah perilaku short-circuit di `SongRequestEngine.resolveSongFromProviders()` (saat ini baris 937–944 berhenti ketika `audiusRes.hasMatchedTracks` true meski semua tertolak lisensi) agar tetap melanjutkan ke provider playable lain yang terkonfigurasi (mis. Pustaka Lokal → Audius → Jamendo) sebelum menyatakan tidak ditemukan atau beralih ke fallback metadata YouTube/Spotify (dengan pesan yang jujur bahwa lagu hanya ditemukan sebagai metadata).
- Jika hasil pertama adalah metadata YouTube/Spotify yang memiliki judul + artis bersih, engine dapat secara opsional melakukan *cross-search* satu kali ke sumber playable legal (Lokal / Audius / Jamendo) bila skor kecocokannya tinggi, tanpa pernah melakukan ekstraksi audio dari YouTube/Spotify.

---

## 6. Risiko, Batasan Legal, dan Kebutuhan API Masing-Masing Provider

| Provider / Sumber | Kebutuhan API & Kredensial | Risiko Teknis & Rate Limit | Batasan Legal, DRM & Kebijakan ToS |
|---|---|---|---|
| **Audius REST API v1** (Sudah ada) | Tidak perlu API key rahasia; hanya parameter query `app_name=SYNTXRR_STREAM`. | HTTP `429` saat lonjakan request; redirect ke Content Node dapat berubah sehingga perlu refresh URL (`refreshStreamForTrackId`); banyak lagu komersial tidak ada atau bertanda `CC BY-NC` / `CC BY-ND`. | **Open Music License (OML)** mengizinkan streaming publik melalui API untuk track `is_streamable && !is_stream_gated`; trek `NC` wajib diblokir untuk siaran komersial/monetized; trek `BY`/`BY-SA` mewajibkan atribusi kreator/lisensi. |
| **YouTube Data API v3** (Sudah ada, metadata-only) | Wajib **API Key** milik user (`settings.youtubeApiKey`) dari Google Cloud Console. | Kuota harian default `10.000 units/day`; satu `search.list` memakan **100 units** (~100 pencarian/hari per key user!), sangat cepat habis jika tidak ada cache atau jika dipanggil berulang pada chat ramai. | **Dilarang keras** mengunduh, mengekstrak, memisahkan, atau mem-proxy stream audio YouTube di luar pemutar resmi YouTube (ToS YouTube & anti-circumvention). Tetap wajib `playable: false` (metadata & deep-link saja). |
| **Spotify Web API** (Sudah ada, metadata-only) | Wajib **Client ID** + **OAuth Access Token** user (`settings.spotifyAccessToken`). Saat ini memakai implicit grant (`response_type=token`) yang sudah mulai dideprekasi Spotify dan memiliki masa berlaku pendek (~1 jam). | Token cepat kedaluwarsa (HTTP `401`) karena tidak ada refresh token PKCE; rate limit `429` berbasis `Retry-After`. | **DRM & ToS Spotify** melarang keras ekstraksi, rekaman, atau routing audio ke encoder siaran pihak ketiga. Selain itu, endpoint `preview_url` (30 detik) juga telah banyak dibatasi/dihapus Spotify untuk aplikasi baru, sehingga harus diperlakukan sebagai **metadata-only**. |
| **Jamendo Music API v3.0** (Kandidat) | Wajib registrasi **`client_id`** (aplikasi) dan tunduk pada syarat penggunaan API Jamendo (gratis terbatas untuk non-komersial; lisensi komersial/bisnis mungkin memerlukan perjanjian/tier berbayar). | Batas kuota bulanan/rate-limit tergantung tier aplikasi; katalog mayoritas musik indie/instrumental, bukan lagu label besar mainstream. | Track berlisensi Creative Commons (termasuk variasi `NC`/`ND`). Wajib membaca field lisensi per track dan **hanya memutar track non-NC/sesuai izin siaran** serta menampilkan atribusi artis. |
| **iTunes Search API** (Kandidat terbatas) | Public GET endpoint (`itunes.apple.com/search`), tanpa API key. | Rate limit ketat (~20 request/menit tidak resmi); hanya menyediakan **preview 30 detik (M4A/AAC)**, bukan lagu penuh. | **Tidak layak sebagai sumber pemutaran lagu penuh**; preview 30 detik tunduk pada ketentuan Apple Affiliates/Media dan tidak menggantikan lisensi musik siaran penuh. |
| **Deezer / SoundCloud API** (Kandidat terbatas) | **SoundCloud**: wajib registrasi OAuth App (`client_id` + `client_secret`) yang persetujuannya sangat dibatasi dan mewajibkan server/token refresh. **Deezer**: API publik sudah banyak menutup akses tanpa token/partner; stream penuh terenkripsi DRM dan hanya 30 detik preview tanpa izin khusus. | Risiko kegagalan autentikasi, pembatasan wilayah (geo-block), serta tidak adanya akses stream penuh legal untuk third-party broadcast. | **Dilarang keras** melakukan scraping halaman web atau mendekripsi stream terproteksi. Tanpa kontrak/OAuth resmi dengan izin broadcast, kedua platform ini berisiko tinggi melanggar ToS. |
| **Lokal Perangkat (`content://` / SAF / `MediaStore`)** | Tidak butuh API eksternal. Di Android membutuhkan izin `READ_MEDIA_AUDIO` (Android 13+) atau **Storage Access Framework (SAF)** `ACTION_OPEN_DOCUMENT_TREE` / persistable URI permission (tanpa izin global sensitif). | File di Android perlu dibaca lewat `content://` URI oleh `NativeMusicPlayer` agar bertahan antar sesi (jangan hanya bergantung pada `File` in-memory WebView). | Aman secara DRM selama file berasal dari koleksi bebas royalti atau berlisensi milik streamer. Tanggung jawab hak cipta siaran (copyright strike platform live) tetap berada pada konten file yang dipilih streamer. |
| **LRCLIB (`lrclib.net`)** (Sudah ada, lirik) | Public read-only API tanpa key, dianjurkan mengirim header `X-User-Agent` (sudah diimplementasikan di `lyricsService.ts`). | Mengembalikan HTTP `429` / `503` saat beban tinggi (sudah ditangani cooldown `Retry-After` di `lyricsService.ts`). | Hanya teks lirik; perlu atribusi `LRCLIB` bila ditampilkan (sudah ada flag `usesLrclibAttribution`). |

---

## 7. Rencana Implementasi Bertahap

Rencana implementasi di bawah ini bersifat **modular dan aditif**, tanpa menulis ulang `NativeMusicPlayer.java`, `localAudioEngine.ts`, antrean/riwayat yang sudah berjalan, Studio, Mode A connector, Mode B, RootEncoder, `package.json`, maupun `bun.lock`:

### Tahap 1 — Inspeksi & Validasi Referensi APK StreamingIn (Gate Awal)
- **Prasyarat:** User menyediakan `reference/streamingin/Streamingin-Android-full-usb.apk`.
- **Aksi:** Ekstrak `AndroidManifest.xml` dan string/paket DEX (hanya baca) untuk memastikan provider Song Request, logika pencarian, dan perilaku fallback aktual StreamingIn sebelum implementasi kode dimulai.

### Tahap 2 — Lapisan Normalisasi Query, Typo Tolerance, & Remix/DJ Matcher (Pure TS)
- **Target file baru (proposal):**
  - `src/services/songQueryMatcher.ts` (normalisasi query, ekstraksi artis/judul, token modifier remix/DJ/edit, fuzzy similarity, ranking kandidat).
  - `src/services/__tests__/songQueryMatcher.test.ts` (unit test terarah untuk typo, remix, tanda baca, noise chat, dan filter durasi).
- **Target file modifikasi minimal:**
  - `src/services/audiusService.ts` (naikkan `limit` default ke mis. `15`, ranking kandidat dengan `songQueryMatcher`, dukung varian query fallback).
  - `src/services/youtubeService.ts` & `src/services/spotifyService.ts` (pilih kandidat terbaik via `songQueryMatcher`, bukan sekadar `results[0]`, plus in-memory short TTL cache untuk menghemat kuota API).
  - `src/services/lyricsService.ts` (opsional fallback query bersih ke LRCLIB saat query mentah mengembalikan 404).

### Tahap 3 — Perbaikan Fallback Multi-Provider & Integrasi Pustaka Lokal Mode A
- **Target file modifikasi minimal:**
  - `src/services/songRequestEngine.ts`:
    - Perbaiki `resolveSongFromProviders()` agar penolakan lisensi pada satu provider tidak menghentikan fallback ke provider playable lain.
    - Tambahkan resolver opsional ke **Pustaka Lokal Terindeks** (mencocokkan `!play` ke `localTracksMeta` / persistable `content://` URI milik streamer).
    - Pertahankan seluruh kontrak `playItem()`, `NativeMusicPlayer`, queue, history, dan 7-stage pipeline guard V25.
  - `src/types/index.ts` & `src/services/storage.ts` (penambahan preferensi konfigurasi provider/fallback/mode matching di `AppSettings` jika dibutuhkan).
  - `src/services/__tests__/songRequest.test.ts` & `src/services/__tests__/audiusSongRequest.test.ts` (tambah regresi untuk multi-provider fallback dan local resolver).

### Tahap 4 — Ekspansi Sumber Playable Berizin Kedua & Transparansi UI
- **Target file baru / modifikasi minimal (jika disetujui pasca-audit APK & ketersediaan `client_id`):**
  - `src/services/jamendoService.ts` (atau katalog open-license terverifikasi lain hasil Tahap 1, dengan cek lisensi & atribusi ketat).
  - `src/components/MusicCenterView.tsx` & `src/components/SettingsView.tsx` (status tiap provider, indikator sumber `Playable` vs `Metadata Only`, toggle fallback/matching pustaka lokal, tanpa mengubah struktur tab/layout inti).

---

## 8. Daftar Hal yang Belum Dapat Diverifikasi

Seluruh item di bawah ini **tidak dapat diverifikasi saat ini** karena berkas `reference/streamingin/Streamingin-Android-full-usb.apk` tidak tersedia di workspace:

1. **Daftar provider/sumber lagu aktual** di dalam APK StreamingIn (apakah memakai YouTube/Innertube/WebView embed, Spotify, Audius, SoundCloud, Jamendo, iTunes, Deezer, backend proxy sendiri, atau file lokal perangkat).
2. **Mekanisme pencarian & normalisasi query** milik StreamingIn (apakah ada pembersihan query, ekspansi sinonim, toleransi typo, atau deteksi khusus untuk query `remix`/`DJ`/`karaoke`).
3. **Skoring dan seleksi kandidat hasil pencarian** di StreamingIn (bagaimana memilih lagu terbaik dari beberapa hasil pencarian).
4. **Rantai fallback antar-sumber** di StreamingIn ketika sumber utama gagal, terkena rate limit, atau tidak menemukan lagu.
5. **Cara StreamingIn memutar lagu hasil Song Request** (apakah menggunakan `MediaPlayer`/`ExoPlayer` native, WebView embed, browser intent eksternal, atau backend stream berizin) serta bagaimana audio dirutekan pada perangkat Android.
6. **Kebutuhan autentikasi/API key/endpoint server** di balik fitur Song Request StreamingIn (termasuk apakah ada layanan backend proprietary di `streamingin`).
7. **Batasan legal & kepatuhan DRM aktual** yang diterapkan pada implementasi StreamingIn di dalam APK.
8. **Tampilan UI/UX Song Request StreamingIn** (hanya tersedia satu screenshot Studio `Screenshot_2026-11-23-01-28-09-437_app.streamingin.device_d60450ae.jpg`, tidak ada screenshot panel Song Request/Music StreamingIn).
