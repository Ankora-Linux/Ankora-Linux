<div align="center">
  <img src="assets/logo.png" alt="Ankora OS Logo" width="240" style="border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
  <br><br>
  <h1>Ankora Linux (Ankora OS)</h1>
  <p><b>Devuan Linux Tabanlı, Systemd-Free Hafif Çekirdekli, Modern Kiosk Masaüstü Ortamı (Tauri + Rust)</b></p>

  <p>
    <img src="https://img.shields.io/badge/S%C3%9CR%C3%9CM-2.0_(DEVUAN)-ffffff?style=for-the-badge&labelColor=111111" alt="Sürüm">
    <img src="https://img.shields.io/badge/TABAN-DEVUAN_DAEDALUS-d1d1d1?style=for-the-badge&labelColor=111111" alt="Taban">
    <img src="https://img.shields.io/badge/MASA%C3%9CST%C3%9C-ANKORA_DE_(TAURI)-ffffff?style=for-the-badge&labelColor=111111" alt="Masaüstü">
    <img src="https://img.shields.io/badge/L%C3%B0SANS-MIT-41a013?style=for-the-badge&labelColor=111111" alt="Lisans">
  </p>
</div>

Ankora OS; düşük donanım kaynaklarına sahip sistemlerde Chrome OS Flex kararlılığı ve yüksek tepkisellik sunmak üzere tasarlanmış, systemd kirliliğinden arındırılmış Devuan Linux tabanlı bağımsız bir dağıtımdır. Masaüstü ortamı (Ankora DE), Rust ve WebKitGTK (Tauri) üzerinde sıfır çökme ve ultra hafif bellek ayak izi ile çalışır.

---

## 📌 Ankora OS Nedir?

Ankora OS, genel kullanım dağıtımlarında bulunan gereksiz servis kirliliğini (telemetri, kullanılmayan daemon'lar) engellemek ve donanım limitlerini en verimli şekilde kullanmak amacıyla geliştirilmiştir. Masaüstü ortamında görsel tutarlılık sağlarken arka planda Linux çekirdek parametrelerini (sysctl, zram) düşük gecikmeye göre optimize eder.

Sistemde bulunan yerel AI bileşeni, uzak sunuculara veya API anahtarlarına bağımlı değildir. Makine üzerindeki yerel kaynakları kullanarak doğrudan terminal içinden teknik komut yardımı, hata ayıklama ve sistem analizi sunar.

---

## 🛠 Temel Mühendislik Tercihleri ve Mimarisi

### 1. Kademeli Bellek Yönetimi (ZRAM + SWAP Hiyerarşisi)
Düşük RAM kapasitesinde Out-Of-Memory (OOM) kilitlenmelerini engellemek için bellek mimarisi hiyerarşik olarak kurgulanmıştır:
* **ZRAM:** RAM üzerinde sıkıştırılmış blok alanı oluşturarak disk I/O yükünü düşürür ve ilk bellek taşıntılarını karşılar.
* **Disk SWAP:** ZRAM kapasitesi dolduğunda devreye giren ikincil yedek alandır.
* **vm.swappiness & vm.vfs_cache_pressure:** Çekirdek parametreleri disk okuma/yazma gecikmesini minimize edecek değerlere çekilmiştir.

### 2. Çevrimdışı Terminal AI Asistanı (`yardimci`)
Terminalde `yardimci` komutuyla çağrılan bileşen, internet bağlantısı gerektirmeksizin çalışır:
* Veriler harici sunuculara gönderilmez, tamamen yerel bellek üzerinde işlenir.
* Shell komutları, paket bağımlılıkları ve sistem konfigürasyon dosyaları için hızlı referans sağlar.

### 3. Çift Masaüstü Kirliliğini Önleme (Unified Desktop Stack)
Hem KDE Plasma hem de XFCE masaüstü ortamlarında sistem üzerine aynı görevi yapan çift uygulama yüklenmez:
* **Dosya Yöneticisi:** Her iki ortamda da çakışmaları engellemek için varsayılan olarak **Dolphin** kullanılır.
* **Görsel Bütünlük:** Simge seti olarak **Fairy Wren** entegre edilmiştir.

### 4. Şişkinlikten Arındırılmış Sistem (Bloat-Free)
* ISO boyutunu ve sistem açılış süresini olumsuz etkileyen Office suitleri (LibreOffice vb.) imajdan çıkarılmıştır.
* Kullanıcı ihtiyaç duyduğu paketi depo üzerinden tek komutla kurabilir.

### 5. Dahili Oyun ve Grafik Katmanı
* **GameMode:** Oyun başlatıldığında CPU valörünü performance moduna çeker.
* **MangoHud:** Vulkan/OpenGL katmanında FPS, sıcaklık ve RAM kullanım değerlerini önceden yapılandırılmış olarak sunar.

---

## 📊 Sürüm Karşılaştırma Tablosu

| Sürüm Adı | Sistem Tabanı | Yayın Tipi | Odak Noktası | Durum |
| :--- | :--- | :--- | :--- | :--- |
| **Ankora AI Debian** | Debian 13 (Trixie) | Sabit / Stable | Yüksek sistem stabilitesi, düşük kaynak kullanımı | **Aktif Sürüm** |
| **Ankora Kurumsal** | Debian LTS | Sabit / LTS | Merkezi yönetim profilleri, sıkılaştırılmış güvenlik (AppArmor) | **Planlama** |
| **Ankora Geliştirici** | Debian / Arch | Özel Derleme | Hazır derleyici araçları (GCC, Rust, Go, Python) ve Zsh terminal yapısı | **Özel Sürüm** |

---

## 📋 Sistem Gereksinimleri

| Bileşen | Minimum Gereksinim | Önerilen Sistem |
| :--- | :--- | :--- |
| **İşlemci (CPU)** | 64-bit Çift Çekirdek (1.5 GHz) | 64-bit Dört Çekirdek (2.0 GHz+) |
| **Bellek (RAM)** | 2 GB (ZRAM Aktif) | 4 GB ve üzeri |
| **Depolama** | 15 GB Boş Disk Alanı | 25 GB SSD Depolama |
| **Ekran Kartı** | KMS destekli herhangi bir GPU | Vulkan / OpenGL 4.5 destekli GPU |

---

## ⚡ Kurulum ve Kullanım Talimatları

### 1. ISO İmajını Diske Yazdırma
Linux ortamında terminal üzerinden `dd` komutunu kullanarak önyüklenebilir USB oluşturabilirsiniz:


sudo dd if=ankora-2.0-debian-x86_64.iso of=/dev/sdX bs=4M status=progress conv=fsync


## 🌐 Topluluk ve İletişim
Bu proje tamamen açık kaynaklıdır ve topluluğun geri bildirimleriyle büyümektedir. Karşılaştığınız sorunlar, yeni özellik talepleri veya sadece selam vermek için bize katılın:

* 💬 **Topluluk Forumu:** [Ankalab Flarum Cloud](https://ankalab.flarum.cloud)
* 🌍 **Resmi Web Sitesi:** [Sitemiz](https://ankora-linux.github.io/#home) 
* 🐞 **Hata Bildirimi:** GitHub üzerindeki [Issues](../../issues) sekmesini veya forumdan konu açarak kullanabilirsiniz.

### License & Source Code
Ankora OS is built on top of **Debian 12 (Bookworm)**. The base system, Linux Kernel, and upstream packages are distributed under the **GPL (GNU General Public License)** or their respective original licenses. You can find the source code for the base Debian packages in the official Debian repositories.

All custom configurations, boot parameters (GRUB/ISOLinux), UI artwork, and build scripts specific to Ankora OS provided in this repository are licensed under the **MIT License**.
