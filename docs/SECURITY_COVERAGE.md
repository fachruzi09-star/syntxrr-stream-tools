# Cakupan Keamanan Dependency — SYNTXRR STREAM

Status keseluruhan: **INCOMPLETE / BELUM LENGKAP.**

Dokumen ini mencatat apa yang benar-benar diperiksa, apa yang belum tercakup, dan prasyarat untuk
melengkapinya. Jangan pernah menyebut hasil ini sebagai "scan bersih" atau "dependency aman".

Diperbarui pada branch `appjet` pada commit `7cf6378` (setelah pekerjaan Floating HUD redesign).

## 1. Yang sudah diperiksa (npm / JavaScript)

| Item | Nilai |
|---|---|
| Scanner | OSV-Scanner 2.7.0 (dikelola AppJet, policy `workspace-dependencies-v1`) |
| Sumber data | `package.json` + `bun.lock` |
| Paket diperiksa | 353 |
| Temuan | 0 (0 blocking) |
| Status | `incomplete` |
| Job bukti terakhir | `94b90748f76eea277cdb64db7ebff5a2` (revisi 11, commit `7cf6378`) |

`package.json` dan `bun.lock` terakhir berubah pada commit `acf61c3` dan tidak berubah sampai
`7cf6378`, sehingga bukti npm di atas masih berlaku untuk kode saat ini.

Catatan penting: pemindaian terakhir dijalankan ulang sekali setelah pekerjaan Floating HUD dan
menghasilkan cakupan yang identik (353 paket npm, 0 temuan, tetap `incomplete`). Karena file
dependency tidak berubah, scan berikutnya tidak boleh diulang tanpa perubahan `package.json` atau
`bun.lock`; mengulang perintah yang sama tidak akan mengubah status menjadi lengkap.

## 2. Yang belum tercakup — dan penyebabnya

Build Android memakai Gradle, bukan lockfile npm. Graph dependency Maven/Gradle (termasuk classpath
plugin AGP) tidak dapat di-resolve oleh scanner yang tersedia di sandbox ini:

- `osv-scanner` tidak ada di PATH sandbox; scanner berjalan di sisi layanan AppJet.
- `ANDROID_HOME` dan `ANDROID_SDK_ROOT` tidak diset, dan tidak ada direktori Android SDK.
- Tanpa Android SDK, plugin `com.android.application` tidak dapat dikonfigurasi, sehingga Gradle
  tidak dapat menyerahkan resolusi dependency ke scanner.

Karena itu status `incomplete` adalah hasil yang benar, bukan kegagalan sementara yang bisa
diselesaikan dengan mengulang perintah yang sama.

Kemampuan yang tidak tersedia di lingkungan ini, dinyatakan eksplisit:

1. **Tidak ada Android SDK** (`ANDROID_HOME` / `ANDROID_SDK_ROOT` kosong) sehingga graph Gradle/Maven
   tidak dapat di-resolve dari workspace.
2. **Tidak ada akses API/token GitHub** di workspace, sehingga hasil Dependency Graph dan Dependabot
   alerts (ekosistem Maven) tidak dapat dibaca dari sini. Pencarian kredensial tidak diizinkan.

Keduanya prasyarat eksternal di luar repository, bukan cacat kode aplikasi.

## 3. Audit classpath build (manual, sebelumnya)

Resolusi classpath plugin dilakukan tanpa Android SDK lewat proyek `/tmp` dan task `printCp`:

- Runtime transitif: 64 modul → **0 advisory**.
- Classpath plugin build: 182 modul → **12 modul / 49 advisory**:
  guava 33.3.1-jre, netty 4.1.110.Final (codec/http/common/handler), commons-compress 1.21,
  jose4j 0.9.5, bouncycastle 1.79, jdom2 2.0.6.
- Seluruh temuan tersebut bersifat **build-time**: dipakai AGP/bundletool saat build dan
  **tidak dipaketkan ke APK**, sehingga tidak menambah permukaan serangan aplikasi yang dikirim ke
  pengguna.

Keterbatasan: hasil ini statis dan tidak diperbarui otomatis. Setiap kenaikan versi AGP atau Gradle
wajib mengulang resolusi ini.

## 4. Kontrol pengganti yang sudah aktif

`.github/workflows/android.yml` memiliki job `dependency-submission`
(`gradle/actions/dependency-submission@v6`, `build-root-directory: android`,
`dependency-graph: generate-and-submit`). Jalur ini menjaga graph Maven tetap mutakhir tanpa
menambahkan scanner eksternal atau secret baru.

Status terverifikasi pemilik (2026-11-11): GitHub Dependency Graph mendeteksi dependency **npm dan
Maven**, Dependabot alerts aktif, dan kedua job (`build` + `dependency-submission`) hijau. Artinya
graph Maven untuk proyek Android sudah tersedia di GitHub dan advisory Gradle terbaca di sana.

Yang tidak dapat dilakukan dari sandbox ini hanyalah **membaca hasilnya**: tidak ada token GitHub
maupun izin API di workspace, dan pencarian kredensial tidak diizinkan. Karena itu laporan dari sini
tidak boleh mengutip angka advisory Maven seolah-olah baru diverifikasi.

## 5. Prasyarat yang tersisa

1. ~~Jalankan job `dependency-submission` pada branch `appjet` via `workflow_dispatch`~~ —
   **sudah terpenuhi** (pemilik mengonfirmasi kedua job hijau dan graph Maven terdeteksi).
2. Masih perlu dilakukan pemilik di UI GitHub: buka **Security → Dependabot alerts**, filter
   ekosistem **Maven**, lalu prioritaskan temuan high/critical pada library yang benar-benar masuk
   APK (AndroidX/Capacitor). Temuan pada classpath plugin (guava, netty, commons-compress, jose4j,
   bouncycastle, jdom2) bersifat build-time dan tidak dikirim ke pengguna.
3. Jika ada temuan runtime: naikkan versi AGP/Gradle atau tambahkan constraint, lalu jalankan ulang
   `bun run build` dan build APK di CI.
4. Scanner sandbox **tidak akan pernah** melaporkan status lengkap untuk proyek ini selama Android
   SDK tidak tersedia. Itu batasan alat, bukan indikasi bahaya dan bukan bukti kebersihan.

## 6. Aturan pelaporan

- Jangan menyatakan "dependency aman" selama status masih `incomplete`.
- Selalu sebutkan cakupan secara eksplisit: npm 353 paket (0 temuan) + Maven/Gradle belum
  diverifikasi oleh scanner.
- Scan hanya mencakup paket yang dilaporkan dan snapshot advisory pada saat pemindaian; itu bukan
  bukti keamanan seluruh aplikasi.
