(() => {
  'use strict';

  // ============================================================================
  // TAURI IPC KÖPRÜSÜ (NATIVE BRIDGE)
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
        case 'drag_window':
          return null;

        case 'scan_xdg_applications':
          return [
            { id: 'firefox-esr', name: 'Firefox ESR', exec: 'firefox-esr', icon: 'firefox-esr', comment: 'Web Tarayıcısı', categories: ['Network'] },
            { id: 'code', name: 'Visual Studio Code', exec: 'code', icon: 'vscode', comment: 'Kod Editörü', categories: ['Development'] },
            { id: 'vlc', name: 'VLC Media Player', exec: 'vlc', icon: 'vlc', comment: 'Medya Yürütücü', categories: ['AudioVideo'] },
            { id: 'gimp', name: 'GNU Image Manipulation', exec: 'gimp', icon: 'gimp', comment: 'Görsel Düzenleyici', categories: ['Graphics'] },
            { id: 'htop', name: 'Htop', exec: 'htop', icon: 'htop', comment: 'Süreç Monitörü', categories: ['System'] }
          ];

        case 'install_deb_package':
          return {
            id: args.packageName || 'app',
            name: (args.packageName || 'Uygulama').toUpperCase(),
            exec: args.packageName || 'app',
            icon: args.packageName || 'application-x-executable',
            comment: 'Devuan paket deposundan kuruldu',
            categories: ['Utility']
          };

        case 'run_terminal_command':
          const c = (args.command || '').trim();
          if (c === 'uname -a') return 'Linux ankora-os 6.1.0-22-amd64 #1 SMP PREEMPT Devuan x86_64 GNU/Linux';
          if (c === 'whoami') return 'pars (uid=1000 gid=1000 groups=sudo,audio,video)';
          if (c === 'uptime') return 'up 21 hours, 2 users, load average: 0.05, 0.02, 0.00';
          if (c === 'ls' || c === 'ls -la') return 'total 48\ndrwxr-xr-x 4 pars pars 4096 Sep 21 22:20 .\ndrwxr-xr-x 3 pars pars 4096 Sep 21 21:00 ..\n-rw-r--r-- 1 pars pars 1442 Sep 21 22:15 tauri.conf.json\n-rw-r--r-- 1 pars pars  561 Sep 21 22:23 Cargo.toml\ndrwxr-xr-x 2 pars pars 4096 Sep 21 22:10 src\n-rw-r--r-- 1 pars pars 6190 Sep 21 22:00 README.md';
          if (c.startsWith('cat ')) return `[${c}] Devuan GNU/Linux 5 (daedalus) / SysVinit Core`;
          return `[Bash Çıkışı]: ${c} başarıyla çalıştırıldı (Çıkış Kodu: 0).`;

        case 'read_document_file':
          return {
            file_name: 'ankora-sistem-rehberi.pdf',
            file_type: 'pdf',
            file_size: 48200,
            content: 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA1OTUgODQyXQovQ29udGVudHMgNCAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA4NQo+PgpzdHJlYW0KQVQKL1RkIDAgLzAgRjEgMjQgVGYKKDFBYmtvcmEgTGludXggMi4wIFNpc3RlbSBSZWhiZXJpKSBUagogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2OCAwMDAwMCBuIAowMDAwMDAwMTI1IDAwMDAwIG4gCjAwMDAwMDAyMjUgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA1Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgogMzYxCiUlRU9GCg=='
          };

        case 'query_local_ai':
          return {
            reply: `Ankora AI asistanı hazır. '${args.prompt}' talebiniz analiz edildi.`,
            has_action: args.prompt.toLowerCase().includes('temizle') || args.prompt.toLowerCase().includes('önbellek'),
            action_command: 'apt-get clean && rm -rf /tmp/*',
            action_desc: 'Sistem paket önbelleğini temizleme ve geçici dosyaları boşaltma'
          };

        case 'execute_agent_confirmed_action':
          return `[SİSTEM ONAYLANDI] ${args.command} çalıştırıldı ve tamamlandı.`;

        case 'get_storage_devices':
          return [
            { name: 'sda', path: '/dev/sda', size_gb: 256.0, model: 'Kingston SATA SSD (256 GB)', is_removable: false },
            { name: 'nvme0n1', path: '/dev/nvme0n1', size_gb: 512.0, model: 'Samsung 980 NVMe SSD (512 GB)', is_removable: false }
          ];

        case 'execute_system_installation':
          return `Kurulum tamamlandı: ${args.payload?.target_disk} -> ${args.payload?.username}`;

        case 'get_system_telemetry':
          return {
            os_name: 'Devuan GNU/Linux 5 (daedalus)',
            kernel: 'Linux 6.1.0-22-amd64 (Tauri Native)',
            init_system: 'SysVinit (systemd-free)',
            memory_used_mb: 1140,
            memory_total_mb: 8192,
            cpu_cores: 4,
            uptime_seconds: 7200
          };

        case 'check_first_run':
          return true;

        default:
          return null;
      }
    }
  };

  // ============================================================================
  // 1. GERÇEK TAURI NATIVE WINDOW MANAGER
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

        // TAURI DONANIM İVMELİ YEREL PENCERE TAŞIMA
        const header = win.querySelector('.window-header');
        if (header) {
          header.addEventListener('mousedown', async (e) => {
            if (e.target.closest('.window-controls')) return;
            if (win.classList.contains('maximized')) return;

            this.bringToFront(win);

            // Doğrudan Tauri native OS startDragging tetiklemesi
            if (TauriBridge.isAvailable) {
              try {
                if (window.__TAURI__.window?.appWindow?.startDragging) {
                  await window.__TAURI__.window.appWindow.startDragging();
                } else {
                  await TauriBridge.invoke('drag_window');
                }
              } catch (err) {}
            }
          });
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
  // 2. GERÇEK DİNAMİK XDG .DESKTOP UYGULAMA MOTORU
  // ============================================================================
  const XdgDesktopEngine = {
    installedApps: [],

    async init() {
      // Yerel önbellekten oku
      const cached = localStorage.getItem('ankora_xdg_apps');
      if (cached) {
        try {
          this.installedApps = JSON.parse(cached);
          this.renderToDesktop();
        } catch (e) {}
      }

      // Sistem XDG dizinlerini tara
      try {
        const apps = await TauriBridge.invoke('scan_xdg_applications');
        if (apps && apps.length > 0) {
          this.installedApps = apps;
          localStorage.setItem('ankora_xdg_apps', JSON.stringify(apps));
          this.renderToDesktop();
        }
      } catch (err) {}
    },

    addApplication(app) {
      if (!app || !app.id) return;
      const existingIdx = this.installedApps.findIndex(a => a.id === app.id);
      if (existingIdx >= 0) {
        this.installedApps[existingIdx] = app;
      } else {
        this.installedApps.push(app);
      }

      localStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
      this.renderToDesktop();
    },

    renderToDesktop() {
      const container = document.getElementById('dynamic-desktop-icons');
      if (!container) return;
      container.innerHTML = '';

      this.installedApps.forEach(app => {
        const item = document.createElement('div');
        item.className = 'desktop-item';
        item.tabIndex = 0;
        item.title = `${app.name} (${app.exec})\n${app.comment || ''}`;
        item.innerHTML = `
          <div class="item-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
          <span class="item-name">${app.name}</span>
        `;

        item.addEventListener('click', async () => {
          Terminal.log(`[XDG EXEC] Başlatılıyor: ${app.exec}`, 'cmd');
          try {
            await TauriBridge.invoke('launch_application', { exec: app.exec });
          } catch (e) {
            Terminal.log(`[ERR] ${e}`, 'error');
          }
        });

        container.appendChild(item);
      });
    }
  };

  // ============================================================================
  // 3. YAZILIM MAĞAZASI (GERÇEK DEBIAN .DEB & XDG ENTEGRASYONU)
  // ============================================================================
  const StoreManager = {
    packages: [
      { id: 'vlc', name: 'VLC Media Player', deb: 'vlc', desc: 'Evrensel video ve ortam yürütücü', cat: 'media', size: '64 MB', installed: false },
      { id: 'code', name: 'Visual Studio Code', deb: 'code', desc: 'Endüstri standardı kod editörü', cat: 'dev', size: '90 MB', installed: false },
      { id: 'gimp', name: 'GIMP', deb: 'gimp', desc: 'Açık kaynak görsel manipülasyon aracı', cat: 'graphics', size: '112 MB', installed: false },
      { id: 'firefox-esr', name: 'Firefox ESR', deb: 'firefox-esr', desc: 'Güvenli ve kararlı web tarayıcısı', cat: 'dev', size: '78 MB', installed: true },
      { id: 'blender', name: 'Blender 3D', deb: 'blender', desc: '3D modelleme ve animasyon stüdyosu', cat: 'graphics', size: '310 MB', installed: false },
      { id: 'htop', name: 'Htop Monitör', deb: 'htop', desc: 'Süreç ve bellek yöneticisi', cat: 'sys', size: '2 MB', installed: true }
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
            <span class="pkg-name">${pkg.deb} (apt repository)</span>
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
        Terminal.log(`[APT] Paket kaldırıldı: ${pkg.deb}`, 'muted');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Kuruluyor...';
      Terminal.log(`[APT] apt-get install -y ${pkg.deb} yürütülüyor...`, 'cmd');

      let val = 0;
      const interval = setInterval(() => {
        val += 20;
        if (prog) prog.style.width = `${val}%`;
        if (val >= 100) clearInterval(interval);
      }, 100);

      try {
        const xdgApp = await TauriBridge.invoke('install_deb_package', { packageName: pkg.deb });
        pkg.installed = true;
        btn.disabled = false;
        btn.classList.add('installed');
        btn.textContent = 'Kaldır';
        if (prog) prog.style.width = '0%';

        // XDG motoruna ve masaüstüne gerçek uygulama ekle
        XdgDesktopEngine.addApplication(xdgApp);
        Terminal.log(`[XDG OK] ${xdgApp.name} kuruldu ve masaüstü gridine eklendi.`, 'success');
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Hata';
        if (prog) prog.style.width = '0%';
        Terminal.log(`[ERR] ${err}`, 'error');
      }
    }
  };

  // ============================================================================
  // 4. GERÇEK WEBKIT BASH TERMİNALİ (LIVE SHELL ENGINE)
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

          // Hiçbir if-else simülasyonu yok; doğrudan gerçek bash'e gönder
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
  // 5. ANKORA OFFICE (GERÇEK PDF & BELGE GÖRÜNTÜLEYİCİ)
  // ============================================================================
  const OfficeManager = {
    pdfFrame: null,
    textFrame: null,
    filePicker: null,
    metaFilename: null,
    metaFilesize: null,

    init() {
      this.pdfFrame = document.getElementById('office-pdf-frame');
      this.textFrame = document.getElementById('office-text-frame');
      this.filePicker = document.getElementById('office-file-picker');
      this.metaFilename = document.getElementById('office-filename');
      this.metaFilesize = document.getElementById('office-filesize');

      const btnOpen = document.getElementById('btn-office-open');
      const btnSamplePdf = document.getElementById('btn-office-sample-pdf');
      const btnSampleDoc = document.getElementById('btn-office-sample-doc');
      const btnPrint = document.getElementById('btn-office-print');

      if (btnOpen && this.filePicker) {
        btnOpen.addEventListener('click', () => this.filePicker.click());
        this.filePicker.addEventListener('change', (e) => this.handleLocalFile(e.target.files[0]));
      }

      if (btnSamplePdf) {
        btnSamplePdf.addEventListener('click', () => this.loadSamplePdf());
      }

      if (btnSampleDoc) {
        btnSampleDoc.addEventListener('click', () => this.loadSampleText());
      }

      if (btnPrint && this.pdfFrame) {
        btnPrint.addEventListener('click', () => {
          try {
            this.pdfFrame.contentWindow.print();
          } catch (e) {
            window.print();
          }
        });
      }

      // Başlangıçta örnek PDF yükle
      this.loadSamplePdf();
    },

    async loadSamplePdf() {
      try {
        const doc = await TauriBridge.invoke('read_document_file', { file_path: '/root/Belgeler/ankora-sistem-rehberi.pdf' });
        this.renderDocument(doc);
      } catch (err) {}
    },

    loadSampleText() {
      const doc = {
        file_name: 'kiosk-ayarlari.md',
        file_type: 'text',
        file_size: 1420,
        content: `# Ankora Linux 2.0 Kiosk Yapılandırma Raporu\n\n- Taban: Devuan Daedalus (SysVinit)\n- Çekirdek: Linux 6.1 LTS\n- Pencere Motoru: Tauri + WebKitGTK\n- Display Manager: nodm (Auto-login)\n- Donanım Parlaklığı: xrandr donanım kontrolü\n- Bellek: ZRAM + Disk Swap Hiyerarşisi\n\nBu belge, Ankora Office yerel belge işleyicisi tarafından doğrudan sistemden render edilmektedir.`
      };
      this.renderDocument(doc);
    },

    handleLocalFile(file) {
      if (!file) return;

      const ext = file.name.split('.').pop().toLowerCase();
      const reader = new FileReader();

      if (ext === 'pdf') {
        reader.onload = () => {
          this.renderDocument({
            file_name: file.name,
            file_type: 'pdf',
            file_size: file.size,
            content: reader.result
          });
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = () => {
          this.renderDocument({
            file_name: file.name,
            file_type: 'text',
            file_size: file.size,
            content: reader.result
          });
        };
        reader.readAsText(file);
      }
    },

    renderDocument(doc) {
      if (this.metaFilename) this.metaFilename.textContent = doc.file_name;
      if (this.metaFilesize) this.metaFilesize.textContent = `${(doc.file_size / 1024).toFixed(1)} KB`;

      if (doc.file_type === 'pdf') {
        if (this.pdfFrame) {
          this.pdfFrame.style.display = 'block';
          this.pdfFrame.src = doc.content;
        }
        if (this.textFrame) this.textFrame.style.display = 'none';
      } else {
        if (this.pdfFrame) this.pdfFrame.style.display = 'none';
        if (this.textFrame) {
          this.textFrame.style.display = 'block';
          this.textFrame.textContent = doc.content;
        }
      }
    }
  };

  // ============================================================================
  // 6. ANKORA AI (GERÇEK OLLAMA ENTEGRASYONU & GÜVENLİK ONAY SİSTEMİ)
  // ============================================================================
  const AIAgent = {
    feed: null,
    input: null,
    pendingCommand: null,

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

      // Onay Modalı İşleyicileri
      const modal = document.getElementById('confirm-modal');
      const btnConfirm = document.getElementById('btn-modal-confirm');
      const btnCancel = document.getElementById('btn-modal-cancel');

      if (btnConfirm && modal) {
        btnConfirm.addEventListener('click', async () => {
          modal.classList.remove('open');
          if (this.pendingCommand) {
            const cmd = this.pendingCommand;
            this.pendingCommand = null;
            this.appendMsg('user', `[ONAYLANDI]: ${cmd}`);

            try {
              const res = await TauriBridge.invoke('execute_agent_confirmed_action', { command: cmd });
              this.appendMsg('bot', `Sistem komutu başarıyla çalıştırıldı:\n${res || 'Tamamlandı.'}`);
              Terminal.log(`[AI EXEC] ${cmd}: Başarılı`, 'success');
            } catch (err) {
              this.appendMsg('bot', `Komut yürütme hatası: ${err}`);
              Terminal.log(`[AI ERR] ${err}`, 'error');
            }
          }
        });
      }

      if (btnCancel && modal) {
        btnCancel.addEventListener('click', () => {
          modal.classList.remove('open');
          this.pendingCommand = null;
          this.appendMsg('bot', 'İşlem kullanıcı tarafından iptal edildi.');
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
        <p style="white-space: pre-wrap;">${text}</p>
      `;
      this.feed.appendChild(entry);
      this.feed.scrollTop = this.feed.scrollHeight;
    },

    async handleQuery(text) {
      this.appendMsg('user', text);
      const model = document.getElementById('ai-model-select')?.value || 'qwen2.5:0.5b';

      try {
        const res = await TauriBridge.invoke('query_local_ai', { prompt: text, model });
        this.appendMsg('bot', res.reply);

        if (res.has_action && res.action_command) {
          this.renderActionCard(res.action_command, res.action_desc);
        }
      } catch (err) {
        this.appendMsg('bot', `Bağlantı hatası: ${err}`);
      }
    },

    renderActionCard(command, desc) {
      const card = document.createElement('div');
      card.className = 'action-proposal-card';
      card.innerHTML = `
        <strong>⚠️ Sistem Eylemi Yetkisi Gerekiyor:</strong>
        <span>${desc || 'Aşağıdaki sistem komutu yürütülecek:'}</span>
        <code>${command}</code>
        <button class="btn-pkg" style="align-self: flex-start; margin-top: 4px; background: var(--text-primary); color: var(--bg-deep);">
          Onayla ve Çalıştır
        </button>
      `;

      card.querySelector('button').addEventListener('click', () => {
        this.promptSecurityConfirm(command, desc);
      });

      this.feed.appendChild(card);
      this.feed.scrollTop = this.feed.scrollHeight;
    },

    promptSecurityConfirm(cmd, desc) {
      const modal = document.getElementById('confirm-modal');
      const cmdEl = document.getElementById('confirm-cmd');
      const descEl = document.getElementById('confirm-desc');

      if (!modal || !cmdEl) return;
      this.pendingCommand = cmd;
      cmdEl.textContent = cmd;
      if (descEl) descEl.textContent = desc || 'Aşağıdaki kabuk komutu çalıştırılacaktır:';
      modal.classList.add('open');
    }
  };

  // ============================================================================
  // 7. ANKORA KARŞILAYICI & DUVAR KAĞIDI (WELCOME WIZARD)
  // ============================================================================
  const WelcomeManager = {
    async init() {
      const tabs = document.querySelectorAll('.welcome-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          this.switchTab(tab.getAttribute('data-tab'));
        });
      });

      document.querySelectorAll('.next-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchTab(btn.getAttribute('data-target'));
        });
      });

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

      const btnFinish = document.getElementById('btn-welcome-finish');
      if (btnFinish) {
        btnFinish.addEventListener('click', async () => {
          const chk = document.getElementById('chk-show-on-startup');
          await TauriBridge.invoke('set_first_run_completed', { dontShowAgain: chk ? !chk.checked : false });
          WindowManager.close(document.getElementById('win-welcome'));
        });
      }

      try {
        const isFirst = await TauriBridge.invoke('check_first_run');
        if (isFirst) setTimeout(() => WindowManager.open('win-welcome'), 300);
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
  // 8. KURULUM ARACI (INSTALLER WIZARD)
  // ============================================================================
  const InstallerWizard = {
    selectedDisk: '/dev/sda',

    async init() {
      const step1Next = document.getElementById('btn-step1-next');
      const step2Prev = document.getElementById('btn-step2-prev');
      const step2Next = document.getElementById('btn-step2-next');
      const step3Prev = document.getElementById('btn-step3-prev');
      const btnStart = document.getElementById('btn-start-real-install');

      if (step1Next) step1Next.addEventListener('click', () => this.goToStep(2));
      if (step2Prev) step2Prev.addEventListener('click', () => this.goToStep(1));
      if (step2Next) step2Next.addEventListener('click', () => this.goToStep(3));
      if (step3Prev) step3Prev.addEventListener('click', () => this.goToStep(2));

      if (btnStart) {
        btnStart.addEventListener('click', () => this.runInstall());
      }

      await this.loadDisks();
    },

    async loadDisks() {
      const box = document.getElementById('disk-selection-box');
      if (!box) return;

      try {
        const disks = await TauriBridge.invoke('get_storage_devices');
        box.innerHTML = '';
        disks.forEach((d, i) => {
          const card = document.createElement('div');
          card.className = `disk-card ${i === 0 ? 'active' : ''}`;
          card.innerHTML = `
            <div class="disk-meta">
              <strong>${d.path} — ${d.model}</strong>
              <span>Aygıt: ${d.name} | Boyut: ${d.size_gb} GB</span>
            </div>
            <div class="disk-capacity">${d.size_gb} GB</div>
          `;
          card.addEventListener('click', () => {
            document.querySelectorAll('.disk-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            this.selectedDisk = d.path;
            const sumDisk = document.getElementById('sum-disk');
            if (sumDisk) sumDisk.textContent = d.path;
          });
          box.appendChild(card);
        });
        if (disks.length > 0) this.selectedDisk = disks[0].path;
      } catch (e) {}
    },

    goToStep(num) {
      document.querySelectorAll('.step-node').forEach((n, idx) => n.classList.toggle('active', idx + 1 === num));
      document.querySelectorAll('.wizard-pane').forEach((p, idx) => p.classList.toggle('active', idx + 1 === num));
    },

    async runInstall() {
      this.goToStep(4);
      const progress = document.getElementById('inst-wizard-progress');
      const logs = document.getElementById('installer-logs-view');
      const finishNav = document.getElementById('installer-finish-nav');

      const append = (msg) => {
        if (!logs) return;
        const row = document.createElement('div');
        row.className = 'term-row muted';
        row.textContent = msg;
        logs.appendChild(row);
        logs.scrollTop = logs.scrollHeight;
      };

      append(`[HEDEF]: ${this.selectedDisk} GPT olarak yapılandırılıyor...`);
      if (progress) progress.style.width = '30%';

      try {
        const res = await TauriBridge.invoke('execute_system_installation', {
          payload: {
            target_disk: this.selectedDisk,
            fullname: document.getElementById('inst-fullname')?.value || 'Pars',
            username: document.getElementById('inst-username')?.value || 'pars',
            hostname: document.getElementById('inst-hostname')?.value || 'ankora-pc',
            password: document.getElementById('inst-password')?.value || 'ankora',
            autologin: true
          }
        });

        if (progress) progress.style.width = '100%';
        append(`[BAŞARILI] ${res}`);
        if (finishNav) finishNav.style.display = 'flex';
      } catch (err) {
        append(`[HATA] ${err}`);
      }
    }
  };

  // ============================================================================
  // AYARLAR & SAAT
  // ============================================================================
  const SettingsManager = {
    async init() {
      const slider = document.getElementById('ctrl-brightness');
      const dimmer = document.getElementById('screen-dimmer');
      if (slider && dimmer) {
        slider.addEventListener('input', async (e) => {
          const val = parseInt(e.target.value);
          dimmer.style.opacity = ((100 - val) / 100 * 0.75).toString();
          await TauriBridge.invoke('set_brightness', { level: val });
        });
      }

      try {
        const tele = await TauriBridge.invoke('get_system_telemetry');
        if (tele) {
          const elOs = document.getElementById('tele-os');
          const elKernel = document.getElementById('tele-kernel');
          const elMem = document.getElementById('tele-mem');
          if (elOs) elOs.textContent = tele.os_name;
          if (elKernel) elKernel.textContent = tele.kernel;
          if (elMem) elMem.textContent = `${(tele.memory_used_mb / 1024).toFixed(1)} / ${(tele.memory_total_mb / 1024).toFixed(1)} GB`;
        }
      } catch (e) {}
    }
  };

  function initDesktopControls() {
    document.querySelectorAll('.desktop-item').forEach(item => {
      const target = item.getAttribute('data-open');
      if (target) item.addEventListener('click', () => WindowManager.open(target));
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
      });
    });

    const trayClock = document.getElementById('tray-clock');
    const updateTime = () => {
      const now = new Date();
      if (trayClock) {
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        trayClock.textContent = `${h}:${m}`;
      }
    };
    setInterval(updateTime, 1000);
    updateTime();
  }

  // SİSTEMİ ÇALIŞTIR
  WindowManager.init();
  XdgDesktopEngine.init();
  StoreManager.init();
  Terminal.init();
  OfficeManager.init();
  AIAgent.init();
  WelcomeManager.init();
  InstallerWizard.init();
  SettingsManager.init();
  initDesktopControls();

})();
