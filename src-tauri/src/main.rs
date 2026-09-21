#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

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

fn get_ankora_config_dir() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("/root/.config"));
    path.push("ankora");
    let _ = fs::create_dir_all(&path);
    path
}

#[tauri::command]
async fn install_deb_package(package_name: String) -> Result<String, String> {
    let clean_pkg = package_name.trim();
    if clean_pkg.is_empty() {
        return Err("Geçersiz paket adı.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        let output = if clean_pkg.ends_with(".deb") {
            Command::new("dpkg")
                .args(["-i", clean_pkg])
                .output()
        } else {
            Command::new("apt-get")
                .args(["install", "-y", clean_pkg])
                .output()
        };

        match output {
            Ok(res) => {
                let stdout = String::from_utf8_lossy(&res.stdout).to_string();
                let stderr = String::from_utf8_lossy(&res.stderr).to_string();
                if res.status.success() {
                    Ok(if stdout.trim().is_empty() {
                        format!("Paket başarıyla kuruldu: {}", clean_pkg)
                    } else {
                        stdout
                    })
                } else {
                    Err(if stderr.trim().is_empty() {
                        format!("Paket kurulamadı (Çıkış kodu: {:?})", res.status.code())
                    } else {
                        stderr
                    })
                }
            }
            Err(err) => Err(format!("Paket yöneticisi yürütülemedi: {}", err)),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("[Simülasyon] Paket kuruldu: {}", clean_pkg))
    }
}

#[tauri::command]
async fn run_terminal_command(command: String) -> Result<String, String> {
    let cmd_trimmed = command.trim();
    if cmd_trimmed.is_empty() {
        return Ok(String::new());
    }

    #[cfg(target_os = "windows")]
    let res = Command::new("cmd").args(["/C", cmd_trimmed]).output();

    #[cfg(not(target_os = "windows"))]
    let res = Command::new("bash").args(["-c", cmd_trimmed]).output();

    match res {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            if output.status.success() {
                Ok(stdout)
            } else if !stderr.trim().is_empty() {
                Err(stderr)
            } else {
                Ok(stdout)
            }
        }
        Err(err) => Err(format!("Kabuk başlatılamadı: {}", err)),
    }
}

#[tauri::command]
fn drag_window(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_system_telemetry() -> Result<SystemTelemetry, String> {
    #[cfg(target_os = "linux")]
    {
        let mem_info = fs::read_to_string("/proc/meminfo").unwrap_or_default();
        let mut total_kb: u64 = 8192000;
        let mut avail_kb: u64 = 4096000;

        for line in mem_info.lines() {
            if line.starts_with("MemTotal:") {
                if let Some(val) = line.split_whitespace().nth(1) {
                    total_kb = val.parse().unwrap_or(8192000);
                }
            } else if line.starts_with("MemAvailable:") {
                if let Some(val) = line.split_whitespace().nth(1) {
                    avail_kb = val.parse().unwrap_or(4096000);
                }
            }
        }

        let uptime_str = fs::read_to_string("/proc/uptime").unwrap_or_default();
        let uptime_sec = uptime_str
            .split_whitespace()
            .next()
            .and_then(|s| s.parse::<f64>().ok())
            .map(|f| f as u64)
            .unwrap_or(0);

        let os_release = fs::read_to_string("/etc/os-release").unwrap_or_default();
        let mut os_name = "Devuan GNU/Linux 5 (daedalus)".to_string();
        for line in os_release.lines() {
            if line.starts_with("PRETTY_NAME=") {
                os_name = line.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string();
            }
        }

        let kernel_ver = fs::read_to_string("/proc/version")
            .map(|s| s.split_whitespace().take(3).collect::<Vec<&str>>().join(" "))
            .unwrap_or_else(|_| "Linux 6.1 LTS".to_string());

        let cpu_count = std::thread::available_parallelism()
            .map(|p| p.get())
            .unwrap_or(4);

        Ok(SystemTelemetry {
            os_name,
            kernel: kernel_ver,
            init_system: "SysVinit".to_string(),
            memory_used_mb: (total_kb.saturating_sub(avail_kb)) / 1024,
            memory_total_mb: total_kb / 1024,
            cpu_cores: cpu_count,
            uptime_seconds: uptime_sec,
        })
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(SystemTelemetry {
            os_name: "Ankora Linux DE (Devuan Hedefli)".to_string(),
            kernel: "Tauri Rust Engine (WebKitGTK-ready)".to_string(),
            init_system: "SysVinit (systemd-free)".to_string(),
            memory_used_mb: 1180,
            memory_total_mb: 8192,
            cpu_cores: std::thread::available_parallelism().map(|p| p.get()).unwrap_or(4),
            uptime_seconds: 4320,
        })
    }
}

#[tauri::command]
async fn set_brightness(level: u32) -> Result<String, String> {
    let clamped = level.clamp(20, 100);
    let ratio = clamped as f32 / 100.0;

    #[cfg(target_os = "linux")]
    {
        let cmd = format!(
            "xrandr --output $(xrandr | grep ' connected' | awk '{{print $1}}' | head -n1) --brightness {:.2}",
            ratio
        );
        let _ = Command::new("sh").args(["-c", &cmd]).output();
    }

    Ok(format!("Parlaklık ayarlandı: %{}", clamped))
}

#[tauri::command]
async fn launch_application(exec: String) -> Result<String, String> {
    let app_exec = exec.trim();
    if app_exec.is_empty() {
        return Err("Geçersiz uygulama adı.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        let spawn_res = Command::new("sh")
            .args(["-c", &format!("DISPLAY=:0 {} >/dev/null 2>&1 &", app_exec)])
            .spawn();

        match spawn_res {
            Ok(_) => Ok(format!("Uygulama başlatıldı: {}", app_exec)),
            Err(e) => Err(format!("Uygulama başlatılamadı: {}", e)),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("Uygulama başlatıldı: {}", app_exec))
    }
}

// ============================================================================
// ANKORA KURULUM VE DİSK YÖNETİMİ (REAL INSTALLER ENGINE)
// ============================================================================

#[tauri::command]
async fn get_storage_devices() -> Result<Vec<StorageDisk>, String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("lsblk")
            .args(["-d", "-b", "-n", "-o", "NAME,SIZE,MODEL,RM,TYPE"])
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let mut disks = Vec::new();

                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 3 {
                        let name = parts[0];
                        let size_bytes: u64 = parts[1].parse().unwrap_or(0);
                        let is_disk = line.contains("disk");

                        if is_disk && !name.starts_with("loop") && !name.starts_with("zram") {
                            let size_gb = (size_bytes as f64) / (1024.0 * 1024.0 * 1024.0);
                            disks.push(StorageDisk {
                                name: name.to_string(),
                                path: format!("/dev/{}", name),
                                size_gb: (size_gb * 10.0).round() / 10.0,
                                model: if parts.len() >= 5 { parts[2..parts.len() - 2].join(" ") } else { "Dahili Sürücü".to_string() },
                                is_removable: line.contains(" 1 "),
                            });
                        }
                    }
                }

                if disks.is_empty() {
                    disks.push(StorageDisk {
                        name: "sda".to_string(),
                        path: "/dev/sda".to_string(),
                        size_gb: 256.0,
                        model: "Standart Sabit Disk".to_string(),
                        is_removable: false,
                    });
                }

                Ok(disks)
            }
            Err(_) => Ok(vec![
                StorageDisk {
                    name: "sda".to_string(),
                    path: "/dev/sda".to_string(),
                    size_gb: 256.0,
                    model: "SATA SSD".to_string(),
                    is_removable: false,
                },
                StorageDisk {
                    name: "nvme0n1".to_string(),
                    path: "/dev/nvme0n1".to_string(),
                    size_gb: 512.0,
                    model: "NVMe M.2 SSD".to_string(),
                    is_removable: false,
                }
            ]),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
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
                model: "Samsung NVMe SSD".to_string(),
                is_removable: false,
            }
        ])
    }
}

#[tauri::command]
async fn execute_system_installation(payload: InstallPayload) -> Result<String, String> {
    let target = payload.target_disk.trim();
    if target.is_empty() || !target.starts_with("/dev/") {
        return Err("Geçerli bir hedef disk seçilmedi.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        // Gerçek Devuan Linux Hedef Disk Format & Rsync Scripti
        let script = format!(
            r#"
            set -e
            echo "[1/6] Disk bölümlendiriliyor: {disk}"
            parted -s {disk} mklabel gpt
            parted -s {disk} mkpart ESP fat32 1MiB 513MiB
            parted -s {disk} set 1 esp on
            parted -s {disk} mkpart primary ext4 513MiB 100%

            EFI_PART="{disk}1"
            ROOT_PART="{disk}2"
            if [[ "{disk}" =~ "nvme" ]]; then
                EFI_PART="{disk}p1"
                ROOT_PART="{disk}p2"
            fi

            echo "[2/6] Dosya sistemleri biçimlendiriliyor..."
            mkfs.vfat -F32 "$EFI_PART"
            mkfs.ext4 -F "$ROOT_PART"

            echo "[3/6] Hedef dizin bağlanıyor..."
            mkdir -p /target
            mount "$ROOT_PART" /target
            mkdir -p /target/boot/efi
            mount "$EFI_PART" /target/boot/efi

            echo "[4/6] Canlı sistem rsync ile kopyalanıyor..."
            rsync -aAX --info=progress2 / /target/ \
                --exclude=/proc/* --exclude=/sys/* --exclude=/dev/* \
                --exclude=/tmp/* --exclude=/run/* --exclude=/mnt/* \
                --exclude=/media/* --exclude=/target/* --exclude=/home/*

            echo "[5/6] Kullanıcı ve ana makine yapılandırılıyor..."
            echo "{hostname}" > /target/etc/hostname
            chroot /target useradd -m -s /bin/bash -G sudo,audio,video,plugdev "{username}" || true
            echo "{username}:{password}" | chroot /target chpasswd

            echo "[6/6] GRUB EFI önyükleyici kuruluyor..."
            chroot /target grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=Ankora --recheck
            chroot /target update-grub

            umount -R /target
            echo "Ankora Linux kurulumu başarıyla tamamlandı!"
            "#,
            disk = target,
            hostname = payload.hostname,
            username = payload.username,
            password = payload.password
        );

        let out = Command::new("bash").args(["-c", &script]).output();
        match out {
            Ok(res) => {
                if res.status.success() {
                    Ok("Ankora Linux hedef diske başarıyla kuruldu. Sistemi yeniden başlatabilirsiniz.".to_string())
                } else {
                    let err = String::from_utf8_lossy(&res.stderr);
                    Err(format!("Kurulum hatası: {}", err))
                }
            }
            Err(e) => Err(format!("Kurulum komutu çalıştırılamadı: {}", e)),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!(
            "[Simülasyon] Ankora Linux başarıyla kuruldu: {} -> {} ({})",
            payload.target_disk, payload.username, payload.hostname
        ))
    }
}

// ============================================================================
// ANKORA KARŞILAYICI & İLK AÇILIŞ SİSTEMİ (FIRST-RUN ONBOARDING)
// ============================================================================

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
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("setxkbmap").arg(clean).output();
        let cfg = format!("XKBLAYOUT=\"{}\"\nXKBVARIANT=\"\"\nXKBOPTIONS=\"\"\n", clean);
        let _ = fs::write("/etc/default/keyboard", cfg);
    }
    Ok(format!("Klavye düzeni uygulandı: {}", clean))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            install_deb_package,
            run_terminal_command,
            drag_window,
            get_system_telemetry,
            set_brightness,
            launch_application,
            get_storage_devices,
            execute_system_installation,
            check_first_run,
            set_first_run_completed,
            set_system_keyboard
        ])
        .setup(|app| {
            let main_window = app.get_window("main");
            if let Some(win) = main_window {
                let _ = win.set_fullscreen(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Ankora DE başlatılırken hata oluştu");
}
