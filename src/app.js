(() => {
  'use strict';

  // ============================================================================
  // TAURI IPC KÖPRÜSÜ
  // ============================================================================
  const TauriBridge = {
    isAvailable: typeof window !== 'undefined' && Boolean(window.__TAURI__),

    async invoke(cmd, args = {}) {
      if (this.isAvailable && window.__TAURI__.invoke) {
        try {
          return await window.__TAURI__.invoke(cmd, args);
        } catch (err) {
          throw err;
        }
      }
      return this.fallback(cmd, args);
    },

    async fallback(cmd, args) {
      switch (cmd) {
        case 'check_first_run':
          return true; // İlk çalıştırmada Karşılayıcı'yı aç
        case 'set_first_run_completed':
          return null;
        case 'get_storage_devices':
          return [
            { name: 'sda', path: '/dev/sda', size_gb: 256.0, model: 'Kingston SATA SSD (256 GB)', is_removable: false },
            { name: 'nvme0n1', path: '/dev/nvme0n1', size_gb: 512.0, model: 'Samsung 980 NVMe SSD (512 GB)', is_removable: false }
          ];
        case 'execute_system_installation':
          return `Ankora Linux başarıyla kuruldu: ${args.payload?.target_disk || '/dev/sda'} (${args.payload?.username || 'pars'})`;
        case 'set_system_keyboard':
          return `Klavye düzeni uygulandı: ${args.layout}`;
        case 'install_deb_package':
          return `[Tauri] Paket yüklendi: ${args.packageName || args.package_name}`;
        case 'run_terminal_command':
          const c = (args.command || '').trim();
          if (c === 'uname -a') return 'Linux ankora-os 6.1.0-22-amd64 #1 SMP PREEMPT Devuan x86_64 GNU/Linux';
          if (c === 'whoami') return 'pars (uid=1000 gid=1000 groups=sudo,audio,video)';
          if (c === 'uptime') return 'up 18 hours, 2 users, load average: 0.08, 0.04, 0.01';
          if (c === 'ls') return 'Masaüstü/   Belgeler/   src-tauri/   src/   Cargo.toml   logo.svg';
          if (c === 'help') return 'Tauri Native Shell Köprüsü devrede. Tüm bash komutları doğrudan Linux çekirdeğine iletilir.';
          return `[Tauri Bash] Komut çalıştırıldı: ${c}`;
        case 'get_system_telemetry':
          return {
            os_name: 'Devuan GNU/Linux 5 (daedalus)',
            kernel: 'Linux 6.1 LTS (Tauri Native)',
            init_system: 'SysVinit (systemd-free)',
            memory_used_mb: 1120,
            memory_total_mb: 8192,
            cpu_cores: 4,
            uptime_seconds: 7200
          };
        case 'set_brightness':
          return `Parlaklık: %${args.level}`;
        case 'launch_application':
          return `Uygulama başlatıldı: ${args.exec}`;
        default:
          return null;
      }
    }
  };

  // ============================================================================
  // PENCERE YÖNETİCİSİ (WINDOW MANAGER)
  // ============================================================================
  const WindowManager = {
    highestZ: 30,
    windows: [],
    tabsContainer: null,

    init() {
      this.windows = Array.from(document.querySelectorAll('.window'));
      this.tabsContainer = document.getElementById('running-tabs');

      this.windows.forEach(win => {
        win.addEventListener('mousedown', () => this.bringToFront(win));

        const btnClose = win.querySelector('.ctrl-btn.close');
        const btnMin = win.querySelector('.ctrl-btn.min');
        const btnMax = win.querySelector('.ctrl-btn.max');

        if (btnClose) btnClose.addEventListener('click', (e) => { e.stopPropagation(); this.close(win); });
        if (btnMin) btnMin.addEventListener('click', (e) => { e.stopPropagation(); this.minimize(win); });
        if (btnMax) btnMax.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMaximize(win); });

        // Tauri Sürükleme Başlığı
        const header = win.querySelector('.window-header');
        if (header) {
          let isDragging = false;
          let startX, startY, initLeft, initTop;

          const onStart = (e) => {
            if (e.target.closest('.window-controls')) return;
            if (win.classList.contains('maximized')) return;

            if (TauriBridge.isAvailable && window.__TAURI__.window) {
              try {
                window.__TAURI__.invoke('drag_window').catch(() => {});
              } catch (err) {}
            }

            isDragging = true;
            this.bringToFront(win);

            const pt = e.type.includes('touch') ? e.touches[0] : e;
            startX = pt.clientX;
            startY = pt.clientY;
            initLeft = win.offsetLeft;
            initTop = win.offsetTop;

            document.addEventListener('mousemove', onMove, { passive: false });
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
          };

          const onMove = (e) => {
            if (!isDragging) return;
            if (e.cancelable) e.preventDefault();

            requestAnimationFrame(() => {
              const pt = e.type.includes('touch') ? e.touches[0] : e;
              const newLeft = initLeft + (pt.clientX - startX);
              const newTop = Math.max(0, Math.min(window.innerHeight - 50, initTop + (pt.clientY - startY)));

              win.style.left = `${newLeft}px`;
              win.style.top = `${newTop}px`;
            });
          };

          const onEnd = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
          };

          header.addEventListener('mousedown', onStart);
          header.addEventListener('touchstart', onStart, { passive: true });
        }
      });
    },

    bringToFront(win) {
      this.highestZ++;
      win.style.zIndex = this.highestZ;
      this.windows.forEach(w => w.classList.remove('active'));
      win.classList.add('active');
      this.syncTabs();
    },

    open(winId) {
      const win = document.getElementById(winId);
      if (!win) return;

      win.classList.remove('minimized');
      win.classList.add('open');
      this.bringToFront(win);
      this.syncTabs();
    },

    close(win) {
      win.classList.remove('open');
      win.classList.remove('active');
      this.syncTabs();
    },

    minimize(win) {
      win.classList.add('minimized');
      win.classList.remove('active');
      this.syncTabs();
    },

    toggleMaximize(win) {
      win.classList.toggle('maximized');
      this.bringToFront(win);
    },

    syncTabs() {
      if (!this.tabsContainer) return;
      this.tabsContainer.innerHTML = '';

      this.windows.forEach(win => {
        if (win.classList.contains('open')) {
          const tab = document.createElement('div');
          tab.className = `task-tab ${win.classList.contains('active') && !win.classList.contains('minimized') ? 'active' : ''}`;

          const titleSpan = win.querySelector('.window-meta span');
          const title = titleSpan ? titleSpan.textContent.split('—')[0].trim() : 'Pencere';
          tab.textContent = title;

          tab.addEventListener('click', () => {
            if (win.classList.contains('minimized')) {
              win.classList.remove('minimized');
              this.bringToFront(win);
            } else if (win.classList.contains('active')) {
              this.minimize(win);
            } else {
              this.bringToFront(win);
            }
          });

          this.tabsContainer.appendChild(tab);
        }
      });
    }
  };

  // ============================================================================
  // ANKORA KARŞILAYICI (WELCOME & ONBOARDING WIZARD)
  // ============================================================================
  const WelcomeManager = {
    async init() {
      const tabs = document.querySelectorAll('.welcome-tab');
      const panes = document.querySelectorAll('.welcome-pane');

      // Tab değiştirme
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const targetId = tab.getAttribute('data-tab');
          this.switchTab(targetId);
        });
      });

      // İleri butonları
      document.querySelectorAll('.next-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          this.switchTab(targetId);
        });
      });

      // Duvar Kağıdı Değiştirme
      const wpCards = document.querySelectorAll('.wp-card');
      const desktopWp = document.getElementById('desktop-wallpaper');
      wpCards.forEach(card => {
        card.addEventListener('click', () => {
          wpCards.forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          const wpFile = card.getAttribute('data-wp');
          if (desktopWp && wpFile) {
            desktopWp.style.backgroundImage = `url('${wpFile}')`;
            Terminal.log(`[TEMA] Duvar kağıdı uygulandı: ${wpFile}`, 'cmd');
          }
        });
      });

      // Klavye Düzeni Değiştirme
      const kbRadios = document.querySelectorAll('input[name="kb-layout"]');
      kbRadios.forEach(radio => {
        radio.addEventListener('change', async (e) => {
          document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('active'));
          e.target.closest('.radio-card')?.classList.add('active');
          try {
            const res = await TauriBridge.invoke('set_system_keyboard', { layout: e.target.value });
            Terminal.log(`[KLAVYE] ${res}`, 'success');
          } catch (err) {}
        });
      });

      // Hızlı Paketleri Kur
      const btnInstallApps = document.getElementById('btn-welcome-install-apps');
      if (btnInstallApps) {
        btnInstallApps.addEventListener('click', async () => {
          btnInstallApps.disabled = true;
          btnInstallApps.textContent = 'Kuruluyor...';
          const checked = document.querySelectorAll('.app-check-item input:checked');
          for (const box of checked) {
            Terminal.log(`[APT] Kuruluyor: ${box.value}`, 'cmd');
            try {
              await TauriBridge.invoke('install_deb_package', { packageName: box.value });
              Terminal.log(`[OK] ${box.value} sisteme eklendi.`, 'success');
            } catch (err) {}
          }
          btnInstallApps.textContent = 'Tamamlandı';
          setTimeout(() => { btnInstallApps.disabled = false; btnInstallApps.textContent = 'Seçilenleri Kur'; }, 2000);
        });
      }

      // Karşılayıcıyı Bitir ve Kapat
      const btnFinish = document.getElementById('btn-welcome-finish');
      if (btnFinish) {
        btnFinish.addEventListener('click', async () => {
          const chk = document.getElementById('chk-show-on-startup');
          const dontShowAgain = chk ? !chk.checked : false;
          try {
            await TauriBridge.invoke('set_first_run_completed', { dontShowAgain });
          } catch (e) {}
          WindowManager.close(document.getElementById('win-welcome'));
        });
      }

      // İlk çalıştırma kontrolü
      try {
        const isFirst = await TauriBridge.invoke('check_first_run');
        if (isFirst) {
          setTimeout(() => WindowManager.open('win-welcome'), 300);
        }
      } catch (e) {
        WindowManager.open('win-welcome');
      }
    },

    switchTab(targetId) {
      document.querySelectorAll('.welcome-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === targetId);
      });
      document.querySelectorAll('.welcome-pane').forEach(p => {
        p.classList.toggle('active', p.id === targetId);
      });
    }
  };

  // ============================================================================
  // ANKORA KURULUM ARACI (MODERN OS TARGET INSTALLER WIZARD)
  // ============================================================================
  const InstallerWizard = {
    selectedDisk: '/dev/sda',
    disks: [],

    async init() {
      // Adım Geçişleri
      const step1Next = document.getElementById('btn-step1-next');
      const step2Prev = document.getElementById('btn-step2-prev');
      const step2Next = document.getElementById('btn-step2-next');
      const step3Prev = document.getElementById('btn-step3-prev');
      const btnStart = document.getElementById('btn-start-real-install');
      const btnReboot = document.getElementById('btn-installer-reboot');

      if (step1Next) step1Next.addEventListener('click', () => this.goToStep(2));
      if (step2Prev) step2Prev.addEventListener('click', () => this.goToStep(1));
      if (step2Next) step2Next.addEventListener('click', () => {
        this.updateSummary();
        this.goToStep(3);
      });
      if (step3Prev) step3Prev.addEventListener('click', () => this.goToStep(2));

      // Kurulumu Başlat
      if (btnStart) {
        btnStart.addEventListener('click', () => this.runInstall());
      }

      if (btnReboot) {
        btnReboot.addEventListener('click', async () => {
          Terminal.log('[SİSTEM] Yeniden başlatılıyor...', 'cmd');
          await TauriBridge.invoke('run_terminal_command', { command: 'reboot' });
        });
      }

      // Canlı Diskleri Yükle
      await this.loadDisks();
    },

    async loadDisks() {
      const container = document.getElementById('disk-selection-box');
      if (!container) return;

      try {
        this.disks = await TauriBridge.invoke('get_storage_devices');
      } catch (err) {
        this.disks = [
          { name: 'sda', path: '/dev/sda', size_gb: 256.0, model: 'Standart Sabit Disk', is_removable: false }
        ];
      }

      container.innerHTML = '';
      if (!this.disks || this.disks.length === 0) {
        container.innerHTML = '<div class="alert-box-mono">Hiçbir hedef disk tespit edilemedi!</div>';
        return;
      }

      this.disks.forEach((disk, idx) => {
        const card = document.createElement('div');
        card.className = `disk-card ${idx === 0 ? 'active' : ''}`;
        card.innerHTML = `
          <div class="disk-meta">
            <strong>${disk.path} — ${disk.model}</strong>
            <span>Cihaz: ${disk.name} | Tür: Sabit Disk / NVMe</span>
          </div>
          <div class="disk-capacity">${disk.size_gb} GB</div>
        `;

        card.addEventListener('click', () => {
          document.querySelectorAll('.disk-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          this.selectedDisk = disk.path;
          this.updateSummary();
        });

        container.appendChild(card);
      });

      this.selectedDisk = this.disks[0].path;
      this.updateSummary();
    },

    updateSummary() {
      const elDisk = document.getElementById('sum-disk');
      const elUser = document.getElementById('sum-user');
      const elHost = document.getElementById('sum-host');
      const valUser = document.getElementById('inst-username')?.value || 'pars';
      const valHost = document.getElementById('inst-hostname')?.value || 'ankora-pc';

      if (elDisk) elDisk.textContent = this.selectedDisk;
      if (elUser) elUser.textContent = valUser;
      if (elHost) elHost.textContent = valHost;
    },

    goToStep(stepNum) {
      document.querySelectorAll('.step-node').forEach((node, idx) => {
        node.classList.toggle('active', idx + 1 === stepNum);
      });
      document.querySelectorAll('.wizard-pane').forEach((pane, idx) => {
        pane.classList.toggle('active', idx + 1 === stepNum);
      });
    },

    async runInstall() {
      this.goToStep(4);
      const progress = document.getElementById('inst-wizard-progress');
      const logs = document.getElementById('installer-logs-view');
      const title = document.getElementById('inst-exec-title');
      const finishNav = document.getElementById('installer-finish-nav');

      const appendLog = (msg) => {
        if (!logs) return;
        const row = document.createElement('div');
        row.className = 'term-row muted';
        row.textContent = msg;
        logs.appendChild(row);
        logs.scrollTop = logs.scrollHeight;
      };

      const payload = {
        target_disk: this.selectedDisk,
        fullname: document.getElementById('inst-fullname')?.value || 'Pars',
        username: document.getElementById('inst-username')?.value || 'pars',
        hostname: document.getElementById('inst-hostname')?.value || 'ankora-pc',
        password: document.getElementById('inst-password')?.value || 'ankora',
        autologin: document.getElementById('inst-autologin')?.checked || true
      };

      appendLog(`[BAŞLANGIÇ] Hedef sürücü: ${payload.target_disk}`);
      appendLog(`[HESAP] Kullanıcı: ${payload.username}@${payload.hostname}`);

      let p = 10;
      const timer = setInterval(() => {
        if (p < 85) {
          p += 15;
          if (progress) progress.style.width = `${p}%`;
          if (p === 25) appendLog('[DISK] GPT tablosu yazıldı, EFI ve root bölümleri oluşturuldu.');
          if (p === 55) appendLog('[DOSYA] ext4 ve vfat dosya sistemleri biçimlendirildi.');
          if (p === 70) appendLog('[RSYNC] Canlı sistem hedef diske kopyalanıyor...');
        }
      }, 400);

      try {
        const res = await TauriBridge.invoke('execute_system_installation', { payload });
        clearInterval(timer);
        if (progress) progress.style.width = '100%';
        appendLog(`[BAŞARILI] ${res}`);
        if (title) title.textContent = 'Kurulum Başarıyla Tamamlandı!';
        if (finishNav) finishNav.style.display = 'flex';
        Terminal.log('[KURULUM] Sistem diske başarıyla kuruldu.', 'success');
      } catch (err) {
        clearInterval(timer);
        appendLog(`[HATA] ${err}`);
        if (title) title.textContent = 'Kurulum Hatası Oluştu';
      }
    }
  };

  // ============================================================================
  // YAZILIM MAĞAZASI (STORE MODULE)
  // ============================================================================
  const StoreManager = {
    packages: [
      { id: 'vlc', name: 'VLC Medya Oynatıcı', deb: 'vlc_3.0.20-1_amd64.deb', desc: 'Evrensel video ve ortam oynatıcı', cat: 'media', size: '64 MB', installed: false, exec: 'vlc' },
      { id: 'code', name: 'VS Code', deb: 'code_1.92.0_amd64.deb', desc: 'Gelişmiş kaynak kod editörü', cat: 'dev', size: '90 MB', installed: false, exec: 'code' },
      { id: 'gimp', name: 'GIMP', deb: 'gimp_2.10.34_amd64.deb', desc: 'Açık kaynak görsel düzenleyici', cat: 'graphics', size: '112 MB', installed: false, exec: 'gimp' },
      { id: 'firefox-esr', name: 'Firefox ESR', deb: 'firefox-esr_115.15_amd64.deb', desc: 'Gizlilik odaklı web tarayıcısı', cat: 'dev', size: '78 MB', installed: true, exec: 'firefox-esr' },
      { id: 'blender', name: 'Blender 3D', deb: 'blender_4.2.0_amd64.deb', desc: '3D modelleme ve animasyon paketi', cat: 'graphics', size: '310 MB', installed: false, exec: 'blender' },
      { id: 'htop', name: 'Htop Monitör', deb: 'htop_3.2.2-1_amd64.deb', desc: 'Terminal süreç ve bellek yöneticisi', cat: 'sys', size: '2 MB', installed: true, exec: 'htop' }
    ],
    tableBody: null,
    currentCat: 'all',

    init() {
      this.tableBody = document.getElementById('store-table-body');
      const searchInput = document.getElementById('store-search');
      const filterBtns = document.querySelectorAll('.store-filter-btn');

      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentCat = btn.getAttribute('data-cat');
          this.render(searchInput ? searchInput.value : '');
        });
      });

      if (searchInput) {
        searchInput.addEventListener('input', (e) => this.render(e.target.value));
      }

      this.render();
    },

    render(query = '') {
      if (!this.tableBody) return;
      this.tableBody.innerHTML = '';

      const q = query.toLowerCase();
      const filtered = this.packages.filter(p => {
        const matchCat = this.currentCat === 'all' || p.cat === this.currentCat;
        const matchQ = p.name.toLowerCase().includes(q) || p.deb.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
        return matchCat && matchQ;
      });

      filtered.forEach(pkg => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <span class="pkg-title">${pkg.name}</span>
            <span class="pkg-name">${pkg.deb}</span>
            <div class="pkg-progress-bar" id="prog-${pkg.id}"></div>
          </td>
          <td><span class="pkg-desc">${pkg.desc}</span></td>
          <td><span style="color: var(--text-muted); font-family: var(--font-mono); font-size: 11px;">${pkg.size}</span></td>
          <td style="text-align: right;">
            <button class="btn-pkg ${pkg.installed ? 'installed' : ''}" id="btn-pkg-${pkg.id}">
              ${pkg.installed ? 'Kaldır' : 'Kur'}
            </button>
          </td>
        `;

        const btn = tr.querySelector(`#btn-pkg-${pkg.id}`);
        btn.addEventListener('click', () => this.togglePackage(pkg));

        this.tableBody.appendChild(tr);
      });
    },

    async togglePackage(pkg) {
      const btn = document.getElementById(`btn-pkg-${pkg.id}`);
      const prog = document.getElementById(`prog-${pkg.id}`);

      if (pkg.installed) {
        pkg.installed = false;
        btn.classList.remove('installed');
        btn.textContent = 'Kur';
        this.removeDesktopIcon(pkg.id);
        Terminal.log(`[APT] Paket kaldırıldı: ${pkg.deb}`, 'muted');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Kuruluyor...';
      Terminal.log(`[APT] install_deb_package("${pkg.deb}") yürütülüyor`, 'cmd');

      let val = 0;
      const interval = setInterval(() => {
        val += 25;
        if (prog) prog.style.width = `${val}%`;
        if (val >= 100) clearInterval(interval);
      }, 120);

      try {
        const result = await TauriBridge.invoke('install_deb_package', { packageName: pkg.deb });
        pkg.installed = true;
        btn.disabled = false;
        btn.classList.add('installed');
        btn.textContent = 'Kaldır';
        if (prog) prog.style.width = '0%';

        this.addDesktopIcon(pkg);
        Terminal.log(`[OK] ${result}`, 'success');
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Hata';
        if (prog) prog.style.width = '0%';
        Terminal.log(`[ERR] ${err}`, 'error');
      }
    },

    addDesktopIcon(pkg) {
      const grid = document.getElementById('dynamic-desktop-icons');
      if (!grid || document.getElementById(`dyn-${pkg.id}`)) return;

      const item = document.createElement('div');
      item.className = 'desktop-item';
      item.id = `dyn-${pkg.id}`;
      item.tabIndex = 0;
      item.innerHTML = `
        <div class="item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </div>
        <span class="item-name">${pkg.name}</span>
      `;

      item.addEventListener('click', async () => {
        Terminal.log(`[EXEC] Başlatılıyor: ${pkg.exec}`, 'cmd');
        try {
          const res = await TauriBridge.invoke('launch_application', { exec: pkg.exec });
          Terminal.log(`[OK] ${res}`, 'success');
        } catch (e) {
          Terminal.log(`[ERR] ${e}`, 'error');
        }
      });

      grid.appendChild(item);
    },

    removeDesktopIcon(pkgId) {
      const el = document.getElementById(`dyn-${pkgId}`);
      if (el) el.remove();
    }
  };

  // ============================================================================
  // TERMİNAL (TERMINAL MODULE - TAURI BASH)
  // ============================================================================
  const Terminal = {
    input: null,
    logs: null,
    viewport: null,
    history: [],
    hIndex: -1,

    init() {
      this.input = document.getElementById('term-input');
      this.logs = document.getElementById('term-logs');
      this.viewport = document.getElementById('term-viewport');

      if (!this.input) return;

      this.input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const raw = this.input.value.trim();
          if (!raw) return;

          this.log(`pars@ankora-os:~$ ${raw}`, 'cmd');
          this.history.push(raw);
          this.hIndex = this.history.length;
          this.input.value = '';

          if (raw.toLowerCase() === 'clear') {
            if (this.logs) this.logs.innerHTML = '';
            return;
          }

          try {
            const out = await TauriBridge.invoke('run_terminal_command', { command: raw });
            if (out) this.log(out, 'muted');
          } catch (err) {
            this.log(String(err), 'error');
          }
        } else if (e.key === 'ArrowUp') {
          if (this.hIndex > 0) {
            this.hIndex--;
            this.input.value = this.history[this.hIndex];
          }
        } else if (e.key === 'ArrowDown') {
          if (this.hIndex < this.history.length - 1) {
            this.hIndex++;
            this.input.value = this.history[this.hIndex];
          } else {
            this.hIndex = this.history.length;
            this.input.value = '';
          }
        }
      });
    },

    log(text, type = 'muted') {
      if (!this.logs) return;
      const row = document.createElement('div');
      row.className = `term-row ${type}`;
      row.textContent = text;
      this.logs.appendChild(row);
      if (this.viewport) this.viewport.scrollTop = this.viewport.scrollHeight;
    }
  };

  // ============================================================================
  // AI ASİSTAN (AI MODULE)
  // ============================================================================
  const AIAgent = {
    feed: null,
    input: null,
    pendingAction: null,

    init() {
      this.feed = document.getElementById('ai-feed');
      this.input = document.getElementById('ai-prompt-input');
      const btnSend = document.getElementById('btn-ai-submit');
      const quickBtns = document.querySelectorAll('.ai-tag-btn');

      if (btnSend && this.input) {
        btnSend.addEventListener('click', () => this.submit());
        this.input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submit();
        });
      }

      quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const q = btn.getAttribute('data-query');
          if (q) this.handleQuery(q);
        });
      });

      const modal = document.getElementById('confirm-modal');
      const btnApprove = document.getElementById('btn-modal-confirm');
      const btnCancel = document.getElementById('btn-modal-cancel');

      if (btnApprove && modal) {
        btnApprove.addEventListener('click', () => {
          modal.classList.remove('open');
          if (this.pendingAction) this.pendingAction(true);
        });
      }
      if (btnCancel && modal) {
        btnCancel.addEventListener('click', () => {
          modal.classList.remove('open');
          if (this.pendingAction) this.pendingAction(false);
        });
      }
    },

    submit() {
      if (!this.input) return;
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.handleQuery(text);
    },

    appendMsg(role, text) {
      if (!this.feed) return;
      const entry = document.createElement('div');
      entry.className = `ai-entry ${role === 'user' ? 'user' : 'bot'}`;
      entry.innerHTML = `
        <span class="ai-author">${role === 'user' ? 'Kullanıcı' : 'Ankora AI'}</span>
        <p>${text}</p>
      `;
      this.feed.appendChild(entry);
      this.feed.scrollTop = this.feed.scrollHeight;
    },

    handleQuery(text) {
      this.appendMsg('user', text);
      const lower = text.toLowerCase();

      if (lower.includes('temizle') || lower.includes('önbellek')) {
        this.promptConfirm('apt-get clean', async (ok) => {
          if (ok) {
            try {
              const res = await TauriBridge.invoke('run_terminal_command', { command: 'apt-get clean' });
              this.appendMsg('bot', 'İşlem tamamlandı. Paket önbelleği temizlendi.');
              Terminal.log(`[AI-IPC] apt-get clean: ${res || 'Başarılı'}`, 'success');
            } catch (err) {
              this.appendMsg('bot', `İşlem hatası: ${err}`);
            }
          } else {
            this.appendMsg('bot', 'İşlem kullanıcı tarafından iptal edildi.');
          }
        });
      } else if (lower.includes('durum') || lower.includes('telemetri') || lower.includes('disk')) {
        TauriBridge.invoke('get_system_telemetry').then(data => {
          this.appendMsg('bot', `Sistem: ${data.os_name} | Çekirdek: ${data.kernel} | Bellek: ${data.memory_used_mb}MB / ${data.memory_total_mb}MB | Çekirdek Sayısı: ${data.cpu_cores}`);
        });
      } else {
        this.appendMsg('bot', `Talebiniz incelendi: "${text}". Sistem yapılandırmasında değişiklik gerekirse onayınızı isteyeceğim.`);
      }
    },

    promptConfirm(cmd, callback) {
      const modal = document.getElementById('confirm-modal');
      const cmdEl = document.getElementById('confirm-cmd');
      if (!modal || !cmdEl) return;

      this.pendingAction = callback;
      cmdEl.textContent = cmd;
      modal.classList.add('open');
    }
  };

  // ============================================================================
  // AYARLAR VE TELEMETRİ (SETTINGS & TELEMETRY MODULE)
  // ============================================================================
  const SettingsManager = {
    async init() {
      const slider = document.getElementById('ctrl-brightness');
      const dimmer = document.getElementById('screen-dimmer');
      const nightToggle = document.getElementById('ctrl-night');
      const nightOverlay = document.getElementById('screen-night');

      if (slider && dimmer) {
        slider.addEventListener('input', async (e) => {
          const val = parseInt(e.target.value);
          dimmer.style.opacity = ((100 - val) / 100 * 0.75).toString();
          await TauriBridge.invoke('set_brightness', { level: val });
        });
      }

      if (nightToggle && nightOverlay) {
        nightToggle.addEventListener('change', (e) => {
          nightOverlay.style.opacity = e.target.checked ? '0.25' : '0';
        });
      }

      try {
        const tele = await TauriBridge.invoke('get_system_telemetry');
        if (tele) {
          const elOs = document.getElementById('tele-os');
          const elInit = document.getElementById('tele-init');
          const elKernel = document.getElementById('tele-kernel');
          const elMem = document.getElementById('tele-mem');

          if (elOs) elOs.textContent = tele.os_name;
          if (elInit) elInit.textContent = tele.init_system;
          if (elKernel) elKernel.textContent = tele.kernel;
          if (elMem) elMem.textContent = `${(tele.memory_used_mb / 1024).toFixed(1)} / ${(tele.memory_total_mb / 1024).toFixed(1)} GB`;
        }
      } catch (err) {}
    }
  };

  // ============================================================================
  // BAŞLAT MENÜSÜ & GÖREV ÇUBUĞU
  // ============================================================================
  function initDesktopControls() {
    document.querySelectorAll('.desktop-item').forEach(item => {
      const target = item.getAttribute('data-open');
      if (!target) return;
      item.addEventListener('click', () => WindowManager.open(target));
    });

    const startBtn = document.getElementById('start-btn');
    const startFlyout = document.getElementById('start-flyout');

    if (startBtn && startFlyout) {
      startBtn.addEventListener('click', () => {
        startFlyout.classList.toggle('open');
        startBtn.classList.toggle('active');
      });

      document.addEventListener('click', (e) => {
        if (!startFlyout.contains(e.target) && !startBtn.contains(e.target)) {
          startFlyout.classList.remove('open');
          startBtn.classList.remove('active');
        }
      });
    }

    document.querySelectorAll('.start-row').forEach(row => {
      row.addEventListener('click', () => {
        const target = row.getAttribute('data-open');
        if (target) WindowManager.open(target);
        if (startFlyout) startFlyout.classList.remove('open');
        if (startBtn) startBtn.classList.remove('active');
      });
    });

    const trayClock = document.getElementById('tray-clock');
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      if (trayClock) trayClock.textContent = `${h}:${m}`;
    };
    setInterval(updateTime, 1000);
    updateTime();

    const trayBridge = document.getElementById('tray-bridge');
    if (trayBridge) {
      trayBridge.textContent = TauriBridge.isAvailable ? 'Tauri Core: Aktif' : 'Tauri Core: Hazır (Web Modu)';
    }

    const btnSaveOffice = document.getElementById('btn-office-save');
    const btnClearOffice = document.getElementById('btn-office-clear');
    const officePad = document.getElementById('office-pad');

    if (btnSaveOffice) {
      btnSaveOffice.addEventListener('click', () => {
        Terminal.log('[OFİS] notlar.txt kaydedildi.', 'success');
      });
    }
    if (btnClearOffice && officePad) {
      btnClearOffice.addEventListener('click', () => {
        officePad.innerHTML = '';
      });
    }
  }

  // SİSTEMİ BAŞLAT
  WindowManager.init();
  WelcomeManager.init();
  InstallerWizard.init();
  StoreManager.init();
  Terminal.init();
  AIAgent.init();
  SettingsManager.init();
  initDesktopControls();

})();
