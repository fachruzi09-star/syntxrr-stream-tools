# Cakupan Keamanan Dependency — SYNTXRR STREAM

Status keseluruhan: **INCOMPLETE / BELUM LENGKAP.**

Dokumen ini mencatat apa yang benar-benar diperiksa, apa yang belum tercakup, dan prasyarat untuk
melengkapinya. Jangan pernah menyebut hasil ini sebagai "scan bersih" atau "dependency aman".

Diperbarui pada HEAD `73ee907`, branch `appjet`.

## 1. Yang sudah diperiksa (npm / JavaScript)

| Item | Nilai |
|---|---|
| Scanner | OSV-Scanner 2.7.0 (dikelola AppJet, policy `workspace-dependencies-v1`) |
| Sumber data | `package.json` + `bun.lock` |
| Paket diperiksa | 353 |
| Temuan | 0 (0 blocking) |
| Status | `incomplete` |

`package.json` dan `bun.lock` terakhir berubah pada commit `acf61c3` dan tidak berubah sampai
`73ee907`, sehingga bukti npm di atas masih berlaku untuk kode saat ini. Scan tidak diulang karena
file dependency tidak berubah.

## 2. Yang belum tercakup — dan penyebabnya

Build Android memakai Gradle, bukan lockfile npm. Graph dependency Maven/Gradle (termasuk classpath
plugin AGP) tidak dapat di-resolve oleh scanner yang tersedia di sandbox ini:

- `osv-scanner` tidak ada di PATH sandbox; scanner berjalan di sisi layanan AppJet.
- `ANDROID_HOME` dan `ANDROID_SDK_ROOT` tidak diset, dan tidak ada direktori Android SDK.
- Tanpa Android SDK, plugin `com.android.application` tidak dapat dikonfigurasi, sehingga Gradle
  tidak dapat menyerahkan resolusi dependency ke scanner.

Karena itu status `incomplete` adalah hasil yang benar, bukan kegagalan sementara yang bisa
diselesaikan dengan mengulang perintah yang sama.

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
`dependency-graph: generate-and-submit`). Berdasarkan verifikasi pemilik: GitHub Dependency Graph
mendeteksi npm **dan** Maven, Dependabot alerts aktif, dan kedua job hijau. Jalur ini menjaga graph
Maven tetap mutakhir tanpa menambahkan scanner eksternal atau secret baru.

## 5. Prasyarat untuk melengkapi

1. Jalankan job `dependency-submission` pada branch `appjet` melalui `workflow_dispatch` agar graph
   Maven terkirim. Langkah ini belum dijalankan dari workspace ini.
2. Setelah graph tersedia, periksa alert Dependabot kategori Maven dan prioritaskan temuan
   high/critical pada library yang benar-benar masuk APK (AndroidX/Capacitor), bukan classpath plugin.
3. Jika ada temuan runtime, perbaiki dengan menaikkan versi AGP/Gradle atau menambah constraint,
   lalu jalankan ulang `bun run build` dan build APK di CI.

## 6. Aturan pelaporan

- Jangan menyatakan "dependency aman" selama status masih `incomplete`.
- Selalu sebutkan cakupan secara eksplisit: npm 353 paket (0 temuan) + Maven/Gradle belum
  diverifikasi oleh scanner.
- Scan hanya mencakup paket yang dilaporkan dan snapshot advisory pada saat pemindaian; itu bukan
  bukti keamanan seluruh aplikasi.
