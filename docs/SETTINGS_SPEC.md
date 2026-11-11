# SYNTXRR STREAM — SPESIFIKASI DAN DOKUMENTASI FONDASI PENGATURAN (SETTINGS)

**Dokumen:** `docs/SETTINGS_SPEC.md`  
**Aplikasi:** SYNTXRR STREAM (Android ID: `com.syntxrr.streamtools`)  
**Versi Spesifikasi:** 3.0.0 (Master Release)  
**Status Implementasi:** Foundation Complete (Single Scrollable Viewport, 6 Sections, Honest Status Badging)  
**Basis Kode:** `src/types/index.ts`, `src/services/storage.ts`, `src/components/SettingsView.tsx`, `android/app/src/main/java/com/syntxrr/streamtools/FloatingHudManager.java`

---

## 1. INVENTARIS LENGKAP ENAM BAGIAN SETTINGS

Menu Settings disajikan dalam **satu halaman vertikal tunggal yang dapat di-scroll (single scrollable view)** untuk kenyamanan navigasi satu tangan pada smartphone:

### A. Umum (General)
Mengatur preferensi dasar aplikasi, visualisasi, dan interaksi pengguna.
* **Bahasa Antarmuka (`language`):** Pilihan `id-ID` (Indonesia) dan `en-US` (English).
* **Tema Tampilan (`theme`):** Pilihan `navy_dark` (Default Dark Navy), `obsidian_dark` (Gelap Pekat), dan `cyber_slate` (Kontras Tinggi).
* **Umpan Balik Getar (`hapticFeedback`):** Saklar aktivasi haptic. Nilai ini dibaca oleh helper bersama `src/services/haptics.ts` (`triggerHaptic`) yang dipakai navigasi utama di `src/App.tsx`, serta oleh tombol pengujian di Settings. Membutuhkan izin `android.permission.VIBRATE` di `android/app/src/main/AndroidManifest.xml`; tanpa izin tersebut `navigator.vibrate()` tidak berefek pada APK. Status: **Berfungsi** bila WebView/perangkat mendukung, selain itu **Tidak Didukung**.
* **Konfirmasi Sebelum Mengakhiri LIVE (`confirmBeforeEndLive`):** Preferensi tersimpan, tetapi belum ada aksi yang bisa dikonfirmasi. Mode A tidak boleh mengakhiri LIVE TikTok (aplikasi TikTok resmi yang mengontrol siaran) dan Mode B belum memiliki sesi encoder. Status: **Pending** — jangan membuat tombol stop palsu demi memenuhi preferensi ini.

### B. Audio & Mikrofon (Audio & Microphone)
Mengatur penangkapan suara, pengujian input real-time, sensitivitas, dan filter pemrosesan suara.
* **Pemilihan Mikrofon (`microphoneDeviceId`):** Dropdown enumerasi perangkat nyata (`audioinput`) dan tombol muat ulang daftar perangkat.
* **Tes Mikrofon (Real-Time VU Meter):** Pengujian tingkat suara nyata menggunakan Web Audio API (`AudioContext`, `createMediaStreamSource`, `createAnalyser`) dengan loop RMS live.
* **Sensitivitas / Gain Input (`micGain`):** Slider 0%–200% (kelipatan 5%). Nilai ini benar-benar diterapkan pada meter VU tes mikrofon (`startMicTest` menghitung `gain = micGain / 100`), tetapi belum ada encoder siaran yang memakainya, sehingga tidak mengubah suara LIVE. Status: **Tersimpan (efek tes saja)**.
* **Noise Suppression (`noiseSuppression`):** Constraint penekan derau latar belakang dari mikrofon.
* **Echo Cancellation (`micEchoCancellation`):** Constraint pencegah gema suara dari speaker perangkat.
* **Auto Gain Control (`micAutoGainControl`):** Normalisasi volume mikrofon secara otomatis.

### C. Floating HUD
Mengatur overlay tombol melayang dan panel kontrol cepat yang digunakan bersama oleh Mode A dan Mode B.
* **Aktivasi Floating HUD (`hudEnabled`):** Saklar On/Off dan tombol pemanggilan service overlay native Android.
* **Ukuran Tombol (`hudButtonSize`):** Slider 40–64 dp (default 48 dp). Status: **Pending**.
* **Transparansi Tombol (`hudOpacity`):** Slider 30%–100% (default 92%). Status: **Pending**.
* **Posisi Tombol (`hudPosition`):** Pilihan Kiri (`left`) atau Kanan (`right`). Status: **Pending**.
* **Catatan implementasi HUD:** `showFloatingHud()` di `src/services/nativeCompanionBridge.ts` dan `FloatingCompanionPlugin.java` tidak menerima parameter, sehingga ukuran, transparansi, dan posisi belum dikirim ke `FloatingHudManager`. Ketiga kontrol tetap **Pending** sampai bridge dan Java diperbarui lalu diverifikasi pada APK.

> **Catatan kejujuran (hasil audit):** Ketiga nilai di atas **tersimpan** di perangkat dan ikut dalam backup, tetapi `FloatingHudManager.java` masih memakai ukuran internal (`WRAP_CONTENT`) serta posisi awal hasil perhitungannya sendiri. Nilai tersebut **belum diterapkan** ke bubble native, sehingga ditandai **Pending** di UI dan bukan diklaim aktif. Penerapannya memerlukan perubahan native (membaca preferensi lalu memanggil `updateViewLayout` / `setAlpha`), di luar cakupan patch Settings ini.
* **Preferensi 6 Tampilan Panel:**
  * `hudPanelChat`: Toggle menu Chat & Gift.
  * `hudPanelSoundboard`: Toggle menu Soundboard SFX.
  * `hudPanelMusic`: Toggle menu Music & Song Request.
  * `hudPanelMixer`: Toggle menu Audio Mixer.
  * `hudPanelLiveControl`: Toggle menu Live Control.
  * `hudPanelSettings`: Toggle menu Pintasan Settings.
* **Aturan Sesi Stream Deck:** Aturan mutual exclusion otomatis antara HUD dan Stream Deck.

### D. Grafis & Performa Perangkat (Graphics & Device Performance)
Menyelaraskan kualitas render visual dengan kapabilitas hardware smartphone.
* **Uji Perangkat Otomatis:** Deteksi core CPU logis (`hardwareConcurrency`), perkiraan RAM (`deviceMemory`), batas tekstur WebGL, dan nama renderer GPU.
* **Rekomendasi Heuristik:** Rekomendasi dinamis resolusi (720p/1080p), FPS (30/60), dan bitrate berdasarkan hasil benchmark perangkat.
* **Auto Apply Rekomendasi (`autoApplyRecommendations`):** Opsi penerapan otomatis hasil rekomendasi tanpa mengunci kontrol manual.
* **Resolusi Manual (`targetResolution`):** Pilihan 720p, 1080p, atau 1440p.
* **FPS Manual (`frameRate`):** Pilihan 30 FPS atau 60 FPS.
* **Bitrate Video Manual (`videoBitrateKbps`):** Slider 2500–9000 Kbps (kelipatan 500 Kbps).
* **Bitrate Audio Manual (`audioBitrateKbps`):** Slider 96–320 Kbps (kelipatan 32 Kbps).
* **Peringatan Risiko Konfigurasi:** Evaluasi otomatis konfigurasi berisiko tinggi (misal: 1440p 60 FPS di ponsel, bitrate seluler > 8000 Kbps, atau 60 FPS pada profil baterai hemat).
* **Profil Performa & Hardware (`performanceProfile`):** Pilihan Hemat Baterai (`battery_saver`), Seimbang (`balanced`), atau Performa Maksimal (`performance`).
* **Akselerasi Hardware GPU (`hardwareAcceleration`):** Penggunaan encoder hardware MediaCodec H.264/HEVC.
* **Output Siaran Mode B (`rtmpServer`, `streamKey`):** Form URL Server RTMP dan Stream Key terproteksi dengan toggle intip (eye toggle).

### E. Sistem (System)
Manajemen izin native, pembersihan cache, telemetri diagnostik, dan perlindungan kredensial.
* **Permissions Manager:** Membaca status izin Kamera, Mikrofon, Notifikasi, dan Overlay Android (`SYSTEM_ALERT_WINDOW`) dengan tombol request langsung.
* **Penyimpanan & Cache:** Menampilkan estimasi kuota penyimpanan (`navigator.storage.estimate()`) dan tombol pembersihan aman Cache Storage tanpa merusak IndexedDB.
* **Diagnostik Sistem:** Ringkasan 15 baris data teknis perangkat dengan tombol salin cepat ke clipboard.
* **Pencadangan & Pemulihan JSON:** Ekspor dan impor seluruh state aplikasi ke file JSON dengan isolasi kredensial (kunci API tidak dibagikan atau ditimpa).
* **Kredensial Integrasi:** Penyimpanan lokal terproteksi untuk YouTube Data API v3 Key dan Spotify Developer Client ID.

### F. Tentang SYNTXRR (About SYNTXRR)
Identitas dan status legal aplikasi.
* **Metadata Aplikasi:** Versi aplikasi (3.0.0 Master Release), Application ID (`com.syntxrr.streamtools`), dan Runtime Aktif (Android APK vs Browser/Desktop).
* **Informasi Pembaruan:** Penjelasan status rilis APK/CI dan ketiadaan OTA updater internal.
* **Lisensi Open-Source:** Daftar 8 komponen OSS utama beserta lisensi resminya (React, Vite, Capacitor, Tailwind CSS, Lucide, Motion, Express, Google GenAI).

---

## 2. STATUS BADGE DAN KETENTUAN IMPLEMENTASI

Aplikasi menerapkan sistem status transparan tanpa klaim palsu:

| Status Badge | Kelas CSS | Makna Fungsional |
| :--- | :--- | :--- |
| **Berfungsi (functional)** | `text-emerald-400 bg-emerald-950/80 border-emerald-800` | Fitur telah terhubung ke API nyata (Web Audio, Permissions, Storage, Vibrate, Export/Import) dan bekerja penuh saat ini. |
| **Tersimpan (stored)** | `text-sky-300 bg-sky-950/80 border-sky-800` | Nilai kontrol tersimpan dengan aman di IndexedDB, siap dibaca oleh pipeline downstream. |
| **Pending (pending)** | `text-amber-300 bg-amber-950/80 border-amber-800` | Kontrol tersedia dan tersimpan, tetapi konsumsi logika di modul target masih dalam penyelesaian (misal: gain mic ke encoder, konfirmasi stop). |
| **Belum Terhubung (not_connected)** | `text-orange-300 bg-orange-950/80 border-orange-800` | Antarmuka sudah siap, namun pipeline eksternal belum tersambung (misal: live RTMP push Mode B, tema styling global). |
| **Coming Soon (coming_soon)** | `text-violet-300 bg-violet-950/80 border-violet-800` | Direncanakan pada roadmap masa depan dan sengaja belum diimplementasikan (misal: in-app OTA updates). |
| **Tidak Didukung (not_supported)** | `text-slate-400 bg-slate-900/80 border-slate-700` | Fitur tidak didukung oleh lingkungan runtime saat ini (misal: Haptic di browser tanpa vibrator, Floating HUD di desktop). |

---

## 3. SPESIFIKASI FLOATING HUD

### A. Konsep & Desain
Floating HUD adalah elemen pendamping melayang native Android yang dirancang untuk siaran live streaming di smartphone:
1. **Tombol Mengambang (Bubble):**
   * Berupa lingkaran kompak (default 48–56 dp) dengan aksen warna dark navy (`#0E1626`) dan border biru (`#2563EB`).
   * Menggunakan WindowManager native Android (`TYPE_APPLICATION_OVERLAY`) dengan flag `FLAG_NOT_FOCUSABLE` agar tidak mengganggu touch input TikTok atau game yang sedang berjalan.
   * Dapat digeser (drag-and-drop) ke seluruh area layar dengan perlindungan batas layar (safe edge clamp).
   * Sensitivitas klik menggunakan threshold gerak 10 piksel (`CLICK_THRESHOLD_PX = 10`).
2. **Panel Kontrol Cepat (Expanded HUD):**
   * Berukuran sedang, mudah dioperasikan dengan satu jempol tangan.
   * Menampilkan tombol tutup yang mudah dijangkau dan otomatis merapat ke tepi layar saat diminimalkan.

### B. Enam Menu Panel Floating HUD
1. **Chat:** Menampilkan chat penonton, notifikasi gift, jumlah viewers, dan feed interaksi live real-time.
2. **Soundboard:** Pintasan 4–6 efek suara (SFX) favorit yang dikonfigurasi dari Studio.
3. **Music:** Menampilkan trek lagu aktif, kontrol antrean, riwayat, status viewer Song Request, dan volume musik.
4. **Audio Mixer:** Slider pengatur volume cepat untuk Master, Music, Soundboard, Mikrofon, dan tombol Mute universal.
5. **Live Control:** Tombol Pause, Resume, dan Stop siaran (hanya aktif pada mode yang mendukung).
6. **Settings:** Pintasan cepat yang membawa pengguna kembali ke menu konfigurasi Floating HUD di halaman Settings utama.

---

## 4. PEMBATASAN KEMAMPUAN MODE A DAN MODE B

Aplikasi mematuhi batasan teknis platform secara ketat:
* **Mode A (TikTok LIVE Companion):**
  * Aplikasi resmi TikTok adalah pihak yang memegang hak siar kamera dan streaming ke server TikTok.
  * SYNTXRR STREAM bertindak murni sebagai asisten overlay, penampil widget, dan monitor interaksi.
  * **LARANGAN:** Dilarang menampilkan kontrol Pause, Resume, atau Stop palsu untuk siaran TikTok di Mode A.
* **Mode B (Standalone Streaming Encoder):**
  * SYNTXRR STREAM bertindak sebagai software switcher dan encoder RTMP mandiri.
  * Kontrol siaran (Start/Pause/Stop) dan penulisan resolusi/bitrate hanya aktif ketika pipeline native RTMP MediaCodec telah benar-benar tersedia.
  * Form RTMP Server dan Stream Key disimpan secara lokal pada perangkat dan dienkapsulasi dari file cadangan.

---

## 5. ATURAN SESI STREAM DECK & ATURAN ANTI-DUPLIKASI

### A. Aturan Sesi Stream Deck
* **Prinsip:** Mencegah interferensi ganda kontrol siaran saat streamer menggunakan HP kedua (Remote Deck).
* **Aturan Logika:**
  * Sesi Remote Stream Deck terhubung dan aktif $\rightarrow$ Floating HUD dinonaktifkan otomatis.
  * Sesi Remote Stream Deck terputus atau tidak aktif $\rightarrow$ Floating HUD dapat diaktifkan kembali.
* **Kejujuran:** Dilarang membuat status koneksi Stream Deck palsu bila koneksi WebSocket/WebRTC P2P belum tersambung.

### B. Aturan Anti-Duplikasi Fitur
Untuk menjaga kerapian arsitektur dan mencegah kebingungan pengguna:
1. **Remote Stream Deck:** Berada di halaman mandiri (`StreamDeckView.tsx`), tidak diduplikasi ke dalam Settings.
2. **Pengelolaan Slot Soundboard:** Dikelola secara visual di Studio (`StudioView.tsx`), Settings hanya menyediakan pengujian perangkat.
3. **Music & Song Request:** Manajemen pemutar dan antrean tetap berada di Music Center (`MusicCenterView.tsx`), Settings hanya menyimpan kredensial API.
4. **Konfigurasi HUD:** Pusat setelan Floating HUD berada di Settings (Bagian C), bukan di Dashboard.
5. **Backup & Restore:** Tersentralisasi di Settings (Bagian E) dan tidak disebar ke tab lain.

---

## 6. CHECKLIST AUDIT READ-ONLY SETTINGS

Gunakan checklist ini pada setiap audit verifikasi berikutnya:

- [ ] **Struktur Tunggal:** Keenam bagian (A sampai F) berada dalam satu halaman vertikal `SettingsView.tsx`.
- [ ] **Persistensi Debounce:** Perubahan input disimpan ke `AppSettings` via debounce `SETTINGS_SAVE_DEBOUNCE_MS` dan tersimpan di IndexedDB.
- [ ] **Kejujuran Status:** Tidak ada status "Berfungsi" pada fitur yang belum memiliki pipeline aktif (seperti RTMP pusher atau tema CSS global).
- [ ] **VU Meter Mikrofon:** Meter level bergerak nyata saat mikrofon aktif dan izin diberikan.
- [ ] **Auto Apply Non-Destructive:** Opsi auto-apply tidak mengunci slider resolusi atau bitrate manual.
- [ ] **Peringatan Risiko:** Konfigurasi ekstrem (1440p 60 FPS atau bitrate seluler tinggi) memunculkan teks peringatan tanpa membatalkan pilihan pengguna.
- [ ] **Perlindungan Kredensial:** Stream Key, YouTube API Key, dan Spotify Client ID tidak ikut terkeskpor ke file cadangan JSON.
- [ ] **Aksesibilitas Android Native:** Tombol uji overlay memeriksa `isNativeAndroid()` sebelum memanggil bridge Capacitor.
