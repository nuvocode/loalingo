# Sprigo — Geliştirme ve canlıya çıkış

Karar: 2026-10-01. Repo public kalıyor; GitHub Actions'ın macOS/Windows dakikaları public repoda ücretsiz,
o yüzden bütün build'ler CI'da. Lokal/Docker build yok (aşağıda neden).

## Akış

1. **Branch:** Her geliştirme `master`'dan açılan bir branch'te yapılır (`feature/…`, `fix/…`, `chore/…`).
2. **Test'e birleştirme:** Branch push edilir, `test`'e PR açılır ve PR ile birleştirilir. Küçük
   değişiklikler PR'sız, doğrudan `test`'e `--no-ff` merge edilebilir. `test` push edilir.
   - `test`'e her push'ta ve her PR'da `check` çalışır: typecheck, testler, 3 işletim sisteminde
     `cargo check` (whisper.cpp dahil). Release build'lerini kıran hatalar çoğunlukla burada yakalanır.
3. **Canlı öncesi duman testi:** `test` master'a geçmeden önce release build'i yayın yapmadan çalıştırılır:
   ```bash
   gh workflow run release.yml --ref test
   ```
   4 build de yeşilse devam (~15 dk, paralel). Paketleme/imzalama hataları burada çıkar, tag'den önce.
4. **Master = canlı:** `test` → `master` yalnızca açık onayla. Önce sürüm yükseltilir (`package.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, sonra `src-tauri`'de `cargo update -p sprigo --offline`).
   Master push'unda `check` tekrar çalışır.
5. **Release:** `check` master'da yeşilse tag atılır:
   ```bash
   git tag v1.3.0 && git push origin v1.3.0
   ```
   `release` 4 build'i yapar, dosyaları ve birleşik `latest.json`'ı **taslak** release'e ekler.
6. **Yayın:** Taslak elle "Publish" edilir. Uygulama içi güncelleme yalnızca yayınlanmış release'i görür;
   bu, son kontrol kapısıdır. Bir build kırmızıysa taslak yayınlanmaz, düzeltme yeni sürümle gelir.

## Neden lokal/Docker build yok

- **macOS:** Docker'da macOS build yapılamaz (macOS konteyneri yok). Bu Mac'te yapılabilir ama CI zaten
  ücretsiz ve 6–8 dk.
- **Windows:** Windows konteyneri Windows host ister; macOS'tan çapraz derleme (cargo-xwin) Tauri'de
  deneysel, whisper.cpp'nin MSVC/CMake build'i ile kırılgan. En uzun build (~14 dk) ama ücretsiz.
- **Linux:** Docker'da yapılabilir, ama tek başına kazandırdığı bir şey yok.
- Build'leri iki yerden üretmek `latest.json`'ı birleştirmeyi elle yapmayı gerektirir; tek kaynak daha güvenli.

Repo private olursa (macOS dakikası 10x, Windows 2x ücretli) macOS build'lerini bu Mac'e almak yeniden
değerlendirilir. `pnpm release` (scripts/release.sh) yalnızca Apple silicon için `latest.json` üretir;
CI release'inin üstüne yüklenirse diğer platformların güncellemesini bozar, acil durum dışında kullanılmaz.
