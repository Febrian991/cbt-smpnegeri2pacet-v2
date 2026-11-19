// Main UI Controller & View Manager: Multi-Perangkat (Laptop, Chromebook, Tab, Ponsel)
// 13 Guru Mapel + 250 Siswa + Upload Gambar & Logo Kop + Titi Mangsa + Ekspor Excel & PDF + Cloud Supabase

document.addEventListener('DOMContentLoaded', () => {
  // Views
  const viewLogin = document.getElementById('viewLogin');
  const viewExamConfirm = document.getElementById('viewExamConfirm');
  const viewExamRoom = document.getElementById('viewExamRoom');
  const viewResult = document.getElementById('viewResult');
  const viewAdmin = document.getElementById('viewAdmin');

  // Modals
  const modalFinishConfirm = document.getElementById('modalFinishConfirm');
  const modalCheatWarning = document.getElementById('modalCheatWarning');
  const modalQuestionDrawer = document.getElementById('modalQuestionDrawer');
  const modalQuestionForm = document.getElementById('modalQuestionForm');
  const modalAdminPin = document.getElementById('modalAdminPin');

  // Privacy Shield (Anti-Screenshot & Lock)
  const examPrivacyShield = document.getElementById('examPrivacyShield');
  const btnResumeFromPrivacyShield = document.getElementById('btnResumeFromPrivacyShield');

  // Temp State
  let tempStudent = null;
  let currentUploadedImageBase64 = "";
  let currentLogoLeftBase64 = "";
  let currentLogoRightBase64 = "";
  let currentLogoCbtBase64 = "";
  let monitoringRefreshTimer = null;
  let cachedMonitoringSessions = [];
  let realtimePollTimer = null;
  let realtimeNotifActive = false;
  let realtimeBaselineReady = false;
  const realtimeSessionSnapshot = new Map();
  const realtimeEmittedEventKeys = new Set();
  const realtimeRecentDoneAt = new Map();
  let realtimeNotifs = [];
  let realtimeUnreadCount = 0;
  let realtimeFilterMode = 'ALL';
  let realtimeSoundEnabled = localStorage.getItem('cbt_notif_sound') !== 'off';
  let realtimeControlsInitialized = false;
  let realtimeLastCloudResultPullAt = 0;

  function init() {
    renderConfigInfoOnLogin();
    setupPwaPrompt();
    setupKeyboardShortcuts();
    setupPrivacyShieldListeners();
    setupImageUploader();
    setupSchoolLogoUploaders();
    setupStudentNisnDetection();
    setupSubjectAndClassFilters();
    setupMonitoringControls();
    setupRealtimeNotificationControls();
    setupDarkMode();
    setupLoginPortalControls();
    setupAdminLoginHelpers();
    updateCloudBadge();

    // 1. Jika ada sesi ujian siswa aktif saat refresh, langsung lanjutkan tanpa logout
    const active = window.examEngine.checkActiveSession();
    if (active) {
      window.examEngine.resumeSession(active);
      showView('examRoom');
      renderExamRoom();
      return;
    }

    // 2. Jika Proktor / Guru sedang login saat refresh, tetap pertahankan sesi & tab aktif
    if (window.cbtAdmin && window.cbtAdmin.isAuthenticated && window.cbtAdmin.getCurrentTeacher()) {
      showView('admin');
      const savedTab = localStorage.getItem('cbt_active_admin_tab');
      if (savedTab) {
        switchAdminTab(savedTab);
      }
      if (!window.cbtAdmin.isSuperAdminUser()) {
        syncFromCloud(false, { publicOnly: false });
      }
      return;
    }

    if (window.studentManager && typeof window.studentManager.scrubSensitiveDataForStudentMode === 'function') {
      window.studentManager.scrubSensitiveDataForStudentMode();
    }
    if (window.examEngine && typeof window.examEngine.enterStudentPrivacyMode === 'function') {
      window.examEngine.enterStudentPrivacyMode();
    }

    // 3. Jika siswa sedang di layar konfirmasi saat refresh, pertahankan layar konfirmasi
    try {
      const savedConfirm = localStorage.getItem('cbt_confirm_student');
      if (savedConfirm) {
        tempStudent = JSON.parse(savedConfirm);
        populateConfirmView(tempStudent);
        showView('confirm');
        syncFromCloud(false, { publicOnly: true });
        return;
      }
    } catch (e) {}

    showView('login');
    syncFromCloud(false, { publicOnly: true });

    // Shortcut URL ?admin / #admin / #guru untuk Proktor & Guru
    const hashLower = (window.location.hash || '').toLowerCase();
    const searchLower = (window.location.search || '').toLowerCase();
    if (hashLower.includes('admin') || hashLower.includes('guru') || searchLower.includes('admin') || searchLower.includes('guru')) {
      switchLoginPortalTab('admin');
      const inlineUserEl = document.getElementById('inlineAdminUsernameInput');
      if (inlineUserEl) inlineUserEl.focus();
    }
  }

  function applyCloudState(stateMap) {
    if (!stateMap || typeof stateMap !== 'object') return false;
    let changed = false;

    const isStaff = Boolean(window.cbtAdmin && window.cbtAdmin.isAuthenticated && window.cbtAdmin.getCurrentTeacher());
    const isSuperAdmin = Boolean(isStaff && window.cbtAdmin.isSuperAdminUser());

    if (stateMap.cbt_school_config && typeof stateMap.cbt_school_config === 'object' && window.cbtAdmin) {
      window.cbtAdmin.saveSchoolConfig(stateMap.cbt_school_config, true);
      changed = true;
    }
    if (isSuperAdmin && Array.isArray(stateMap.cbt_teachers_list) && stateMap.cbt_teachers_list.length > 0 && window.cbtAdmin) {
      window.cbtAdmin.saveTeachers(stateMap.cbt_teachers_list, true);
      changed = true;
    }
    if (isStaff && Array.isArray(stateMap.cbt_students_list) && stateMap.cbt_students_list.length > 0 && window.studentManager) {
      window.studentManager.saveStudents(stateMap.cbt_students_list, true);
      changed = true;
    }
    if (Array.isArray(stateMap.cbt_exam_schedules) && window.cbtAdmin) {
      window.cbtAdmin.saveSchedules(stateMap.cbt_exam_schedules, true);
      changed = true;
    }
    if (Array.isArray(stateMap.cbt_questions) && (stateMap.cbt_questions.length > 0 || stateMap.cbt_questions_migrated === true) && window.examEngine) {
      if (typeof window.examEngine.applyRemoteQuestions === 'function') {
        window.examEngine.applyRemoteQuestions(stateMap.cbt_questions);
      } else {
        window.examEngine.saveQuestions(stateMap.cbt_questions, true);
      }
      changed = true;
    }
    if (stateMap.cbt_config && typeof stateMap.cbt_config === 'object' && window.examEngine) {
      window.examEngine.saveConfig(stateMap.cbt_config, true);
      changed = true;
    }
    return changed;
  }

  let cloudSyncPromise = null;
  let cloudSyncPublicOnly = true;
  async function syncFromCloud(force = false, options = {}) {
    if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) return false;
    const isStaff = Boolean(window.cbtAdmin && window.cbtAdmin.isAuthenticated && window.cbtAdmin.getCurrentTeacher());
    const publicOnly = options && options.publicOnly !== undefined ? Boolean(options.publicOnly) : !isStaff;

    if (cloudSyncPromise && !force && !(cloudSyncPublicOnly && !publicOnly)) {
      return cloudSyncPromise;
    }

    cloudSyncPublicOnly = publicOnly;
    const myPromise = (async () => {
      const res = await window.supabaseSync.pullAllSchoolState({ publicOnly });
      if (res && res.success && res.state) {
        const hasCloudData = Object.keys(res.state).length > 0;
        if (hasCloudData) {
          applyCloudState(res.state);
          renderConfigInfoOnLogin();
          if (viewAdmin && !viewAdmin.classList.contains('hidden')) {
            renderAdminDashboard();
          }
          return true;
        }
      }
      return false;
    })();

    cloudSyncPromise = myPromise;
    try {
      return await myPromise;
    } finally {
      if (cloudSyncPromise === myPromise) {
        cloudSyncPromise = null;
      }
    }
  }

  let questionsCloudSyncPromise = null;
  let realtimeQuestionRefreshTimer = null;
  let realtimeQuestionPollTick = 0;

  function getQuestionsListSignature(list) {
    if (!Array.isArray(list)) return '[]';
    return JSON.stringify(list.map(q => [q && q.id, q && q.updatedAt || '', q && q.subject || '', q && q.question || '']));
  }

  async function syncQuestionsFromCloud(reRenderIfOpen = true, forceRender = false) {
    if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured() || !window.examEngine) return false;
    if (questionsCloudSyncPromise) return questionsCloudSyncPromise;

    questionsCloudSyncPromise = (async () => {
      try {
        await window.supabaseSync.flushPendingQuestionOps();
        const qRes = await window.supabaseSync.fetchAllQuestionRows();
        if (qRes && qRes.success && Array.isArray(qRes.rows)) {
          const canApply = qRes.rows.length > 0 || (
            typeof window.supabaseSync.isQuestionsMigrationCompleted === 'function' &&
            await window.supabaseSync.isQuestionsMigrationCompleted()
          );

          if (canApply) {
            const prevSig = getQuestionsListSignature(window.examEngine.questions);
            if (typeof window.examEngine.applyRemoteQuestions === 'function') {
              window.examEngine.applyRemoteQuestions(qRes.rows);
            } else {
              window.examEngine.saveQuestions(qRes.rows, true);
            }
            const nextSig = getQuestionsListSignature(window.examEngine.questions);
            const hasChanged = prevSig !== nextSig;

            if (reRenderIfOpen && (hasChanged || forceRender) && viewAdmin && !viewAdmin.classList.contains('hidden')) {
              const tabQ = document.getElementById('tabQuestions');
              if (tabQ && !tabQ.classList.contains('hidden')) {
                const prevSub = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
                const prevCls = document.getElementById('filterQuestionsClass')?.value || 'ALL';
                setupQuestionBankFilters();
                const subEl = document.getElementById('filterQuestionsSubject');
                const clsEl = document.getElementById('filterQuestionsClass');
                if (subEl && Array.from(subEl.options).some(o => o.value === prevSub)) subEl.value = prevSub;
                if (clsEl && Array.from(clsEl.options).some(o => o.value === prevCls)) clsEl.value = prevCls;
                renderAdminQuestionList();
              } else {
                renderAdminTeacherQuestionProgress();
              }
              renderAdminSchedulesList();
            }
            return true;
          }
        }
      } catch (e) {
        console.warn('Gagal sinkron soal per-baris:', e);
      } finally {
        maybeAutoSeedTeacherTrialBank();
      }
      return false;
    })();

    try {
      return await questionsCloudSyncPromise;
    } finally {
      questionsCloudSyncPromise = null;
    }
  }

  function maybeAutoSeedTeacherTrialBank() {
    try {
      if (!window.cbtAdmin || !window.cbtAdmin.isAuthenticated || !window.examEngine) return;
      if (typeof window.cbtAdmin.seedTrialQuestionsForTeachers !== 'function') return;
      if (localStorage.getItem('cbt_trial_seeded_v347') === '1') return;

      const curList = Array.isArray(window.examEngine.questions) ? window.examEngine.questions : [];
      const hasAnySubjectSpecific = curList.some(q => {
        const s = String(q?.subject || '').trim().toLowerCase();
        return s && s !== 'umum' && s !== '-';
      });

      if (hasAnySubjectSpecific) {
        localStorage.setItem('cbt_trial_seeded_v347', '1');
        return;
      }

      const res = window.cbtAdmin.seedTrialQuestionsForTeachers({ onlyMissingSubjects: true });
      localStorage.setItem('cbt_trial_seeded_v347', '1');

      if (res && res.addedCount > 0 && viewAdmin && !viewAdmin.classList.contains('hidden')) {
        setupQuestionBankFilters();
        renderAdminQuestionList();
        renderAdminTeacherQuestionProgress();
        renderAdminSchedulesList();
      }
    } catch (e) {}
  }

  function scheduleRealtimeQuestionRefresh() {
    if (realtimeQuestionRefreshTimer) clearTimeout(realtimeQuestionRefreshTimer);
    realtimeQuestionRefreshTimer = setTimeout(() => {
      realtimeQuestionRefreshTimer = null;
      syncQuestionsFromCloud(true);
    }, 650);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && viewLogin && !viewLogin.classList.contains('hidden')) {
      syncFromCloud(true, { publicOnly: true });
    } else if (!document.hidden && viewAdmin && !viewAdmin.classList.contains('hidden')) {
      syncQuestionsFromCloud(true);
    }
  });

  // ===================== UPLOAD FILE GAMBAR SOAL =====================
  function setupImageUploader() {
    const fileInput = document.getElementById('qInputFileImage');
    const btnTrigger = document.getElementById('btnTriggerUploadImage');
    const btnRemove = document.getElementById('btnRemoveImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreviewImg');

    if (btnTrigger && fileInput) {
      btnTrigger.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          alert("File yang dipilih harus berupa gambar (JPG, PNG, atau WEBP)!");
          return;
        }
        compressImageFile(file, 800, 0.82, false, (dataUrl) => {
          currentUploadedImageBase64 = dataUrl;
          if (previewImg && previewContainer) {
            previewImg.src = dataUrl;
            previewContainer.classList.remove('hidden');
          }
          if (btnRemove) btnRemove.classList.remove('hidden');
        });
      });
    }

    if (btnRemove) {
      btnRemove.addEventListener('click', () => {
        currentUploadedImageBase64 = "";
        if (fileInput) fileInput.value = "";
        if (previewContainer) previewContainer.classList.add('hidden');
        btnRemove.classList.add('hidden');
      });
    }
  }

  function compressImageFile(file, maxSize, quality, preservePng, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const isTransparentType = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml';
        const mime = preservePng && isTransparentType ? 'image/png' : 'image/jpeg';
        callback(canvas.toDataURL(mime, quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setImageUploaderPreview(dataUrl) {
    const fileInput = document.getElementById('qInputFileImage');
    const btnRemove = document.getElementById('btnRemoveImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreviewImg');

    if (fileInput) fileInput.value = "";
    if (dataUrl && String(dataUrl).trim() !== "") {
      currentUploadedImageBase64 = dataUrl;
      if (previewImg) previewImg.src = dataUrl;
      if (previewContainer) previewContainer.classList.remove('hidden');
      if (btnRemove) btnRemove.classList.remove('hidden');
    } else {
      currentUploadedImageBase64 = "";
      if (previewImg) previewImg.src = "";
      if (previewContainer) previewContainer.classList.add('hidden');
      if (btnRemove) btnRemove.classList.add('hidden');
    }
  }

  function resetImageUploader() {
    setImageUploaderPreview("");
  }

  // ===================== UPLOAD LOGO KOP KIRI, KANAN, & LOGO CBT =====================
  function persistQuickCbtLogo(dataUrl) {
    if (!window.cbtAdmin) return;
    const cfg = window.cbtAdmin.getSchoolConfig();
    cfg.logoCbt = dataUrl || "";
    window.cbtAdmin.saveSchoolConfig(cfg);
    applyCbtBrandLogo(cfg.logoCbt);
  }

  function setupSchoolLogoUploaders() {
    const leftFile = document.getElementById('cfgLogoLeftFile');
    const btnUploadLeft = document.getElementById('btnUploadLogoLeft');
    const btnRemoveLeft = document.getElementById('btnRemoveLogoLeft');

    const rightFile = document.getElementById('cfgLogoRightFile');
    const btnUploadRight = document.getElementById('btnUploadLogoRight');
    const btnRemoveRight = document.getElementById('btnRemoveLogoRight');

    const cbtFile = document.getElementById('cfgLogoCbtFile');
    const btnUploadCbt = document.getElementById('btnUploadLogoCbt');
    const btnRemoveCbt = document.getElementById('btnRemoveLogoCbt');

    if (btnUploadLeft && leftFile) {
      btnUploadLeft.addEventListener('click', () => leftFile.click());
      leftFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        compressImageFile(file, 320, 0.85, true, (dataUrl) => {
          currentLogoLeftBase64 = dataUrl;
          renderLogoPreview('left', dataUrl);
        });
      });
    }

    if (btnRemoveLeft) {
      btnRemoveLeft.addEventListener('click', () => {
        currentLogoLeftBase64 = "";
        if (leftFile) leftFile.value = "";
        renderLogoPreview('left', "");
      });
    }

    if (btnUploadRight && rightFile) {
      btnUploadRight.addEventListener('click', () => rightFile.click());
      rightFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        compressImageFile(file, 320, 0.85, true, (dataUrl) => {
          currentLogoRightBase64 = dataUrl;
          renderLogoPreview('right', dataUrl);
        });
      });
    }

    if (btnRemoveRight) {
      btnRemoveRight.addEventListener('click', () => {
        currentLogoRightBase64 = "";
        if (rightFile) rightFile.value = "";
        renderLogoPreview('right', "");
      });
    }

    if (btnUploadCbt && cbtFile) {
      btnUploadCbt.addEventListener('click', () => cbtFile.click());
      cbtFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        compressImageFile(file, 320, 0.9, true, (dataUrl) => {
          currentLogoCbtBase64 = dataUrl;
          renderLogoPreview('cbt', dataUrl);
          persistQuickCbtLogo(dataUrl);
        });
      });
    }

    if (btnRemoveCbt) {
      btnRemoveCbt.addEventListener('click', () => {
        currentLogoCbtBase64 = "";
        if (cbtFile) cbtFile.value = "";
        renderLogoPreview('cbt', "");
        persistQuickCbtLogo("");
      });
    }
  }

  function renderLogoPreview(side, dataUrl) {
    const boxId = side === 'left'
      ? 'previewLogoLeftBox'
      : side === 'right'
        ? 'previewLogoRightBox'
        : 'previewLogoCbtBox';
    const removeBtnId = side === 'left'
      ? 'btnRemoveLogoLeft'
      : side === 'right'
        ? 'btnRemoveLogoRight'
        : 'btnRemoveLogoCbt';

    const box = document.getElementById(boxId);
    const removeBtn = document.getElementById(removeBtnId);
    if (!box) return;

    if (dataUrl) {
      box.innerHTML = `<img src="${dataUrl}" alt="Logo ${side}" class="w-full h-full object-contain p-0.5">`;
      if (removeBtn) removeBtn.classList.remove('hidden');
    } else {
      if (side === 'cbt') {
        box.innerHTML = `<span class="text-[10px] font-black text-blue-700">CBT</span>`;
      } else {
        box.innerHTML = `<span class="text-[9px] font-bold text-slate-400">${side === 'left' ? 'DINAS' : 'SMP'}</span>`;
      }
      if (removeBtn) removeBtn.classList.add('hidden');
    }
  }

  function applyCbtBrandLogo(logoUrl) {
    const headerLogoEl = document.getElementById('headerLogoBox');
    const loginLogoEl = document.getElementById('loginLogoBox');

    if (headerLogoEl) {
      if (logoUrl) {
        headerLogoEl.className = "w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-xs flex-shrink-0 overflow-hidden p-0.5";
        headerLogoEl.innerHTML = `<img src="${logoUrl}" alt="Logo CBT" class="w-full h-full object-contain">`;
      } else {
        headerLogoEl.className = "w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-black text-base sm:text-lg shadow-md flex-shrink-0 overflow-hidden";
        headerLogoEl.innerText = "CBT";
      }
    }

    if (loginLogoEl) {
      if (logoUrl) {
        loginLogoEl.className = "w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white p-1 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-md";
        loginLogoEl.innerHTML = `<img src="${logoUrl}" alt="Logo CBT" class="w-full h-full object-contain">`;
      } else {
        loginLogoEl.className = "w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-white flex-shrink-0 overflow-hidden shadow-inner";
        loginLogoEl.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>`;
      }
    }

    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
      link.href = logoUrl || 'icons/icon.svg';
    });
  }

  // ===================== NONAKTIFKAN BANNER INSTALASI DI TAMPILAN SISWA =====================
  function setupPwaPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
    });
  }

  function setupPrivacyShieldListeners() {
    if (btnResumeFromPrivacyShield) {
      btnResumeFromPrivacyShield.addEventListener('click', () => {
        if (examPrivacyShield) examPrivacyShield.classList.add('hidden');
        try {
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
          }
        } catch (err) {}
        if (window.examEngine) window.examEngine.acquireScreenLock();
      });
    }
  }

  // ===================== DARK MODE (MODE GELAP NYAMAN DI MATA) =====================
  function applyDarkModeState(isDark) {
    const htmlEl = document.documentElement;
    if (isDark) htmlEl.classList.add('dark');
    else htmlEl.classList.remove('dark');

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', isDark ? '#070817' : '#2563eb');

    const sunSvg = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>';
    const moonSvg = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>';

    const iconHeader = document.getElementById('darkModeIconHeader');
    const labelHeader = document.getElementById('darkModeLabelHeader');
    const iconLogin = document.getElementById('darkModeIconLogin');
    const labelLogin = document.getElementById('darkModeLabelLogin');

    if (iconHeader) iconHeader.innerHTML = isDark ? sunSvg : moonSvg;
    if (labelHeader) labelHeader.innerText = isDark ? 'Mode Terang' : 'Mode Gelap';
    if (iconLogin) iconLogin.innerHTML = isDark ? sunSvg : moonSvg;
    if (labelLogin) labelLogin.innerText = isDark ? 'Terang' : 'Gelap';

    if (typeof refreshVisibleD3Charts === 'function') {
      refreshVisibleD3Charts();
    }
  }

  function setupDarkMode() {
    let isDark = false;
    try {
      isDark = localStorage.getItem('cbt_dark_mode') === 'dark';
    } catch (e) {}
    applyDarkModeState(isDark);

    const toggleTheme = () => {
      const nextDark = !document.documentElement.classList.contains('dark');
      try {
        localStorage.setItem('cbt_dark_mode', nextDark ? 'dark' : 'light');
      } catch (e) {}
      applyDarkModeState(nextDark);
    };

    const btnHeader = document.getElementById('btnDarkModeHeader');
    const btnLogin = document.getElementById('btnDarkModeLogin');
    if (btnHeader) btnHeader.addEventListener('click', toggleTheme);
    if (btnLogin) btnLogin.addEventListener('click', toggleTheme);
  }

  // ===================== SHORTCUT KEYBOARD =====================
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (!window.examEngine.isExamActive || viewExamRoom.classList.contains('hidden')) return;

      const q = window.examEngine.getCurrentQuestion();
      if (!q) return;

      const key = e.key.toUpperCase();
      const type = q.type || 'single';
      const selectedOptionKey = ['A', 'B', 'C', 'D'].includes(key) ? key : null;

      if (selectedOptionKey) {
        if (type === 'single') {
          e.preventDefault();
          window.examEngine.selectSingleAnswer(selectedOptionKey);
          window.examEngine.syncLiveStudentProgress(false);
          renderExamRoom();
          renderQuestionPalette();
        } else if (type === 'multiple') {
          e.preventDefault();
          window.examEngine.toggleMultipleAnswer(selectedOptionKey);
          window.examEngine.syncLiveStudentProgress(false);
          renderExamRoom();
          renderQuestionPalette();
        }
      }

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (window.examEngine.prevQuestion()) renderExamRoom();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        const isLast = window.examEngine.currentQuestionIndex === window.examEngine.getExamQuestions().length - 1;
        if (!isLast) {
          window.examEngine.nextQuestion();
          renderExamRoom();
        }
      }

      if (key === 'R') {
        e.preventDefault();
        window.examEngine.toggleDoubt();
        renderExamRoom();
        renderQuestionPalette();
      }
    });
  }

  function showLoginRejection(msg, isInfo = false) {
    const banner = document.getElementById('loginRejectionBanner');
    if (!banner) return;
    if (msg) {
      banner.className = isInfo
        ? 'p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 leading-relaxed font-medium'
        : 'p-3 rounded-xl bg-red-50 border border-red-300 text-xs text-red-800 leading-relaxed font-medium';
      banner.innerText = msg;
    } else {
      banner.innerText = '';
      banner.classList.add('hidden');
    }
  }

  function showInlineAdminBanner(msg, isInfo = false) {
    const banner = document.getElementById('inlineAdminErrorBanner');
    if (!banner) return;
    if (msg) {
      banner.className = isInfo
        ? 'p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 leading-relaxed font-medium'
        : 'p-3 rounded-xl bg-red-50 border border-red-300 text-xs text-red-800 leading-relaxed font-medium';
      banner.innerText = msg;
    } else {
      banner.innerText = '';
      banner.classList.add('hidden');
    }
  }

  function switchLoginPortalTab(role) {
    const tabStudent = document.getElementById('tabLoginStudent');
    const tabAdmin = document.getElementById('tabLoginAdmin');
    const formStudent = document.getElementById('studentLoginForm');
    const formAdmin = document.getElementById('inlineAdminLoginForm');
    const roleSubtitle = document.getElementById('loginRoleSubtitle');

    showLoginRejection('');
    showInlineAdminBanner('');

    const activeCls = 'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer bg-[#0066eb] text-white shadow-md shadow-blue-600/20';
    const inactiveCls = 'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';

    if (role === 'admin') {
      if (tabAdmin) tabAdmin.className = activeCls;
      if (tabStudent) tabStudent.className = inactiveCls;
      if (formStudent) formStudent.classList.add('hidden');
      if (formAdmin) formAdmin.classList.remove('hidden');
      if (roleSubtitle) roleSubtitle.innerText = 'Masuk ke panel Proktor & Guru Mata Pelajaran';
    } else {
      if (tabStudent) tabStudent.className = activeCls;
      if (tabAdmin) tabAdmin.className = inactiveCls;
      if (formAdmin) formAdmin.classList.add('hidden');
      if (formStudent) formStudent.classList.remove('hidden');
      if (roleSubtitle) roleSubtitle.innerText = 'Masuk ke akun Anda untuk melanjutkan ujian';
    }
  }

  function wirePasswordEyeToggle(buttonId, inputId) {
    const btn = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    const eyeSlashSvg = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>';
    const eyeOpenSvg = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';

    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = showing ? eyeSlashSvg : eyeOpenSvg;
      btn.setAttribute('aria-label', showing ? 'Tampilkan kata sandi' : 'Sembunyikan kata sandi');
    });
  }

  function setupLoginPortalControls() {
    const tabStudent = document.getElementById('tabLoginStudent');
    const tabAdmin = document.getElementById('tabLoginAdmin');
    if (tabStudent) tabStudent.addEventListener('click', () => switchLoginPortalTab('student'));
    if (tabAdmin) {
      tabAdmin.addEventListener('click', () => {
        if (window.cbtAdmin && window.cbtAdmin.isAuthenticated && window.cbtAdmin.getCurrentTeacher()) {
          showView('admin');
          return;
        }
        switchLoginPortalTab('admin');
      });
    }

    wirePasswordEyeToggle('btnToggleStudentPass', 'studentPassword');
    wirePasswordEyeToggle('btnToggleInlineAdminPin', 'inlineAdminPinInput');

    const nisnInput = document.getElementById('studentNisn');
    const chkRememberStudent = document.getElementById('chkRememberStudent');
    try {
      const rememberedNisn = localStorage.getItem('cbt_remember_student_nisn');
      if (rememberedNisn && nisnInput) {
        nisnInput.value = rememberedNisn;
        nisnInput.dispatchEvent(new Event('input'));
        if (chkRememberStudent) chkRememberStudent.checked = true;
      }
    } catch (e) {}

    const adminUserInput = document.getElementById('inlineAdminUsernameInput');
    const chkRememberAdmin = document.getElementById('chkRememberAdmin');
    try {
      const rememberedAdmin = localStorage.getItem('cbt_remember_admin_username');
      if (rememberedAdmin && adminUserInput) {
        adminUserInput.value = rememberedAdmin;
        if (chkRememberAdmin) chkRememberAdmin.checked = true;
      }
    } catch (e) {}

    const btnForgotStudent = document.getElementById('btnForgotStudentPass');
    if (btnForgotStudent) {
      btnForgotStudent.addEventListener('click', () => {
        showLoginRejection('Hubungi Proktor atau Panitia Ujian sekolah untuk mengecek atau mereset kata sandi akun siswa Anda.', true);
      });
    }

    const btnForgotAdmin = document.getElementById('btnForgotAdminPass');
    if (btnForgotAdmin) {
      btnForgotAdmin.addEventListener('click', () => {
        showInlineAdminBanner('Guru Mapel dapat meminta reset PIN ke Proktor Utama melalui tab Data Guru. Proktor Utama dapat melihat/mengubah PIN di tab Pengaturan.', true);
      });
    }

    const inlineAdminForm = document.getElementById('inlineAdminLoginForm');
    if (inlineAdminForm) {
      inlineAdminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showInlineAdminBanner('');
        const pinInput = document.getElementById('inlineAdminPinInput');
        const identifier = adminUserInput ? adminUserInput.value.trim() : '';
        const pin = pinInput ? pinInput.value.trim() : '';

        if (!identifier || !pin) {
          showInlineAdminBanner('Harap masukkan Username / NIP dan Kata Sandi (PIN)!');
          return;
        }

        const loginRes = await window.cbtAdmin.loginWithCloud(identifier, pin);

        if (loginRes && loginRes.success) {
          try {
            if (chkRememberAdmin && chkRememberAdmin.checked) {
              localStorage.setItem('cbt_remember_admin_username', identifier);
            } else {
              localStorage.removeItem('cbt_remember_admin_username');
            }
          } catch (err) {}
          if (pinInput) pinInput.value = '';
          showView('admin');
          if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
            syncFromCloud(true, { publicOnly: false })
              .then(() => typeof window.supabaseSync.fetchCloudResults === 'function' ? window.supabaseSync.fetchCloudResults() : null)
              .then(() => {
                if (viewAdmin && !viewAdmin.classList.contains('hidden')) renderAdminDashboard();
              })
              .catch(() => {});
          }
        } else {
          showInlineAdminBanner((loginRes && loginRes.message) || 'Username / NIP atau Kata Sandi (PIN) tidak sesuai!');
        }
      });
    }
  }

  function updateLoginDisplayForSchedule(sched) {
    const tokenHintEl = document.getElementById('loginTokenHint');
    const scheduleBadgeEl = document.getElementById('loginScheduleBadge');
    const scheduleTextEl = document.getElementById('loginScheduleText');
    const cfg = window.examEngine.config;

    const targetToken = sched ? (sched.token || cfg.examToken) : cfg.examToken;
    const targetDay = sched ? sched.day : cfg.scheduleDay;
    const targetDate = sched ? (sched.dateFormatted || (window.cbtAdmin ? window.cbtAdmin.formatIndonesianDate(sched.dateIso) : '')) : cfg.scheduleDate;
    const targetTime = sched ? (sched.timeRange || '') : cfg.scheduleTime;

    if (scheduleBadgeEl && scheduleTextEl) {
      const activeList = window.cbtAdmin ? window.cbtAdmin.getActiveSchedules() : [];
      if (activeList.length > 1 && sched) {
        const datePart = [targetDay, targetDate].filter(Boolean).join(', ');
        const timePart = targetTime ? ` • ${targetTime}` : '';
        scheduleTextEl.innerText = `${activeList.length} Jadwal Aktif Serentak${datePart ? ` (${datePart}${timePart})` : ''}`;
        scheduleBadgeEl.classList.remove('hidden');
      } else if (targetDay || targetDate) {
        const datePart = [targetDay, targetDate].filter(Boolean).join(', ');
        const timePart = targetTime ? ` • Pukul ${targetTime}` : '';
        scheduleTextEl.innerText = `Jadwal Aktif: ${datePart}${timePart}`;
        scheduleBadgeEl.classList.remove('hidden');
      } else {
        scheduleBadgeEl.classList.add('hidden');
      }
    }

    if (tokenHintEl) {
      const span = tokenHintEl.querySelector('span');
      const hintText = 'Token Ujian dibagikan oleh Pengawas Ruang / Proktor';
      if (span) span.innerText = hintText;
      else tokenHintEl.innerText = hintText;
    }
  }

  function renderConfigInfoOnLogin() {
    const titleEl = document.getElementById('loginExamTitle');
    const headerSchoolEl = document.getElementById('headerSchoolName');
    const loginSchoolEl = document.getElementById('loginSchoolName');
    const selectGroup = document.getElementById('loginScheduleSelectGroup');
    const selectEl = document.getElementById('studentScheduleSelect');

    const schoolCfg = window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : { schoolName: 'SMP NEGERI 2 PACET', logoCbt: '' };
    if (headerSchoolEl) headerSchoolEl.innerText = schoolCfg.schoolName || 'SMP NEGERI 2 PACET';
    if (loginSchoolEl) loginSchoolEl.innerText = schoolCfg.schoolName || 'SMP NEGERI 2 PACET';
    applyCbtBrandLogo(schoolCfg.logoCbt || '');

    const cfg = window.examEngine.config;
    if (titleEl) {
      const titleText = cfg.examTitle || 'Asesmen Sumatif Akhir Semester I';
      titleEl.innerText = titleText;
      if (titleText.length > 38) {
        titleEl.classList.remove('whitespace-nowrap');
      } else {
        titleEl.classList.add('whitespace-nowrap');
      }
    }

    const activeList = window.cbtAdmin ? window.cbtAdmin.getActiveSchedules() : [];
    if (selectGroup && selectEl) {
      const prevSelectedId = selectEl.value;
      selectEl.innerHTML = '';

      if (activeList.length > 1) {
        activeList.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.innerText = `${s.subject} (${s.classLevel || 'Semua Kelas'})`;
          selectEl.appendChild(opt);
        });
        if (prevSelectedId && activeList.some(s => s.id === prevSelectedId)) {
          selectEl.value = prevSelectedId;
        }
        selectGroup.classList.remove('hidden');
        selectEl.onchange = () => {
          const picked = activeList.find(s => s.id === selectEl.value) || activeList[0];
          updateLoginDisplayForSchedule(picked);
        };
      } else {
        selectGroup.classList.add('hidden');
      }
    }

    const picked = activeList.length > 1 && selectEl
      ? (activeList.find(s => s.id === selectEl.value) || activeList[0])
      : (activeList.length === 1 ? activeList[0] : null);

    updateLoginDisplayForSchedule(picked);
  }

  function showView(viewName) {
    [viewLogin, viewExamConfirm, viewExamRoom, viewResult, viewAdmin].forEach(v => {
      if (v) v.classList.add('hidden');
    });

    const topHeader = document.getElementById('appTopHeader');
    if (topHeader) {
      if (viewName === 'login') topHeader.classList.add('hidden');
      else topHeader.classList.remove('hidden');
    }

    if (viewName !== 'admin') {
      stopMonitoringAutoRefresh();
      stopAdminRealtimeNotifications();
    }

    if (viewName === 'login') {
      showLoginRejection('');
      showInlineAdminBanner('');
      renderConfigInfoOnLogin();
      viewLogin.classList.remove('hidden');
    } else if (viewName === 'confirm') {
      viewExamConfirm.classList.remove('hidden');
    } else if (viewName === 'examRoom') {
      viewExamRoom.classList.remove('hidden');
    } else if (viewName === 'result') {
      viewResult.classList.remove('hidden');
    } else if (viewName === 'admin') {
      viewAdmin.classList.remove('hidden');
      renderAdminDashboard();
      startAdminRealtimeNotifications();
      syncQuestionsFromCloud(true);
    }

    updateCloudBadge();
  }

  // ===================== AUTODETEKSI NISN SISWA =====================
  function setupStudentNisnDetection() {
    const studentNisnInput = document.getElementById('studentNisn');
    const studentFoundHint = document.getElementById('studentFoundHint');
    const studentFoundName = document.getElementById('studentFoundName');
    const studentFoundClass = document.getElementById('studentFoundClass');

    if (studentNisnInput) {
      let lookupTimer = null;
      const applyHintResult = (student) => {
        if (student) {
          if (studentFoundName) studentFoundName.innerText = student.name;
          if (studentFoundClass) studentFoundClass.innerText = `Kelas ${student.class}`;
          if (studentFoundHint) studentFoundHint.classList.remove('hidden');

          const activeList = window.cbtAdmin ? window.cbtAdmin.getActiveSchedules() : [];
          const selectEl = document.getElementById('studentScheduleSelect');
          if (activeList.length > 1 && selectEl && window.examEngine) {
            const matchingSch = activeList.find(s => window.examEngine.matchesClassLevel(s.classLevel || 'Semua Kelas', student.class));
            if (matchingSch) {
              selectEl.value = matchingSch.id;
              updateLoginDisplayForSchedule(matchingSch);
            }
          }
        } else {
          if (studentFoundHint) studentFoundHint.classList.add('hidden');
        }
      };

      studentNisnInput.addEventListener('input', () => {
        showLoginRejection('');
        if (lookupTimer) clearTimeout(lookupTimer);
        const nisn = studentNisnInput.value.trim();
        if (nisn.length < 4 || !window.studentManager) {
          if (studentFoundHint) studentFoundHint.classList.add('hidden');
          return;
        }
        const immediate = window.studentManager.getStudentByNisn(nisn);
        if (immediate) {
          applyHintResult(immediate);
          return;
        }
        lookupTimer = setTimeout(async () => {
          if (studentNisnInput.value.trim() !== nisn) return;
          if (typeof window.studentManager.lookupStudentHintWithCloud === 'function') {
            const hintRes = await window.studentManager.lookupStudentHintWithCloud(nisn);
            if (studentNisnInput.value.trim() !== nisn) return;
            applyHintResult(hintRes && hintRes.found ? hintRes : null);
          } else {
            applyHintResult(null);
          }
        }, 250);
      });
    }
  }

  function populateConfirmView(student) {
    if (!student) return;
    const cfg = (student && student.examConfig) ? student.examConfig : window.examEngine.config;
    const classPart = cfg.targetClass && cfg.targetClass !== 'Semua Kelas' ? ` (${cfg.targetClass})` : '';

    document.getElementById('confirmName').innerText = student.name;
    document.getElementById('confirmNisn').innerText = student.nisn;
    document.getElementById('confirmClass').innerText = `Kelas ${student.class}`;
    document.getElementById('confirmSubject').innerText = `${cfg.subject}${classPart}`;
    document.getElementById('confirmDuration').innerText = `${cfg.durationMinutes} Menit`;
    const confirmQs = window.examEngine.getQuestionsForExam(cfg.subject, student.class || cfg.targetClass);
    document.getElementById('confirmQuestionsCount').innerText = `${confirmQs.questions.length} Butir Soal`;

    const confirmScheduleRow = document.getElementById('confirmScheduleRow');
    const confirmScheduleEl = document.getElementById('confirmSchedule');
    if (confirmScheduleRow && confirmScheduleEl) {
      if (cfg.scheduleDay || cfg.scheduleDate) {
        const datePart = [cfg.scheduleDay, cfg.scheduleDate].filter(Boolean).join(', ');
        const timePart = cfg.scheduleTime ? ` (${cfg.scheduleTime})` : '';
        confirmScheduleEl.innerText = `${datePart}${timePart}`;
        confirmScheduleRow.classList.remove('hidden');
      } else {
        confirmScheduleRow.classList.add('hidden');
      }
    }
  }

  // ===================== LOGIN SISWA =====================
  const studentLoginForm = document.getElementById('studentLoginForm');
  if (studentLoginForm) {
    studentLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      showLoginRejection('');
      const nisn = document.getElementById('studentNisn').value.trim();
      const password = document.getElementById('studentPassword').value.trim();
      const token = document.getElementById('studentToken').value.trim().toUpperCase();

      if (!nisn || !password) {
        showLoginRejection("Harap lengkapi NISN dan kata sandi!");
        return;
      }

      if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
        const activeTokens = (window.cbtAdmin ? window.cbtAdmin.getActiveSchedules() : []).map(s => String(s.token || '').toUpperCase());
        const cfgToken = String(window.examEngine.config.examToken || '').toUpperCase();
        const needsRefresh = Boolean(token && token !== cfgToken && !activeTokens.includes(token));
        if (cloudSyncPromise) {
          await cloudSyncPromise;
        } else if (needsRefresh) {
          await syncFromCloud(true, { publicOnly: true });
        }
      }

      if (nisn.toLowerCase() === 'admin' || nisn.toLowerCase().includes('proktor')) {
        const adminRes = await window.cbtAdmin.loginWithCloud('admin', password);
        if (adminRes && adminRes.success) {
          showView('admin');
          if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
            syncFromCloud(true, { publicOnly: false })
              .then(() => typeof window.supabaseSync.fetchCloudResults === 'function' ? window.supabaseSync.fetchCloudResults() : null)
              .then(() => {
                if (viewAdmin && !viewAdmin.classList.contains('hidden')) renderAdminDashboard();
              })
              .catch(() => {});
          }
          return;
        } else {
          switchLoginPortalTab('admin');
          const inlineUser = document.getElementById('inlineAdminUsernameInput');
          const inlinePin = document.getElementById('inlineAdminPinInput');
          if (inlineUser) inlineUser.value = 'admin';
          if (inlinePin) {
            inlinePin.value = password;
            inlinePin.focus();
          }
          showInlineAdminBanner('Silakan login melalui tab Admin / Guru di atas dengan PIN Proktor Anda.', true);
          return;
        }
      }

      if (!token) {
        showLoginRejection("Harap masukkan Token Ujian!");
        return;
      }

      let authenticatedStudent = null;
      if (window.studentManager) {
        const auth = typeof window.studentManager.authenticateStudentWithCloud === 'function'
          ? await window.studentManager.authenticateStudentWithCloud(nisn, password)
          : window.studentManager.authenticateStudent(nisn, password);
        if (!auth.success) {
          showLoginRejection(auth.message);
          return;
        }
        authenticatedStudent = auth.student;
      } else {
        authenticatedStudent = { nisn, name: "Siswa Peserta", class: "Umum" };
      }

      const activeSchedules = window.cbtAdmin ? window.cbtAdmin.getActiveSchedules() : [];
      const selectEl = document.getElementById('studentScheduleSelect');
      const selectedScheduleId = selectEl ? selectEl.value : '';
      let matchedSchedule = null;

      if (activeSchedules.length > 0) {
        const selectedSchObj = activeSchedules.find(s => s.id === selectedScheduleId) || activeSchedules[0];
        if (selectedSchObj && String(selectedSchObj.token || '').trim().toUpperCase() === token) {
          matchedSchedule = selectedSchObj;
        } else {
          const tokenMatches = activeSchedules.filter(s => String(s.token || '').trim().toUpperCase() === token);
          if (tokenMatches.length === 1) {
            matchedSchedule = tokenMatches[0];
          } else if (tokenMatches.length > 1) {
            matchedSchedule = tokenMatches.find(s => window.examEngine.matchesClassLevel(s.classLevel || 'Semua Kelas', authenticatedStudent.class)) || tokenMatches[0];
          }
        }

        if (!matchedSchedule) {
          showLoginRejection(`Token ujian "${token}" tidak cocok dengan jadwal ujian (${selectedSchObj?.subject || '-'}). Periksa kembali atau tanyakan kepada Pengawas Ruang!`);
          return;
        }

        if (matchedSchedule.classLevel && !window.examEngine.matchesClassLevel(matchedSchedule.classLevel, authenticatedStudent.class)) {
          const msg = `⛔ Ujian Ditolak: Jadwal "${matchedSchedule.subject}" (${matchedSchedule.classLevel}) bukan untuk Kelas ${authenticatedStudent.class}. Pilih mata pelajaran lain yang sesuai kelas Anda.`;
          showLoginRejection(msg);
          return;
        }
      } else {
        const validToken = window.examEngine.config.examToken.toUpperCase();
        if (token !== validToken) {
          showLoginRejection('Token ujian salah! Periksa kembali atau tanyakan kepada Pengawas Ruang / Proktor.');
          return;
        }
        if (window.examEngine.config.targetClass && !window.examEngine.matchesClassLevel(window.examEngine.config.targetClass, authenticatedStudent.class)) {
          const msg = `⛔ Ujian Ditolak: Ujian "${window.examEngine.config.subject}" saat ini dikhususkan untuk ${window.examEngine.config.targetClass}.`;
          showLoginRejection(msg);
          return;
        }
      }

      const targetExamConfig = matchedSchedule ? {
        examTitle: window.examEngine.config.examTitle,
        subject: matchedSchedule.subject,
        targetClass: matchedSchedule.classLevel || 'Semua Kelas',
        scheduleDay: matchedSchedule.day,
        scheduleDate: matchedSchedule.dateFormatted || (window.cbtAdmin ? window.cbtAdmin.formatIndonesianDate(matchedSchedule.dateIso) : ''),
        scheduleTime: matchedSchedule.timeRange || '',
        durationMinutes: matchedSchedule.durationMinutes || 80,
        examToken: matchedSchedule.token || window.examEngine.config.examToken,
        activeScheduleId: matchedSchedule.id,
        maxAttempts: matchedSchedule.maxAttempts || 1
      } : {
        ...window.examEngine.config
      };

      if (window.supabaseSync && window.supabaseSync.isCloudConfigured() && typeof window.supabaseSync.checkActiveDeviceSessionConflict === 'function') {
        const devConflict = await window.supabaseSync.checkActiveDeviceSessionConflict(
          authenticatedStudent.nisn,
          targetExamConfig.subject,
          window.examEngine.getDeviceId()
        );
        if (devConflict && devConflict.conflict) {
          showLoginRejection(`⛔ Login Ditolak: Akun NISN ${authenticatedStudent.nisn} (${authenticatedStudent.name}) sedang aktif mengerjakan ujian "${targetExamConfig.subject}" di perangkat lain. Hubungi Proktor untuk reset sesi jika perangkat sebelumnya bermasalah.`);
          return;
        }
      }

      const maxAttempts = window.examEngine.getMaxAttemptsForSubject(targetExamConfig.subject, matchedSchedule);
      const attemptStats = await window.examEngine.getStudentAttemptStats(authenticatedStudent.nisn, targetExamConfig.subject);

      if (attemptStats.count >= maxAttempts) {
        const rejectMsg = `⛔ Ujian Ditolak: Anda (${authenticatedStudent.name}) sudah menyelesaikan ujian mata pelajaran "${targetExamConfig.subject}" sebanyak ${attemptStats.count} kali (batas maksimal: ${maxAttempts} kali). Hubungi Proktor atau Guru Mapel jika memerlukan izin mengulang.`;
        showLoginRejection(rejectMsg);
        return;
      }

      tempStudent = {
        name: authenticatedStudent.name,
        nisn: authenticatedStudent.nisn,
        class: authenticatedStudent.class,
        token: token,
        attemptNumber: attemptStats.count + 1,
        maxAttempts: maxAttempts,
        examConfig: targetExamConfig
      };

      if (window.studentManager && typeof window.studentManager.scrubSensitiveDataForStudentMode === 'function') {
        window.studentManager.scrubSensitiveDataForStudentMode();
      }

      try {
        localStorage.setItem('cbt_confirm_student', JSON.stringify(tempStudent));
        const chkRememberStudent = document.getElementById('chkRememberStudent');
        if (chkRememberStudent && chkRememberStudent.checked) {
          localStorage.setItem('cbt_remember_student_nisn', nisn);
        } else {
          localStorage.removeItem('cbt_remember_student_nisn');
        }
      } catch (err) {}

      if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
        // Pastikan bank soal terbaru ditarik dari Cloud sebelum siswa masuk ruang ujian (batas tunggu aman 3,5 detik)
        await Promise.race([
          syncQuestionsFromCloud(false),
          new Promise(resolve => setTimeout(resolve, 3500))
        ]);
      }

      if (window.supabaseSync) {
        const qCount = window.examEngine.getQuestionsForExam(targetExamConfig.subject, authenticatedStudent.class || targetExamConfig.targetClass).questions.length;
        window.supabaseSync.upsertStudentSession({
          nisn: authenticatedStudent.nisn,
          name: authenticatedStudent.name,
          class: authenticatedStudent.class,
          subject: targetExamConfig.subject,
          status: 'logged_in',
          attemptNumber: tempStudent.attemptNumber,
          answeredCount: 0,
          totalQuestions: qCount,
          remainingSeconds: (targetExamConfig.durationMinutes || 80) * 60,
          cheatCount: 0,
          deviceId: window.examEngine.getDeviceId(),
          loginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      populateConfirmView(tempStudent);
      showView('confirm');
    });
  }

  const btnCancelConfirm = document.getElementById('btnCancelConfirm');
  if (btnCancelConfirm) {
    btnCancelConfirm.addEventListener('click', () => {
      openLogoutConfirmModal('student_confirm', () => {
        if (tempStudent && window.supabaseSync) {
          const sub = (tempStudent.examConfig && tempStudent.examConfig.subject) || window.examEngine.config.subject;
          window.supabaseSync.removeStudentSession(tempStudent.nisn, sub);
        }
        tempStudent = null;
        try { localStorage.removeItem('cbt_confirm_student'); } catch (e) {}
        showView('login');
      });
    });
  }

  const btnStartExam = document.getElementById('btnStartExam');
  if (btnStartExam) {
    btnStartExam.addEventListener('click', () => {
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        }
      } catch (err) {}

      const studentToStart = tempStudent;
      const overrideCfg = studentToStart && studentToStart.examConfig ? studentToStart.examConfig : null;
      try { localStorage.removeItem('cbt_confirm_student'); } catch (e) {}
      window.examEngine.startExam(studentToStart, overrideCfg);
      showView('examRoom');
      renderExamRoom();
    });
  }

  // ===================== EXAM ROOM =====================
  function renderExamRoom() {
    const q = window.examEngine.getCurrentQuestion();
    if (!q) return;

    const type = q.type || 'single';

    const activeQs = window.examEngine.getExamQuestions();
    const activeExamCfg = window.examEngine.getActiveExamConfig();
    document.getElementById('examSubjectHeader').innerText = activeExamCfg.subject;
    document.getElementById('examStudentNameHeader').innerText = window.examEngine.student?.name || 'Peserta';
    document.getElementById('currentQuestionNumberBadge').innerText = `Soal No. ${window.examEngine.currentQuestionIndex + 1} dari ${activeQs.length}`;

    const typeBadge = document.getElementById('questionTypeBadge');
    if (typeBadge) {
      if (type === 'multiple') {
        typeBadge.innerText = "PG Kompleks (Jawaban > 1)";
        typeBadge.className = "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-purple-100 text-purple-700";
      } else if (type === 'true_false') {
        typeBadge.innerText = "Benar / Salah";
        typeBadge.className = "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-amber-100 text-amber-800";
      } else {
        typeBadge.innerText = "Pilihan Ganda";
        typeBadge.className = "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-blue-100 text-blue-700";
      }
    }

    document.getElementById('questionText').innerText = q.question;

    const qImageContainer = document.getElementById('questionImageContainer');
    const qImageEl = document.getElementById('questionImage');
    if (q.image && q.image.trim() !== "") {
      qImageEl.src = q.image;
      qImageContainer.classList.remove('hidden');
    } else {
      qImageContainer.classList.add('hidden');
    }

    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';

    const currentAnswerData = window.examEngine.answers[q.id]?.answer;

    if (type === 'single') {
      q.options.forEach(opt => {
        const isSelected = currentAnswerData === opt.key;
        const optEl = document.createElement('div');
        optEl.className = `option-label cursor-pointer flex items-center p-3 sm:p-4 rounded-2xl border-2 transition-all ${
          isSelected
            ? 'selected border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-100 shadow-xs'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`;
        optEl.innerHTML = `
          <div class="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl font-bold text-xs sm:text-sm mr-3 transition-colors flex-shrink-0 ${
            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
          }">${opt.key}</div>
          <div class="text-xs sm:text-base font-medium flex-1 text-slate-800 dark:text-slate-100">${opt.text}</div>
          <span class="hidden md:inline-flex kbd-hint ml-2">${opt.key}</span>
        `;
        optEl.addEventListener('click', () => {
          window.examEngine.selectSingleAnswer(opt.key);
          window.examEngine.syncLiveStudentProgress(false);
          renderExamRoom();
          renderQuestionPalette();
        });
        optionsContainer.appendChild(optEl);
      });

    } else if (type === 'multiple') {
      const selectedArr = Array.isArray(currentAnswerData) ? currentAnswerData : [];

      const hintEl = document.createElement('div');
      hintEl.className = "text-[11px] sm:text-xs font-bold text-purple-700 dark:text-purple-200 bg-purple-50 dark:bg-purple-950/50 p-2.5 rounded-xl border border-purple-200 dark:border-purple-800/60 mb-2 flex items-center gap-1.5";
      hintEl.innerHTML = `
        <svg class="w-3.5 h-3.5 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span>Pilihlah satu atau lebih opsi yang benar!</span>
      `;
      optionsContainer.appendChild(hintEl);

      q.options.forEach(opt => {
        const isChecked = selectedArr.includes(opt.key);
        const optEl = document.createElement('div');
        optEl.className = `option-label cursor-pointer flex items-center p-3 sm:p-4 rounded-2xl border-2 transition-all ${
          isChecked
            ? 'selected border-purple-600 bg-purple-50 text-purple-950 dark:bg-purple-950/60 dark:border-purple-500 dark:text-purple-100 shadow-xs'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`;
        optEl.innerHTML = `
          <div class="w-8 h-8 flex items-center justify-center rounded-lg font-bold text-xs sm:text-sm mr-3 transition-colors flex-shrink-0 ${
            isChecked ? 'bg-purple-600 text-white' : 'border-2 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-800'
          }">
            ${isChecked ? '✓' : opt.key}
          </div>
          <div class="text-xs sm:text-base font-medium flex-1 text-slate-800 dark:text-slate-100">${opt.text}</div>
          <span class="hidden md:inline-flex kbd-hint ml-2">${opt.key}</span>
        `;
        optEl.addEventListener('click', () => {
          window.examEngine.toggleMultipleAnswer(opt.key);
          window.examEngine.syncLiveStudentProgress(false);
          renderExamRoom();
          renderQuestionPalette();
        });
        optionsContainer.appendChild(optEl);
      });

    } else if (type === 'true_false') {
      const statements = q.statements || [];
      const answersMap = (typeof currentAnswerData === 'object' && currentAnswerData !== null) ? currentAnswerData : {};

      const tableWrapper = document.createElement('div');
      tableWrapper.className = "bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs";

      let rowsHtml = statements.map((stmt, sIdx) => {
        const val = answersMap[stmt.id];
        return `
          <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
            <td class="p-2.5 sm:p-3.5 text-xs sm:text-sm font-medium text-slate-800 leading-relaxed">
              <span class="font-bold mr-1 text-slate-500">${sIdx + 1}.</span> ${stmt.text}
            </td>
            <td class="p-2.5 sm:p-3.5 text-center w-20 sm:w-24">
              <button type="button" data-stmt="${stmt.id}" data-val="B" class="btn-tf w-full py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition cursor-pointer ${
                val === 'B'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-emerald-400'
              }">Benar</button>
            </td>
            <td class="p-2.5 sm:p-3.5 text-center w-20 sm:w-24">
              <button type="button" data-stmt="${stmt.id}" data-val="S" class="btn-tf w-full py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition cursor-pointer ${
                val === 'S'
                  ? 'bg-red-600 text-white border-red-600 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-red-400'
              }">Salah</button>
            </td>
          </tr>
        `;
      }).join('');

      tableWrapper.innerHTML = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] sm:text-xs uppercase font-bold">
              <th class="p-2.5 sm:p-3">Pernyataan</th>
              <th class="p-2.5 sm:p-3 text-center w-20 sm:w-24">Benar</th>
              <th class="p-2.5 sm:p-3 text-center w-20 sm:w-24">Salah</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;

      tableWrapper.querySelectorAll('.btn-tf').forEach(btn => {
        btn.addEventListener('click', () => {
          const stmtId = btn.getAttribute('data-stmt');
          const value = btn.getAttribute('data-val');
          window.examEngine.selectTrueFalseAnswer(stmtId, value);
          window.examEngine.syncLiveStudentProgress(false);
          renderExamRoom();
          renderQuestionPalette();
        });
      });

      optionsContainer.appendChild(tableWrapper);
    }

    const doubtBtn = document.getElementById('btnToggleDoubt');
    const doubtCheckbox = document.getElementById('chkDoubt');
    const isDoubt = window.examEngine.answers[q.id]?.doubt || false;
    if (doubtCheckbox) doubtCheckbox.checked = isDoubt;
    if (doubtBtn) {
      if (isDoubt) {
        doubtBtn.classList.remove('bg-amber-50', 'text-amber-800', 'border-amber-300');
        doubtBtn.classList.add('bg-amber-500', 'text-white', 'border-amber-600');
      } else {
        doubtBtn.classList.add('bg-amber-50', 'text-amber-800', 'border-amber-300');
        doubtBtn.classList.remove('bg-amber-500', 'text-white', 'border-amber-600');
      }
    }

    const btnPrev = document.getElementById('btnPrevQuestion');
    const btnNext = document.getElementById('btnNextQuestion');
    const isFirst = window.examEngine.currentQuestionIndex === 0;
    const isLast = window.examEngine.currentQuestionIndex === activeQs.length - 1;

    if (btnPrev) btnPrev.disabled = isFirst;
    if (btnNext) {
      if (isLast) {
        btnNext.innerHTML = `<span>Selesai</span> <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
        btnNext.className = "flex items-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 shadow-sm transition cursor-pointer";
      } else {
        btnNext.innerHTML = `<span>Berikutnya</span> <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
        btnNext.className = "flex items-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition cursor-pointer";
      }
    }

    renderQuestionPalette();
  }

  function renderQuestionPalette() {
    const paletteContainers = [
      document.getElementById('questionPaletteDesktop'),
      document.getElementById('questionPaletteDrawer')
    ];

    paletteContainers.forEach(container => {
      if (!container) return;
      container.innerHTML = '';

      window.examEngine.getExamQuestions().forEach((q, idx) => {
        const ansData = window.examEngine.answers[q.id];
        const isCurrent = idx === window.examEngine.currentQuestionIndex;
        const isAnswered = window.examEngine.isQuestionAnswered(q);

        let statusClass = 'unanswered';
        if (ansData?.doubt) statusClass = 'doubt';
        else if (isAnswered) statusClass = 'answered';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `q-btn w-9 h-9 sm:w-11 sm:h-11 rounded-lg font-bold text-xs sm:text-sm flex flex-col items-center justify-center shadow-xs cursor-pointer ${statusClass} ${isCurrent ? 'current ring-3 ring-blue-500' : ''}`;
        btn.innerHTML = `<span>${idx + 1}</span>${isAnswered ? `<span class="text-[8px] -mt-0.5 uppercase opacity-90">✓</span>` : ''}`;

        btn.addEventListener('click', () => {
          window.examEngine.goToQuestion(idx);
          renderExamRoom();
          if (modalQuestionDrawer && !modalQuestionDrawer.classList.contains('hidden')) {
            modalQuestionDrawer.classList.add('hidden');
          }
        });

        container.appendChild(btn);
      });
    });

    const summary = window.examEngine.getAnswerSummary();
    const statAnswered = document.getElementById('statAnswered');
    const statDoubt = document.getElementById('statDoubt');
    const statUnanswered = document.getElementById('statUnanswered');

    if (statAnswered) statAnswered.innerText = summary.answered;
    if (statDoubt) statDoubt.innerText = summary.doubt;
    if (statUnanswered) statUnanswered.innerText = summary.unanswered;
  }

  const btnPrev = document.getElementById('btnPrevQuestion');
  if (btnPrev) btnPrev.addEventListener('click', () => { if (window.examEngine.prevQuestion()) renderExamRoom(); });

  const btnNext = document.getElementById('btnNextQuestion');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const isLast = window.examEngine.currentQuestionIndex === window.examEngine.getExamQuestions().length - 1;
      if (isLast) openFinishConfirmModal();
      else { window.examEngine.nextQuestion(); renderExamRoom(); }
    });
  }

  const btnToggleDoubt = document.getElementById('btnToggleDoubt');
  if (btnToggleDoubt) {
    btnToggleDoubt.addEventListener('click', () => {
      window.examEngine.toggleDoubt();
      renderExamRoom();
      renderQuestionPalette();
    });
  }

  const btnTriggerFinish = document.getElementById('btnTriggerFinish');
  if (btnTriggerFinish) btnTriggerFinish.addEventListener('click', openFinishConfirmModal);

  function openFinishConfirmModal() {
    const summary = window.examEngine.getAnswerSummary();
    document.getElementById('modalSummaryAnswered').innerText = summary.answered;
    document.getElementById('modalSummaryDoubt').innerText = summary.doubt;
    document.getElementById('modalSummaryUnanswered').innerText = summary.unanswered;

    const warningBox = document.getElementById('modalFinishWarningNote');
    if (summary.unanswered > 0 || summary.doubt > 0) warningBox.classList.remove('hidden');
    else warningBox.classList.add('hidden');

    modalFinishConfirm.classList.remove('hidden');
  }

  const btnCancelFinish = document.getElementById('btnCancelFinish');
  if (btnCancelFinish) btnCancelFinish.addEventListener('click', () => modalFinishConfirm.classList.add('hidden'));

  const btnConfirmFinishFinal = document.getElementById('btnConfirmFinishFinal');
  if (btnConfirmFinishFinal) {
    btnConfirmFinishFinal.addEventListener('click', () => {
      modalFinishConfirm.classList.add('hidden');
      window.examEngine.finishExam('Selesai mandiri oleh peserta');
    });
  }

  const btnFontDec = document.getElementById('btnFontDecrease');
  const btnFontReset = document.getElementById('btnFontReset');
  const btnFontInc = document.getElementById('btnFontIncrease');
  if (btnFontDec) btnFontDec.addEventListener('click', () => window.examEngine.changeFontSize('decrease'));
  if (btnFontReset) btnFontReset.addEventListener('click', () => window.examEngine.changeFontSize('reset'));
  if (btnFontInc) btnFontInc.addEventListener('click', () => window.examEngine.changeFontSize('increase'));

  const btnOpenDrawer = document.getElementById('btnOpenQuestionDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseQuestionDrawer');
  if (btnOpenDrawer) btnOpenDrawer.addEventListener('click', () => { modalQuestionDrawer.classList.remove('hidden'); renderQuestionPalette(); });
  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', () => modalQuestionDrawer.classList.add('hidden'));

  window.addEventListener('cbt-timer-tick', (e) => {
    const timerDisplay = document.getElementById('examTimerDisplay');
    if (!timerDisplay) return;
    const seconds = e.detail.remainingSeconds;
    timerDisplay.innerText = window.examEngine.formatTime(seconds);
    if (seconds <= 300) {
      timerDisplay.classList.add('text-red-600', 'font-black');
      timerDisplay.classList.remove('text-slate-800');
    } else {
      timerDisplay.classList.remove('text-red-600');
      timerDisplay.classList.add('text-slate-800');
    }
  });

  window.addEventListener('cbt-privacy-shield', (e) => {
    const reasonEl = document.getElementById('privacyShieldReason');
    if (reasonEl && e.detail && e.detail.reason) {
      reasonEl.innerText = e.detail.reason;
    }
    if (examPrivacyShield) examPrivacyShield.classList.remove('hidden');
  });

  window.addEventListener('cbt-cheat-warning', (e) => {
    const { count, max, reason } = e.detail;
    const cheatCountBadge = document.getElementById('cheatCountBadge');
    if (cheatCountBadge) {
      cheatCountBadge.innerText = `Pelanggaran: ${count}/${max}`;
      cheatCountBadge.classList.remove('hidden');
    }
    const modalCount = document.getElementById('cheatWarningCount');
    const modalMax = document.getElementById('cheatWarningMax');
    const modalReason = document.getElementById('cheatWarningReason');
    if (modalCount) modalCount.innerText = count;
    if (modalMax) modalMax.innerText = max;
    if (modalReason) modalReason.innerText = reason;
    modalCheatWarning.classList.remove('hidden');
  });

  const btnAcknowledgeCheat = document.getElementById('btnAcknowledgeCheat');
  if (btnAcknowledgeCheat) btnAcknowledgeCheat.addEventListener('click', () => modalCheatWarning.classList.add('hidden'));

  window.addEventListener('cbt-exam-finished', (e) => {
    const { result } = e.detail;
    if (examPrivacyShield) examPrivacyShield.classList.add('hidden');
    if (modalCheatWarning) modalCheatWarning.classList.add('hidden');
    showView('result');
    document.getElementById('resStudentName').innerText = result.student?.name || '-';
    document.getElementById('resStudentNisn').innerText = result.student?.nisn || '-';
    document.getElementById('resStudentClass').innerText = result.student?.class ? `Kelas ${result.student.class}` : '-';
    document.getElementById('resSubject').innerText = result.subject;
    document.getElementById('resCompletedAt').innerText = result.completedAt;
    document.getElementById('resTotalQuestions').innerText = `${result.totalQuestions} Butir Soal`;
    document.getElementById('resCheatCount').innerText = `${result.cheatCount || 0} Kali Pelanggaran`;
    const resAutoNoteEl = document.getElementById('resAutoPrintNote');
    if (resAutoNoteEl && window.cbtAdmin && typeof window.cbtAdmin.getPrintStampText === 'function') {
      resAutoNoteEl.innerText = window.cbtAdmin.getPrintStampText();
    }
  });

  const btnPrintResult = document.getElementById('btnPrintResult');
  if (btnPrintResult) btnPrintResult.addEventListener('click', () => {
    const resAutoNoteEl = document.getElementById('resAutoPrintNote');
    if (resAutoNoteEl && window.cbtAdmin && typeof window.cbtAdmin.getPrintStampText === 'function') {
      resAutoNoteEl.innerText = window.cbtAdmin.getPrintStampText();
    }
    window.print();
  });

  const btnReturnHome = document.getElementById('btnReturnHome');
  if (btnReturnHome) {
    btnReturnHome.addEventListener('click', () => {
      openLogoutConfirmModal('student_result', () => {
        tempStudent = null;
        try { localStorage.removeItem('cbt_confirm_student'); } catch (e) {}
        if (window.studentManager && typeof window.studentManager.scrubSensitiveDataForStudentMode === 'function') {
          window.studentManager.scrubSensitiveDataForStudentMode();
        }
        if (window.examEngine && typeof window.examEngine.enterStudentPrivacyMode === 'function') {
          window.examEngine.enterStudentPrivacyMode();
        }
        showView('login');
      });
    });
  }

  // ===================== PANEL PROKTOR & GURU: LOGIN SECURE =====================
  function setupAdminLoginHelpers() {
    const btnTogglePin = document.getElementById('btnTogglePinVisibility');
    const pinInput = document.getElementById('adminPinInput');
    if (btnTogglePin && pinInput) {
      btnTogglePin.onclick = () => {
        if (pinInput.type === 'password') {
          pinInput.type = 'text';
          btnTogglePin.innerText = 'Sembunyikan';
        } else {
          pinInput.type = 'password';
          btnTogglePin.innerText = 'Lihat PIN';
        }
      };
    }
  }

  const btnCloseAdminPin = document.getElementById('btnCloseAdminPin');
  if (btnCloseAdminPin) btnCloseAdminPin.addEventListener('click', () => modalAdminPin.classList.add('hidden'));

  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('adminUsernameInput');
      const pinInput = document.getElementById('adminPinInput');
      const identifier = usernameInput ? usernameInput.value.trim() : '';
      const pin = pinInput ? pinInput.value.trim() : '';

      if (!identifier || !pin) {
        alert("Harap masukkan Username/NIP dan PIN!");
        return;
      }

      const loginRes = await window.cbtAdmin.loginWithCloud(identifier, pin);

      if (loginRes && loginRes.success) {
        modalAdminPin.classList.add('hidden');
        if (usernameInput) usernameInput.value = '';
        if (pinInput) pinInput.value = '';
        showView('admin');
        if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
          syncFromCloud(true, { publicOnly: false })
            .then(() => typeof window.supabaseSync.fetchCloudResults === 'function' ? window.supabaseSync.fetchCloudResults() : null)
            .then(() => {
              if (viewAdmin && !viewAdmin.classList.contains('hidden')) renderAdminDashboard();
            })
            .catch(() => {});
        }
      } else {
        alert((loginRes && loginRes.message) || "Username / NIP atau PIN salah!");
      }
    });
  }

  function stopMonitoringAutoRefresh() {
    if (monitoringRefreshTimer) {
      clearInterval(monitoringRefreshTimer);
      monitoringRefreshTimer = null;
    }
  }

  function startMonitoringAutoRefresh() {
    stopMonitoringAutoRefresh();
    monitoringRefreshTimer = setInterval(() => {
      const tabMonitoringPane = document.getElementById('tabMonitoring');
      if (viewAdmin && !viewAdmin.classList.contains('hidden') && tabMonitoringPane && !tabMonitoringPane.classList.contains('hidden')) {
        renderMonitoringDashboard(true);
      } else {
        stopMonitoringAutoRefresh();
      }
    }, 10000);
  }

  let pendingLogoutAction = null;
  const modalLogoutConfirm = document.getElementById('modalLogoutConfirm');
  const btnCancelLogoutConfirm = document.getElementById('btnCancelLogoutConfirm');
  const btnConfirmLogoutFinal = document.getElementById('btnConfirmLogoutFinal');

  function openLogoutConfirmModal(mode, onConfirm) {
    if (!modalLogoutConfirm) {
      if (typeof onConfirm === 'function') onConfirm();
      return;
    }
    pendingLogoutAction = onConfirm;

    const iconBox = document.getElementById('logoutModalIconBox');
    const subtitleEl = document.getElementById('logoutModalSubtitle');
    const titleEl = document.getElementById('logoutModalTitle');
    const descEl = document.getElementById('logoutModalDesc');

    const exitArrowSvg = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>';
    const studentWarnSvg = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
    const studentDoneSvg = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

    if (mode === 'student_confirm') {
      if (iconBox) {
        iconBox.className = 'w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-2.5 bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400';
        iconBox.innerHTML = studentWarnSvg;
      }
      if (subtitleEl) subtitleEl.innerText = 'Notifikasi Keluar Peserta';
      if (titleEl) titleEl.innerText = 'Batalkan & keluar sebelum memulai ujian?';
      if (descEl) descEl.innerText = 'Jika keluar sekarang, sesi kehadiran ujian Anda akan dibatalkan dan Anda harus login ulang serta memasukkan token kembali.';
      if (btnCancelLogoutConfirm) btnCancelLogoutConfirm.innerText = 'Batal';
      if (btnConfirmLogoutFinal) {
        btnConfirmLogoutFinal.innerText = 'Ya, Keluar Sesi';
        btnConfirmLogoutFinal.className = 'py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/20 transition cursor-pointer';
      }
    } else if (mode === 'student_result') {
      if (iconBox) {
        iconBox.className = 'w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-2.5 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400';
        iconBox.innerHTML = studentDoneSvg;
      }
      if (subtitleEl) subtitleEl.innerText = 'Konfirmasi Keluar Peserta Ujian';
      if (titleEl) titleEl.innerText = 'Keluar dari halaman bukti selesai ujian?';
      if (descEl) descEl.innerText = 'Pastikan Anda sudah mencetak/menyimpan bukti ujian atau melapor ke pengawas. Anda tidak dapat mengulang ujian tanpa reset token dari proktor.';
      if (btnCancelLogoutConfirm) btnCancelLogoutConfirm.innerText = 'Tetap di Sini';
      if (btnConfirmLogoutFinal) {
        btnConfirmLogoutFinal.innerText = 'Ya, Kembali ke Login';
        btnConfirmLogoutFinal.className = 'py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition cursor-pointer';
      }
    } else {
      // Admin & Guru
      if (iconBox) {
        iconBox.className = 'w-11 h-11 rounded-2xl mx-auto flex items-center justify-center mb-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200';
        iconBox.innerHTML = exitArrowSvg;
      }
      if (subtitleEl) subtitleEl.innerText = 'Konfirmasi Keluar';
      if (titleEl) titleEl.innerText = 'Apakah Anda yakin ingin keluar dari aplikasi CBT?';
      if (descEl) descEl.innerText = 'Anda dapat login kembali kapan saja untuk mengakses aplikasi.';
      if (btnCancelLogoutConfirm) btnCancelLogoutConfirm.innerText = 'Tidak';
      if (btnConfirmLogoutFinal) {
        btnConfirmLogoutFinal.innerText = 'Ya, Keluar';
        btnConfirmLogoutFinal.className = 'py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 transition cursor-pointer';
      }
    }

    modalLogoutConfirm.classList.remove('hidden');
  }

  function closeLogoutConfirmModal() {
    if (modalLogoutConfirm) modalLogoutConfirm.classList.add('hidden');
    pendingLogoutAction = null;
  }

  if (btnCancelLogoutConfirm) {
    btnCancelLogoutConfirm.addEventListener('click', closeLogoutConfirmModal);
  }
  if (btnConfirmLogoutFinal) {
    btnConfirmLogoutFinal.addEventListener('click', () => {
      const action = pendingLogoutAction;
      closeLogoutConfirmModal();
      if (typeof action === 'function') action();
    });
  }
  if (modalLogoutConfirm) {
    modalLogoutConfirm.addEventListener('click', (e) => {
      if (e.target === modalLogoutConfirm) closeLogoutConfirmModal();
    });
  }

  const btnAdminLogout = document.getElementById('btnAdminLogout');
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      openLogoutConfirmModal('admin', () => {
        stopMonitoringAutoRefresh();
        resetAdminRealtimeStateOnLogout();
        tempStudent = null;
        try {
          localStorage.removeItem('cbt_active_admin_tab');
          localStorage.removeItem('cbt_confirm_student');
        } catch (e) {}
        window.cbtAdmin.logout();
        showView('login');
      });
    });
  }

  // ===================== ADMIN TABS SWITCHER & RBAC =====================
  const adminTabButtons = document.querySelectorAll('.admin-tab-btn');
  let cbtTabEnterTimer = null;
  let cbtResultsLoadSeq = 0;

  function animateAdminTabPane(targetPane) {
    if (!targetPane) return;
    document.querySelectorAll('.admin-tab-pane.cbt-tab-entering').forEach(p => {
      p.classList.remove('cbt-tab-entering');
    });
    if (cbtTabEnterTimer) {
      clearTimeout(cbtTabEnterTimer);
      cbtTabEnterTimer = null;
    }
    void targetPane.offsetWidth;
    targetPane.classList.add('cbt-tab-entering');
    cbtTabEnterTimer = setTimeout(() => {
      targetPane.classList.remove('cbt-tab-entering');
      cbtTabEnterTimer = null;
    }, 480);
  }

  function clearResultsLoadingState() {
    const tabRes = document.getElementById('tabResults');
    if (tabRes) tabRes.classList.remove('cbt-results-loading');
  }

  function showResultsLoadingSkeleton(rowCount = 6) {
    const tabRes = document.getElementById('tabResults');
    const tbody = document.getElementById('adminResultsTbody');
    const emptyRow = document.getElementById('adminResultsEmpty');
    if (tabRes) tabRes.classList.add('cbt-results-loading');
    if (emptyRow) emptyRow.classList.add('hidden');
    if (!tbody) return;

    const widths = [
      { name: 'w-32', mapel: 'w-20', score: 'w-10', chips: 4 },
      { name: 'w-40', mapel: 'w-24', score: 'w-11', chips: 5 },
      { name: 'w-28', mapel: 'w-16', score: 'w-10', chips: 4 },
      { name: 'w-36', mapel: 'w-20', score: 'w-11', chips: 5 },
      { name: 'w-32', mapel: 'w-24', score: 'w-10', chips: 3 },
      { name: 'w-40', mapel: 'w-20', score: 'w-11', chips: 4 }
    ];

    tbody.innerHTML = Array.from({ length: rowCount }, (_, i) => {
      const cfg = widths[i % widths.length];
      const chipsHtml = Array.from({ length: cfg.chips }, () =>
        `<span class="cbt-skeleton-bar h-4 w-10 rounded-md"></span>`
      ).join('');
      return `
        <tr class="border-b border-slate-100 dark:border-slate-800/80">
          <td class="px-2.5 py-3 text-center"><span class="cbt-skeleton-bar w-6 h-6 rounded-full"></span></td>
          <td class="px-2.5 py-3">
            <div class="flex flex-col gap-1.5">
              <span class="cbt-skeleton-bar h-3.5 ${cfg.name}"></span>
              <span class="cbt-skeleton-bar h-2.5 ${cfg.mapel}"></span>
            </div>
          </td>
          <td class="px-2.5 py-3"><span class="cbt-skeleton-bar h-3 w-20"></span></td>
          <td class="px-2.5 py-3"><span class="cbt-skeleton-bar h-5 w-16 rounded-md"></span></td>
          <td class="px-2.5 py-3 text-center"><span class="cbt-skeleton-bar h-6 ${cfg.score} rounded-lg"></span></td>
          <td class="px-2.5 py-3"><div class="flex flex-wrap gap-1">${chipsHtml}</div></td>
          <td class="px-2.5 py-3"><span class="cbt-skeleton-bar h-3 w-24"></span></td>
          <td class="px-2.5 py-3 text-center"><span class="cbt-skeleton-bar h-3.5 w-16"></span></td>
          <td class="px-2.5 py-3"><span class="cbt-skeleton-bar h-5 w-20 rounded"></span></td>
        </tr>
      `;
    }).join('');
  }

  function triggerResultsTabLoadTransition() {
    const seq = ++cbtResultsLoadSeq;
    showResultsLoadingSkeleton(6);

    const hasCloud = Boolean(window.supabaseSync && window.supabaseSync.isCloudConfigured());
    if (!hasCloud) {
      setTimeout(() => {
        if (seq !== cbtResultsLoadSeq) return;
        renderAdminAnalyticsAndResults({ animateRows: true, _seq: seq });
      }, 170);
      return;
    }

    let revealed = false;
    const revealOnce = () => {
      if (revealed || seq !== cbtResultsLoadSeq) return;
      revealed = true;
      renderAdminAnalyticsAndResults({ animateRows: true, _seq: seq });
    };

    const minDelayPromise = new Promise(resolve => setTimeout(resolve, 190));
    const fallbackTimer = setTimeout(revealOnce, 650);

    Promise.all([
      window.supabaseSync.fetchCloudResults().catch(() => null),
      minDelayPromise
    ]).then(([cloudRes]) => {
      clearTimeout(fallbackTimer);
      if (seq !== cbtResultsLoadSeq) return;
      if (!revealed) {
        revealOnce();
      } else if (cloudRes && cloudRes.success) {
        renderAdminAnalyticsAndResults({ animateRows: false, _seq: seq });
      }
    });
  }

  function switchAdminTab(targetTab, options = {}) {
    const currentTeacher = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');

    if (!isAdmin && (targetTab === 'tabSchedules' || targetTab === 'tabStudents' || targetTab === 'tabTeachers' || targetTab === 'tabSettings' || targetTab === 'tabDatabase' || targetTab === 'tabBackup')) {
      targetTab = 'tabDashboard';
    }

    try { localStorage.setItem('cbt_active_admin_tab', targetTab); } catch (e) {}

    const allTabBtns = document.querySelectorAll('.admin-tab-btn');
    const allTabPanes = document.querySelectorAll('.admin-tab-pane');

    const idleTabClass = 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800/75 dark:hover:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
    const activeTabClass = 'bg-gradient-to-r from-[#124196] to-[#1a56c4] text-white border-transparent shadow-md shadow-blue-900/20';

    allTabBtns.forEach(b => {
      const tabKey = b.getAttribute('data-tab');
      const isHidden = b.classList.contains('hidden');
      const isActive = tabKey === targetTab;
      b.className = `admin-tab-btn lg:w-full justify-start text-left px-3.5 py-2.5 lg:py-3 rounded-xl text-xs sm:text-[13px] font-bold border flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
        isActive ? activeTabClass : idleTabClass
      }${isHidden ? ' hidden' : ''}`;
    });

    let activePane = null;
    allTabPanes.forEach(pane => {
      if (pane.id === targetTab) {
        pane.classList.remove('hidden');
        activePane = pane;
      } else {
        pane.classList.add('hidden');
        pane.classList.remove('cbt-tab-entering');
      }
    });

    if (activePane) {
      animateAdminTabPane(activePane);
    }

    if (targetTab !== 'tabMonitoring') {
      stopMonitoringAutoRefresh();
    }

    try {
      if (targetTab === 'tabDashboard') {
        renderAdminOverviewDashboard();
      } else if (targetTab === 'tabResults') {
        if (options.skipSkeleton) {
          renderAdminAnalyticsAndResults({ animateRows: true });
        } else {
          triggerResultsTabLoadTransition();
        }
      } else if (targetTab === 'tabMonitoring') {
        setupMonitoringControls();
        renderMonitoringDashboard(true);
        startMonitoringAutoRefresh();
      } else if (targetTab === 'tabSchedules' && isAdmin) {
        renderAdminSchedulesList();
      } else if (targetTab === 'tabQuestions') {
        setupQuestionBankFilters();
        renderAdminQuestionList();
        const tpPanel = document.getElementById('adminTeacherQuestionProgressPanel');
        if (tpPanel) {
          if (isAdmin) {
            tpPanel.classList.remove('hidden');
            renderAdminTeacherQuestionProgress();
          } else {
            tpPanel.classList.add('hidden');
          }
        }
        syncQuestionsFromCloud(true);
      } else if (targetTab === 'tabStudents' && isAdmin) {
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
      } else if (targetTab === 'tabTeachers' && isAdmin) {
        renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value || '');
      } else if (targetTab === 'tabSettings' && isAdmin) {
        renderAdminConfigForm();
        renderSchoolConfigForm();
      } else if (targetTab === 'tabDatabase' && isAdmin) {
        renderSupabaseConfigForm();
      }
    } catch (err) {
      console.warn("Gagal render tab content:", err);
    }
  }

  adminTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchAdminTab(targetTab);
    });
  });

  function renderAdminDashboard() {
    const currentTeacher = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
    const tabMonitoringBtn = document.getElementById('adminTabBtnMonitoring');
    const tabSchedulesBtn = document.getElementById('adminTabBtnSchedules');
    const tabStudentsBtn = document.getElementById('adminTabBtnStudents');
    const tabTeachersBtn = document.getElementById('adminTabBtnTeachers');
    const tabSettingsBtn = document.getElementById('adminTabBtnSettings');
    const tabDatabaseBtn = document.getElementById('adminTabBtnDatabase');
    const tabBackupBtn = document.getElementById('adminTabBtnBackup');

    const tabSchedulesPane = document.getElementById('tabSchedules');
    const tabStudentsPane = document.getElementById('tabStudents');
    const tabTeachersPane = document.getElementById('tabTeachers');
    const tabSettingsPane = document.getElementById('tabSettings');
    const tabDatabasePane = document.getElementById('tabDatabase');
    const tabBackupPane = document.getElementById('tabBackup');

    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');

    if (currentTeacher) {
      const nameDisp = document.getElementById('adminTeacherNameDisplay');
      const roleBadge = document.getElementById('adminRoleBadge');
      const subjDisp = document.getElementById('adminSubjectDisplay');
      if (nameDisp) {
        nameDisp.innerText = isAdmin
          ? 'Selamat Datang, Admin!'
          : `Hallo, ${currentTeacher.name}! 👋`;
      }
      if (roleBadge) {
        roleBadge.className = 'hidden';
      }
      if (subjDisp) {
        const parsedClasses = currentTeacher.classes && window.cbtAdmin ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes) : [];
        const classInfo = parsedClasses.length > 0 ? ` • Kelas: ${parsedClasses.join(', ')}` : '';
        subjDisp.innerText = isAdmin
          ? 'Administrator Sistem'
          : `Guru Mata Pelajaran • ${currentTeacher.subject}${classInfo}`;
      }

      if (tabMonitoringBtn) tabMonitoringBtn.classList.remove('hidden');

      if (!isAdmin) {
        if (tabSchedulesBtn) tabSchedulesBtn.classList.add('hidden');
        if (tabStudentsBtn) tabStudentsBtn.classList.add('hidden');
        if (tabTeachersBtn) tabTeachersBtn.classList.add('hidden');
        if (tabSettingsBtn) tabSettingsBtn.classList.add('hidden');
        if (tabDatabaseBtn) tabDatabaseBtn.classList.add('hidden');
        if (tabBackupBtn) tabBackupBtn.classList.add('hidden');
        if (tabSchedulesPane) tabSchedulesPane.classList.add('hidden');
        if (tabStudentsPane) tabStudentsPane.classList.add('hidden');
        if (tabTeachersPane) tabTeachersPane.classList.add('hidden');
        if (tabSettingsPane) tabSettingsPane.classList.add('hidden');
        if (tabDatabasePane) tabDatabasePane.classList.add('hidden');
        if (tabBackupPane) tabBackupPane.classList.add('hidden');
        const savedTab = localStorage.getItem('cbt_active_admin_tab') || 'tabDashboard';
        const allowedGuruTabs = ['tabDashboard', 'tabResults', 'tabMonitoring', 'tabQuestions'];
        switchAdminTab(allowedGuruTabs.includes(savedTab) ? savedTab : 'tabDashboard', { skipSkeleton: true });
      } else {
        if (tabSchedulesBtn) tabSchedulesBtn.classList.remove('hidden');
        if (tabStudentsBtn) tabStudentsBtn.classList.remove('hidden');
        if (tabTeachersBtn) tabTeachersBtn.classList.remove('hidden');
        if (tabSettingsBtn) tabSettingsBtn.classList.remove('hidden');
        if (tabDatabaseBtn) tabDatabaseBtn.classList.remove('hidden');
        if (tabBackupBtn) tabBackupBtn.classList.remove('hidden');
        const savedTab = localStorage.getItem('cbt_active_admin_tab') || 'tabDashboard';
        const allowedAdminTabs = ['tabDashboard', 'tabResults', 'tabMonitoring', 'tabSchedules', 'tabQuestions', 'tabStudents', 'tabTeachers', 'tabSettings', 'tabDatabase', 'tabBackup'];
        switchAdminTab(allowedAdminTabs.includes(savedTab) ? savedTab : 'tabDashboard', { skipSkeleton: true });
      }
    }
    const btnResetQs = document.getElementById('btnResetDefaultQuestions');
    if (btnResetQs) {
      if (isAdmin) btnResetQs.classList.remove('hidden');
      else btnResetQs.classList.add('hidden');
    }

    const btnSeedTrialQs = document.getElementById('btnSeedTrialQuestions');
    if (btnSeedTrialQs) {
      if (isAdmin) btnSeedTrialQs.classList.remove('hidden');
      else btnSeedTrialQs.classList.add('hidden');
    }

    const btnImportQs = document.getElementById('btnImportQuestions');
    if (btnImportQs) {
      if (isAdmin) btnImportQs.classList.remove('hidden');
      else btnImportQs.classList.add('hidden');
    }

    const btnExportQs = document.getElementById('btnExportQuestions');
    if (btnExportQs) {
      if (isAdmin) btnExportQs.classList.remove('hidden');
      else btnExportQs.classList.add('hidden');
    }

    const tpPanel = document.getElementById('adminTeacherQuestionProgressPanel');
    if (tpPanel) {
      if (isAdmin) tpPanel.classList.remove('hidden');
      else tpPanel.classList.add('hidden');
    }

    const consultStuSel = document.getElementById('filterResultsStudent');
    if (consultStuSel) consultStuSel.value = 'ALL';

    setupSubjectAndClassFilters();
    setupQuestionBankFilters();
    setupMonitoringControls();
    renderAdminOverviewDashboard();
    renderAdminAnalyticsAndResults();
    renderAdminQuestionList();

    if (isAdmin) {
      renderAdminTeacherQuestionProgress();
      renderAdminSchedulesList();
      renderAdminStudentsList();
      renderAdminTeachersList();
      renderAdminConfigForm();
      renderSchoolConfigForm();
      renderSupabaseConfigForm();
    }

    if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) {
      maybeAutoSeedTeacherTrialBank();
    }
  }

  // ===================== D3.JS VISUALIZATION HELPERS & TAB DASHBOARD =====================
  let lastEmpiricalAnalysisCache = null;
  let lastDashboardResultsCache = [];

  function ensureD3Tooltip() {
    let tip = document.getElementById('cbtD3Tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'cbtD3Tooltip';
      tip.className = 'hidden fixed z-[80] pointer-events-none max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-3 py-2 text-[11px] text-slate-800 dark:text-slate-100 shadow-xl transition-opacity duration-75';
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showD3Tooltip(event, htmlContent) {
    const tip = ensureD3Tooltip();
    tip.innerHTML = htmlContent;
    tip.classList.remove('hidden');
    const pad = 14;
    const rect = tip.getBoundingClientRect();
    let left = (event.clientX || 0) + pad;
    let top = (event.clientY || 0) + pad;
    if (left + rect.width > window.innerWidth - 10) {
      left = Math.max(10, (event.clientX || 0) - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - 10) {
      top = Math.max(10, (event.clientY || 0) - rect.height - pad);
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hideD3Tooltip() {
    const tip = document.getElementById('cbtD3Tooltip');
    if (tip) tip.classList.add('hidden');
  }

  function getD3ThemeColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      isDark,
      axisText: isDark ? '#c5cff5' : '#475569',
      axisLine: isDark ? 'rgba(139, 92, 246, 0.32)' : '#94a3b8',
      gridLine: isDark ? 'rgba(139, 92, 246, 0.16)' : '#e2e8f0',
      idealBg: isDark ? 'rgba(155, 44, 245, 0.12)' : 'rgba(16, 185, 129, 0.10)',
      idealStroke: isDark ? '#fdbb2d' : '#10b981',
      labelBg: isDark ? '#0e112a' : '#ffffff'
    };
  }

  function renderDashboardScoreDistChart(results = []) {
    const container = document.getElementById('dashboardScoreDistChart');
    if (!container) return;
    lastDashboardResultsCache = Array.isArray(results) ? results : [];

    if (!lastDashboardResultsCache.length) {
      container.innerHTML = `
        <div class="text-center py-10 px-4 text-slate-400 text-xs">
          <p class="font-bold text-slate-600 dark:text-slate-300">Belum ada data nilai ujian masuk</p>
          <p class="mt-1">Grafik distribusi nilai D3.js akan muncul otomatis setelah siswa menyelesaikan ujian atau setelah Sinkron Cloud.</p>
        </div>
      `;
      return;
    }

    if (typeof d3 === 'undefined') {
      container.innerHTML = `<div class="text-xs text-slate-500 p-4">Library visualisasi D3.js sedang dimuat...</div>`;
      return;
    }

    const brackets = [
      { label: '< 50', desc: 'Perlu Bimbingan', min: -Infinity, max: 49.999, color: '#e11d48' },
      { label: '50–64', desc: 'Cukup', min: 50, max: 64.999, color: '#f97316' },
      { label: '65–74', desc: 'Hampir Tuntas', min: 65, max: 74.999, color: '#f59e0b' },
      { label: '75–84', desc: 'Tuntas (Baik)', min: 75, max: 84.999, color: '#2563eb' },
      { label: '85–100', desc: 'Sangat Baik', min: 85, max: Infinity, color: '#10b981' }
    ];

    const total = lastDashboardResultsCache.length;
    const data = brackets.map(b => {
      const count = lastDashboardResultsCache.filter(r => {
        const s = Number(r.finalScore || 0);
        return s >= b.min && s <= b.max;
      }).length;
      return {
        ...b,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0
      };
    });

    const theme = getD3ThemeColors();
    const width = Math.max(container.clientWidth || 0, 480);
    const height = 250;
    const margin = { top: 24, right: 16, bottom: 42, left: 38 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    container.innerHTML = '';
    const svg = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'w-full h-auto overflow-visible');

    if (theme.isDark) {
      const defs = svg.append('defs');
      const neonSpecs = [
        { id: 'cbtNeonBar0', top: '#f4177b', bottom: '#ff6b52' },
        { id: 'cbtNeonBar1', top: '#ec2f7a', bottom: '#fdbb2d' },
        { id: 'cbtNeonBar2', top: '#ff6b52', bottom: '#fdbb2d' },
        { id: 'cbtNeonBar3', top: '#9b2cf5', bottom: '#f4177b' },
        { id: 'cbtNeonBar4', top: '#7b2ff7', bottom: '#f4177b' }
      ];
      neonSpecs.forEach(spec => {
        const lg = defs.append('linearGradient')
          .attr('id', spec.id)
          .attr('x1', '0%').attr('y1', '0%')
          .attr('x2', '0%').attr('y2', '100%');
        lg.append('stop').attr('offset', '0%').attr('stop-color', spec.top);
        lg.append('stop').attr('offset', '100%').attr('stop-color', spec.bottom);
      });
    }

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, innerW])
      .padding(0.32);

    const maxCount = Math.max(1, d3.max(data, d => d.count) || 1);
    const y = d3.scaleLinear()
      .domain([0, maxCount])
      .nice()
      .range([innerH, 0]);

    // Grid horizontal
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(''))
      .selectAll('line')
      .attr('stroke', theme.gridLine)
      .attr('stroke-dasharray', '3,3');
    g.select('.domain').remove();

    // Sumbu Y
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('d')))
      .call(ax => ax.select('.domain').attr('stroke', theme.axisLine))
      .selectAll('text')
      .attr('fill', theme.axisText)
      .style('font-size', '11px')
      .style('font-weight', '600');

    // Sumbu X
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x))
      .call(ax => ax.select('.domain').attr('stroke', theme.axisLine))
      .selectAll('text')
      .attr('fill', theme.axisText)
      .style('font-size', '11px')
      .style('font-weight', '700');

    // Garis batas KKM 75 (di antara 65-74 dan 75-84)
    const xBeforePass = x('75–84');
    if (xBeforePass !== undefined) {
      const kkmX = xBeforePass - (x.step() - x.bandwidth()) / 2;
      g.append('line')
        .attr('x1', kkmX)
        .attr('x2', kkmX)
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', theme.idealStroke)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3');

      g.append('text')
        .attr('x', kkmX + 4)
        .attr('y', 10)
        .attr('fill', theme.idealStroke)
        .style('font-size', '10px')
        .style('font-weight', '700')
        .text('Batas Tuntas ≥75 →');
    }

    // Batang nilai
    const bars = g.selectAll('.dash-bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'dash-bar cursor-pointer')
      .attr('x', d => x(d.label))
      .attr('width', x.bandwidth())
      .attr('y', innerH)
      .attr('height', 0)
      .attr('rx', 6)
      .attr('fill', (d, idx) => theme.isDark ? `url(#cbtNeonBar${idx})` : d.color)
      .attr('opacity', 0.92);

    bars.transition()
      .duration(350)
      .attr('y', d => y(d.count))
      .attr('height', d => Math.max(0, innerH - y(d.count)));

    bars
      .on('mouseenter mousemove', (event, d) => {
        d3.select(event.currentTarget).attr('opacity', 1);
        showD3Tooltip(event, `
          <div class="font-extrabold text-slate-900 dark:text-white">Rentang Nilai ${escapeHtmlSafe(d.label)}</div>
          <div class="text-slate-500 dark:text-slate-400 mb-1">${escapeHtmlSafe(d.desc)}</div>
          <div>Jumlah: <strong>${d.count} siswa</strong> (${d.pct}%)</div>
        `);
      })
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget).attr('opacity', 0.9);
        hideD3Tooltip();
      });

    // Label jumlah di atas batang
    g.selectAll('.dash-bar-label')
      .data(data)
      .enter()
      .append('text')
      .attr('x', d => x(d.label) + x.bandwidth() / 2)
      .attr('y', d => y(d.count) - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', theme.axisText)
      .style('font-size', '10px')
      .style('font-weight', '700')
      .text(d => d.count > 0 ? `${d.count} (${d.pct}%)` : '0');
  }

  function renderAdminOverviewDashboard() {
    if (!window.cbtAdmin) return;
    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');

    const subtitleEl = document.getElementById('dashOverviewSubtitle');
    if (subtitleEl && currentTeacher) {
      subtitleEl.innerText = isAdmin
        ? 'Cakupan Administrator Sekolah — Pantau kesiapan soal, peserta, jadwal aktif, dan sebaran nilai semua mata pelajaran.'
        : `Cakupan Guru Mapel (${currentTeacher.subject || '-'}) — Pantau kesiapan soal dan capaian nilai peserta pada kelas ampuan Anda.`;
    }

    // 1. Bank Soal & Audit Pra-Ujian
    const scopedQuestions = window.cbtAdmin.getQuestionsFiltered('ALL', 'ALL');
    const preAudit = typeof window.cbtAdmin.auditQuestionsPreExam === 'function'
      ? window.cbtAdmin.auditQuestionsPreExam(scopedQuestions)
      : { items: [], summary: { totalQuestions: scopedQuestions.length, readyCount: 0, warningCount: 0, errorCount: 0, readyPercent: 0 } };
    const qSum = preAudit.summary;

    const dashQ = document.getElementById('dashKpiQuestions');
    const dashQSub = document.getElementById('dashKpiQuestionsSub');
    if (dashQ) dashQ.innerText = `${qSum.totalQuestions} Soal`;
    if (dashQSub) dashQSub.innerText = `${qSum.readyCount} siap (${qSum.readyPercent}% lolos pra-ujian)`;

    // 2. Data Siswa (sesuai kelas ampuan jika Guru Mapel)
    let allStudents = window.studentManager ? window.studentManager.getAllStudents() : [];
    const teacherClasses = (!isAdmin && currentTeacher && currentTeacher.classes)
      ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes)
      : [];
    if (teacherClasses.length > 0) {
      allStudents = allStudents.filter(st => {
        const cls = String(st.class || '').trim();
        return cls && window.examEngine.matchesClassLevel(teacherClasses.join(', '), cls);
      });
    }
    const uniqueClasses = new Set(allStudents.map(s => String(s.class || '').trim()).filter(Boolean));
    const dashStu = document.getElementById('dashKpiStudents');
    const dashStuSub = document.getElementById('dashKpiStudentsSub');
    if (dashStu) dashStu.innerText = `${allStudents.length} Siswa`;
    if (dashStuSub) dashStuSub.innerText = `${uniqueClasses.size} kelas terdaftar`;

    // 3. Hasil Ujian & Aktivitas Live
    const scopedResults = window.cbtAdmin.getAllResultsSorted('ALL', 'ALL');
    const analytics = window.cbtAdmin.getExamAnalytics('ALL', 'ALL');

    let liveSessions = window.supabaseSync && typeof window.supabaseSync.getLocalStudentSessions === 'function'
      ? window.supabaseSync.getLocalStudentSessions()
      : [];
    if (!isAdmin && currentTeacher) {
      const tSubs = window.cbtAdmin.getTeacherSubjectsList(currentTeacher).map(s => s.toLowerCase());
      liveSessions = liveSessions.filter(sess => {
        const subOk = tSubs.length > 0 && tSubs.some(ts => window.examEngine.matchesSubject(sess.subject, ts));
        const cls = String(sess.class_name || '').trim();
        const clsOk = teacherClasses.length === 0 || (cls && window.examEngine.matchesClassLevel(teacherClasses.join(', '), cls));
        return subOk && clsOk;
      });
    }
    const activeLiveCount = liveSessions.filter(s => s.status === 'in_progress').length;

    const dashResCount = document.getElementById('dashKpiResultsCount');
    const dashResSub = document.getElementById('dashKpiResultsSub');
    if (dashResCount) dashResCount.innerText = `${scopedResults.length} Hasil`;
    if (dashResSub) dashResSub.innerText = `${activeLiveCount} siswa sedang ujian live`;

    // 4. Rata-rata & Ketuntasan
    const dashAvg = document.getElementById('dashKpiAvgScore');
    const dashPass = document.getElementById('dashKpiPassRate');
    if (dashAvg) dashAvg.innerText = String(analytics.averageScore ?? 0);
    if (dashPass) dashPass.innerText = `Ketuntasan (≥75): ${analytics.passRatePercentage ?? 0}%`;

    const distHigh = document.getElementById('dashDistHighest');
    const distLow = document.getElementById('dashDistLowest');
    const distPass = document.getElementById('dashDistPassCount');
    const passedTotal = scopedResults.filter(r => Number(r.finalScore || 0) >= 75).length;
    if (distHigh) distHigh.innerText = scopedResults.length > 0 ? `${analytics.highestScore}` : '-';
    if (distLow) distLow.innerText = scopedResults.length > 0 ? `${analytics.lowestScore}` : '-';
    if (distPass) distPass.innerText = `${passedTotal} dari ${scopedResults.length}`;

    // Render Grafik Distribusi Nilai D3.js
    renderDashboardScoreDistChart(scopedResults);

    // 5. Box Kesiapan Pra-Ujian
    const readinessBox = document.getElementById('dashboardReadinessBox');
    if (readinessBox) {
      const totalQ = Math.max(1, qSum.totalQuestions);
      const readyPct = qSum.totalQuestions > 0 ? Math.round((qSum.readyCount / totalQ) * 100) : 0;
      const warnPct = qSum.totalQuestions > 0 ? Math.round((qSum.warningCount / totalQ) * 100) : 0;
      const errPct = qSum.totalQuestions > 0 ? Math.max(0, 100 - readyPct - warnPct) : 0;

      readinessBox.innerHTML = qSum.totalQuestions === 0
        ? `<div class="text-xs text-slate-400 py-3 text-center">Belum ada butir soal pada cakupan ini.</div>`
        : `
          <div class="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            <div class="bg-emerald-500 h-full transition-all" style="width:${readyPct}%" title="Siap: ${qSum.readyCount}"></div>
            <div class="bg-amber-400 h-full transition-all" style="width:${warnPct}%" title="Perlu Dicek: ${qSum.warningCount}"></div>
            <div class="bg-rose-500 h-full transition-all" style="width:${errPct}%" title="Perlu Perbaikan: ${qSum.errorCount}"></div>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center text-xs">
            <div class="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <div class="text-sm font-black text-emerald-700">${qSum.readyCount}</div>
              <div class="text-[10px] font-bold text-emerald-800">Siap Diujikan</div>
            </div>
            <div class="p-2 rounded-xl bg-amber-50 border border-amber-200">
              <div class="text-sm font-black text-amber-700">${qSum.warningCount}</div>
              <div class="text-[10px] font-bold text-amber-800">Perlu Dicek</div>
            </div>
            <div class="p-2 rounded-xl bg-rose-50 border border-rose-200">
              <div class="text-sm font-black text-rose-700">${qSum.errorCount}</div>
              <div class="text-[10px] font-bold text-rose-800">Perbaikan</div>
            </div>
          </div>
        `;
    }

    // 6. Jadwal Aktif & Token
    const btnOpenSchedules = document.getElementById('btnDashOpenSchedules');
    if (btnOpenSchedules) {
      if (isAdmin) btnOpenSchedules.classList.remove('hidden');
      else btnOpenSchedules.classList.add('hidden');
    }
    const schedListEl = document.getElementById('dashboardActiveSchedulesList');
    if (schedListEl) {
      let activeSchedules = window.cbtAdmin.getActiveSchedules();
      if (!isAdmin && currentTeacher) {
        const tSubs = window.cbtAdmin.getTeacherSubjectsList(currentTeacher).map(s => s.toLowerCase());
        if (tSubs.length > 0) {
          activeSchedules = activeSchedules.filter(sch => tSubs.some(ts => String(sch.subject || '').toLowerCase().includes(ts)));
        }
      }
      if (activeSchedules.length === 0) {
        schedListEl.innerHTML = `
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 text-xs text-slate-500 text-center">
            Belum ada jadwal mapel berstatus <strong>Aktif</strong> saat ini.
          </div>
        `;
      } else {
        schedListEl.innerHTML = activeSchedules.slice(0, 4).map(sch => `
          <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 flex items-center justify-between gap-2 text-xs">
            <div class="min-w-0">
              <div class="font-bold text-slate-800 dark:text-slate-100 truncate">${escapeHtmlSafe(sch.subject || '-')}</div>
              <div class="text-[10px] text-slate-500 truncate">${escapeHtmlSafe(sch.day || '')} ${escapeHtmlSafe(sch.date || '')} • ${escapeHtmlSafe(sch.time || '')} (${sch.durationMinutes || 80} mnt)</div>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-mono font-black text-[11px] shrink-0" title="Token Ujian">
              ${escapeHtmlSafe(sch.token || '-')}
            </span>
          </div>
        `).join('') + (activeSchedules.length > 4 ? `<p class="text-[10px] text-slate-400 text-right font-semibold">+ ${activeSchedules.length - 4} jadwal aktif lainnya</p>` : '');
      }
    }

    // 7. Ringkasan 5 Nilai Terbaru / Teratas
    const recentEl = document.getElementById('dashboardRecentResultsList');
    if (recentEl) {
      if (scopedResults.length === 0) {
        recentEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada peserta yang menyelesaikan ujian.</p>`;
      } else {
        const topSlice = scopedResults.slice(0, 5);
        recentEl.innerHTML = `
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold">
                <th class="py-2 px-2.5 text-center w-10">#</th>
                <th class="py-2 px-2.5">Nama Siswa</th>
                <th class="py-2 px-2.5">Kelas</th>
                <th class="py-2 px-2.5">Mata Pelajaran</th>
                <th class="py-2 px-2.5 text-center">B / S / K</th>
                <th class="py-2 px-2.5 text-center">Nilai</th>
                <th class="py-2 px-2.5">Waktu Selesai</th>
              </tr>
            </thead>
            <tbody>
              ${topSlice.map((r, i) => `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td class="py-2 px-2.5 text-center font-bold text-slate-500">${i + 1}</td>
                  <td class="py-2 px-2.5 font-bold text-slate-800 dark:text-slate-100">${escapeHtmlSafe(r.student?.name || '-')}</td>
                  <td class="py-2 px-2.5"><span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">${escapeHtmlSafe(r.student?.class ? 'Kelas ' + r.student.class : '-')}</span></td>
                  <td class="py-2 px-2.5 text-slate-600 dark:text-slate-300 font-medium">${escapeHtmlSafe(r.subject || '-')}</td>
                  <td class="py-2 px-2.5 text-center font-bold whitespace-nowrap">
                    <span class="text-emerald-600">✓${r.correctCount || 0}</span>
                    <span class="text-red-500 ml-1">✗${r.incorrectCount || 0}</span>
                    <span class="text-slate-400 ml-1">?${r.unattemptedCount || 0}</span>
                  </td>
                  <td class="py-2 px-2.5 text-center">
                    <span class="inline-flex px-2 py-0.5 rounded-md font-black text-[11px] ${Number(r.finalScore || 0) >= 75 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${r.finalScore ?? 0}</span>
                  </td>
                  <td class="py-2 px-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">${escapeHtmlSafe(r.completedAt || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    }
  }

  function refreshVisibleD3Charts() {
    const dashPane = document.getElementById('tabDashboard');
    if (viewAdmin && !viewAdmin.classList.contains('hidden') && dashPane && !dashPane.classList.contains('hidden')) {
      renderDashboardScoreDistChart(lastDashboardResultsCache);
    }
    const empSec = document.getElementById('empiricalAnalysisSection');
    const panel = document.getElementById('itemAnalysisPanel');
    if (panel && !panel.classList.contains('hidden') && empSec && !empSec.classList.contains('hidden') && lastEmpiricalAnalysisCache) {
      renderItemAnalysisD3Charts(lastEmpiricalAnalysisCache.analysis, lastEmpiricalAnalysisCache.qualityFilter);
    }
  }

  // ===================== TAB KHUSUS ADMIN: JADWAL UJIAN & AKTIFKAN MAPEL =====================
  const schInputDate = document.getElementById('schInputDate');
  const schInputDay = document.getElementById('schInputDay');
  const btnSchRandomToken = document.getElementById('btnSchRandomToken');
  const btnCancelEditSchedule = document.getElementById('btnCancelEditSchedule');
  const formScheduleItem = document.getElementById('formScheduleItem');

  function syncDayFromScheduleDate() {
    if (!schInputDate || !schInputDay || !window.cbtAdmin) return;
    const dayName = window.cbtAdmin.getIndonesianDayName(schInputDate.value);
    if (dayName) schInputDay.value = dayName;
  }

  if (schInputDate) {
    if (!schInputDate.value) {
      schInputDate.value = '2026-12-07';
      syncDayFromScheduleDate();
    }
    schInputDate.addEventListener('change', syncDayFromScheduleDate);
  }

  if (btnSchRandomToken) {
    btnSchRandomToken.addEventListener('click', () => {
      const tokenEl = document.getElementById('schInputToken');
      if (tokenEl && window.cbtAdmin) tokenEl.value = window.cbtAdmin.generateRandomToken();
    });
  }

  function populateScheduleSubjectDatalist() {
    const dl = document.getElementById('scheduleSubjectList');
    if (!dl || !window.cbtAdmin) return;
    const subjects = window.cbtAdmin.getAllSubjects();
    dl.innerHTML = subjects.map(s => `<option value="${s}">`).join('');
  }

  function resetScheduleForm() {
    if (!formScheduleItem) return;
    formScheduleItem.reset();
    const idEl = document.getElementById('editScheduleId');
    const titleEl = document.getElementById('scheduleFormTitle');
    const submitBtn = document.getElementById('btnSubmitSchedule');
    if (idEl) idEl.value = '';
    if (schInputDate) {
      schInputDate.value = '2026-12-07';
      syncDayFromScheduleDate();
    }
    const timeEl = document.getElementById('schInputTime');
    const durEl = document.getElementById('schInputDuration');
    const attEl = document.getElementById('schInputMaxAttempts');
    if (timeEl) timeEl.value = '07:30 - 08:50';
    if (durEl) durEl.value = '80';
    if (attEl) attEl.value = '1';
    if (titleEl) titleEl.innerText = '+ Tambah Jadwal Ujian';
    if (submitBtn) submitBtn.innerText = '💾 Simpan ke Daftar Jadwal';
    if (btnCancelEditSchedule) btnCancelEditSchedule.classList.add('hidden');
  }

  function openEditScheduleForm(sched) {
    if (!sched) return;
    document.getElementById('editScheduleId').value = sched.id || '';
    document.getElementById('schInputDate').value = sched.dateIso || '2026-12-07';
    document.getElementById('schInputDay').value = sched.day || 'Senin';
    document.getElementById('schInputSubject').value = sched.subject || '';
    document.getElementById('schInputClass').value = sched.classLevel || '';
    document.getElementById('schInputTime').value = sched.timeRange || '07:30 - 08:50';
    document.getElementById('schInputDuration').value = sched.durationMinutes || 80;
    const attEl = document.getElementById('schInputMaxAttempts');
    if (attEl) attEl.value = sched.maxAttempts || 1;
    document.getElementById('schInputToken').value = sched.token || '';

    const titleEl = document.getElementById('scheduleFormTitle');
    const submitBtn = document.getElementById('btnSubmitSchedule');
    if (titleEl) titleEl.innerText = '✏️ Edit Jadwal Ujian';
    if (submitBtn) submitBtn.innerText = '💾 Simpan Perubahan Jadwal';
    if (btnCancelEditSchedule) btnCancelEditSchedule.classList.remove('hidden');
  }

  if (btnCancelEditSchedule) {
    btnCancelEditSchedule.addEventListener('click', resetScheduleForm);
  }

  const btnDeactivateAllSchedules = document.getElementById('btnDeactivateAllSchedules');
  if (btnDeactivateAllSchedules) {
    btnDeactivateAllSchedules.addEventListener('click', () => {
      if (!window.cbtAdmin || !window.cbtAdmin.isSuperAdminUser()) return;
      if (confirm("Nonaktifkan seluruh jadwal mapel ujian yang sedang aktif saat ini?")) {
        window.cbtAdmin.deactivateSchedule(null);
        renderAdminSchedulesList();
        renderConfigInfoOnLogin();
        renderAdminConfigForm();
      }
    });
  }

  if (formScheduleItem) {
    formScheduleItem.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!window.cbtAdmin || !window.cbtAdmin.isSuperAdminUser()) {
        alert("Akses ditolak! Pengaturan jadwal ujian hanya tersedia di Panel Admin.");
        return;
      }

      const editId = document.getElementById('editScheduleId').value.trim();
      const payload = {
        dateIso: document.getElementById('schInputDate').value.trim(),
        day: document.getElementById('schInputDay').value,
        subject: document.getElementById('schInputSubject').value.trim(),
        classLevel: document.getElementById('schInputClass').value.trim(),
        timeRange: document.getElementById('schInputTime').value.trim(),
        durationMinutes: parseInt(document.getElementById('schInputDuration').value, 10) || 80,
        maxAttempts: parseInt(document.getElementById('schInputMaxAttempts')?.value, 10) || 1,
        token: document.getElementById('schInputToken').value.trim().toUpperCase()
      };

      const res = editId
        ? window.cbtAdmin.updateSchedule(editId, payload)
        : window.cbtAdmin.addSchedule(payload);

      if (res.success) {
        resetScheduleForm();
        renderAdminSchedulesList();
        setupSubjectAndClassFilters();
        setupMonitoringControls();
        renderConfigInfoOnLogin();
        renderAdminConfigForm();
      } else {
        alert(res.message);
      }
    });
  }

  function renderAdminSchedulesList() {
    if (!window.cbtAdmin || !window.cbtAdmin.isSuperAdminUser()) return;

    const tbody = document.getElementById('adminSchedulesTbody');
    const bannerTextEl = document.getElementById('activeScheduleBannerText');
    const deactivateAllBtn = document.getElementById('btnDeactivateAllSchedules');
    const cfg = window.examEngine.config;
    const activeSchedules = window.cbtAdmin.getActiveSchedules();

    populateScheduleSubjectDatalist();

    if (bannerTextEl) {
      if (activeSchedules.length > 1) {
        const names = activeSchedules.map(s => `${s.subject} (${s.classLevel})`).join(', ');
        bannerTextEl.innerText = `${activeSchedules.length} Mapel Aktif Serentak: ${names}`;
      } else if (activeSchedules.length === 1) {
        const s = activeSchedules[0];
        const classLabel = s.classLevel && s.classLevel !== 'Semua Kelas' ? ` (${s.classLevel})` : '';
        bannerTextEl.innerText = `Mapel Aktif: ${s.subject}${classLabel} • ${s.day}, ${s.dateFormatted || window.cbtAdmin.formatIndonesianDate(s.dateIso)} • Token: ${s.token}`;
      } else {
        bannerTextEl.innerText = `Belum Ada Jadwal Aktif (Mode Manual: ${cfg.subject} • Token: ${cfg.examToken})`;
      }
    }

    if (deactivateAllBtn) {
      if (activeSchedules.length > 0) deactivateAllBtn.classList.remove('hidden');
      else deactivateAllBtn.classList.add('hidden');
    }

    if (!tbody) return;
    tbody.innerHTML = '';

    const schedules = window.cbtAdmin.getAllSchedules();
    if (schedules.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Belum ada jadwal ujian. Tambahkan jadwal di formulir sebelah kiri.</td></tr>`;
      return;
    }

    schedules.forEach((s, idx) => {
      const isActive = Boolean(s.isActive);
      const maxAtt = window.examEngine ? window.examEngine.getMaxAttemptsForSubject(s.subject, s) : (s.maxAttempts || 1);
      const tr = document.createElement('tr');
      tr.className = `border-b border-slate-100 transition ${isActive ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`;
      tr.innerHTML = `
        <td class="p-3 text-center font-bold text-slate-400">${idx + 1}</td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-bold text-slate-900">${s.day}, ${s.dateFormatted || window.cbtAdmin.formatIndonesianDate(s.dateIso)}</div>
          <div class="text-[10px] font-mono text-slate-400">${s.dateIso}</div>
        </td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${s.subject}</div>
          <div class="flex flex-wrap items-center gap-1 mt-0.5">
            <span class="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px]">${s.classLevel}</span>
            <span class="inline-block px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px]">Maks ${maxAtt}x Uji</span>
            ${(() => {
              const qInfo = window.examEngine && window.examEngine.getQuestionsForExam
                ? window.examEngine.getQuestionsForExam(s.subject, s.classLevel)
                : { questions: [], isFallback: true };
              return qInfo.isFallback
                ? `<span class="inline-block px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold text-[10px]">0 Soal Khusus</span>`
                : `<span class="inline-block px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">${qInfo.questions.length} Soal Siap</span>`;
            })()}
          </div>
        </td>
        <td class="p-3 whitespace-nowrap text-slate-600">
          <div class="font-semibold">${s.timeRange || '-'}</div>
          <div class="text-[10px] text-slate-400">${s.durationMinutes} Menit</div>
        </td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded-lg bg-slate-100 text-blue-700 font-mono font-black text-xs">${s.token}</span>
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          ${isActive
            ? `<div class="flex flex-col items-center gap-1">
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-200">✓ Sedang Aktif</span>
                <button type="button" class="btn-deactivate-schedule px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] cursor-pointer">Nonaktifkan</button>
              </div>`
            : `<button type="button" class="btn-activate-schedule px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition cursor-pointer">▶ Aktifkan Mapel</button>`
          }
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          <button type="button" class="btn-edit-schedule text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded text-xs cursor-pointer mr-1" title="Edit Jadwal">✏️</button>
          <button type="button" class="btn-delete-schedule text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded text-xs cursor-pointer" title="Hapus Jadwal">🗑️</button>
        </td>
      `;

      const activateBtn = tr.querySelector('.btn-activate-schedule');
      if (activateBtn) {
        activateBtn.addEventListener('click', () => {
          const res = window.cbtAdmin.activateSchedule(s.id);
          if (res.success) {
            renderAdminSchedulesList();
            renderConfigInfoOnLogin();
            renderAdminConfigForm();
            setupSubjectAndClassFilters();
            const countNow = window.cbtAdmin.getActiveSchedules().length;
            alert(`Mapel "${s.subject}" (${s.classLevel}) berhasil DIAKTIFKAN!\nToken Ujian: ${s.token}\nTotal mapel ujian aktif saat ini: ${countNow} mapel.`);
          } else {
            alert(res.message);
          }
        });
      }

      const deactivateBtn = tr.querySelector('.btn-deactivate-schedule');
      if (deactivateBtn) {
        deactivateBtn.addEventListener('click', () => {
          const res = window.cbtAdmin.deactivateSchedule(s.id);
          if (res.success) {
            renderAdminSchedulesList();
            renderConfigInfoOnLogin();
            renderAdminConfigForm();
          } else {
            alert(res.message);
          }
        });
      }

      tr.querySelector('.btn-edit-schedule').addEventListener('click', () => openEditScheduleForm(s));
      tr.querySelector('.btn-delete-schedule').addEventListener('click', () => {
        if (confirm(`Hapus jadwal "${s.subject} (${s.classLevel})" tanggal ${s.day}, ${s.dateFormatted}?`)) {
          const res = window.cbtAdmin.deleteSchedule(s.id);
          if (res.success) {
            renderAdminSchedulesList();
            renderConfigInfoOnLogin();
            renderAdminConfigForm();
            setupSubjectAndClassFilters();
          } else {
            alert(res.message);
          }
        }
      });

      tbody.appendChild(tr);
    });
  }

  // ===================== FILTER MAPEL & KELAS =====================
  let selectedConsultAttemptIdx = 0;

  function getStudentConsultKey(resultRecord) {
    const nisn = String(resultRecord?.student?.nisn || '').trim();
    const name = String(resultRecord?.student?.name || '').trim();
    return nisn ? `NISN:${nisn}` : `NAME:${name.toLowerCase()}`;
  }

  function setupSubjectAndClassFilters() {
    const subjSelect = document.getElementById('filterResultsSubject');
    const classSelect = document.getElementById('filterResultsClass');
    if (!subjSelect || !classSelect || !window.cbtAdmin) return;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
    const assignedClasses = (!isAdmin && currentTeacher && currentTeacher.classes)
      ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes)
      : [];

    const allSubjects = window.cbtAdmin.getAllSubjects();
    const ownedSubjects = isAdmin ? allSubjects : teacherSubjects;

    subjSelect.innerHTML = '';
    if (isAdmin) {
      const optAll = document.createElement('option');
      optAll.value = 'ALL';
      optAll.innerText = 'Semua Mata Pelajaran';
      subjSelect.appendChild(optAll);
    } else if (ownedSubjects.length > 1) {
      const optOwned = document.createElement('option');
      optOwned.value = 'ALL';
      optOwned.innerText = `Mapel Diampu (${ownedSubjects.join(' / ')})`;
      subjSelect.appendChild(optOwned);
    } else if (ownedSubjects.length === 0) {
      const optEmpty = document.createElement('option');
      optEmpty.value = 'ALL';
      optEmpty.innerText = 'Belum Ada Mapel Diampu';
      subjSelect.appendChild(optEmpty);
    }

    ownedSubjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.innerText = s;
      subjSelect.appendChild(opt);
    });

    const allowedVals = Array.from(subjSelect.options).map(o => o.value);
    if (window.cbtAdmin.selectedSubjectFilter && allowedVals.includes(window.cbtAdmin.selectedSubjectFilter)) {
      subjSelect.value = window.cbtAdmin.selectedSubjectFilter;
    } else if (!isAdmin && ownedSubjects.length === 1) {
      subjSelect.value = ownedSubjects[0];
    } else if (subjSelect.options.length > 0) {
      subjSelect.selectedIndex = 0;
    }
    window.cbtAdmin.setSubjectFilter(subjSelect.value || 'ALL');

    const studentClasses = window.studentManager ? window.studentManager.getAllClasses() : [];
    const matchedStudentClasses = assignedClasses.length > 0
      ? studentClasses.filter(c => window.examEngine.matchesClassLevel(assignedClasses.join(', '), c))
      : studentClasses;
    const classesToShow = assignedClasses.length > 0
      ? (matchedStudentClasses.length > 0 ? matchedStudentClasses : assignedClasses)
      : studentClasses;

    classSelect.innerHTML = assignedClasses.length > 0
      ? `<option value="ALL">Kelas Diampu (${assignedClasses.join(', ')})</option>`
      : '<option value="ALL">Semua Kelas</option>';
    classesToShow.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = `Kelas ${c}`;
      classSelect.appendChild(opt);
    });
    const allowedClasses = Array.from(classSelect.options).map(o => o.value);
    if (window.cbtAdmin.selectedClassFilter && allowedClasses.includes(window.cbtAdmin.selectedClassFilter)) {
      classSelect.value = window.cbtAdmin.selectedClassFilter;
    } else {
      classSelect.value = 'ALL';
    }
    window.cbtAdmin.setClassFilter(classSelect.value || 'ALL');

    subjSelect.onchange = (e) => {
      window.cbtAdmin.setSubjectFilter(e.target.value);
      selectedConsultAttemptIdx = 0;
      renderAdminAnalyticsAndResults({ animateRows: true });
    };

    classSelect.onchange = (e) => {
      window.cbtAdmin.setClassFilter(e.target.value);
      selectedConsultAttemptIdx = 0;
      renderAdminAnalyticsAndResults({ animateRows: true });
    };

    const searchResultsInput = document.getElementById('searchResultsInput');
    if (searchResultsInput) {
      searchResultsInput.oninput = () => renderAdminAnalyticsAndResults({ animateRows: false });
    }

    const filterResultsStudent = document.getElementById('filterResultsStudent');
    if (filterResultsStudent) {
      filterResultsStudent.onchange = () => {
        selectedConsultAttemptIdx = 0;
        renderAdminAnalyticsAndResults({ animateRows: true });
      };
    }

    const btnResetConsult = document.getElementById('btnResetConsultStudent');
    if (btnResetConsult) {
      btnResetConsult.onclick = () => {
        const stuSel = document.getElementById('filterResultsStudent');
        if (stuSel) stuSel.value = 'ALL';
        selectedConsultAttemptIdx = 0;
        renderAdminAnalyticsAndResults();
      };
    }
  }

  function renderStudentConsultationPanel(sortedResults = []) {
    const panel = document.getElementById('studentConsultationPanel');
    const stuSel = document.getElementById('filterResultsStudent');
    if (!panel || !stuSel || !window.cbtAdmin) return;

    const prevKey = stuSel.value || 'ALL';
    const studentMap = new Map();
    sortedResults.forEach(r => {
      const key = getStudentConsultKey(r);
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          key,
          name: r.student?.name || '-',
          nisn: r.student?.nisn || '-',
          cls: r.student?.class || '-',
          attempts: []
        });
      }
      studentMap.get(key).attempts.push(r);
    });

    const uniqueStudents = Array.from(studentMap.values())
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));

    stuSel.innerHTML = '<option value="ALL">👤 Konsultasi 1 Siswa (Semua)</option>';
    uniqueStudents.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.key;
      const clsTxt = st.cls && st.cls !== '-' ? ` • ${st.cls}` : '';
      const countTxt = st.attempts.length > 1 ? ` (${st.attempts.length}x)` : '';
      opt.innerText = `${st.name} (${st.nisn}${clsTxt})${countTxt}`;
      stuSel.appendChild(opt);
    });

    const selectedKey = studentMap.has(prevKey) ? prevKey : 'ALL';
    stuSel.value = selectedKey;

    if (selectedKey === 'ALL') {
      panel.classList.add('hidden');
      return;
    }

    const studentGroup = studentMap.get(selectedKey);
    const attempts = studentGroup ? studentGroup.attempts : [];
    if (attempts.length === 0) {
      panel.classList.add('hidden');
      return;
    }

    const wasHidden = panel.classList.contains('hidden');
    panel.classList.remove('hidden');
    if (wasHidden) {
      panel.classList.remove('cbt-consult-reveal');
      void panel.offsetWidth;
      panel.classList.add('cbt-consult-reveal');
    }
    if (selectedConsultAttemptIdx >= attempts.length) selectedConsultAttemptIdx = 0;
    const activeRecord = attempts[selectedConsultAttemptIdx] || attempts[0];

    const attemptSelect = document.getElementById('consultAttemptSelect');
    if (attemptSelect) {
      if (attempts.length > 1) {
        attemptSelect.classList.remove('hidden');
        attemptSelect.innerHTML = '';
        attempts.forEach((att, idx) => {
          const opt = document.createElement('option');
          opt.value = String(idx);
          opt.innerText = `Riwayat #${idx + 1}: ${att.subject || '-'} • Nilai ${att.finalScore ?? 0} (${att.completedAt || '-'})`;
          attemptSelect.appendChild(opt);
        });
        attemptSelect.value = String(selectedConsultAttemptIdx);
        attemptSelect.onchange = (e) => {
          selectedConsultAttemptIdx = parseInt(e.target.value, 10) || 0;
          renderStudentConsultationPanel(sortedResults);
        };
      } else {
        attemptSelect.classList.add('hidden');
      }
    }

    const titleEl = document.getElementById('consultStudentTitle');
    const metaEl = document.getElementById('consultStudentMeta');
    if (titleEl) titleEl.innerText = `${activeRecord.student?.name || '-'} (${activeRecord.student?.nisn || '-'})`;
    if (metaEl) {
      const clsDisplay = activeRecord.student?.class ? `Kelas ${activeRecord.student.class}` : 'Kelas -';
      metaEl.innerText = `${clsDisplay} • Mapel: ${activeRecord.subject || '-'} • Selesai: ${activeRecord.completedAt || '-'}`;
    }

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = String(val);
    };
    setTxt('consultScoreVal', activeRecord.finalScore ?? 0);
    setTxt('consultCorrectVal', activeRecord.correctCount ?? 0);
    setTxt('consultWrongVal', activeRecord.incorrectCount ?? 0);
    setTxt('consultEmptyVal', activeRecord.unattemptedCount ?? 0);
    const cheats = Number(activeRecord.cheatCount || 0);
    setTxt('consultCheatVal', cheats > 0 ? `${cheats}x Pelanggaran` : 'Tertib (0)');

    const tbody = document.getElementById('consultBreakdownTbody');
    if (!tbody) return;
    const items = window.cbtAdmin.getAnswerBreakdownItems(activeRecord);
    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Rincian jawaban per nomor tidak tersedia pada riwayat ini.</td></tr>`;
      return;
    }

    const bankQuestions = (window.examEngine && Array.isArray(window.examEngine.questions))
      ? window.examEngine.questions
      : [];
    const byId = new Map(bankQuestions.map(q => [String(q.id), q]));

    tbody.innerHTML = items.map(it => {
      const matchedQ = (it.id !== undefined && it.id !== null) ? byId.get(String(it.id)) : null;
      const snippet = matchedQ && matchedQ.question
        ? escapeHtmlSafe(String(matchedQ.question).replace(/\s+/g, ' ').slice(0, 140)) + (String(matchedQ.question).length > 140 ? '…' : '')
        : `<span class="text-slate-400 italic">Butir Soal Nomor ${it.num}</span>`;

      let badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px]">Kosong</span>`;
      if (it.status === 'correct') {
        badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">✓ Benar</span>`;
      } else if (it.status === 'wrong') {
        badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px]">✗ Salah</span>`;
      }

      return `
        <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70">
          <td class="p-2.5 text-center font-black text-slate-600">${it.num}</td>
          <td class="p-2.5 text-slate-700 dark:text-slate-200 leading-snug">${snippet}</td>
          <td class="p-2.5 text-center font-mono font-bold text-slate-800">${escapeHtmlSafe(it.studentVal || '-')}</td>
          <td class="p-2.5 text-center font-mono font-bold text-blue-700">${escapeHtmlSafe(it.correctVal || '-')}</td>
          <td class="p-2.5 text-center">${badgeHtml}</td>
        </tr>
      `;
    }).join('');
  }

  // ===================== TAB 1: REKAP NILAI & EVALUASI JAWABAN PER NOMOR =====================
  function triggerResultsKpiPop() {
    ['kpiAvgScore', 'kpiHighestScore', 'kpiLowestScore', 'kpiTotalStudents'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('cbt-kpi-pop');
      void el.offsetWidth;
      el.classList.add('cbt-kpi-pop');
    });
  }

  function renderAdminAnalyticsAndResults(options = {}) {
    if (!options._seq) {
      cbtResultsLoadSeq += 1;
    }
    const animateRows = options.animateRows !== false;
    clearResultsLoadingState();

    const analytics = window.cbtAdmin.getExamAnalytics();
    const sortedResults = window.cbtAdmin.getAllResultsSorted();
    const searchQuery = (document.getElementById('searchResultsInput')?.value || '').trim().toLowerCase();

    renderStudentConsultationPanel(sortedResults);
    const selectedConsultStudentKey = document.getElementById('filterResultsStudent')?.value || 'ALL';

    document.getElementById('kpiAvgScore').innerText = analytics.averageScore;
    document.getElementById('kpiHighestScore').innerText = analytics.highestScore;
    document.getElementById('kpiHighestStudent').innerText = analytics.highestStudent;
    document.getElementById('kpiLowestScore').innerText = analytics.lowestScore;
    document.getElementById('kpiLowestStudent').innerText = analytics.lowestStudent;
    document.getElementById('kpiTotalStudents').innerText = `${analytics.totalStudents} Siswa`;
    document.getElementById('kpiPassRate').innerText = `Ketuntasan (≥75): ${analytics.passRatePercentage}%`;

    if (animateRows) {
      triggerResultsKpiPop();
    }

    const tbody = document.getElementById('adminResultsTbody');
    const emptyRow = document.getElementById('adminResultsEmpty');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (sortedResults.length === 0) {
      if (emptyRow) emptyRow.classList.remove('hidden');
      return;
    }

    const rankedResults = sortedResults
      .map((r, idx) => ({ r, rank: idx + 1 }))
      .filter(({ r }) => {
        if (selectedConsultStudentKey !== 'ALL' && getStudentConsultKey(r) !== selectedConsultStudentKey) {
          return false;
        }
        if (!searchQuery) return true;
        const name = String(r.student?.name || '').toLowerCase();
        const nisn = String(r.student?.nisn || '').toLowerCase();
        const cls = String(r.student?.class || '').toLowerCase();
        return name.includes(searchQuery) || nisn.includes(searchQuery) || cls.includes(searchQuery);
      });

    if (rankedResults.length === 0) {
      if (emptyRow) emptyRow.classList.add('hidden');
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="p-6 text-center text-slate-500 text-xs sm:text-sm font-medium">
            Tidak ada peserta yang cocok dengan filter pencarian aktif.
          </td>
        </tr>
      `;
      return;
    }

    if (emptyRow) emptyRow.classList.add('hidden');

    rankedResults.forEach(({ r, rank }, rowIdx) => {
      let rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-black text-xs inline-flex items-center justify-center">${rank}</span>`;
      if (rank === 1) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-black text-xs inline-flex items-center justify-center shadow-xs">🥇 1</span>`;
      } else if (rank === 2) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-black text-xs inline-flex items-center justify-center shadow-xs">🥈 2</span>`;
      } else if (rank === 3) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-50 text-amber-900 border border-amber-300 font-black text-xs inline-flex items-center justify-center shadow-xs">🥉 3</span>`;
      }

      const items = window.cbtAdmin.getAnswerBreakdownItems(r);
      const answerChipsHtml = items.length > 0
        ? `<div class="flex flex-wrap gap-1">${items.map(it => {
            if (it.status === 'correct') {
              return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold font-mono" title="No.${it.num} Benar (Kunci: ${it.correctVal})">${it.num}:${it.studentVal}✓</span>`;
            }
            if (it.status === 'unattempted') {
              return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600 text-[10px] font-bold font-mono" title="No.${it.num} Kosong (Kunci: ${it.correctVal})">${it.num}:-(K:${it.correctVal})</span>`;
            }
            return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold font-mono" title="No.${it.num} Salah (Jawaban: ${it.studentVal}, Kunci: ${it.correctVal})">${it.num}:${it.studentVal}✗(K:${it.correctVal})</span>`;
          }).join('')}</div>`
        : `<span class="text-[11px] text-slate-400">Belum ada rincian jawaban</span>`;

      const stuKey = getStudentConsultKey(r);
      const tr = document.createElement('tr');
      tr.className = `border-b border-slate-100 hover:bg-slate-50 transition text-xs${animateRows ? ' cbt-result-row-in' : ''}`;
      if (animateRows) {
        tr.style.setProperty('--row-idx', String(rowIdx));
      }
      tr.innerHTML = `
        <td class="px-2.5 py-2.5 text-center font-bold">${rankBadge}</td>
        <td class="px-2.5 py-2.5">
          <div class="font-bold text-slate-900">${escapeHtmlSafe(r.student?.name || '-')}</div>
          <div class="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span class="text-[10px] text-slate-400">${escapeHtmlSafe(r.subject || '-')}</span>
            <button type="button" class="btn-consult-student text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer" title="Buka riwayat jawaban lengkap siswa ini untuk konsultasi nilai">💬 Konsultasi</button>
          </div>
        </td>
        <td class="px-2.5 py-2.5 font-mono font-semibold text-slate-700">${escapeHtmlSafe(r.student?.nisn || '-')}</td>
        <td class="px-2.5 py-2.5 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs">${r.student?.class ? 'Kelas ' + escapeHtmlSafe(r.student.class) : '-'}</span>
        </td>
        <td class="px-2.5 py-2.5 text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black ${
            r.finalScore >= 75
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              : 'bg-amber-100 text-amber-800 border border-amber-200'
          }">
            ${r.finalScore}
          </span>
        </td>
        <td class="px-2.5 py-2.5">${answerChipsHtml}</td>
        <td class="px-2.5 py-2.5 text-slate-600 font-mono text-[11px] whitespace-nowrap">${escapeHtmlSafe(r.completedAt || '-')}</td>
        <td class="px-2.5 py-2.5 text-center whitespace-nowrap">
          <div class="inline-flex items-center gap-1.5 font-bold">
            <span class="text-emerald-600">✓${r.correctCount}</span>
            <span class="text-red-500">✗${r.incorrectCount}</span>
            <span class="text-slate-400">?${r.unattemptedCount}</span>
          </div>
        </td>
        <td class="px-2.5 py-2.5 whitespace-nowrap">
          ${(r.cheatCount || 0) > 0
            ? `<span class="text-[11px] font-bold px-2 py-0.5 bg-red-100 text-red-600 rounded inline-block">${r.cheatCount}x Pindah Tab</span>`
            : `<span class="text-[11px] text-emerald-600 font-medium">Tertib (0)</span>`
          }
        </td>
      `;
      const btnConsult = tr.querySelector('.btn-consult-student');
      if (btnConsult) {
        btnConsult.addEventListener('click', () => {
          const stuSel = document.getElementById('filterResultsStudent');
          if (stuSel) stuSel.value = stuKey;
          selectedConsultAttemptIdx = 0;
          renderAdminAnalyticsAndResults();
          document.getElementById('studentConsultationPanel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      tbody.appendChild(tr);
    });
  }

  const btnExportExcel = document.getElementById('btnExportExcel');
  if (btnExportExcel) btnExportExcel.addEventListener('click', () => window.cbtAdmin.exportResultsExcel());

  const btnExportPDF = document.getElementById('btnExportPDF');
  if (btnExportPDF) btnExportPDF.addEventListener('click', () => window.cbtAdmin.exportResultsPDF());

  const btnClearAllResults = document.getElementById('btnClearAllResults');
  if (btnClearAllResults) {
    btnClearAllResults.addEventListener('click', () => {
      if (confirm("Peringatan: Yakin ingin menghapus seluruh riwayat rekap nilai ujian?")) {
        window.cbtAdmin.clearAllResults();
        renderAdminAnalyticsAndResults();
      }
    });
  }

  // ===================== TAB PANTAU LOGIN SISWA & ATURAN PERCOBAAN =====================
  function setupMonitoringControls() {
    if (!window.cbtAdmin) return;
    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
    const assignedClasses = (!isAdmin && currentTeacher && currentTeacher.classes)
      ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes)
      : [];

    const ruleSubjEl = document.getElementById('attemptRuleSubject');
    const ruleMaxEl = document.getElementById('attemptRuleMax');
    const btnSaveRule = document.getElementById('btnSaveAttemptRule');
    const monSubjEl = document.getElementById('filterMonitoringSubject');
    const monClassEl = document.getElementById('filterMonitoringClass');
    const monStatusEl = document.getElementById('filterMonitoringStatus');
    const monSearchEl = document.getElementById('searchMonitoringInput');
    const btnRefreshMon = document.getElementById('btnRefreshMonitoring');

    const allSubjects = window.cbtAdmin.getAllSubjects();
    const ownedSubjects = isAdmin ? allSubjects : teacherSubjects;

    if (ruleSubjEl) {
      const prevRuleSub = ruleSubjEl.value;
      ruleSubjEl.innerHTML = '';
      ownedSubjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.innerText = s;
        ruleSubjEl.appendChild(opt);
      });
      if (prevRuleSub && ownedSubjects.includes(prevRuleSub)) {
        ruleSubjEl.value = prevRuleSub;
      } else if (ownedSubjects.length > 0) {
        ruleSubjEl.selectedIndex = 0;
      }

      const syncRuleMaxVal = () => {
        if (!ruleMaxEl || !ruleSubjEl.value) return;
        const matchedSch = window.cbtAdmin.schedules.find(s => String(s.subject || '').toLowerCase() === ruleSubjEl.value.toLowerCase());
        ruleMaxEl.value = window.examEngine.getMaxAttemptsForSubject(ruleSubjEl.value, matchedSch);
      };
      syncRuleMaxVal();
      ruleSubjEl.onchange = syncRuleMaxVal;
    }

    if (btnSaveRule) {
      btnSaveRule.onclick = () => {
        const subj = ruleSubjEl ? ruleSubjEl.value : '';
        const maxVal = Math.max(1, Math.min(10, parseInt(ruleMaxEl ? ruleMaxEl.value : '1', 10) || 1));
        if (!subj) return;
        window.examEngine.setMaxAttemptsForSubject(subj, maxVal);
        if (window.cbtAdmin.isSuperAdminUser()) {
          let schChanged = false;
          window.cbtAdmin.schedules = window.cbtAdmin.schedules.map(s => {
            if (window.examEngine.matchesSubject(s.subject, subj)) {
              schChanged = true;
              return { ...s, maxAttempts: maxVal };
            }
            return s;
          });
          if (schChanged) window.cbtAdmin.saveSchedules(window.cbtAdmin.schedules);
          renderAdminSchedulesList();
        }
        renderMonitoringDashboard(false);
        alert(`Batas maksimal mengikuti ujian "${subj}" diatur menjadi ${maxVal} kali percobaan.\nSiswa yang sudah mencapai ${maxVal} kali akan ditolak otomatis oleh sistem.`);
      };
    }

    if (monSubjEl) {
      const prevMonSub = monSubjEl.value;
      monSubjEl.innerHTML = isAdmin
        ? '<option value="ALL">Semua Mata Pelajaran</option>'
        : (ownedSubjects.length > 1
            ? `<option value="ALL">Semua Mapel Diampu</option>`
            : (ownedSubjects.length === 0 ? '<option value="ALL">Belum Ada Mapel Diampu</option>' : ''));
      ownedSubjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.innerText = s;
        monSubjEl.appendChild(opt);
      });
      if (prevMonSub && Array.from(monSubjEl.options).some(o => o.value === prevMonSub)) {
        monSubjEl.value = prevMonSub;
      } else if (!isAdmin && ownedSubjects.length === 1) {
        monSubjEl.value = ownedSubjects[0];
      }
      monSubjEl.onchange = () => renderMonitoringDashboard(false);
    }

    if (monClassEl) {
      const prevMonCls = monClassEl.value;
      const studentClasses = window.studentManager ? window.studentManager.getAllClasses() : [];
      const matchedStudentClasses = assignedClasses.length > 0
        ? studentClasses.filter(c => window.examEngine.matchesClassLevel(assignedClasses.join(', '), c))
        : studentClasses;
      const classesToShow = assignedClasses.length > 0
        ? (matchedStudentClasses.length > 0 ? matchedStudentClasses : assignedClasses)
        : studentClasses;

      monClassEl.innerHTML = assignedClasses.length > 0
        ? `<option value="ALL">Kelas Diampu (${assignedClasses.join(', ')})</option>`
        : '<option value="ALL">Semua Kelas</option>';
      classesToShow.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = `Kelas ${c}`;
        monClassEl.appendChild(opt);
      });
      if (prevMonCls && Array.from(monClassEl.options).some(o => o.value === prevMonCls)) {
        monClassEl.value = prevMonCls;
      } else {
        monClassEl.value = 'ALL';
      }
      monClassEl.onchange = () => renderMonitoringDashboard(false);
    }

    if (monStatusEl) monStatusEl.onchange = () => renderMonitoringDashboard(false);
    if (monSearchEl) monSearchEl.oninput = () => renderMonitoringDashboard(false);

    if (btnRefreshMon) {
      btnRefreshMon.onclick = async () => {
        btnRefreshMon.disabled = true;
        btnRefreshMon.innerText = 'Menyegarkan...';
        await renderMonitoringDashboard(true);
        btnRefreshMon.disabled = false;
        btnRefreshMon.innerText = '🔄 Refresh Pantauan';
      };
    }
  }

  async function renderMonitoringDashboard(pullCloud = false) {
    const tbody = document.getElementById('adminMonitoringTbody');
    const emptyEl = document.getElementById('adminMonitoringEmpty');
    if (!tbody || !window.cbtAdmin) return;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
    const assignedClasses = (!isAdmin && currentTeacher && currentTeacher.classes)
      ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes)
      : [];

    if (pullCloud && window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
      const [sessRes] = await Promise.all([
        window.supabaseSync.fetchStudentSessions(),
        window.supabaseSync.fetchCloudResults()
      ]);
      if (sessRes && Array.isArray(sessRes.data)) {
        cachedMonitoringSessions = sessRes.data;
      }
    } else if (window.supabaseSync) {
      const localS = window.supabaseSync.getLocalStudentSessions();
      if (localS.length > 0 || cachedMonitoringSessions.length === 0) {
        const mergedMap = new Map();
        cachedMonitoringSessions.forEach(s => mergedMap.set(window.supabaseSync.buildSessionKey(s.nisn, s.subject), s));
        localS.forEach(s => mergedMap.set(window.supabaseSync.buildSessionKey(s.nisn, s.subject), s));
        cachedMonitoringSessions = Array.from(mergedMap.values());
      }
    }

    const subjFilter = document.getElementById('filterMonitoringSubject')?.value || 'ALL';
    const classFilter = document.getElementById('filterMonitoringClass')?.value || 'ALL';
    const statusFilter = document.getElementById('filterMonitoringStatus')?.value || 'ACTIVE';
    const searchQ = (document.getElementById('searchMonitoringInput')?.value || '').trim().toLowerCase();

    let allResults = [];
    try {
      allResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      if (!Array.isArray(allResults)) allResults = [];
    } catch (e) {
      allResults = [];
    }

    const attemptsMap = new Map();
    const latestResultMap = new Map();
    allResults.forEach(r => {
      const nisn = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
      const sub = String(r.subject || '').trim();
      if (!nisn || !sub) return;
      const key = `${nisn}__${sub.toLowerCase()}`;
      attemptsMap.set(key, (attemptsMap.get(key) || 0) + 1);
      if (!latestResultMap.has(key)) latestResultMap.set(key, r);
    });

    const rowMap = new Map();
    cachedMonitoringSessions.forEach(s => {
      const nisn = String(s.nisn || '').trim().toUpperCase();
      const sub = String(s.subject || '').trim();
      if (!nisn || !sub) return;
      const key = `${nisn}__${sub.toLowerCase()}`;
      const attCount = attemptsMap.get(key) || 0;
      rowMap.set(key, {
        nisn,
        name: s.name || '-',
        class: s.class || '-',
        subject: sub,
        status: s.status || 'logged_in',
        attemptNumber: s.attemptNumber || Math.max(1, attCount),
        attemptsCompleted: attCount,
        answeredCount: s.answeredCount || 0,
        totalQuestions: s.totalQuestions || 0,
        remainingSeconds: s.remainingSeconds || 0,
        cheatCount: s.cheatCount || 0,
        finalScore: s.finalScore,
        updatedAt: s.updatedAt || s.completedAt || s.startedAt || s.loginAt || ''
      });
    });

    latestResultMap.forEach((r, key) => {
      const existing = rowMap.get(key);
      const attCount = attemptsMap.get(key) || 1;
      if (!existing || (existing.status !== 'logged_in' && existing.status !== 'in_progress')) {
        rowMap.set(key, {
          nisn: String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase(),
          name: r.student?.name || '-',
          class: r.student?.class || '-',
          subject: r.subject || '-',
          status: 'completed',
          attemptNumber: attCount,
          attemptsCompleted: attCount,
          answeredCount: (r.totalQuestions || 0) - (r.unattemptedCount || 0),
          totalQuestions: r.totalQuestions || 0,
          remainingSeconds: 0,
          cheatCount: r.cheatCount || 0,
          finalScore: r.finalScore,
          updatedAt: r.completedAt || ''
        });
      } else {
        existing.attemptsCompleted = attCount;
      }
    });

    const activeSchedules = window.cbtAdmin.getActiveSchedules();
    const defaultSubject = subjFilter !== 'ALL'
      ? subjFilter
      : (activeSchedules.length === 1
        ? activeSchedules[0].subject
        : (!isAdmin && teacherSubjects.length > 0 ? teacherSubjects[0] : (window.examEngine.config.subject || 'Umum')));

    const allStudents = window.studentManager ? window.studentManager.getAllStudents() : [];
    const nisnWithActivityForScope = new Set();
    rowMap.forEach(row => {
      if (subjFilter === 'ALL' || window.examEngine.matchesSubject(row.subject, subjFilter)) {
        nisnWithActivityForScope.add(row.nisn);
      }
    });

    allStudents.forEach(stu => {
      const stuNisn = String(stu.nisn || '').trim().toUpperCase();
      if (!stuNisn || nisnWithActivityForScope.has(stuNisn)) return;
      const syntheticKey = `${stuNisn}__${String(defaultSubject).toLowerCase()}__none`;
      rowMap.set(syntheticKey, {
        nisn: stuNisn,
        name: stu.name || '-',
        class: stu.class || '-',
        subject: defaultSubject,
        status: 'not_logged_in',
        attemptNumber: 0,
        attemptsCompleted: 0,
        answeredCount: 0,
        totalQuestions: 0,
        remainingSeconds: 0,
        cheatCount: 0,
        updatedAt: ''
      });
    });

    const scopedRows = Array.from(rowMap.values()).filter(row => {
      if (!isAdmin) {
        const subOk = teacherSubjects.length > 0 && teacherSubjects.some(ts => window.examEngine.matchesSubject(row.subject, ts));
        if (!subOk) return false;
        if (assignedClasses.length > 0) {
          const stuCls = String(row.class || '').trim();
          if (!stuCls || !window.examEngine.matchesClassLevel(assignedClasses.join(', '), stuCls)) return false;
        }
      }
      if (subjFilter !== 'ALL' && !window.examEngine.matchesSubject(row.subject, subjFilter)) return false;
      if (classFilter !== 'ALL' && !window.examEngine.matchesClassLevel(classFilter, row.class || '')) return false;
      return true;
    });

    const kpiLoggedIn = scopedRows.filter(r => r.status === 'logged_in').length;
    const kpiInProgress = scopedRows.filter(r => r.status === 'in_progress').length;
    const kpiCompleted = scopedRows.filter(r => r.status === 'completed').length;
    const kpiNotLoggedIn = scopedRows.filter(r => r.status === 'not_logged_in').length;

    const k1 = document.getElementById('monKpiLoggedIn');
    const k2 = document.getElementById('monKpiInProgress');
    const k3 = document.getElementById('monKpiCompleted');
    const k4 = document.getElementById('monKpiNotLoggedIn');
    if (k1) k1.innerText = kpiLoggedIn;
    if (k2) k2.innerText = kpiInProgress;
    if (k3) k3.innerText = kpiCompleted;
    if (k4) k4.innerText = kpiNotLoggedIn;

    let displayRows = scopedRows.filter(r => {
      if (statusFilter === 'ACTIVE') return r.status !== 'not_logged_in';
      if (statusFilter !== 'ALL') return r.status === statusFilter;
      return true;
    });

    if (searchQ) {
      displayRows = displayRows.filter(r =>
        (r.name && r.name.toLowerCase().includes(searchQ)) ||
        (r.nisn && r.nisn.toLowerCase().includes(searchQ)) ||
        (r.class && r.class.toLowerCase().includes(searchQ))
      );
    }

    const statusPriority = { in_progress: 1, logged_in: 2, completed: 3, not_logged_in: 4 };
    displayRows.sort((a, b) => {
      const pDiff = (statusPriority[a.status] || 9) - (statusPriority[b.status] || 9);
      if (pDiff !== 0) return pDiff;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

    tbody.innerHTML = '';
    if (displayRows.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    displayRows.forEach((r, idx) => {
      const matchedSch = window.cbtAdmin.schedules.find(s => window.examEngine.matchesSubject(s.subject, r.subject));
      const maxAtt = window.examEngine.getMaxAttemptsForSubject(r.subject, matchedSch);
      let badgeHtml = `<span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px]">⏳ Belum Login</span>`;
      if (r.status === 'logged_in') {
        badgeHtml = `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[10px]">🔑 Sedang Login</span>`;
      } else if (r.status === 'in_progress') {
        badgeHtml = `<span class="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-bold text-[10px] inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>✍️ Sedang Mengerjakan</span>`;
      } else if (r.status === 'completed') {
        badgeHtml = `<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px]">✅ Sudah Selesai</span>`;
      }

      const progressText = r.status === 'not_logged_in'
        ? `<span class="text-slate-400">0/${maxAtt}x</span>`
        : `<div class="font-bold text-slate-800">${r.answeredCount}/${r.totalQuestions || '-'} Soal</div><div class="text-[10px] text-slate-500">Percobaan ${Math.max(1, r.attemptsCompleted || r.attemptNumber)} / Maks ${maxAtt}x</div>`;

      const timeStr = r.remainingSeconds > 0 ? window.examEngine.formatTime(r.remainingSeconds) : '-';
      const cheatHtml = (r.cheatCount || 0) > 0
        ? `<span class="text-red-600 font-bold">${r.cheatCount}x Curang</span>`
        : `<span class="text-emerald-600 font-medium">0 Pelanggaran</span>`;

      let lastActDisplay = '-';
      if (r.updatedAt) {
        const parsedDt = new Date(r.updatedAt);
        lastActDisplay = isNaN(parsedDt.getTime()) ? r.updatedAt : parsedDt.toLocaleString('id-ID');
      }

      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${r.name}</div>
          <div class="font-mono text-[11px] text-slate-500">${r.nisn}</div>
        </td>
        <td class="p-3 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">Kelas ${r.class}</span>
        </td>
        <td class="p-3 font-semibold text-slate-700">${r.subject}</td>
        <td class="p-3 text-center whitespace-nowrap">${badgeHtml}</td>
        <td class="p-3 text-center whitespace-nowrap">${progressText}</td>
        <td class="p-3 text-center whitespace-nowrap">
          <div class="font-mono font-bold text-slate-700">${r.status === 'in_progress' ? timeStr : '-'}</div>
          <div class="text-[10px]">${r.status !== 'not_logged_in' ? cheatHtml : '-'}</div>
        </td>
        <td class="p-3 text-[11px] text-slate-500 whitespace-nowrap">${lastActDisplay}</td>
        <td class="p-3 text-center whitespace-nowrap">
          ${r.status !== 'not_logged_in'
            ? `<button type="button" class="btn-reset-student-attempt px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] cursor-pointer transition" title="Hapus riwayat selesai agar siswa bisa ujian ulang">🔄 Izinkan Ulang</button>`
            : `<span class="text-[10px] text-slate-400">—</span>`
          }
        </td>
      `;

      const resetBtn = tr.querySelector('.btn-reset-student-attempt');
      if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
          if (confirm(`Izinkan siswa "${r.name}" (${r.nisn}) mengulang ujian "${r.subject}"?\nRiwayat selesai sebelumnya untuk mapel ini akan direset.`)) {
            resetBtn.disabled = true;
            resetBtn.innerText = 'Mereset...';
            await window.cbtAdmin.resetStudentAttempts(r.nisn, r.subject);
            cachedMonitoringSessions = cachedMonitoringSessions.filter(s =>
              !(String(s.nisn || '').trim().toUpperCase() === r.nisn && window.examEngine.matchesSubject(s.subject, r.subject))
            );
            await renderMonitoringDashboard(false);
            renderAdminAnalyticsAndResults();
          }
        });
      }

      tbody.appendChild(tr);
    });
  }

  // ===================== TAB 2: BANK SOAL UJIAN (PER MATA PELAJARAN & KELAS) =====================
  function setupQuestionBankFilters() {
    const subjFilterEl = document.getElementById('filterQuestionsSubject');
    const classFilterEl = document.getElementById('filterQuestionsClass');
    const modalSubjEl = document.getElementById('qInputSubject');
    const modalClassEl = document.getElementById('qInputClassLevel');
    if (!window.cbtAdmin) return;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
    const assignedClasses = (!isAdmin && currentTeacher && currentTeacher.classes)
      ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes)
      : [];
    const allSubjects = window.cbtAdmin.getAllSubjects();
    const studentClasses = window.studentManager ? window.studentManager.getAllClasses() : [];

    if (subjFilterEl) {
      const prevVal = subjFilterEl.value;
      subjFilterEl.innerHTML = '';

      if (isAdmin) {
        const optAll = document.createElement('option');
        optAll.value = 'ALL';
        optAll.innerText = 'Semua Mata Pelajaran';
        subjFilterEl.appendChild(optAll);

        const optUmum = document.createElement('option');
        optUmum.value = 'UMUM';
        optUmum.innerText = 'Umum / Soal Demo Bawaan';
        subjFilterEl.appendChild(optUmum);

        allSubjects.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.innerText = s;
          subjFilterEl.appendChild(opt);
        });
      } else {
        const ownedList = teacherSubjects;

        if (ownedList.length > 1) {
          const optOwnedAll = document.createElement('option');
          optOwnedAll.value = 'ALL';
          optOwnedAll.innerText = `Semua Mapel Diampu (${ownedList.join(' / ')})`;
          subjFilterEl.appendChild(optOwnedAll);
        } else if (ownedList.length === 0) {
          const optEmpty = document.createElement('option');
          optEmpty.value = 'ALL';
          optEmpty.innerText = 'Belum Ada Mapel Diampu';
          subjFilterEl.appendChild(optEmpty);
        }

        ownedList.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.innerText = s;
          subjFilterEl.appendChild(opt);
        });
      }

      const availableValues = Array.from(subjFilterEl.options).map(o => o.value);
      if (prevVal && availableValues.includes(prevVal)) {
        subjFilterEl.value = prevVal;
      } else if (!isAdmin && teacherSubjects.length === 1) {
        subjFilterEl.value = teacherSubjects[0];
      } else if (subjFilterEl.options.length > 0) {
        subjFilterEl.selectedIndex = 0;
      }

      subjFilterEl.onchange = () => renderAdminQuestionList();
    }

    if (classFilterEl) {
      const prevCls = classFilterEl.value;
      classFilterEl.innerHTML = '';

      const optAllCls = document.createElement('option');
      optAllCls.value = 'ALL';
      optAllCls.innerText = assignedClasses.length > 0
        ? `Semua Kelas Diampu (${assignedClasses.join(', ')})`
        : 'Semua Kelas / Tingkat';
      classFilterEl.appendChild(optAllCls);

      if (assignedClasses.length > 0) {
        if (assignedClasses.length > 1) {
          const optGroup = document.createElement('option');
          optGroup.value = assignedClasses.join(', ');
          optGroup.innerText = `Gabungan Kelas Diampu (${assignedClasses.join(', ')})`;
          classFilterEl.appendChild(optGroup);
        }
        assignedClasses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.innerText = `Kelas ${c}`;
          classFilterEl.appendChild(opt);
        });
      } else {
        ['Kelas 7', 'Kelas 8', 'Kelas 9'].forEach(g => {
          const opt = document.createElement('option');
          opt.value = g;
          opt.innerText = g;
          classFilterEl.appendChild(opt);
        });
        studentClasses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.innerText = `Kelas ${c}`;
          classFilterEl.appendChild(opt);
        });
      }

      const clsValues = Array.from(classFilterEl.options).map(o => o.value);
      if (prevCls && clsValues.includes(prevCls)) {
        classFilterEl.value = prevCls;
      } else {
        classFilterEl.value = 'ALL';
      }

      classFilterEl.onchange = () => renderAdminQuestionList();
    }

    const isQuestionModalOpen = Boolean(modalQuestionForm && !modalQuestionForm.classList.contains('hidden'));

    if (modalSubjEl && !isQuestionModalOpen) {
      const prevModalVal = modalSubjEl.value;
      modalSubjEl.innerHTML = '';

      if (isAdmin) {
        const optUmum = document.createElement('option');
        optUmum.value = 'Umum';
        optUmum.innerText = 'Umum (Semua Mapel)';
        modalSubjEl.appendChild(optUmum);

        allSubjects.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.innerText = s;
          modalSubjEl.appendChild(opt);
        });
      } else {
        const ownedList = teacherSubjects.length > 0 ? teacherSubjects : ['Umum'];

        ownedList.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.innerText = s;
          modalSubjEl.appendChild(opt);
        });
      }

      const modalValues = Array.from(modalSubjEl.options).map(o => o.value);
      if (prevModalVal && modalValues.includes(prevModalVal)) {
        modalSubjEl.value = prevModalVal;
      }
    }

    if (modalClassEl && !isQuestionModalOpen) {
      const prevModalCls = modalClassEl.value;
      modalClassEl.innerHTML = '';

      if (assignedClasses.length > 0) {
        if (assignedClasses.length > 1) {
          const optAssignedGroup = document.createElement('option');
          optAssignedGroup.value = assignedClasses.join(', ');
          optAssignedGroup.innerText = `Semua Kelas Diampu (${assignedClasses.join(', ')})`;
          modalClassEl.appendChild(optAssignedGroup);
        }
        assignedClasses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.innerText = `Kelas ${c}`;
          modalClassEl.appendChild(opt);
        });
      }

      const optSemua = document.createElement('option');
      optSemua.value = 'Semua Kelas';
      optSemua.innerText = 'Semua Kelas (7, 8, 9)';
      modalClassEl.appendChild(optSemua);

      ['Kelas 7', 'Kelas 8', 'Kelas 9'].forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.innerText = g;
        modalClassEl.appendChild(opt);
      });

      studentClasses.forEach(c => {
        if (!assignedClasses.includes(c)) {
          const opt = document.createElement('option');
          opt.value = c;
          opt.innerText = `Kelas ${c}`;
          modalClassEl.appendChild(opt);
        }
      });

      const modalClsValues = Array.from(modalClassEl.options).map(o => o.value);
      if (prevModalCls && modalClsValues.includes(prevModalCls)) {
        modalClassEl.value = prevModalCls;
      } else if (assignedClasses.length > 0) {
        modalClassEl.value = assignedClasses.join(', ');
      }
    }
  }

  function escapeHtmlSafe(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getItemAnalysisBadgeClass(tone) {
    switch (tone) {
      case 'emerald':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60';
      case 'sky':
        return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60';
      case 'blue':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60';
      case 'amber':
        return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60';
      case 'orange':
        return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/60';
      case 'rose':
      case 'red':
        return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  }

  function getQualityStatusBadgeInfo(status) {
    if (status === 'good') return { cls: getItemAnalysisBadgeClass('emerald'), icon: '✅' };
    if (status === 'revise') return { cls: getItemAnalysisBadgeClass('amber'), icon: '⚠️' };
    if (status === 'bad') return { cls: getItemAnalysisBadgeClass('rose'), icon: '🚨' };
    return { cls: getItemAnalysisBadgeClass('slate'), icon: '⏳' };
  }

  let activeItemAnalysisMode = 'pre_exam';

  function setItemAnalysisMode(mode) {
    activeItemAnalysisMode = mode === 'empirical' ? 'empirical' : 'pre_exam';
    const preSec = document.getElementById('preExamAuditSection');
    const empSec = document.getElementById('empiricalAnalysisSection');
    const btnPre = document.getElementById('btnModePreExamAudit');
    const btnEmp = document.getElementById('btnModeEmpiricalAnalysis');
    const titleEl = document.getElementById('itemAnalysisPanelTitle');

    if (activeItemAnalysisMode === 'pre_exam') {
      if (preSec) preSec.classList.remove('hidden');
      if (empSec) empSec.classList.add('hidden');
      if (btnPre) btnPre.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-white text-teal-800 shadow-xs';
      if (btnEmp) btnEmp.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer text-slate-600 hover:text-slate-900';
      if (titleEl) titleEl.innerText = '🛡️ Cek Kelayakan Teknis Pra-Ujian (Sebelum Ujian Dimulai)';
      renderPreExamAuditPanel();
    } else {
      if (preSec) preSec.classList.add('hidden');
      if (empSec) empSec.classList.remove('hidden');
      if (btnPre) btnPre.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer text-slate-600 hover:text-slate-900';
      if (btnEmp) btnEmp.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-white text-indigo-800 shadow-xs';
      if (titleEl) titleEl.innerText = '📈 Analisis Kualitas Butir Soal (Tingkat Kesukaran P & Daya Pembeda D)';
      renderItemAnalysisPanel();
    }
  }

  function renderPreExamAuditPanel(precomputed = null) {
    const panel = document.getElementById('itemAnalysisPanel');
    if (!panel) return;

    const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
    const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
    const statusFilter = document.getElementById('filterPreExamStatus')?.value || 'ALL';

    const questions = window.cbtAdmin ? window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter) : [];
    const audit = precomputed || (window.cbtAdmin && typeof window.cbtAdmin.auditQuestionsPreExam === 'function'
      ? window.cbtAdmin.auditQuestionsPreExam(questions)
      : null);
    if (!audit) return;

    const { items, summary } = audit;
    const subjLabel = subjFilter === 'ALL' ? 'Semua Mapel' : (subjFilter === 'UMUM' ? 'Umum / Demo' : subjFilter);
    const clsLabel = classFilter === 'ALL' ? 'Semua Kelas' : classFilter;

    if (activeItemAnalysisMode === 'pre_exam') {
      const subtitleEl = document.getElementById('itemAnalysisSubtitle');
      if (subtitleEl) {
        subtitleEl.innerText = `Filter aktif: ${subjLabel} • ${clsLabel} — Pemeriksaan teknis otomatis ${summary.totalQuestions} butir soal sebelum dikerjakan siswa.`;
      }
    }

    const peReady = document.getElementById('peKpiReady');
    const peReadyPct = document.getElementById('peKpiReadyPercent');
    const peWarn = document.getElementById('peKpiWarning');
    const peErr = document.getElementById('peKpiError');
    const peWeight = document.getElementById('peKpiTotalWeight');

    if (peReady) peReady.innerText = `${summary.readyCount} / ${summary.totalQuestions}`;
    if (peReadyPct) peReadyPct.innerText = `${summary.readyPercent}% soal lolos cek teknis`;
    if (peWarn) peWarn.innerText = String(summary.warningCount);
    if (peErr) peErr.innerText = String(summary.errorCount);
    if (peWeight) peWeight.innerText = String(summary.totalWeight);

    const tbody = document.getElementById('preExamAuditTbody');
    if (!tbody) return;

    const filteredItems = statusFilter === 'ALL'
      ? items
      : items.filter(it => it.status === statusFilter);

    if (filteredItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-slate-500 text-xs font-medium">
            ${items.length === 0
              ? 'Belum ada butir soal pada filter mata pelajaran/kelas ini.'
              : 'Tidak ada butir soal yang cocok dengan filter status teknis ini.'}
          </td>
        </tr>
      `;
      return;
    }

    const typeShort = (t) => t === 'multiple' ? 'PG Kompleks' : (t === 'true_false' ? 'Benar/Salah' : 'PG Tunggal');

    tbody.innerHTML = filteredItems.map(it => {
      const qSnippetRaw = String(it.questionText || '').replace(/\s+/g, ' ').trim();
      const qSnippet = qSnippetRaw.length > 90 ? `${qSnippetRaw.slice(0, 90)}…` : qSnippetRaw;

      let statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${getItemAnalysisBadgeClass('emerald')}">✅ Siap Diujikan</span>`;
      if (it.status === 'error') {
        statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${getItemAnalysisBadgeClass('rose')}">🚨 Perlu Perbaikan</span>`;
      } else if (it.status === 'warning') {
        statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${getItemAnalysisBadgeClass('amber')}">⚠️ Perlu Dicek</span>`;
      }

      const findingsList = [
        ...it.errors.map(msg => `<div class="text-rose-700 font-semibold">• ${escapeHtmlSafe(msg)}</div>`),
        ...it.warnings.map(msg => `<div class="text-amber-700">• ${escapeHtmlSafe(msg)}</div>`)
      ];
      const findingsHtml = findingsList.length > 0
        ? `<div class="space-y-0.5 text-[11px] leading-snug">${findingsList.join('')}</div>`
        : `<span class="text-[11px] text-emerald-700 font-medium">Kunci jawaban, opsi, bobot, dan redaksi sudah lengkap.</span>`;

      const fixBtnHtml = it.status !== 'ready'
        ? `<button type="button" class="btn-pre-exam-fix mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold cursor-pointer transition" data-q-index="${it.index - 1}">✏️ Perbaiki Soal No. ${it.index}</button>`
        : '';

      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition">
          <td class="p-2.5 text-center font-black text-slate-700 align-top">${it.index}</td>
          <td class="p-2.5 align-top">
            <div class="font-semibold text-slate-800 leading-snug">${escapeHtmlSafe(qSnippet || '(Soal bergambar / tanpa teks)')}</div>
            <div class="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-slate-500">
              <span class="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">${escapeHtmlSafe(it.subject)}</span>
              <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">${escapeHtmlSafe(it.classLevel)}</span>
              ${it.hasImage ? '<span class="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-semibold">🖼️ Gambar</span>' : ''}
            </div>
          </td>
          <td class="p-2.5 text-center align-top text-[11px] font-semibold text-slate-700 whitespace-nowrap">${typeShort(it.type)}</td>
          <td class="p-2.5 text-center align-top font-bold ${it.weight > 0 ? 'text-slate-700' : 'text-rose-600'}">${it.weight}</td>
          <td class="p-2.5 text-center align-top whitespace-nowrap">${statusBadge}</td>
          <td class="p-2.5 align-top">
            ${findingsHtml}
            ${fixBtnHtml}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-pre-exam-fix').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-q-index'), 10);
        const targetQ = questions[idx];
        if (targetQ) openQuestionModal(targetQ, idx + 1);
      });
    });
  }

  function renderItemAnalysisD3Charts(analysis, qualityFilter = 'ALL') {
    const scatterEl = document.getElementById('itemAnalysisScatterChart');
    const barEl = document.getElementById('itemAnalysisBarChart');
    if (!scatterEl || !barEl) return;

    lastEmpiricalAnalysisCache = { analysis, qualityFilter };

    const allItems = (analysis && Array.isArray(analysis.items)) ? analysis.items : [];
    const filtered = qualityFilter === 'ALL'
      ? allItems
      : allItems.filter(it => it.qualityStatus === qualityFilter);

    const plotted = filtered.filter(it => it.n >= 2 && it.difficulty !== null && it.discrimination !== null);

    if (plotted.length === 0) {
      const msg = allItems.length === 0
        ? 'Belum ada soal pada filter mata pelajaran/kelas ini.'
        : 'Butuh minimal 2 siswa menyelesaikan ujian (atau ubah Filter Kualitas) untuk menampilkan grafik D3.js.';
      const emptyHtml = `
        <div class="text-center py-10 px-4 text-slate-400 text-xs">
          <p class="font-bold text-slate-600 dark:text-slate-300">Belum cukup data analisis</p>
          <p class="mt-1">${escapeHtmlSafe(msg)}</p>
        </div>
      `;
      scatterEl.innerHTML = emptyHtml;
      barEl.innerHTML = emptyHtml;
      return;
    }

    if (typeof d3 === 'undefined') {
      const loadingHtml = `<div class="text-xs text-slate-500 p-4">Library D3.js sedang dimuat...</div>`;
      scatterEl.innerHTML = loadingHtml;
      barEl.innerHTML = loadingHtml;
      return;
    }

    const theme = getD3ThemeColors();
    const statusColor = (status) => {
      if (status === 'good') return '#10b981';
      if (status === 'revise') return '#f59e0b';
      if (status === 'bad') return '#e11d48';
      return '#64748b';
    };

    // ---- CHART 1: SCATTER PLOT P vs D ----
    {
      const width = Math.max(scatterEl.clientWidth || 0, 440);
      const height = 285;
      const margin = { top: 20, right: 20, bottom: 44, left: 48 };
      const innerW = width - margin.left - margin.right;
      const innerH = height - margin.top - margin.bottom;

      scatterEl.innerHTML = '';
      const svg = d3.select(scatterEl)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('class', 'w-full h-auto overflow-visible');

      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

      const minD = d3.min(plotted, d => d.discrimination) ?? 0;
      const maxD = d3.max(plotted, d => d.discrimination) ?? 1;
      const yMin = Math.min(-0.20, Math.floor((minD - 0.1) * 10) / 10);
      const yMax = Math.max(1.0, Math.ceil((maxD + 0.05) * 10) / 10);

      const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
      const y = d3.scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

      // Zona Ideal: P in [0.30, 0.70], D in [0.30, yMax]
      g.append('rect')
        .attr('x', x(0.30))
        .attr('y', y(yMax))
        .attr('width', Math.max(0, x(0.70) - x(0.30)))
        .attr('height', Math.max(0, y(0.30) - y(yMax)))
        .attr('fill', theme.idealBg)
        .attr('stroke', theme.idealStroke)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3')
        .attr('rx', 6);

      g.append('text')
        .attr('x', x(0.50))
        .attr('y', y(yMax) + 14)
        .attr('text-anchor', 'middle')
        .attr('fill', theme.idealStroke)
        .style('font-size', '10px')
        .style('font-weight', '800')
        .text('Zona Ideal (P 0.30–0.70, D ≥ 0.30)');

      // Grid X & Y
      g.append('g')
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(5).tickSize(-innerH).tickFormat(''))
        .selectAll('line')
        .attr('stroke', theme.gridLine)
        .attr('stroke-dasharray', '2,3');
      g.append('g')
        .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(''))
        .selectAll('line')
        .attr('stroke', theme.gridLine)
        .attr('stroke-dasharray', '2,3');
      g.selectAll('.domain').remove();

      // Garis Referensi P = 0.30 & P = 0.70
      [0.30, 0.70].forEach(pVal => {
        g.append('line')
          .attr('x1', x(pVal)).attr('x2', x(pVal))
          .attr('y1', 0).attr('y2', innerH)
          .attr('stroke', theme.axisLine)
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,4');
      });

      // Garis Referensi D = 0.30 & D = 0.00
      g.append('line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', y(0.30)).attr('y2', y(0.30))
        .attr('stroke', theme.idealStroke)
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '5,3');

      if (yMin < 0) {
        g.append('line')
          .attr('x1', 0).attr('x2', innerW)
          .attr('y1', y(0)).attr('y2', y(0))
          .attr('stroke', '#e11d48')
          .attr('stroke-width', 1.2)
          .attr('stroke-dasharray', '3,3');
      }

      // Sumbu X
      g.append('g')
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('.2f')))
        .call(ax => ax.select('.domain').attr('stroke', theme.axisLine))
        .selectAll('text')
        .attr('fill', theme.axisText)
        .style('font-size', '10px')
        .style('font-weight', '600');

      svg.append('text')
        .attr('x', margin.left + innerW / 2)
        .attr('y', height - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', theme.axisText)
        .style('font-size', '10.5px')
        .style('font-weight', '700')
        .text('Tingkat Kesukaran (P) — Sukar (<0.30) • Sedang (0.30–0.70) • Mudah (>0.70)');

      // Sumbu Y
      g.append('g')
        .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('.2f')))
        .call(ax => ax.select('.domain').attr('stroke', theme.axisLine))
        .selectAll('text')
        .attr('fill', theme.axisText)
        .style('font-size', '10px')
        .style('font-weight', '600');

      svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(margin.top + innerH / 2))
        .attr('y', 13)
        .attr('text-anchor', 'middle')
        .attr('fill', theme.axisText)
        .style('font-size', '10.5px')
        .style('font-weight', '700')
        .text('Daya Pembeda (D)');

      // Titik Nomor Soal
      const radius = plotted.length > 24 ? 10 : 12;
      const nodes = g.selectAll('.ia-scatter-node')
        .data(plotted)
        .enter()
        .append('g')
        .attr('class', 'ia-scatter-node cursor-pointer')
        .attr('transform', d => `translate(${x(d.difficulty)},${y(d.discrimination)})`);

      nodes.append('circle')
        .attr('r', radius)
        .attr('fill', d => statusColor(d.qualityStatus))
        .attr('fill-opacity', 0.9)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.8);

      nodes.append('text')
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffffff')
        .style('font-size', plotted.length > 24 ? '9px' : '10px')
        .style('font-weight', '800')
        .text(d => d.index);

      nodes
        .on('mouseenter mousemove', (event, d) => {
          d3.select(event.currentTarget).select('circle').attr('r', radius + 3).attr('fill-opacity', 1);
          const snippet = String(d.questionText || '').replace(/\s+/g, ' ').trim().slice(0, 85);
          showD3Tooltip(event, `
            <div class="font-extrabold text-slate-900 dark:text-white">Soal No. ${d.index} (${escapeHtmlSafe(d.subject)})</div>
            <div class="text-slate-500 dark:text-slate-400 mb-1.5">${escapeHtmlSafe(snippet || 'Soal bergambar')}${snippet.length >= 85 ? '…' : ''}</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
              <span>Responden: <strong>${d.n}</strong></span>
              <span>Status: <strong>${escapeHtmlSafe(d.qualityLabel)}</strong></span>
              <span>Kesukaran P: <strong>${d.difficulty.toFixed(2)}</strong> (${escapeHtmlSafe(d.difficultyLabel)})</span>
              <span>Pembeda D: <strong>${d.discrimination.toFixed(2)}</strong> (${escapeHtmlSafe(d.discriminationLabel)})</span>
            </div>
            <div class="mt-1.5 pt-1 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300">${escapeHtmlSafe(d.recommendation)}</div>
          `);
        })
        .on('mouseleave', (event) => {
          d3.select(event.currentTarget).select('circle').attr('r', radius).attr('fill-opacity', 0.9);
          hideD3Tooltip();
        });
    }

    // ---- CHART 2: GROUPED BAR CHART P & D PER NOMOR ----
    {
      const containerW = Math.max(barEl.clientWidth || 0, 460);
      const width = Math.max(containerW, plotted.length * 42 + 76);
      const height = 285;
      const margin = { top: 22, right: 16, bottom: 44, left: 44 };
      const innerW = width - margin.left - margin.right;
      const innerH = height - margin.top - margin.bottom;

      barEl.innerHTML = '';
      const svg = d3.select(barEl)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('class', 'h-auto overflow-visible');

      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

      const minD = d3.min(plotted, d => d.discrimination) ?? 0;
      const yMin = Math.min(0, Math.floor((minD - 0.05) * 10) / 10);
      const yMax = 1.0;

      const x0 = d3.scaleBand()
        .domain(plotted.map(d => `No.${d.index}`))
        .range([0, innerW])
        .padding(0.24);

      const x1 = d3.scaleBand()
        .domain(['P', 'D'])
        .range([0, x0.bandwidth()])
        .padding(0.12);

      const y = d3.scaleLinear().domain([yMin, yMax]).range([innerH, 0]);
      const yZero = y(0);

      // Grid Y
      g.append('g')
        .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(''))
        .selectAll('line')
        .attr('stroke', theme.gridLine)
        .attr('stroke-dasharray', '2,3');
      g.select('.domain').remove();

      // Garis dasar y = 0 & garis batas D = 0.30
      g.append('line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', yZero).attr('y2', yZero)
        .attr('stroke', theme.axisLine)
        .attr('stroke-width', 1.2);

      g.append('line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', y(0.30)).attr('y2', y(0.30))
        .attr('stroke', theme.idealStroke)
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '5,3');

      g.append('text')
        .attr('x', innerW - 4)
        .attr('y', y(0.30) - 5)
        .attr('text-anchor', 'end')
        .attr('fill', theme.idealStroke)
        .style('font-size', '9.5px')
        .style('font-weight', '700')
        .text('Batas Layak D = 0.30');

      // Sumbu Y
      g.append('g')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2f')))
        .call(ax => ax.select('.domain').attr('stroke', theme.axisLine))
        .selectAll('text')
        .attr('fill', theme.axisText)
        .style('font-size', '10px')
        .style('font-weight', '600');

      // Sumbu X
      g.append('g')
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x0))
        .call(ax => ax.select('.domain').attr('stroke', theme.axisLine))
        .selectAll('text')
        .attr('fill', theme.axisText)
        .style('font-size', '10px')
        .style('font-weight', '700');

      svg.append('text')
        .attr('x', margin.left + innerW / 2)
        .attr('y', height - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', theme.axisText)
        .style('font-size', '10.5px')
        .style('font-weight', '700')
        .text('Nomor Butir Soal');

      const groups = g.selectAll('.ia-bar-group')
        .data(plotted)
        .enter()
        .append('g')
        .attr('class', 'ia-bar-group cursor-pointer')
        .attr('transform', d => `translate(${x0(`No.${d.index}`)},0)`);

      // Bar Kesukaran P
      groups.append('rect')
        .attr('x', x1('P'))
        .attr('width', x1.bandwidth())
        .attr('y', d => y(Math.max(0, d.difficulty)))
        .attr('height', d => Math.max(2, Math.abs(y(d.difficulty) - yZero)))
        .attr('rx', 3)
        .attr('fill', '#3b82f6')
        .attr('opacity', 0.88);

      // Bar Daya Pembeda D (mendukung nilai negatif turun di bawah garis 0)
      groups.append('rect')
        .attr('x', x1('D'))
        .attr('width', x1.bandwidth())
        .attr('y', d => d.discrimination >= 0 ? y(d.discrimination) : yZero)
        .attr('height', d => Math.max(2, Math.abs(y(d.discrimination) - yZero)))
        .attr('rx', 3)
        .attr('fill', d => {
          if (d.discrimination >= 0.30) return '#10b981';
          if (d.discrimination >= 0.20) return '#f59e0b';
          return '#e11d48';
        })
        .attr('opacity', 0.9);

      groups
        .on('mouseenter mousemove', (event, d) => {
          d3.select(event.currentTarget).selectAll('rect').attr('opacity', 1);
          showD3Tooltip(event, `
            <div class="font-extrabold text-slate-900 dark:text-white">Butir Soal No. ${d.index}</div>
            <div class="mt-1 space-y-0.5 text-[10.5px]">
              <div><span class="font-bold text-blue-600">Kesukaran (P):</span> <strong>${d.difficulty.toFixed(2)}</strong> (${escapeHtmlSafe(d.difficultyLabel)})</div>
              <div><span class="font-bold text-emerald-600">Daya Pembeda (D):</span> <strong>${d.discrimination.toFixed(2)}</strong> (${escapeHtmlSafe(d.discriminationLabel)})</div>
              <div>Benar/Salah/Kosong: <strong>${d.correctCount}/${d.incorrectCount}/${d.unattemptedCount}</strong> (N=${d.n})</div>
              <div class="text-slate-500 dark:text-slate-400">Status: <strong>${escapeHtmlSafe(d.qualityLabel)}</strong></div>
            </div>
          `);
        })
        .on('mouseleave', (event) => {
          d3.select(event.currentTarget).selectAll('rect').attr('opacity', 0.9);
          hideD3Tooltip();
        });
    }
  }

  function renderItemAnalysisPanel(precomputed = null) {
    const panel = document.getElementById('itemAnalysisPanel');
    if (!panel) return;

    const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
    const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
    const qualityFilter = document.getElementById('filterItemAnalysisQuality')?.value || 'ALL';

    let analysis = precomputed;
    if (!analysis && window.cbtAdmin) {
      const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter);
      analysis = window.cbtAdmin.computeItemAnalysis(questions);
    }
    if (!analysis) return;

    const { items, summary } = analysis;
    const subjLabel = subjFilter === 'ALL' ? 'Semua Mapel' : (subjFilter === 'UMUM' ? 'Umum / Demo' : subjFilter);
    const clsLabel = classFilter === 'ALL' ? 'Semua Kelas' : classFilter;

    if (activeItemAnalysisMode === 'empirical') {
      const subtitleEl = document.getElementById('itemAnalysisSubtitle');
      if (subtitleEl) {
        subtitleEl.innerText = `Filter aktif: ${subjLabel} • ${clsLabel} — Dihitung dari ${summary.totalUniqueRespondents} hasil ujian siswa yang memiliki rincian jawaban.`;
      }
    }

    const kpiAnalyzed = document.getElementById('iaKpiAnalyzed');
    const kpiRespondents = document.getElementById('iaKpiRespondents');
    const kpiGood = document.getElementById('iaKpiGood');
    const kpiRevise = document.getElementById('iaKpiRevise');
    const kpiBad = document.getElementById('iaKpiBad');

    if (kpiAnalyzed) kpiAnalyzed.innerText = `${summary.analyzedCount} / ${summary.totalQuestions}`;
    if (kpiRespondents) kpiRespondents.innerText = `${summary.totalUniqueRespondents} lembar jawaban terekam`;
    if (kpiGood) kpiGood.innerText = String(summary.goodCount);
    if (kpiRevise) kpiRevise.innerText = String(summary.reviseCount);
    if (kpiBad) kpiBad.innerText = String(summary.badCount);

    // Render Grafik Visualisasi D3.js (Sebaran P vs D + Bar P & D per Nomor)
    renderItemAnalysisD3Charts(analysis, qualityFilter);

    const tbody = document.getElementById('itemAnalysisTbody');
    if (!tbody) return;

    const filteredItems = qualityFilter === 'ALL'
      ? items
      : items.filter(it => it.qualityStatus === qualityFilter);

    if (filteredItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-6 text-center text-slate-500 text-xs font-medium">
            ${items.length === 0
              ? 'Belum ada butir soal pada filter mata pelajaran/kelas ini.'
              : 'Tidak ada butir soal yang cocok dengan filter kualitas ini.'}
          </td>
        </tr>
      `;
      return;
    }

    const typeShort = (t) => t === 'multiple' ? 'PG Kompleks' : (t === 'true_false' ? 'Benar/Salah' : 'PG Tunggal');

    tbody.innerHTML = filteredItems.map(it => {
      const qSnippetRaw = String(it.questionText || '').replace(/\s+/g, ' ').trim();
      const qSnippet = qSnippetRaw.length > 95 ? `${qSnippetRaw.slice(0, 95)}…` : qSnippetRaw;
      const pBadgeCls = getItemAnalysisBadgeClass(it.difficultyTone);
      const dBadgeCls = getItemAnalysisBadgeClass(it.discriminationTone);
      const qBadgeInfo = getQualityStatusBadgeInfo(it.qualityStatus);
      const pText = it.difficulty !== null ? it.difficulty.toFixed(2) : '-';
      const dText = it.discrimination !== null ? it.discrimination.toFixed(2) : '-';
      const groupHint = (it.upperRate !== null && it.lowerRate !== null)
        ? `<div class="text-[10px] text-slate-400 mt-0.5">PA: ${it.upperRate.toFixed(2)} · PB: ${it.lowerRate.toFixed(2)}</div>`
        : '';

      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition">
          <td class="p-2.5 text-center font-black text-slate-700 align-top">${it.index}</td>
          <td class="p-2.5 align-top">
            <div class="font-semibold text-slate-800 leading-snug">${escapeHtmlSafe(qSnippet || '(Soal bergambar / tanpa teks)')}</div>
            <div class="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-slate-500">
              <span class="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">${escapeHtmlSafe(it.subject)}</span>
              <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">${escapeHtmlSafe(it.classLevel)}</span>
              <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${typeShort(it.type)}</span>
            </div>
          </td>
          <td class="p-2.5 text-center font-bold text-slate-700 align-top">${it.n}</td>
          <td class="p-2.5 text-center align-top whitespace-nowrap">
            <span class="text-emerald-700 font-bold">${it.correctCount}</span> /
            <span class="text-rose-600 font-bold">${it.incorrectCount}</span> /
            <span class="text-slate-500 font-semibold">${it.unattemptedCount}</span>
            ${it.partialCount > 0 ? `<div class="text-[10px] text-amber-700 font-semibold">Parsial: ${it.partialCount}</div>` : ''}
          </td>
          <td class="p-2.5 text-center align-top">
            <div class="font-black text-slate-800">${pText}</div>
            <span class="inline-block mt-0.5 px-2 py-0.5 rounded-md border text-[10px] font-bold ${pBadgeCls}">${escapeHtmlSafe(it.difficultyLabel)}</span>
          </td>
          <td class="p-2.5 text-center align-top">
            <div class="font-black text-slate-800">${dText}</div>
            <span class="inline-block mt-0.5 px-2 py-0.5 rounded-md border text-[10px] font-bold ${dBadgeCls}">${escapeHtmlSafe(it.discriminationLabel)}</span>
            ${groupHint}
          </td>
          <td class="p-2.5 align-top">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${qBadgeInfo.cls}">
              <span>${qBadgeInfo.icon}</span>
              <span>${escapeHtmlSafe(it.qualityLabel)}</span>
            </span>
            <p class="text-[11px] text-slate-600 mt-1 leading-snug">${escapeHtmlSafe(it.recommendation)}</p>
          </td>
        </tr>
      `;
    }).join('');
  }

  let teacherProgressCollapsed = false;

  function renderAdminTeacherQuestionProgress() {
    const panel = document.getElementById('adminTeacherQuestionProgressPanel');
    if (!panel || !window.cbtAdmin) return;
    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    if (!isAdmin) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');

    const targetInput = document.getElementById('teacherProgressTargetInput');
    const targetMin = Math.max(1, parseInt(targetInput ? targetInput.value : '20', 10) || 20);
    const searchQ = String(document.getElementById('searchTeacherProgress')?.value || '').trim().toLowerCase();
    const statusFilter = document.getElementById('filterTeacherProgressStatus')?.value || 'ALL';

    const list = window.cbtAdmin.getTeacherQuestionProgressList();
    let readyCount = 0;
    let partialCount = 0;
    let emptyCount = 0;

    list.forEach(item => {
      if (item.totalQuestions >= targetMin) readyCount++;
      else if (item.totalQuestions > 0) partialCount++;
      else emptyCount++;
    });

    const setEl = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.innerText = txt;
    };
    setEl('tpKpiTotalTeachers', `${list.length} Guru`);
    setEl('tpKpiReadyTeachers', `${readyCount} Guru`);
    setEl('tpKpiPartialTeachers', `${partialCount} Guru`);
    setEl('tpKpiEmptyTeachers', `${emptyCount} Guru`);

    const filtered = list.filter(item => {
      const st = item.totalQuestions >= targetMin ? 'ready' : (item.totalQuestions > 0 ? 'partial' : 'empty');
      if (statusFilter !== 'ALL' && st !== statusFilter) return false;
      if (!searchQ) return true;
      const name = String(item.teacher.name || '').toLowerCase();
      const nip = String(item.teacher.nip || '').toLowerCase();
      const subStr = item.subjects.join(' ').toLowerCase();
      return name.includes(searchQ) || nip.includes(searchQ) || subStr.includes(searchQ);
    });

    const tbody = document.getElementById('adminTeacherProgressTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-5 text-center text-slate-400">Tidak ada data guru yang cocok dengan filter progres.</td></tr>`;
      return;
    }

    filtered.forEach((item, idx) => {
      const pct = Math.min(100, Math.round((item.totalQuestions / targetMin) * 100));
      let barCls = 'bg-rose-500';
      let badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px]">Belum Mengisi (0)</span>`;
      if (item.totalQuestions >= targetMin) {
        barCls = 'bg-emerald-500';
        badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">✓ Memenuhi Target</span>`;
      } else if (item.totalQuestions > 0) {
        barCls = 'bg-amber-500';
        badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">Proses (${pct}%)</span>`;
      }

      const subjPills = item.subjectBreakdown.length > 0
        ? item.subjectBreakdown.map(sb => {
            const cls = sb.total >= targetMin ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : (sb.total > 0 ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-rose-50 text-rose-700 border-rose-200');
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${cls}">${escapeHtmlSafe(sb.subject)}: ${sb.total} soal${sb.createdByMe > 0 ? ` (✍️${sb.createdByMe})` : ''}</span>`;
          }).join(' ')
        : `<span class="text-[11px] text-slate-400 italic">Belum ada mapel</span>`;

      const firstSub = item.subjects[0] || 'ALL';
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70';
      tr.innerHTML = `
        <td class="p-2.5 text-center font-bold text-slate-400">${idx + 1}</td>
        <td class="p-2.5">
          <div class="font-bold text-slate-900 dark:text-slate-100">${escapeHtmlSafe(item.teacher.name || '-')}</div>
          <div class="text-[10px] text-slate-400 font-mono">NIP: ${escapeHtmlSafe(item.teacher.nip || '-')}${item.teacherClasses.length > 0 ? ` • Kls: ${escapeHtmlSafe(item.teacherClasses.join(', '))}` : ''}</div>
          <div class="text-[10px] text-indigo-700 font-semibold mt-0.5">✍️ Diinput sendiri: <strong>${item.createdByCount}</strong> soal</div>
        </td>
        <td class="p-2.5"><div class="flex flex-wrap gap-1">${subjPills}</div></td>
        <td class="p-2.5 text-center whitespace-nowrap">
          <div class="inline-flex items-center gap-1 text-[10px] font-bold">
            <span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700" title="PG Tunggal">PG:${item.singleCount}</span>
            <span class="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700" title="PG Kompleks">PGK:${item.multipleCount}</span>
            <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800" title="Benar/Salah">BS:${item.trueFalseCount}</span>
          </div>
        </td>
        <td class="p-2.5">
          <div class="flex items-center justify-between text-[11px] font-extrabold mb-1">
            <span>${item.totalQuestions} / ${targetMin} Soal</span>
            ${badgeHtml}
          </div>
          <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div class="${barCls} h-full transition-all" style="width:${pct}%"></div>
          </div>
        </td>
        <td class="p-2.5 text-center">
          <button type="button" class="btn-jump-teacher-q px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] cursor-pointer transition">
            🔍 Lihat Soal
          </button>
        </td>
      `;

      const jumpBtn = tr.querySelector('.btn-jump-teacher-q');
      if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
          const subjFilterEl = document.getElementById('filterQuestionsSubject');
          if (subjFilterEl && firstSub !== 'ALL') {
            const hasOpt = Array.from(subjFilterEl.options).some(o => o.value === firstSub);
            if (hasOpt) subjFilterEl.value = firstSub;
          }
          renderAdminQuestionList();
          document.getElementById('adminQuestionList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }

      tbody.appendChild(tr);
    });
  }

  const btnToggleTeacherProgress = document.getElementById('btnToggleTeacherProgress');
  if (btnToggleTeacherProgress) {
    btnToggleTeacherProgress.addEventListener('click', () => {
      teacherProgressCollapsed = !teacherProgressCollapsed;
      const body = document.getElementById('teacherProgressBody');
      if (body) body.classList.toggle('hidden', teacherProgressCollapsed);
      btnToggleTeacherProgress.innerText = teacherProgressCollapsed ? '▸ Tampilkan Progres' : '▾ Sembunyikan';
    });
  }
  const searchTeacherProgressEl = document.getElementById('searchTeacherProgress');
  if (searchTeacherProgressEl) searchTeacherProgressEl.addEventListener('input', () => renderAdminTeacherQuestionProgress());
  const filterTeacherProgressStatusEl = document.getElementById('filterTeacherProgressStatus');
  if (filterTeacherProgressStatusEl) filterTeacherProgressStatusEl.addEventListener('change', () => renderAdminTeacherQuestionProgress());
  const teacherProgressTargetEl = document.getElementById('teacherProgressTargetInput');
  if (teacherProgressTargetEl) teacherProgressTargetEl.addEventListener('input', () => renderAdminTeacherQuestionProgress());

  function renderAdminQuestionList() {
    const listContainer = document.getElementById('adminQuestionList');
    const totalCountEl = document.getElementById('adminTotalQuestionsCount');
    const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
    const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';

    const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter);
    const totalAll = window.cbtAdmin.getAllQuestions().length;
    const analysisResult = (window.cbtAdmin && typeof window.cbtAdmin.computeItemAnalysis === 'function')
      ? window.cbtAdmin.computeItemAnalysis(questions)
      : { items: [], summary: null };
    const preExamResult = (window.cbtAdmin && typeof window.cbtAdmin.auditQuestionsPreExam === 'function')
      ? window.cbtAdmin.auditQuestionsPreExam(questions)
      : { items: [], summary: null };

    const subjLabel = subjFilter === 'ALL'
      ? 'Semua Mapel'
      : (subjFilter === 'UMUM' ? 'Umum / Demo' : subjFilter);
    const clsLabel = classFilter === 'ALL' ? '' : ` • ${classFilter}`;

    if (totalCountEl) {
      totalCountEl.innerText = `${questions.length} Soal (${subjLabel}${clsLabel}) — Total Bank: ${totalAll}`;
    }

    const panel = document.getElementById('itemAnalysisPanel');
    if (panel && !panel.classList.contains('hidden')) {
      if (activeItemAnalysisMode === 'pre_exam') {
        renderPreExamAuditPanel(preExamResult);
      } else {
        renderItemAnalysisPanel(analysisResult);
      }
    }

    renderAdminTeacherQuestionProgress();

    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (questions.length === 0) {
      const currentTeacher = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
      const isAdminUser = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
      const activeSubName = subjFilter === 'ALL' ? 'mata pelajaran yang dipilih' : `"${subjLabel}"`;
      const activeClsName = classFilter === 'ALL' ? '' : ` untuk ${classFilter}`;
      const emptyHint = isAdminUser
        ? `Klik tombol <strong class="text-blue-600">+ Tambah Soal</strong>, <strong class="text-violet-700">🧪 Isi Soal Uji Coba Guru</strong>, atau <strong class="text-slate-600">📥 Impor JSON</strong> untuk menambahkan butir soal ${activeSubName}.`
        : `Klik tombol <strong class="text-blue-600">+ Tambah Soal</strong> atau muat soal uji coba aplikasi di bawah ini.`;
      listContainer.innerHTML = `
        <div class="text-center py-12 px-4 text-slate-500 bg-white rounded-3xl border border-slate-200 flex flex-col items-center gap-3">
          <div>
            <p class="font-bold text-base text-slate-700">Belum ada soal untuk ${activeSubName}${activeClsName}.</p>
            <p class="text-xs sm:text-sm text-slate-400 mt-1">${emptyHint}</p>
          </div>
          <button id="btnEmptyStateSeedTrial" type="button" class="px-4 py-2 rounded-xl text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition cursor-pointer">
            🧪 Muat 3 Soal Uji Coba Aplikasi${subjFilter !== 'ALL' && subjFilter !== 'UMUM' ? ` (${escapeHtmlSafe(subjFilter)})` : ''}
          </button>
        </div>
      `;
      const btnEmptySeed = document.getElementById('btnEmptyStateSeedTrial');
      if (btnEmptySeed && typeof window.cbtAdmin.seedTrialQuestionsForTeachers === 'function') {
        btnEmptySeed.addEventListener('click', () => {
          const res = window.cbtAdmin.seedTrialQuestionsForTeachers({
            onlyForCurrentTeacher: !isAdminUser,
            onlyMissingSubjects: true,
            targetSubject: subjFilter
          });
          setupQuestionBankFilters();
          renderAdminQuestionList();
          renderAdminTeacherQuestionProgress();
          renderAdminSchedulesList();
          if (res && res.addedCount > 0) {
            alert(`Berhasil menambahkan ${res.addedCount} soal uji coba aplikasi ke bank soal (${res.affectedSubjects.join(', ')}).`);
          } else {
            alert(res?.message || 'Bank soal sudah memiliki soal atau belum ada mata pelajaran guru yang cocok.');
          }
        });
      }
      return;
    }

    questions.forEach((q, index) => {
      const type = q.type || 'single';
      const qSubj = q.subject && String(q.subject).trim() !== '' ? q.subject : 'Umum / Demo';
      const qClass = q.classLevel && String(q.classLevel).trim() !== '' ? q.classLevel : 'Semua Kelas';
      const itemStat = analysisResult.items[index] || null;
      const preExamStat = preExamResult.items[index] || null;
      const card = document.createElement('div');
      card.className = "bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs hover:border-slate-300 transition";

      let typeBadge = '';
      let answerDetailsHtml = '';

      if (type === 'single') {
        typeBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md">PG Tunggal (Kunci: ${q.correctAnswer})</span>`;
        answerDetailsHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
            ${(q.options || []).map(opt => `
              <div class="p-2 rounded-lg ${opt.key === q.correctAnswer ? 'bg-green-50 border border-green-200 font-semibold text-green-800' : 'bg-slate-50 text-slate-600'}">
                <span class="font-bold mr-1">${opt.key}.</span> ${opt.text}
              </div>
            `).join('')}
          </div>
        `;
      } else if (type === 'multiple') {
        const correctKeys = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
        typeBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md">PG Kompleks (Kunci: ${correctKeys.join(', ')})</span>`;
        answerDetailsHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
            ${(q.options || []).map(opt => `
              <div class="p-2 rounded-lg ${correctKeys.includes(opt.key) ? 'bg-purple-50 border border-purple-200 font-bold text-purple-900' : 'bg-slate-50 text-slate-600'}">
                <span class="font-bold mr-1">[${opt.key}]</span> ${opt.text}
              </div>
            `).join('')}
          </div>
        `;
      } else if (type === 'true_false') {
        typeBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md">Benar / Salah</span>`;
        answerDetailsHtml = `
          <div class="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1.5">
            ${(q.statements || []).map(stmt => `
              <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span class="text-slate-700">${stmt.text}</span>
                <span class="font-bold px-2 py-0.5 rounded text-[10px] ${stmt.correct === 'B' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}">
                  ${stmt.correct === 'B' ? 'BENAR' : 'SALAH'}
                </span>
              </div>
            `).join('')}
          </div>
        `;
      }

      let preExamBadgeHtml = '';
      if (preExamStat) {
        if (preExamStat.status === 'error') {
          preExamBadgeHtml = `<span class="px-2 py-0.5 rounded-md border font-bold ${getItemAnalysisBadgeClass('rose')}" title="${escapeHtmlSafe(preExamStat.errors.join(' | '))}">🚨 Teknis: ${escapeHtmlSafe(preExamStat.errors[0])}</span>`;
        } else if (preExamStat.status === 'warning') {
          preExamBadgeHtml = `<span class="px-2 py-0.5 rounded-md border font-bold ${getItemAnalysisBadgeClass('amber')}" title="${escapeHtmlSafe(preExamStat.warnings.join(' | '))}">⚠️ Pra-Ujian: ${escapeHtmlSafe(preExamStat.warnings[0])}</span>`;
        } else {
          preExamBadgeHtml = `<span class="px-2 py-0.5 rounded-md border font-bold ${getItemAnalysisBadgeClass('emerald')}">🛡️ Teknis: Siap Diujikan</span>`;
        }
      }

      let analysisStripHtml = '';
      if (itemStat || preExamStat) {
        if (!itemStat || itemStat.n === 0) {
          analysisStripHtml = `
            <div class="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div>${preExamBadgeHtml}</div>
              <span class="text-slate-400">📊 P &amp; D: Menunggu jawaban siswa</span>
            </div>
          `;
        } else {
          const pCls = getItemAnalysisBadgeClass(itemStat.difficultyTone);
          const dCls = getItemAnalysisBadgeClass(itemStat.discriminationTone);
          const qInfo = getQualityStatusBadgeInfo(itemStat.qualityStatus);
          const pStr = itemStat.difficulty !== null ? itemStat.difficulty.toFixed(2) : '-';
          const dStr = itemStat.discrimination !== null ? itemStat.discrimination.toFixed(2) : '-';
          analysisStripHtml = `
            <div class="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]" title="${escapeHtmlSafe(itemStat.recommendation)}">
              <div class="flex flex-wrap items-center gap-1.5">
                ${preExamBadgeHtml}
                <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                  👥 N=${itemStat.n} (B:${itemStat.correctCount}${itemStat.partialCount > 0 ? ` · P:${itemStat.partialCount}` : ''} · S:${itemStat.incorrectCount})
                </span>
                <span class="px-2 py-0.5 rounded-md border font-bold ${pCls}">
                  P: ${pStr} (${escapeHtmlSafe(itemStat.difficultyLabel)})
                </span>
                <span class="px-2 py-0.5 rounded-md border font-bold ${dCls}">
                  D: ${dStr} (${escapeHtmlSafe(itemStat.discriminationLabel)})
                </span>
              </div>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-bold ${qInfo.cls}">
                <span>${qInfo.icon}</span>
                <span>${escapeHtmlSafe(itemStat.qualityLabel)}</span>
              </span>
            </div>
          `;
        }
      }

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center">
              ${index + 1}
            </span>
            <span class="text-[11px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
              📚 ${qSubj}
            </span>
            <span class="text-[11px] font-bold px-2 py-0.5 bg-teal-100 text-teal-800 rounded-md">
              🏫 ${qClass}
            </span>
            ${q.createdBy ? `<span class="text-[11px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">✍️ ${q.createdBy}</span>` : ''}
            ${typeBadge}
            <span class="text-[11px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
              Bobot: ${q.weight || 10}
            </span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" class="btn-edit-q text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-xs font-semibold cursor-pointer transition" title="Edit Soal Ini">
              ✏️ Edit
            </button>
            <button type="button" class="btn-delete-q text-red-600 hover:text-red-800 px-2 py-1 rounded-lg hover:bg-red-50 text-xs font-medium cursor-pointer transition" title="Hapus Soal Ini">
              🗑️ Hapus
            </button>
          </div>
        </div>
        <p class="text-slate-800 text-xs sm:text-sm font-medium mt-2.5 whitespace-pre-line leading-relaxed">${q.question}</p>
        ${q.image ? `<div class="mt-2.5 p-1.5 bg-slate-50 rounded-xl border border-slate-200 inline-block max-w-xs"><img src="${q.image}" alt="Gambar Soal" class="rounded-lg max-h-28 object-contain"></div>` : ''}
        ${answerDetailsHtml}
        ${analysisStripHtml}
      `;

      card.querySelector('.btn-edit-q').addEventListener('click', () => {
        openQuestionModal(q, index + 1);
      });

      card.querySelector('.btn-delete-q').addEventListener('click', () => {
        if (confirm(`Yakin ingin menghapus Soal No. ${index + 1} (${qSubj})?`)) {
          window.cbtAdmin.deleteQuestion(q.id);
          renderAdminQuestionList();
          renderAdminSchedulesList();
        }
      });

      listContainer.appendChild(card);
    });
  }

  const qInputType = document.getElementById('qInputType');
  const sectionOptionsAE = document.getElementById('sectionOptionsAE');
  const boxKeySingle = document.getElementById('boxKeySingle');
  const boxKeyMultiple = document.getElementById('boxKeyMultiple');
  const sectionTrueFalse = document.getElementById('sectionTrueFalse');

  if (qInputType) {
    qInputType.addEventListener('change', () => {
      const selectedType = qInputType.value;
      if (selectedType === 'single') {
        sectionOptionsAE.classList.remove('hidden');
        boxKeySingle.classList.remove('hidden');
        boxKeyMultiple.classList.add('hidden');
        sectionTrueFalse.classList.add('hidden');
      } else if (selectedType === 'multiple') {
        sectionOptionsAE.classList.remove('hidden');
        boxKeySingle.classList.add('hidden');
        boxKeyMultiple.classList.remove('hidden');
        sectionTrueFalse.classList.add('hidden');
      } else if (selectedType === 'true_false') {
        sectionOptionsAE.classList.add('hidden');
        sectionTrueFalse.classList.remove('hidden');
      }
    });
  }

  const btnOpenAddQuestion = document.getElementById('btnOpenAddQuestion');
  const btnCloseQuestionForm = document.getElementById('btnCloseQuestionForm');
  const btnCancelQuestionForm = document.getElementById('btnCancelQuestionForm');

  function closeQuestionModal() {
    if (modalQuestionForm) modalQuestionForm.classList.add('hidden');
    const editIdEl = document.getElementById('editQuestionId');
    if (editIdEl) editIdEl.value = '';
    resetImageUploader();
  }

  function openQuestionModal(question = null, displayNumber = null) {
    const formEl = document.getElementById('formQuestionItem');
    if (formEl) formEl.reset();
    resetImageUploader();
    setupQuestionBankFilters();

    const titleEl = document.getElementById('questionFormTitle');
    const submitBtnEl = document.getElementById('btnSubmitQuestionForm');
    const editIdEl = document.getElementById('editQuestionId');
    const modalSubjEl = document.getElementById('qInputSubject');
    const modalClassEl = document.getElementById('qInputClassLevel');

    if (question) {
      if (titleEl) titleEl.innerText = displayNumber ? `Edit Soal No. ${displayNumber}` : "Edit Butir Soal Ujian";
      if (submitBtnEl) submitBtnEl.innerText = "Simpan Perubahan Soal";
      if (editIdEl) editIdEl.value = question.id;

      const rawSubj = (question.subject && String(question.subject).trim()) ? String(question.subject).trim() : 'Umum';
      if (modalSubjEl) {
        if (!Array.from(modalSubjEl.options).some(o => o.value === rawSubj)) {
          const extraOpt = document.createElement('option');
          extraOpt.value = rawSubj;
          extraOpt.innerText = rawSubj;
          modalSubjEl.appendChild(extraOpt);
        }
        modalSubjEl.value = rawSubj;
      }

      const rawCls = (question.classLevel && String(question.classLevel).trim()) ? String(question.classLevel).trim() : 'Semua Kelas';
      if (modalClassEl) {
        if (!Array.from(modalClassEl.options).some(o => o.value === rawCls)) {
          const extraCls = document.createElement('option');
          extraCls.value = rawCls;
          extraCls.innerText = rawCls;
          modalClassEl.appendChild(extraCls);
        }
        modalClassEl.value = rawCls;
      }

      const qType = question.type || 'single';
      if (qInputType) {
        qInputType.value = qType;
        qInputType.dispatchEvent(new Event('change'));
      }

      const textEl = document.getElementById('qInputText');
      if (textEl) textEl.value = question.question || '';

      const weightEl = document.getElementById('qInputWeight');
      if (weightEl) weightEl.value = question.weight || 10;

      if (question.image) {
        setImageUploaderPreview(question.image);
      }

      if (qType === 'single' || qType === 'multiple') {
        const optsMap = {};
        (question.options || []).forEach(o => {
          if (o && o.key) optsMap[String(o.key).toUpperCase()] = o.text || '';
        });
        document.getElementById('qInputOptA').value = optsMap['A'] || '';
        document.getElementById('qInputOptB').value = optsMap['B'] || '';
        document.getElementById('qInputOptC').value = optsMap['C'] || '';
        document.getElementById('qInputOptD').value = optsMap['D'] || '';

        if (qType === 'single') {
          const singleKey = String(question.correctAnswer || 'A').toUpperCase();
          document.getElementById('qInputCorrectSingle').value = ['A', 'B', 'C', 'D'].includes(singleKey) ? singleKey : 'A';
        } else {
          const correctKeys = Array.isArray(question.correctAnswer)
            ? question.correctAnswer.map(k => String(k).toUpperCase())
            : [String(question.correctAnswer || '').toUpperCase()];
          document.querySelectorAll('input[name="multiCorrect"]').forEach(cb => {
            cb.checked = correctKeys.includes(cb.value);
          });
        }
      } else if (qType === 'true_false') {
        const stmts = Array.isArray(question.statements) ? question.statements : [];
        for (let i = 0; i < 3; i++) {
          const stmtInput = document.getElementById(`tfStmt${i + 1}`);
          const corrSelect = document.getElementById(`tfCorrect${i + 1}`);
          const item = stmts[i];
          if (stmtInput) stmtInput.value = item ? (item.text || '') : '';
          if (corrSelect) corrSelect.value = item && item.correct === 'S' ? 'S' : 'B';
        }
      }
    } else {
      if (titleEl) titleEl.innerText = "Tambah Soal Ujian Baru";
      if (submitBtnEl) submitBtnEl.innerText = "Simpan Soal Ujian";
      if (editIdEl) editIdEl.value = "";

      const subjFilterVal = document.getElementById('filterQuestionsSubject')?.value;
      const classFilterVal = document.getElementById('filterQuestionsClass')?.value;

      if (modalSubjEl && subjFilterVal && subjFilterVal !== 'ALL') {
        const targetVal = subjFilterVal === 'UMUM' ? 'Umum' : subjFilterVal;
        if (Array.from(modalSubjEl.options).some(o => o.value === targetVal)) {
          modalSubjEl.value = targetVal;
        }
      }
      if (modalClassEl) {
        const curT = window.cbtAdmin.getCurrentTeacher();
        const isAdm = curT && (curT.role === 'admin' || curT.id === 'admin');
        const assignedCls = (!isAdm && curT && curT.classes) ? window.cbtAdmin.parseTeacherClasses(curT.classes) : [];
        const targetCls = (classFilterVal && classFilterVal !== 'ALL')
          ? classFilterVal
          : (assignedCls.length > 0 ? assignedCls.join(', ') : 'Semua Kelas');
        if (Array.from(modalClassEl.options).some(o => o.value === targetCls)) {
          modalClassEl.value = targetCls;
        }
      }

      if (qInputType) qInputType.dispatchEvent(new Event('change'));
    }

    if (modalQuestionForm) modalQuestionForm.classList.remove('hidden');
  }

  if (btnOpenAddQuestion) {
    btnOpenAddQuestion.addEventListener('click', () => openQuestionModal(null));
  }

  if (btnCloseQuestionForm) {
    btnCloseQuestionForm.addEventListener('click', closeQuestionModal);
  }

  if (btnCancelQuestionForm) {
    btnCancelQuestionForm.addEventListener('click', closeQuestionModal);
  }

  const formQuestionItem = document.getElementById('formQuestionItem');
  if (formQuestionItem) {
    formQuestionItem.addEventListener('submit', (e) => {
      e.preventDefault();
      const editId = document.getElementById('editQuestionId')?.value.trim() || '';
      const subject = document.getElementById('qInputSubject')?.value || 'Umum';
      const classLevel = document.getElementById('qInputClassLevel')?.value || 'Semua Kelas';
      const type = qInputType.value;
      const questionText = document.getElementById('qInputText').value.trim();
      const weight = parseInt(document.getElementById('qInputWeight').value) || 10;
      const image = currentUploadedImageBase64 || "";

      let qData = { subject, classLevel, type, question: questionText, image, weight };

      if (type === 'single') {
        const correctSingle = document.getElementById('qInputCorrectSingle').value;
        const opts = [
          { key: "A", text: document.getElementById('qInputOptA').value.trim() },
          { key: "B", text: document.getElementById('qInputOptB').value.trim() },
          { key: "C", text: document.getElementById('qInputOptC').value.trim() },
          { key: "D", text: document.getElementById('qInputOptD').value.trim() }
        ];
        qData.options = opts;
        qData.correctAnswer = ['A', 'B', 'C', 'D'].includes(correctSingle) ? correctSingle : 'A';
      } else if (type === 'multiple') {
        const checkedBoxes = Array.from(document.querySelectorAll('input[name="multiCorrect"]:checked'))
          .map(el => el.value)
          .filter(v => ['A', 'B', 'C', 'D'].includes(v));
        if (checkedBoxes.length === 0) {
          alert("Pilih minimal 1 kunci jawaban untuk soal pilihan ganda kompleks!");
          return;
        }
        const opts = [
          { key: "A", text: document.getElementById('qInputOptA').value.trim() },
          { key: "B", text: document.getElementById('qInputOptB').value.trim() },
          { key: "C", text: document.getElementById('qInputOptC').value.trim() },
          { key: "D", text: document.getElementById('qInputOptD').value.trim() }
        ];
        qData.options = opts;
        qData.correctAnswer = checkedBoxes;
      } else if (type === 'true_false') {
        const s1 = document.getElementById('tfStmt1').value.trim();
        const s2 = document.getElementById('tfStmt2').value.trim();
        const s3 = document.getElementById('tfStmt3').value.trim();

        if (!s1 || !s2) {
          alert("Harap isi minimal 2 pernyataan untuk soal Benar / Salah!");
          return;
        }

        const statements = [
          { id: "s1", text: s1, correct: document.getElementById('tfCorrect1').value },
          { id: "s2", text: s2, correct: document.getElementById('tfCorrect2').value }
        ];
        if (s3) {
          statements.push({ id: "s3", text: s3, correct: document.getElementById('tfCorrect3').value });
        }
        qData.statements = statements;
      }

      if (editId) {
        const res = window.cbtAdmin.updateQuestion(editId, qData);
        if (!res.success) {
          alert(res.message || "Gagal memperbarui soal.");
          return;
        }
      } else {
        window.cbtAdmin.addQuestion(qData);
      }

      closeQuestionModal();
      setupQuestionBankFilters();

      const subjFilterEl = document.getElementById('filterQuestionsSubject');
      if (subjFilterEl && subject && subject !== 'Umum') {
        if (Array.from(subjFilterEl.options).some(o => o.value === subject)) {
          subjFilterEl.value = subject;
        }
      }

      renderAdminQuestionList();
      renderAdminSchedulesList();
    });
  }

  const btnExportQuestions = document.getElementById('btnExportQuestions');
  if (btnExportQuestions) {
    btnExportQuestions.addEventListener('click', () => {
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      window.cbtAdmin.exportQuestionsJSON(subjFilter, classFilter);
    });
  }

  // Kontrol Panel Cek Pra-Ujian & Analisis Butir Soal (Tingkat Kesukaran P & Daya Pembeda D)
  const itemAnalysisPanel = document.getElementById('itemAnalysisPanel');
  const btnTogglePreExamAudit = document.getElementById('btnTogglePreExamAudit');
  const btnToggleItemAnalysis = document.getElementById('btnToggleItemAnalysis');
  const btnModePreExamAudit = document.getElementById('btnModePreExamAudit');
  const btnModeEmpiricalAnalysis = document.getElementById('btnModeEmpiricalAnalysis');
  const btnCloseItemAnalysis = document.getElementById('btnCloseItemAnalysis');
  const filterPreExamStatus = document.getElementById('filterPreExamStatus');
  const btnExportPreExamAuditExcel = document.getElementById('btnExportPreExamAuditExcel');
  const filterItemAnalysisQuality = document.getElementById('filterItemAnalysisQuality');
  const btnSyncItemAnalysisCloud = document.getElementById('btnSyncItemAnalysisCloud');
  const btnExportItemAnalysisExcel = document.getElementById('btnExportItemAnalysisExcel');

  if (btnTogglePreExamAudit && itemAnalysisPanel) {
    btnTogglePreExamAudit.addEventListener('click', () => {
      const isHidden = itemAnalysisPanel.classList.contains('hidden');
      if (!isHidden && activeItemAnalysisMode === 'pre_exam') {
        itemAnalysisPanel.classList.add('hidden');
      } else {
        itemAnalysisPanel.classList.remove('hidden');
        setItemAnalysisMode('pre_exam');
        itemAnalysisPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  if (btnToggleItemAnalysis && itemAnalysisPanel) {
    btnToggleItemAnalysis.addEventListener('click', () => {
      const isHidden = itemAnalysisPanel.classList.contains('hidden');
      if (!isHidden && activeItemAnalysisMode === 'empirical') {
        itemAnalysisPanel.classList.add('hidden');
      } else {
        itemAnalysisPanel.classList.remove('hidden');
        setItemAnalysisMode('empirical');
        itemAnalysisPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  if (btnModePreExamAudit) {
    btnModePreExamAudit.addEventListener('click', () => setItemAnalysisMode('pre_exam'));
  }

  if (btnModeEmpiricalAnalysis) {
    btnModeEmpiricalAnalysis.addEventListener('click', () => setItemAnalysisMode('empirical'));
  }

  if (btnCloseItemAnalysis && itemAnalysisPanel) {
    btnCloseItemAnalysis.addEventListener('click', () => {
      itemAnalysisPanel.classList.add('hidden');
    });
  }

  if (filterPreExamStatus) {
    filterPreExamStatus.addEventListener('change', () => {
      renderPreExamAuditPanel();
    });
  }

  if (btnExportPreExamAuditExcel) {
    btnExportPreExamAuditExcel.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter);
      const { items } = window.cbtAdmin.auditQuestionsPreExam(questions);
      window.cbtAdmin.exportPreExamAuditExcel(items, {
        subject: subjFilter === 'ALL' ? 'Semua_Mapel' : subjFilter,
        classLevel: classFilter
      });
    });
  }

  if (filterItemAnalysisQuality) {
    filterItemAnalysisQuality.addEventListener('change', () => {
      renderItemAnalysisPanel();
    });
  }

  if (btnSyncItemAnalysisCloud) {
    btnSyncItemAnalysisCloud.addEventListener('click', async () => {
      if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum dikonfigurasi. Pastikan koneksi Cloud sudah aktif di menu Pengaturan.");
        return;
      }
      const origHtml = btnSyncItemAnalysisCloud.innerHTML;
      btnSyncItemAnalysisCloud.disabled = true;
      btnSyncItemAnalysisCloud.innerHTML = '<span>⏳ Menarik Data...</span>';
      try {
        const res = await window.supabaseSync.fetchCloudResults();
        if (res && res.success) {
          renderAdminQuestionList();
          renderItemAnalysisPanel();
          if (typeof renderAdminAnalyticsAndResults === 'function') {
            renderAdminAnalyticsAndResults();
          }
          alert(`Berhasil menarik ${res.count || 0} data hasil ujian dari Cloud. Analisis butir soal telah diperbarui.`);
        } else {
          alert(`Gagal menarik data cloud: ${(res && res.message) || 'Terjadi kesalahan'}`);
        }
      } catch (err) {
        alert(`Gagal menarik data cloud: ${err.message || err}`);
      } finally {
        btnSyncItemAnalysisCloud.disabled = false;
        btnSyncItemAnalysisCloud.innerHTML = origHtml;
      }
    });
  }

  if (btnExportItemAnalysisExcel) {
    btnExportItemAnalysisExcel.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter);
      const { items } = window.cbtAdmin.computeItemAnalysis(questions);
      window.cbtAdmin.exportItemAnalysisExcel(items, {
        subject: subjFilter === 'ALL' ? 'Semua_Mapel' : subjFilter,
        classLevel: classFilter
      });
    });
  }

  // Pratinjau, Download PDF / Word (.doc), & Cetak Naskah Soal (Sesuai Format PDF Sekolah)
  const modalPrintQuestionsPreview = document.getElementById('modalPrintQuestionsPreview');
  const btnOpenPrintQuestions = document.getElementById('btnOpenPrintQuestions');
  const btnCloseQuestionsPreview = document.getElementById('btnCloseQuestionsPreview');
  const btnCancelQuestionsPreview = document.getElementById('btnCancelQuestionsPreview');
  const btnDownloadQuestionsPdf = document.getElementById('btnDownloadQuestionsPdf');
  const btnDownloadQuestionsDoc = document.getElementById('btnDownloadQuestionsDoc');
  const btnExecuteDirectPrintQuestions = document.getElementById('btnExecuteDirectPrintQuestions');

  function getSelectedQuestionsAndPaperOptions() {
    const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
    const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
    const questions = window.cbtAdmin ? window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter) : [];

    const cur = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
    const examCfg = window.examEngine ? window.examEngine.config : {};
    const subjectName = (subjFilter && subjFilter !== 'ALL' && subjFilter !== 'UMUM')
      ? subjFilter
      : (cur && cur.role !== 'admin' ? cur.subject : (examCfg.subject || 'Semua Mata Pelajaran'));

    const options = {
      examTitle: document.getElementById('nqExamTitle')?.value.trim() || examCfg.examTitle || 'ASESMEN SUMATIF AKHIR SEMESTER (ASAS)',
      semester: document.getElementById('nqSemester')?.value.trim() || 'SEMESTER GANJIL',
      academicYear: document.getElementById('nqAcademicYear')?.value.trim() || '2025/2026',
      duration: document.getElementById('nqDuration')?.value.trim() || `${examCfg.durationMinutes || 80} Menit`,
      layoutCols: parseInt(document.getElementById('nqLayoutCols')?.value, 10) || 2,
      dateText: document.getElementById('nqDateText')?.value.trim() || '',
      includeAnswerKey: Boolean(document.getElementById('nqIncludeAnswerKey')?.checked),
      subject: subjectName,
      classLevel: classFilter !== 'ALL' ? classFilter : ''
    };
    return { questions, options };
  }

  function refreshQuestionsPaperPreview() {
    const container = document.getElementById('questionsPaperPreviewContainer');
    const countBadge = document.getElementById('questionsPreviewCountBadge');
    const { questions, options } = getSelectedQuestionsAndPaperOptions();
    if (countBadge) countBadge.innerText = `${questions.length} Soal (${options.subject})`;
    if (!container) return;

    if (questions.length === 0) {
      container.innerHTML = `<div class="text-center py-14 text-slate-500 font-semibold text-sm bg-white rounded-2xl border border-slate-200">Belum ada butir soal pada mata pelajaran/kelas ini.</div>`;
      return;
    }
    container.innerHTML = window.cbtAdmin.generateExamPaperHtml(questions, options);
  }

  if (btnOpenPrintQuestions) {
    btnOpenPrintQuestions.addEventListener('click', () => {
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      const questions = window.cbtAdmin ? window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter) : [];
      if (questions.length === 0) {
        alert("Belum ada butir soal pada filter mata pelajaran/kelas ini. Tambahkan soal terlebih dahulu!");
        return;
      }

      const examCfg = window.examEngine ? window.examEngine.config : {};
      const titleInput = document.getElementById('nqExamTitle');
      const durInput = document.getElementById('nqDuration');
      const dateInput = document.getElementById('nqDateText');

      if (titleInput && examCfg.examTitle) {
        titleInput.value = examCfg.examTitle.toUpperCase();
      }

      // Cari jadwal yang cocok dengan mapel terpilih agar durasi & tanggal otomatis terisi rapi
      const allSchedules = window.cbtAdmin ? window.cbtAdmin.getAllSchedules() : [];
      const matchingSchedule = allSchedules.find(s =>
        subjFilter !== 'ALL' &&
        window.examEngine &&
        window.examEngine.matchesSubject(s.subject, subjFilter) &&
        (classFilter === 'ALL' || window.examEngine.matchesClassLevel(s.classLevel || 'Semua Kelas', classFilter))
      );

      if (durInput) {
        const mins = matchingSchedule ? (matchingSchedule.durationMinutes || 80) : (examCfg.durationMinutes || 80);
        durInput.value = `${mins} Menit`;
      }
      if (dateInput) {
        if (matchingSchedule && (matchingSchedule.day || matchingSchedule.dateFormatted || matchingSchedule.dateIso)) {
          const dStr = matchingSchedule.dateFormatted || (window.cbtAdmin ? window.cbtAdmin.formatIndonesianDate(matchingSchedule.dateIso) : '');
          dateInput.value = [matchingSchedule.day, dStr].filter(Boolean).join(', ');
        } else {
          dateInput.value = '';
        }
      }

      syncNqKopUi();
      refreshQuestionsPaperPreview();
      if (modalPrintQuestionsPreview) modalPrintQuestionsPreview.classList.remove('hidden');
      ensureSavedKopTrimmed();
    });
  }

  function trimKopSuratWhitespace(sourceDataUrlOrFile, maxWidth, callback) {
    const processImageSrc = (src) => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > maxWidth ? (maxWidth / img.width) : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        try {
          const imgData = ctx.getImageData(0, 0, w, h).data;
          let minX = w, minY = h, maxX = -1, maxY = -1;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              const r = imgData[idx];
              const g = imgData[idx + 1];
              const b = imgData[idx + 2];
              const a = imgData[idx + 3];
              if (a > 15 && (r < 245 || g < 245 || b < 245)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (maxX >= minX && maxY >= minY) {
            const pad = 4;
            const cx = Math.max(0, minX - pad);
            const cy = Math.max(0, minY - pad);
            const cw = Math.min(w - cx, (maxX - minX + 1) + pad * 2);
            const ch = Math.min(h - cy, (maxY - minY + 1) + pad * 2);

            const trimmedCanvas = document.createElement('canvas');
            trimmedCanvas.width = cw;
            trimmedCanvas.height = ch;
            const tCtx = trimmedCanvas.getContext('2d');
            tCtx.fillStyle = '#ffffff';
            tCtx.fillRect(0, 0, cw, ch);
            tCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
            callback(trimmedCanvas.toDataURL('image/png'), cw !== w || ch !== h);
            return;
          }
        } catch (e) {}

        callback(canvas.toDataURL('image/png'), false);
      };
      img.src = src;
    };

    if (typeof sourceDataUrlOrFile === 'string') {
      processImageSrc(sourceDataUrlOrFile);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => processImageSrc(ev.target.result);
      reader.readAsDataURL(sourceDataUrlOrFile);
    }
  }

  function ensureSavedKopTrimmed() {
    if (!window.cbtAdmin) return;
    const cfg = window.cbtAdmin.getSchoolConfig();
    if (!cfg.kopSuratImage || String(cfg.kopSuratImage).trim() === '') return;
    trimKopSuratWhitespace(cfg.kopSuratImage, 1600, (trimmedUrl, changed) => {
      if (changed && trimmedUrl) {
        const latestCfg = window.cbtAdmin.getSchoolConfig();
        latestCfg.kopSuratImage = trimmedUrl;
        window.cbtAdmin.saveSchoolConfig(latestCfg);
        refreshQuestionsPaperPreview();
      }
    });
  }

  function syncNqKopUi() {
    const statusEl = document.getElementById('nqKopImageStatus');
    const btnRemove = document.getElementById('btnRemoveNqKopImage');
    const cfg = window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : {};
    const hasKop = Boolean(cfg.kopSuratImage && String(cfg.kopSuratImage).trim() !== '');
    if (statusEl) {
      statusEl.innerText = hasKop ? 'Kop Surat Upload Aktif' : 'Kop Otomatis Sekolah';
      statusEl.className = hasKop
        ? 'text-[11px] font-bold text-emerald-700 truncate max-w-[150px]'
        : 'text-[11px] font-semibold text-slate-500 truncate max-w-[150px]';
    }
    if (btnRemove) {
      if (hasKop) btnRemove.classList.remove('hidden');
      else btnRemove.classList.add('hidden');
    }
  }

  const nqKopImageFile = document.getElementById('nqKopImageFile');
  const btnUploadNqKopImage = document.getElementById('btnUploadNqKopImage');
  const btnRemoveNqKopImage = document.getElementById('btnRemoveNqKopImage');

  if (btnUploadNqKopImage && nqKopImageFile) {
    btnUploadNqKopImage.addEventListener('click', () => nqKopImageFile.click());
    nqKopImageFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) {
        if (file) alert("Harap pilih file gambar (PNG, JPG, atau WEBP) untuk Kop Surat.");
        return;
      }
      trimKopSuratWhitespace(file, 1600, (dataUrl) => {
        if (window.cbtAdmin) {
          const cfg = window.cbtAdmin.getSchoolConfig();
          cfg.kopSuratImage = dataUrl;
          window.cbtAdmin.saveSchoolConfig(cfg);
        }
        syncNqKopUi();
        refreshQuestionsPaperPreview();
      });
      nqKopImageFile.value = '';
    });
  }

  if (btnRemoveNqKopImage) {
    btnRemoveNqKopImage.addEventListener('click', () => {
      if (window.cbtAdmin) {
        const cfg = window.cbtAdmin.getSchoolConfig();
        cfg.kopSuratImage = '';
        window.cbtAdmin.saveSchoolConfig(cfg);
      }
      if (nqKopImageFile) nqKopImageFile.value = '';
      syncNqKopUi();
      refreshQuestionsPaperPreview();
    });
  }

  ['nqExamTitle', 'nqSemester', 'nqAcademicYear', 'nqDuration', 'nqDateText', 'nqLayoutCols', 'nqIncludeAnswerKey'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', refreshQuestionsPaperPreview);
      el.addEventListener('change', refreshQuestionsPaperPreview);
    }
  });

  if (btnCloseQuestionsPreview) {
    btnCloseQuestionsPreview.addEventListener('click', () => modalPrintQuestionsPreview && modalPrintQuestionsPreview.classList.add('hidden'));
  }
  if (btnCancelQuestionsPreview) {
    btnCancelQuestionsPreview.addEventListener('click', () => modalPrintQuestionsPreview && modalPrintQuestionsPreview.classList.add('hidden'));
  }
  if (btnDownloadQuestionsPdf) {
    btnDownloadQuestionsPdf.addEventListener('click', () => {
      const { questions, options } = getSelectedQuestionsAndPaperOptions();
      window.cbtAdmin.downloadQuestionsPDF(questions, options);
    });
  }
  if (btnDownloadQuestionsDoc) {
    btnDownloadQuestionsDoc.addEventListener('click', () => {
      const { questions, options } = getSelectedQuestionsAndPaperOptions();
      window.cbtAdmin.downloadQuestionsDOC(questions, options);
    });
  }
  if (btnExecuteDirectPrintQuestions) {
    btnExecuteDirectPrintQuestions.addEventListener('click', () => {
      const { questions, options } = getSelectedQuestionsAndPaperOptions();
      window.cbtAdmin.printQuestionsDirect(questions, options);
    });
  }

  const btnImportQuestions = document.getElementById('btnImportQuestions');
  const fileImportInput = document.getElementById('fileImportQuestions');
  if (btnImportQuestions && fileImportInput) {
    btnImportQuestions.addEventListener('click', () => fileImportInput.click());
    fileImportInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      const currentTeacher = window.cbtAdmin.getCurrentTeacher();
      const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
      const defaultSub = (subjFilter !== 'ALL' && subjFilter !== 'UMUM')
        ? subjFilter
        : (teacherSubjects[0] || 'Umum');
      const defaultCls = classFilter !== 'ALL' ? classFilter : 'Semua Kelas';

      const reader = new FileReader();
      reader.onload = (event) => {
        const res = window.cbtAdmin.importQuestionsJSON(event.target.result, defaultSub, defaultCls);
        if (res.success) {
          alert(`Berhasil mengimpor ${res.count} butir soal ujian!`);
          setupQuestionBankFilters();
          renderAdminQuestionList();
          renderAdminSchedulesList();
        } else {
          alert(`Gagal impor: ${res.message}`);
        }
      };
      reader.readAsText(file);
      fileImportInput.value = '';
    });
  }

  const btnSeedTrialQuestions = document.getElementById('btnSeedTrialQuestions');
  if (btnSeedTrialQuestions) {
    btnSeedTrialQuestions.addEventListener('click', () => {
      if (!window.cbtAdmin || typeof window.cbtAdmin.seedTrialQuestionsForTeachers !== 'function') return;
      const res = window.cbtAdmin.seedTrialQuestionsForTeachers({ onlyMissingSubjects: true });
      setupQuestionBankFilters();
      renderAdminQuestionList();
      renderAdminTeacherQuestionProgress();
      renderAdminSchedulesList();
      if (res && res.addedCount > 0) {
        alert(`Berhasil mengisi ${res.addedCount} soal uji coba aplikasi ke ${res.affectedSubjects.length} bank soal guru yang masih kosong:\n• ${res.affectedSubjects.join('\n• ')}`);
      } else {
        alert("Semua bank soal guru sudah terisi minimal 1 soal! Jika ingin mengatur ulang seluruh bank soal ke set uji coba standar, gunakan tombol '↺ Reset Soal'.");
      }
    });
  }

  const btnResetDefaultQuestions = document.getElementById('btnResetDefaultQuestions');
  if (btnResetDefaultQuestions) {
    btnResetDefaultQuestions.addEventListener('click', () => {
      if (confirm("Reset seluruh bank soal ke 39 soal uji coba aplikasi (3 soal di setiap dari 13 mata pelajaran guru)?\n\nCatatan: Soal yang sudah ada akan diganti dengan paket soal uji coba bawaan.")) {
        window.cbtAdmin.resetToDefaultQuestions();
        setupQuestionBankFilters();
        renderAdminQuestionList();
        renderAdminTeacherQuestionProgress();
        renderAdminSchedulesList();
      }
    });
  }

  const btnRefreshQuestionsCloud = document.getElementById('btnRefreshQuestionsCloud');
  if (btnRefreshQuestionsCloud) {
    btnRefreshQuestionsCloud.addEventListener('click', async () => {
      if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum aktif.");
        return;
      }
      const origText = btnRefreshQuestionsCloud.innerHTML;
      btnRefreshQuestionsCloud.disabled = true;
      btnRefreshQuestionsCloud.innerText = '⏳ Menyegarkan...';
      await syncQuestionsFromCloud(true, true);
      btnRefreshQuestionsCloud.disabled = false;
      btnRefreshQuestionsCloud.innerHTML = origText;
    });
  }

  // ===================== TAB 3: MANAJEMEN 250 SISWA & KARTU PESERTA =====================
  function renderAdminStudentsList(searchQuery = "") {
    const tbody = document.getElementById('adminStudentsTbody');
    const badge = document.getElementById('studentCountBadge');
    if (!tbody || !window.studentManager) return;

    const students = searchQuery
      ? window.studentManager.searchStudents(searchQuery)
      : window.studentManager.getAllStudents();

    if (badge) badge.innerText = `${window.studentManager.getStudentCount()} Siswa`;

    tbody.innerHTML = '';
    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">Tidak ada data siswa ditemukan.</td></tr>`;
      return;
    }

    students.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3 font-mono font-bold text-blue-700">${s.nisn}</td>
        <td class="p-3 font-semibold text-slate-800">${s.name}</td>
        <td class="p-3 text-slate-600">${s.birthPlace || '-'}</td>
        <td class="p-3 text-slate-600 whitespace-nowrap">${s.birthDate || '-'}</td>
        <td class="p-3 text-slate-600">${s.gender || '-'}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">Kelas ${s.class}</span></td>
        <td class="p-3 text-slate-600 max-w-[180px] truncate" title="${s.address || ''}">${s.address || '-'}</td>
        <td class="p-3 font-mono text-slate-500">${s.password}</td>
        <td class="p-3 text-center whitespace-nowrap">
          <button type="button" class="btn-edit-student text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded text-xs cursor-pointer mr-1" title="Edit Siswa">✏️</button>
          <button type="button" class="btn-delete-student text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded text-xs cursor-pointer" title="Hapus Siswa">🗑️</button>
        </td>
      `;
      tr.querySelector('.btn-edit-student').addEventListener('click', () => openStudentModal(s));
      tr.querySelector('.btn-delete-student').addEventListener('click', () => {
        if (confirm(`Hapus data siswa: ${s.name} (${s.nisn})?`)) {
          window.studentManager.deleteStudent(s.nisn);
          renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
          setupSubjectAndClassFilters();
        }
      });
      tbody.appendChild(tr);
    });
  }

  // Modal Tambah / Edit Siswa
  const modalStudentForm = document.getElementById('modalStudentForm');
  const formStudentItem = document.getElementById('formStudentItem');
  const btnOpenAddStudent = document.getElementById('btnOpenAddStudent');
  const btnCloseStudentForm = document.getElementById('btnCloseStudentForm');
  const btnCancelStudentForm = document.getElementById('btnCancelStudentForm');

  function openStudentModal(student = null) {
    if (!modalStudentForm) return;
    const titleEl = document.getElementById('modalStudentFormTitle');
    if (student) {
      if (titleEl) titleEl.innerText = "Edit Data Siswa";
      document.getElementById('editStudentOriginalNisn').value = student.nisn;
      document.getElementById('stuInputNisn').value = student.nisn;
      document.getElementById('stuInputNisn').readOnly = true;
      document.getElementById('stuInputName').value = student.name || '';
      document.getElementById('stuInputClass').value = student.class || '9A';
      document.getElementById('stuInputBirthPlace').value = student.birthPlace || '';
      document.getElementById('stuInputBirthDate').value = student.birthDate || '';
      document.getElementById('stuInputGender').value = student.gender || 'Laki-laki';
      document.getElementById('stuInputPassword').value = student.password || '123';
      document.getElementById('stuInputAddress').value = student.address || '';
    } else {
      if (titleEl) titleEl.innerText = "Tambah Data Siswa Baru";
      document.getElementById('editStudentOriginalNisn').value = '';
      document.getElementById('stuInputNisn').value = '';
      document.getElementById('stuInputNisn').readOnly = false;
      document.getElementById('stuInputName').value = '';
      document.getElementById('stuInputClass').value = '9A';
      document.getElementById('stuInputBirthPlace').value = '';
      document.getElementById('stuInputBirthDate').value = '';
      document.getElementById('stuInputGender').value = 'Laki-laki';
      document.getElementById('stuInputPassword').value = '123';
      document.getElementById('stuInputAddress').value = '';
    }
    modalStudentForm.classList.remove('hidden');
  }

  if (btnOpenAddStudent) btnOpenAddStudent.addEventListener('click', () => openStudentModal(null));
  if (btnCloseStudentForm) btnCloseStudentForm.addEventListener('click', () => modalStudentForm.classList.add('hidden'));
  if (btnCancelStudentForm) btnCancelStudentForm.addEventListener('click', () => modalStudentForm.classList.add('hidden'));

  if (formStudentItem) {
    formStudentItem.addEventListener('submit', (e) => {
      e.preventDefault();
      const origNisn = document.getElementById('editStudentOriginalNisn').value;
      const payload = {
        nisn: document.getElementById('stuInputNisn').value.trim(),
        name: document.getElementById('stuInputName').value.trim(),
        class: document.getElementById('stuInputClass').value.trim(),
        birthPlace: document.getElementById('stuInputBirthPlace').value.trim(),
        birthDate: document.getElementById('stuInputBirthDate').value.trim(),
        gender: document.getElementById('stuInputGender').value,
        password: document.getElementById('stuInputPassword').value.trim() || '123',
        address: document.getElementById('stuInputAddress').value.trim()
      };

      const res = origNisn
        ? window.studentManager.updateStudentProfile(origNisn, payload)
        : window.studentManager.addStudent(payload);

      if (res.success) {
        modalStudentForm.classList.add('hidden');
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
        setupSubjectAndClassFilters();
      } else {
        alert(res.message);
      }
    });
  }

  const searchStudentInput = document.getElementById('searchStudentInput');
  if (searchStudentInput) {
    searchStudentInput.addEventListener('input', (e) => renderAdminStudentsList(e.target.value.trim()));
  }

  const btnDownloadStudentTemplate = document.getElementById('btnDownloadStudentTemplate');
  if (btnDownloadStudentTemplate) {
    btnDownloadStudentTemplate.addEventListener('click', () => window.studentManager.downloadExcelTemplate());
  }

  const btnTriggerImportStudents = document.getElementById('btnTriggerImportStudents');
  const fileImportStudentsExcel = document.getElementById('fileImportStudentsExcel');
  if (btnTriggerImportStudents && fileImportStudentsExcel) {
    btnTriggerImportStudents.addEventListener('click', () => fileImportStudentsExcel.click());
    fileImportStudentsExcel.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const result = window.studentManager.importFromExcel(evt.target.result);
        if (result.success) {
          alert(`Sukses! Berhasil mengimpor ${result.count} data siswa dari file Excel.`);
          renderAdminStudentsList();
          setupSubjectAndClassFilters();
        } else {
          alert(`Gagal impor Excel: ${result.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    });
  }

  const btnGenerate250Demo = document.getElementById('btnGenerate250Demo');
  if (btnGenerate250Demo) {
    btnGenerate250Demo.addEventListener('click', () => {
      if (confirm("Buat otomatis 250 akun siswa demo lengkap dengan NISN, TTL, Jenis Kelamin, Alamat, dan Kelas?")) {
        const res = window.studentManager.generate250DemoStudents();
        alert(`Sukses! ${res.count} siswa demo berhasil dimuat ke pangkalan data sekolah.`);
        renderAdminStudentsList();
        setupSubjectAndClassFilters();
      }
    });
  }

  // Modal Preview, Download PDF, & Cetak Kartu Peserta
  const modalPrintCardsPreview = document.getElementById('modalPrintCardsPreview');
  const cardPreviewContainer = document.getElementById('cardPreviewContainer');
  const cardPreviewClassFilter = document.getElementById('cardPreviewClassFilter');
  const cardPreviewCountBadge = document.getElementById('cardPreviewCountBadge');
  const btnCloseCardPreview = document.getElementById('btnCloseCardPreview');
  const btnCancelCardPreview = document.getElementById('btnCancelCardPreview');
  const btnExecuteDirectPrintCards = document.getElementById('btnExecuteDirectPrintCards');
  const btnDownloadCardsPerClassPdf = document.getElementById('btnDownloadCardsPerClassPdf');
  const btnDownloadCardsPdf = document.getElementById('btnDownloadCardsPdf');

  function getFilteredPreviewCardStudents() {
    const selectedClass = cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL";
    let students = window.studentManager.getAllStudents();
    if (selectedClass !== "ALL") {
      students = students.filter(s => String(s.class).trim().toUpperCase() === String(selectedClass).trim().toUpperCase());
    }
    return students;
  }

  function updateCardModalButtonLabels(selectedClass = "ALL") {
    if (btnDownloadCardsPerClassPdf) {
      btnDownloadCardsPerClassPdf.innerHTML = selectedClass === "ALL"
        ? '<span>📥 Download PDF Per Kelas</span>'
        : `<span>📥 Download PDF Kelas ${escapeHtmlSafe(selectedClass)}</span>`;
    }
  }

  function openCardPreviewModal() {
    if (!modalPrintCardsPreview || !window.studentManager) return;
    const students = window.studentManager.getAllStudents();
    if (students.length === 0) {
      alert("Belum ada data siswa. Silakan klik '🎲 Isi 250 Siswa Demo' atau '📥 Impor dari Excel' terlebih dahulu.");
      return;
    }

    if (cardPreviewClassFilter) {
      const classes = window.studentManager.getAllClasses();
      cardPreviewClassFilter.innerHTML = `<option value="ALL">Semua Kelas (${students.length} Siswa)</option>`;
      classes.forEach(c => {
        const count = students.filter(s => String(s.class).trim().toUpperCase() === String(c).trim().toUpperCase()).length;
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = `Kelas ${c} (${count} Siswa)`;
        cardPreviewClassFilter.appendChild(opt);
      });
      cardPreviewClassFilter.value = "ALL";
    }

    renderCardPreviewContent("ALL");
    modalPrintCardsPreview.classList.remove('hidden');
  }

  function renderCardPreviewContent(selectedClass = "ALL") {
    if (!cardPreviewContainer || !window.studentManager) return;
    const allStudents = window.studentManager.getAllStudents();
    let students = allStudents;
    if (selectedClass !== "ALL") {
      students = allStudents.filter(s => String(s.class).trim().toUpperCase() === String(selectedClass).trim().toUpperCase());
    }

    updateCardModalButtonLabels(selectedClass);

    if (cardPreviewCountBadge) {
      cardPreviewCountBadge.innerText = `${students.length} Kartu (${selectedClass === "ALL" ? "Semua Kelas" : "Kelas " + selectedClass})`;
    }

    if (selectedClass === "ALL") {
      const classes = window.studentManager.getAllClasses();
      if (classes.length > 1) {
        const groupedHtml = classes.map(cls => {
          const clsStudents = allStudents.filter(s => String(s.class).trim().toUpperCase() === String(cls).trim().toUpperCase());
          if (clsStudents.length === 0) return '';
          const clsCardsHtml = window.studentManager.generateCardsHtml(clsStudents, window.examEngine.config.examTitle);
          return `
            <div class="mb-6 last:mb-0">
              <div class="max-w-4xl mx-auto mb-3 px-3.5 py-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-xs">
                <span class="text-xs font-extrabold text-slate-800">Kelas ${escapeHtmlSafe(cls)}</span>
                <span class="text-[11px] font-bold text-blue-700">${clsStudents.length} Siswa</span>
              </div>
              <div class="cards-grid grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center max-w-4xl mx-auto">
                ${clsCardsHtml}
              </div>
            </div>
          `;
        }).join('');
        cardPreviewContainer.innerHTML = groupedHtml;
        return;
      }
    }

    const cardsHtml = window.studentManager.generateCardsHtml(students, window.examEngine.config.examTitle);
    cardPreviewContainer.innerHTML = `
      <div class="cards-grid grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center max-w-4xl mx-auto">
        ${cardsHtml}
      </div>
    `;
  }

  function closeCardPreviewModal() {
    if (modalPrintCardsPreview) modalPrintCardsPreview.classList.add('hidden');
  }

  if (cardPreviewClassFilter) {
    cardPreviewClassFilter.addEventListener('change', (e) => renderCardPreviewContent(e.target.value));
  }
  if (btnCloseCardPreview) btnCloseCardPreview.addEventListener('click', closeCardPreviewModal);
  if (btnCancelCardPreview) btnCancelCardPreview.addEventListener('click', closeCardPreviewModal);

  if (btnExecuteDirectPrintCards) {
    btnExecuteDirectPrintCards.addEventListener('click', () => {
      const selectedClass = cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL";
      const students = getFilteredPreviewCardStudents();
      closeCardPreviewModal();
      window.studentManager.printExamCards(students, window.examEngine.config.examTitle, {
        classLabel: selectedClass === "ALL" ? "" : selectedClass,
        groupByClass: selectedClass === "ALL"
      });
    });
  }

  if (btnDownloadCardsPerClassPdf) {
    btnDownloadCardsPerClassPdf.addEventListener('click', async () => {
      const selectedClass = cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL";
      const allStudents = window.studentManager.getAllStudents();
      const classes = window.studentManager.getAllClasses();

      if (selectedClass === "ALL" && classes.length > 1) {
        if (!confirm(`Akan mengunduh ${classes.length} file PDF terpisah (1 file PDF untuk setiap kelas: ${classes.join(', ')}). Lanjutkan?`)) {
          return;
        }
      }

      btnDownloadCardsPerClassPdf.disabled = true;
      if (btnDownloadCardsPdf) btnDownloadCardsPdf.disabled = true;
      try {
        if (selectedClass !== "ALL") {
          btnDownloadCardsPerClassPdf.innerHTML = `<span>⏳ Membuat PDF ${escapeHtmlSafe(selectedClass)}...</span>`;
          const students = getFilteredPreviewCardStudents();
          await window.studentManager.downloadCardsPdf(students, window.examEngine.config.examTitle, {
            classLabel: selectedClass,
            groupByClass: false
          });
        } else {
          await window.studentManager.downloadCardsPerClassSeparatePdfs(
            allStudents,
            window.examEngine.config.examTitle,
            (done, total, cls) => {
              btnDownloadCardsPerClassPdf.innerHTML = `<span>⏳ PDF ${done}/${total} (${escapeHtmlSafe(cls)})...</span>`;
            }
          );
        }
        closeCardPreviewModal();
      } finally {
        btnDownloadCardsPerClassPdf.disabled = false;
        if (btnDownloadCardsPdf) btnDownloadCardsPdf.disabled = false;
        updateCardModalButtonLabels(cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL");
      }
    });
  }

  if (btnDownloadCardsPdf) {
    btnDownloadCardsPdf.addEventListener('click', async () => {
      const students = window.studentManager.getAllStudents();
      const prevHtml = btnDownloadCardsPdf.innerHTML;
      btnDownloadCardsPdf.disabled = true;
      if (btnDownloadCardsPerClassPdf) btnDownloadCardsPerClassPdf.disabled = true;
      btnDownloadCardsPdf.innerHTML = '<span>⏳ Membuat PDF Semua...</span>';
      try {
        await window.studentManager.downloadCardsPdf(students, window.examEngine.config.examTitle, {
          classLabel: "",
          groupByClass: true
        });
        closeCardPreviewModal();
      } finally {
        btnDownloadCardsPdf.disabled = false;
        if (btnDownloadCardsPerClassPdf) btnDownloadCardsPerClassPdf.disabled = false;
        btnDownloadCardsPdf.innerHTML = prevHtml;
      }
    });
  }

  const btnPrintStudentCards = document.getElementById('btnPrintStudentCards');
  if (btnPrintStudentCards) btnPrintStudentCards.addEventListener('click', openCardPreviewModal);

  const btnResetAllStudentPasswords = document.getElementById('btnResetAllStudentPasswords');
  if (btnResetAllStudentPasswords) {
    btnResetAllStudentPasswords.addEventListener('click', () => {
      if (confirm("Yakin ingin mereset password SELURUH siswa ke default '123'?")) {
        const res = window.studentManager.resetAllStudentPasswords("123");
        alert(`Sukses! Password ${res.count} siswa berhasil direset ke '123'.`);
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
      }
    });
  }

  const btnClearStudents = document.getElementById('btnClearStudents');
  if (btnClearStudents) {
    btnClearStudents.addEventListener('click', () => {
      if (confirm("Peringatan: Yakin ingin mengosongkan seluruh data siswa peserta ujian?")) {
        window.studentManager.clearAllStudents();
        renderAdminStudentsList();
        setupSubjectAndClassFilters();
      }
    });
  }

  // ===================== TAB 4: MANAJEMEN GURU + EXCEL TEMPLATE & IMPORT =====================
  const btnDownloadTeacherTemplate = document.getElementById('btnDownloadTeacherTemplate');
  if (btnDownloadTeacherTemplate) {
    btnDownloadTeacherTemplate.addEventListener('click', () => {
      window.cbtAdmin.downloadTeacherExcelTemplate();
    });
  }

  const btnTriggerImportTeachers = document.getElementById('btnTriggerImportTeachers');
  const fileImportTeachersExcel = document.getElementById('fileImportTeachersExcel');
  if (btnTriggerImportTeachers && fileImportTeachersExcel) {
    btnTriggerImportTeachers.addEventListener('click', () => fileImportTeachersExcel.click());
    fileImportTeachersExcel.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const result = window.cbtAdmin.importTeachersFromExcel(evt.target.result);
        if (result.success) {
          alert(`Sukses! Berhasil mengimpor / memperbarui ${result.count} akun guru dari file Excel.`);
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
        } else {
          alert(`Gagal impor Excel guru: ${result.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    });
  }

  function renderAdminTeachersList(searchQuery = "") {
    const tbody = document.getElementById('adminTeachersTbody');
    const badge = document.getElementById('teacherCountBadge');
    if (!tbody || !window.cbtAdmin) return;
    tbody.innerHTML = '';

    const teachers = searchQuery
      ? window.cbtAdmin.searchTeachers(searchQuery)
      : window.cbtAdmin.getAllTeachers();

    if (badge) {
      const guruCount = window.cbtAdmin.getAllTeachers().filter(t => t.role !== 'admin').length;
      badge.innerText = `Total: ${guruCount} Guru (+ 1 Proktor)`;
    }

    if (teachers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Tidak ada data guru ditemukan.</td></tr>`;
      return;
    }

    teachers.forEach((t, idx) => {
      const isSuperAdmin = t.role === 'admin' || t.id === 'admin';
      const parsedClasses = window.cbtAdmin.parseTeacherClasses(t.classes);
      const classBadgeHtml = isSuperAdmin
        ? `<span class="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold text-[11px]">Semua Kelas</span>`
        : (parsedClasses.length > 0
          ? `<span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px]">${parsedClasses.join(', ')}</span>`
          : `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium text-[11px]">Semua Kelas</span>`);

      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3 font-mono font-bold text-slate-700">${t.nip}</td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${t.name}</div>
          ${isSuperAdmin ? '<span class="text-[10px] font-black text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full inline-block mt-0.5">Proktor Utama / Admin</span>' : ''}
        </td>
        <td class="p-3"><span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs">${t.subject}</span></td>
        <td class="p-3 whitespace-nowrap">${classBadgeHtml}</td>
        <td class="p-3">
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-bold text-slate-700 teacher-pin-val">••••••</span>
            <button type="button" class="btn-toggle-row-pin text-[11px] text-blue-600 hover:underline cursor-pointer" title="Lihat Password">👁️</button>
          </div>
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          <button type="button" data-id="${t.id}" class="btn-edit-teacher px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition cursor-pointer mr-1">
            ✏️ Edit
          </button>
          ${!isSuperAdmin ? `
            <button type="button" data-id="${t.id}" class="btn-delete-teacher px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition cursor-pointer" title="Hapus Guru">
              🗑️
            </button>
          ` : `
            <span class="text-[10px] text-slate-400 italic">Akun Utama</span>
          `}
        </td>
      `;

      const pinValSpan = tr.querySelector('.teacher-pin-val');
      const btnToggleRowPin = tr.querySelector('.btn-toggle-row-pin');
      if (btnToggleRowPin && pinValSpan) {
        let visible = false;
        btnToggleRowPin.addEventListener('click', () => {
          visible = !visible;
          pinValSpan.innerText = visible ? t.pin : '••••••';
          pinValSpan.className = visible ? 'font-mono font-bold text-blue-700 teacher-pin-val' : 'font-mono font-bold text-slate-700 teacher-pin-val';
          btnToggleRowPin.innerText = visible ? '🔒' : '👁️';
        });
      }

      tr.querySelector('.btn-edit-teacher').addEventListener('click', () => openEditTeacherModal(t));

      const btnDelete = tr.querySelector('.btn-delete-teacher');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          if (confirm(`Yakin ingin menghapus guru "${t.name}" (${t.subject})?`)) {
            const delRes = window.cbtAdmin.deleteTeacher(t.id);
            if (delRes.success) {
              alert(delRes.message);
              renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value || '');
              setupSubjectAndClassFilters();
              setupQuestionBankFilters();
              setupMonitoringControls();
              renderAdminTeacherQuestionProgress();
            } else {
              alert(delRes.message);
            }
          }
        });
      }

      tbody.appendChild(tr);
    });
  }

  const searchTeacherInput = document.getElementById('searchTeacherInput');
  if (searchTeacherInput) {
    searchTeacherInput.addEventListener('input', (e) => renderAdminTeachersList(e.target.value.trim()));
  }

  const modalEditTeacher = document.getElementById('modalEditTeacher');
  const formEditTeacher = document.getElementById('formEditTeacher');
  const btnCloseEditTeacher = document.getElementById('btnCloseEditTeacher');
  const btnCancelEditTeacher = document.getElementById('btnCancelEditTeacher');
  const btnOpenAddTeacher = document.getElementById('btnOpenAddTeacher');

  if (btnOpenAddTeacher) btnOpenAddTeacher.addEventListener('click', openAddTeacherModal);

  function openAddTeacherModal() {
    if (!modalEditTeacher) return;
    document.getElementById('modalEditTeacherTitle').innerText = "Tambah Guru Baru";
    document.getElementById('modalEditTeacherSubtitle').innerText = "Masukkan data guru pengampu mata pelajaran & password login";
    document.getElementById('btnSubmitEditTeacher').innerText = "Simpan Guru Baru";

    document.getElementById('editTeacherId').value = "";
    document.getElementById('editTeacherName').value = "";
    document.getElementById('editTeacherNip').value = "";
    document.getElementById('editTeacherSubject').value = "";
    document.getElementById('editTeacherClasses').value = "";
    document.getElementById('editTeacherPin').value = "guru123";

    modalEditTeacher.classList.remove('hidden');
    document.getElementById('editTeacherName').focus();
  }

  function openEditTeacherModal(teacher) {
    if (!modalEditTeacher) return;
    document.getElementById('modalEditTeacherTitle').innerText = "Edit Data & Password Guru";
    document.getElementById('modalEditTeacherSubtitle').innerText = "Perbarui identitas, mapel, kelas diampu, atau password/PIN akun guru";
    document.getElementById('btnSubmitEditTeacher').innerText = "Simpan Perubahan";

    document.getElementById('editTeacherId').value = teacher.id;
    document.getElementById('editTeacherName').value = teacher.name;
    document.getElementById('editTeacherNip').value = teacher.nip;
    document.getElementById('editTeacherSubject').value = teacher.subject;
    document.getElementById('editTeacherClasses').value = teacher.classes || "";
    document.getElementById('editTeacherPin').value = teacher.pin;

    modalEditTeacher.classList.remove('hidden');
  }

  function closeEditTeacherModal() {
    if (modalEditTeacher) modalEditTeacher.classList.add('hidden');
  }

  if (btnCloseEditTeacher) btnCloseEditTeacher.addEventListener('click', closeEditTeacherModal);
  if (btnCancelEditTeacher) btnCancelEditTeacher.addEventListener('click', closeEditTeacherModal);

  if (formEditTeacher) {
    formEditTeacher.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('editTeacherId').value;
      const name = document.getElementById('editTeacherName').value.trim();
      const nip = document.getElementById('editTeacherNip').value.trim();
      const subject = document.getElementById('editTeacherSubject').value.trim();
      const classes = document.getElementById('editTeacherClasses').value.trim().toUpperCase();
      const pin = document.getElementById('editTeacherPin').value.trim();

      if (!name || !nip || !subject || !pin) {
        alert("Semua kolom wajib harus diisi!");
        return;
      }

      if (!id) {
        const res = window.cbtAdmin.addTeacher({ name, nip, subject, classes, pin });
        if (res.success) {
          alert(`Sukses! Guru "${name}" berhasil ditambahkan ke pangkalan data.`);
          closeEditTeacherModal();
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
          setupQuestionBankFilters();
          setupMonitoringControls();
          renderAdminTeacherQuestionProgress();
        } else {
          alert(`Gagal menambah guru: ${res.message}`);
        }
      } else {
        const res = window.cbtAdmin.updateTeacherProfile(id, { name, nip, subject, classes, pin });
        if (res.success) {
          alert(`Data guru "${name}" berhasil diperbarui!`);
          closeEditTeacherModal();
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
          setupQuestionBankFilters();
          setupMonitoringControls();
          renderAdminTeacherQuestionProgress();
          const cur = window.cbtAdmin.getCurrentTeacher();
          if (cur && cur.id === id) renderAdminDashboard();
        } else {
          alert(`Gagal edit guru: ${res.message}`);
        }
      }
    });
  }

  const btnResetAllTeacherPasswords = document.getElementById('btnResetAllTeacherPasswords');
  if (btnResetAllTeacherPasswords) {
    btnResetAllTeacherPasswords.addEventListener('click', () => {
      if (confirm("Yakin ingin mereset password/PIN SELURUH guru ke default 'guru123'?")) {
        const res = window.cbtAdmin.resetAllTeacherPasswords("guru123");
        alert(`Sukses! Password ${res.count} guru telah direset ke 'guru123'.`);
        renderAdminTeachersList();
      }
    });
  }

  // ===================== PRATINJAU, DOWNLOAD PDF, & CETAK KARTU LOGIN GURU =====================
  const modalPrintTeacherCardsPreview = document.getElementById('modalPrintTeacherCardsPreview');
  const teacherCardFilter = document.getElementById('teacherCardFilter');
  const teacherCardPreviewContainer = document.getElementById('teacherCardPreviewContainer');
  const teacherCardPreviewCountBadge = document.getElementById('teacherCardPreviewCountBadge');
  const btnCloseTeacherCardPreview = document.getElementById('btnCloseTeacherCardPreview');
  const btnCancelTeacherCardPreview = document.getElementById('btnCancelTeacherCardPreview');
  const btnExecuteDirectPrintTeacherCards = document.getElementById('btnExecuteDirectPrintTeacherCards');
  const btnDownloadTeacherCardsPdf = document.getElementById('btnDownloadTeacherCardsPdf');
  const btnPrintTeacherCards = document.getElementById('btnPrintTeacherCards');

  function getFilteredPreviewCardTeachers(filterValOverride) {
    const filterVal = filterValOverride !== undefined
      ? filterValOverride
      : (teacherCardFilter ? teacherCardFilter.value : 'GURU_ONLY');
    const allTeachers = window.cbtAdmin ? window.cbtAdmin.getAllTeachers() : [];

    if (filterVal === 'ALL') {
      return allTeachers;
    }
    if (filterVal.startsWith('TEACHER:')) {
      const targetId = filterVal.slice('TEACHER:'.length);
      return allTeachers.filter(t => String(t.id) === String(targetId));
    }
    return allTeachers.filter(t => t && t.role !== 'admin' && t.id !== 'admin');
  }

  function renderTeacherCardPreviewContent(filterValOverride) {
    if (!teacherCardPreviewContainer || !window.cbtAdmin) return;
    const filterVal = filterValOverride !== undefined
      ? filterValOverride
      : (teacherCardFilter ? teacherCardFilter.value : 'GURU_ONLY');
    const teachers = getFilteredPreviewCardTeachers(filterVal);

    if (teacherCardPreviewCountBadge) {
      let labelDesc = 'Hanya Guru Mapel';
      if (filterVal === 'ALL') labelDesc = 'Semua Akun';
      else if (filterVal.startsWith('TEACHER:') && teachers[0]) labelDesc = teachers[0].name;
      teacherCardPreviewCountBadge.innerText = `${teachers.length} Kartu (${labelDesc})`;
    }

    const cardsHtml = window.cbtAdmin.generateTeacherCardsHtml(teachers, window.examEngine.config.examTitle);
    teacherCardPreviewContainer.innerHTML = `
      <div class="cards-grid grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center max-w-4xl mx-auto">
        ${cardsHtml}
      </div>
    `;
  }

  function openTeacherCardPreviewModal() {
    if (!modalPrintTeacherCardsPreview || !window.cbtAdmin) return;
    const allTeachers = window.cbtAdmin.getAllTeachers();
    if (allTeachers.length === 0) {
      alert("Belum ada data akun guru.");
      return;
    }

    if (teacherCardFilter) {
      const guruOnlyList = allTeachers.filter(t => t && t.role !== 'admin' && t.id !== 'admin');
      teacherCardFilter.innerHTML = `
        <option value="GURU_ONLY">Hanya Guru Mapel (${guruOnlyList.length} Guru)</option>
        <option value="ALL">Semua Akun (Guru + Proktor/Admin: ${allTeachers.length})</option>
      `;
      allTeachers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = `TEACHER:${t.id}`;
        const roleTag = (t.role === 'admin' || t.id === 'admin') ? 'Admin' : (t.subject || 'Guru');
        opt.innerText = `${t.name} (${roleTag})`;
        teacherCardFilter.appendChild(opt);
      });
      teacherCardFilter.value = guruOnlyList.length > 0 ? 'GURU_ONLY' : 'ALL';
    }

    renderTeacherCardPreviewContent();
    modalPrintTeacherCardsPreview.classList.remove('hidden');
  }

  function closeTeacherCardPreviewModal() {
    if (modalPrintTeacherCardsPreview) modalPrintTeacherCardsPreview.classList.add('hidden');
  }

  if (btnPrintTeacherCards) btnPrintTeacherCards.addEventListener('click', openTeacherCardPreviewModal);
  if (teacherCardFilter) {
    teacherCardFilter.addEventListener('change', (e) => renderTeacherCardPreviewContent(e.target.value));
  }
  if (btnCloseTeacherCardPreview) btnCloseTeacherCardPreview.addEventListener('click', closeTeacherCardPreviewModal);
  if (btnCancelTeacherCardPreview) btnCancelTeacherCardPreview.addEventListener('click', closeTeacherCardPreviewModal);

  if (btnExecuteDirectPrintTeacherCards) {
    btnExecuteDirectPrintTeacherCards.addEventListener('click', () => {
      const teachers = getFilteredPreviewCardTeachers();
      closeTeacherCardPreviewModal();
      window.cbtAdmin.printTeacherCards(teachers, window.examEngine.config.examTitle);
    });
  }

  if (btnDownloadTeacherCardsPdf) {
    btnDownloadTeacherCardsPdf.addEventListener('click', async () => {
      const teachers = getFilteredPreviewCardTeachers();
      const prevHtml = btnDownloadTeacherCardsPdf.innerHTML;
      btnDownloadTeacherCardsPdf.disabled = true;
      btnDownloadTeacherCardsPdf.innerHTML = '<span>⏳ Membuat PDF...</span>';
      try {
        await window.cbtAdmin.downloadTeacherCardsPdf(teachers, window.examEngine.config.examTitle);
        closeTeacherCardPreviewModal();
      } finally {
        btnDownloadTeacherCardsPdf.disabled = false;
        btnDownloadTeacherCardsPdf.innerHTML = prevHtml;
      }
    });
  }

  // ===================== TAB 5: PENGATURAN JADWAL, TITI MANGSA & LOGO, DAN CLOUD =====================
  function renderAdminConfigForm() {
    const config = window.examEngine.config;
    document.getElementById('cfgExamTitle').value = config.examTitle || '';
    document.getElementById('cfgSubject').value = config.subject || '';
    document.getElementById('cfgDurationMinutes').value = config.durationMinutes || 80;
    document.getElementById('cfgExamToken').value = config.examToken || 'CBT80M';
    document.getElementById('cfgMaxCheats').value = config.maxCheatViolations || 3;
    const maxAttEl = document.getElementById('cfgMaxAttempts');
    if (maxAttEl) maxAttEl.value = config.maxAttempts || 1;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    document.getElementById('cfgAdminPin').value = currentTeacher && currentTeacher.pin ? currentTeacher.pin : '';
  }

  const formExamConfig = document.getElementById('formExamConfig');
  if (formExamConfig) {
    formExamConfig.addEventListener('submit', (e) => {
      e.preventDefault();
      const updated = {
        examTitle: document.getElementById('cfgExamTitle').value.trim(),
        subject: document.getElementById('cfgSubject').value.trim(),
        durationMinutes: parseInt(document.getElementById('cfgDurationMinutes').value) || 80,
        examToken: document.getElementById('cfgExamToken').value.trim().toUpperCase(),
        showScoreToStudent: false,
        maxCheatViolations: parseInt(document.getElementById('cfgMaxCheats').value) || 3,
        maxAttempts: Math.max(1, Math.min(10, parseInt(document.getElementById('cfgMaxAttempts')?.value, 10) || 1))
      };

      const currentTeacher = window.cbtAdmin.getCurrentTeacher();
      const newPin = document.getElementById('cfgAdminPin').value.trim();
      if (currentTeacher && newPin) {
        window.cbtAdmin.updateTeacherPin(currentTeacher.id, newPin);
      }

      window.cbtAdmin.updateConfig(updated);
      alert("Pengaturan ujian berhasil disimpan!");
      renderConfigInfoOnLogin();
    });
  }

  const btnGenerateToken = document.getElementById('btnGenerateToken');
  if (btnGenerateToken) {
    btnGenerateToken.addEventListener('click', () => {
      document.getElementById('cfgExamToken').value = window.cbtAdmin.generateRandomToken();
    });
  }

  const btnQuickSaveExamTitle = document.getElementById('btnQuickSaveExamTitle');
  if (btnQuickSaveExamTitle) {
    btnQuickSaveExamTitle.addEventListener('click', () => {
      const titleInput = document.getElementById('cfgExamTitle');
      const newTitle = titleInput ? titleInput.value.trim() : '';
      if (!newTitle) {
        alert("Judul ujian tidak boleh kosong!");
        return;
      }
      window.cbtAdmin.updateConfig({ examTitle: newTitle });
      renderConfigInfoOnLogin();
      alert(`Judul ujian berhasil diperbarui menjadi:\n"${newTitle}"`);
    });
  }

  function renderSchoolConfigForm() {
    if (!window.cbtAdmin) return;
    const cfg = window.cbtAdmin.getSchoolConfig();
    const subEl = document.getElementById('cfgSchoolSubtitle');
    const nameEl = document.getElementById('cfgSchoolName');
    const addrEl = document.getElementById('cfgSchoolAddress');
    const cityEl = document.getElementById('cfgSchoolCity');
    const dateEl = document.getElementById('cfgSchoolDate');
    const hmNameEl = document.getElementById('cfgHeadmasterName');
    const hmNipEl = document.getElementById('cfgHeadmasterNip');

    if (subEl) subEl.value = cfg.schoolSubtitle || '';
    if (nameEl) nameEl.value = cfg.schoolName || 'SMP NEGERI 2 PACET';
    if (addrEl) addrEl.value = cfg.schoolAddress || '';
    if (cityEl) cityEl.value = cfg.city || 'Pacet';
    if (dateEl) dateEl.value = cfg.date || '';
    if (hmNameEl) hmNameEl.value = cfg.headmasterName || '';
    if (hmNipEl) hmNipEl.value = cfg.headmasterNip || '';

    currentLogoLeftBase64 = cfg.logoLeft || '';
    currentLogoRightBase64 = cfg.logoRight || '';
    currentLogoCbtBase64 = cfg.logoCbt || '';
    renderLogoPreview('left', currentLogoLeftBase64);
    renderLogoPreview('right', currentLogoRightBase64);
    renderLogoPreview('cbt', currentLogoCbtBase64);
  }

  const formSchoolConfig = document.getElementById('formSchoolConfig');
  if (formSchoolConfig) {
    formSchoolConfig.addEventListener('submit', (e) => {
      e.preventDefault();
      const existingCfg = window.cbtAdmin.getSchoolConfig();
      const payload = {
        ...existingCfg,
        schoolSubtitle: document.getElementById('cfgSchoolSubtitle').value.trim(),
        schoolName: document.getElementById('cfgSchoolName').value.trim(),
        schoolAddress: document.getElementById('cfgSchoolAddress').value.trim(),
        city: document.getElementById('cfgSchoolCity').value.trim(),
        date: document.getElementById('cfgSchoolDate').value.trim(),
        headmasterName: document.getElementById('cfgHeadmasterName').value.trim(),
        headmasterNip: document.getElementById('cfgHeadmasterNip').value.trim(),
        logoLeft: currentLogoLeftBase64,
        logoRight: currentLogoRightBase64,
        logoCbt: currentLogoCbtBase64
      };
      const res = window.cbtAdmin.saveSchoolConfig(payload);
      if (res.success) {
        renderConfigInfoOnLogin();
        alert("Identitas Sekolah, Logo Kop Surat, Logo CBT & Titi Mangsa Kepala Sekolah berhasil disimpan!");
      } else {
        alert("Gagal menyimpan konfigurasi sekolah: " + res.message);
      }
    });
  }

  function renderSupabaseConfigForm() {
    if (!window.supabaseSync) return;
    const cfg = window.supabaseSync.getConfig();
    const urlEl = document.getElementById('cfgSupabaseUrl');
    const keyEl = document.getElementById('cfgSupabaseKey');
    if (urlEl) urlEl.value = cfg.supabaseUrl || '';
    if (keyEl) keyEl.value = cfg.supabaseKey || '';
    updateCloudBadge();
  }

  function updateCloudBadge() {
    const badge = document.getElementById('cloudStatusBadge');
    const dot = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');
    if (!badge || !window.supabaseSync) return;

    const isAdminVisible = Boolean(viewAdmin && !viewAdmin.classList.contains('hidden'));
    updateRealtimeNotifVisibility(isAdminVisible);

    if (!isAdminVisible) {
      badge.className = "hidden";
      return;
    }

    if (window.supabaseSync.isCloudConfigured()) {
      badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300";
      if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
      if (text) text.innerText = "Cloud Online";
    } else {
      badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200";
      if (dot) dot.className = "w-2 h-2 rounded-full bg-slate-400";
      if (text) text.innerText = "Mode Lokal";
    }
  }

  const formSupabaseConfig = document.getElementById('formSupabaseConfig');
  if (formSupabaseConfig) {
    formSupabaseConfig.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = document.getElementById('cfgSupabaseUrl').value.trim();
      const key = document.getElementById('cfgSupabaseKey').value.trim();
      window.supabaseSync.saveConfig(url, key);
      updateCloudBadge();
      if (viewAdmin && !viewAdmin.classList.contains('hidden')) {
        stopAdminRealtimeNotifications();
        startAdminRealtimeNotifications();
      }
      const res = await window.supabaseSync.pushAllSchoolState();
      if (res.success) {
        alert("Konfigurasi Cloud disimpan & seluruh data sekolah (Token, Jadwal, Kop/Logo, Soal, Siswa, Guru) berhasil disinkronkan ke Cloud!");
      } else {
        alert("Konfigurasi Cloud Supabase berhasil disimpan! (Pastikan koneksi internet aktif untuk mengirim data ke Cloud).");
      }
    });
  }

  const btnPullFromCloud = document.getElementById('btnPullFromCloud');
  if (btnPullFromCloud) {
    btnPullFromCloud.addEventListener('click', async () => {
      if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum aktif.");
        return;
      }
      btnPullFromCloud.disabled = true;
      btnPullFromCloud.innerText = "Mengambil dari Cloud...";
      const pulled = await syncFromCloud(true);
      btnPullFromCloud.disabled = false;
      btnPullFromCloud.innerText = "⬇️ Ambil Data dari Cloud";
      if (pulled) {
        alert("Sukses! Data terbaru (Pengaturan/Token, Kop/Logo, Jadwal, Soal, Siswa, Guru) berhasil diambil dari Cloud ke perangkat ini.");
      } else {
        alert("Belum ada data tersimpan di Cloud atau koneksi gagal. Silakan klik '☁️ Kirim Semua Data ke Cloud' dari laptop utama Anda terlebih dahulu.");
      }
    });
  }

  const btnPushAllToCloud = document.getElementById('btnPushAllToCloud');
  if (btnPushAllToCloud) {
    btnPushAllToCloud.addEventListener('click', async () => {
      if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum aktif. Simpan URL dan Anon Key terlebih dahulu.");
        return;
      }
      btnPushAllToCloud.disabled = true;
      btnPushAllToCloud.innerText = "Mengirim ke Cloud...";
      const res = await window.supabaseSync.pushAllSchoolState();
      btnPushAllToCloud.disabled = false;
      btnPushAllToCloud.innerText = "☁️ Kirim Semua Data ke Cloud";
      if (res.success) {
        alert(`Sukses! ${res.count} kelompok data (Pengaturan/Token, Identitas/Logo, Jadwal, Bank Soal, Siswa, Guru) telah dikirim ke Cloud dan langsung terbaca di semua HP & Laptop.`);
      } else {
        alert("Gagal mengirim data ke Cloud: " + (res.message || "Periksa koneksi internet Anda."));
      }
    });
  }

  const btnTestSupabase = document.getElementById('btnTestSupabase');
  if (btnTestSupabase) {
    btnTestSupabase.addEventListener('click', async () => {
      const url = document.getElementById('cfgSupabaseUrl').value.trim();
      const key = document.getElementById('cfgSupabaseKey').value.trim();
      btnTestSupabase.disabled = true;
      btnTestSupabase.innerText = "Menguji koneksi...";
      const res = await window.supabaseSync.testConnection(url, key);
      btnTestSupabase.disabled = false;
      btnTestSupabase.innerText = "⚡ Uji Koneksi Cloud";
      alert(res.message);
      updateCloudBadge();
    });
  }

  const btnSyncCloudResults = document.getElementById('btnSyncCloudResults');
  if (btnSyncCloudResults) {
    btnSyncCloudResults.addEventListener('click', async () => {
      if (!window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum dikonfigurasi. Masukkan Project URL dan Anon Key di menu 'Database'.");
        return;
      }
      btnSyncCloudResults.disabled = true;
      btnSyncCloudResults.innerText = "Menyinkronkan...";
      showResultsLoadingSkeleton(6);
      try {
        const res = await window.supabaseSync.fetchCloudResults();
        if (res.success) {
          renderAdminAnalyticsAndResults({ animateRows: true });
          alert(`Sinkronisasi sukses! Mengambil ${res.count} data hasil ujian dari cloud.`);
        } else {
          renderAdminAnalyticsAndResults({ animateRows: false });
          alert(`Gagal sinkron cloud: ${res.message}`);
        }
      } catch (err) {
        renderAdminAnalyticsAndResults({ animateRows: false });
        alert(`Gagal sinkron cloud: ${err.message || err}`);
      } finally {
        btnSyncCloudResults.disabled = false;
        btnSyncCloudResults.innerText = "🔄 Sinkron Cloud";
      }
    });
  }

  // Backup & Pulihkan Seluruh Data Sekolah (1 Klik)
  const btnExportFullBackup = document.getElementById('btnExportFullBackup');
  if (btnExportFullBackup) {
    btnExportFullBackup.addEventListener('click', () => {
      const res = window.cbtAdmin.exportAllAppData();
      if (!res.success) alert(res.message);
    });
  }

  const btnTriggerImportFullBackup = document.getElementById('btnTriggerImportFullBackup');
  const fileImportFullBackup = document.getElementById('fileImportFullBackup');
  if (btnTriggerImportFullBackup && fileImportFullBackup) {
    btnTriggerImportFullBackup.addEventListener('click', () => fileImportFullBackup.click());
    fileImportFullBackup.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const res = window.cbtAdmin.importAllAppData(evt.target.result);
        if (res.success) {
          alert(`Pemulihan Sukses!\n• Guru: ${res.teachersCount}\n• Siswa: ${res.studentsCount}\n• Jadwal: ${res.schedulesCount}\n• Soal: ${res.questionsCount}`);
          renderAdminDashboard();
          renderConfigInfoOnLogin();
          updateCloudBadge();
        } else {
          alert(res.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  const isDevWorkspacePreview = typeof window !== 'undefined' && (
    window.location.hostname.includes('ais-dev-') ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
  const setupZipDownloadBtn = (btnId, endpoint, filename) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (!isDevWorkspacePreview) {
      btn.classList.add('hidden');
      return;
    }
    btn.classList.remove('hidden');
    btn.addEventListener('click', async () => {
      const orig = btn.innerText;
      btn.disabled = true;
      btn.innerText = '⏳ Menyiapkan ZIP...';
      try {
        const res = await fetch(endpoint, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (err) {
        alert('Gagal mengunduh ZIP: ' + (err && err.message ? err.message : err));
      } finally {
        btn.disabled = false;
        btn.innerText = orig;
      }
    });
  };
  setupZipDownloadBtn('btnDownloadCodeUpdateV337', '/api/download-v337.zip', 'cbt-update-v3.37.zip');
  setupZipDownloadBtn('btnDownloadProjectZipV337', '/api/download-project.zip', 'cbt-smpn2pacet-v3.37.zip');

  // ===================== DASHBOARD QUICK JUMP & CLOUD REFRESH =====================
  document.querySelectorAll('.dash-jump-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-jump-tab');
      if (target) switchAdminTab(target);
    });
  });

  const btnDashOpenPreExam = document.getElementById('btnDashOpenPreExam');
  if (btnDashOpenPreExam) {
    btnDashOpenPreExam.addEventListener('click', () => {
      switchAdminTab('tabQuestions');
      const panel = document.getElementById('itemAnalysisPanel');
      if (panel) panel.classList.remove('hidden');
      setItemAnalysisMode('pre_exam');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  const btnRefreshDashboardOverview = document.getElementById('btnRefreshDashboardOverview');
  if (btnRefreshDashboardOverview) {
    btnRefreshDashboardOverview.addEventListener('click', async () => {
      const origHtml = btnRefreshDashboardOverview.innerHTML;
      btnRefreshDashboardOverview.disabled = true;
      btnRefreshDashboardOverview.innerHTML = '<span>⏳ Menyegarkan...</span>';
      try {
        if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
          await syncFromCloud(true);
          if (typeof window.supabaseSync.fetchCloudResults === 'function') {
            await window.supabaseSync.fetchCloudResults();
          }
          if (typeof window.supabaseSync.fetchStudentSessions === 'function') {
            await window.supabaseSync.fetchStudentSessions();
          }
        }
        renderAdminOverviewDashboard();
      } catch (err) {
        console.warn('Gagal menyegarkan dashboard:', err);
      } finally {
        btnRefreshDashboardOverview.disabled = false;
        btnRefreshDashboardOverview.innerHTML = origHtml;
      }
    });
  }

  let d3ResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(d3ResizeTimer);
    d3ResizeTimer = setTimeout(() => {
      refreshVisibleD3Charts();
    }, 180);
  });

  // ===================== NOTIFIKASI REAL-TIME ADMIN & GURU (SUPABASE + POLLING) =====================
  function updateRealtimeNotifVisibility(isAdminVisible) {
    const container = document.getElementById('realtimeNotifContainer');
    const dropdown = document.getElementById('realtimeNotifDropdown');
    const liveTag = document.getElementById('realtimeNotifLiveTag');
    if (container) {
      if (isAdminVisible) container.classList.remove('hidden');
      else {
        container.classList.add('hidden');
        if (dropdown) dropdown.classList.add('hidden');
      }
    }
    if (liveTag && window.supabaseSync) {
      const isCloud = window.supabaseSync.isCloudConfigured();
      liveTag.innerText = isCloud ? 'Live' : 'Lokal';
      liveTag.className = isCloud
        ? 'px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[9px] font-black uppercase'
        : 'px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-[9px] font-black uppercase';
    }
    updateRealtimeBadgeAndSoundUi();
  }

  function isRecordInCurrentAdminScope(subject, className) {
    if (!window.cbtAdmin) return true;
    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    if (!currentTeacher) return false;
    const isAdmin = currentTeacher.role === 'admin' || currentTeacher.id === 'admin';
    if (isAdmin) return true;

    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher).map(s => s.toLowerCase());
    const subLower = String(subject || '').trim().toLowerCase();
    const subOk = teacherSubjects.length === 0 || teacherSubjects.some(ts => subLower === ts || subLower.includes(ts) || ts.includes(subLower));

    const assignedClasses = currentTeacher.classes ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes) : [];
    const clsUpper = String(className || '').trim().toUpperCase();
    const clsOk = assignedClasses.length === 0 || assignedClasses.some(tc => clsUpper === tc || clsUpper.startsWith(tc));

    return subOk && clsOk;
  }

  function playRealtimeNotifSound(type) {
    if (!realtimeSoundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const beep = (freq, startOffset, duration, waveType, gainVal) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, now + startOffset);
        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(gainVal, now + startOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
      };

      if (type === 'cheat') {
        beep(880, 0, 0.14, 'triangle', 0.12);
        beep(660, 0.16, 0.2, 'triangle', 0.12);
      } else {
        beep(587.33, 0, 0.12, 'sine', 0.08);
        beep(880, 0.13, 0.2, 'sine', 0.08);
      }
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 600);
    } catch (e) {}
  }

  function updateRealtimeBadgeAndSoundUi() {
    const badge = document.getElementById('realtimeNotifBadge');
    const soundBtn = document.getElementById('btnToggleNotifSound');
    if (badge) {
      if (realtimeUnreadCount > 0) {
        badge.innerText = realtimeUnreadCount > 99 ? '99+' : String(realtimeUnreadCount);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
    if (soundBtn) {
      soundBtn.innerText = realtimeSoundEnabled ? '🔊 Suara: ON' : '🔇 Suara: OFF';
    }
  }

  function formatNotifClock(isoStr) {
    try {
      const d = isoStr ? new Date(isoStr) : new Date();
      if (isNaN(d.getTime())) return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return '--:--';
    }
  }

  function renderRealtimeNotifList() {
    const listEl = document.getElementById('realtimeNotifList');
    if (!listEl) return;

    const filtered = realtimeNotifs.filter(n => realtimeFilterMode === 'ALL' || n.type === realtimeFilterMode);
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-400 dark:text-slate-500">
          ${realtimeFilterMode === 'ALL'
            ? 'Belum ada aktivitas pelanggaran atau penyelesaian ujian baru pada sesi ini.'
            : (realtimeFilterMode === 'cheat'
              ? 'Belum ada notifikasi pelanggaran siswa pada sesi ini.'
              : 'Belum ada notifikasi penyelesaian ujian baru pada sesi ini.')}
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map(item => {
      const isCheat = item.type === 'cheat';
      const iconBg = isCheat
        ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
        : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300';
      const badgeCls = isCheat
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
      const targetTab = isCheat ? 'tabMonitoring' : 'tabResults';
      const actionLabel = isCheat ? 'Pantau Siswa →' : 'Lihat Nilai →';

      return `
        <div class="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-start gap-2.5">
          <div class="w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center shrink-0 text-sm font-bold mt-0.5">
            ${isCheat ? '⚠️' : '✅'}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold ${badgeCls}">
                ${isCheat ? 'Pelanggaran Anti-Tab' : 'Ujian Selesai'}
              </span>
              <span class="text-[10px] text-slate-400 font-semibold">${escapeHtmlSafe(item.timeLabel)}</span>
            </div>
            <p class="text-xs font-extrabold text-slate-900 dark:text-white truncate mt-1">
              ${escapeHtmlSafe(item.studentName)} <span class="font-semibold text-slate-500 dark:text-slate-400">(${escapeHtmlSafe(item.studentClass)})</span>
            </p>
            <p class="text-[11px] font-semibold text-blue-700 dark:text-sky-400 truncate">${escapeHtmlSafe(item.subject)}</p>
            <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">${escapeHtmlSafe(item.detail)}</p>
            <div class="mt-1.5 flex items-center justify-between gap-2">
              <span class="text-[10px] text-slate-400 font-mono">NISN: ${escapeHtmlSafe(item.nisn)}</span>
              <button type="button" data-notif-jump="${targetTab}" class="notif-jump-btn text-[10px] font-extrabold text-blue-600 dark:text-sky-400 hover:underline cursor-pointer">
                ${actionLabel}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.notif-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-notif-jump');
        const dropdown = document.getElementById('realtimeNotifDropdown');
        if (dropdown) dropdown.classList.add('hidden');
        if (target) switchAdminTab(target);
      });
    });
  }

  function showRealtimeToast(item) {
    const stack = document.getElementById('cbtRealtimeToastStack');
    if (!stack || !viewAdmin || viewAdmin.classList.contains('hidden')) return;

    while (stack.children.length >= 4) {
      stack.removeChild(stack.firstElementChild);
    }

    const isCheat = item.type === 'cheat';
    const targetTab = isCheat ? 'tabMonitoring' : 'tabResults';
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto rounded-2xl border shadow-2xl p-3.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-all duration-300 flex items-start gap-3 ${
      isCheat
        ? 'border-rose-300 dark:border-rose-700/70 ring-1 ring-rose-500/20'
        : 'border-emerald-300 dark:border-emerald-700/70 ring-1 ring-emerald-500/20'
    }`;

    toast.innerHTML = `
      <div class="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-base ${
        isCheat
          ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300'
          : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300'
      }">${isCheat ? '🚨' : '✅'}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-black uppercase tracking-wide ${isCheat ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">
            ${isCheat ? 'Peringatan Kecurangan!' : 'Siswa Selesai Ujian'}
          </span>
          <button type="button" class="toast-close-btn text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-bold px-1 cursor-pointer">✕</button>
        </div>
        <p class="text-xs font-extrabold text-slate-900 dark:text-white truncate mt-0.5">
          ${escapeHtmlSafe(item.studentName)} (${escapeHtmlSafe(item.studentClass)})
        </p>
        <p class="text-[11px] font-semibold text-blue-700 dark:text-sky-400 truncate">${escapeHtmlSafe(item.subject)}</p>
        <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">${escapeHtmlSafe(item.detail)}</p>
        <div class="mt-2 flex items-center justify-between">
          <span class="text-[10px] text-slate-400">${escapeHtmlSafe(item.timeLabel)}</span>
          <button type="button" class="toast-action-btn px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-white ${
            isCheat ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
          } transition cursor-pointer">
            ${isCheat ? 'Pantau Live →' : 'Buka Rekap →'}
          </button>
        </div>
      </div>
    `;

    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 250);
    };

    const closeBtn = toast.querySelector('.toast-close-btn');
    const actionBtn = toast.querySelector('.toast-action-btn');
    if (closeBtn) closeBtn.addEventListener('click', dismiss);
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        dismiss();
        switchAdminTab(targetTab);
      });
    }

    stack.appendChild(toast);
    setTimeout(dismiss, isCheat ? 9000 : 6000);
  }

  function mergeSessionIntoMonitoringCache(sess) {
    if (!sess || !sess.nisn || !window.supabaseSync) return;
    const key = window.supabaseSync.buildSessionKey(sess.nisn, sess.subject);
    const idx = cachedMonitoringSessions.findIndex(s => window.supabaseSync.buildSessionKey(s.nisn, s.subject) === key);
    const normalized = { ...sess, sessionKey: key };
    if (idx >= 0) cachedMonitoringSessions[idx] = normalized;
    else cachedMonitoringSessions.unshift(normalized);
  }

  function refreshActiveAdminViewsOnAlert() {
    if (!viewAdmin || viewAdmin.classList.contains('hidden')) return;
    const dashPane = document.getElementById('tabDashboard');
    const monPane = document.getElementById('tabMonitoring');
    const resPane = document.getElementById('tabResults');
    if (dashPane && !dashPane.classList.contains('hidden')) {
      renderAdminOverviewDashboard();
    }
    if (monPane && !monPane.classList.contains('hidden')) {
      renderMonitoringDashboard(false);
    }
    if (resPane && !resPane.classList.contains('hidden')) {
      renderAdminAnalyticsAndResults({ animateRows: false });
    }
  }

  function triggerThrottledCloudResultsRefresh() {
    const now = Date.now();
    if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) return;
    if (now - realtimeLastCloudResultPullAt < 3000) return;
    realtimeLastCloudResultPullAt = now;
    window.supabaseSync.fetchCloudResults().then(res => {
      if (res && res.success) {
        refreshActiveAdminViewsOnAlert();
      }
    }).catch(() => {});
  }

  function pushRealtimeAlert(eventKey, alertObj) {
    if (!eventKey || realtimeEmittedEventKeys.has(eventKey)) return;
    realtimeEmittedEventKeys.add(eventKey);
    if (realtimeEmittedEventKeys.size > 500) {
      const firstKey = realtimeEmittedEventKeys.values().next().value;
      realtimeEmittedEventKeys.delete(firstKey);
    }

    if (!isRecordInCurrentAdminScope(alertObj.subject, alertObj.studentClass)) return;

    const item = {
      id: eventKey,
      type: alertObj.type,
      nisn: String(alertObj.nisn || '-'),
      studentName: String(alertObj.studentName || 'Siswa'),
      studentClass: String(alertObj.studentClass || '-'),
      subject: String(alertObj.subject || '-'),
      detail: String(alertObj.detail || ''),
      timeLabel: formatNotifClock(alertObj.timestamp)
    };

    realtimeNotifs.unshift(item);
    if (realtimeNotifs.length > 60) realtimeNotifs = realtimeNotifs.slice(0, 60);

    const dropdown = document.getElementById('realtimeNotifDropdown');
    if (!dropdown || dropdown.classList.contains('hidden')) {
      realtimeUnreadCount += 1;
    }

    updateRealtimeBadgeAndSoundUi();
    renderRealtimeNotifList();
    playRealtimeNotifSound(item.type);
    showRealtimeToast(item);
    refreshActiveAdminViewsOnAlert();
  }

  function processSessionDelta(sess, emitAlerts) {
    if (!sess || !sess.nisn) return;
    const nisn = String(sess.nisn).trim();
    const subject = String(sess.subject || 'Umum').trim();
    const studentName = String(sess.name || sess.student_name || 'Siswa').trim();
    const studentClass = String(sess.class || sess.class_name || sess.student_class || '-').trim();
    const key = window.supabaseSync
      ? window.supabaseSync.buildSessionKey(nisn, subject)
      : `${nisn.toUpperCase()}__${subject.toLowerCase()}`;

    const cheatCount = Number(sess.cheatCount || 0);
    const status = String(sess.status || '').trim();
    const attemptNumber = Number(sess.attemptNumber || 1);
    const completedAt = String(sess.completedAt || '').trim();

    mergeSessionIntoMonitoringCache(sess);

    const prev = realtimeSessionSnapshot.get(key);
    const cfg = window.cbtAdmin && typeof window.cbtAdmin.getConfig === 'function' ? window.cbtAdmin.getConfig() : { maxCheatViolations: 3 };
    const maxViolations = Number(cfg.maxCheatViolations || 3);

    if (emitAlerts && realtimeBaselineReady) {
      if (cheatCount > 0 && (!prev || cheatCount > prev.cheatCount)) {
        const logs = Array.isArray(sess.cheatLogs) ? sess.cheatLogs : [];
        const latestLogReason = logs.length > 0 ? logs[logs.length - 1]?.reason : '';
        const reasonText = String(sess.lastViolationReason || latestLogReason || 'Terdeteksi berpindah tab / keluar layar penuh').trim();
        const isAutoSubmit = cheatCount >= maxViolations || status === 'completed';
        const detail = `${reasonText} • Pelanggaran ke-${cheatCount}/${maxViolations}${isAutoSubmit ? ' (Auto-Submit)' : ''}`;
        pushRealtimeAlert(`cheat:${key}:${attemptNumber}:${cheatCount}`, {
          type: 'cheat',
          nisn,
          studentName,
          studentClass,
          subject,
          detail,
          timestamp: sess.lastViolationAt || sess.updatedAt
        });
      }

      const becameCompleted = status === 'completed' && (!prev || prev.status !== 'completed' || (completedAt && completedAt !== prev.completedAt));
      if (becameCompleted) {
        const lastDoneMs = realtimeRecentDoneAt.get(key) || 0;
        if (Date.now() - lastDoneMs > 12000) {
          realtimeRecentDoneAt.set(key, Date.now());
          const scoreTxt = sess.finalScore !== undefined && sess.finalScore !== null ? `Nilai Akhir: ${sess.finalScore}` : 'Nilai telah direkap';
          const reasonLabel = sess.finishReason === 'cheat_limit'
            ? 'Selesai otomatis (batas pelanggaran)'
            : (sess.finishReason === 'timeout' ? 'Waktu ujian habis' : 'Diselesaikan siswa');
          pushRealtimeAlert(`done:${key}:${attemptNumber}:${completedAt}`, {
            type: 'completed',
            nisn,
            studentName,
            studentClass,
            subject,
            detail: `${scoreTxt} • ${reasonLabel}`,
            timestamp: completedAt || sess.updatedAt
          });
        }
        triggerThrottledCloudResultsRefresh();
      }
    }

    realtimeSessionSnapshot.set(key, {
      cheatCount,
      status,
      attemptNumber,
      completedAt
    });
  }

  function processResultInsertDelta(resObj) {
    if (!resObj || !realtimeBaselineReady) return;
    const nisn = String(resObj.student?.nisn || resObj.student_nisn || '').trim();
    if (!nisn || nisn === '__CBT_STATE__') return;

    const studentName = String(resObj.student?.name || resObj.student_name || 'Siswa').trim();
    const studentClass = String(resObj.student?.class || resObj.student_class || '-').trim();
    const subject = String(resObj.subject || 'Umum').trim();
    const key = window.supabaseSync
      ? window.supabaseSync.buildSessionKey(nisn, subject)
      : `${nisn.toUpperCase()}__${subject.toLowerCase()}`;

    const lastDoneMs = realtimeRecentDoneAt.get(key) || 0;
    if (Date.now() - lastDoneMs <= 12000) {
      triggerThrottledCloudResultsRefresh();
      return;
    }

    realtimeRecentDoneAt.set(key, Date.now());
    const completedAt = String(resObj.completedAt || new Date().toISOString());
    const scoreTxt = resObj.finalScore !== undefined && resObj.finalScore !== null ? `Nilai Akhir: ${resObj.finalScore}` : 'Nilai telah masuk';
    const cheatInfo = Number(resObj.cheatCount || 0) > 0 ? ` • ${resObj.cheatCount}x pelanggaran` : '';
    const reasonLabel = resObj.finishReason === 'cheat_limit'
      ? 'Auto-submit pelanggaran'
      : (resObj.finishReason === 'timeout' ? 'Waktu habis' : 'Diselesaikan siswa');

    pushRealtimeAlert(`result:${key}:${completedAt}`, {
      type: 'completed',
      nisn,
      studentName,
      studentClass,
      subject,
      detail: `${scoreTxt} • ${reasonLabel}${cheatInfo}`,
      timestamp: completedAt
    });
    triggerThrottledCloudResultsRefresh();
  }

  async function pollRealtimeStudentEvents(isBaseline = false) {
    if (!window.supabaseSync || !viewAdmin || viewAdmin.classList.contains('hidden')) return;
    try {
      const res = await window.supabaseSync.fetchStudentSessions();
      const sessions = res && Array.isArray(res.data) ? res.data : [];
      sessions.forEach(sess => processSessionDelta(sess, !isBaseline && realtimeBaselineReady));
      if (isBaseline) {
        realtimeBaselineReady = true;
      }
    } catch (e) {
      if (isBaseline) realtimeBaselineReady = true;
    }
  }

  function startAdminRealtimeNotifications() {
    if (realtimeNotifActive) return;
    if (!viewAdmin || viewAdmin.classList.contains('hidden')) return;

    realtimeNotifActive = true;
    realtimeBaselineReady = false;
    realtimeQuestionPollTick = 0;
    updateRealtimeNotifVisibility(true);

    pollRealtimeStudentEvents(true);

    if (window.supabaseSync && window.supabaseSync.isCloudConfigured() && typeof window.supabaseSync.subscribeToRealtimeNotifications === 'function') {
      window.supabaseSync.subscribeToRealtimeNotifications(
        (sess) => processSessionDelta(sess, true),
        (resObj) => processResultInsertDelta(resObj),
        () => scheduleRealtimeQuestionRefresh()
      );
    }

    realtimePollTimer = setInterval(() => {
      if (!viewAdmin || viewAdmin.classList.contains('hidden')) {
        stopAdminRealtimeNotifications();
        return;
      }
      pollRealtimeStudentEvents(false);

      // Cadangan polling bank soal otomatis (setiap 12 detik di tab Bank Soal, 30 detik di tab lain) jika WebSocket Realtime belum aktif
      realtimeQuestionPollTick += 1;
      const tabQ = document.getElementById('tabQuestions');
      const isQuestionsTabOpen = Boolean(tabQ && !tabQ.classList.contains('hidden'));
      if ((isQuestionsTabOpen && realtimeQuestionPollTick % 2 === 0) || realtimeQuestionPollTick % 5 === 0) {
        syncQuestionsFromCloud(true);
      }
    }, 6000);
  }

  function stopAdminRealtimeNotifications() {
    realtimeNotifActive = false;
    if (realtimePollTimer) {
      clearInterval(realtimePollTimer);
      realtimePollTimer = null;
    }
    if (window.supabaseSync && typeof window.supabaseSync.unsubscribeRealtimeNotifications === 'function') {
      window.supabaseSync.unsubscribeRealtimeNotifications();
    }
  }

  function resetAdminRealtimeStateOnLogout() {
    stopAdminRealtimeNotifications();
    realtimeBaselineReady = false;
    realtimeSessionSnapshot.clear();
    realtimeEmittedEventKeys.clear();
    realtimeRecentDoneAt.clear();
    realtimeNotifs = [];
    realtimeUnreadCount = 0;
    const stack = document.getElementById('cbtRealtimeToastStack');
    if (stack) stack.innerHTML = '';
    updateRealtimeNotifVisibility(false);
    renderRealtimeNotifList();
  }

  function setupRealtimeNotificationControls() {
    if (realtimeControlsInitialized) return;
    realtimeControlsInitialized = true;

    const container = document.getElementById('realtimeNotifContainer');
    const bellBtn = document.getElementById('btnRealtimeNotifBell');
    const dropdown = document.getElementById('realtimeNotifDropdown');
    const soundBtn = document.getElementById('btnToggleNotifSound');
    const clearBtn = document.getElementById('btnClearRealtimeNotifs');

    if (bellBtn && dropdown) {
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = dropdown.classList.contains('hidden');
        dropdown.classList.toggle('hidden');
        if (willOpen) {
          realtimeUnreadCount = 0;
          updateRealtimeBadgeAndSoundUi();
          renderRealtimeNotifList();
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.classList.contains('hidden') && container && !container.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        realtimeSoundEnabled = !realtimeSoundEnabled;
        try { localStorage.setItem('cbt_notif_sound', realtimeSoundEnabled ? 'on' : 'off'); } catch (e) {}
        updateRealtimeBadgeAndSoundUi();
        if (realtimeSoundEnabled) playRealtimeNotifSound('completed');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        realtimeNotifs = [];
        realtimeUnreadCount = 0;
        updateRealtimeBadgeAndSoundUi();
        renderRealtimeNotifList();
      });
    }

    document.querySelectorAll('.notif-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        realtimeFilterMode = btn.getAttribute('data-notif-filter') || 'ALL';
        document.querySelectorAll('.notif-filter-btn').forEach(b => {
          const active = (b.getAttribute('data-notif-filter') || 'ALL') === realtimeFilterMode;
          b.className = active
            ? 'notif-filter-btn px-2.5 py-1 rounded-lg bg-blue-600 text-white cursor-pointer transition'
            : 'notif-filter-btn px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer transition';
        });
        renderRealtimeNotifList();
      });
    });

    window.addEventListener('storage', (e) => {
      if (!realtimeNotifActive) return;
      if (e.key === 'cbt_local_student_sessions' && e.newValue) {
        try {
          const list = JSON.parse(e.newValue);
          if (Array.isArray(list)) list.forEach(sess => processSessionDelta(sess, true));
        } catch (err) {}
      }
    });

    updateRealtimeBadgeAndSoundUi();
  }

  init();
});
