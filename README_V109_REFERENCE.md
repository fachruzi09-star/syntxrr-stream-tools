# V109 TikTok Transport Reference Bundle

Sumber: `syntxrr-stream-tools-main-fixed-v109(4).zip`
ZIP SHA-256: `3b3af22a6f24e09c3bc0ac4f661a98725b0a7ea15f18677cff577363b4a0602a`

Isi bundle adalah enam file referensi V109 pada path repo aslinya: lima file produksi dan satu file test. Bundle ini adalah **bahan pembanding/merge**, bukan patch siap-timpa. Versi `main` memiliki pengujian dan jalur fallback yang berbeda; ikuti prompt merge secara selektif.

Baseline `main` saat audit: `f3a0c40b68555f0b946fea4a62f5c5ac1ee4a689`.

SHA-256 file referensi V109:
- `android/app/src/main/java/com/syntxrr/streamtools/TikTokLiveConnector.java` — `25f7bfc312424c6b9360b7debefc0dc79290c9762ffe2d08bfab5bf602f14e45` (52167 bytes)
- `android/app/src/main/java/com/syntxrr/streamtools/TikTokRoomResolver.java` — `26c23dbdb6b3852ffeeea400ba4531c6698bc48ece5a7dcc0ee6b94778da66b4` (37147 bytes)
- `android/app/src/main/java/com/syntxrr/streamtools/TikTokWebSocketTransport.java` — `265903285810eba134b87a20e18dc3b90a268e0b4468ec34d245ebad7cea3a24` (27600 bytes)
- `android/app/src/main/java/com/syntxrr/streamtools/TikTokWebcastDecoder.java` — `c7653337ec418fe8691f945b1f14db97ea9f7303ef4bdaa4f9540fd67028c6ed` (42757 bytes)
- `android/app/src/main/java/com/syntxrr/streamtools/EulerStreamTransport.java` — `49cdbf9a38fc12c218c23807c86aa9bebdd878d7233a7c0d29e631f2f25cdf14` (2578 bytes)
- `android/app/src/test/java/com/syntxrr/streamtools/TikTokTransportProtocolTest.java` — `23a7a49b49335e00d5fca0a3d4405113465e0a27d7039fafb3286abe1d192c3d` (7111 bytes)
