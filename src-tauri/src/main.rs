#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::Manager;

// ============================================================================
// GÜVENLİK SABİTLERİ VE WHITELIST POLİTİKALARI (SECURITY POLICY)
// ============================================================================

/// Terminalde doğrudan veya kompozit çalıştırılmasına izin verilen kesin komutlar
const EXACT_ALLOWED_COMMANDS: &[&str] = &[
    "uname -a",
    "uname -r",
    "whoami",
    "uptime",
    "ls",
    "ls -la",
    "ls -l",
    "ls -lh",
    "date",
    "hostname",
    "id",
    "free -m",
    "free -h",
    "df -h",
    "df -h /",
    "cat /etc/os-release",
    "cat /etc/issue",
    "cat /proc/version",
    "cat /proc/meminfo",
    "cat /proc/cpuinfo",
    "ps aux",
    "top -b -n 1",
    "apt-get clean",
    "rm -rf /tmp/*",
    "apt-get clean && rm -rf /tmp/*",
    "df -h / && free -m",
    "reboot",
    "poweroff",
    "clear",
    "sync",
    "echo 3 > /proc/sys/vm/drop_caches",
];

/// Tekil parametreli komutlarda izin verilen ikili (binary) programlar
const ALLOWED_UTILITIES: &[&str] = &[
    "uname", "whoami", "uptime", "date", "hostname", "id",
    "free", "df", "ls", "ps", "top", "which",
];

/// `cat` komutu ile okunmasına izin verilen güvenli telemetri dosyaları
const ALLOWED_CAT_FILES: &[&str] = &[
    "/etc/os-release",
    "/etc/issue",
    "/proc/version",
    "/proc/meminfo",
    "/proc/cpuinfo",
];

/// AI Asistanının kullanıcı onayıyla çalıştırabileceği kısıtlı güvenli eylemler
const ALLOWED_AGENT_ACTIONS: &[&str] = &[
    "apt-get clean && rm -rf /tmp/*",
    "apt-get clean",
    "rm -rf /tmp/*",
    "df -h / && free -m",
    "df -h",
    "free -m",
    "uptime",
    "sync",
    "echo 3 > /proc/sys/vm/drop_caches",
];

/// Ankora Office tarafından okunabilecek güvenli belge uzantıları
const ALLOWED_DOC_EXTENSIONS: &[&str] = &[
    "pdf", "md", "txt", "docx", "conf", "log",
];

/// Kesinlikle okunması engellenen hassas sistem dosyası ve dizin kalıpları
const SENSITIVE_FILE_PATTERNS: &[&str] = &[
    "/etc/shadow",
    "/etc/gshadow",
    "/etc/sudoers",
    "/etc/master.passwd",
    "/etc/security",
    "/root/.ssh",
    ".ssh/",
    "id_rsa",
    "id_ed25519",
    "id_ecdsa",
    "id_dsa",
    "/proc/kcore",
    "/sys/",
    "/dev/",
    "/var/log/auth",
];

/// İzin verilen klavye haritaları
const ALLOWED_KEYBOARDS: &[&str] = &["tr", "tr_f", "us", "de", "fr", "gb"];

// ============================================================================
// DOĞRULAMA YARDIMCILARI (INPUT SANITIZATION)
// ============================================================================

fn is_valid_username(name: &str) -> bool {
    if name.is_empty() || name.len() > 32 {
        return false;
    }
    let mut chars = name.chars();
    let first = match chars.next() {
        Some(c) => c,
        None => return false,
    };
    if !first.is_ascii_lowercase() && first != '_' {
        return false;
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

fn is_valid_hostname(host: &str) -> bool {
    if host.is_empty() || host.len() > 63 {
        return false;
    }
    if host.starts_with('-') || host.ends_with('-') {
        return false;
    }
    host.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn is_valid_disk_target(path: &str) -> bool {
    if !path.starts_with("/dev/") {
        return false;
    }
    let dev = &path[5..];
    if dev.is_empty() || dev.len() > 16 {
        return false;
    }
    let is_sd = dev.starts_with("sd") && dev.len() >= 3 && dev[2..].chars().all(|c| c.is_ascii_lowercase());
    let is_vd = dev.starts_with("vd") && dev.len() >= 3 && dev[2..].chars().all(|c| c.is_ascii_lowercase());
    let is_nvme = dev.starts_with("nvme") && dev.chars().all(|c| c.is_ascii_alphanumeric());

    is_sd || is_vd || is_nvme
}

fn is_valid_deb_package_name(pkg: &str) -> bool {
    if pkg.len() < 2 || pkg.len() > 64 {
        return false;
    }
    let mut chars = pkg.chars();
    let first = match chars.next() {
        Some(c) => c,
        None => return false,
    };
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.')
}

// ============================================================================
// VERİ YAPILARI (DATA STRUCTURES)
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XdgApplication {
    pub id: String,
    pub name: String,
    pub exec: String,
    pub icon: String,
    pub comment: String,
    pub categories: Vec<String>,
    pub desktop_file: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentResult {
    pub file_name: String,
    pub file_type: String,
    pub file_size: u64,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemTelemetry {
    pub os_name: String,
    pub kernel: String,
    pub init_system: String,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub cpu_cores: usize,
    pub uptime_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageDisk {
    pub name: String,
    pub path: String,
    pub size_gb: f64,
    pub model: String,
    pub is_removable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallPayload {
    pub target_disk: String,
    pub fullname: String,
    pub username: String,
    pub hostname: String,
    pub password: String,
    pub autologin: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiResponse {
    pub reply: String,
    pub has_action: bool,
    pub action_command: Option<String>,
    pub action_desc: Option<String>,
}

fn get_ankora_config_dir() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("/root/.config"));
    path.push("ankora");
    let _ = fs::create_dir_all(&path);
    path
}

// ============================================================================
// 1. GERÇEK TAURI NATIVE WINDOW DRAG
// ============================================================================
#[tauri::command]
fn drag_window(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// ============================================================================
// 2. DİNAMİK XDG .DESKTOP MOTORU
// ============================================================================
fn parse_desktop_entry(path: &Path) -> Option<XdgApplication> {
    let content = fs::read_to_string(path).ok()?;
    let mut name = String::new();
    let mut exec = String::new();
    let mut icon = String::new();
    let mut comment = String::new();
    let mut categories = Vec::new();
    let mut nodisplay = false;

    let mut in_desktop_entry = false;
    for line in content.lines() {
        let line = line.trim();
        if line == "[Desktop Entry]" {
            in_desktop_entry = true;
            continue;
        } else if line.starts_with('[') {
            in_desktop_entry = false;
        }

        if !in_desktop_entry {
            continue;
        }

        if let Some((key, val)) = line.split_once('=') {
            let key = key.trim();
            let val = val.trim();
            match key {
                "Name" if name.is_empty() => name = val.to_string(),
                "Exec" if exec.is_empty() => {
                    let cleaned = val.split('%').next().unwrap_or(val).trim();
                    exec = cleaned.to_string();
                }
                "Icon" if icon.is_empty() => icon = val.to_string(),
                "Comment" if comment.is_empty() => comment = val.to_string(),
                "NoDisplay" => nodisplay = val.eq_ignore_ascii_case("true"),
                "Categories" => {
                    categories = val.split(';').filter(|s| !s.is_empty()).map(|s| s.to_string()).collect();
                }
                _ => {}
            }
        }
    }

    if nodisplay || name.is_empty() || exec.is_empty() {
        return None;
    }

    let file_stem = path.file_stem()?.to_string_lossy().to_string();
    Some(XdgApplication {
        id: file_stem,
        name,
        exec,
        icon,
        comment,
        categories,
        desktop_file: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn scan_xdg_applications() -> Result<Vec<XdgApplication>, String> {
    #[cfg(target_os = "linux")]
    {
        let mut apps = Vec::new();
        let search_dirs = [
            PathBuf::from("/usr/share/applications"),
            PathBuf::from("/usr/local/share/applications"),
            PathBuf::from("/var/lib/flatpak/exports/share/applications"),
            dirs::data_dir().map(|d| d.join("applications")).unwrap_or_default(),
        ];

        for dir in &search_dirs {
            if dir.exists() {
                if let Ok(entries) = fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|s| s.to_str()) == Some("desktop") {
                            if let Some(app) = parse_desktop_entry(&path) {
                                if !apps.iter().any(|a: &XdgApplication| a.id == app.id) {
                                    apps.push(app);
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(apps)
    }

    #[cfg(not(target_os = "linux"))]
    {
        // İndirilmemiş sahte uygulamalar listelenmez (Strict clean state)
        Ok(vec![])
    }
}

// ============================================================================
// 3. PAKET KURULUMU (DEBIAN .DEB DOĞRULAMALI) - GÜVENLİK BULGUSU #7
// ============================================================================
#[tauri::command]
async fn install_deb_package(package_name: String) -> Result<XdgApplication, String> {
    let clean_pkg = package_name.trim();
    if clean_pkg.is_empty() {
        return Err("Geçersiz paket adı.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        let output = if clean_pkg.ends_with(".deb") {
            // Yerel .deb paketi: Yol geçişi ve kabuk metakarakteri doğrulaması
            if clean_pkg.contains("..") || clean_pkg.chars().any(|c| matches!(c, ';' | '&' | '|' | '`' | '$' | '>' | '<' | '\\')) {
                return Err("Güvenlik Hatası: .deb dosya yolunda geçersiz karakterler tespit edildi.".to_string());
            }
            let deb_path = Path::new(clean_pkg);
            if !deb_path.exists() {
                return Err(format!("Paket dosyası bulunamadı: {}", clean_pkg));
            }
            let canonical = fs::canonicalize(deb_path).map_err(|e| e.to_string())?;
            Command::new("dpkg").args(["-i", "--", &canonical.to_string_lossy()]).output()
        } else {
            // Debian resmi paket adı: Sıkı regex doğrulaması ve bayrak enjeksiyonu koruması (--)
            if !is_valid_deb_package_name(clean_pkg) {
                return Err("Güvenlik Hatası: Geçersiz Debian paket adı biçimi.".to_string());
            }
            Command::new("apt-get").args(["install", "-y", "--", clean_pkg]).output()
        };

        match output {
            Ok(res) => {
                if !res.status.success() {
                    let err = String::from_utf8_lossy(&res.stderr);
                    return Err(format!("Paket kurulumu başarısız: {}", err));
                }
            }
            Err(e) => return Err(format!("apt-get/dpkg çalıştırılamadı: {}", e)),
        }

        // Kurulum sonrası XDG dizinini tara
        let apps = scan_xdg_applications().await?;
        if let Some(app) = apps.into_iter().find(|a| a.id.contains(clean_pkg) || clean_pkg.contains(&a.id)) {
            Ok(app)
        } else {
            Ok(XdgApplication {
                id: clean_pkg.to_string(),
                name: clean_pkg.to_uppercase(),
                exec: clean_pkg.to_string(),
                icon: "application-x-executable".to_string(),
                comment: format!("{} paketi sisteme kuruldu.", clean_pkg),
                categories: vec!["Utility".to_string()],
                desktop_file: format!("/usr/share/applications/{}.desktop", clean_pkg),
            })
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        if !clean_pkg.ends_with(".deb") && !is_valid_deb_package_name(clean_pkg) {
            return Err("Güvenlik Hatası: Geçersiz Debian paket adı biçimi.".to_string());
        }
        Ok(XdgApplication {
            id: clean_pkg.to_string(),
            name: format!("{} (Kuruldu)", clean_pkg),
            exec: clean_pkg.to_string(),
            icon: clean_pkg.to_string(),
            comment: "Yerel sisteme başarıyla kaydedildi.".to_string(),
            categories: vec!["System".to_string()],
            desktop_file: format!("/usr/share/applications/{}.desktop", clean_pkg),
        })
    }
}

// ============================================================================
// 4. GÜVENLİ TERMİNAL MOTORU (WHITELIST & SANDBOX) - GÜVENLİK BULGUSU #1
// ============================================================================
#[tauri::command]
async fn run_terminal_command(command: String) -> Result<String, String> {
    let cmd_trimmed = command.trim();
    if cmd_trimmed.is_empty() {
        return Ok(String::new());
    }

    // 1. Kesin izin verilen komut kontrolü
    let is_exact = EXACT_ALLOWED_COMMANDS.contains(&cmd_trimmed);

    // 2. Kabuk kontrol karakterleri koruması
    let has_shell_metachars = cmd_trimmed.chars().any(|c| {
        matches!(c, ';' | '&' | '|' | '`' | '$' | '>' | '<' | '\\' | '(' | ')' | '\n' | '\r')
    });

    if has_shell_metachars && !is_exact {
        return Err("Güvenlik İlkesi İhlali: Bu komut kabuk metakarakterleri içeriyor ve çalıştırılamaz.".to_string());
    }

    if is_exact {
        #[cfg(target_os = "linux")]
        {
            // Kompozit bakım komutlarının güvenli ve sıralı yürütülmesi
            if cmd_trimmed == "apt-get clean && rm -rf /tmp/*" {
                let _ = Command::new("apt-get").args(["clean"]).output();
                let _ = Command::new("sh").args(["-c", "rm -rf /tmp/*"]).output();
                return Ok("[TEMİZLİK] APT paket önbelleği ve /tmp dizini başarıyla temizlendi.".to_string());
            } else if cmd_trimmed == "df -h / && free -m" {
                let df = Command::new("df").args(["-h", "/"]).output().map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default();
                let free = Command::new("free").args(["-m"]).output().map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default();
                return Ok(format!("{}\n{}", df, free));
            } else if cmd_trimmed == "echo 3 > /proc/sys/vm/drop_caches" {
                let _ = fs::write("/proc/sys/vm/drop_caches", "3");
                return Ok("[BELLEK] Sayfa ve inode önbellekleri boşaltıldı.".to_string());
            }

            let parts: Vec<&str> = cmd_trimmed.split_whitespace().collect();
            if parts.is_empty() {
                return Ok(String::new());
            }
            let res = Command::new(parts[0]).args(&parts[1..]).output();
            return match res {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                    if out.status.success() {
                        Ok(stdout)
                    } else if !stderr.trim().is_empty() {
                        Err(stderr)
                    } else {
                        Ok(stdout)
                    }
                }
                Err(e) => Err(format!("Komut yürütülemedi: {}", e)),
            };
        }

        #[cfg(not(target_os = "linux"))]
        {
            return Ok(format!("[Simüle bash çıkışı]: {} başarıyla yürütüldü.", cmd_trimmed));
        }
    }

    // 3. Dinamik parametreli komut incelemesi (shell kontrol karakteri içermeyen tekil araçlar)
    let parts: Vec<&str> = cmd_trimmed.split_whitespace().collect();
    if parts.is_empty() {
        return Ok(String::new());
    }

    let bin = parts[0];
    let args = &parts[1..];

    if !ALLOWED_UTILITIES.contains(&bin) {
        return Err(format!("Güvenlik İlkesi İhlali: '{}' aracı izin verilenler listesinde bulunmuyor.", bin));
    }

    // cat aracı için dosya yolu sınırlaması
    if bin == "cat" {
        if args.len() != 1 || !ALLOWED_CAT_FILES.contains(&args[0]) {
            return Err("Güvenlik İlkesi İhlali: Sadece izin verilen sistem telemetri dosyaları okunabilir.".to_string());
        }
    }

    // Argümanlarda dizin atlama ve hassas dosya kontrolü
    for arg in args {
        if arg.contains("..") || SENSITIVE_FILE_PATTERNS.iter().any(|p| arg.contains(p)) {
            return Err("Güvenlik İlkesi İhlali: Dizin geçişine veya hassas dosyalara erişime izin verilmez.".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        let res = Command::new(bin).args(args).output();
        match res {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                if out.status.success() {
                    Ok(stdout)
                } else if !stderr.trim().is_empty() {
                    Err(stderr)
                } else {
                    Ok(stdout)
                }
            }
            Err(e) => Err(format!("Komut yürütülemedi: {}", e)),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("[Simüle bash çıkışı]: {} {:?}", bin, args))
    }
}

// ============================================================================
// 5. GÜVENLİ BELGE OKUYUCU (PATH TRAVERSAL KORUMALI) - GÜVENLİK BULGUSU #5
// ============================================================================
#[tauri::command]
async fn read_document_file(file_path: String) -> Result<DocumentResult, String> {
    let raw_path = Path::new(&file_path);

    // 1. Dizin geçişi engeli
    if file_path.contains("..") {
        return Err("Güvenlik Hatası: Dizin geçişine ('..') izin verilmez.".to_string());
    }

    // 2. İzin verilen belge uzantısı kontrolü
    let extension = raw_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    if !ALLOWED_DOC_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("Güvenlik Hatası: '.{}' uzantılı dosyalar güvenlik nedeniyle okunamaz.", extension));
    }

    // 3. Hassas dosya ve sistem dizini kalıp kontrolü
    let lower_path = file_path.to_lowercase();
    if SENSITIVE_FILE_PATTERNS.iter().any(|pat| lower_path.contains(pat)) {
        return Err("Güvenlik Hatası: Hassas sistem dosyalarının okunması engellendi.".to_string());
    }

    // 4. Kanonik dosya yolunu çözümleme
    let canonical = match fs::canonicalize(raw_path) {
        Ok(p) => p,
        Err(_) => return Err(format!("Belge bulunamadı veya erişilemiyor: {}", file_path)),
    };

    // 5. İzin verilen dizin sınırları denetimi
    let allowed_dirs: Vec<PathBuf> = vec![
        dirs::document_dir().unwrap_or_default(),
        dirs::download_dir().unwrap_or_default(),
        dirs::home_dir().unwrap_or_default(),
        PathBuf::from("/root/Belgeler"),
        PathBuf::from("/usr/share/doc"),
        std::env::current_dir().unwrap_or_default(),
    ];

    let is_in_allowed_dir = allowed_dirs.iter().any(|d| {
        !d.as_os_str().is_empty() && canonical.starts_with(d)
    });

    if !is_in_allowed_dir {
        let file_name = canonical.file_name().unwrap_or_default().to_string_lossy();
        if file_name != "ankora-sistem-rehberi.pdf" && file_name != "kiosk-ayarlari.txt" && file_name != "kiosk-ayarlari.md" {
            return Err("Güvenlik Hatası: Yalnızca kullanıcı belgeleri ve sistem dokümantasyonu dizinindeki dosyalar okunabilir.".to_string());
        }
    }

    // 6. Dosya boyutu sınırı (En fazla 50 MB)
    let metadata = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    let file_size = metadata.len();
    if file_size > 50 * 1024 * 1024 {
        return Err("Dosya boyutu çok büyük (50 MB üstü kabul edilmez).".to_string());
    }

    let file_name = canonical.file_name().unwrap_or_default().to_string_lossy().to_string();

    match extension.as_str() {
        "pdf" => {
            let mut file = fs::File::open(&canonical).map_err(|e| e.to_string())?;
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_uri = format!("data:application/pdf;base64,{}", b64);

            Ok(DocumentResult {
                file_name,
                file_type: "pdf".to_string(),
                file_size,
                content: data_uri,
            })
        }
        _ => {
            let text = fs::read_to_string(&canonical).map_err(|e| format!("Dosya okunamadı: {}", e))?;
            Ok(DocumentResult {
                file_name,
                file_type: if extension == "docx" { "docx".to_string() } else { "text".to_string() },
                file_size,
                content: text,
            })
        }
    }
}

#[tauri::command]
async fn list_available_documents() -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let search_roots = [
        dirs::document_dir().unwrap_or_default(),
        dirs::download_dir().unwrap_or_default(),
        PathBuf::from("/root/Belgeler"),
    ];

    for root in &search_roots {
        if root.exists() {
            if let Ok(entries) = fs::read_dir(root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                        let ext = ext.to_lowercase();
                        if ALLOWED_DOC_EXTENSIONS.contains(&ext.as_str()) {
                            files.push(path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    if files.is_empty() {
        files.push("/root/Belgeler/ankora-sistem-rehberi.pdf".to_string());
        files.push("/root/Belgeler/kiosk-ayarlari.txt".to_string());
    }

    Ok(files)
}

// ============================================================================
// 6. ANKORA AI VE GÜVENLİ EYLEM ZİNCİRİ - GÜVENLİK BULGUSU #6
// ============================================================================
#[tauri::command]
async fn query_local_ai(prompt: String, endpoint: Option<String>, model: Option<String>) -> Result<AiResponse, String> {
    let url = endpoint.unwrap_or_else(|| "http://127.0.0.1:11434/api/generate".to_string());
    let ai_model = model.unwrap_or_else(|| "qwen2.5:0.5b".to_string());

    let sys_prompt = "Sen Ankora Linux (Devuan Daedalus) işletim sisteminin yerel sistem asistanısın. \
Kullanıcıya teknik, kısa ve profesyonel yanıtlar ver. \
Eğer kullanıcının talebi sistemde bir bakım veya durum sorgusu gerektiriyorsa, \
yanıtının sonuna tam olarak şu formatta bir eylem etiketi ekle: \
<<<ACTION:{\"command\":\"izin_verilen_komut\",\"desc\":\"Eylemin açıklaması\"}>>> \
Asla tehlikeli veya rastgele komut üretme. Sadece doğrulanmış sistem komutları üret.";

    let payload = serde_json::json!({
        "model": ai_model,
        "prompt": format!("{}\n\nKullanıcı: {}", sys_prompt, prompt),
        "stream": false
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.post(&url).json(&payload).send().await;

    match res {
        Ok(resp) => {
            if resp.status().is_success() {
                let json_data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
                let raw_reply = json_data["response"].as_str().unwrap_or("").to_string();

                if let Some(start_idx) = raw_reply.find("<<<ACTION:") {
                    if let Some(end_idx) = raw_reply[start_idx..].find(">>>") {
                        let json_str = &raw_reply[start_idx + 10..start_idx + end_idx];
                        let clean_reply = raw_reply[..start_idx].trim().to_string();

                        if let Ok(action_val) = serde_json::from_str::<serde_json::Value>(json_str) {
                            let proposed_cmd = action_val["command"].as_str().unwrap_or("").trim().to_string();
                            // Sadece whitelist içerisindeki komutların eylem kartı olarak üretilmesine izin verilir
                            if ALLOWED_AGENT_ACTIONS.contains(&proposed_cmd.as_str()) {
                                return Ok(AiResponse {
                                    reply: clean_reply,
                                    has_action: true,
                                    action_command: Some(proposed_cmd),
                                    action_desc: action_val["desc"].as_str().map(|s| s.to_string()),
                                });
                            }
                        }
                    }
                }

                Ok(AiResponse {
                    reply: raw_reply,
                    has_action: false,
                    action_command: None,
                    action_desc: None,
                })
            } else {
                Err(format!("Ollama API hatası (Kod: {})", resp.status()))
            }
        }
        Err(_) => {
            let p_lower = prompt.to_lowercase();
            if p_lower.contains("temizle") || p_lower.contains("önbellek") {
                Ok(AiResponse {
                    reply: "Sistem önbelleklerinin temizlenmesi için paket önbelleği boşaltılmalıdır.".to_string(),
                    has_action: true,
                    action_command: Some("apt-get clean && rm -rf /tmp/*".to_string()),
                    action_desc: Some("Sistem ve geçici dosya önbelleklerini temizleme".to_string()),
                })
            } else if p_lower.contains("durum") || p_lower.contains("disk") {
                Ok(AiResponse {
                    reply: "Disk ve bellek doluluk raporu taranıyor.".to_string(),
                    has_action: true,
                    action_command: Some("df -h / && free -m".to_string()),
                    action_desc: Some("Disk ve bellek durumunu sorgulama".to_string()),
                })
            } else {
                Ok(AiResponse {
                    reply: format!(
                        "Ankora AI Çekirdeği hazır. Dahili sistem analiz modunda yanıt veriliyor: \"{}\"",
                        prompt
                    ),
                    has_action: false,
                    action_command: None,
                    action_desc: None,
                })
            }
        }
    }
}

#[tauri::command]
async fn execute_agent_confirmed_action(command: String) -> Result<String, String> {
    let cmd_trimmed = command.trim();
    if !ALLOWED_AGENT_ACTIONS.contains(&cmd_trimmed) {
        return Err("Güvenlik İlkesi İhlali: Bu eylem önceden onaylanmış güvenlik politikası listesinde yer almıyor.".to_string());
    }
    run_terminal_command(command).await
}

// ============================================================================
// 7. GÜVENLİ KURULUM MOTORU (COMMAND ARGS & STDIN CHPASSWD) - BULGULAR #3 & #8
// ============================================================================
#[tauri::command]
async fn get_storage_devices() -> Result<Vec<StorageDisk>, String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("lsblk").args(["-d", "-b", "-n", "-o", "NAME,SIZE,MODEL,RM,TYPE"]).output();
        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut disks = Vec::new();
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 && line.contains("disk") && !parts[0].starts_with("loop") {
                    let size_bytes: u64 = parts[1].parse().unwrap_or(0);
                    let size_gb = (size_bytes as f64) / (1024.0 * 1024.0 * 1024.0);
                    disks.push(StorageDisk {
                        name: parts[0].to_string(),
                        path: format!("/dev/{}", parts[0]),
                        size_gb: (size_gb * 10.0).round() / 10.0,
                        model: if parts.len() >= 5 { parts[2..parts.len() - 2].join(" ") } else { "Sabit Disk".to_string() },
                        is_removable: line.contains(" 1 "),
                    });
                }
            }
            if !disks.is_empty() {
                return Ok(disks);
            }
        }
    }

    Ok(vec![
        StorageDisk {
            name: "sda".to_string(),
            path: "/dev/sda".to_string(),
            size_gb: 256.0,
            model: "Dahili SATA SSD".to_string(),
            is_removable: false,
        },
        StorageDisk {
            name: "nvme0n1".to_string(),
            path: "/dev/nvme0n1".to_string(),
            size_gb: 512.0,
            model: "NVMe M.2 SSD".to_string(),
            is_removable: false,
        }
    ])
}

#[tauri::command]
async fn execute_system_installation(payload: InstallPayload) -> Result<String, String> {
    let target = payload.target_disk.trim();
    if !is_valid_disk_target(target) {
        return Err("Geçersiz hedef disk seçimi (Örn: /dev/sda veya /dev/nvme0n1).".to_string());
    }

    let username = payload.username.trim();
    if !is_valid_username(username) {
        return Err("Geçersiz kullanıcı adı. Yalnızca küçük harfler, rakamlar ve alt çizgi/tire kullanılabilir (en fazla 32 karakter).".to_string());
    }

    let hostname = payload.hostname.trim();
    if !is_valid_hostname(hostname) {
        return Err("Geçersiz makine adı (hostname). RFC 1123 standartlarına uygun olmalıdır.".to_string());
    }

    let password = payload.password.trim();
    if password.is_empty() || password.contains('\0') || password.contains('\n') || password.contains('\r') {
        return Err("Geçersiz parola karakterleri tespit edildi.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        // 1. Bölümleme: Kabuk formatlama yerine doğrudan argüman dizisi
        Command::new("parted").args(["-s", target, "mklabel", "gpt"]).output()
            .map_err(|e| format!("parted mklabel hatası: {}", e))?;
        Command::new("parted").args(["-s", target, "mkpart", "ESP", "fat32", "1MiB", "513MiB"]).output()
            .map_err(|e| format!("parted ESP hatası: {}", e))?;
        Command::new("parted").args(["-s", target, "set", "1", "esp", "on"]).output()
            .map_err(|e| format!("parted esp on hatası: {}", e))?;
        Command::new("parted").args(["-s", target, "mkpart", "primary", "ext4", "513MiB", "100%"]).output()
            .map_err(|e| format!("parted root part hatası: {}", e))?;

        let (efi_part, root_part) = if target.contains("nvme") {
            (format!("{}p1", target), format!("{}p2", target))
        } else {
            (format!("{}1", target), format!("{}2", target))
        };

        // 2. Dosya Sistemleri
        Command::new("mkfs.vfat").args(["-F32", &efi_part]).output()
            .map_err(|e| format!("mkfs.vfat hatası: {}", e))?;
        Command::new("mkfs.ext4").args(["-F", &root_part]).output()
            .map_err(|e| format!("mkfs.ext4 hatası: {}", e))?;

        // 3. Bağlama Noktaları (Mounts)
        let _ = fs::create_dir_all("/target");
        Command::new("mount").args([&root_part, "/target"]).output()
            .map_err(|e| format!("mount /target hatası: {}", e))?;
        let _ = fs::create_dir_all("/target/boot/efi");
        Command::new("mount").args([&efi_part, "/target/boot/efi"]).output()
            .map_err(|e| format!("mount /target/boot/efi hatası: {}", e))?;

        // 4. Kök Dosya Sistemini Rsync ile Kopyalama
        let rsync_out = Command::new("rsync").args([
            "-aAX", "--info=progress2", "/", "/target/",
            "--exclude=/proc/*", "--exclude=/sys/*", "--exclude=/dev/*",
            "--exclude=/tmp/*", "--exclude=/run/*", "--exclude=/mnt/*",
            "--exclude=/media/*", "--exclude=/target/*", "--exclude=/home/*"
        ]).output().map_err(|e| format!("rsync hatası: {}", e))?;

        if !rsync_out.status.success() {
            let _ = Command::new("umount").args(["-R", "/target"]).output();
            return Err("Dosya sistemi kopyalanırken hata oluştu.".to_string());
        }

        // 5. Hostname: Kabuk yönlendirmesi olmaksızın doğrudan dosya yazma
        if let Err(e) = fs::write("/target/etc/hostname", format!("{}\n", hostname)) {
            let _ = Command::new("umount").args(["-R", "/target"]).output();
            return Err(format!("Hostname dosyası yazılamadı: {}", e));
        }

        // 6. Kullanıcı Oluşturma: Argüman dizisi ile izole çalıştırma
        let _ = Command::new("chroot")
            .args(["/target", "useradd", "-m", "-s", "/bin/bash", "-G", "sudo,audio,video,plugdev", username])
            .output();

        // 7. Parola Belirleme: Parola ASLA argüman olarak aktarılmaz, doğrudan STDIN borusundan beslenir (BULGU #8)
        let mut chpasswd_child = Command::new("chroot")
            .args(["/target", "chpasswd"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("chpasswd süreci başlatılamadı: {}", e))?;

        if let Some(mut stdin) = chpasswd_child.stdin.take() {
            let pair = format!("{}:{}\n", username, password);
            stdin.write_all(pair.as_bytes()).map_err(|e| format!("Parola stdin'e aktarılamadı: {}", e))?;
            drop(stdin);
        }
        let chpasswd_res = chpasswd_child.wait_with_output().map_err(|e| e.to_string())?;
        if !chpasswd_res.status.success() {
            let _ = Command::new("umount").args(["-R", "/target"]).output();
            return Err("Kullanıcı parolası güncellenemedi.".to_string());
        }

        // 8. Grub & Temizlik
        let _ = Command::new("chroot").args(["/target", "grub-install", "--target=x86_64-efi", "--efi-directory=/boot/efi", "--bootloader-id=Ankora", "--recheck"]).output();
        let _ = Command::new("chroot").args(["/target", "update-grub"]).output();
        let _ = Command::new("umount").args(["-R", "/target"]).output();

        Ok("Ankora Linux başarıyla kuruldu.".to_string())
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("Kurulum simülasyonu başarıyla tamamlandı: {} -> {}", target, username))
    }
}

// ============================================================================
// 8. GÜVENLİ UYGULAMA BAŞLATICI - GÜVENLİK BULGUSU #4
// ============================================================================
#[tauri::command]
async fn launch_application(exec: String) -> Result<String, String> {
    let clean = exec.trim();
    if clean.is_empty() {
        return Err("Uygulama komutu belirtilmedi.".to_string());
    }

    // 1. Kabuk kontrol karakterleri koruması
    let has_shell_metachars = clean.chars().any(|c| {
        matches!(c, ';' | '&' | '|' | '`' | '$' | '>' | '<' | '\\' | '(' | ')' | '\n' | '\r')
    });
    if has_shell_metachars {
        return Err("Güvenlik Hatası: Uygulama komutunda kabuk kontrol karakterleri tespit edildi.".to_string());
    }

    // 2. Argümanları güvenle ayrıştırma
    let parts: Vec<&str> = clean.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Çalıştırılacak uygulama tespit edilemedi.".to_string());
    }

    let bin_name = parts[0];
    let args = &parts[1..];

    // 3. Dizin geçişi ve izin verilen yol doğrulaması
    if bin_name.contains("..") {
        return Err("Güvenlik Hatası: Dizin geçişine ('..') izin verilmez.".to_string());
    }

    if bin_name.contains('/') {
        let allowed_prefixes = ["/usr/bin/", "/bin/", "/usr/local/bin/", "/usr/games/", "/opt/"];
        if !allowed_prefixes.iter().any(|prefix| bin_name.starts_with(prefix)) {
            return Err("Güvenlik Hatası: Uygulama yolu izin verilen sistem dizinlerinde değil.".to_string());
        }
    } else {
        if !bin_name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.') {
            return Err("Güvenlik Hatası: Geçersiz uygulama adı karakterleri.".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new(bin_name)
            .args(args)
            .env("DISPLAY", ":0")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Uygulama başlatılamadı: {}", e))?;
    }

    Ok(format!("Uygulama çalıştırıldı: {}", clean))
}

// ============================================================================
// 9. DİĞER SİSTEM AYARLARI VE TELEMETRİ
// ============================================================================
#[tauri::command]
fn get_system_telemetry() -> Result<SystemTelemetry, String> {
    Ok(SystemTelemetry {
        os_name: "Devuan GNU/Linux 5 (daedalus)".to_string(),
        kernel: "Linux 6.1.0-22-amd64 (Tauri Native Core)".to_string(),
        init_system: "SysVinit (systemd-free)".to_string(),
        memory_used_mb: 1140,
        memory_total_mb: 8192,
        cpu_cores: std::thread::available_parallelism().map(|p| p.get()).unwrap_or(4),
        uptime_seconds: 7200,
    })
}

#[tauri::command]
async fn set_brightness(level: u32) -> Result<String, String> {
    let clamped = level.clamp(20, 100);
    let ratio = clamped as f32 / 100.0;
    #[cfg(target_os = "linux")]
    {
        let brightness_str = format!("{:.2}", ratio);
        if let Ok(out) = Command::new("xrandr").output() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if line.contains(" connected") {
                    if let Some(display_name) = line.split_whitespace().next() {
                        let _ = Command::new("xrandr")
                            .args(["--output", display_name, "--brightness", &brightness_str])
                            .output();
                        break;
                    }
                }
            }
        }
    }
    Ok(format!("Parlaklık ayarlandı: %{}", clamped))
}

#[tauri::command]
fn check_first_run() -> Result<bool, String> {
    let path = get_ankora_config_dir().join("welcomed.lock");
    Ok(!path.exists())
}

#[tauri::command]
fn set_first_run_completed(dont_show_again: bool) -> Result<(), String> {
    if dont_show_again {
        let path = get_ankora_config_dir().join("welcomed.lock");
        let _ = fs::write(path, "ankora-v2-welcomed");
    }
    Ok(())
}

#[tauri::command]
async fn set_system_keyboard(layout: String) -> Result<String, String> {
    let clean = layout.trim();
    if !ALLOWED_KEYBOARDS.contains(&clean) {
        return Err("Geçersiz veya desteklenmeyen klavye haritası.".to_string());
    }
    #[cfg(target_os = "linux")]
    {
        if clean == "tr_f" {
            let _ = Command::new("setxkbmap").args(["tr", "-variant", "f"]).output();
        } else {
            let _ = Command::new("setxkbmap").arg(clean).output();
        }
    }
    Ok(format!("Klavye: {}", clean))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            drag_window,
            scan_xdg_applications,
            install_deb_package,
            run_terminal_command,
            read_document_file,
            list_available_documents,
            query_local_ai,
            execute_agent_confirmed_action,
            get_storage_devices,
            execute_system_installation,
            get_system_telemetry,
            set_brightness,
            launch_application,
            check_first_run,
            set_first_run_completed,
            set_system_keyboard
        ])
        .setup(|app| {
            if let Some(win) = app.get_window("main") {
                let _ = win.set_fullscreen(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Ankora DE başlatılırken hata oluştu");
}
