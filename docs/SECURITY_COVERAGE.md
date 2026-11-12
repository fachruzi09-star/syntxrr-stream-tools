# Cakupan Keamanan Dependency — SYNTXRR STREAM

Status keseluruhan: **INCOMPLETE / BELUM LENGKAP.**

Dokumen ini mencatat apa yang benar-benar diperiksa, apa yang belum tercakup, dan prasyarat untuk
melengkapinya. Jangan pernah menyebut hasil ini sebagai "scan bersih" atau "dependency aman".

Diperbarui pada branch `appjet` pada commit `7011f45` (setelah perbaikan kontinuitas data Floating HUD).

## 1. Yang sudah diperiksa (npm / JavaScript)

| Item | Nilai |
|---|---|
| Scanner | OSV-Scanner 2.7.0 (dikelola AppJet, policy `workspace-dependencies-v1`) |
| Sumber data | `package.json` + `bun.lock` |
| Paket diperiksa | 353 |
| Temuan | 0 (0 blocking) |
| Status | `incomplete` |
| Job bukti terakhir | `98c0fc9328fb75ab7d52f19538683c9f` (revisi 11; status tetap `incomplete`) |

`package.json` dan `bun.lock` terakhir berubah pada commit `c7d0622` (nama paket menjadi
`syntxrr-stream`, versi `1.0.0`; `bun.lock` ikut menyesuaikan satu baris), dan tidak berubah sampai
`7011f45`. Pemindaian di atas berjalan terhadap manifest saat ini: `esbuild` tetap `^0.28.0` di
`package.json` dan ter-resolve `0.28.2` di `bun.lock`, sehingga `bun install --frozen-lockfile`
konsisten dan bukti npm di atas berlaku untuk kode saat ini.

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
   alerts (ekosistem Maven) tidak dapat dibaca dari sini. Bukti: `gh` tersedia di `/usr/bin/gh`
   tetapi `gh auth status` melaporkan "not logged into any GitHub hosts", dan `gh api .../dependabot/alerts`
   meminta autentikasi. Pencarian kredensial tidak diizinkan.

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

### 3.1 Verifikasi ulang setelah pin (commit `68f170b`)

Pin pada `android/build.gradle` diuji ulang dengan probe resolusi Gradle 8.14.3 di `/tmp/mavenprobe`
(di luar repository). Probe memakai aturan `resolutionStrategy.eachDependency` yang sama dan
meresolve `buildscript.configurations.classpath` berisi:
`com.android.tools.build:gradle:8.13.0`,
`com.android.tools.utp:android-test-plugin-result-listener-gradle:31.13.0`, dan
`com.android.tools.utp:android-test-plugin-host-emulator-control:31.13.0`.

Hasil `gradle printPinned` (135 artefak ter-resolve):

| Koordinat | Versi ter-resolve | Target patched |
|---|---|---|
| `org.jdom:jdom2` | `2.0.6.1` | tercapai |
| `org.bouncycastle:bcprov-jdk18on` | `1.85` | tercapai |
| `io.netty:netty-handler` | `4.1.137.Final` | tercapai |
| `io.netty:netty-codec-http` | `4.1.137.Final` | tercapai |

Batas bukti ini — jangan dilebih-lebihkan:

- Probe mereplikasi aturan pin pada graph yang sama (AGP + dua artefak UTP), **bukan** menjalankan
  build proyek `:app`; konfigurasi proyek Android tetap membutuhkan Android SDK yang tidak tersedia.
- Ini membuktikan versi yang **dipilih** pada classpath plugin, bukan bahwa Dependabot alerts
  #14/#36/#49/#50 sudah tertutup. Penutupan alert hanya terbukti setelah GitHub memindai ulang
  dependency graph.
- Probe dijalankan online (unduhan dari `google()`/`mavenCentral()`), sehingga tidak dapat diulang
  saat offline; hasilnya tidak disimpan sebagai artefak di repository.
- Probe hanya mencakup classpath plugin. Konfigurasi `androidTestUtil` pada proyek nyata memakai
  aturan pin yang identik di blok `allprojects`, tetapi tidak dapat di-resolve tanpa Android SDK.

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
5. Pin `android/build.gradle` sudah terbukti memilih versi patched pada classpath plugin
   (lihat 3.1). Yang masih belum dapat dibuktikan dari workspace ini: konfigurasi penuh proyek
   `:app` (butuh Android SDK) dan penutupan alert di GitHub (butuh akses Dependabot).

## 6. Aturan pelaporan

- Jangan menyatakan "dependency aman" selama status masih `incomplete`.
- Selalu sebutkan cakupan secara eksplisit: npm 353 paket (0 temuan) + Maven/Gradle belum
  diverifikasi oleh scanner.
- Scan hanya mencakup paket yang dilaporkan dan snapshot advisory pada saat pemindaian; itu bukan
  bukti keamanan seluruh aplikasi.
