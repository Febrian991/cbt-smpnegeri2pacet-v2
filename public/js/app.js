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
        syncFromCloud(false, { publicOnly: true, includeQuestions: false });
        return;
      }
    } catch (e) {}

    showView('login');
    syncFromCloud(false, { publicOnly: true, includeQuestions: false });

    if (window.examEngine && typeof window.examEngine.flushPendingSubmissions === 'function') {
      setTimeout(() => { window.examEngine.flushPendingSubmissions(); }, 1200);
    }

    // Shortcut URL ?admin / #admin / #guru untuk Proktor & Guru
    const hashLower = (window.location.hash || '').toLowerCase();
    const searchLower = (window.location.search || '').toLowerCase();
    if (hashLower.includes('admin') || hashLower.includes('guru') || searchLower.includes('admin') || searchLower.includes('guru')) {
      switchLoginPortalTab('admin');
      const inlineUserEl = document.getElementById('inlineAdminUsernameInput');
      if (inlineUserEl) inlineUserEl.focus();
    }
  }

  window.addEventListener('online', () => {
    if (window.examEngine && typeof window.examEngine.flushPendingSubmissions === 'function') {
      window.examEngine.flushPendingSubmissions();
    }
  });

  function applyCloudState(stateMap) {
    if (!stateMap || typeof stateMap !== 'object') return false;
    let changed = false;

    const isStaff = Boolean(window.cbtAdmin && window.cbtAdmin.isAuthenticated && window.cbtAdmin.getCurrentTeacher());
    const isSuperAdmin = Boolean(isStaff && window.cbtAdmin.isSuperAdminUser());
    const isPengawas = Boolean(isStaff && !isSuperAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser());

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
      const schedPayload = isStaff
        ? stateMap.cbt_exam_schedules
        : stateMap.cbt_exam_schedules.map(s => {
            if (!s || typeof s !== 'object') return s;
            const { token, ...rest } = s;
            return rest;
          });
      window.cbtAdmin.saveSchedules(schedPayload, true);
      changed = true;
    }
    const localQCount = (window.examEngine && Array.isArray(window.examEngine.questions)) ? window.examEngine.questions.length : 0;
    if (!isPengawas && Array.isArray(stateMap.cbt_questions) && (stateMap.cbt_questions.length > 0 || (stateMap.cbt_questions_migrated === true && localQCount === 0)) && window.examEngine) {
      if (typeof window.examEngine.applyRemoteQuestions === 'function') {
        window.examEngine.applyRemoteQuestions(stateMap.cbt_questions);
      } else {
        window.examEngine.saveQuestions(stateMap.cbt_questions, true);
      }
      changed = true;
    }
    if (stateMap.cbt_config && typeof stateMap.cbt_config === 'object' && window.examEngine) {
      let cfgPayload = stateMap.cbt_config;
      if (!isStaff) {
        const { adminPin, examToken, ...restCfg } = stateMap.cbt_config;
        cfgPayload = { ...restCfg, examToken: '' };
      }
      window.examEngine.saveConfig(cfgPayload, true);
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
    const includeQuestions = options && options.includeQuestions !== undefined
      ? Boolean(options.includeQuestions)
      : !publicOnly;
    const myPromise = (async () => {
      const res = await window.supabaseSync.pullAllSchoolState({ publicOnly, includeQuestions });
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
    return JSON.stringify(list.map(q => [
      q && q.id,
      q && q.updatedAt || '',
      q && q.subject || '',
      q && q.classLevel || '',
      q && q.type || '',
      q && q.isTrial ? 1 : 0,
      q && q.createdBy || '',
      q && q.question || ''
    ]));
  }

  async function syncQuestionsFromCloud(reRenderIfOpen = true, forceRender = false, options = {}) {
    if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured() || !window.examEngine) return false;
    if (window.cbtAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser()) {
      return false;
    }
    if (questionsCloudSyncPromise) return questionsCloudSyncPromise;

    const targetSubject = options && options.subject ? String(options.subject).trim() : '';

    questionsCloudSyncPromise = (async () => {
      try {
        await window.supabaseSync.flushPendingQuestionOps();

        const curStaff = (window.cbtAdmin && window.cbtAdmin.isAuthenticated) ? window.cbtAdmin.getCurrentTeacher() : null;
        const useSubjectScoped = Boolean(
          targetSubject &&
          !curStaff &&
          typeof window.supabaseSync.fetchQuestionRowsForSubject === 'function'
        );
        const scopeKey = curStaff && (curStaff.id || curStaff.nip)
          ? `staff:${curStaff.id || curStaff.nip}`
          : (useSubjectScoped ? `public:${targetSubject.toLowerCase()}` : 'public:all');

        const localList = Array.isArray(window.examEngine.questions) ? window.examEngine.questions : [];
        const hasLocalQuestions = useSubjectScoped
          ? localList.some(q => q && window.examEngine.matchesSubject(q.subject, targetSubject))
          : localList.length > 0;
        let latestStamp = null;

        if (!forceRender && hasLocalQuestions && typeof window.supabaseSync.getQuestionsRemoteStamp === 'function') {
          latestStamp = await window.supabaseSync.getQuestionsRemoteStamp(scopeKey);
          if (latestStamp && latestStamp === window.supabaseSync._lastQuestionsRemoteStamp) {
            return false;
          }
        }

        const qRes = useSubjectScoped
          ? await window.supabaseSync.fetchQuestionRowsForSubject(targetSubject, {
              subjectMatcher: (a, b) => window.examEngine.matchesSubject(a, b),
              stripKeys: true
            })
          : await window.supabaseSync.fetchAllQuestionRows();

        if (qRes && qRes.success && Array.isArray(qRes.rows)) {
          // PERLINDUNGAN ANTI-HAPUS: Jika Cloud cbt_questions kosong (0 baris) sementara perangkat ini punya soal (> 0),
          // JANGAN timpa/hapus soal lokal dengan array kosong []!
          if (qRes.rows.length === 0 && !qRes.partialSubject && localList.length > 0) {
            const isLocalAuth = typeof window.supabaseSync.isLocalQuestionsAuthoritative === 'function' && window.supabaseSync.isLocalQuestionsAuthoritative();
            const hasPendingUp = typeof window.supabaseSync.hasPendingQuestionUpserts === 'function' && window.supabaseSync.hasPendingQuestionUpserts();
            if (curStaff && (isLocalAuth || hasPendingUp)) {
              await window.supabaseSync.upsertQuestionRows(localList, { skipMigrationCheck: true, skipPendingMark: true });
            }
            return false;
          }

          const canApply = qRes.rows.length > 0 || (
            localList.length === 0 &&
            typeof window.supabaseSync.isQuestionsMigrationCompleted === 'function' &&
            await window.supabaseSync.isQuestionsMigrationCompleted()
          );

          if (canApply) {
            const prevSig = getQuestionsListSignature(window.examEngine.questions);
            if (qRes.partialSubject && typeof window.examEngine.mergeSubjectQuestions === 'function') {
              window.examEngine.mergeSubjectQuestions(qRes.partialSubject, qRes.rows);
            } else if (typeof window.examEngine.applyRemoteQuestions === 'function') {
              window.examEngine.applyRemoteQuestions(qRes.rows);
            } else {
              window.examEngine.saveQuestions(qRes.rows, true);
            }
            if (typeof window.supabaseSync.getQuestionsRemoteStamp === 'function') {
              const updatedStamp = latestStamp || await window.supabaseSync.getQuestionsRemoteStamp(scopeKey);
              if (updatedStamp) window.supabaseSync._lastQuestionsRemoteStamp = updatedStamp;
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
      syncQuestionsFromCloud(true, true);
    }, 650);
  }

  let lastVisibilityCloudSyncAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - lastVisibilityCloudSyncAt < 30000) return;
    lastVisibilityCloudSyncAt = now;

    if (viewLogin && !viewLogin.classList.contains('hidden')) {
      syncFromCloud(true, { publicOnly: true, includeQuestions: false });
    } else if (viewAdmin && !viewAdmin.classList.contains('hidden')) {
      const isPengawas = Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser());
      if (isPengawas) {
        syncFromCloud(true, { publicOnly: true, includeQuestions: false });
      } else {
        syncQuestionsFromCloud(true);
      }
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

    const targetDay = sched ? sched.day : cfg.scheduleDay;
    const targetDate = sched ? (sched.dateFormatted || (window.cbtAdmin ? window.cbtAdmin.formatIndonesianDate(sched.dateIso) : '')) : cfg.scheduleDate;
    const targetTime = sched ? (sched.timeRange || '') : cfg.scheduleTime;
    const targetCategory = sched ? (sched.questionCategory || 'ALL') : (cfg.questionCategory || 'ALL');
    const trialSuffix = targetCategory === 'trial' ? ' • Mode Simulasi' : '';

    if (scheduleBadgeEl && scheduleTextEl) {
      const activeList = window.cbtAdmin ? window.cbtAdmin.getActiveSchedules() : [];
      if (activeList.length > 1 && sched) {
        const datePart = [targetDay, targetDate].filter(Boolean).join(', ');
        const timePart = targetTime ? ` • ${targetTime}` : '';
        scheduleTextEl.innerText = `${activeList.length} Jadwal Aktif Serentak${datePart ? ` (${datePart}${timePart})` : ''}${trialSuffix}`;
        scheduleBadgeEl.classList.remove('hidden');
      } else if (targetDay || targetDate) {
        const datePart = [targetDay, targetDate].filter(Boolean).join(', ');
        const timePart = targetTime ? ` • Pukul ${targetTime}` : '';
        scheduleTextEl.innerText = `Jadwal Aktif: ${datePart}${timePart}${trialSuffix}`;
        scheduleBadgeEl.classList.remove('hidden');
      } else if (targetCategory === 'trial') {
        scheduleTextEl.innerText = 'Mode Simulasi Aktif';
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
          const catSuffix = s.questionCategory === 'trial' ? ' — Simulasi' : '';
          opt.innerText = `${s.subject} (${s.classLevel || 'Semua Kelas'})${catSuffix}`;
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
          if (studentFoundClass) {
            studentFoundClass.innerText = student.examRoom
              ? `Kelas ${student.class} • ${student.examRoom}`
              : `Kelas ${student.class}`;
          }
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
        }, 450);
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
    const confirmExamRoomRow = document.getElementById('confirmExamRoomRow');
    const confirmExamRoomEl = document.getElementById('confirmExamRoom');
    if (confirmExamRoomRow && confirmExamRoomEl) {
      if (student.examRoom && String(student.examRoom).trim()) {
        confirmExamRoomEl.innerText = String(student.examRoom).trim();
        confirmExamRoomRow.classList.remove('hidden');
      } else {
        confirmExamRoomEl.innerText = '-';
        confirmExamRoomRow.classList.add('hidden');
      }
    }
    const confirmSubEl = document.getElementById('confirmSubject');
    if (confirmSubEl) {
      const catTag = cfg.questionCategory === 'trial'
        ? ' [Simulasi]'
        : (cfg.questionCategory === 'exam' ? ' [Ujian Asli]' : '');
      confirmSubEl.innerText = `${cfg.subject}${classPart}${catTag}`;
    }
    document.getElementById('confirmDuration').innerText = `${cfg.durationMinutes} Menit`;
    const confirmQs = window.examEngine.getQuestionsForExam(cfg.subject, student.class || cfg.targetClass, cfg.questionCategory || 'ALL');
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
  let isStudentLoginSubmitting = false;
  if (studentLoginForm) {
    const loginSubmitBtn = studentLoginForm.querySelector('button[type="submit"]');
    const loginSubmitBtnDefaultHtml = loginSubmitBtn ? loginSubmitBtn.innerHTML : '';
    const setLoginSubmittingUi = (busy, labelText = 'Memverifikasi...') => {
      isStudentLoginSubmitting = busy;
      if (!loginSubmitBtn) return;
      loginSubmitBtn.disabled = busy;
      loginSubmitBtn.classList.toggle('opacity-75', busy);
      loginSubmitBtn.classList.toggle('cursor-not-allowed', busy);
      if (busy) {
        loginSubmitBtn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg><span>${labelText}</span>`;
      } else {
        loginSubmitBtn.innerHTML = loginSubmitBtnDefaultHtml;
      }
    };

    studentLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isStudentLoginSubmitting) return;
      showLoginRejection('');
      const nisn = document.getElementById('studentNisn').value.trim();
      const password = document.getElementById('studentPassword').value.trim();
      const token = document.getElementById('studentToken').value.trim().toUpperCase();

      if (!nisn || !password) {
        showLoginRejection("Harap lengkapi NISN dan kata sandi!");
        return;
      }

      setLoginSubmittingUi(true, 'Memverifikasi...');
      try {
        const isCloudOnline = Boolean(window.supabaseSync && window.supabaseSync.isCloudConfigured());
        if (isCloudOnline && cloudSyncPromise) {
          await cloudSyncPromise;
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

        let serverPublicConfigOverride = null;
        if (isCloudOnline && typeof window.supabaseSync.verifyExamTokenRpc === 'function') {
          let tokRes = await window.supabaseSync.verifyExamTokenRpc(
            token,
            selectedScheduleId || null,
            authenticatedStudent.class || null
          );
          if (tokRes && !tokRes.rpcUnavailable && !tokRes.valid) {
            const errMsg = String(tokRes.message || '');
            // Guard jika RPC Postgres masih versi lama (\bKELAS\b) padahal token SUDAH VALID & kelas siswa sebenarnya cocok
            if (errMsg.includes('⛔ Ujian Ditolak:')) {
              const manualMatch = errMsg.match(/saat ini dikhususkan untuk\s+(.+?)\.$/i);
              const schedMatch = errMsg.match(/Jadwal\s+"([^"]+)"\s+\(([^)]+)\)\s+bukan untuk Kelas/i);
              const rejectedTargetClass = (manualMatch ? manualMatch[1] : (schedMatch ? schedMatch[2] : '')).trim();
              const stuCls = String(authenticatedStudent.class || '').trim();
              if (stuCls && rejectedTargetClass && window.examEngine.matchesClassLevel(rejectedTargetClass, stuCls)) {
                const tokenOnlyCheck = await window.supabaseSync.verifyExamTokenRpc(
                  token,
                  selectedScheduleId || null,
                  null
                );
                if (tokenOnlyCheck && tokenOnlyCheck.valid) {
                  if (tokenOnlyCheck.mode === 'schedule' && tokenOnlyCheck.schedule) {
                    const sCls = tokenOnlyCheck.schedule.classLevel || tokenOnlyCheck.schedule.targetClass || 'Semua Kelas';
                    if (window.examEngine.matchesClassLevel(sCls, stuCls)) {
                      tokRes = tokenOnlyCheck;
                    }
                  } else if (tokenOnlyCheck.mode === 'manual') {
                    let serverTargetCls = rejectedTargetClass;
                    if (typeof window.supabaseSync.getPublicExamConfigRpc === 'function') {
                      try {
                        const pubCfg = await window.supabaseSync.getPublicExamConfigRpc();
                        if (pubCfg && pubCfg.success && pubCfg.config) {
                          serverPublicConfigOverride = pubCfg.config;
                          if (pubCfg.config.targetClass) serverTargetCls = pubCfg.config.targetClass;
                        }
                      } catch (e) {}
                    }
                    if (window.examEngine.matchesClassLevel(serverTargetCls, stuCls)) {
                      tokRes = tokenOnlyCheck;
                    }
                  }
                }
              }
            }
          }
          if (!tokRes || !tokRes.rpcUnavailable) {
            if (!tokRes || !tokRes.valid) {
              showLoginRejection((tokRes && tokRes.message) || 'Token ujian salah! Periksa kembali atau tanyakan kepada Pengawas Ruang!');
              return;
            }
            if (tokRes.mode === 'schedule' && tokRes.schedule) {
              matchedSchedule = tokRes.schedule;
            }
          } else {
            // Fallback sementara di memori jika RPC server v3.57 belum dijalankan di Supabase (tanpa menyimpan token ke localStorage siswa)
            let cloudCfg = null;
            let cloudScheds = null;
            try {
              const client = window.supabaseSync.client;
              if (client && !window.supabaseSync.stateTableMissing) {
                const { data } = await client
                  .from('cbt_school_state')
                  .select('key, value')
                  .in('key', ['cbt_config', 'cbt_exam_schedules']);
                if (Array.isArray(data)) {
                  data.forEach(r => {
                    if (r.key === 'cbt_config') cloudCfg = r.value;
                    if (r.key === 'cbt_exam_schedules') cloudScheds = r.value;
                  });
                }
              }
            } catch (e) {}

            const serverActiveScheds = Array.isArray(cloudScheds)
              ? cloudScheds.filter(s => s && (s.isActive || s.active))
              : activeSchedules;
            const serverCfg = cloudCfg || window.examEngine.config;

            if (serverActiveScheds.length > 0) {
              const selectedSchObj = serverActiveScheds.find(s => s.id === selectedScheduleId) || serverActiveScheds[0];
              if (selectedSchObj && String(selectedSchObj.token || '').trim().toUpperCase() === token) {
                matchedSchedule = selectedSchObj;
              } else {
                const tokenMatches = serverActiveScheds.filter(s => String(s.token || '').trim().toUpperCase() === token);
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
                showLoginRejection(`⛔ Ujian Ditolak: Jadwal "${matchedSchedule.subject}" (${matchedSchedule.classLevel}) bukan untuk Kelas ${authenticatedStudent.class}. Pilih mata pelajaran lain yang sesuai kelas Anda.`);
                return;
              }
              const { token: _strippedTok, ...cleanMatched } = matchedSchedule;
              matchedSchedule = cleanMatched;
            } else {
              const validToken = String(serverCfg?.examToken || 'CBT80M').trim().toUpperCase();
              if (token !== validToken) {
                showLoginRejection('Token ujian salah! Periksa kembali atau tanyakan kepada Pengawas Ruang / Proktor.');
                return;
              }
              if (serverCfg?.targetClass && !window.examEngine.matchesClassLevel(serverCfg.targetClass, authenticatedStudent.class)) {
                showLoginRejection(`⛔ Ujian Ditolak: Ujian "${serverCfg.subject}" saat ini dikhususkan untuk ${serverCfg.targetClass}.`);
                return;
              }
            }
          }
        } else {
          // Mode Offline Lokal (tanpa Supabase Cloud)
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
            const validToken = String(window.examEngine.config.examToken || 'CBT80M').toUpperCase();
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
        }

        const targetExamConfig = matchedSchedule ? {
          examTitle: window.examEngine.config.examTitle,
          subject: matchedSchedule.subject,
          targetClass: matchedSchedule.classLevel || 'Semua Kelas',
          scheduleDay: matchedSchedule.day,
          scheduleDate: matchedSchedule.dateFormatted || (window.cbtAdmin ? window.cbtAdmin.formatIndonesianDate(matchedSchedule.dateIso) : ''),
          scheduleTime: matchedSchedule.timeRange || '',
          durationMinutes: matchedSchedule.durationMinutes || 80,
          examToken: '',
          activeScheduleId: matchedSchedule.id,
          maxAttempts: matchedSchedule.maxAttempts || 1,
          questionCategory: matchedSchedule.questionCategory || 'ALL'
        } : {
          ...window.examEngine.config,
          ...(serverPublicConfigOverride && typeof serverPublicConfigOverride === 'object' ? serverPublicConfigOverride : {}),
          examToken: ''
        };

        const canCheckConflict = Boolean(isCloudOnline && typeof window.supabaseSync.checkActiveDeviceSessionConflict === 'function');
        const [devConflict, attemptStats] = await Promise.all([
          canCheckConflict
            ? window.supabaseSync.checkActiveDeviceSessionConflict(
                authenticatedStudent.nisn,
                targetExamConfig.subject,
                window.examEngine.getDeviceId()
              )
            : Promise.resolve({ conflict: false }),
          window.examEngine.getStudentAttemptStats(authenticatedStudent.nisn, targetExamConfig.subject)
        ]);

        if (devConflict && devConflict.conflict) {
          showLoginRejection(`⛔ Login Ditolak: Akun NISN ${authenticatedStudent.nisn} (${authenticatedStudent.name}) sedang aktif mengerjakan ujian "${targetExamConfig.subject}" di perangkat lain. Hubungi Proktor untuk reset sesi jika perangkat sebelumnya bermasalah.`);
          return;
        }

        const maxAttempts = window.examEngine.getMaxAttemptsForSubject(targetExamConfig.subject, matchedSchedule);
        if (attemptStats.count >= maxAttempts) {
          const rejectMsg = `⛔ Ujian Ditolak: Anda (${authenticatedStudent.name}) sudah menyelesaikan ujian mata pelajaran "${targetExamConfig.subject}" sebanyak ${attemptStats.count} kali (batas maksimal: ${maxAttempts} kali). Hubungi Proktor atau Guru Mapel jika memerlukan izin mengulang.`;
          showLoginRejection(rejectMsg);
          return;
        }

        tempStudent = {
          name: authenticatedStudent.name,
          nisn: authenticatedStudent.nisn,
          class: authenticatedStudent.class,
          examRoom: authenticatedStudent.examRoom || '',
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

        if (isCloudOnline) {
          setLoginSubmittingUi(true, 'Menyiapkan Soal...');
          // Tarik khusus mapel ujian aktif saja agar hemat bandwidth 253 siswa (batas tunggu aman 12 detik)
          await Promise.race([
            syncQuestionsFromCloud(false, false, { subject: targetExamConfig.subject }),
            new Promise(resolve => setTimeout(resolve, 12000))
          ]);
        }

        const targetCat = targetExamConfig.questionCategory || 'ALL';
        let examQsCheck = window.examEngine.getQuestionsForExam(
          targetExamConfig.subject,
          authenticatedStudent.class || targetExamConfig.targetClass,
          targetCat
        );

        if ((!examQsCheck.questions || examQsCheck.questions.length === 0) && isCloudOnline) {
          // Retry paksa sekali jika jaringan lambat atau stamp lokal sempat tertinggal
          await Promise.race([
            syncQuestionsFromCloud(false, true, { subject: targetExamConfig.subject }),
            new Promise(resolve => setTimeout(resolve, 10000))
          ]);
          examQsCheck = window.examEngine.getQuestionsForExam(
            targetExamConfig.subject,
            authenticatedStudent.class || targetExamConfig.targetClass,
            targetCat
          );
        }

        if (!examQsCheck.questions || examQsCheck.questions.length === 0) {
          const catLabel = targetCat === 'trial' ? 'Soal Simulasi' : (targetCat === 'exam' ? 'Soal Ujian Asli' : 'Soal Ujian');
          showLoginRejection(`⛔ Ujian Belum Siap: Belum ada butir ${catLabel} untuk mata pelajaran "${targetExamConfig.subject}" (${authenticatedStudent.class || targetExamConfig.targetClass}). Hubungi Proktor / Guru Mapel.`);
          tempStudent = null;
          try { localStorage.removeItem('cbt_confirm_student'); } catch (e) {}
          return;
        }

        if (window.supabaseSync) {
          const qCount = examQsCheck.questions.length;
          window.supabaseSync.upsertStudentSession({
            nisn: authenticatedStudent.nisn,
            name: authenticatedStudent.name,
            class: authenticatedStudent.class,
            examRoom: authenticatedStudent.examRoom || '',
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
      } finally {
        setLoginSubmittingUi(false);
      }
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
      if (btnStartExam.disabled || (window.examEngine && window.examEngine.isExamActive)) return;
      btnStartExam.disabled = true;
      setTimeout(() => { btnStartExam.disabled = false; }, 1500);

      let studentToStart = tempStudent;
      if (!studentToStart) {
        try {
          const saved = localStorage.getItem('cbt_confirm_student');
          if (saved) studentToStart = JSON.parse(saved);
        } catch (e) {}
      }
      if (!studentToStart) {
        showView('login');
        return;
      }

      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        }
      } catch (err) {}

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

    // Render Wacana / Stimulus Berkelompok (jika soal bagian dari kelompok 3-5 soal)
    const qStimulusContainer = document.getElementById('questionStimulusContainer');
    if (qStimulusContainer) {
      if (q.passageText || q.passageTitle || q.passageTable || q.passageChart || q.passageImage) {
        let rangeLabel = '';
        if (q.passageGroupId) {
          const indices = [];
          activeQs.forEach((item, idx) => {
            if (item && item.passageGroupId === q.passageGroupId) indices.push(idx + 1);
          });
          if (indices.length > 1) {
            rangeLabel = indices[0] === indices[indices.length - 1]
              ? `${indices[0]}`
              : `${indices[0]} s.d. ${indices[indices.length - 1]}`;
          }
        }
        const stimHtml = (window.cbtAdmin && typeof window.cbtAdmin.renderPassageStimulusHtml === 'function')
          ? window.cbtAdmin.renderPassageStimulusHtml(q, rangeLabel, false)
          : `<div class="cbt-wacana-card"><div class="cbt-wacana-title">${escapeHtmlSafe(q.passageTitle || 'Wacana / Stimulus Soal')}</div><div class="whitespace-pre-line">${escapeHtmlSafe(q.passageText || '')}</div></div>`;
        qStimulusContainer.innerHTML = stimHtml;
        qStimulusContainer.classList.remove('hidden');
      } else {
        qStimulusContainer.innerHTML = '';
        qStimulusContainer.classList.add('hidden');
      }
    }

    document.getElementById('questionText').innerText = q.question;

    // Render Tabel Pertanyaan (jika ada)
    const qTableContainer = document.getElementById('questionTableContainer');
    if (qTableContainer) {
      if (q.tableData && window.cbtAdmin && typeof window.cbtAdmin.renderQuestionTableHtml === 'function') {
        const tblHtml = window.cbtAdmin.renderQuestionTableHtml(q.tableData, false);
        qTableContainer.innerHTML = tblHtml;
        qTableContainer.classList.toggle('hidden', !tblHtml);
      } else {
        qTableContainer.innerHTML = '';
        qTableContainer.classList.add('hidden');
      }
    }

    // Render Bagan / Diagram Pertanyaan (jika ada)
    const qChartContainer = document.getElementById('questionChartContainer');
    if (qChartContainer) {
      if (q.chartData && window.cbtAdmin && typeof window.cbtAdmin.renderChartSvgHtml === 'function') {
        const chartHtml = window.cbtAdmin.renderChartSvgHtml(q.chartData, { isPrint: false, compact: false });
        qChartContainer.innerHTML = chartHtml;
        qChartContainer.classList.toggle('hidden', !chartHtml);
      } else {
        qChartContainer.innerHTML = '';
        qChartContainer.classList.add('hidden');
      }
    }

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
    const renderOptTable = (key) => {
      const upKey = String(key || '').toUpperCase();
      if (q.optionTables && q.optionTables[upKey] && window.cbtAdmin && typeof window.cbtAdmin.renderQuestionTableHtml === 'function') {
        return window.cbtAdmin.renderQuestionTableHtml(q.optionTables[upKey], false, 'mt-1.5');
      }
      return '';
    };

    if (type === 'single') {
      q.options.forEach(opt => {
        const isSelected = currentAnswerData === opt.key;
        const optTableHtml = renderOptTable(opt.key);
        const optEl = document.createElement('div');
        optEl.className = `option-label cursor-pointer flex items-start p-3 sm:p-4 rounded-2xl border-2 transition-all ${
          isSelected
            ? 'selected border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-100 shadow-xs'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`;
        optEl.innerHTML = `
          <div class="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl font-bold text-xs sm:text-sm mr-3 transition-colors flex-shrink-0 ${
            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
          }">${opt.key}</div>
          <div class="text-xs sm:text-base font-medium flex-1 text-slate-800 dark:text-slate-100 min-w-0">
            ${opt.text ? `<div>${opt.text}</div>` : ''}
            ${optTableHtml}
          </div>
          <span class="hidden md:inline-flex kbd-hint ml-2 flex-shrink-0">${opt.key}</span>
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
        const optTableHtml = renderOptTable(opt.key);
        const optEl = document.createElement('div');
        optEl.className = `option-label cursor-pointer flex items-start p-3 sm:p-4 rounded-2xl border-2 transition-all ${
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
          <div class="text-xs sm:text-base font-medium flex-1 text-slate-800 dark:text-slate-100 min-w-0">
            ${opt.text ? `<div>${opt.text}</div>` : ''}
            ${optTableHtml}
          </div>
          <span class="hidden md:inline-flex kbd-hint ml-2 flex-shrink-0">${opt.key}</span>
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
    btnConfirmFinishFinal.addEventListener('click', async () => {
      if (btnConfirmFinishFinal.disabled) return;
      const origHtml = btnConfirmFinishFinal.innerHTML;
      btnConfirmFinishFinal.disabled = true;
      btnConfirmFinishFinal.innerText = 'Mengumpulkan Jawaban...';
      try {
        modalFinishConfirm.classList.add('hidden');
        await window.examEngine.finishExam('Selesai mandiri oleh peserta');
      } finally {
        btnConfirmFinishFinal.disabled = false;
        btnConfirmFinishFinal.innerHTML = origHtml;
      }
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

  function applyVerificationAndRemedialResultUi(result, isPendingUpload = false, pendingReason = '') {
    const resRemEl = document.getElementById('resRemedialStatus');
    if (resRemEl) {
      let isRem = null;
      if (typeof result?.isRemedial === 'boolean') {
        isRem = result.isRemedial;
      } else if (typeof result?.remedialStatus === 'string' && result.remedialStatus.trim()) {
        const low = result.remedialStatus.trim().toLowerCase();
        if (low === 'remedial' || low === 'tidak remedial') {
          isRem = low === 'remedial';
        }
      } else if (result?.finalScore !== undefined && result?.finalScore !== null && !Number.isNaN(Number(result.finalScore))) {
        isRem = Number(result.finalScore) < 75;
      }

      if (isPendingUpload) {
        resRemEl.innerText = '⏳ Menunggu Kirim ke Server';
        resRemEl.className = 'font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-0.5 rounded-full text-[11px]';
      } else if (isRem === null) {
        resRemEl.innerText = '⏳ Cek di Rekap Guru';
        resRemEl.className = 'font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full text-[11px]';
      } else if (isRem) {
        resRemEl.innerText = '⚠️ Remedial';
        resRemEl.className = 'font-bold bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-[11px]';
      } else {
        resRemEl.innerText = '✅ Tidak Remedial';
        resRemEl.className = 'font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px]';
      }
    }

    const verBadge = document.getElementById('resVerificationBadge');
    const pendingBanner = document.getElementById('resPendingSyncBanner');
    const pendingDesc = document.getElementById('resPendingSyncDesc');
    if (verBadge) {
      if (isPendingUpload) {
        verBadge.innerText = 'Menunggu Sinkron Server';
        verBadge.className = 'text-amber-800 font-bold bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full text-[11px]';
      } else {
        verBadge.innerText = 'Terverifikasi Masuk Server';
        verBadge.className = 'text-emerald-700 font-bold bg-emerald-100 px-2.5 py-0.5 rounded-full text-[11px]';
      }
    }
    if (pendingBanner) {
      pendingBanner.classList.toggle('hidden', !isPendingUpload);
    }
    if (pendingDesc && isPendingUpload && pendingReason) {
      pendingDesc.innerText = `${pendingReason} Jawaban Anda tersimpan aman di perangkat ini — klik tombol di bawah atau tunggu sinyal kembali normal untuk mengirim ulang otomatis.`;
    }
  }

  let activeDisplayedResultId = null;
  window.addEventListener('cbt-exam-finished', (e) => {
    const { result, pendingUpload, pendingReason } = e.detail;
    const isPending = Boolean(pendingUpload || result?.pendingUpload);
    activeDisplayedResultId = result?.id ? String(result.id) : null;
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
    applyVerificationAndRemedialResultUi(result, isPending, pendingReason || '');
    const resAutoNoteEl = document.getElementById('resAutoPrintNote');
    if (resAutoNoteEl && window.cbtAdmin && typeof window.cbtAdmin.getPrintStampText === 'function') {
      resAutoNoteEl.innerText = window.cbtAdmin.getPrintStampText();
    }
  });

  window.addEventListener('cbt-pending-submissions-synced', (e) => {
    const receipts = Array.isArray(e.detail?.receipts) ? e.detail.receipts : [];
    const matched = receipts.find(r => r && activeDisplayedResultId && String(r.id) === activeDisplayedResultId) || receipts[0];
    if (matched) {
      applyVerificationAndRemedialResultUi(matched, false, '');
    }
  });

  const btnRetryPendingSync = document.getElementById('btnRetryPendingSync');
  if (btnRetryPendingSync) {
    btnRetryPendingSync.addEventListener('click', async () => {
      if (btnRetryPendingSync.disabled || !window.examEngine) return;
      const origTxt = btnRetryPendingSync.innerText;
      let keepFeedbackUntilReset = false;
      btnRetryPendingSync.disabled = true;
      btnRetryPendingSync.innerText = 'Mengirim Ulang ke Server...';
      try {
        const res = await window.examEngine.flushPendingSubmissions();
        if (res && res.remaining > 0) {
          keepFeedbackUntilReset = true;
          btnRetryPendingSync.innerText = `Masih Belum Terhubung — Coba Lagi (${res.remaining})`;
          setTimeout(() => {
            btnRetryPendingSync.innerText = origTxt;
          }, 2200);
        }
      } finally {
        btnRetryPendingSync.disabled = false;
        if (!keepFeedbackUntilReset) {
          btnRetryPendingSync.innerText = origTxt;
        }
      }
    });
  }

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
      if (document.hidden) return;
      const tabMonitoringPane = document.getElementById('tabMonitoring');
      if (viewAdmin && !viewAdmin.classList.contains('hidden') && tabMonitoringPane && !tabMonitoringPane.classList.contains('hidden')) {
        renderMonitoringDashboard(true, false);
      } else {
        stopMonitoringAutoRefresh();
      }
    }, 20000);
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
    const isAdmin = Boolean(currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin'));
    const isPengawas = Boolean(currentTeacher && !isAdmin && window.cbtAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser(currentTeacher));

    if (isPengawas) {
      targetTab = 'tabMonitoring';
    } else if (!isAdmin && (targetTab === 'tabSchedules' || targetTab === 'tabStudents' || targetTab === 'tabTeachers' || targetTab === 'tabSettings' || targetTab === 'tabDatabase' || targetTab === 'tabBackup')) {
      targetTab = 'tabDashboard';
    }

    if (window.cbtAdmin && typeof window.cbtAdmin.isTabDisabledForRole === 'function' && window.cbtAdmin.isTabDisabledForRole(targetTab, isAdmin)) {
      if (!options.skipSkeleton) {
        alert("Menu ini sedang dinonaktifkan melalui Pengaturan Hak Akses Tombol Admin.");
      }
      targetTab = isPengawas ? 'tabMonitoring' : 'tabDashboard';
    }

    try { localStorage.setItem('cbt_active_admin_tab', targetTab); } catch (e) {}

    const allTabBtns = document.querySelectorAll('.admin-tab-btn');
    const allTabPanes = document.querySelectorAll('.admin-tab-pane');

    const idleTabClass = 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800/75 dark:hover:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
    const activeTabClass = 'bg-gradient-to-r from-[#124196] to-[#1a56c4] text-white border-transparent shadow-md shadow-blue-900/20';

    allTabBtns.forEach(b => {
      const tabKey = b.getAttribute('data-tab');
      const isHidden = b.classList.contains('hidden');
      const isPermHidden = b.classList.contains('cbt-perm-hidden');
      const isPermDisabled = b.classList.contains('cbt-perm-disabled');
      const isActive = tabKey === targetTab;
      b.className = `admin-tab-btn lg:w-full justify-start text-left px-3.5 py-2.5 lg:py-3 rounded-xl text-xs sm:text-[13px] font-bold border flex items-center gap-2 cursor-pointer transition whitespace-nowrap lg:whitespace-normal lg:leading-snug ${
        isActive ? activeTabClass : idleTabClass
      }${isHidden ? ' hidden' : ''}${isPermHidden ? ' cbt-perm-hidden' : ''}${isPermDisabled ? ' cbt-perm-disabled' : ''}`;
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
      if (targetTab === 'tabDashboard' && !isPengawas) {
        renderAdminOverviewDashboard();
      } else if (targetTab === 'tabResults' && !isPengawas) {
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
      } else if (targetTab === 'tabQuestions' && !isPengawas) {
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
        refreshSupabaseTablesHealthUI();
      }
    } catch (err) {
      console.warn("Gagal render tab content:", err);
    }

    applyRoleButtonPermissions();
  }

  adminTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchAdminTab(targetTab);
    });
  });

  function updateStaffHeaderAndPengawasBanner(currentTeacher) {
    if (!currentTeacher || !window.cbtAdmin) return;
    const isAdmin = currentTeacher.role === 'admin' || currentTeacher.id === 'admin';
    const isPengawas = Boolean(!isAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser(currentTeacher));
    const pengawasScope = isPengawas && typeof window.cbtAdmin.getPengawasScope === 'function'
      ? window.cbtAdmin.getPengawasScope(currentTeacher)
      : { classes: [], subjects: [], mode: 'fixed', activeDay: 'Senin', weeklySchedule: {}, sessionSelectedRoom: '' };

    const roomPickerWrap = document.getElementById('pengawasRoomPickerWrap');
    const roomPickerSelect = document.getElementById('pengawasRoomPickerSelect');
    const roomPickerHint = document.getElementById('pengawasRoomPickerHint');
    const allowDayRoomPick = isPengawas && (
      pengawasScope.mode === 'flexible' ||
      (pengawasScope.mode === 'weekly' && !(pengawasScope.weeklySchedule && pengawasScope.weeklySchedule[pengawasScope.activeDay]))
    );
    if (roomPickerWrap && roomPickerSelect) {
      if (allowDayRoomPick) {
        const sm = window.studentManager;
        const stuRooms = (sm && typeof sm.getAllRooms === 'function') ? sm.getAllRooms() : [];
        const stuClasses = (sm && typeof sm.getAllClasses === 'function') ? sm.getAllClasses() : [];
        let pickerHtml = '<option value="">-- Pilih Ruang / Kelas Ujian --</option>';
        if (stuRooms.length > 0) {
          pickerHtml += '<optgroup label="🏫 Ruang Ujian (Acak Lintas Kelas)">' + stuRooms.map(r => {
            const members = sm.getStudentsByRoom ? sm.getStudentsByRoom(r) : [];
            const gradeSummary = [...new Set(members.map(m => {
              const matchG = String(m.class || '').match(/^(VIII|VII|IX|\d+)/i);
              return matchG ? matchG[1].toUpperCase() : String(m.class || '');
            }).filter(Boolean))].sort().join(',');
            const extra = members.length > 0
              ? ` (${members.length} Siswa${gradeSummary ? ` • Kls ${gradeSummary}` : ''})`
              : '';
            return `<option value="${escapeHtmlSafe(r)}">🏫 ${escapeHtmlSafe(r)}${escapeHtmlSafe(extra)}</option>`;
          }).join('') + '</optgroup>';
        }
        const classChoices = stuClasses.length > 0 ? stuClasses : ['7A', '7B', '8A', '8B', '9A', '9B'];
        pickerHtml += (stuRooms.length > 0 ? '<optgroup label="🎓 Berdasarkan Kelas Asli">' : '') +
          classChoices.map(c => `<option value="${escapeHtmlSafe(c)}">Kelas ${escapeHtmlSafe(c)}</option>`).join('') +
          (stuRooms.length > 0 ? '</optgroup>' : '');
        roomPickerSelect.innerHTML = pickerHtml;

        if (roomPickerHint) {
          roomPickerHint.innerText = pengawasScope.mode === 'weekly'
            ? `Hari ${pengawasScope.activeDay || 'ini'} belum diisi jadwal ruang tetap; silakan pilih ruang yang sedang Anda awasi hari ini.`
            : 'Akun pengawas ini tidak dikunci 1 ruang/kelas, silakan pilih ruang yang sedang Anda awasi hari ini.';
        }
        const currentPicked = pengawasScope.sessionSelectedRoom || '';
        const normPickedKey = typeof window.cbtAdmin.normalizeRoomKey === 'function'
          ? window.cbtAdmin.normalizeRoomKey(currentPicked)
          : currentPicked.toUpperCase();
        const matchedOpt = currentPicked
          ? Array.from(roomPickerSelect.options).find(o => {
              if (!o.value) return false;
              if (o.value.toUpperCase() === currentPicked.toUpperCase()) return true;
              return normPickedKey && typeof window.cbtAdmin.normalizeRoomKey === 'function' && window.cbtAdmin.normalizeRoomKey(o.value) === normPickedKey;
            })
          : null;
        if (matchedOpt) {
          roomPickerSelect.value = matchedOpt.value;
        } else if (currentPicked) {
          const extraOpt = document.createElement('option');
          extraOpt.value = currentPicked;
          extraOpt.innerText = `Ruang / Kelas ${currentPicked}`;
          roomPickerSelect.appendChild(extraOpt);
          roomPickerSelect.value = currentPicked;
        } else {
          roomPickerSelect.value = '';
        }
        roomPickerWrap.classList.remove('hidden');
        roomPickerSelect.onchange = () => {
          const picked = roomPickerSelect.value || '';
          if (typeof window.cbtAdmin.setPengawasSessionRoom === 'function') {
            window.cbtAdmin.setPengawasSessionRoom(picked, currentTeacher);
          }
          updateStaffHeaderAndPengawasBanner(currentTeacher);
          setupMonitoringControls();
          renderMonitoringDashboard(false);
        };
      } else {
        roomPickerWrap.classList.add('hidden');
        roomPickerSelect.onchange = null;
      }
    }

    const pengawasBannerDesc = document.getElementById('monitoringPengawasBannerDesc');
    if (pengawasBannerDesc && isPengawas) {
      const clsList = pengawasScope.classes || [];
      const subjList = pengawasScope.subjects || [];
      if (clsList.length > 0) {
        const dayPrefix = pengawasScope.mode === 'weekly' && pengawasScope.activeDay
          ? `Jadwal Hari ${escapeHtmlSafe(pengawasScope.activeDay)} &bull; `
          : '';
        const roomGradeNote = pengawasScope.isRoomScoped && pengawasScope.roomClassLevels && pengawasScope.roomClassLevels.length > 0
          ? ` <span class="text-[11px] opacity-90">(Campur Kelas: ${escapeHtmlSafe(pengawasScope.roomClassLevels.join(', '))})</span>`
          : '';
        const scopeWord = pengawasScope.isRoomScoped ? 'Ruang' : 'Kelas/Ruang';
        const clsPart = `${dayPrefix}<strong>${scopeWord}: ${escapeHtmlSafe(clsList.join(', '))}</strong>${roomGradeNote}`;
        const subjPart = subjList.length > 0 ? `Mata Pelajaran: <strong>${escapeHtmlSafe(subjList.join(', '))}</strong>` : '';
        const scopeJoined = [clsPart, subjPart].filter(Boolean).join(' &bull; ');
        pengawasBannerDesc.innerHTML = `Ruang lingkup pantauan Anda: ${scopeJoined}. Anda dapat memantau status login, progres soal, pelanggaran tab, dan menekan <strong>🔄 Izinkan Ulang</strong> jika HP siswa bermasalah. Akses Bank Soal, Kunci Jawaban &amp; Rekap Nilai terkunci aman.`;
      } else if (pengawasScope.mode === 'flexible') {
        pengawasBannerDesc.innerHTML = `Akun Pengawas ini bersifat <strong>fleksibel</strong> (tidak dikunci di 1 ruang/kelas). Silakan pilih <strong>Ruang / Kelas</strong> yang sedang Anda awasi hari ini pada pilihan di bawah agar token ujian &amp; daftar siswa ruangan tersebut tampil.`;
      } else {
        pengawasBannerDesc.innerHTML = `Pada jadwal mingguan Anda, hari <strong>${escapeHtmlSafe(pengawasScope.activeDay || 'ini')}</strong> belum memiliki ruang pengawasan. Hubungi Proktor / Admin jika terjadi perubahan jadwal ruang.`;
      }
    }

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
      const parsedClasses = currentTeacher.classes ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes) : [];
      if (isAdmin) {
        subjDisp.innerText = 'Administrator Sistem';
      } else if (isPengawas) {
        const parts = ['Pengawas Ruang Ujian'];
        if (pengawasScope.classes.length > 0) {
          if (pengawasScope.subjects.length > 0) parts.push(pengawasScope.subjects.join(', '));
          parts.push(`${pengawasScope.isRoomScoped ? 'Ruang' : 'Ruang/Kelas'}: ${pengawasScope.classes.join(', ')}`);
        } else if (pengawasScope.mode === 'flexible') {
          parts.push('Pilih Ruang Pengawasan Hari Ini');
        } else {
          parts.push(`Hari ${pengawasScope.activeDay || 'Ini'}: Tidak Ada Jadwal Mengawas`);
        }
        subjDisp.innerText = parts.join(' • ');
      } else {
        subjDisp.innerText = `Guru Mata Pelajaran • ${currentTeacher.subject}${parsedClasses.length > 0 ? ` • Kelas: ${parsedClasses.join(', ')}` : ''}`;
      }
    }
  }

  function renderAdminDashboard() {
    const currentTeacher = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
    const tabDashboardBtn = document.getElementById('adminTabBtnDashboard');
    const tabResultsBtn = document.getElementById('adminTabBtnResults');
    const tabMonitoringBtn = document.getElementById('adminTabBtnMonitoring');
    const tabSchedulesBtn = document.getElementById('adminTabBtnSchedules');
    const tabQuestionsBtn = document.getElementById('adminTabBtnQuestions');
    const tabStudentsBtn = document.getElementById('adminTabBtnStudents');
    const tabTeachersBtn = document.getElementById('adminTabBtnTeachers');
    const tabSettingsBtn = document.getElementById('adminTabBtnSettings');
    const tabDatabaseBtn = document.getElementById('adminTabBtnDatabase');
    const tabBackupBtn = document.getElementById('adminTabBtnBackup');

    const tabDashboardPane = document.getElementById('tabDashboard');
    const tabResultsPane = document.getElementById('tabResults');
    const tabSchedulesPane = document.getElementById('tabSchedules');
    const tabQuestionsPane = document.getElementById('tabQuestions');
    const tabStudentsPane = document.getElementById('tabStudents');
    const tabTeachersPane = document.getElementById('tabTeachers');
    const tabSettingsPane = document.getElementById('tabSettings');
    const tabDatabasePane = document.getElementById('tabDatabase');
    const tabBackupPane = document.getElementById('tabBackup');

    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const isPengawas = Boolean(currentTeacher && !isAdmin && window.cbtAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser(currentTeacher));

    const attemptRuleCard = document.getElementById('monitoringAttemptRuleCard');
    const pengawasBanner = document.getElementById('monitoringPengawasBanner');
    if (attemptRuleCard) {
      if (isPengawas) attemptRuleCard.classList.add('hidden');
      else attemptRuleCard.classList.remove('hidden');
    }
    if (pengawasBanner) {
      if (isPengawas) {
        pengawasBanner.classList.remove('hidden');
        renderPengawasActiveTokens(currentTeacher);
      } else {
        pengawasBanner.classList.add('hidden');
        const tokList = document.getElementById('pengawasActiveTokensList');
        if (tokList) tokList.innerHTML = '';
      }
    }

    if (currentTeacher) {
      updateStaffHeaderAndPengawasBanner(currentTeacher);

      if (tabMonitoringBtn) tabMonitoringBtn.classList.remove('hidden');

      if (isPengawas) {
        if (tabDashboardBtn) tabDashboardBtn.classList.add('hidden');
        if (tabResultsBtn) tabResultsBtn.classList.add('hidden');
        if (tabQuestionsBtn) tabQuestionsBtn.classList.add('hidden');
        if (tabSchedulesBtn) tabSchedulesBtn.classList.add('hidden');
        if (tabStudentsBtn) tabStudentsBtn.classList.add('hidden');
        if (tabTeachersBtn) tabTeachersBtn.classList.add('hidden');
        if (tabSettingsBtn) tabSettingsBtn.classList.add('hidden');
        if (tabDatabaseBtn) tabDatabaseBtn.classList.add('hidden');
        if (tabBackupBtn) tabBackupBtn.classList.add('hidden');
        if (tabDashboardPane) tabDashboardPane.classList.add('hidden');
        if (tabResultsPane) tabResultsPane.classList.add('hidden');
        if (tabQuestionsPane) tabQuestionsPane.classList.add('hidden');
        if (tabSchedulesPane) tabSchedulesPane.classList.add('hidden');
        if (tabStudentsPane) tabStudentsPane.classList.add('hidden');
        if (tabTeachersPane) tabTeachersPane.classList.add('hidden');
        if (tabSettingsPane) tabSettingsPane.classList.add('hidden');
        if (tabDatabasePane) tabDatabasePane.classList.add('hidden');
        if (tabBackupPane) tabBackupPane.classList.add('hidden');
        switchAdminTab('tabMonitoring', { skipSkeleton: true });
      } else if (!isAdmin) {
        if (tabDashboardBtn) tabDashboardBtn.classList.remove('hidden');
        if (tabResultsBtn) tabResultsBtn.classList.remove('hidden');
        if (tabQuestionsBtn) tabQuestionsBtn.classList.remove('hidden');
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
        if (tabDashboardBtn) tabDashboardBtn.classList.remove('hidden');
        if (tabResultsBtn) tabResultsBtn.classList.remove('hidden');
        if (tabQuestionsBtn) tabQuestionsBtn.classList.remove('hidden');
        if (tabSchedulesBtn) tabSchedulesBtn.classList.remove('hidden');
        if (tabStudentsBtn) tabStudentsBtn.classList.remove('hidden');
        if (tabTeachersBtn) tabTeachersBtn.classList.remove('hidden');
        if (tabSettingsBtn) tabSettingsBtn.classList.remove('hidden');
        if (tabDatabaseBtn) tabDatabaseBtn.classList.remove('hidden');
        if (tabBackupBtn) tabBackupBtn.classList.remove('hidden');
        const savedTab = localStorage.getItem('cbt_active_admin_tab') || 'tabDashboard';
        const allowedAdminTabs = ['tabDashboard', 'tabResults', 'tabMonitoring', 'tabSchedules', 'tabQuestions', 'tabStudents', 'tabTeachers', 'tabSettings', 'tabDatabase', 'tabBackup'];
        switchAdminTab(allowedAdminTabs.includes(savedTab) ? savedTab : 'tabDashboard', { skipSkeleton: true });
        if (window.supabaseSync && window.supabaseSync.lastCloudRestrictionMessage) {
          const warnBanner = document.getElementById('adminEgressEarlyWarningBanner');
          const warnTitle = document.getElementById('adminEgressWarningTitle');
          const warnText = document.getElementById('adminEgressWarningText');
          const warnIcon = document.getElementById('adminEgressWarningIcon');
          if (warnBanner) {
            warnBanner.className = 'rounded-2xl border p-3.5 sm:p-4 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-3 bg-rose-50 border-rose-300 text-rose-900';
            if (warnIcon) warnIcon.innerText = '🚨';
            if (warnTitle) warnTitle.innerText = 'Cloud Supabase Terkunci (exceed_egress_quota) — Mode Login Darurat Lokal Aktif';
            if (warnText) warnText.innerText = 'Anda masuk menggunakan verifikasi lokal agar tetap bisa membuka Backup & Manajemen Database. Segera pindahkan Worker ke Cloudflare D1 atau ganti URL Project Supabase yang aktif.';
          }
        }
        if (typeof refreshWorkerEgressMonitorUI === 'function') {
          setTimeout(() => { refreshWorkerEgressMonitorUI(); }, 350);
        }
      }
      if (!isAdmin) {
        const warnBanner = document.getElementById('adminEgressEarlyWarningBanner');
        if (warnBanner) warnBanner.classList.add('hidden');
      }
    }
    const btnOpenAttMon = document.getElementById('btnOpenAttendanceFromMonitoring');
    if (btnOpenAttMon) {
      if (isAdmin) btnOpenAttMon.classList.remove('hidden');
      else btnOpenAttMon.classList.add('hidden');
    }
    const btnOpenRoomDocsMon = document.getElementById('btnOpenRoomDocsFromMonitoring');
    if (btnOpenRoomDocsMon) {
      if (isAdmin) btnOpenRoomDocsMon.classList.remove('hidden');
      else btnOpenRoomDocsMon.classList.add('hidden');
    }
    const btnOpenBeritaAcaraMon = document.getElementById('btnOpenBeritaAcaraFromMonitoring');
    if (btnOpenBeritaAcaraMon) {
      if (isAdmin) btnOpenBeritaAcaraMon.classList.remove('hidden');
      else btnOpenBeritaAcaraMon.classList.add('hidden');
    }
    const btnResetQs = document.getElementById('btnResetDefaultQuestions');
    if (btnResetQs) {
      if (isAdmin) btnResetQs.classList.remove('hidden');
      else btnResetQs.classList.add('hidden');
    }

    const btnSeedTrialQs = document.getElementById('btnSeedTrialQuestions');
    if (btnSeedTrialQs) {
      if (isPengawas) btnSeedTrialQs.classList.add('hidden');
      else btnSeedTrialQs.classList.remove('hidden');
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

    setupMonitoringControls();

    if (!isPengawas) {
      setupSubjectAndClassFilters();
      setupQuestionBankFilters();
      renderAdminOverviewDashboard();
      renderAdminAnalyticsAndResults();
      renderAdminQuestionList();
    }

    if (isAdmin) {
      renderAdminTeacherQuestionProgress();
      renderAdminSchedulesList();
      renderAdminStudentsList();
      renderAdminTeachersList();
      renderAdminConfigForm();
      renderSchoolConfigForm();
      renderSupabaseConfigForm();
    }

    applyRoleButtonPermissions();

    if (!isPengawas && (!window.supabaseSync || !window.supabaseSync.isCloudConfigured())) {
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
        const cfgMan = window.examEngine?.config || {};
        const manTok = String(cfgMan.examToken || 'CBT80M').trim().toUpperCase();
        schedListEl.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
            <div class="min-w-0">
              <div class="font-bold text-slate-800 dark:text-slate-100 truncate">${escapeHtmlSafe(cfgMan.subject || 'Mode Manual')}</div>
              <div class="text-[10px] text-slate-500 truncate">${escapeHtmlSafe(cfgMan.targetClass || 'Semua Kelas')} • Mode Manual (${cfgMan.durationMinutes || 80} mnt)</div>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-mono font-black text-[11px] shrink-0" title="Token Ujian">
              ${escapeHtmlSafe(manTok)}
            </span>
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
              ${topSlice.map((r, i) => {
                const isRem = Number(r.finalScore || 0) < 75;
                return `
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
                  <td class="py-2 px-2.5 text-center whitespace-nowrap">
                    <div class="inline-flex flex-col items-center gap-0.5">
                      <span class="inline-flex px-2 py-0.5 rounded-md font-black text-[11px] ${!isRem ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${r.finalScore ?? 0}</span>
                      <span class="text-[9.5px] font-extrabold ${isRem ? 'text-rose-600' : 'text-emerald-600'}">${isRem ? 'Remedial' : 'Tidak Remedial'}</span>
                    </div>
                  </td>
                  <td class="py-2 px-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">${escapeHtmlSafe(r.completedAt || '-')}</td>
                </tr>
              `;
              }).join('')}
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
    if (dl && window.cbtAdmin) {
      const subjects = window.cbtAdmin.getAllSubjects();
      dl.innerHTML = subjects.map(s => `<option value="${escapeHtmlSafe(s)}">`).join('');
    }
    const clsDl = document.getElementById('scheduleClassList');
    if (clsDl) {
      const stuClasses = (window.studentManager && typeof window.studentManager.getAllClasses === 'function')
        ? window.studentManager.getAllClasses()
        : [];
      const presets = ['Semua Kelas', 'Kelas 7', 'Kelas 8', 'Kelas 9', ...stuClasses];
      const uniquePresets = [...new Set(presets.filter(Boolean))];
      clsDl.innerHTML = uniquePresets.map(c => `<option value="${escapeHtmlSafe(c)}">`).join('');
    }
  }

  const schInputQuestionCategory = document.getElementById('schInputQuestionCategory');
  const schCategoryHelper = document.getElementById('schCategoryHelper');

  function getScheduleCategoryMeta(category) {
    const val = String(category || 'ALL').trim().toLowerCase();
    if (val === 'trial') {
      return {
        value: 'trial',
        badgeText: '🧪 Khusus Simulasi',
        badgeClass: 'bg-violet-100 text-violet-800 border border-violet-200',
        shortText: 'Khusus Soal Simulasi'
      };
    }
    if (val === 'exam') {
      return {
        value: 'exam',
        badgeText: '📝 Soal Ujian Asli',
        badgeClass: 'bg-sky-50 text-sky-800 border border-sky-200',
        shortText: 'Hanya Soal Ujian Asli'
      };
    }
    return {
      value: 'ALL',
      badgeText: '📚 Semua Soal',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
      shortText: 'Semua Soal (Asli & Simulasi)'
    };
  }

  function updateScheduleCategoryHelper() {
    if (!schCategoryHelper || !schInputQuestionCategory) return;
    const val = schInputQuestionCategory.value || 'ALL';
    if (val === 'trial') {
      schCategoryHelper.innerHTML = 'Mode simulasi: siswa hanya menerima soal bertanda <strong class="text-violet-700">🧪 Simulasi</strong> pada mapel &amp; kelas ini.';
    } else if (val === 'exam') {
      schCategoryHelper.innerHTML = 'Mode ujian resmi: semua soal <strong class="text-violet-700">🧪 Simulasi</strong> otomatis disaring agar tidak ikut tampil ke siswa.';
    } else {
      schCategoryHelper.innerHTML = 'Menarik semua butir soal mapel ini. Pilih <strong>Khusus Soal Simulasi</strong> saat simulasi atau <strong>Hanya Soal Asli</strong> saat hari ujian.';
    }
  }

  if (schInputQuestionCategory) {
    schInputQuestionCategory.addEventListener('change', updateScheduleCategoryHelper);
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
    if (schInputQuestionCategory) schInputQuestionCategory.value = 'ALL';
    updateScheduleCategoryHelper();
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
    if (schInputQuestionCategory) schInputQuestionCategory.value = sched.questionCategory || 'ALL';
    updateScheduleCategoryHelper();

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
        token: document.getElementById('schInputToken').value.trim().toUpperCase(),
        questionCategory: schInputQuestionCategory ? schInputQuestionCategory.value : 'ALL'
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
        const names = activeSchedules.map(s => `${s.subject} (${s.classLevel}${s.questionCategory === 'trial' ? ' • Simulasi' : ''})`).join(', ');
        bannerTextEl.innerText = `${activeSchedules.length} Mapel Aktif Serentak: ${names}`;
      } else if (activeSchedules.length === 1) {
        const s = activeSchedules[0];
        const classLabel = s.classLevel && s.classLevel !== 'Semua Kelas' ? ` (${s.classLevel})` : '';
        const catTag = s.questionCategory === 'trial' ? ' • Mode Simulasi' : (s.questionCategory === 'exam' ? ' • Soal Asli' : '');
        bannerTextEl.innerText = `Mapel Aktif: ${s.subject}${classLabel} • ${s.day}, ${s.dateFormatted || window.cbtAdmin.formatIndonesianDate(s.dateIso)} • Token: ${s.token}${catTag}`;
      } else {
        const manCatTag = cfg.questionCategory === 'trial' ? ' • Mode Simulasi' : (cfg.questionCategory === 'exam' ? ' • Soal Asli' : '');
        bannerTextEl.innerText = `Belum Ada Jadwal Aktif (Mode Manual: ${cfg.subject} • Token: ${cfg.examToken}${manCatTag})`;
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
      const catMeta = getScheduleCategoryMeta(s.questionCategory);
      const qInfo = window.examEngine && window.examEngine.getQuestionsForExam
        ? window.examEngine.getQuestionsForExam(s.subject, s.classLevel, catMeta.value)
        : { questions: [], isFallback: true };
      const emptyBadgeLabel = catMeta.value === 'trial'
        ? '0 Soal Simulasi'
        : (catMeta.value === 'exam' ? '0 Soal Asli' : '0 Soal Khusus');
      const readinessBadge = (qInfo.isFallback || qInfo.questions.length === 0)
        ? `<span class="inline-block px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold text-[10px]">⚠️ ${emptyBadgeLabel}</span>`
        : `<span class="inline-block px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">${qInfo.questions.length} Soal Siap</span>`;

      const tr = document.createElement('tr');
      tr.className = `border-b border-slate-100 transition ${isActive ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`;
      tr.innerHTML = `
        <td class="p-3 text-center font-bold text-slate-400">${idx + 1}</td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-bold text-slate-900">${escapeHtmlSafe(s.day)}, ${escapeHtmlSafe(s.dateFormatted || window.cbtAdmin.formatIndonesianDate(s.dateIso))}</div>
          <div class="text-[10px] font-mono text-slate-400">${escapeHtmlSafe(s.dateIso)}</div>
        </td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${escapeHtmlSafe(s.subject)}</div>
          <div class="flex flex-wrap items-center gap-1 mt-0.5">
            <span class="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px]">${escapeHtmlSafe(s.classLevel)}</span>
            <span class="inline-block px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px]">Maks ${maxAtt}x Uji</span>
            <span class="inline-block px-1.5 py-0.5 rounded-md font-bold text-[10px] ${catMeta.badgeClass}">${catMeta.badgeText}</span>
            ${readinessBadge}
          </div>
        </td>
        <td class="p-3 whitespace-nowrap text-slate-600">
          <div class="font-semibold">${escapeHtmlSafe(s.timeRange || '-')}</div>
          <div class="text-[10px] text-slate-400">${s.durationMinutes} Menit</div>
        </td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded-lg bg-slate-100 text-blue-700 font-mono font-black text-xs">${escapeHtmlSafe(s.token)}</span>
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
          if ((qInfo.isFallback || qInfo.questions.length === 0) && catMeta.value !== 'ALL') {
            alert(`Belum ada butir ${catMeta.shortText} untuk "${s.subject}" (${s.classLevel}).\n\nTambahkan soal terlebih dahulu di menu Bank Soal atau ubah Sumber / Kategori Soal pada jadwal ini.`);
            return;
          }
          const res = window.cbtAdmin.activateSchedule(s.id);
          if (res.success) {
            renderAdminSchedulesList();
            renderConfigInfoOnLogin();
            renderAdminConfigForm();
            setupSubjectAndClassFilters();
            const countNow = window.cbtAdmin.getActiveSchedules().length;
            alert(`Mapel "${s.subject}" (${s.classLevel}) berhasil DIAKTIFKAN!\nKategori Soal: ${catMeta.shortText} (${qInfo.questions.length} soal)\nToken Ujian: ${s.token}\nTotal mapel ujian aktif saat ini: ${countNow} mapel.`);
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
    applyRoleButtonPermissions();
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
    const consultPtsEl = document.getElementById('consultScorePoints');
    if (consultPtsEl) {
      const maxPts = Number(activeRecord.maxPossiblePoints || 0);
      if (Number.isFinite(maxPts) && maxPts > 0) {
        const earnedPts = Number(activeRecord.totalEarnedPoints ?? 0);
        consultPtsEl.innerText = `Poin: ${earnedPts.toLocaleString('id-ID')} / ${maxPts.toLocaleString('id-ID')}`;
        consultPtsEl.classList.remove('hidden');
      } else {
        consultPtsEl.classList.add('hidden');
        consultPtsEl.innerText = '-';
      }
    }
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
      } else if (it.status === 'wrong' || it.status === 'incorrect') {
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
          <td colspan="11" class="p-6 text-center text-slate-500 text-xs sm:text-sm font-medium">
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
      const isRemedial = Number(r.finalScore || 0) < 75;
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
            !isRemedial
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              : 'bg-amber-100 text-amber-800 border border-amber-200'
          }">
            ${r.finalScore}
          </span>
          ${r.maxPossiblePoints ? `<div class="text-[10px] text-slate-400 font-semibold mt-0.5">Poin: ${r.totalEarnedPoints ?? 0}/${r.maxPossiblePoints}</div>` : ''}
        </td>
        <td class="px-2.5 py-2.5 text-center whitespace-nowrap">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
            isRemedial
              ? 'bg-rose-100 text-rose-700 border border-rose-200'
              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
          }">
            ${isRemedial ? '⚠️ Remedial' : '✅ Tidak Remedial'}
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
        <td class="px-2.5 py-2.5 text-center whitespace-nowrap">
          <button type="button" class="btn-delete-result px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-[11px] transition cursor-pointer" title="Hapus permanen hasil ujian ini agar tidak muncul kembali">
            🗑️ Hapus
          </button>
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
      const btnDelRow = tr.querySelector('.btn-delete-result');
      if (btnDelRow) {
        btnDelRow.addEventListener('click', async () => {
          if (!confirm(`Hapus permanen hasil ujian "${r.student?.name || '-'}" (${r.subject || '-'})?\n\nData akan dihapus dari perangkat maupun Cloud sehingga tidak akan muncul kembali.`)) {
            return;
          }
          btnDelRow.disabled = true;
          btnDelRow.innerText = '⏳...';
          try {
            await window.cbtAdmin.deleteSingleResult(r);
            renderAdminAnalyticsAndResults();
          } catch (err) {
            alert('Gagal menghapus hasil ujian: ' + (err?.message || err));
            btnDelRow.disabled = false;
            btnDelRow.innerText = '🗑️ Hapus';
          }
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
    btnClearAllResults.addEventListener('click', async () => {
      if (confirm("Peringatan: Yakin ingin menghapus PERMANEN seluruh riwayat rekap nilai ujian (termasuk yang ada di Cloud agar tidak muncul lagi)?")) {
        btnClearAllResults.disabled = true;
        const prevTxt = btnClearAllResults.innerText;
        btnClearAllResults.innerText = '⏳ Menghapus...';
        try {
          await window.cbtAdmin.clearAllResults({ scopeOnlyFiltered: false });
          renderAdminAnalyticsAndResults();
        } finally {
          btnClearAllResults.disabled = false;
          btnClearAllResults.innerText = prevTxt;
        }
      }
    });
  }

  // ===================== TAB PANTAU LOGIN SISWA & ATURAN PERCOBAAN =====================
  function setupMonitoringControls() {
    if (!window.cbtAdmin) return;
    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const isPengawas = Boolean(currentTeacher && !isAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser(currentTeacher));
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

    const pengawasScope = isPengawas && typeof window.cbtAdmin.getPengawasScope === 'function'
      ? window.cbtAdmin.getPengawasScope(currentTeacher)
      : null;

    const allSubjects = window.cbtAdmin.getAllSubjects();
    const ownedSubjects = isAdmin
      ? allSubjects
      : (isPengawas ? (pengawasScope ? pengawasScope.subjects : []) : teacherSubjects);
    const effectiveClasses = isPengawas
      ? (pengawasScope ? pengawasScope.classes : [])
      : assignedClasses;

    if (ruleSubjEl && !isPengawas) {
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
      if (isAdmin) {
        monSubjEl.innerHTML = '<option value="ALL">Semua Mata Pelajaran Aktif</option>';
      } else if (isPengawas) {
        if (effectiveClasses.length === 0) {
          monSubjEl.innerHTML = `<option value="__NO_SUBJECT__">${pengawasScope && pengawasScope.mode === 'flexible' ? 'Pilih Ruang Dulu' : 'Belum Ada Mapel Aktif'}</option>`;
        } else if (ownedSubjects.length === 0) {
          monSubjEl.innerHTML = '<option value="__NO_SUBJECT__">Belum Ada Mapel Aktif</option>';
        } else if (ownedSubjects.length > 1) {
          monSubjEl.innerHTML = `<option value="ALL">Mapel Diawasi (${escapeHtmlSafe(ownedSubjects.join(', '))})</option>`;
        } else {
          monSubjEl.innerHTML = '';
        }
      } else {
        monSubjEl.innerHTML = ownedSubjects.length > 1
          ? '<option value="ALL">Semua Mapel Diampu</option>'
          : (ownedSubjects.length === 0 ? '<option value="ALL">Belum Ada Mapel Diampu</option>' : '');
      }
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
      } else if (isPengawas && ownedSubjects.length === 0) {
        monSubjEl.value = '__NO_SUBJECT__';
      } else {
        monSubjEl.value = 'ALL';
      }
      monSubjEl.onchange = () => renderMonitoringDashboard(false);
    }

    if (monClassEl) {
      const prevMonCls = monClassEl.value;
      const sm = window.studentManager;
      const allRooms = (sm && typeof sm.getAllRooms === 'function') ? sm.getAllRooms() : [];
      const studentClasses = sm ? sm.getAllClasses() : [];
      const matchedStudentClasses = effectiveClasses.length > 0
        ? studentClasses.filter(c => window.examEngine.matchesClassLevel(effectiveClasses.join(', '), c))
        : studentClasses;
      const classesToShow = effectiveClasses.length > 0
        ? (matchedStudentClasses.length > 0 ? matchedStudentClasses : effectiveClasses)
        : studentClasses;

      if (isPengawas) {
        if (effectiveClasses.length === 0) {
          const emptyRoomLbl = (pengawasScope && pengawasScope.mode === 'flexible')
            ? 'Pilih Ruang di Atas'
            : 'Belum Ada Ruang Hari Ini';
          monClassEl.innerHTML = `<option value="__NO_ROOM__">${emptyRoomLbl}</option>`;
        } else if (pengawasScope && pengawasScope.isRoomScoped) {
          const assignedRooms = pengawasScope.assignedRooms || [];
          const roomClasses = pengawasScope.roomClassLevels || [];
          let pHtml = `<option value="ALL">🏫 Semua Siswa di ${escapeHtmlSafe(assignedRooms.join(', '))}</option>`;
          if (assignedRooms.length > 1) {
            assignedRooms.forEach(rm => {
              pHtml += `<option value="ROOM:${escapeHtmlSafe(rm)}">🏫 ${escapeHtmlSafe(rm)}</option>`;
            });
          }
          if (roomClasses.length > 1) {
            pHtml += '<optgroup label="🎓 Filter Kelas di Ruang Ini">';
            roomClasses.forEach(c => {
              pHtml += `<option value="${escapeHtmlSafe(c)}">Kelas ${escapeHtmlSafe(c)}</option>`;
            });
            pHtml += '</optgroup>';
          }
          monClassEl.innerHTML = pHtml;
        } else if (classesToShow.length === 1) {
          monClassEl.innerHTML = `<option value="${escapeHtmlSafe(classesToShow[0])}">Kelas ${escapeHtmlSafe(classesToShow[0])}</option>`;
        } else {
          monClassEl.innerHTML = `<option value="ALL">Ruang Diawasi (${escapeHtmlSafe(classesToShow.join(', '))})</option>`;
          classesToShow.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.innerText = `Kelas ${c}`;
            monClassEl.appendChild(opt);
          });
        }
        if (prevMonCls && Array.from(monClassEl.options).some(o => o.value === prevMonCls)) {
          monClassEl.value = prevMonCls;
        } else if (effectiveClasses.length === 0) {
          monClassEl.value = '__NO_ROOM__';
        } else if (pengawasScope && pengawasScope.isRoomScoped) {
          monClassEl.value = 'ALL';
        } else if (classesToShow.length === 1) {
          monClassEl.value = classesToShow[0];
        } else {
          monClassEl.value = 'ALL';
        }
      } else {
        let html = effectiveClasses.length > 0
          ? `<option value="ALL">Kelas Diampu (${escapeHtmlSafe(effectiveClasses.join(', '))})</option>`
          : '<option value="ALL">Semua Ruang / Kelas</option>';
        if (allRooms.length > 0 && isAdmin) {
          html += '<optgroup label="🏫 Berdasarkan Ruang Ujian (Campur Kelas)">' +
            allRooms.map(rm => `<option value="ROOM:${escapeHtmlSafe(rm)}">🏫 ${escapeHtmlSafe(rm)}</option>`).join('') +
            '</optgroup>';
        }
        if (classesToShow.length > 0) {
          html += (allRooms.length > 0 && isAdmin ? '<optgroup label="🎓 Berdasarkan Kelas Asli">' : '') +
            classesToShow.map(c => `<option value="${escapeHtmlSafe(c)}">Kelas ${escapeHtmlSafe(c)}</option>`).join('') +
            (allRooms.length > 0 && isAdmin ? '</optgroup>' : '');
        }
        monClassEl.innerHTML = html;
        if (prevMonCls && Array.from(monClassEl.options).some(o => o.value === prevMonCls)) {
          monClassEl.value = prevMonCls;
        } else {
          monClassEl.value = 'ALL';
        }
      }
      monClassEl.onchange = () => renderMonitoringDashboard(false);
    }

    if (monStatusEl) monStatusEl.onchange = () => renderMonitoringDashboard(false);
    if (monSearchEl) monSearchEl.oninput = () => renderMonitoringDashboard(false);

    if (btnRefreshMon) {
      btnRefreshMon.onclick = async () => {
        btnRefreshMon.disabled = true;
        btnRefreshMon.innerText = 'Menyegarkan...';
        await renderMonitoringDashboard(true, true);
        btnRefreshMon.disabled = false;
        btnRefreshMon.innerText = '🔄 Refresh Pantauan';
      };
    }
  }

  function renderPengawasActiveTokens(teacherObj = null) {
    const listEl = document.getElementById('pengawasActiveTokensList');
    if (!listEl || !window.cbtAdmin) return;

    const cur = teacherObj || window.cbtAdmin.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    const isPengawas = Boolean(cur && !isAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser(cur));
    if (!isPengawas) {
      listEl.innerHTML = '';
      return;
    }

    const pengawasScope = typeof window.cbtAdmin.getPengawasScope === 'function'
      ? window.cbtAdmin.getPengawasScope(cur)
      : { classes: cur.classes ? window.cbtAdmin.parseTeacherClasses(cur.classes) : [], subjects: [], matchedSchedules: [] };
    const pCls = pengawasScope.classes || [];
    if (pCls.length === 0) {
      const msg = pengawasScope.mode === 'flexible'
        ? '🏫 Pilih terlebih dahulu <strong>Ruang / Kelas</strong> yang Anda awasi pada dropdown di atas untuk menampilkan token ujian dan daftar siswa ruangan tersebut.'
        : `🗓️ Tidak ada jadwal ruang pengawasan untuk Anda pada hari <strong>${escapeHtmlSafe(pengawasScope.activeDay || 'ini')}</strong>.`;
      listEl.innerHTML = `<div class="text-xs font-semibold text-teal-800 dark:text-teal-300 bg-white/80 dark:bg-slate-900/60 border border-teal-200 dark:border-teal-800 rounded-2xl px-3.5 py-2.5">${msg}</div>`;
      return;
    }

    const activeSchedules = window.cbtAdmin.getActiveSchedules ? window.cbtAdmin.getActiveSchedules() : [];
    const cfg = (window.examEngine && window.examEngine.config) ? window.examEngine.config : {};

    const schedulesToShow = pengawasScope.matchedSchedules || [];
    let items = [];
    if (schedulesToShow.length > 0) {
      items = schedulesToShow.map(s => {
        const rawTarget = String(s.classLevel || s.targetClass || '').trim();
        const displayTarget = (pCls.length > 0 && (!rawTarget || rawTarget.toLowerCase().includes('semua')))
          ? `Ruang/Kelas ${pCls.join(', ')}`
          : (rawTarget || (pCls.length > 0 ? `Ruang/Kelas ${pCls.join(', ')}` : 'Ruang Ujian'));
        return {
          subject: s.subject || 'Ujian Sekolah',
          targetClass: displayTarget,
          token: String(s.token || cfg.examToken || 'CBT80M').trim().toUpperCase(),
          timeLabel: [s.day, s.timeRange || s.time].filter(Boolean).join(' • ')
        };
      });
    } else if (activeSchedules.length === 0 && cfg.subject && pengawasScope.subjects.length > 0) {
      items = [{
        subject: pengawasScope.subjects[0],
        targetClass: pCls.length > 0 ? `Ruang/Kelas ${pCls.join(', ')}` : (cfg.targetClass || 'Ruang Ujian'),
        token: String(cfg.examToken || 'CBT80M').trim().toUpperCase(),
        timeLabel: 'Jadwal Manual'
      }];
    }

    if (items.length === 0) {
      listEl.innerHTML = `<div class="text-xs font-semibold text-teal-800 dark:text-teal-300 bg-white/80 dark:bg-slate-900/60 border border-teal-200 dark:border-teal-800 rounded-2xl px-3.5 py-2.5">Belum ada jadwal ujian aktif yang sesuai dengan ruang/mapel pengawasan Anda saat ini.</div>`;
      return;
    }

    listEl.innerHTML = items.map((item, idx) => `
      <div class="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-700 shadow-xs min-w-[230px] flex-1 sm:flex-initial">
        <div class="min-w-0">
          <div class="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">${escapeHtmlSafe(item.subject)}</div>
          <div class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">${escapeHtmlSafe(item.targetClass)}${item.timeLabel ? ` • ${escapeHtmlSafe(item.timeLabel)}` : ''}</div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="px-2.5 py-1 rounded-xl bg-teal-600 text-white font-mono font-black text-sm sm:text-base tracking-widest select-all shadow-xs">${escapeHtmlSafe(item.token)}</span>
          <button type="button" data-copy-token="${escapeHtmlSafe(item.token)}" data-token-idx="${idx}" class="btn-copy-pengawas-token px-2 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/40 dark:hover:bg-teal-900/70 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-700 text-[11px] font-bold transition cursor-pointer" title="Salin Token">
            📋 Salin
          </button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.btn-copy-pengawas-token').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tok = btn.getAttribute('data-copy-token') || '';
        if (!tok) return;
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(tok);
          } else {
            const ta = document.createElement('textarea');
            ta.value = tok;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          const prev = btn.innerText;
          btn.innerText = '✓ Disalin';
          setTimeout(() => { btn.innerText = prev; }, 1600);
        } catch (e) {}
      });
    });
  }

  let lastPengawasStatePullAt = 0;
  async function renderMonitoringDashboard(pullCloud = false, forcePull = false) {
    const tbody = document.getElementById('adminMonitoringTbody');
    const emptyEl = document.getElementById('adminMonitoringEmpty');
    if (!tbody || !window.cbtAdmin) return;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const isPengawas = Boolean(currentTeacher && !isAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser(currentTeacher));
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
    const assignedClasses = (!isAdmin && currentTeacher && currentTeacher.classes)
      ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes)
      : [];

    if (pullCloud && window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
      const now = Date.now();
      const sessTask = window.supabaseSync.fetchStudentSessions({ force: forcePull });
      const resTask = isPengawas
        ? Promise.resolve(null)
        : window.supabaseSync.fetchCloudResults({ skipIfUnchanged: !forcePull });
      const stateTask = (isPengawas && typeof window.supabaseSync.pullAllSchoolState === 'function' && (forcePull || now - lastPengawasStatePullAt >= 300000))
        ? (() => {
            lastPengawasStatePullAt = now;
            return window.supabaseSync.pullAllSchoolState({ publicOnly: false, includeQuestions: false });
          })()
        : Promise.resolve(null);
      const [sessRes, , stateRes] = await Promise.all([sessTask, resTask, stateTask]);
      if (sessRes && Array.isArray(sessRes.data)) {
        cachedMonitoringSessions = sessRes.data;
      }
      if (stateRes && stateRes.success && stateRes.state) {
        applyCloudState(stateRes.state);
        if (isPengawas) {
          updateStaffHeaderAndPengawasBanner(currentTeacher);
          setupMonitoringControls();
        }
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

    if (isPengawas) {
      updateStaffHeaderAndPengawasBanner(currentTeacher);
      renderPengawasActiveTokens(currentTeacher);
    }

    const pengawasScope = isPengawas && typeof window.cbtAdmin.getPengawasScope === 'function'
      ? window.cbtAdmin.getPengawasScope(currentTeacher)
      : { classes: [], assignedRooms: [], assignedClassTokens: [], roomClassLevels: [], isRoomScoped: false, subjects: [] };
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

    const allStudents = window.studentManager ? window.studentManager.getAllStudents() : [];
    const studentRoomByNisn = new Map();
    allStudents.forEach(st => {
      const k = String(st.nisn || '').trim().toUpperCase();
      if (k && st.examRoom) studentRoomByNisn.set(k, String(st.examRoom).trim());
    });

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
        examRoom: s.examRoom || studentRoomByNisn.get(nisn) || '',
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
      const rNisn = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
      if (!existing || (existing.status !== 'logged_in' && existing.status !== 'in_progress')) {
        rowMap.set(key, {
          nisn: rNisn,
          name: r.student?.name || '-',
          class: r.student?.class || '-',
          examRoom: r.student?.examRoom || studentRoomByNisn.get(rNisn) || '',
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
        if (!existing.examRoom) existing.examRoom = r.student?.examRoom || studentRoomByNisn.get(rNisn) || '';
      }
    });

    const activeSchedules = window.cbtAdmin.getActiveSchedules();
    const defaultSubject = subjFilter !== 'ALL'
      ? subjFilter
      : (activeSchedules.length === 1
        ? activeSchedules[0].subject
        : (!isAdmin && !isPengawas && teacherSubjects.length > 0 ? teacherSubjects[0] : (window.examEngine.config.subject || 'Umum')));

    const nisnWithActivityForScope = new Set();
    rowMap.forEach(row => {
      if (subjFilter === 'ALL' || window.examEngine.matchesSubject(row.subject, subjFilter)) {
        nisnWithActivityForScope.add(row.nisn);
      }
    });

    allStudents.forEach(stu => {
      const stuNisn = String(stu.nisn || '').trim().toUpperCase();
      if (!stuNisn || nisnWithActivityForScope.has(stuNisn)) return;
      let stuDefaultSubject = defaultSubject;
      if (subjFilter === 'ALL' && activeSchedules.length > 1) {
        const matchedSchForStu = activeSchedules.find(sch => window.examEngine.matchesClassLevel(sch.classLevel || sch.targetClass || 'Semua Kelas', stu.class || ''));
        if (matchedSchForStu && matchedSchForStu.subject) stuDefaultSubject = matchedSchForStu.subject;
      }
      const syntheticKey = `${stuNisn}__${String(stuDefaultSubject).toLowerCase()}__none`;
      rowMap.set(syntheticKey, {
        nisn: stuNisn,
        name: stu.name || '-',
        class: stu.class || '-',
        examRoom: stu.examRoom || '',
        subject: stuDefaultSubject,
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

    const smMon = window.studentManager;
    const scopedRows = Array.from(rowMap.values()).filter(row => {
      if (!isAdmin) {
        if (isPengawas) {
          if (pengawasScope.classes.length === 0) return false;
          if (pengawasScope.isRoomScoped) {
            const roomMatch = (pengawasScope.assignedRooms || []).some(rm =>
              smMon && typeof smMon.matchesRoom === 'function'
                ? smMon.matchesRoom(row.examRoom, rm)
                : String(row.examRoom || '').trim().toUpperCase() === String(rm || '').trim().toUpperCase()
            );
            const extraClsMatch = (pengawasScope.assignedClassTokens || []).length > 0 &&
              window.examEngine.matchesClassLevel(pengawasScope.assignedClassTokens.join(', '), String(row.class || '').trim());
            if (!roomMatch && !extraClsMatch) return false;
          } else {
            const stuCls = String(row.class || '').trim();
            if (!stuCls || !window.examEngine.matchesClassLevel(pengawasScope.classes.join(', '), stuCls)) return false;
          }
          if (pengawasScope.subjects.length === 0) return false;
          const pSubOk = pengawasScope.subjects.some(ps => window.examEngine.matchesSubject(row.subject, ps));
          if (!pSubOk) return false;
        } else {
          const subOk = teacherSubjects.length > 0 && teacherSubjects.some(ts => window.examEngine.matchesSubject(row.subject, ts));
          if (!subOk) return false;
          if (assignedClasses.length > 0) {
            const stuCls = String(row.class || '').trim();
            if (!stuCls || !window.examEngine.matchesClassLevel(assignedClasses.join(', '), stuCls)) return false;
          }
        }
      }
      if (subjFilter === '__NO_SUBJECT__' || classFilter === '__NO_ROOM__') return false;
      if (subjFilter !== 'ALL' && !window.examEngine.matchesSubject(row.subject, subjFilter)) return false;
      if (classFilter !== 'ALL') {
        if (classFilter.startsWith('ROOM:')) {
          const targetRoom = classFilter.slice(5);
          if (!(smMon && typeof smMon.matchesRoom === 'function'
            ? smMon.matchesRoom(row.examRoom, targetRoom)
            : String(row.examRoom || '').trim().toUpperCase() === targetRoom.trim().toUpperCase())) {
            return false;
          }
        } else if (!window.examEngine.matchesClassLevel(classFilter, row.class || '')) {
          return false;
        }
      }
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
        (r.class && r.class.toLowerCase().includes(searchQ)) ||
        (r.examRoom && r.examRoom.toLowerCase().includes(searchQ))
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

      const roomBadgeHtml = r.examRoom
        ? `<span class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px] ml-1">🏫 ${escapeHtmlSafe(r.examRoom)}</span>`
        : '';

      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${escapeHtmlSafe(r.name)}</div>
          <div class="font-mono text-[11px] text-slate-500">${escapeHtmlSafe(r.nisn)}</div>
        </td>
        <td class="p-3 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">Kelas ${escapeHtmlSafe(r.class)}</span>${roomBadgeHtml}
        </td>
        <td class="p-3 font-semibold text-slate-700">${escapeHtmlSafe(r.subject)}</td>
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
    applyRoleButtonPermissions();
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

    const catFilterEl = document.getElementById('filterQuestionsCategory');
    if (catFilterEl) {
      catFilterEl.onchange = () => renderAdminQuestionList();
    }

    const isQuestionModalOpen = Boolean(modalQuestionForm && !modalQuestionForm.classList.contains('hidden'));

    if (modalSubjEl && !isQuestionModalOpen) {
      const prevModalVal = modalSubjEl.value;
      syncQuestionSubjectInputDefault(prevModalVal);
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
    const catFilter = document.getElementById('filterQuestionsCategory')?.value || 'ALL';
    const statusFilter = document.getElementById('filterPreExamStatus')?.value || 'ALL';

    const questions = window.cbtAdmin ? window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, catFilter) : [];
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
        const multiSubjNote = (subjFilter === 'ALL' && new Set(items.map(it => it.subject)).size > 1)
          ? ' (gabungan beberapa mapel)'
          : '';
        subtitleEl.innerText = `Filter aktif: ${subjLabel} • ${clsLabel}${multiSubjNote} — Pemeriksaan teknis otomatis ${summary.totalQuestions} butir soal sebelum dikerjakan siswa.`;
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
    if (peWeight) peWeight.innerText = Number(summary.totalWeight || 0).toLocaleString('id-ID');

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
    const catFilter = document.getElementById('filterQuestionsCategory')?.value || 'ALL';
    const qualityFilter = document.getElementById('filterItemAnalysisQuality')?.value || 'ALL';

    let analysis = precomputed;
    if (!analysis && window.cbtAdmin) {
      const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, catFilter);
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

      const trialNote = item.trialQuestionsCount > 0
        ? ` <span class="text-slate-400 font-normal">• +${item.trialQuestionsCount} simulasi (tidak dihitung)</span>`
        : '';
      const firstSub = item.subjects[0] || 'ALL';
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70';
      tr.innerHTML = `
        <td class="p-2.5 text-center font-bold text-slate-400">${idx + 1}</td>
        <td class="p-2.5">
          <div class="font-bold text-slate-900 dark:text-slate-100">${escapeHtmlSafe(item.teacher.name || '-')}</div>
          <div class="text-[10px] text-slate-400 font-mono">NIP: ${escapeHtmlSafe(item.teacher.nip || '-')}${item.teacherClasses.length > 0 ? ` • Kls: ${escapeHtmlSafe(item.teacherClasses.join(', '))}` : ''}</div>
          <div class="text-[10px] text-indigo-700 font-semibold mt-0.5">✍️ Diinput sendiri (asli): <strong>${item.createdByCount}</strong> soal${trialNote}</div>
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
          const catFilterEl = document.getElementById('filterQuestionsCategory');
          if (catFilterEl) {
            catFilterEl.value = 'exam';
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

  const selectedQuestionIds = new Set();
  let lastFilteredQuestionsCache = [];

  function getActiveFilteredQuestions() {
    const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
    const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
    const catFilter = document.getElementById('filterQuestionsCategory')?.value || 'ALL';
    return window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, catFilter);
  }

  function getTargetQuestionsForBulkAction() {
    const filtered = getActiveFilteredQuestions();
    if (selectedQuestionIds.size > 0) {
      const selectedInView = filtered.filter(q => selectedQuestionIds.has(String(q.id)));
      if (selectedInView.length > 0) {
        return { questions: selectedInView, isExplicitSelection: true, filteredCount: filtered.length };
      }
    }
    return { questions: filtered, isExplicitSelection: false, filteredCount: filtered.length };
  }

  function populateBulkPatchSubjectOptions() {
    const sel = document.getElementById('bulkPatchSubjectSelect');
    if (!sel || typeof getQuestionSubjectOptionsList !== 'function') return;
    const prevVal = sel.value;
    const opts = getQuestionSubjectOptionsList();
    sel.innerHTML = opts.map(o => `<option value="${escapeHtmlSafe(o.value)}">${escapeHtmlSafe(o.label)}</option>`).join('');
    if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
      sel.value = prevVal;
    } else {
      const firstReal = opts.find(o => o.value.toLowerCase() !== 'umum');
      if (firstReal) sel.value = firstReal.value;
    }
  }

  function syncBulkSelectionUI(filteredQuestions = lastFilteredQuestionsCache) {
    const list = Array.isArray(filteredQuestions) ? filteredQuestions : [];
    const checkedCount = list.filter(q => selectedQuestionIds.has(String(q.id))).length;
    const selectAllEl = document.getElementById('chkSelectAllQuestions');
    if (selectAllEl) {
      selectAllEl.checked = list.length > 0 && checkedCount === list.length;
      selectAllEl.indeterminate = checkedCount > 0 && checkedCount < list.length;
      selectAllEl.disabled = list.length === 0;
    }
    const badgeEl = document.getElementById('selectedQuestionsCountBadge');
    if (badgeEl) {
      if (checkedCount > 0) {
        badgeEl.className = 'px-2.5 py-1 rounded-xl bg-blue-600 text-white border border-blue-600 font-bold';
        badgeEl.innerText = `☑️ ${checkedCount} soal dipilih (dari ${list.length} tampil)`;
      } else {
        badgeEl.className = 'px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold';
        badgeEl.innerText = list.length > 0 ? `Target: Semua ${list.length} soal tampil` : 'Target: 0 soal tampil';
      }
    }
    populateBulkPatchSubjectOptions();
  }

  function renderAdminQuestionList() {
    const listContainer = document.getElementById('adminQuestionList');
    const totalCountEl = document.getElementById('adminTotalQuestionsCount');
    const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
    const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
    const catFilter = document.getElementById('filterQuestionsCategory')?.value || 'ALL';

    const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, catFilter);
    lastFilteredQuestionsCache = questions;
    // Bersihkan ID terpilih yang sudah tidak ada di bank soal
    const allIdsSet = new Set(window.cbtAdmin.getAllQuestions().map(q => String(q.id)));
    Array.from(selectedQuestionIds).forEach(id => {
      if (!allIdsSet.has(id)) selectedQuestionIds.delete(id);
    });
    const isPassageFn = (item) => Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPassageItem === 'function' && window.cbtAdmin.isPassageItem(item));
    const isEmptyOptsFn = (item) => Boolean(window.cbtAdmin && typeof window.cbtAdmin.isEmptyOptionsQuestion === 'function' && window.cbtAdmin.isEmptyOptionsQuestion(item));
    const scorableQuestions = questions.filter(q => !isPassageFn(q));
    const passageOnlyCount = questions.length - scorableQuestions.length;

    const trialScopedCount = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, 'trial').filter(q => !isPassageFn(q)).length;
    const totalAll = window.cbtAdmin.getAllQuestions().filter(q => !isPassageFn(q)).length;
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
    const catLabel = catFilter === 'trial' ? ' • Simulasi' : (catFilter === 'exam' ? ' • Soal Asli' : '');

    if (totalCountEl) {
      totalCountEl.innerText = `${scorableQuestions.length} Soal${passageOnlyCount > 0 ? ` + ${passageOnlyCount} Wacana` : ''} (${subjLabel}${clsLabel}${catLabel}) — Total Bank: ${totalAll}`;
    }

    const totalWeightEl = document.getElementById('questionTotalWeightBadge');
    const totalWeightFormulaEl = document.getElementById('questionTotalWeightFormula');
    if (totalWeightEl) {
      const weights = scorableQuestions.map(q => parseInt(q?.weight, 10) || 10);
      const sumWeight = weights.reduce((acc, w) => acc + w, 0);
      totalWeightEl.innerText = sumWeight.toLocaleString('id-ID');
      if (totalWeightFormulaEl) {
        if (scorableQuestions.length === 0) {
          totalWeightFormulaEl.innerText = '';
        } else {
          const uniqueWeights = Array.from(new Set(weights));
          if (uniqueWeights.length === 1) {
            totalWeightFormulaEl.innerText = `(${scorableQuestions.length} soal × bobot ${uniqueWeights[0]})`;
          } else {
            const previewW = uniqueWeights.slice(0, 3).join(', ') + (uniqueWeights.length > 3 ? ', ...' : '');
            totalWeightFormulaEl.innerText = `(${scorableQuestions.length} soal • bobot: ${previewW})`;
          }
        }
      }
    }

    const bulkWeightBarInp = document.getElementById('bulkWeightValueInput');
    if (bulkWeightBarInp && document.activeElement !== bulkWeightBarInp && subjFilter !== 'ALL' && scorableQuestions.length > 0) {
      const recBarW = getRecommendedWeightForScope(subjFilter === 'UMUM' ? 'Umum' : subjFilter, classFilter, 25);
      bulkWeightBarInp.value = String(recBarW);
    }

    const btnClearTrials = document.getElementById('btnClearTrialQuestions');
    if (btnClearTrials) {
      btnClearTrials.innerText = trialScopedCount > 0
        ? `🗑️ Hapus Soal Simulasi (${trialScopedCount})`
        : '🗑️ Hapus Soal Simulasi (0)';
      btnClearTrials.classList.toggle('opacity-60', trialScopedCount === 0);
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
      const catEmptyLabel = catFilter === 'trial' ? 'Soal Simulasi' : (catFilter === 'exam' ? 'Soal Ujian Asli' : 'soal');
      const emptyHint = isAdminUser
        ? `Klik tombol <strong class="text-blue-600">+ Tambah Soal</strong>, <strong class="text-violet-700">🧪 Soal Simulasi</strong>, atau <strong class="text-slate-600">📥 Impor JSON</strong> untuk menambahkan butir soal ${activeSubName}.`
        : `Klik tombol <strong class="text-blue-600">+ Tambah Soal</strong>${catFilter === 'exam' ? ' untuk mulai menginput soal ujian asli' : ' atau muat soal simulasi di bawah ini'}.`;
      listContainer.innerHTML = `
        <div class="text-center py-12 px-4 text-slate-500 bg-white rounded-3xl border border-slate-200 flex flex-col items-center gap-3">
          <div>
            <p class="font-bold text-base text-slate-700">Belum ada ${catEmptyLabel} untuk ${activeSubName}${activeClsName}.</p>
            <p class="text-xs sm:text-sm text-slate-400 mt-1">${emptyHint}</p>
          </div>
          ${catFilter !== 'exam' ? `
            <button id="btnEmptyStateSeedTrial" type="button" class="px-4 py-2 rounded-xl text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition cursor-pointer">
              🧪 Muat 3 Soal Simulasi${subjFilter !== 'ALL' && subjFilter !== 'UMUM' ? ` (${escapeHtmlSafe(subjFilter)})` : ''}
            </button>
          ` : ''}
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
            alert(`Berhasil menambahkan ${res.addedCount} soal simulasi ke bank soal (${res.affectedSubjects.join(', ')}).`);
          } else {
            alert(res?.message || 'Bank soal sudah memiliki soal atau belum ada mata pelajaran guru yang cocok.');
          }
        });
      }
      syncBulkSelectionUI(questions);
      return;
    }

    const suspiciousWacanaQs = scorableQuestions.filter(q => isEmptyOptsFn(q));
    if (suspiciousWacanaQs.length > 0) {
      const warnCard = document.createElement('div');
      warnCard.className = 'p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2.5 text-xs text-amber-950 shadow-2xs';
      warnCard.innerHTML = `
        <div>
          <p class="font-bold">⚠️ Ditemukan ${suspiciousWacanaQs.length} item dengan pilihan jawaban A–D kosong (kemungkinan Teks Wacana yang masih ikut bernomor).</p>
          <p class="text-[11px] text-amber-800 mt-0.5">Ubah menjadi <strong>Wacana Tanpa Nomor &amp; Pilihan</strong> agar tidak diberi nomor soal, tidak muncul opsi A–D kosong, dan tidak masuk bobot nilai.</p>
        </div>
        <button id="btnConvertAllSuspiciousPassages" type="button" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer transition shrink-0">
          📖 Ubah Semua (${suspiciousWacanaQs.length}) Jadi Wacana Tanpa Nomor
        </button>
      `;
      listContainer.appendChild(warnCard);
      const btnConvAll = warnCard.querySelector('#btnConvertAllSuspiciousPassages');
      if (btnConvAll) {
        btnConvAll.addEventListener('click', () => {
          const ids = suspiciousWacanaQs.map(item => item.id);
          const res = window.cbtAdmin.convertQuestionsBatchToPassage(ids, 5);
          if (res && res.success) {
            renderAdminQuestionList();
            renderAdminTeacherQuestionProgress();
            renderAdminSchedulesList();
          }
        });
      }
    }

    // Petakan nomor urut soal aktif (mengabaikan item Wacana agar Wacana tidak ikut bernomor)
    const scorableNumById = new Map();
    let preCounter = 0;
    questions.forEach(item => {
      if (!isPassageFn(item)) {
        preCounter += 1;
        scorableNumById.set(String(item.id), preCounter);
      }
    });

    let scorableIdxCounter = 0;
    const seenCardPassages = new Set();

    questions.forEach((q, index) => {
      const type = q.type || 'single';
      const isPassageQ = isPassageFn(q);
      const isTrialQ = window.cbtAdmin && typeof window.cbtAdmin.isTrialQuestion === 'function'
        ? window.cbtAdmin.isTrialQuestion(q)
        : false;
      const qSubj = q.subject && String(q.subject).trim() !== '' ? q.subject : 'Umum / Demo';
      const qClass = q.classLevel && String(q.classLevel).trim() !== '' ? q.classLevel : 'Semua Kelas';
      const qIdStr = String(q.id);
      const isSelectedQ = selectedQuestionIds.has(qIdStr);
      const card = document.createElement('div');

      if (isPassageQ) {
        const pSpan = Math.max(1, parseInt(q.passageSpan || q.passageGroupSize, 10) || 5);
        const pGid = q.passageGroupId ? String(q.passageGroupId).trim() : '';
        if (pGid) seenCardPassages.add(pGid);
        let coveredNums = [];
        if (pGid) {
          questions.forEach(cand => {
            if (!isPassageFn(cand) && String(cand.passageGroupId || '').trim() === pGid) {
              const n = scorableNumById.get(String(cand.id));
              if (n) coveredNums.push(n);
            }
          });
        }
        if (coveredNums.length === 0) {
          for (let j = index + 1; j < questions.length && coveredNums.length < pSpan; j++) {
            const cand = questions[j];
            if (!cand || isPassageFn(cand)) break;
            const n = scorableNumById.get(String(cand.id));
            if (n) coveredNums.push(n);
          }
        }
        const rangeHint = coveredNums.length > 1
          ? `Untuk Soal No. ${coveredNums[0]} s.d. ${coveredNums[coveredNums.length - 1]}`
          : (coveredNums.length === 1 ? `Untuk Soal No. ${coveredNums[0]}` : `Cakupan ${pSpan} soal berikutnya`);
        const pTitle = String(q.passageTitle || '').trim();
        const pBody = String(q.passageText || q.question || '').trim();

        card.className = "bg-indigo-50/70 dark:bg-indigo-950/30 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-indigo-200 dark:border-indigo-800 shadow-xs transition"
          + (isSelectedQ ? " ring-2 ring-blue-500 border-blue-400" : "");
        card.innerHTML = `
          <div class="flex items-start justify-between gap-3">
            <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <label class="inline-flex items-center cursor-pointer p-1 rounded-lg hover:bg-indigo-100" title="Centang wacana untuk edit massal">
                <input type="checkbox" class="chk-q-select w-4 h-4 rounded accent-indigo-600 cursor-pointer" data-q-id="${escapeHtmlSafe(qIdStr)}" ${isSelectedQ ? 'checked' : ''}>
              </label>
              <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-[11px] tracking-wide">
                📖 WACANA
              </span>
              <span class="text-[11px] font-bold px-2 py-0.5 bg-white text-indigo-800 border border-indigo-200 rounded-md">
                Tanpa Nomor &amp; Pilihan
              </span>
              <span class="text-[11px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
                📚 ${qSubj}
              </span>
              <span class="text-[11px] font-bold px-2 py-0.5 bg-teal-100 text-teal-800 rounded-md">
                🏫 ${qClass}
              </span>
              <span class="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                📌 ${escapeHtmlSafe(rangeHint)}
              </span>
              ${isTrialQ ? `<span class="text-[11px] font-bold px-2 py-0.5 bg-violet-100 text-violet-800 border border-violet-200 rounded-md">🧪 Simulasi</span>` : ''}
              ${q.createdBy ? `<span class="text-[11px] font-semibold px-2 py-0.5 bg-white text-slate-600 rounded-md">✍️ ${escapeHtmlSafe(q.createdBy)}</span>` : ''}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" class="btn-edit-q text-indigo-700 hover:text-indigo-900 px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold cursor-pointer transition" title="Edit Wacana Ini">
                ✏️ Edit Wacana
              </button>
              <button type="button" class="btn-delete-q text-red-600 hover:text-red-800 px-2 py-1 rounded-lg hover:bg-red-50 text-xs font-medium cursor-pointer transition" title="Hapus Wacana Ini">
                🗑️ Hapus
              </button>
            </div>
          </div>
          ${pTitle ? `<div class="font-bold text-slate-900 text-sm sm:text-base mt-3 text-center">${escapeHtmlSafe(pTitle)}</div>` : ''}
          <p class="text-slate-800 text-xs sm:text-sm mt-2 whitespace-pre-line leading-relaxed bg-white/80 p-3 rounded-xl border border-indigo-100">${escapeHtmlSafe(pBody)}</p>
          ${q.image ? `<div class="mt-2.5 p-1.5 bg-white rounded-xl border border-indigo-200 inline-block max-w-xs"><img src="${q.image}" alt="Gambar Wacana" class="rounded-lg max-h-28 object-contain"></div>` : ''}
        `;

        const qChk = card.querySelector('.chk-q-select');
        if (qChk) {
          qChk.addEventListener('change', () => {
            if (qChk.checked) {
              selectedQuestionIds.add(qIdStr);
              card.classList.add('ring-2', 'ring-blue-500', 'border-blue-400');
            } else {
              selectedQuestionIds.delete(qIdStr);
              card.classList.remove('ring-2', 'ring-blue-500', 'border-blue-400');
            }
            syncBulkSelectionUI(questions);
          });
        }
        card.querySelector('.btn-edit-q').addEventListener('click', () => {
          openQuestionModal(q, null);
        });
        card.querySelector('.btn-delete-q').addEventListener('click', () => {
          if (confirm(`Yakin ingin menghapus Wacana "${pTitle || pBody.slice(0, 40)}" (${qSubj})?`)) {
            selectedQuestionIds.delete(qIdStr);
            window.cbtAdmin.deleteQuestion(q.id);
            renderAdminQuestionList();
            renderAdminSchedulesList();
          }
        });
        listContainer.appendChild(card);
        return;
      }

      const scorableIdx = scorableIdxCounter;
      const displayNo = scorableIdx + 1;
      scorableIdxCounter += 1;
      const itemStat = analysisResult.items[scorableIdx] || null;
      const preExamStat = preExamResult.items[scorableIdx] || null;
      const isSuspiciousEmpty = isEmptyOptsFn(q);

      card.className = (isTrialQ
        ? "bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-violet-200 dark:border-violet-800/70 shadow-xs hover:border-violet-300 transition"
        : (isSuspiciousEmpty
          ? "bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-amber-300 shadow-xs transition"
          : "bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs hover:border-slate-300 transition"))
        + (isSelectedQ ? " ring-2 ring-blue-500 border-blue-400" : "");

      let typeBadge = '';
      let answerDetailsHtml = '';

      const renderCardOptTable = (key) => {
        const upKey = String(key || '').toUpperCase();
        if (q.optionTables && q.optionTables[upKey] && window.cbtAdmin && typeof window.cbtAdmin.renderQuestionTableHtml === 'function') {
          return window.cbtAdmin.renderQuestionTableHtml(q.optionTables[upKey], false, 'mt-1');
        }
        return '';
      };

      if (type === 'single') {
        typeBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md">PG Tunggal (Kunci: ${q.correctAnswer})</span>`;
        answerDetailsHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
            ${(q.options || []).map(opt => `
              <div class="p-2 rounded-lg ${opt.key === q.correctAnswer ? 'bg-green-50 border border-green-200 font-semibold text-green-800' : 'bg-slate-50 text-slate-600'}">
                <span class="font-bold mr-1">${opt.key}.</span> ${opt.text || ''}
                ${renderCardOptTable(opt.key)}
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
                <span class="font-bold mr-1">[${opt.key}]</span> ${opt.text || ''}
                ${renderCardOptTable(opt.key)}
              </div>
            `).join('')}
          </div>
        `;
      } else if (type === 'true_false') {
        const stmtCount = Array.isArray(q.statements) ? q.statements.length : 0;
        typeBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md">Benar / Salah (${stmtCount} Pernyataan)</span>`;
        answerDetailsHtml = `
          <div class="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1.5">
            ${(q.statements || []).map((stmt, stIdx) => `
              <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span class="text-slate-700"><strong class="mr-1">${stIdx + 1}.</strong>${stmt.text}</span>
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

      const cardStemTableHtml = (q.tableData && window.cbtAdmin && typeof window.cbtAdmin.renderQuestionTableHtml === 'function')
        ? window.cbtAdmin.renderQuestionTableHtml(q.tableData, false, 'mt-2')
        : '';
      const cardStemChartHtml = (q.chartData && window.cbtAdmin && typeof window.cbtAdmin.renderChartSvgHtml === 'function')
        ? window.cbtAdmin.renderChartSvgHtml(q.chartData, { isPrint: false, compact: true })
        : '';

      let cardPassageHtml = '';
      if (q.passageGroupId || q.passageText || q.passageTitle) {
        const gidKey = q.passageGroupId ? String(q.passageGroupId).trim() : '';
        const alreadyShown = gidKey && seenCardPassages.has(gidKey);
        if (gidKey) seenCardPassages.add(gidKey);
        if (alreadyShown) {
          cardPassageHtml = `<div class="mt-2 px-2.5 py-1 rounded-lg bg-indigo-50/70 border border-indigo-200 text-[11px] font-semibold text-indigo-800 inline-block">📖 Mengacu Wacana [${escapeHtmlSafe(gidKey)}]${q.passageTitle ? ` — ${escapeHtmlSafe(q.passageTitle)}` : ''}${q.passageOrder ? ` (Urutan #${q.passageOrder})` : ''}</div>`;
        } else {
          cardPassageHtml = `<div class="mt-2.5 p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs">
             <div class="font-bold text-indigo-900 mb-0.5">📖 Wacana ${q.passageGroupId ? `[${escapeHtmlSafe(q.passageGroupId)}${q.passageOrder ? ` • Urutan #${q.passageOrder}` : ''}]` : ''}${q.passageTitle ? ` — ${escapeHtmlSafe(q.passageTitle)}` : ''}</div>
             ${q.passageText ? `<div class="text-slate-700 whitespace-pre-line line-clamp-3">${escapeHtmlSafe(q.passageText)}</div>` : ''}
           </div>`;
        }
      }

      const suspiciousConvertHtml = isSuspiciousEmpty
        ? `<div class="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
             <span class="font-semibold">⚠️ Opsi A–D kosong! Jika ini teks Wacana/Bacaan, ubah agar tidak punya nomor soal &amp; pilihan:</span>
             <button type="button" class="btn-convert-to-passage px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer transition shrink-0">📖 Jadikan Wacana Tanpa Nomor</button>
           </div>`
        : '';

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <label class="inline-flex items-center cursor-pointer p-1 rounded-lg hover:bg-blue-50" title="Centang soal untuk edit massal">
              <input type="checkbox" class="chk-q-select w-4 h-4 rounded accent-blue-600 cursor-pointer" data-q-id="${escapeHtmlSafe(qIdStr)}" ${isSelectedQ ? 'checked' : ''}>
            </label>
            <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center">
              ${displayNo}
            </span>
            <span class="text-[11px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
              📚 ${qSubj}
            </span>
            <span class="text-[11px] font-bold px-2 py-0.5 bg-teal-100 text-teal-800 rounded-md">
              🏫 ${qClass}
            </span>
            ${isTrialQ ? `<span class="text-[11px] font-bold px-2 py-0.5 bg-violet-100 text-violet-800 border border-violet-200 rounded-md">🧪 Simulasi</span>` : ''}
            ${q.passageGroupId ? `<span class="text-[11px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-md">📖 Wacana #${q.passageOrder || 1}</span>` : ''}
            ${q.chartData ? `<span class="text-[11px] font-bold px-2 py-0.5 bg-cyan-50 text-cyan-800 border border-cyan-200 rounded-md">🗺️ Bagan</span>` : ''}
            ${(q.tableData || q.optionTables) ? `<span class="text-[11px] font-bold px-2 py-0.5 bg-sky-50 text-sky-800 border border-sky-200 rounded-md">📊 Tabel</span>` : ''}
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
        ${suspiciousConvertHtml}
        ${cardPassageHtml}
        <p class="text-slate-800 text-xs sm:text-sm font-medium mt-2.5 whitespace-pre-line leading-relaxed">${q.question}</p>
        ${cardStemTableHtml}
        ${cardStemChartHtml ? `<div class="mt-2">${cardStemChartHtml}</div>` : ''}
        ${q.image ? `<div class="mt-2.5 p-1.5 bg-slate-50 rounded-xl border border-slate-200 inline-block max-w-xs"><img src="${q.image}" alt="Gambar Soal" class="rounded-lg max-h-28 object-contain"></div>` : ''}
        ${answerDetailsHtml}
        ${analysisStripHtml}
      `;

      const btnConvPassage = card.querySelector('.btn-convert-to-passage');
      if (btnConvPassage) {
        btnConvPassage.addEventListener('click', () => {
          const res = window.cbtAdmin.convertQuestionToPassage(q.id, { passageSpan: 5 });
          if (res && res.success) {
            renderAdminQuestionList();
            renderAdminTeacherQuestionProgress();
            renderAdminSchedulesList();
          }
        });
      }

      const qChk = card.querySelector('.chk-q-select');
      if (qChk) {
        qChk.addEventListener('change', () => {
          if (qChk.checked) {
            selectedQuestionIds.add(qIdStr);
            card.classList.add('ring-2', 'ring-blue-500', 'border-blue-400');
          } else {
            selectedQuestionIds.delete(qIdStr);
            card.classList.remove('ring-2', 'ring-blue-500', 'border-blue-400');
          }
          syncBulkSelectionUI(questions);
        });
      }

      card.querySelector('.btn-edit-q').addEventListener('click', () => {
        openQuestionModal(q, displayNo);
      });

      card.querySelector('.btn-delete-q').addEventListener('click', () => {
        if (confirm(`Yakin ingin menghapus Soal No. ${displayNo} (${qSubj})?`)) {
          selectedQuestionIds.delete(qIdStr);
          window.cbtAdmin.deleteQuestion(q.id);
          renderAdminQuestionList();
          renderAdminSchedulesList();
        }
      });

      listContainer.appendChild(card);
    });
    syncBulkSelectionUI(questions);
    applyRoleButtonPermissions();
  }

  const qInputType = document.getElementById('qInputType');
  const sectionOptionsAE = document.getElementById('sectionOptionsAE');
  const boxKeySingle = document.getElementById('boxKeySingle');
  const boxKeyMultiple = document.getElementById('boxKeyMultiple');
  const sectionTrueFalse = document.getElementById('sectionTrueFalse');
  const sectionPassageOnly = document.getElementById('sectionPassageOnly');
  const sectionPassageChildQuestions = document.getElementById('sectionPassageChildQuestions');
  const qPassageChildRowsList = document.getElementById('qPassageChildRowsList');
  const qPassageDetailsWrap = document.getElementById('qPassageDetails');
  const qQuestionTextSection = document.getElementById('qQuestionTextSection');
  const qTableDetailsWrap = document.getElementById('qTableDetails');
  const qWeightSection = document.getElementById('qWeightSection');

  let passageChildRowsState = [];
  let deletedPassageChildIds = [];

  function createEmptyPassageChildRow(defaultWeight = 25) {
    return {
      id: null,
      type: 'single',
      question: '',
      optA: '',
      optB: '',
      optC: '',
      optD: '',
      correctSingle: 'A',
      correctMulti: ['A'],
      weight: Math.max(1, parseInt(defaultWeight, 10) || 25)
    };
  }

  function mapQuestionToPassageChildRow(q) {
    const optsMap = {};
    (q.options || []).forEach(o => {
      if (o && o.key) optsMap[String(o.key).toUpperCase()] = o.text || '';
    });
    const qType = q.type === 'multiple' ? 'multiple' : 'single';
    return {
      id: q.id,
      type: qType,
      question: q.question || '',
      optA: optsMap['A'] || '',
      optB: optsMap['B'] || '',
      optC: optsMap['C'] || '',
      optD: optsMap['D'] || '',
      correctSingle: Array.isArray(q.correctAnswer)
        ? (q.correctAnswer[0] || 'A')
        : (['A', 'B', 'C', 'D'].includes(String(q.correctAnswer || '').toUpperCase()) ? String(q.correctAnswer).toUpperCase() : 'A'),
      correctMulti: Array.isArray(q.correctAnswer)
        ? q.correctAnswer.map(k => String(k).toUpperCase()).filter(k => ['A', 'B', 'C', 'D'].includes(k))
        : [(['A', 'B', 'C', 'D'].includes(String(q.correctAnswer || '').toUpperCase()) ? String(q.correctAnswer).toUpperCase() : 'A')],
      weight: Math.max(1, parseInt(q.weight, 10) || 25),
      existingRaw: q
    };
  }

  function isPassageChildRowTouched(r) {
    if (!r) return false;
    if (r.id) return true;
    return [r.question, r.optA, r.optB, r.optC, r.optD].some(v => String(v || '').trim() !== '');
  }

  function updatePassageChildCountInfo() {
    const infoEl = document.getElementById('qPassageChildCountInfo');
    if (!infoEl) return;
    const totalW = passageChildRowsState.reduce((acc, r) => acc + (parseInt(r.weight, 10) || 25), 0);
    infoEl.innerText = `${passageChildRowsState.length} Soal PG (Total Bobot: ${totalW.toLocaleString('id-ID')} Poin)`;
  }

  function resizePassageChildRows(targetCount) {
    const target = Math.max(1, Math.min(20, parseInt(targetCount, 10) || 5));
    const defW = Math.max(1, parseInt(document.getElementById('qPassageChildDefaultWeight')?.value, 10) || 25);
    while (passageChildRowsState.length < target) {
      passageChildRowsState.push(createEmptyPassageChildRow(defW));
    }
    while (passageChildRowsState.length > target) {
      const last = passageChildRowsState[passageChildRowsState.length - 1];
      if (!isPassageChildRowTouched(last)) {
        passageChildRowsState.pop();
      } else {
        break;
      }
    }
    renderPassageChildRows();
  }

  function renderPassageChildRows() {
    if (!qPassageChildRowsList) return;
    qPassageChildRowsList.innerHTML = passageChildRowsState.map((row, idx) => {
      const num = idx + 1;
      const isMultiple = row.type === 'multiple';
      return `
        <div class="p-3 rounded-2xl border border-slate-200 bg-white space-y-2.5 shadow-2xs">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-lg bg-blue-600 text-white font-black text-xs">Soal No. ${num}</span>
              <select data-pc-idx="${idx}" data-pc-field="type" class="px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 font-bold text-[11px] text-blue-700 outline-none">
                <option value="single" ${!isMultiple ? 'selected' : ''}>Pilihan Ganda Tunggal</option>
                <option value="multiple" ${isMultiple ? 'selected' : ''}>PG Kompleks (&gt;1 Benar)</option>
              </select>
              <label class="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700">
                <span>Bobot:</span>
                <input type="number" data-pc-idx="${idx}" data-pc-field="weight" min="1" max="100" value="${row.weight}" class="w-12 px-1.5 py-1 rounded-lg border border-slate-300 bg-white text-center font-bold text-blue-700 outline-none">
              </label>
            </div>
            ${passageChildRowsState.length > 1 ? `<button type="button" data-pc-remove="${idx}" class="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px] cursor-pointer">🗑️ Hapus</button>` : ''}
          </div>
          <textarea rows="2" data-pc-idx="${idx}" data-pc-field="question" placeholder="Tuliskan pertanyaan nomor ${num} berdasarkan wacana di atas..." class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-blue-500">${escapeHtmlSafe(row.question)}</textarea>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="flex items-center gap-1.5"><span class="font-bold text-slate-500 w-5 text-xs">A</span><input type="text" data-pc-idx="${idx}" data-pc-field="optA" value="${escapeHtmlSafe(row.optA)}" placeholder="Pilihan A" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"></div>
            <div class="flex items-center gap-1.5"><span class="font-bold text-slate-500 w-5 text-xs">B</span><input type="text" data-pc-idx="${idx}" data-pc-field="optB" value="${escapeHtmlSafe(row.optB)}" placeholder="Pilihan B" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"></div>
            <div class="flex items-center gap-1.5"><span class="font-bold text-slate-500 w-5 text-xs">C</span><input type="text" data-pc-idx="${idx}" data-pc-field="optC" value="${escapeHtmlSafe(row.optC)}" placeholder="Pilihan C" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"></div>
            <div class="flex items-center gap-1.5"><span class="font-bold text-slate-500 w-5 text-xs">D</span><input type="text" data-pc-idx="${idx}" data-pc-field="optD" value="${escapeHtmlSafe(row.optD)}" placeholder="Pilihan D" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"></div>
          </div>
          ${!isMultiple ? `
            <div class="flex items-center gap-2 text-xs">
              <span class="font-bold text-slate-700">Kunci Jawaban:</span>
              <select data-pc-idx="${idx}" data-pc-field="correctSingle" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-blue-700 outline-none">
                ${['A', 'B', 'C', 'D'].map(k => `<option value="${k}" ${row.correctSingle === k ? 'selected' : ''}>${k}</option>`).join('')}
              </select>
            </div>
          ` : `
            <div class="flex flex-wrap items-center gap-3 text-xs">
              <span class="font-bold text-slate-700">Kunci PG Kompleks:</span>
              ${['A', 'B', 'C', 'D'].map(k => `
                <label class="inline-flex items-center gap-1 font-bold cursor-pointer">
                  <input type="checkbox" data-pc-idx="${idx}" data-pc-multi="${k}" ${(row.correctMulti || []).includes(k) ? 'checked' : ''}> ${k}
                </label>
              `).join('')}
            </div>
          `}
        </div>
      `;
    }).join('');

    updatePassageChildCountInfo();

    qPassageChildRowsList.querySelectorAll('[data-pc-field]').forEach(el => {
      const idx = parseInt(el.getAttribute('data-pc-idx'), 10);
      const field = el.getAttribute('data-pc-field');
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (!passageChildRowsState[idx]) return;
        if (field === 'weight') {
          passageChildRowsState[idx].weight = Math.max(1, parseInt(el.value, 10) || 25);
          updatePassageChildCountInfo();
        } else {
          passageChildRowsState[idx][field] = el.value;
          if (field === 'type') renderPassageChildRows();
        }
      });
    });

    qPassageChildRowsList.querySelectorAll('[data-pc-multi]').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.getAttribute('data-pc-idx'), 10);
        const key = cb.getAttribute('data-pc-multi');
        const set = new Set(passageChildRowsState[idx]?.correctMulti || []);
        if (cb.checked) set.add(key);
        else set.delete(key);
        if (passageChildRowsState[idx]) passageChildRowsState[idx].correctMulti = Array.from(set);
      });
    });

    qPassageChildRowsList.querySelectorAll('[data-pc-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-pc-remove'), 10);
        const target = passageChildRowsState[idx];
        if (!target || passageChildRowsState.length <= 1) return;
        if (target.id) {
          if (!confirm(`Hapus Soal No. ${idx + 1} dari wacana ini?`)) return;
          deletedPassageChildIds.push(target.id);
        }
        passageChildRowsState.splice(idx, 1);
        const spanEl = document.getElementById('qPassageOnlySpan');
        if (spanEl && Array.from(spanEl.options).some(o => o.value === String(passageChildRowsState.length))) {
          spanEl.value = String(passageChildRowsState.length);
        }
        renderPassageChildRows();
      });
    });
  }

  document.getElementById('qPassageOnlySpan')?.addEventListener('change', (e) => {
    if (qInputType && qInputType.value === 'passage') {
      resizePassageChildRows(parseInt(e.target.value, 10) || 5);
    }
  });

  document.getElementById('btnAddPassageChildRow')?.addEventListener('click', () => {
    const defW = Math.max(1, parseInt(document.getElementById('qPassageChildDefaultWeight')?.value, 10) || 25);
    passageChildRowsState.push(createEmptyPassageChildRow(defW));
    const spanEl = document.getElementById('qPassageOnlySpan');
    if (spanEl && Array.from(spanEl.options).some(o => o.value === String(passageChildRowsState.length))) {
      spanEl.value = String(passageChildRowsState.length);
    }
    renderPassageChildRows();
  });

  const applyPassageChildrenWeight = (wVal) => {
    const w = Math.max(1, Math.min(100, parseInt(wVal, 10) || 25));
    const wEl = document.getElementById('qPassageChildDefaultWeight');
    if (wEl) wEl.value = String(w);
    passageChildRowsState.forEach(r => { r.weight = w; });
    renderPassageChildRows();
  };

  document.querySelectorAll('.btn-passage-child-weight').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPassageChildrenWeight(btn.getAttribute('data-pw'));
    });
  });

  document.getElementById('qPassageChildDefaultWeight')?.addEventListener('input', (e) => {
    const w = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 25));
    passageChildRowsState.forEach(r => { r.weight = w; });
    renderPassageChildRows();
  });

  if (qInputType) {
    qInputType.addEventListener('change', () => {
      const selectedType = qInputType.value;
      const isPassageMode = selectedType === 'passage';
      const valAlertEl = document.getElementById('qFormValidationAlert');
      if (valAlertEl) valAlertEl.classList.add('hidden');

      if (sectionPassageOnly) sectionPassageOnly.classList.toggle('hidden', !isPassageMode);
      if (sectionPassageChildQuestions) sectionPassageChildQuestions.classList.toggle('hidden', !isPassageMode);
      if (qPassageDetailsWrap) qPassageDetailsWrap.classList.toggle('hidden', isPassageMode);
      if (qQuestionTextSection) qQuestionTextSection.classList.toggle('hidden', isPassageMode);
      if (qTableDetailsWrap) qTableDetailsWrap.classList.toggle('hidden', isPassageMode);
      if (qWeightSection) qWeightSection.classList.toggle('hidden', isPassageMode);

      const qTextInp = document.getElementById('qInputText');
      const qWeightInp = document.getElementById('qInputWeight');
      const pOnlyTextInp = document.getElementById('qPassageOnlyText');
      if (qTextInp) qTextInp.required = !isPassageMode;
      if (qWeightInp) qWeightInp.required = !isPassageMode;
      if (pOnlyTextInp) pOnlyTextInp.required = isPassageMode;

      const isEditing = Boolean(document.getElementById('editQuestionId')?.value.trim());
      const submitBtnEl = document.getElementById('btnSubmitQuestionForm');
      const contBtnEl = document.getElementById('btnSubmitAndContinueQuestion');
      if (isPassageMode) {
        if (submitBtnEl) submitBtnEl.innerText = isEditing ? '💾 Simpan Perubahan Wacana & Soal' : '💾 Simpan Wacana & Soal Pilihan Ganda';
        if (contBtnEl) contBtnEl.classList.add('hidden');
        sectionOptionsAE?.classList.add('hidden');
        sectionTrueFalse?.classList.add('hidden');
        if (passageChildRowsState.length === 0) {
          const activeSubjVal = document.getElementById('qInputSubject')?.value || '';
          const activeClsVal = document.getElementById('qInputClassLevel')?.value || 'ALL';
          const recW = getRecommendedWeightForScope(activeSubjVal, activeClsVal, 25);
          const defWInp = document.getElementById('qPassageChildDefaultWeight');
          if (defWInp) defWInp.value = String(recW);
          const spanCount = parseInt(document.getElementById('qPassageOnlySpan')?.value, 10) || 5;
          passageChildRowsState = Array.from({ length: spanCount }, () => createEmptyPassageChildRow(recW));
          renderPassageChildRows();
        }
      } else {
        if (submitBtnEl) submitBtnEl.innerText = isEditing ? 'Simpan Perubahan Soal' : 'Simpan Soal Ujian';
        if (contBtnEl) {
          contBtnEl.classList.remove('hidden');
          contBtnEl.innerText = '➕ Simpan & Tambah Soal Berikutnya';
        }
        if (selectedType === 'single') {
          sectionOptionsAE?.classList.remove('hidden');
          boxKeySingle?.classList.remove('hidden');
          boxKeyMultiple?.classList.add('hidden');
          sectionTrueFalse?.classList.add('hidden');
        } else if (selectedType === 'multiple') {
          sectionOptionsAE?.classList.remove('hidden');
          boxKeySingle?.classList.add('hidden');
          boxKeyMultiple?.classList.remove('hidden');
          sectionTrueFalse?.classList.add('hidden');
        } else if (selectedType === 'true_false') {
          sectionOptionsAE?.classList.add('hidden');
          sectionTrueFalse?.classList.remove('hidden');
        }
      }
    });
  }

  const btnOpenAddQuestion = document.getElementById('btnOpenAddQuestion');
  const btnCloseQuestionForm = document.getElementById('btnCloseQuestionForm');
  const btnCancelQuestionForm = document.getElementById('btnCancelQuestionForm');

  const qInputCategory = document.getElementById('qInputCategory');
  const qCategoryHelper = document.getElementById('qCategoryHelper');

  function syncQuestionCategoryHelper() {
    if (!qCategoryHelper || !qInputCategory) return;
    if (qInputCategory.value === 'trial') {
      qCategoryHelper.classList.remove('hidden');
    } else {
      qCategoryHelper.classList.add('hidden');
    }
  }

  if (qInputCategory) {
    qInputCategory.addEventListener('change', syncQuestionCategoryHelper);
  }

  let qSubjectActiveIndex = -1;
  let qSubjectFilteredItems = [];
  let qSubjectEditingExtraValue = '';

  function getQuestionSubjectOptionsList() {
    if (!window.cbtAdmin) return [{ value: 'Umum', label: 'Umum (Semua Mapel)', badge: 'Default' }];
    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
    const allSubjects = window.cbtAdmin.getAllSubjects();

    const items = [];
    const seen = new Set();
    const pushItem = (value, label, badge, isOwned = false) => {
      const cleanVal = String(value || '').trim();
      if (!cleanVal) return;
      const key = cleanVal.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ value: cleanVal, label: label || cleanVal, badge: badge || 'Terdaftar', isOwned });
    };

    if (isAdmin) {
      pushItem('Umum', 'Umum (Semua Mapel)', 'Default', false);
      allSubjects.forEach(s => pushItem(s, s, 'Terdaftar', false));
    } else if (teacherSubjects.length > 0) {
      teacherSubjects.forEach(s => pushItem(s, s, 'Mapel Diampu', true));
    } else {
      pushItem('Umum', 'Umum (Semua Mapel)', 'Default', false);
      allSubjects.forEach(s => pushItem(s, s, 'Terdaftar', false));
    }

    if (qSubjectEditingExtraValue) {
      pushItem(qSubjectEditingExtraValue, qSubjectEditingExtraValue, 'Mapel Soal', false);
    }

    return items;
  }

  function resolveRegisteredQuestionSubject(rawInput) {
    const clean = String(rawInput || '').trim().toLowerCase();
    if (!clean) return null;
    const list = getQuestionSubjectOptionsList();
    return list.find(it =>
      it.value.toLowerCase() === clean ||
      it.label.toLowerCase() === clean
    ) || null;
  }

  function updateQuestionSubjectControlsUi() {
    const inputEl = document.getElementById('qInputSubject');
    const clearBtn = document.getElementById('btnClearQSubject');
    const hintEl = document.getElementById('qSubjectMatchHint');
    if (!inputEl) return;

    const val = String(inputEl.value || '').trim();
    if (clearBtn) {
      if (val.length > 0) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }

    if (hintEl) {
      if (!val) {
        hintEl.innerText = 'Ketik untuk mencari atau pilih mapel terdaftar di sistem.';
        hintEl.className = 'text-[10px] text-slate-500 mt-1 leading-snug';
      } else {
        const matched = resolveRegisteredQuestionSubject(val);
        if (matched) {
          hintEl.innerText = `✓ Mapel terdaftar: ${matched.value}`;
          hintEl.className = 'text-[10px] text-emerald-700 font-semibold mt-1 leading-snug';
        } else {
          hintEl.innerText = '⚠️ Pilih mata pelajaran dari daftar saran agar sesuai data sistem.';
          hintEl.className = 'text-[10px] text-amber-700 font-semibold mt-1 leading-snug';
        }
      }
    }
  }

  function syncQuestionSubjectInputDefault(preferredVal = '') {
    const inputEl = document.getElementById('qInputSubject');
    if (!inputEl) return;
    const list = getQuestionSubjectOptionsList();
    const matched = resolveRegisteredQuestionSubject(preferredVal);
    if (matched) {
      inputEl.value = matched.value;
    } else if (list.length > 0) {
      inputEl.value = list[0].value;
    } else {
      inputEl.value = '';
    }
    updateQuestionSubjectControlsUi();
  }

  function highlightAutocompleteMatch(text, query) {
    const safeText = escapeHtmlSafe(text);
    const cleanQ = String(query || '').trim();
    if (!cleanQ) return safeText;
    const lowerText = String(text);
    const idx = lowerText.toLowerCase().indexOf(cleanQ.toLowerCase());
    if (idx === -1) return safeText;
    const before = escapeHtmlSafe(lowerText.slice(0, idx));
    const match = escapeHtmlSafe(lowerText.slice(idx, idx + cleanQ.length));
    const after = escapeHtmlSafe(lowerText.slice(idx + cleanQ.length));
    return `${before}<mark class="bg-blue-100 text-blue-900 rounded px-0.5 font-extrabold">${match}</mark>${after}`;
  }

  function closeQuestionSubjectDropdown() {
    const dropdownEl = document.getElementById('qInputSubjectDropdown');
    const inputEl = document.getElementById('qInputSubject');
    if (dropdownEl) dropdownEl.classList.add('hidden');
    if (inputEl) inputEl.setAttribute('aria-expanded', 'false');
    qSubjectActiveIndex = -1;
  }

  function getRecommendedWeightForScope(subject = '', classLevel = 'ALL', fallback = 25) {
    if (!window.cbtAdmin || typeof window.cbtAdmin.getAllQuestions !== 'function') return fallback;
    const allQs = window.cbtAdmin.getAllQuestions() || [];
    const subjClean = String(subject || '').trim();
    const clsClean = String(classLevel || '').trim();

    let scoped = allQs;
    if (subjClean && subjClean.toUpperCase() !== 'ALL') {
      const bySubj = allQs.filter(q => {
        const qs = String(q?.subject || '').trim();
        if (window.examEngine && typeof window.examEngine.matchesSubject === 'function') {
          return window.examEngine.matchesSubject(qs, subjClean);
        }
        return qs.toLowerCase() === subjClean.toLowerCase();
      });
      if (bySubj.length > 0) {
        scoped = bySubj;
        if (clsClean && clsClean.toUpperCase() !== 'ALL' && clsClean.toLowerCase() !== 'semua kelas') {
          const byCls = bySubj.filter(q => {
            const qc = String(q?.classLevel || 'Semua Kelas').trim();
            if (window.examEngine && typeof window.examEngine.matchesClassLevel === 'function') {
              return window.examEngine.matchesClassLevel(qc, clsClean);
            }
            return qc.toLowerCase() === clsClean.toLowerCase();
          });
          if (byCls.length > 0) scoped = byCls;
        }
      } else {
        return fallback;
      }
    } else {
      return fallback;
    }

    const nonTrial = scoped.filter(q => !(window.cbtAdmin.isTrialQuestion && window.cbtAdmin.isTrialQuestion(q)));
    const pool = nonTrial.length > 0 ? nonTrial : scoped;
    if (pool.length === 0) return fallback;

    const freq = new Map();
    let bestWeight = Math.max(1, parseInt(pool[pool.length - 1]?.weight, 10) || fallback);
    let bestCount = 0;
    for (let i = pool.length - 1; i >= 0; i--) {
      const w = parseInt(pool[i]?.weight, 10);
      if (!Number.isFinite(w) || w <= 0) continue;
      const nextCount = (freq.get(w) || 0) + 1;
      freq.set(w, nextCount);
      if (nextCount > bestCount) {
        bestCount = nextCount;
        bestWeight = w;
      }
    }
    return bestWeight;
  }

  function selectQuestionSubjectOption(value) {
    const inputEl = document.getElementById('qInputSubject');
    if (inputEl) {
      inputEl.value = value;
    }
    const isCreateMode = !(document.getElementById('editQuestionId')?.value || '').trim();
    if (isCreateMode) {
      const weightEl = document.getElementById('qInputWeight');
      const clsVal = document.getElementById('qInputClassLevel')?.value || 'ALL';
      if (weightEl) {
        weightEl.value = String(getRecommendedWeightForScope(value, clsVal, 25));
      }
    }
    updateQuestionSubjectControlsUi();
    closeQuestionSubjectDropdown();
  }

  function renderQuestionSubjectDropdown({ showAll = false } = {}) {
    const inputEl = document.getElementById('qInputSubject');
    const dropdownEl = document.getElementById('qInputSubjectDropdown');
    if (!inputEl || !dropdownEl) return;

    const allItems = getQuestionSubjectOptionsList();
    const rawQuery = showAll ? '' : String(inputEl.value || '').trim();
    const queryLower = rawQuery.toLowerCase();

    let filtered = allItems;
    if (queryLower) {
      const prefixMatches = [];
      const substrMatches = [];
      allItems.forEach(item => {
        const vLow = item.value.toLowerCase();
        const lLow = item.label.toLowerCase();
        if (vLow.startsWith(queryLower) || lLow.startsWith(queryLower)) {
          prefixMatches.push(item);
        } else if (vLow.includes(queryLower) || lLow.includes(queryLower)) {
          substrMatches.push(item);
        }
      });
      filtered = [...prefixMatches, ...substrMatches];
    }

    qSubjectFilteredItems = filtered;
    const currentNorm = String(inputEl.value || '').trim().toLowerCase();

    if (filtered.length === 0) {
      qSubjectActiveIndex = -1;
      dropdownEl.innerHTML = `
        <div class="px-3 py-2.5 text-[11px] text-amber-700 bg-amber-50/70 font-medium leading-snug">
          Tidak ada mapel terdaftar yang cocok dengan "<strong>${escapeHtmlSafe(rawQuery)}</strong>".
          Klik tombol <strong>✕</strong> untuk melihat semua mapel terdaftar.
        </div>
      `;
    } else {
      if (qSubjectActiveIndex >= filtered.length) qSubjectActiveIndex = filtered.length - 1;
      dropdownEl.innerHTML = filtered.map((item, idx) => {
        const isSelected = item.value.toLowerCase() === currentNorm;
        const isActive = idx === qSubjectActiveIndex;
        const badgeCls = item.isOwned
          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
          : (item.badge === 'Default'
              ? 'bg-slate-100 text-slate-600 border border-slate-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200');
        const rowStateCls = isActive
          ? 'bg-blue-50 dark:bg-slate-800'
          : (isSelected ? 'bg-blue-50/60 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60');

        return `
          <button
            type="button"
            role="option"
            aria-selected="${isSelected ? 'true' : 'false'}"
            data-qsubj-idx="${idx}"
            data-qsubj-val="${escapeHtmlSafe(item.value)}"
            class="qsubj-option-btn w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition cursor-pointer ${rowStateCls}"
          >
            <span class="font-bold text-slate-800 dark:text-slate-100 truncate">${highlightAutocompleteMatch(item.label, rawQuery)}</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${badgeCls}">
              ${isSelected ? '✓ ' : ''}${escapeHtmlSafe(item.badge)}
            </span>
          </button>
        `;
      }).join('');

      dropdownEl.querySelectorAll('.qsubj-option-btn').forEach(btn => {
        btn.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          const val = btn.getAttribute('data-qsubj-val') || '';
          selectQuestionSubjectOption(val);
        });
      });
    }

    dropdownEl.classList.remove('hidden');
    inputEl.setAttribute('aria-expanded', 'true');
  }

  function setupQuestionSubjectAutocomplete() {
    const wrapEl = document.getElementById('qSubjectAutocompleteWrap');
    const inputEl = document.getElementById('qInputSubject');
    const dropdownEl = document.getElementById('qInputSubjectDropdown');
    const toggleBtn = document.getElementById('btnToggleQSubjectDropdown');
    const clearBtn = document.getElementById('btnClearQSubject');
    if (!wrapEl || !inputEl || !dropdownEl || inputEl.dataset.autocompleteBound === '1') return;
    inputEl.dataset.autocompleteBound = '1';

    inputEl.addEventListener('focus', () => {
      qSubjectActiveIndex = -1;
      const matched = resolveRegisteredQuestionSubject(inputEl.value);
      renderQuestionSubjectDropdown({ showAll: Boolean(matched || !inputEl.value.trim()) });
    });

    inputEl.addEventListener('click', () => {
      if (dropdownEl.classList.contains('hidden')) {
        const matched = resolveRegisteredQuestionSubject(inputEl.value);
        renderQuestionSubjectDropdown({ showAll: Boolean(matched || !inputEl.value.trim()) });
      }
    });

    inputEl.addEventListener('input', () => {
      qSubjectActiveIndex = 0;
      updateQuestionSubjectControlsUi();
      renderQuestionSubjectDropdown({ showAll: false });
    });

    inputEl.addEventListener('keydown', (e) => {
      const isOpen = !dropdownEl.classList.contains('hidden');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) {
          qSubjectActiveIndex = 0;
          renderQuestionSubjectDropdown({ showAll: true });
          return;
        }
        if (qSubjectFilteredItems.length > 0) {
          qSubjectActiveIndex = (qSubjectActiveIndex + 1) % qSubjectFilteredItems.length;
          renderQuestionSubjectDropdown({ showAll: !String(inputEl.value || '').trim() });
          const activeBtn = dropdownEl.querySelector(`[data-qsubj-idx="${qSubjectActiveIndex}"]`);
          if (activeBtn && typeof activeBtn.scrollIntoView === 'function') activeBtn.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) {
          renderQuestionSubjectDropdown({ showAll: true });
          return;
        }
        if (qSubjectFilteredItems.length > 0) {
          qSubjectActiveIndex = qSubjectActiveIndex <= 0 ? qSubjectFilteredItems.length - 1 : qSubjectActiveIndex - 1;
          renderQuestionSubjectDropdown({ showAll: !String(inputEl.value || '').trim() });
          const activeBtn = dropdownEl.querySelector(`[data-qsubj-idx="${qSubjectActiveIndex}"]`);
          if (activeBtn && typeof activeBtn.scrollIntoView === 'function') activeBtn.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter' && isOpen) {
        if (qSubjectFilteredItems.length > 0) {
          e.preventDefault();
          const pickIdx = qSubjectActiveIndex >= 0 && qSubjectActiveIndex < qSubjectFilteredItems.length ? qSubjectActiveIndex : 0;
          selectQuestionSubjectOption(qSubjectFilteredItems[pickIdx].value);
        }
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closeQuestionSubjectDropdown();
      }
    });

    inputEl.addEventListener('blur', () => {
      setTimeout(() => {
        const matched = resolveRegisteredQuestionSubject(inputEl.value);
        if (matched) inputEl.value = matched.value;
        updateQuestionSubjectControlsUi();
        closeQuestionSubjectDropdown();
      }, 150);
    });

    if (toggleBtn) {
      toggleBtn.addEventListener('mousedown', (e) => e.preventDefault());
      toggleBtn.addEventListener('click', () => {
        const isOpen = !dropdownEl.classList.contains('hidden');
        if (isOpen) {
          closeQuestionSubjectDropdown();
        } else {
          inputEl.focus();
          renderQuestionSubjectDropdown({ showAll: true });
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
      clearBtn.addEventListener('click', () => {
        inputEl.value = '';
        qSubjectActiveIndex = 0;
        updateQuestionSubjectControlsUi();
        inputEl.focus();
        renderQuestionSubjectDropdown({ showAll: true });
      });
    }

    document.addEventListener('click', (e) => {
      if (!wrapEl.contains(e.target)) {
        closeQuestionSubjectDropdown();
      }
    });
  }

  setupQuestionSubjectAutocomplete();

  // ===================== BILAH CHECKLIST, UBAH MASSAL & BOBOT DI BANK SOAL =====================
  const chkSelectAllQuestions = document.getElementById('chkSelectAllQuestions');
  if (chkSelectAllQuestions) {
    chkSelectAllQuestions.addEventListener('change', () => {
      const filtered = getActiveFilteredQuestions();
      if (chkSelectAllQuestions.checked) {
        filtered.forEach(q => selectedQuestionIds.add(String(q.id)));
      } else {
        filtered.forEach(q => selectedQuestionIds.delete(String(q.id)));
      }
      renderAdminQuestionList();
    });
  }

  document.getElementById('btnApplyBulkSubject')?.addEventListener('click', () => {
    const target = getTargetQuestionsForBulkAction();
    if (target.questions.length === 0) {
      alert('Tidak ada soal yang dipilih atau tampil pada filter aktif.');
      return;
    }
    const newSubj = document.getElementById('bulkPatchSubjectSelect')?.value?.trim();
    if (!newSubj) {
      alert('Pilih mata pelajaran tujuan terlebih dahulu.');
      return;
    }
    const scopeText = target.isExplicitSelection
      ? `${target.questions.length} soal yang dicentang`
      : `seluruh ${target.questions.length} soal yang sedang tampil`;
    if (!confirm(`Ubah Mata Pelajaran ${scopeText} menjadi "${newSubj}"?`)) return;
    const res = window.cbtAdmin.bulkPatchQuestions(target.questions.map(q => q.id), { subject: newSubj });
    if (!res || !res.success) {
      alert(res?.message || 'Gagal mengubah mata pelajaran secara massal.');
      return;
    }
    selectedQuestionIds.clear();
    setupQuestionBankFilters();
    const subjFilterEl = document.getElementById('filterQuestionsSubject');
    if (subjFilterEl && Array.from(subjFilterEl.options).some(o => o.value === newSubj)) {
      subjFilterEl.value = newSubj;
    }
    renderAdminQuestionList();
    renderAdminSchedulesList();
    alert(`Berhasil mengubah Mata Pelajaran ${res.count} soal menjadi "${newSubj}"!`);
  });

  document.getElementById('btnApplyBulkClass')?.addEventListener('click', () => {
    const target = getTargetQuestionsForBulkAction();
    if (target.questions.length === 0) {
      alert('Tidak ada soal yang dipilih atau tampil pada filter aktif.');
      return;
    }
    const newCls = document.getElementById('bulkPatchClassSelect')?.value || 'Semua Kelas';
    const scopeText = target.isExplicitSelection
      ? `${target.questions.length} soal yang dicentang`
      : `seluruh ${target.questions.length} soal yang sedang tampil`;
    if (!confirm(`Ubah Tingkat/Kelas ${scopeText} menjadi "${newCls}"?`)) return;
    const res = window.cbtAdmin.bulkPatchQuestions(target.questions.map(q => q.id), { classLevel: newCls });
    if (!res || !res.success) {
      alert(res?.message || 'Gagal mengubah tingkat kelas secara massal.');
      return;
    }
    selectedQuestionIds.clear();
    renderAdminQuestionList();
    renderAdminSchedulesList();
    alert(`Berhasil mengubah Tingkat Kelas ${res.count} soal menjadi "${newCls}"!`);
  });

  document.getElementById('btnApplyBulkCategory')?.addEventListener('click', () => {
    const target = getTargetQuestionsForBulkAction();
    if (target.questions.length === 0) {
      alert('Tidak ada soal yang dipilih atau tampil pada filter aktif.');
      return;
    }
    const newCat = document.getElementById('bulkPatchCategorySelect')?.value || 'exam';
    const isTrial = newCat === 'trial';
    const catName = isTrial ? 'Soal Simulasi' : 'Soal Ujian Asli';
    const scopeText = target.isExplicitSelection
      ? `${target.questions.length} soal yang dicentang`
      : `seluruh ${target.questions.length} soal yang sedang tampil`;
    if (!confirm(`Ubah Kategori ${scopeText} menjadi "${catName}"?`)) return;
    const res = window.cbtAdmin.bulkPatchQuestions(target.questions.map(q => q.id), { isTrial });
    if (!res || !res.success) {
      alert(res?.message || 'Gagal mengubah kategori soal secara massal.');
      return;
    }
    selectedQuestionIds.clear();
    renderAdminQuestionList();
    renderAdminSchedulesList();
    alert(`Berhasil mengubah Kategori ${res.count} soal menjadi "${catName}"!`);
  });

  document.querySelectorAll('.btn-bar-weight-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const wInp = document.getElementById('bulkWeightValueInput');
      if (wInp) wInp.value = btn.getAttribute('data-bar-weight') || '25';
    });
  });

  const btnApplyBulkWeight = document.getElementById('btnApplyBulkWeight');
  if (btnApplyBulkWeight) {
    btnApplyBulkWeight.addEventListener('click', () => {
      const target = getTargetQuestionsForBulkAction();
      if (target.questions.length === 0) {
        alert('Tidak ada soal yang tampil atau dicentang.');
        return;
      }
      const val = Math.max(1, parseInt(document.getElementById('bulkWeightValueInput')?.value, 10) || 25);
      const totalPts = target.questions.length * val;
      const distinctSubjects = Array.from(new Set(target.questions.map(q => String(q?.subject || 'Umum').trim()).filter(Boolean)));
      const multiSubjectWarn = distinctSubjects.length > 1
        ? `\n\n⚠️ PERHATIAN: Aksi ini mencakup ${distinctSubjects.length} mata pelajaran sekaligus (${distinctSubjects.join(', ')}). Jika bobot tiap mapel berbeda (misal 25 & 30), pilih 1 Mapel di filter atau centang soal tertentu dulu.`
        : '';
      const scopeText = target.isExplicitSelection
        ? `${target.questions.length} soal yang dicentang`
        : `seluruh ${target.questions.length} soal yang sedang tampil`;
      if (!confirm(`Terapkan bobot nilai ${val} poin per soal ke ${scopeText}?\n\nTotal bobot: ${target.questions.length} soal × ${val} = ${totalPts.toLocaleString('id-ID')} poin.${multiSubjectWarn}`)) return;
      const res = window.cbtAdmin.updateQuestionsWeightBatch(target.questions.map(q => q.id), val);
      renderAdminQuestionList();
      alert(`Berhasil mengubah bobot ${res.count} soal menjadi ${res.weight} poin/soal (Total = ${(res.count * res.weight).toLocaleString('id-ID')} poin).`);
    });
  }

  // ===================== STATE BUILDER TABEL & BAGAN MODAL SOAL TUNGGAL =====================
  let singleStemTableState = null;
  let singleOptionTablesState = { A: null, B: null, C: null, D: null };
  let singleChartState = null;

  function renderTableGridEditor(containerEl, tableState, onChangeCallback) {
    if (!containerEl) return;
    if (!tableState) {
      containerEl.innerHTML = '';
      containerEl.classList.add('hidden');
      return;
    }
    containerEl.classList.remove('hidden');
    const headers = Array.isArray(tableState.headers) ? tableState.headers : ['Kolom 1', 'Kolom 2'];
    const rows = Array.isArray(tableState.rows) ? tableState.rows : [['', '']];
    const colCount = headers.length;

    let html = `<table class="w-full border-collapse text-xs"><thead><tr>`;
    headers.forEach((h, cIdx) => {
      html += `<th class="p-1 border border-slate-300 bg-slate-100"><input type="text" data-tbl-h="${cIdx}" value="${escapeHtmlSafe(h)}" placeholder="Judul Kolom ${cIdx + 1}" class="w-full px-2 py-1 rounded border border-slate-200 bg-white font-bold outline-none"></th>`;
    });
    html += `</tr></thead><tbody>`;
    rows.forEach((r, rIdx) => {
      html += `<tr>`;
      for (let cIdx = 0; cIdx < colCount; cIdx++) {
        const cellVal = r && r[cIdx] !== undefined ? r[cIdx] : '';
        html += `<td class="p-1 border border-slate-300"><input type="text" data-tbl-r="${rIdx}" data-tbl-c="${cIdx}" value="${escapeHtmlSafe(cellVal)}" placeholder="Isi sel..." class="w-full px-2 py-1 rounded border border-slate-200 bg-white outline-none"></td>`;
      }
      html += `</tr>`;
    });
    html += `</tbody></table>`;
    containerEl.innerHTML = html;

    containerEl.querySelectorAll('input[data-tbl-h]').forEach(inp => {
      inp.addEventListener('input', () => {
        const c = parseInt(inp.getAttribute('data-tbl-h'), 10);
        tableState.headers[c] = inp.value;
        if (onChangeCallback) onChangeCallback();
      });
    });
    containerEl.querySelectorAll('input[data-tbl-r]').forEach(inp => {
      inp.addEventListener('input', () => {
        const r = parseInt(inp.getAttribute('data-tbl-r'), 10);
        const c = parseInt(inp.getAttribute('data-tbl-c'), 10);
        if (!tableState.rows[r]) tableState.rows[r] = [];
        tableState.rows[r][c] = inp.value;
        if (onChangeCallback) onChangeCallback();
      });
    });
  }

  function syncStemTableBuilderUI() {
    const gridEl = document.getElementById('qStemTableEditorGrid');
    const badgeEl = document.getElementById('qStemTableStatusBadge');
    const btnToggle = document.getElementById('btnToggleStemTable');
    const extraBtns = ['btnStemTableAddCol', 'btnStemTableDelCol', 'btnStemTableAddRow', 'btnStemTableDelRow', 'btnClearStemTable'];
    if (singleStemTableState) {
      if (badgeEl) badgeEl.innerText = `✓ Aktif (${singleStemTableState.rows.length} baris × ${singleStemTableState.headers.length} kolom)`;
      if (btnToggle) btnToggle.classList.add('hidden');
      extraBtns.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
      renderTableGridEditor(gridEl, singleStemTableState);
    } else {
      if (badgeEl) badgeEl.innerText = 'Belum ada tabel';
      if (btnToggle) btnToggle.classList.remove('hidden');
      extraBtns.forEach(id => document.getElementById(id)?.classList.add('hidden'));
      renderTableGridEditor(gridEl, null);
    }
  }

  function syncOptionTableBuilderUI(optKey) {
    const wrapEl = document.getElementById(`qOptTableWrap${optKey}`);
    const btnToggle = document.querySelector(`.btn-toggle-opt-table[data-opt-table="${optKey}"]`);
    const st = singleOptionTablesState[optKey];
    if (!wrapEl) return;
    if (!st) {
      wrapEl.innerHTML = '';
      wrapEl.classList.add('hidden');
      if (btnToggle) btnToggle.innerText = `📊 Tabel ${optKey}`;
      return;
    }
    if (btnToggle) btnToggle.innerText = `✕ Hapus Tabel ${optKey}`;
    wrapEl.classList.remove('hidden');
    wrapEl.innerHTML = `
      <div class="p-2 bg-white rounded-lg border border-slate-200 space-y-1.5">
        <div class="flex flex-wrap gap-1.5 text-[11px]">
          <button type="button" class="opt-tbl-add-col px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold cursor-pointer">+ Kolom</button>
          <button type="button" class="opt-tbl-del-col px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold cursor-pointer">- Kolom</button>
          <button type="button" class="opt-tbl-add-row px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold cursor-pointer">+ Baris</button>
          <button type="button" class="opt-tbl-del-row px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold cursor-pointer">- Baris</button>
        </div>
        <div class="opt-tbl-grid"></div>
      </div>
    `;
    const gridEl = wrapEl.querySelector('.opt-tbl-grid');
    renderTableGridEditor(gridEl, st);
    wrapEl.querySelector('.opt-tbl-add-col').addEventListener('click', () => {
      st.headers.push(`Kolom ${st.headers.length + 1}`);
      st.rows.forEach(r => r.push(''));
      syncOptionTableBuilderUI(optKey);
    });
    wrapEl.querySelector('.opt-tbl-del-col').addEventListener('click', () => {
      if (st.headers.length <= 1) return;
      st.headers.pop();
      st.rows.forEach(r => r.pop());
      syncOptionTableBuilderUI(optKey);
    });
    wrapEl.querySelector('.opt-tbl-add-row').addEventListener('click', () => {
      st.rows.push(Array(st.headers.length).fill(''));
      syncOptionTableBuilderUI(optKey);
    });
    wrapEl.querySelector('.opt-tbl-del-row').addEventListener('click', () => {
      if (st.rows.length <= 1) return;
      st.rows.pop();
      syncOptionTableBuilderUI(optKey);
    });
  }

  // Bind controls untuk Tabel, Wacana, & Bobot preset di Modal Soal Tunggal
  document.getElementById('btnGenPassageGroupId')?.addEventListener('click', () => {
    const inp = document.getElementById('qInputPassageGroupId');
    if (inp) inp.value = `WACANA-${Math.floor(1000 + Math.random() * 9000)}`;
  });

  document.getElementById('btnToggleStemTable')?.addEventListener('click', () => {
    singleStemTableState = { headers: ['No / Aspek', 'Data 1', 'Data 2'], rows: [['1', '', ''], ['2', '', '']] };
    syncStemTableBuilderUI();
  });
  document.getElementById('btnStemTableAddCol')?.addEventListener('click', () => {
    if (!singleStemTableState) return;
    singleStemTableState.headers.push(`Kolom ${singleStemTableState.headers.length + 1}`);
    singleStemTableState.rows.forEach(r => r.push(''));
    syncStemTableBuilderUI();
  });
  document.getElementById('btnStemTableDelCol')?.addEventListener('click', () => {
    if (!singleStemTableState || singleStemTableState.headers.length <= 1) return;
    singleStemTableState.headers.pop();
    singleStemTableState.rows.forEach(r => r.pop());
    syncStemTableBuilderUI();
  });
  document.getElementById('btnStemTableAddRow')?.addEventListener('click', () => {
    if (!singleStemTableState) return;
    singleStemTableState.rows.push(Array(singleStemTableState.headers.length).fill(''));
    syncStemTableBuilderUI();
  });
  document.getElementById('btnStemTableDelRow')?.addEventListener('click', () => {
    if (!singleStemTableState || singleStemTableState.rows.length <= 1) return;
    singleStemTableState.rows.pop();
    syncStemTableBuilderUI();
  });
  document.getElementById('btnClearStemTable')?.addEventListener('click', () => {
    singleStemTableState = null;
    syncStemTableBuilderUI();
  });

  document.querySelectorAll('.btn-toggle-opt-table').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-opt-table');
      if (singleOptionTablesState[k]) {
        singleOptionTablesState[k] = null;
      } else {
        singleOptionTablesState[k] = { headers: ['Aspek', 'Nilai'], rows: [['', ''], ['', '']] };
      }
      syncOptionTableBuilderUI(k);
    });
  });

  document.querySelectorAll('.btn-q-weight-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const wInp = document.getElementById('qInputWeight');
      if (wInp) wInp.value = btn.getAttribute('data-q-weight') || '10';
    });
  });

  function closeQuestionModal() {
    if (modalQuestionForm) modalQuestionForm.classList.add('hidden');
    const editIdEl = document.getElementById('editQuestionId');
    if (editIdEl) editIdEl.value = '';
    qSubjectEditingExtraValue = '';
    singleStemTableState = null;
    singleOptionTablesState = { A: null, B: null, C: null, D: null };
    singleChartState = null;
    closeQuestionSubjectDropdown();
    resetImageUploader();
  }

  function openQuestionModal(question = null, displayNumber = null) {
    const formEl = document.getElementById('formQuestionItem');
    if (formEl) formEl.reset();
    resetImageUploader();
    singleStemTableState = null;
    singleOptionTablesState = { A: null, B: null, C: null, D: null };
    singleChartState = null;
    qSubjectEditingExtraValue = question && question.subject ? String(question.subject).trim() : '';
    setupQuestionSubjectAutocomplete();
    setupQuestionBankFilters();
    closeQuestionSubjectDropdown();

    const saveContNoticeEl = document.getElementById('qSaveContinueNotice');
    if (saveContNoticeEl) {
      saveContNoticeEl.classList.add('hidden');
      saveContNoticeEl.innerText = '';
    }
    const btnSaveAndContinueEl = document.getElementById('btnSubmitAndContinueQuestion');
    if (btnSaveAndContinueEl) btnSaveAndContinueEl.classList.toggle('hidden', Boolean(question));

    const titleEl = document.getElementById('questionFormTitle');
    const submitBtnEl = document.getElementById('btnSubmitQuestionForm');
    const editIdEl = document.getElementById('editQuestionId');
    const modalSubjEl = document.getElementById('qInputSubject');
    const modalClassEl = document.getElementById('qInputClassLevel');

    // Reset panel wacana & tabel
    const pDetails = document.getElementById('qPassageDetails');
    const tDetails = document.getElementById('qTableDetails');
    const valAlertEl = document.getElementById('qFormValidationAlert');
    if (valAlertEl) valAlertEl.classList.add('hidden');
    if (pDetails) pDetails.open = false;
    if (tDetails) tDetails.open = false;
    if (document.getElementById('qInputPassageGroupId')) document.getElementById('qInputPassageGroupId').value = '';
    if (document.getElementById('qInputPassageOrder')) document.getElementById('qInputPassageOrder').value = '1';
    if (document.getElementById('qInputPassageGroupSize')) document.getElementById('qInputPassageGroupSize').value = '5';
    if (document.getElementById('qInputPassageTitle')) document.getElementById('qInputPassageTitle').value = '';
    if (document.getElementById('qInputPassageText')) document.getElementById('qInputPassageText').value = '';
    if (document.getElementById('qPassageOnlyTitle')) document.getElementById('qPassageOnlyTitle').value = '';
    if (document.getElementById('qPassageOnlyText')) document.getElementById('qPassageOnlyText').value = '';
    if (document.getElementById('qPassageOnlySpan')) document.getElementById('qPassageOnlySpan').value = '5';
    passageChildRowsState = [];
    deletedPassageChildIds = [];
    const childSubEl = document.getElementById('qPassageChildSubtitle');
    if (childSubEl) childSubEl.innerText = 'Wacana di atas tidak bernomor & tanpa pilihan; soal bernomor beserta pilihan a–d diisi langsung di bawah ini.';

    if (question) {
      const isEditingPassage = Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPassageItem === 'function' && window.cbtAdmin.isPassageItem(question));
      if (titleEl) {
        titleEl.innerText = isEditingPassage
          ? "Edit Wacana / Teks Bacaan (Tanpa Nomor)"
          : (displayNumber ? `Edit Soal No. ${displayNumber}` : "Edit Butir Soal Ujian");
      }
      if (submitBtnEl) submitBtnEl.innerText = isEditingPassage ? "💾 Simpan Perubahan Wacana & Soal" : "Simpan Perubahan Soal";
      if (editIdEl) editIdEl.value = question.id;

      if (qInputCategory) {
        const isTrialQ = window.cbtAdmin && typeof window.cbtAdmin.isTrialQuestion === 'function'
          ? window.cbtAdmin.isTrialQuestion(question)
          : Boolean(question.isTrial);
        qInputCategory.value = isTrialQ ? 'trial' : 'exam';
        syncQuestionCategoryHelper();
      }

      const rawSubj = (question.subject && String(question.subject).trim()) ? String(question.subject).trim() : 'Umum';
      qSubjectEditingExtraValue = rawSubj;
      if (modalSubjEl) {
        const matchedSubj = resolveRegisteredQuestionSubject(rawSubj);
        modalSubjEl.value = matchedSubj ? matchedSubj.value : rawSubj;
        updateQuestionSubjectControlsUi();
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

      if (qType === 'passage') {
        if (document.getElementById('qPassageOnlyTitle')) document.getElementById('qPassageOnlyTitle').value = question.passageTitle || '';
        if (document.getElementById('qPassageOnlyText')) document.getElementById('qPassageOnlyText').value = question.passageText || question.question || '';
        const spanEl = document.getElementById('qPassageOnlySpan');
        const gid = String(question.passageGroupId || '').trim();
        const isPassageFnLocal = (item) => Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPassageItem === 'function' && window.cbtAdmin.isPassageItem(item));
        const linkedChildren = (gid && window.cbtAdmin)
          ? window.cbtAdmin.getAllQuestions()
            .filter(item => item && !isPassageFnLocal(item) && String(item.passageGroupId || '').trim() === gid)
            .sort((a, b) => (parseInt(a.passageOrder, 10) || 999) - (parseInt(b.passageOrder, 10) || 999))
          : [];
        if (linkedChildren.length > 0) {
          passageChildRowsState = linkedChildren.map(ch => mapQuestionToPassageChildRow(ch));
          const defWInp = document.getElementById('qPassageChildDefaultWeight');
          if (defWInp) defWInp.value = String(passageChildRowsState[0].weight || 25);
          if (spanEl && Array.from(spanEl.options).some(o => o.value === String(linkedChildren.length))) {
            spanEl.value = String(linkedChildren.length);
          }
          renderPassageChildRows();
        } else {
          const spanVal = String(question.passageSpan || question.passageGroupSize || 5);
          if (spanEl && Array.from(spanEl.options).some(o => o.value === spanVal)) spanEl.value = spanVal;
          const recW = getRecommendedWeightForScope(question.subject || '', question.classLevel || 'ALL', 25);
          const defWInp = document.getElementById('qPassageChildDefaultWeight');
          if (defWInp) defWInp.value = String(recW);
          passageChildRowsState = Array.from({ length: parseInt(spanVal, 10) || 5 }, () => createEmptyPassageChildRow(recW));
          if (childSubEl) {
            childSubEl.innerText = 'Belum ada soal PG terhubung langsung — isi di bawah untuk langsung menambahkan Soal PG, atau biarkan kosong jika soal PG sudah dibuat terpisah.';
          }
          renderPassageChildRows();
        }
      } else if (question.passageGroupId || question.passageText || question.passageTitle) {
        if (pDetails) pDetails.open = true;
        if (document.getElementById('qInputPassageGroupId')) document.getElementById('qInputPassageGroupId').value = question.passageGroupId || '';
        if (document.getElementById('qInputPassageOrder')) document.getElementById('qInputPassageOrder').value = question.passageOrder || 1;
        if (document.getElementById('qInputPassageGroupSize')) document.getElementById('qInputPassageGroupSize').value = String(question.passageGroupSize || 5);
        if (document.getElementById('qInputPassageTitle')) document.getElementById('qInputPassageTitle').value = question.passageTitle || '';
        if (document.getElementById('qInputPassageText')) document.getElementById('qInputPassageText').value = question.passageText || '';
      }

      // Muat Tabel Pertanyaan
      if (question.tableData) {
        singleStemTableState = JSON.parse(JSON.stringify(question.tableData));
        if (tDetails) tDetails.open = true;
      }

      // Pertahankan chartData lama secara senyap jika soal terdahulu memilikinya
      if (question.chartData) {
        singleChartState = JSON.parse(JSON.stringify(question.chartData));
      }

      // Muat Tabel Opsi A-D
      if (question.optionTables && typeof question.optionTables === 'object') {
        ['A', 'B', 'C', 'D'].forEach(k => {
          if (question.optionTables[k]) {
            singleOptionTablesState[k] = JSON.parse(JSON.stringify(question.optionTables[k]));
          }
        });
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
        for (let i = 0; i < 4; i++) {
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
      qSubjectEditingExtraValue = "";

      const subjFilterVal = document.getElementById('filterQuestionsSubject')?.value;
      const classFilterVal = document.getElementById('filterQuestionsClass')?.value;

      if (modalSubjEl) {
        const preferred = (subjFilterVal && subjFilterVal !== 'ALL')
          ? (subjFilterVal === 'UMUM' ? 'Umum' : subjFilterVal)
          : '';
        syncQuestionSubjectInputDefault(preferred);
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

      if (qInputCategory) {
        const activeCatFilter = document.getElementById('filterQuestionsCategory')?.value || 'ALL';
        qInputCategory.value = activeCatFilter === 'trial' ? 'trial' : 'exam';
        syncQuestionCategoryHelper();
      }

      const weightEl = document.getElementById('qInputWeight');
      if (weightEl) {
        const activeSubjVal = modalSubjEl ? modalSubjEl.value : '';
        const activeClsVal = modalClassEl ? modalClassEl.value : 'ALL';
        weightEl.value = String(getRecommendedWeightForScope(activeSubjVal, activeClsVal, 25));
      }

      if (qInputType) qInputType.dispatchEvent(new Event('change'));
    }

    syncStemTableBuilderUI();
    ['A', 'B', 'C', 'D'].forEach(k => syncOptionTableBuilderUI(k));

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

  function saveSingleQuestionFromForm({ keepOpenForNext = false } = {}) {
    const editId = document.getElementById('editQuestionId')?.value.trim() || '';
    const valAlertEl = document.getElementById('qFormValidationAlert');
    const valMsgEl = document.getElementById('qFormValidationMsg');
    if (valAlertEl) valAlertEl.classList.add('hidden');

    const rawSubjectInput = document.getElementById('qInputSubject')?.value.trim() || '';
    const matchedSubject = resolveRegisteredQuestionSubject(rawSubjectInput);
    if (!matchedSubject) {
      const subjInputEl = document.getElementById('qInputSubject');
      if (subjInputEl) {
        subjInputEl.focus();
        renderQuestionSubjectDropdown({ showAll: false });
      }
      alert(
        rawSubjectInput
          ? `Mata pelajaran "${rawSubjectInput}" tidak terdaftar di daftar mapel sistem.\n\nSilakan pilih salah satu mata pelajaran dari daftar saran autocompletion untuk menghindari salah ketik.`
          : "Silakan pilih Mata Pelajaran yang terdaftar terlebih dahulu."
      );
      return false;
    }
    const subject = matchedSubject.value;
    const classLevel = document.getElementById('qInputClassLevel')?.value || 'Semua Kelas';
    const isTrial = (document.getElementById('qInputCategory')?.value || 'exam') === 'trial';
    const type = qInputType.value;
    const image = currentUploadedImageBase64 || "";

    if (type === 'passage') {
      const pOnlyTitle = document.getElementById('qPassageOnlyTitle')?.value.trim() || '';
      const pOnlyTextEl = document.getElementById('qPassageOnlyText');
      const pOnlyText = pOnlyTextEl ? pOnlyTextEl.value.trim() : '';
      const rawSpan = Math.max(1, parseInt(document.getElementById('qPassageOnlySpan')?.value, 10) || 5);

      if (!pOnlyText && !pOnlyTitle && !image) {
        if (valMsgEl && valAlertEl) {
          valMsgEl.innerText = 'Isi Teks Wacana / Bacaan terlebih dahulu sebelum menyimpan.';
          valAlertEl.classList.remove('hidden');
        }
        if (pOnlyTextEl) pOnlyTextEl.focus();
        return false;
      }

      const activeChildRows = passageChildRowsState.filter(r => isPassageChildRowTouched(r));
      for (let idx = 0; idx < activeChildRows.length; idx++) {
        const r = activeChildRows[idx];
        const rowNum = passageChildRowsState.indexOf(r) + 1;
        const qTxt = String(r.question || '').trim();
        if (!qTxt) {
          alert(`Teks pertanyaan pada Soal No. ${rowNum} belum diisi! (Kosongkan opsi jika soal ini tidak dipakai, atau lengkapi pertanyaannya.)`);
          return false;
        }
        const opts = [
          { key: 'A', text: String(r.optA || '').trim() },
          { key: 'B', text: String(r.optB || '').trim() },
          { key: 'C', text: String(r.optC || '').trim() },
          { key: 'D', text: String(r.optD || '').trim() }
        ];
        if (!opts.some(o => o.text !== '')) {
          alert(`Pilihan jawaban A–D pada Soal No. ${rowNum} masih kosong semua! Lengkapi minimal pilihan A–D pada soal tersebut.`);
          return false;
        }
        if (r.type === 'multiple' && (!Array.isArray(r.correctMulti) || r.correctMulti.length === 0)) {
          alert(`Pilih minimal 1 kunci jawaban PG Kompleks pada Soal No. ${rowNum}!`);
          return false;
        }
      }

      const existingPassage = editId ? window.cbtAdmin.getAllQuestions().find(item => String(item.id) === String(editId)) : null;
      const pGroupId = (existingPassage && existingPassage.passageGroupId) || `WACANA-${Date.now()}`;
      const effectiveSpan = activeChildRows.length > 0 ? activeChildRows.length : rawSpan;
      const passagePayload = {
        subject,
        classLevel,
        isTrial,
        type: 'passage',
        question: pOnlyText || pOnlyTitle,
        passageTitle: pOnlyTitle,
        passageText: pOnlyText,
        passageSpan: effectiveSpan,
        passageGroupId: pGroupId,
        image,
        weight: 0
      };

      const buildChildPayload = (r, orderNum, totalChildren) => {
        const opts = [
          { key: 'A', text: String(r.optA || '').trim() },
          { key: 'B', text: String(r.optB || '').trim() },
          { key: 'C', text: String(r.optC || '').trim() },
          { key: 'D', text: String(r.optD || '').trim() }
        ];
        const isMult = r.type === 'multiple';
        const payload = {
          subject,
          classLevel,
          isTrial,
          type: isMult ? 'multiple' : 'single',
          question: String(r.question || '').trim(),
          options: opts,
          correctAnswer: isMult
            ? (Array.isArray(r.correctMulti) && r.correctMulti.length > 0 ? r.correctMulti : ['A'])
            : (['A', 'B', 'C', 'D'].includes(r.correctSingle) ? r.correctSingle : 'A'),
          weight: Math.max(1, parseInt(r.weight, 10) || 25),
          passageGroupId: pGroupId,
          passageTitle: pOnlyTitle,
          passageText: pOnlyText,
          passageOrder: orderNum,
          passageGroupSize: totalChildren
        };
        if (r.id) payload.id = r.id;
        return payload;
      };

      if (editId) {
        const res = window.cbtAdmin.updateQuestion(editId, passagePayload);
        if (!res.success) {
          alert(res.message || "Gagal memperbarui wacana.");
          return false;
        }
        if (deletedPassageChildIds.length > 0) {
          deletedPassageChildIds.forEach(delId => window.cbtAdmin.deleteQuestion(delId));
        }
        const totalChildren = activeChildRows.length;
        const updatesList = [];
        const newChildrenList = [];
        activeChildRows.forEach((r, idx) => {
          const cp = buildChildPayload(r, idx + 1, totalChildren);
          if (r.id) updatesList.push(cp);
          else newChildrenList.push(cp);
        });
        if (updatesList.length > 0) {
          window.cbtAdmin.updateQuestionsBatch(updatesList);
        }
        if (newChildrenList.length > 0) {
          window.cbtAdmin.addQuestionsBatch(newChildrenList);
        }
      } else {
        if (activeChildRows.length > 0) {
          const batchPayloads = [
            passagePayload,
            ...activeChildRows.map((r, idx) => buildChildPayload(r, idx + 1, activeChildRows.length))
          ];
          window.cbtAdmin.addQuestionsBatch(batchPayloads);
        } else {
          window.cbtAdmin.addQuestion(passagePayload);
        }
      }

      setupQuestionBankFilters();
      const subjFilterEl = document.getElementById('filterQuestionsSubject');
      if (subjFilterEl && subject && subject !== 'Umum' && Array.from(subjFilterEl.options).some(o => o.value === subject)) {
        subjFilterEl.value = subject;
      }
      renderAdminQuestionList();
      renderAdminSchedulesList();
      closeQuestionModal();
      return true;
    }

    const questionTextEl = document.getElementById('qInputText');
    const questionText = questionTextEl ? questionTextEl.value.trim() : '';
    if (!questionText) {
      alert('Teks pertanyaan soal belum diisi.');
      if (questionTextEl) questionTextEl.focus();
      return false;
    }
    const weight = parseInt(document.getElementById('qInputWeight').value, 10) || 10;

    let qData = { subject, classLevel, isTrial, type, question: questionText, image, weight };

    // Wacana / Kelompok
    const pGroupId = document.getElementById('qInputPassageGroupId')?.value.trim() || '';
    const pTitle = document.getElementById('qInputPassageTitle')?.value.trim() || '';
    const pText = document.getElementById('qInputPassageText')?.value.trim() || '';
    if (pGroupId || pTitle || pText) {
      qData.passageGroupId = pGroupId || `WACANA-${Date.now()}`;
      qData.passageTitle = pTitle;
      qData.passageText = pText;
      qData.passageOrder = parseInt(document.getElementById('qInputPassageOrder')?.value, 10) || 1;
      qData.passageGroupSize = parseInt(document.getElementById('qInputPassageGroupSize')?.value, 10) || 5;
    }

    // Tabel & Bagan
    if (singleStemTableState) qData.tableData = singleStemTableState;
    if (singleChartState) qData.chartData = singleChartState;

    const optTablesClean = {};
    ['A', 'B', 'C', 'D'].forEach(k => {
      if (singleOptionTablesState[k]) optTablesClean[k] = singleOptionTablesState[k];
    });
    if (Object.keys(optTablesClean).length > 0) qData.optionTables = optTablesClean;

    if (type === 'single' || type === 'multiple') {
      const opts = [
        { key: "A", text: document.getElementById('qInputOptA').value.trim() },
        { key: "B", text: document.getElementById('qInputOptB').value.trim() },
        { key: "C", text: document.getElementById('qInputOptC').value.trim() },
        { key: "D", text: document.getElementById('qInputOptD').value.trim() }
      ];
      const hasAnyOption = opts.some(o => o.text !== '') || Object.keys(optTablesClean).length > 0;
      if (!hasAnyOption) {
        if (valMsgEl && valAlertEl) {
          valMsgEl.innerText = '⚠️ Pilihan jawaban A–D masih kosong semua! Soal pilihan ganda wajib memiliki pilihan jawaban. Jika yang Anda tulis adalah Wacana / Teks Bacaan (tanpa nomor & pilihan), klik tombol di bawah untuk menyimpannya sebagai Wacana.';
          valAlertEl.classList.remove('hidden');
        }
        document.getElementById('qInputOptA')?.focus();
        return false;
      }
      qData.options = opts;
      if (type === 'single') {
        const correctSingle = document.getElementById('qInputCorrectSingle').value;
        qData.correctAnswer = ['A', 'B', 'C', 'D'].includes(correctSingle) ? correctSingle : 'A';
      } else {
        const checkedBoxes = Array.from(document.querySelectorAll('input[name="multiCorrect"]:checked'))
          .map(el => el.value)
          .filter(v => ['A', 'B', 'C', 'D'].includes(v));
        if (checkedBoxes.length === 0) {
          alert("Pilih minimal 1 kunci jawaban untuk soal pilihan ganda kompleks!");
          return false;
        }
        qData.correctAnswer = checkedBoxes;
      }
    } else if (type === 'true_false') {
      const statements = [];
      for (let i = 1; i <= 4; i++) {
        const sTxt = (document.getElementById(`tfStmt${i}`)?.value || '').trim();
        const sCorr = document.getElementById(`tfCorrect${i}`)?.value === 'S' ? 'S' : 'B';
        if (sTxt) {
          statements.push({ id: `s${i}`, text: sTxt, correct: sCorr });
        }
      }
      if (statements.length < 2) {
        alert("Harap isi minimal 2 pernyataan untuk soal Benar / Salah!");
        return false;
      }
      qData.statements = statements;
    }

    if (editId) {
      const res = window.cbtAdmin.updateQuestion(editId, qData);
      if (!res.success) {
        alert(res.message || "Gagal memperbarui soal.");
        return false;
      }
    } else {
      window.cbtAdmin.addQuestion(qData);
    }

    setupQuestionBankFilters();
    const subjFilterEl = document.getElementById('filterQuestionsSubject');
    if (subjFilterEl && subject && subject !== 'Umum') {
      if (Array.from(subjFilterEl.options).some(o => o.value === subject)) {
        subjFilterEl.value = subject;
      }
    }
    renderAdminQuestionList();
    renderAdminSchedulesList();

    if (keepOpenForNext && !editId) {
      if (questionTextEl) questionTextEl.value = '';
      ['qInputOptA', 'qInputOptB', 'qInputOptC', 'qInputOptD'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      if (document.getElementById('qInputCorrectSingle')) document.getElementById('qInputCorrectSingle').value = 'A';
      document.querySelectorAll('input[name="multiCorrect"]').forEach((cb, i) => { cb.checked = i === 0; });
      for (let i = 1; i <= 4; i++) {
        const sEl = document.getElementById(`tfStmt${i}`);
        if (sEl) sEl.value = '';
      }
      resetImageUploader();
      singleStemTableState = null;
      singleOptionTablesState = { A: null, B: null, C: null, D: null };
      singleChartState = null;
      syncStemTableBuilderUI();
      ['A', 'B', 'C', 'D'].forEach(k => syncOptionTableBuilderUI(k));
      if (qData.passageGroupId) {
        if (document.getElementById('qInputPassageGroupId')) document.getElementById('qInputPassageGroupId').value = qData.passageGroupId;
        const orderEl = document.getElementById('qInputPassageOrder');
        if (orderEl) orderEl.value = String((parseInt(orderEl.value, 10) || 1) + 1);
      }
      const noticeEl = document.getElementById('qSaveContinueNotice');
      if (noticeEl) {
        noticeEl.innerText = `✅ Soal "${subject}" (${classLevel}) tersimpan! Silakan langsung isi butir soal berikutnya di bawah.`;
        noticeEl.classList.remove('hidden');
      }
      if (questionTextEl) questionTextEl.focus();
      return true;
    }

    closeQuestionModal();
    return true;
  }

  document.getElementById('btnSwitchAlertToPassageMode')?.addEventListener('click', () => {
    const curText = document.getElementById('qInputText')?.value || '';
    const pOnlyTextEl = document.getElementById('qPassageOnlyText');
    if (qInputType) {
      qInputType.value = 'passage';
      qInputType.dispatchEvent(new Event('change'));
    }
    if (pOnlyTextEl && !pOnlyTextEl.value.trim() && curText.trim()) {
      pOnlyTextEl.value = curText.trim();
    }
    pOnlyTextEl?.focus();
  });

  const formQuestionItem = document.getElementById('formQuestionItem');
  if (formQuestionItem) {
    formQuestionItem.addEventListener('submit', (e) => {
      e.preventDefault();
      saveSingleQuestionFromForm({ keepOpenForNext: false });
    });
  }

  document.getElementById('btnSubmitAndContinueQuestion')?.addEventListener('click', () => {
    saveSingleQuestionFromForm({ keepOpenForNext: true });
  });

  document.getElementById('btnSwitchSingleToBulk')?.addEventListener('click', () => {
    const curSubj = document.getElementById('qInputSubject')?.value.trim() || '';
    const curCls = document.getElementById('qInputClassLevel')?.value || '';
    const curCat = document.getElementById('qInputCategory')?.value || 'exam';
    closeQuestionModal();
    openBulkQuestionModal({ subject: curSubj, classLevel: curCls, category: curCat });
  });

  document.getElementById('btnSwitchSingleToBulkEdit')?.addEventListener('click', () => {
    closeQuestionModal();
    openBulkEditQuestionsModal();
  });

  // ===================== MODAL INPUT SOAL SEKALIGUS (BULK & PAKET WACANA 3-5 SOAL) =====================
  const modalBulkQuestionForm = document.getElementById('modalBulkQuestionForm');
  const btnOpenBulkQuestion = document.getElementById('btnOpenBulkQuestion');
  const btnOpenBulkEditQuestions = document.getElementById('btnOpenBulkEditQuestions');
  const btnQuickBulkEditFromBar = document.getElementById('btnQuickBulkEditFromBar');
  const btnCloseBulkQuestionForm = document.getElementById('btnCloseBulkQuestionForm');
  const btnCancelBulkQuestionForm = document.getElementById('btnCancelBulkQuestionForm');
  const bulkInputMode = document.getElementById('bulkInputMode');
  const bulkPassageCard = document.getElementById('bulkPassageCard');
  const bulkQuestionsListContainer = document.getElementById('bulkQuestionsListContainer');

  let bulkRowsState = [];
  let bulkModalActionMode = 'create'; // 'create' | 'edit_existing'

  function createEmptyBulkRow(defaultWeight = 25) {
    return {
      type: 'single',
      question: '',
      optA: '',
      optB: '',
      optC: '',
      optD: '',
      correctSingle: 'A',
      correctMulti: ['A'],
      tfStmts: [
        { text: '', correct: 'B' },
        { text: '', correct: 'S' },
        { text: '', correct: 'B' },
        { text: '', correct: 'S' }
      ],
      weight: Math.max(1, parseInt(defaultWeight, 10) || 25),
      hasTable: false,
      tableData: { headers: ['Aspek', 'Nilai'], rows: [['', ''], ['', '']] }
    };
  }

  function updateBulkTotalWeightInfo() {
    const infoEl = document.getElementById('bulkTotalWeightInfo');
    const formulaEl = document.getElementById('bulkTotalWeightFormula');
    if (!infoEl) return;
    const scorableRows = bulkRowsState.filter(r => r.type !== 'passage');
    const weights = scorableRows.map(r => parseInt(r.weight, 10) || 10);
    const sum = weights.reduce((acc, w) => acc + w, 0);
    infoEl.innerText = sum.toLocaleString('id-ID');
    if (formulaEl) {
      if (scorableRows.length === 0) {
        formulaEl.innerText = '';
      } else {
        const allSame = weights.every(w => w === weights[0]);
        formulaEl.innerText = allSame
          ? `(${scorableRows.length} soal × bobot ${weights[0]})`
          : `(${scorableRows.length} soal)`;
      }
    }
  }

  function syncBulkModeUI() {
    if (!bulkPassageCard || !bulkInputMode) return;
    const isPassage = bulkInputMode.value === 'passage';
    bulkPassageCard.classList.toggle('hidden', !isPassage);
  }

  function renderBulkQuestionRows() {
    if (!bulkQuestionsListContainer) return;
    let bulkScorableNum = 0;
    bulkQuestionsListContainer.innerHTML = bulkRowsState.map((row, idx) => {
      const isSingle = row.type === 'single';
      const isMultiple = row.type === 'multiple';
      const isTf = row.type === 'true_false';
      const isPassageRow = row.type === 'passage';
      if (!isPassageRow) bulkScorableNum += 1;
      const tblHtml = (!isPassageRow && row.hasTable) ? `
        <div class="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200 space-y-1.5">
          <div class="text-[11px] font-bold text-sky-900">📊 Tabel Pertanyaan Baris #${idx + 1} (2×2 cepat — atau edit detail setelah simpan)</div>
          <div class="grid grid-cols-2 gap-1.5">
            <input type="text" data-b-idx="${idx}" data-b-tbl="h0" value="${escapeHtmlSafe(row.tableData.headers[0] || '')}" placeholder="Judul Kolom 1" class="px-2 py-1 rounded border border-sky-200 bg-white font-bold text-xs outline-none">
            <input type="text" data-b-idx="${idx}" data-b-tbl="h1" value="${escapeHtmlSafe(row.tableData.headers[1] || '')}" placeholder="Judul Kolom 2" class="px-2 py-1 rounded border border-sky-200 bg-white font-bold text-xs outline-none">
            <input type="text" data-b-idx="${idx}" data-b-tbl="r0c0" value="${escapeHtmlSafe(row.tableData.rows[0]?.[0] || '')}" placeholder="Baris 1 Kol 1" class="px-2 py-1 rounded border border-sky-200 bg-white text-xs outline-none">
            <input type="text" data-b-idx="${idx}" data-b-tbl="r0c1" value="${escapeHtmlSafe(row.tableData.rows[0]?.[1] || '')}" placeholder="Baris 1 Kol 2" class="px-2 py-1 rounded border border-sky-200 bg-white text-xs outline-none">
            <input type="text" data-b-idx="${idx}" data-b-tbl="r1c0" value="${escapeHtmlSafe(row.tableData.rows[1]?.[0] || '')}" placeholder="Baris 2 Kol 1" class="px-2 py-1 rounded border border-sky-200 bg-white text-xs outline-none">
            <input type="text" data-b-idx="${idx}" data-b-tbl="r1c1" value="${escapeHtmlSafe(row.tableData.rows[1]?.[1] || '')}" placeholder="Baris 2 Kol 2" class="px-2 py-1 rounded border border-sky-200 bg-white text-xs outline-none">
          </div>
        </div>
      ` : '';

      const rowMetaBadge = bulkModalActionMode === 'edit_existing'
        ? `<span class="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 text-[10px] font-bold">📚 ${escapeHtmlSafe(row.originalSubject || 'Umum')} • 🏫 ${escapeHtmlSafe(row.originalClassLevel || 'Semua Kelas')}${row.originalIsTrial ? ' • 🧪 Simulasi' : ''}${row.hasImage ? ' • 🖼️ Gambar' : ''}${row.hasOptionTables ? ' • 📊 Tabel Opsi' : ''}</span>`
        : '';

      const rowBadgeHtml = isPassageRow
        ? `<span class="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white font-black text-xs">📖 WACANA (Tanpa Nomor)</span>`
        : `<span class="px-2.5 py-0.5 rounded-lg ${bulkModalActionMode === 'edit_existing' ? 'bg-amber-600' : 'bg-indigo-600'} text-white font-black text-xs">Soal #${bulkScorableNum}</span>`;

      return `
        <div class="p-3.5 rounded-2xl border ${isPassageRow ? 'border-indigo-300 bg-indigo-50/50' : (bulkModalActionMode === 'edit_existing' ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200 bg-slate-50/50')} space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
            <div class="flex flex-wrap items-center gap-2">
              ${rowBadgeHtml}
              ${rowMetaBadge}
              <select data-b-idx="${idx}" data-b-field="type" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-xs text-blue-700 outline-none">
                <option value="single" ${isSingle ? 'selected' : ''}>PG Tunggal</option>
                <option value="multiple" ${isMultiple ? 'selected' : ''}>PG Kompleks (&gt;1 Benar)</option>
                <option value="true_false" ${isTf ? 'selected' : ''}>Benar / Salah (4 Pernyataan)</option>
                <option value="passage" ${isPassageRow ? 'selected' : ''}>📖 Wacana (Tanpa Nomor &amp; Pilihan)</option>
              </select>
              ${!isPassageRow ? `
                <label class="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                  <span>Bobot:</span>
                  <input type="number" data-b-idx="${idx}" data-b-field="weight" min="1" max="100" value="${row.weight}" class="w-14 px-2 py-1 rounded-lg border border-slate-300 bg-white text-center font-bold text-blue-700 outline-none">
                </label>
              ` : `
                <label class="inline-flex items-center gap-1 text-xs font-bold text-indigo-800">
                  <span>Cakupan:</span>
                  <input type="number" data-b-idx="${idx}" data-b-field="passageSpan" min="1" max="20" value="${row.passageSpan || 5}" class="w-14 px-2 py-1 rounded-lg border border-indigo-200 bg-white text-center font-bold text-indigo-700 outline-none">
                  <span>soal</span>
                </label>
              `}
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              ${!isPassageRow ? `<button type="button" data-b-toggle-tbl="${idx}" class="px-2 py-1 rounded-lg text-[11px] font-bold border ${row.hasTable ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-300'} cursor-pointer">📊 Tabel</button>` : ''}
              ${(bulkModalActionMode === 'create' && bulkRowsState.length > 1) ? `<button type="button" data-b-remove="${idx}" class="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px] cursor-pointer">🗑️ Hapus</button>` : ''}
            </div>
          </div>

          ${isPassageRow ? `
            <input type="text" data-b-idx="${idx}" data-b-field="passageTitle" value="${escapeHtmlSafe(row.passageTitle || '')}" placeholder="Judul Wacana (Opsional, misal: Pangeran Diponegoro)" class="w-full px-3 py-1.5 rounded-xl border border-indigo-200 bg-white text-xs font-bold outline-none">
            <textarea rows="4" data-b-idx="${idx}" data-b-field="question" placeholder="Tuliskan teks bacaan wacana di sini (tidak diberi nomor &amp; pilihan jawaban)..." class="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500">${escapeHtmlSafe(row.passageText || row.question)}</textarea>
          ` : `
            <textarea rows="2" data-b-idx="${idx}" data-b-field="question" placeholder="Tuliskan teks pertanyaan nomor ${bulkScorableNum}..." class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500">${escapeHtmlSafe(row.question)}</textarea>

            ${tblHtml}

            ${!isTf ? `
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="flex items-center gap-1.5"><span class="font-bold text-slate-500 w-5">A</span><input type="text" data-b-idx="${idx}" data-b-field="optA" value="${escapeHtmlSafe(row.optA)}" placeholder="Pilihan A" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none"></div>
                <div class="flex items-center gap-1.5"><span class="font-bold text-slate-500 w-5">B</span><input type="text" data-b-idx="${idx}" data-b-field="optB" value="${escapeHtmlSafe(row.optB)}" placeholder="Pilihan B" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none"></div>
                <div class="flex items-center gap-1.5"><span class="font-bold text-slate-500 w-5">C</span><input type="text" data-b-idx="${idx}" data-b-field="optC" value="${escapeHtmlSafe(row.optC)}" placeholder="Pilihan C" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none"></div>
                <div class="flex items-center gap-1.5"><span class="font-bold text-slate-500 w-5">D</span><input type="text" data-b-idx="${idx}" data-b-field="optD" value="${escapeHtmlSafe(row.optD)}" placeholder="Pilihan D" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none"></div>
              </div>
              ${isSingle ? `
                <div class="flex items-center gap-2 text-xs">
                  <span class="font-bold text-slate-700">Kunci Jawaban:</span>
                  <select data-b-idx="${idx}" data-b-field="correctSingle" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-blue-700 outline-none">
                    ${['A', 'B', 'C', 'D'].map(k => `<option value="${k}" ${row.correctSingle === k ? 'selected' : ''}>${k}</option>`).join('')}
                  </select>
                </div>
              ` : `
                <div class="flex flex-wrap items-center gap-3 text-xs">
                  <span class="font-bold text-slate-700">Kunci PG Kompleks:</span>
                  ${['A', 'B', 'C', 'D'].map(k => `
                    <label class="inline-flex items-center gap-1 font-bold">
                      <input type="checkbox" data-b-idx="${idx}" data-b-multi="${k}" ${row.correctMulti.includes(k) ? 'checked' : ''}> ${k}
                    </label>
                  `).join('')}
                </div>
              `}
            ` : `
              <div class="space-y-1.5">
                ${row.tfStmts.map((st, sIdx) => `
                  <div class="flex items-center gap-2">
                    <input type="text" data-b-idx="${idx}" data-b-tf-text="${sIdx}" value="${escapeHtmlSafe(st.text)}" placeholder="Pernyataan ${sIdx + 1}${sIdx < 2 ? ' (Wajib)' : ' (Opsional)'}" class="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none">
                    <select data-b-idx="${idx}" data-b-tf-corr="${sIdx}" class="w-24 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold outline-none">
                      <option value="B" ${st.correct === 'B' ? 'selected' : ''}>Benar</option>
                      <option value="S" ${st.correct === 'S' ? 'selected' : ''}>Salah</option>
                    </select>
                  </div>
                `).join('')}
              </div>
            `}
          `}
        </div>
      `;
    }).join('');

    updateBulkTotalWeightInfo();

    // Bind row input events
    bulkQuestionsListContainer.querySelectorAll('[data-b-field]').forEach(el => {
      const idx = parseInt(el.getAttribute('data-b-idx'), 10);
      const field = el.getAttribute('data-b-field');
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (!bulkRowsState[idx]) return;
        if (field === 'weight') {
          bulkRowsState[idx].weight = Math.max(1, parseInt(el.value, 10) || 10);
          updateBulkTotalWeightInfo();
        } else if (field === 'passageSpan') {
          bulkRowsState[idx].passageSpan = Math.max(1, parseInt(el.value, 10) || 5);
        } else {
          bulkRowsState[idx][field] = el.value;
          if (field === 'question' && bulkRowsState[idx].type === 'passage') {
            bulkRowsState[idx].passageText = el.value;
          }
          if (field === 'type') renderBulkQuestionRows();
        }
      });
    });

    bulkQuestionsListContainer.querySelectorAll('[data-b-multi]').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.getAttribute('data-b-idx'), 10);
        const key = cb.getAttribute('data-b-multi');
        const set = new Set(bulkRowsState[idx].correctMulti || []);
        if (cb.checked) set.add(key);
        else set.delete(key);
        bulkRowsState[idx].correctMulti = Array.from(set);
      });
    });

    bulkQuestionsListContainer.querySelectorAll('[data-b-tf-text]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.getAttribute('data-b-idx'), 10);
        const sIdx = parseInt(inp.getAttribute('data-b-tf-text'), 10);
        bulkRowsState[idx].tfStmts[sIdx].text = inp.value;
      });
    });

    bulkQuestionsListContainer.querySelectorAll('[data-b-tf-corr]').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.getAttribute('data-b-idx'), 10);
        const sIdx = parseInt(sel.getAttribute('data-b-tf-corr'), 10);
        bulkRowsState[idx].tfStmts[sIdx].correct = sel.value;
      });
    });

    bulkQuestionsListContainer.querySelectorAll('[data-b-toggle-tbl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-b-toggle-tbl'), 10);
        bulkRowsState[idx].hasTable = !bulkRowsState[idx].hasTable;
        renderBulkQuestionRows();
      });
    });

    bulkQuestionsListContainer.querySelectorAll('[data-b-tbl]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.getAttribute('data-b-idx'), 10);
        const pos = inp.getAttribute('data-b-tbl');
        const td = bulkRowsState[idx].tableData;
        if (pos === 'h0') td.headers[0] = inp.value;
        else if (pos === 'h1') td.headers[1] = inp.value;
        else if (pos === 'r0c0') td.rows[0][0] = inp.value;
        else if (pos === 'r0c1') td.rows[0][1] = inp.value;
        else if (pos === 'r1c0') td.rows[1][0] = inp.value;
        else if (pos === 'r1c1') td.rows[1][1] = inp.value;
      });
    });

    bulkQuestionsListContainer.querySelectorAll('[data-b-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-b-remove'), 10);
        if (bulkRowsState.length <= 1) return;
        bulkRowsState.splice(idx, 1);
        renderBulkQuestionRows();
      });
    });
  }

  function updateBulkModalChromeForMode() {
    const isEditMode = bulkModalActionMode === 'edit_existing';
    const titleEl = document.getElementById('bulkQuestionModalTitle');
    const subEl = document.getElementById('bulkQuestionModalSubtitle');
    const submitEl = document.getElementById('btnSubmitBulkQuestionForm');
    const countGroupEl = document.getElementById('bulkCountControlGroup');
    const addRowBtn = document.getElementById('btnBulkAddOneRow');
    const overrideBarEl = document.getElementById('bulkEditMetaOverrideBar');

    if (titleEl) {
      titleEl.innerText = isEditMode
        ? `✏️ Edit Massal ${bulkRowsState.length} Soal Sekaligus (Satu Layar)`
        : '⚡ Input Soal Lengkap Sekaligus (Bulk & Paket Wacana 3–5 Soal)';
    }
    if (subEl) {
      subEl.innerText = isEditMode
        ? 'Ubah teks pertanyaan, pilihan A–D, kunci jawaban, bobot, serta Mapel/Kelas seluruh soal di bawah sekaligus lalu klik Simpan.'
        : 'Buat beberapa butir soal atau 1 Wacana/Pernyataan untuk 3–5 nomor soal sekaligus dalam satu layar tanpa klik tambah satu per satu.';
    }
    if (submitEl) {
      submitEl.innerText = isEditMode ? '💾 Simpan Perubahan Semua Soal' : '💾 Simpan Semua Soal Sekaligus';
      submitEl.className = isEditMode
        ? 'px-5 py-2.5 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-700 transition shadow-sm cursor-pointer'
        : 'px-5 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm cursor-pointer';
    }
    if (countGroupEl) countGroupEl.classList.toggle('hidden', isEditMode);
    if (addRowBtn) addRowBtn.classList.toggle('hidden', isEditMode);
    if (overrideBarEl) {
      overrideBarEl.classList.toggle('hidden', !isEditMode);
      overrideBarEl.classList.toggle('flex', isEditMode);
    }
    if (bulkPassageCard && bulkInputMode) {
      const showPassage = !isEditMode && bulkInputMode.value === 'passage';
      bulkPassageCard.classList.toggle('hidden', !showPassage);
    }
  }

  function populateBulkHeaderControls(preset = {}) {
    const subjSel = document.getElementById('bulkInputSubject');
    if (subjSel) {
      const opts = getQuestionSubjectOptionsList();
      subjSel.innerHTML = opts.map(o => `<option value="${escapeHtmlSafe(o.value)}">${escapeHtmlSafe(o.label)}</option>`).join('');
      const wantedSubj = preset.subject || document.getElementById('filterQuestionsSubject')?.value || '';
      if (wantedSubj && wantedSubj !== 'ALL' && Array.from(subjSel.options).some(o => o.value === wantedSubj)) {
        subjSel.value = wantedSubj;
      } else {
        const firstReal = opts.find(o => o.value.toLowerCase() !== 'umum');
        if (firstReal) subjSel.value = firstReal.value;
      }
    }
    const clsSel = document.getElementById('bulkInputClassLevel');
    if (clsSel) {
      const wantedCls = preset.classLevel || document.getElementById('filterQuestionsClass')?.value || 'ALL';
      if (wantedCls !== 'ALL' && Array.from(clsSel.options).some(o => o.value === wantedCls)) {
        clsSel.value = wantedCls;
      }
    }
    const catSel = document.getElementById('bulkInputCategory');
    if (catSel && preset.category) {
      catSel.value = preset.category === 'trial' ? 'trial' : 'exam';
    }
  }

  function openBulkQuestionModal(preset = {}) {
    if (!modalBulkQuestionForm) return;
    bulkModalActionMode = 'create';
    if (bulkInputMode && bulkInputMode.value === 'edit_existing') {
      bulkInputMode.value = preset.mode || 'passage';
    } else if (bulkInputMode && preset.mode) {
      bulkInputMode.value = preset.mode;
    }
    populateBulkHeaderControls(preset);
    const activeSubj = document.getElementById('bulkInputSubject')?.value || preset.subject || '';
    const activeCls = document.getElementById('bulkInputClassLevel')?.value || preset.classLevel || 'ALL';
    const defWeight = getRecommendedWeightForScope(activeSubj, activeCls, parseInt(document.getElementById('bulkDefaultWeight')?.value, 10) || 25);
    const bulkWeightEl = document.getElementById('bulkDefaultWeight');
    if (bulkWeightEl) bulkWeightEl.value = String(defWeight);
    const countVal = parseInt(document.getElementById('bulkInputCount')?.value, 10) || 5;
    bulkRowsState = Array.from({ length: countVal }, () => createEmptyBulkRow(defWeight));
    if (document.getElementById('bulkPassageTitle')) document.getElementById('bulkPassageTitle').value = '';
    if (document.getElementById('bulkPassageText')) document.getElementById('bulkPassageText').value = '';
    updateBulkModalChromeForMode();
    syncBulkModeUI();
    renderBulkQuestionRows();
    modalBulkQuestionForm.classList.remove('hidden');
  }

  ['bulkInputSubject', 'bulkInputClassLevel'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.dataset.weightSyncBound !== '1') {
      el.dataset.weightSyncBound = '1';
      el.addEventListener('change', () => {
        if (bulkModalActionMode !== 'create') return;
        const s = document.getElementById('bulkInputSubject')?.value || '';
        const c = document.getElementById('bulkInputClassLevel')?.value || 'ALL';
        const recW = getRecommendedWeightForScope(s, c, 25);
        const wInp = document.getElementById('bulkDefaultWeight');
        const prevW = parseInt(wInp?.value, 10) || 25;
        if (wInp) wInp.value = String(recW);
        let changed = false;
        bulkRowsState.forEach(r => {
          if (!String(r.question || '').trim() || Number(r.weight) === prevW) {
            r.weight = recW;
            changed = true;
          }
        });
        if (changed) renderBulkQuestionRows();
      });
    }
  });

  function mapQuestionToBulkEditRow(q) {
    const optsMap = {};
    (q.options || []).forEach(o => {
      if (o && o.key) optsMap[String(o.key).toUpperCase()] = o.text || '';
    });
    const stmts = Array.isArray(q.statements) ? q.statements : [];
    const tfStmts = [0, 1, 2, 3].map(i => ({
      text: stmts[i]?.text || '',
      correct: stmts[i]?.correct === 'S' ? 'S' : (i % 2 === 1 ? 'S' : 'B')
    }));
    const clonedTable = q.tableData ? JSON.parse(JSON.stringify(q.tableData)) : { headers: ['Aspek', 'Nilai'], rows: [['', ''], ['', '']] };
    return {
      id: q.id,
      originalSubject: q.subject || 'Umum',
      originalClassLevel: q.classLevel || 'Semua Kelas',
      originalIsTrial: Boolean(window.cbtAdmin?.isTrialQuestion?.(q)),
      type: q.type || 'single',
      question: q.question || '',
      optA: optsMap['A'] || '',
      optB: optsMap['B'] || '',
      optC: optsMap['C'] || '',
      optD: optsMap['D'] || '',
      correctSingle: Array.isArray(q.correctAnswer) ? (q.correctAnswer[0] || 'A') : (String(q.correctAnswer || 'A').toUpperCase()),
      correctMulti: Array.isArray(q.correctAnswer)
        ? q.correctAnswer.map(k => String(k).toUpperCase())
        : [String(q.correctAnswer || 'A').toUpperCase()],
      tfStmts,
      weight: q.type === 'passage' ? 0 : Math.max(1, parseInt(q.weight, 10) || 10),
      hasTable: Boolean(q.tableData),
      tableData: clonedTable,
      existingChartData: q.chartData ? JSON.parse(JSON.stringify(q.chartData)) : null,
      hasImage: Boolean(q.image),
      hasOptionTables: Boolean(q.optionTables && Object.keys(q.optionTables).length > 0),
      passageGroupId: q.passageGroupId || '',
      passageTitle: q.passageTitle || '',
      passageText: q.passageText || (q.type === 'passage' ? (q.question || '') : ''),
      passageOrder: q.passageOrder || 0,
      passageGroupSize: q.passageGroupSize || 0,
      passageSpan: q.passageSpan || q.passageGroupSize || 5
    };
  }

  function openBulkEditQuestionsModal(explicitList = null) {
    if (!modalBulkQuestionForm) return;
    const targetList = Array.isArray(explicitList) ? explicitList : getTargetQuestionsForBulkAction().questions;
    if (!targetList || targetList.length === 0) {
      alert('Tidak ada soal yang tampil atau dicentang untuk diedit massal.');
      return;
    }
    const maxEditable = 50;
    const slicedList = targetList.length > maxEditable ? targetList.slice(0, maxEditable) : targetList;
    if (targetList.length > maxEditable) {
      alert(`Untuk kenyamanan layar editor, maksimal ${maxEditable} soal dibuka sekaligus (${targetList.length - maxEditable} sisanya dapat difilter atau dicentang setelah ini).`);
    }

    bulkModalActionMode = 'edit_existing';
    if (bulkInputMode) bulkInputMode.value = 'edit_existing';

    const distinctSubjs = new Set(slicedList.map(q => (q.subject || 'Umum').trim()));
    const onlyUmum = distinctSubjs.size === 1 && Array.from(distinctSubjs)[0].toLowerCase() === 'umum';
    const singleSubj = distinctSubjs.size === 1 ? Array.from(distinctSubjs)[0] : '';

    populateBulkHeaderControls({
      subject: onlyUmum ? '' : singleSubj,
      classLevel: slicedList.every(q => (q.classLevel || 'Semua Kelas') === (slicedList[0].classLevel || 'Semua Kelas'))
        ? (slicedList[0].classLevel || 'Semua Kelas')
        : 'ALL',
      category: slicedList.every(q => Boolean(window.cbtAdmin?.isTrialQuestion?.(q)) === Boolean(window.cbtAdmin?.isTrialQuestion?.(slicedList[0])))
        ? (window.cbtAdmin?.isTrialQuestion?.(slicedList[0]) ? 'trial' : 'exam')
        : 'exam'
    });

    const applyHeaderMetaChk = document.getElementById('bulkEditApplyHeaderMeta');
    if (applyHeaderMetaChk) applyHeaderMetaChk.checked = onlyUmum;

    bulkRowsState = slicedList.map(mapQuestionToBulkEditRow);
    updateBulkModalChromeForMode();
    renderBulkQuestionRows();
    modalBulkQuestionForm.classList.remove('hidden');
  }

  function closeBulkQuestionModal() {
    if (modalBulkQuestionForm) modalBulkQuestionForm.classList.add('hidden');
    bulkModalActionMode = 'create';
  }

  if (btnOpenBulkQuestion) btnOpenBulkQuestion.addEventListener('click', () => openBulkQuestionModal());
  if (btnOpenBulkEditQuestions) btnOpenBulkEditQuestions.addEventListener('click', () => openBulkEditQuestionsModal());
  if (btnQuickBulkEditFromBar) btnQuickBulkEditFromBar.addEventListener('click', () => openBulkEditQuestionsModal());
  if (btnCloseBulkQuestionForm) btnCloseBulkQuestionForm.addEventListener('click', closeBulkQuestionModal);
  if (btnCancelBulkQuestionForm) btnCancelBulkQuestionForm.addEventListener('click', closeBulkQuestionModal);
  if (bulkInputMode) {
    bulkInputMode.addEventListener('change', () => {
      if (bulkInputMode.value === 'edit_existing') {
        if (bulkModalActionMode !== 'edit_existing') {
          openBulkEditQuestionsModal();
        }
      } else {
        if (bulkModalActionMode === 'edit_existing') {
          openBulkQuestionModal({ mode: bulkInputMode.value });
        } else {
          updateBulkModalChromeForMode();
          syncBulkModeUI();
        }
      }
    });
  }

  document.querySelectorAll('.btn-bulk-weight-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetWeight = Math.max(1, parseInt(btn.getAttribute('data-bulk-weight'), 10) || 25);
      const inp = document.getElementById('bulkDefaultWeight');
      if (inp) inp.value = String(targetWeight);
      bulkRowsState.forEach(r => { r.weight = targetWeight; });
      renderBulkQuestionRows();
    });
  });

  document.getElementById('btnBulkSyncCountAndWeight')?.addEventListener('click', () => {
    const targetCount = parseInt(document.getElementById('bulkInputCount')?.value, 10) || 5;
    const targetWeight = Math.max(1, parseInt(document.getElementById('bulkDefaultWeight')?.value, 10) || 25);
    if (bulkModalActionMode === 'create') {
      while (bulkRowsState.length < targetCount) bulkRowsState.push(createEmptyBulkRow(targetWeight));
      if (bulkRowsState.length > targetCount) bulkRowsState = bulkRowsState.slice(0, targetCount);
    }
    bulkRowsState.forEach(r => { r.weight = targetWeight; });
    renderBulkQuestionRows();
  });

  document.getElementById('btnBulkAddOneRow')?.addEventListener('click', () => {
    if (bulkModalActionMode === 'edit_existing') return;
    const w = parseInt(document.getElementById('bulkDefaultWeight')?.value, 10) || 25;
    bulkRowsState.push(createEmptyBulkRow(w));
    renderBulkQuestionRows();
  });

  const formBulkQuestions = document.getElementById('formBulkQuestions');
  if (formBulkQuestions) {
    formBulkQuestions.addEventListener('submit', (e) => {
      e.preventDefault();
      const subject = document.getElementById('bulkInputSubject')?.value.trim() || 'Umum';
      const classLevel = document.getElementById('bulkInputClassLevel')?.value || 'Semua Kelas';
      const isTrial = (document.getElementById('bulkInputCategory')?.value || 'exam') === 'trial';
      const mode = document.getElementById('bulkInputMode')?.value || 'passage';
      const passageTitle = (document.getElementById('bulkPassageTitle')?.value || '').trim();
      const passageText = (document.getElementById('bulkPassageText')?.value || '').trim();

      if (bulkModalActionMode === 'edit_existing') {
        const applyHeaderMeta = Boolean(document.getElementById('bulkEditApplyHeaderMeta')?.checked);
        const updatesList = [];
        for (let i = 0; i < bulkRowsState.length; i++) {
          const r = bulkRowsState[i];
          const qText = String(r.question || '').trim();
          if (!qText) {
            alert(`Teks pertanyaan pada Soal #${i + 1} tidak boleh kosong!`);
            return;
          }
          const upd = {
            id: r.id,
            subject: applyHeaderMeta ? subject : (r.originalSubject || subject),
            classLevel: applyHeaderMeta ? classLevel : (r.originalClassLevel || classLevel),
            isTrial: applyHeaderMeta ? isTrial : Boolean(r.originalIsTrial),
            type: r.type,
            question: qText,
            weight: r.type === 'passage' ? 0 : Math.max(1, parseInt(r.weight, 10) || 10)
          };
          if (r.type === 'passage') {
            upd.passageTitle = (r.passageTitle || '').trim();
            upd.passageText = qText;
            upd.passageSpan = Math.max(1, parseInt(r.passageSpan, 10) || 5);
            upd.passageGroupId = r.passageGroupId || `WACANA-${Date.now()}`;
            updatesList.push(upd);
            continue;
          }
          if (r.hasTable && r.tableData) upd.tableData = JSON.parse(JSON.stringify(r.tableData));
          else if (!r.hasTable) upd.removeTable = true;

          if (r.existingChartData) upd.chartData = JSON.parse(JSON.stringify(r.existingChartData));

          if (r.type === 'single' || r.type === 'multiple') {
            const hasAnyBulkOpt = [r.optA, r.optB, r.optC, r.optD].some(v => String(v || '').trim() !== '') || Boolean(r.hasOptionTables);
            if (!hasAnyBulkOpt) {
              alert(`Pilihan jawaban A–D pada item #${i + 1} masih kosong semua!\n\nJika item ini adalah Wacana / Teks Bacaan (tanpa nomor & pilihan), ubah jenisnya menjadi "📖 Wacana / Bacaan".`);
              return;
            }
          }

          if (r.type === 'single') {
            upd.options = [
              { key: 'A', text: (r.optA || '').trim() },
              { key: 'B', text: (r.optB || '').trim() },
              { key: 'C', text: (r.optC || '').trim() },
              { key: 'D', text: (r.optD || '').trim() }
            ];
            upd.correctAnswer = r.correctSingle || 'A';
          } else if (r.type === 'multiple') {
            if (!r.correctMulti || r.correctMulti.length === 0) {
              alert(`Pilih minimal 1 kunci jawaban PG Kompleks pada Soal #${i + 1}!`);
              return;
            }
            upd.options = [
              { key: 'A', text: (r.optA || '').trim() },
              { key: 'B', text: (r.optB || '').trim() },
              { key: 'C', text: (r.optC || '').trim() },
              { key: 'D', text: (r.optD || '').trim() }
            ];
            upd.correctAnswer = r.correctMulti;
          } else if (r.type === 'true_false') {
            const stmts = (r.tfStmts || [])
              .map((s, si) => ({ id: `s${si + 1}`, text: String(s.text || '').trim(), correct: s.correct === 'S' ? 'S' : 'B' }))
              .filter(s => s.text !== '');
            if (stmts.length < 2) {
              alert(`Soal #${i + 1} (Benar/Salah) harus memiliki minimal 2 pernyataan yang diisi!`);
              return;
            }
            upd.statements = stmts;
          }
          updatesList.push(upd);
        }

        const res = window.cbtAdmin.updateQuestionsBatch(updatesList);
        if (res && res.success) {
          selectedQuestionIds.clear();
          closeBulkQuestionModal();
          setupQuestionBankFilters();
          if (applyHeaderMeta) {
            const subjFilterEl = document.getElementById('filterQuestionsSubject');
            if (subjFilterEl && Array.from(subjFilterEl.options).some(o => o.value === subject)) {
              subjFilterEl.value = subject;
            }
          }
          renderAdminQuestionList();
          renderAdminSchedulesList();
          alert(`Berhasil memperbarui ${res.count} soal sekaligus!`);
        } else {
          alert(res?.message || 'Gagal memperbarui soal massal.');
        }
        return;
      }

      if (mode === 'passage' && !passageText && !passageTitle) {
        alert('Pada mode Paket Wacana / Pernyataan, harap isi Teks Wacana / Stimulus Bersama terlebih dahulu!');
        return;
      }

      const passageGroupId = mode === 'passage' ? `WACANA-${Date.now()}` : '';
      const payloadList = [];

      for (let i = 0; i < bulkRowsState.length; i++) {
        const r = bulkRowsState[i];
        const qText = String(r.question || '').trim();
        if (!qText) {
          alert(`Teks pertanyaan pada Soal #${i + 1} belum diisi!`);
          return;
        }
        const item = {
          subject,
          classLevel,
          isTrial,
          type: r.type,
          question: qText,
          weight: r.type === 'passage' ? 0 : Math.max(1, parseInt(r.weight, 10) || 10)
        };
        if (r.type === 'passage') {
          item.passageTitle = (r.passageTitle || '').trim();
          item.passageText = qText;
          item.passageSpan = Math.max(1, parseInt(r.passageSpan, 10) || 5);
          item.passageGroupId = `WACANA-${Date.now()}-${i + 1}`;
          payloadList.push(item);
          continue;
        }
        if (mode === 'passage') {
          item.passageGroupId = passageGroupId;
          item.passageTitle = passageTitle;
          item.passageText = passageText;
          item.passageOrder = i + 1;
          item.passageGroupSize = bulkRowsState.length;
        }
        if (r.hasTable && r.tableData) item.tableData = JSON.parse(JSON.stringify(r.tableData));

        if (r.type === 'single' || r.type === 'multiple') {
          const hasAnyBulkOpt = [r.optA, r.optB, r.optC, r.optD].some(v => String(v || '').trim() !== '') || Boolean(r.hasOptionTables);
          if (!hasAnyBulkOpt) {
            alert(`Pilihan jawaban A–D pada item #${i + 1} masih kosong semua!\n\nJika item ini adalah Wacana / Teks Bacaan (tanpa nomor & pilihan), ubah jenisnya menjadi "📖 Wacana / Bacaan".`);
            return;
          }
        }

        if (r.type === 'single') {
          item.options = [
            { key: 'A', text: (r.optA || '').trim() },
            { key: 'B', text: (r.optB || '').trim() },
            { key: 'C', text: (r.optC || '').trim() },
            { key: 'D', text: (r.optD || '').trim() }
          ];
          item.correctAnswer = r.correctSingle || 'A';
        } else if (r.type === 'multiple') {
          if (!r.correctMulti || r.correctMulti.length === 0) {
            alert(`Pilih minimal 1 kunci jawaban PG Kompleks pada Soal #${i + 1}!`);
            return;
          }
          item.options = [
            { key: 'A', text: (r.optA || '').trim() },
            { key: 'B', text: (r.optB || '').trim() },
            { key: 'C', text: (r.optC || '').trim() },
            { key: 'D', text: (r.optD || '').trim() }
          ];
          item.correctAnswer = r.correctMulti;
        } else if (r.type === 'true_false') {
          const stmts = (r.tfStmts || [])
            .map((s, si) => ({ id: `s${si + 1}`, text: String(s.text || '').trim(), correct: s.correct === 'S' ? 'S' : 'B' }))
            .filter(s => s.text !== '');
          if (stmts.length < 2) {
            alert(`Soal #${i + 1} (Benar/Salah) harus memiliki minimal 2 pernyataan yang diisi!`);
            return;
          }
          item.statements = stmts;
        }
        payloadList.push(item);
      }

      const finalPayloadList = (mode === 'passage' && (passageText || passageTitle))
        ? [
            {
              subject,
              classLevel,
              isTrial,
              type: 'passage',
              question: passageText || passageTitle,
              passageTitle,
              passageText,
              passageSpan: payloadList.length || bulkRowsState.length || 5,
              passageGroupId,
              weight: 0
            },
            ...payloadList
          ]
        : payloadList;

      const res = window.cbtAdmin.addQuestionsBatch(finalPayloadList);
      if (res && res.success) {
        closeBulkQuestionModal();
        setupQuestionBankFilters();
        const subjFilterEl = document.getElementById('filterQuestionsSubject');
        if (subjFilterEl && Array.from(subjFilterEl.options).some(o => o.value === subject)) {
          subjFilterEl.value = subject;
        }
        renderAdminQuestionList();
        renderAdminSchedulesList();
        alert(`Berhasil menyimpan ${res.count} soal sekaligus ke Bank Soal (${subject})!`);
      } else {
        alert(res?.message || 'Gagal menyimpan paket soal.');
      }
    });
  }

  const btnExportQuestions = document.getElementById('btnExportQuestions');
  if (btnExportQuestions) {
    btnExportQuestions.addEventListener('click', () => {
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      const catFilter = document.getElementById('filterQuestionsCategory')?.value || 'ALL';
      window.cbtAdmin.exportQuestionsJSON(subjFilter, classFilter, catFilter);
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
      const catFilter = document.getElementById('filterQuestionsCategory')?.value || 'ALL';
      const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, catFilter);
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
      const catFilter = document.getElementById('filterQuestionsCategory')?.value || 'ALL';
      const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, catFilter);
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

  const nqSubjectClassCombo = document.getElementById('nqSubjectClassCombo');
  const nqSubjectSelect = document.getElementById('nqSubjectSelect');
  const nqClassSelect = document.getElementById('nqClassSelect');
  const nqCategorySelect = document.getElementById('nqCategorySelect');

  function makeNqComboKey(subj, cls) {
    return `${String(subj || 'ALL')}|||${String(cls || 'ALL')}`;
  }

  function parseNqComboKey(keyVal) {
    const raw = String(keyVal || '');
    const sepIdx = raw.indexOf('|||');
    if (sepIdx === -1) return null;
    return {
      subject: raw.slice(0, sepIdx) || 'ALL',
      classLevel: raw.slice(sepIdx + 3) || 'ALL'
    };
  }

  function syncNqScheduleMeta() {
    if (!window.cbtAdmin) return;
    const subjVal = nqSubjectSelect ? nqSubjectSelect.value : 'ALL';
    const clsVal = nqClassSelect ? nqClassSelect.value : 'ALL';
    const examCfg = window.examEngine ? window.examEngine.config : {};
    const durInput = document.getElementById('nqDuration');
    const dateInput = document.getElementById('nqDateText');

    const allSchedules = window.cbtAdmin.getAllSchedules() || [];
    const matchingSchedule = allSchedules.find(s =>
      subjVal !== 'ALL' &&
      subjVal !== 'UMUM' &&
      window.examEngine &&
      window.examEngine.matchesSubject(s.subject, subjVal) &&
      (clsVal === 'ALL' || window.examEngine.matchesClassLevel(s.classLevel || 'Semua Kelas', clsVal))
    );

    if (durInput) {
      const mins = matchingSchedule ? (matchingSchedule.durationMinutes || 80) : (examCfg.durationMinutes || 80);
      durInput.value = `${mins} Menit`;
    }
    if (dateInput) {
      if (matchingSchedule && (matchingSchedule.day || matchingSchedule.dateFormatted || matchingSchedule.dateIso)) {
        const dStr = matchingSchedule.dateFormatted || window.cbtAdmin.formatIndonesianDate(matchingSchedule.dateIso);
        dateInput.value = [matchingSchedule.day, dStr].filter(Boolean).join(', ');
      } else {
        dateInput.value = '';
      }
    }
  }

  function populateNqDownloadSelectors(prefSubject = null, prefClass = null, prefCategory = null) {
    if (!window.cbtAdmin) return [];
    const cur = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = Boolean(cur && (cur.role === 'admin' || cur.id === 'admin'));
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(cur);
    const assignedClasses = (!isAdmin && cur && cur.classes)
      ? window.cbtAdmin.parseTeacherClasses(cur.classes)
      : [];
    const allKnownSubjects = window.cbtAdmin.getAllSubjects() || [];
    const studentClasses = window.studentManager ? window.studentManager.getAllClasses() : [];

    if (nqCategorySelect && prefCategory !== null && prefCategory !== undefined) {
      const catOpts = Array.from(nqCategorySelect.options).map(o => o.value);
      nqCategorySelect.value = catOpts.includes(prefCategory) ? prefCategory : 'ALL';
    }
    const activeCat = nqCategorySelect ? (nqCategorySelect.value || 'ALL') : 'ALL';

    const scopedAll = window.cbtAdmin.getQuestionsFiltered('ALL', 'ALL', activeCat);

    // Kumpulkan daftar mata pelajaran terurut & ter-deduplikasi sesuai cakupan akun
    const subjectNames = [];
    const pushUniqueSubj = (name) => {
      const clean = String(name || '').trim();
      if (!clean || clean.toLowerCase() === 'umum') return;
      const already = subjectNames.some(existing =>
        existing.toLowerCase() === clean.toLowerCase() ||
        (window.examEngine && window.examEngine.matchesSubject(existing, clean))
      );
      if (!already) subjectNames.push(clean);
    };

    allKnownSubjects.forEach(s => {
      if (window.cbtAdmin.getQuestionsFiltered(s, 'ALL', activeCat).length > 0) {
        pushUniqueSubj(s);
      }
    });
    scopedAll.forEach(q => {
      if (q && q.subject) pushUniqueSubj(q.subject);
    });

    const isPassageFn = (q) => Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPassageItem === 'function' && window.cbtAdmin.isPassageItem(q));
    const countScorable = (arr) => Array.isArray(arr) ? arr.filter(q => !isPassageFn(q)).length : 0;

    const scopedAllScorableCount = countScorable(scopedAll);
    const umumList = isAdmin ? window.cbtAdmin.getQuestionsFiltered('UMUM', 'ALL', activeCat) : [];
    const umumCount = isAdmin ? countScorable(umumList) : 0;

    // Susun daftar paket "Mapel per Kelas" (mis. Matematika — Kelas 7, Matematika — Kelas 8, dst.)
    const packages = [];
    const standardGrades = ['Kelas 7', 'Kelas 8', 'Kelas 9'];
    const allSchedules = window.cbtAdmin.getAllSchedules() || [];

    subjectNames.forEach(subj => {
      const subjQuestions = window.cbtAdmin.getQuestionsFiltered(subj, 'ALL', activeCat);
      if (subjQuestions.length === 0) return;
      const subjAllCount = countScorable(subjQuestions);

      const candidateClasses = [];
      const addCandidateClass = (cls) => {
        const clean = String(cls || '').trim();
        if (!clean || clean.toUpperCase() === 'ALL' || /^SEMUA(?:\s+KELAS)?$/i.test(clean)) return;
        if (!candidateClasses.some(c => c.toLowerCase() === clean.toLowerCase())) {
          candidateClasses.push(clean);
        }
      };

      standardGrades.forEach(g => addCandidateClass(g));

      // Cek apakah ada kelas spesifik di soal atau jadwal untuk mapel ini
      let hasGenericAllClassQ = false;
      subjQuestions.forEach(q => {
        const rawCls = String(q.classLevel || 'Semua Kelas').trim();
        if (!rawCls || /^SEMUA/i.test(rawCls)) {
          hasGenericAllClassQ = true;
          return;
        }
        const normStd = standardGrades.find(g => g.toLowerCase() === rawCls.toLowerCase());
        if (!normStd && !/^(7|8|9)$/.test(rawCls)) {
          // Hanya tambahkan token kelas spesifik jika belum tercakup atau merupakan kelas rombel/khusus
          rawCls.split(/[,;/]+/).forEach(part => {
            const p = part.trim();
            if (p && !/^Kelas\s*[789]$/i.test(p) && !/^[789]$/.test(p)) {
              addCandidateClass(p);
            }
          });
        }
      });

      allSchedules.forEach(sch => {
        if (window.examEngine && window.examEngine.matchesSubject(sch.subject, subj)) {
          const sCls = String(sch.classLevel || '').trim();
          if (sCls && !/^SEMUA/i.test(sCls) && !/^Kelas\s*[789]$/i.test(sCls) && !/^[789]$/.test(sCls)) {
            addCandidateClass(sCls);
          }
        }
      });

      const matchedTiersForSubj = [];
      standardGrades.forEach(g => {
        const qsGrade = window.cbtAdmin.getQuestionsFiltered(subj, g, activeCat);
        if (qsGrade.length > 0) {
          matchedTiersForSubj.push({ subject: subj, classLevel: g, count: countScorable(qsGrade), isCustomClass: false });
        }
      });

      // Tambahkan kelas non-standar (mis. X, 10A, atau 7A jika berbeda isinya dari Kelas 7 umum)
      candidateClasses.filter(c => !standardGrades.includes(c)).forEach(customCls => {
        const qsCustom = window.cbtAdmin.getQuestionsFiltered(subj, customCls, activeCat);
        if (qsCustom.length > 0) {
          const customLabel = /^Kelas\s+/i.test(customCls) ? customCls : `Kelas ${customCls}`;
          matchedTiersForSubj.push({ subject: subj, classLevel: customCls, classLabel: customLabel, count: countScorable(qsCustom), isCustomClass: true });
        }
      });

      matchedTiersForSubj.forEach(item => packages.push(item));

      if (hasGenericAllClassQ || matchedTiersForSubj.length !== 1) {
        packages.push({
          subject: subj,
          classLevel: 'ALL',
          classLabel: 'Semua Kelas',
          count: subjAllCount,
          isSubjectAllClasses: true
        });
      }
    });

    if (umumList.length > 0) {
      packages.push({
        subject: 'UMUM',
        subjectLabel: 'Umum / Soal Demo',
        classLevel: 'ALL',
        classLabel: 'Semua Kelas',
        count: umumCount
      });
    }

    // Isi dropdown Paket Mapel per Kelas (#nqSubjectClassCombo)
    if (nqSubjectClassCombo) {
      nqSubjectClassCombo.innerHTML = '';
      if (packages.length === 0) {
        const optEmpty = document.createElement('option');
        optEmpty.value = makeNqComboKey('ALL', 'ALL');
        optEmpty.innerText = 'Tidak ada soal pada kategori ini';
        nqSubjectClassCombo.appendChild(optEmpty);
      } else {
        packages.forEach(pkg => {
          const opt = document.createElement('option');
          opt.value = makeNqComboKey(pkg.subject, pkg.classLevel);
          const subText = pkg.subjectLabel || pkg.subject;
          const clsText = pkg.classLabel || pkg.classLevel;
          const prefixIcon = pkg.isSubjectAllClasses ? '📚' : '📘';
          opt.innerText = `${prefixIcon} ${subText} — ${clsText} (${pkg.count} soal)`;
          nqSubjectClassCombo.appendChild(opt);
        });
        if (scopedAll.length > 0 && (subjectNames.length > 1 || umumList.length > 0)) {
          const optAllAll = document.createElement('option');
          optAllAll.value = makeNqComboKey('ALL', 'ALL');
          optAllAll.innerText = `🗂️ Semua Mapel & Semua Kelas (${scopedAllScorableCount} soal)`;
          nqSubjectClassCombo.appendChild(optAllAll);
        }
      }
    }

    // Isi dropdown Mata Pelajaran (#nqSubjectSelect)
    if (nqSubjectSelect) {
      nqSubjectSelect.innerHTML = '';
      if (isAdmin || teacherSubjects.length !== 1) {
        const optAllSub = document.createElement('option');
        optAllSub.value = 'ALL';
        optAllSub.innerText = `Semua Mapel (${scopedAllScorableCount})`;
        nqSubjectSelect.appendChild(optAllSub);
      }
      subjectNames.forEach(s => {
        const cnt = countScorable(window.cbtAdmin.getQuestionsFiltered(s, 'ALL', activeCat));
        const opt = document.createElement('option');
        opt.value = s;
        opt.innerText = `${s} (${cnt})`;
        nqSubjectSelect.appendChild(opt);
      });
      if (umumList.length > 0) {
        const optU = document.createElement('option');
        optU.value = 'UMUM';
        optU.innerText = `Umum / Demo (${umumCount})`;
        nqSubjectSelect.appendChild(optU);
      }
    }

    // Isi dropdown Kelas (#nqClassSelect)
    if (nqClassSelect) {
      nqClassSelect.innerHTML = '';
      const optAllCls = document.createElement('option');
      optAllCls.value = 'ALL';
      optAllCls.innerText = 'Semua Kelas';
      nqClassSelect.appendChild(optAllCls);

      const seenCls = new Set(['ALL']);
      const appendClsOpt = (val, label) => {
        const clean = String(val || '').trim();
        if (!clean || seenCls.has(clean.toLowerCase())) return;
        seenCls.add(clean.toLowerCase());
        const opt = document.createElement('option');
        opt.value = clean;
        opt.innerText = label || clean;
        nqClassSelect.appendChild(opt);
      };

      if (assignedClasses.length > 0) {
        assignedClasses.forEach(c => appendClsOpt(c, /^Kelas\s+/i.test(c) ? c : `Kelas ${c}`));
      } else {
        standardGrades.forEach(g => appendClsOpt(g, g));
        studentClasses.forEach(c => appendClsOpt(c, /^Kelas\s+/i.test(c) ? c : `Kelas ${c}`));
      }
      packages.forEach(pkg => {
        if (pkg.classLevel && pkg.classLevel !== 'ALL') {
          appendClsOpt(pkg.classLevel, pkg.classLabel || pkg.classLevel);
        }
      });
    }

    // Tentukan pilihan awal yang paling tepat
    let targetSubj = prefSubject || 'ALL';
    let targetCls = prefClass || 'ALL';

    if ((!prefSubject || prefSubject === 'ALL') && (!prefClass || prefClass === 'ALL')) {
      const firstConcrete = packages.find(p => p.subject !== 'UMUM' && p.classLevel !== 'ALL') || packages[0];
      if (firstConcrete) {
        targetSubj = firstConcrete.subject;
        targetCls = firstConcrete.classLevel;
      }
    } else if (targetSubj !== 'ALL') {
      // Samakan nama kanonik jika perlu
      const matchedSub = subjectNames.find(s =>
        s.toLowerCase() === targetSubj.toLowerCase() ||
        (window.examEngine && window.examEngine.matchesSubject(s, targetSubj))
      );
      if (matchedSub) targetSubj = matchedSub;
    }

    if (nqSubjectSelect) {
      const subOpts = Array.from(nqSubjectSelect.options).map(o => o.value);
      if (subOpts.includes(targetSubj)) nqSubjectSelect.value = targetSubj;
      else if (nqSubjectSelect.options.length > 0) nqSubjectSelect.selectedIndex = 0;
    }
    if (nqClassSelect) {
      const clsOpts = Array.from(nqClassSelect.options).map(o => o.value);
      if (clsOpts.includes(targetCls)) nqClassSelect.value = targetCls;
      else nqClassSelect.value = 'ALL';
    }
    syncNqComboToSelects();
    return packages;
  }

  function syncNqComboToSelects() {
    if (!nqSubjectClassCombo) return;
    const subjVal = nqSubjectSelect ? nqSubjectSelect.value : 'ALL';
    const clsVal = nqClassSelect ? nqClassSelect.value : 'ALL';
    const desiredKey = makeNqComboKey(subjVal, clsVal);

    // Hapus opsi custom sementara jika ada
    const oldCustom = nqSubjectClassCombo.querySelector('option[data-custom-combo="1"]');
    if (oldCustom) oldCustom.remove();

    const optValues = Array.from(nqSubjectClassCombo.options).map(o => o.value);
    if (optValues.includes(desiredKey)) {
      nqSubjectClassCombo.value = desiredKey;
    } else {
      const customOpt = document.createElement('option');
      customOpt.value = desiredKey;
      customOpt.dataset.customCombo = '1';
      const subLabel = subjVal === 'ALL' ? 'Semua Mapel' : (subjVal === 'UMUM' ? 'Umum / Demo' : subjVal);
      const clsLabel = clsVal === 'ALL' ? 'Semua Kelas' : (/^Kelas\s+/i.test(clsVal) ? clsVal : `Kelas ${clsVal}`);
      const cnt = window.cbtAdmin ? window.cbtAdmin.getQuestionsFiltered(subjVal, clsVal, nqCategorySelect?.value || 'ALL').length : 0;
      customOpt.innerText = `🎯 ${subLabel} — ${clsLabel} (${cnt} soal)`;
      nqSubjectClassCombo.insertBefore(customOpt, nqSubjectClassCombo.firstChild);
      nqSubjectClassCombo.value = desiredKey;
    }
  }

  function getSelectedQuestionsAndPaperOptions() {
    const subjFilter = nqSubjectSelect?.value || document.getElementById('filterQuestionsSubject')?.value || 'ALL';
    const classFilter = nqClassSelect?.value || document.getElementById('filterQuestionsClass')?.value || 'ALL';
    const catFilter = nqCategorySelect?.value || document.getElementById('filterQuestionsCategory')?.value || 'ALL';
    const questions = window.cbtAdmin ? window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, catFilter) : [];

    const cur = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
    const examCfg = window.examEngine ? window.examEngine.config : {};
    const subjectName = (subjFilter && subjFilter !== 'ALL' && subjFilter !== 'UMUM')
      ? subjFilter
      : (subjFilter === 'UMUM'
        ? 'Umum / Soal Demo'
        : (cur && cur.role !== 'admin' && cur.subject ? cur.subject : 'Semua Mata Pelajaran'));

    const displayClass = (classFilter && classFilter !== 'ALL')
      ? (/^(7|8|9)[A-Z]?$/i.test(classFilter) && !/^Kelas\s+/i.test(classFilter) ? `Kelas ${classFilter}` : classFilter)
      : '';

    const options = {
      examTitle: document.getElementById('nqExamTitle')?.value.trim() || examCfg.examTitle || 'ASESMEN SUMATIF AKHIR SEMESTER (ASAS)',
      semester: document.getElementById('nqSemester')?.value.trim() || 'SEMESTER GANJIL',
      academicYear: document.getElementById('nqAcademicYear')?.value.trim() || '2025/2026',
      duration: document.getElementById('nqDuration')?.value.trim() || `${examCfg.durationMinutes || 80} Menit`,
      layoutCols: parseInt(document.getElementById('nqLayoutCols')?.value, 10) || 2,
      dateText: document.getElementById('nqDateText')?.value.trim() || '',
      includeAnswerKey: Boolean(document.getElementById('nqIncludeAnswerKey')?.checked),
      subject: subjectName,
      classLevel: displayClass
    };
    return { questions, options };
  }

  let lastPreviewSuspiciousWacanaIds = [];

  function refreshQuestionsPaperPreview() {
    const container = document.getElementById('questionsPaperPreviewContainer');
    const countBadge = document.getElementById('questionsPreviewCountBadge');
    const warnBanner = document.getElementById('nqSuspiciousWacanaBanner');
    const warnText = document.getElementById('nqSuspiciousWacanaText');
    const { questions, options } = getSelectedQuestionsAndPaperOptions();

    const isPassageFn = (q) => Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPassageItem === 'function' && window.cbtAdmin.isPassageItem(q));
    const isEmptyOptsFn = (q) => Boolean(window.cbtAdmin && typeof window.cbtAdmin.isEmptyOptionsQuestion === 'function' && window.cbtAdmin.isEmptyOptionsQuestion(q));
    const scorableCount = questions.filter(q => !isPassageFn(q)).length;
    const passageCount = questions.length - scorableCount;
    const suspiciousQs = questions.filter(q => isEmptyOptsFn(q));
    lastPreviewSuspiciousWacanaIds = suspiciousQs.map(q => q.id);

    if (warnBanner) {
      if (suspiciousQs.length > 0) {
        if (warnText) {
          warnText.innerText = `⚠️ Ditemukan ${suspiciousQs.length} item tanpa pilihan A–D (kemungkinan Wacana masih diberi nomor & opsi kosong).`;
        }
        warnBanner.classList.remove('hidden');
      } else {
        warnBanner.classList.add('hidden');
      }
    }

    if (countBadge) {
      const clsPart = options.classLevel ? ` • ${options.classLevel}` : ' • Semua Kelas';
      countBadge.innerText = `${scorableCount} Soal${passageCount > 0 ? ` + ${passageCount} Wacana` : ''} (${options.subject}${clsPart})`;
    }
    if (!container) return;

    if (questions.length === 0) {
      container.innerHTML = `<div class="text-center py-14 text-slate-500 font-semibold text-sm bg-white rounded-2xl border border-slate-200 px-4">Belum ada butir soal pada pilihan <strong>${options.subject}${options.classLevel ? ' — ' + options.classLevel : ''}</strong>.<br><span class="text-xs font-normal text-slate-400">Silakan pilih paket Mapel per Kelas lain pada kolom di atas.</span></div>`;
      return;
    }
    container.innerHTML = window.cbtAdmin.generateExamPaperHtml(questions, options);
  }

  const btnToggleNqSettingsPanel = document.getElementById('btnToggleNqSettingsPanel');
  const nqExtraSettingsPanel = document.getElementById('nqExtraSettingsPanel');
  if (btnToggleNqSettingsPanel && nqExtraSettingsPanel) {
    btnToggleNqSettingsPanel.addEventListener('click', () => {
      const isHidden = nqExtraSettingsPanel.classList.contains('hidden');
      if (isHidden) {
        nqExtraSettingsPanel.classList.remove('hidden');
        btnToggleNqSettingsPanel.innerHTML = '<span>⚙️ Sembunyikan Pengaturan</span>';
      } else {
        nqExtraSettingsPanel.classList.add('hidden');
        btnToggleNqSettingsPanel.innerHTML = '<span>⚙️ Tampilkan Pengaturan</span>';
      }
    });
  }

  document.getElementById('btnFixSuspiciousWacanaInPreview')?.addEventListener('click', () => {
    if (!window.cbtAdmin || lastPreviewSuspiciousWacanaIds.length === 0) return;
    const res = window.cbtAdmin.convertQuestionsBatchToPassage(lastPreviewSuspiciousWacanaIds, 5);
    if (res && res.success) {
      renderAdminQuestionList();
      renderAdminTeacherQuestionProgress();
      refreshQuestionsPaperPreview();
    }
  });

  if (nqSubjectClassCombo) {
    nqSubjectClassCombo.addEventListener('change', () => {
      const parsed = parseNqComboKey(nqSubjectClassCombo.value);
      if (parsed) {
        if (nqSubjectSelect) {
          const hasSub = Array.from(nqSubjectSelect.options).some(o => o.value === parsed.subject);
          if (hasSub) nqSubjectSelect.value = parsed.subject;
        }
        if (nqClassSelect) {
          const hasCls = Array.from(nqClassSelect.options).some(o => o.value === parsed.classLevel);
          if (hasCls) nqClassSelect.value = parsed.classLevel;
        }
      }
      syncNqScheduleMeta();
      refreshQuestionsPaperPreview();
    });
  }

  if (nqSubjectSelect) {
    nqSubjectSelect.addEventListener('change', () => {
      syncNqComboToSelects();
      syncNqScheduleMeta();
      refreshQuestionsPaperPreview();
    });
  }

  if (nqClassSelect) {
    nqClassSelect.addEventListener('change', () => {
      syncNqComboToSelects();
      syncNqScheduleMeta();
      refreshQuestionsPaperPreview();
    });
  }

  if (nqCategorySelect) {
    nqCategorySelect.addEventListener('change', () => {
      const prevSub = nqSubjectSelect?.value || 'ALL';
      const prevCls = nqClassSelect?.value || 'ALL';
      populateNqDownloadSelectors(prevSub, prevCls, nqCategorySelect.value);
      syncNqScheduleMeta();
      refreshQuestionsPaperPreview();
    });
  }

  if (btnOpenPrintQuestions) {
    btnOpenPrintQuestions.addEventListener('click', () => {
      const totalScoped = window.cbtAdmin ? window.cbtAdmin.getQuestionsFiltered('ALL', 'ALL', 'ALL').length : 0;
      if (totalScoped === 0) {
        alert("Belum ada butir soal di Bank Soal. Tambahkan atau impor soal terlebih dahulu!");
        return;
      }

      const bgSubj = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const bgClass = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      const bgCat = document.getElementById('filterQuestionsCategory')?.value || 'ALL';

      // Gunakan kategori filter latar jika masih ada soal; jika kosong fallback ke ALL agar paket tetap muncul
      const catMatches = window.cbtAdmin.getQuestionsFiltered('ALL', 'ALL', bgCat).length;
      const initialCat = catMatches > 0 ? bgCat : 'ALL';

      const examCfg = window.examEngine ? window.examEngine.config : {};
      const titleInput = document.getElementById('nqExamTitle');
      if (titleInput && examCfg.examTitle) {
        titleInput.value = examCfg.examTitle.toUpperCase();
      }

      populateNqDownloadSelectors(bgSubj, bgClass, initialCat);
      syncNqScheduleMeta();
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
            callback(trimmedCanvas.toDataURL('image/png'), cw !== w || ch !== h, {
              width: cw,
              height: ch,
              isBanner: cw >= ch * 2.2
            });
            return;
          }
        } catch (e) {}

        callback(canvas.toDataURL('image/png'), false, {
          width: w,
          height: h,
          isBanner: w >= h * 2.2
        });
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
      const cur = window.cbtAdmin.getCurrentTeacher();
      const isAdminUser = Boolean(cur && (cur.role === 'admin' || cur.id === 'admin'));
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const targetSubjArg = subjFilter && subjFilter !== 'ALL' && subjFilter !== 'UMUM' ? subjFilter : null;

      let res = window.cbtAdmin.seedTrialQuestionsForTeachers({
        onlyForCurrentTeacher: !isAdminUser,
        onlyMissingSubjects: true,
        targetSubject: targetSubjArg
      });

      if (res && res.addedCount === 0) {
        const scopeLabel = targetSubjArg
          ? `mata pelajaran "${targetSubjArg}"`
          : (isAdminUser ? 'seluruh mata pelajaran guru' : 'mata pelajaran yang Anda ampu');
        if (confirm(`Semua bank soal untuk ${scopeLabel} sudah memiliki soal.\n\nApakah Anda tetap ingin menambahkan 3 soal simulasi per mapel ke dalamnya?`)) {
          res = window.cbtAdmin.seedTrialQuestionsForTeachers({
            onlyForCurrentTeacher: !isAdminUser,
            onlyMissingSubjects: false,
            targetSubject: targetSubjArg
          });
        } else {
          return;
        }
      }

      setupQuestionBankFilters();
      renderAdminQuestionList();
      renderAdminTeacherQuestionProgress();
      renderAdminSchedulesList();
      if (res && res.addedCount > 0) {
        alert(`Berhasil menambahkan ${res.addedCount} soal simulasi (${res.affectedSubjects.length} mapel):\n• ${res.affectedSubjects.join('\n• ')}`);
      }
    });
  }

  const btnClearTrialQuestions = document.getElementById('btnClearTrialQuestions');
  if (btnClearTrialQuestions) {
    btnClearTrialQuestions.addEventListener('click', () => {
      if (!window.cbtAdmin || typeof window.cbtAdmin.clearTrialQuestions !== 'function') return;
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';

      const trialCount = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, 'trial').length;
      const examCount = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter, 'exam').length;

      if (trialCount === 0) {
        alert("Tidak ada Soal Simulasi yang ditemukan pada filter Mata Pelajaran / Kelas yang aktif.");
        return;
      }

      const subjLabel = subjFilter === 'ALL' ? 'Semua Mapel pada cakupan Anda' : subjFilter;
      const clsLabel = classFilter === 'ALL' ? 'Semua Kelas' : classFilter;
      const confirmMsg = `Hapus sekaligus ${trialCount} Soal Simulasi untuk (${subjLabel} • ${clsLabel})?\n\nTenang, ${examCount} Soal Ujian Asli lainnya tetap aman dan tidak akan terhapus.`;

      if (!confirm(confirmMsg)) return;

      const res = window.cbtAdmin.clearTrialQuestions(subjFilter, classFilter);
      setupQuestionBankFilters();
      renderAdminQuestionList();
      renderAdminTeacherQuestionProgress();
      renderAdminSchedulesList();

      if (res && res.success) {
        alert(`Berhasil menghapus ${res.deletedCount} Soal Simulasi.\nSoal Ujian Asli (${res.remainingExamCount} soal) tetap aman tersimpan.`);
      }
    });
  }

  const btnResetDefaultQuestions = document.getElementById('btnResetDefaultQuestions');
  if (btnResetDefaultQuestions) {
    btnResetDefaultQuestions.addEventListener('click', () => {
      if (confirm("Reset seluruh bank soal ke 39 soal simulasi bawaan (3 soal di setiap dari 13 mata pelajaran guru)?\n\nCatatan: Soal yang sudah ada akan diganti dengan paket soal simulasi bawaan.")) {
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
  function populateStudentRoomFilterOptions() {
    const roomFilterEl = document.getElementById('filterStudentsRoom');
    const summaryBadgeEl = document.getElementById('studentRoomSummaryBadge');
    if (!window.studentManager) return;
    const allStudents = window.studentManager.getAllStudents();
    const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
    const assignedCount = allStudents.filter(s => Boolean(s.examRoom && String(s.examRoom).trim())).length;

    if (summaryBadgeEl) {
      if (rooms.length > 0) {
        summaryBadgeEl.innerText = `🏫 ${rooms.length} Ruang Ujian (${assignedCount}/${allStudents.length} siswa ditempatkan)`;
      } else {
        summaryBadgeEl.innerText = 'Format Biodata Lengkap Kartu 9,0 x 5,3 cm • Belum diatur ruang acak';
      }
    }

    if (!roomFilterEl) return;
    const prev = roomFilterEl.value || 'ALL';
    let html = `<option value="ALL">Semua Ruang (${allStudents.length})</option>`;
    rooms.forEach(rm => {
      const members = typeof window.studentManager.getStudentsByRoom === 'function'
        ? window.studentManager.getStudentsByRoom(rm)
        : [];
      const gradeNums = [...new Set(members.map(m => {
        const gm = String(m.class || '').match(/^(VIII|VII|IX|\d+)/i);
        return gm ? gm[1].toUpperCase() : String(m.class || '');
      }).filter(Boolean))].sort().join(',');
      html += `<option value="${escapeHtmlSafe(rm)}">🏫 ${escapeHtmlSafe(rm)} (${members.length}${gradeNums ? ` • Kls ${escapeHtmlSafe(gradeNums)}` : ''})</option>`;
    });
    const unassignedCount = allStudents.length - assignedCount;
    if (unassignedCount > 0 && rooms.length > 0) {
      html += `<option value="__UNASSIGNED__">Belum Diatur Ruang (${unassignedCount})</option>`;
    }
    roomFilterEl.innerHTML = html;
    if (prev && Array.from(roomFilterEl.options).some(o => o.value === prev)) {
      roomFilterEl.value = prev;
    } else {
      roomFilterEl.value = 'ALL';
    }
  }

  function renderAdminStudentsList(searchQuery = "") {
    const tbody = document.getElementById('adminStudentsTbody');
    const badge = document.getElementById('studentCountBadge');
    if (!tbody || !window.studentManager) return;

    populateStudentRoomFilterOptions();
    const roomFilterVal = document.getElementById('filterStudentsRoom')?.value || 'ALL';

    let students = searchQuery
      ? window.studentManager.searchStudents(searchQuery)
      : window.studentManager.getAllStudents();

    if (roomFilterVal === '__UNASSIGNED__') {
      students = students.filter(s => !s.examRoom || !String(s.examRoom).trim());
    } else if (roomFilterVal !== 'ALL') {
      students = students.filter(s =>
        typeof window.studentManager.matchesRoom === 'function'
          ? window.studentManager.matchesRoom(s.examRoom, roomFilterVal)
          : String(s.examRoom || '').trim() === roomFilterVal
      );
      if (!searchQuery && typeof window.studentManager.sortRoomStudents === 'function') {
        students = window.studentManager.sortRoomStudents(students);
      }
    }

    if (badge) badge.innerText = `${window.studentManager.getStudentCount()} Siswa`;

    tbody.innerHTML = '';
    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="p-6 text-center text-slate-400">Tidak ada data siswa ditemukan.</td></tr>`;
      return;
    }

    students.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      const seatTag = Number(s.seatOrder) > 0 ? ` <span class="text-indigo-500 font-semibold">&bull; #${s.seatOrder}</span>` : '';
      const roomCellHtml = s.examRoom
        ? `<span class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px] whitespace-nowrap">🏫 ${escapeHtmlSafe(s.examRoom)}${seatTag}</span>`
        : `<span class="text-slate-400 text-[11px]">—</span>`;
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3 font-mono font-bold text-blue-700">${escapeHtmlSafe(s.nisn)}</td>
        <td class="p-3 font-semibold text-slate-800">${escapeHtmlSafe(s.name)}</td>
        <td class="p-3 text-slate-600">${escapeHtmlSafe(s.birthPlace || '-')}</td>
        <td class="p-3 text-slate-600 whitespace-nowrap">${escapeHtmlSafe(s.birthDate || '-')}</td>
        <td class="p-3 text-slate-600">${escapeHtmlSafe(s.gender || '-')}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">Kelas ${escapeHtmlSafe(s.class)}</span></td>
        <td class="p-3 text-center whitespace-nowrap">${roomCellHtml}</td>
        <td class="p-3 text-slate-600 max-w-[180px] truncate" title="${escapeHtmlSafe(s.address || '')}">${escapeHtmlSafe(s.address || '-')}</td>
        <td class="p-3 font-mono text-slate-500">${escapeHtmlSafe(s.password)}</td>
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
    applyRoleButtonPermissions();
  }

  // Modal Tambah / Edit Siswa
  const modalStudentForm = document.getElementById('modalStudentForm');
  const formStudentItem = document.getElementById('formStudentItem');
  const btnOpenAddStudent = document.getElementById('btnOpenAddStudent');
  const btnCloseStudentForm = document.getElementById('btnCloseStudentForm');
  const btnCancelStudentForm = document.getElementById('btnCancelStudentForm');

  function populateStudentRoomSuggestions() {
    const dl = document.getElementById('stuRoomSuggestions');
    if (!dl || !window.studentManager) return;
    const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
    const fallback = ['Ruang 1', 'Ruang 2', 'Ruang 3', 'Ruang 4', 'Ruang 5', 'Ruang 6', 'Ruang 7'];
    const merged = [];
    const seen = new Set();
    [...rooms, ...fallback].forEach(r => {
      const k = String(r || '').trim().toLowerCase();
      if (k && !seen.has(k)) {
        seen.add(k);
        merged.push(String(r).trim());
      }
    });
    dl.innerHTML = merged.map(r => `<option value="${escapeHtmlSafe(r)}"></option>`).join('');
  }

  function openStudentModal(student = null, prefillRoom = '') {
    if (!modalStudentForm) return;
    const titleEl = document.getElementById('modalStudentFormTitle');
    const roomInput = document.getElementById('stuInputRoom');
    const seatInput = document.getElementById('stuInputSeatOrder');
    populateStudentRoomSuggestions();
    if (student) {
      if (titleEl) titleEl.innerText = "Edit Data Siswa";
      document.getElementById('editStudentOriginalNisn').value = student.nisn;
      document.getElementById('stuInputNisn').value = student.nisn;
      document.getElementById('stuInputNisn').readOnly = true;
      document.getElementById('stuInputName').value = student.name || '';
      document.getElementById('stuInputClass').value = student.class || '9A';
      if (roomInput) roomInput.value = student.examRoom || '';
      if (seatInput) seatInput.value = Number(student.seatOrder) > 0 ? String(student.seatOrder) : '';
      document.getElementById('stuInputBirthPlace').value = student.birthPlace && student.birthPlace !== '-' ? student.birthPlace : '';
      document.getElementById('stuInputBirthDate').value = student.birthDate && student.birthDate !== '-' ? student.birthDate : '';
      document.getElementById('stuInputGender').value = student.gender || 'Laki-laki';
      document.getElementById('stuInputPassword').value = student.password || '123';
      document.getElementById('stuInputAddress').value = student.address && student.address !== '-' ? student.address : '';
    } else {
      if (titleEl) titleEl.innerText = "Tambah Data Siswa Baru";
      document.getElementById('editStudentOriginalNisn').value = '';
      document.getElementById('stuInputNisn').value = '';
      document.getElementById('stuInputNisn').readOnly = false;
      document.getElementById('stuInputName').value = '';
      document.getElementById('stuInputClass').value = '9A';
      if (roomInput) roomInput.value = prefillRoom ? String(prefillRoom).trim() : '';
      if (seatInput) seatInput.value = '';
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

  // Modal Atur & Acak Ruang Ujian Lintas Kelas (7-8-9), Kuota Khusus, & Manual
  const modalAssignExamRooms = document.getElementById('modalAssignExamRooms');
  const formAssignExamRooms = document.getElementById('formAssignExamRooms');
  const btnOpenAssignExamRooms = document.getElementById('btnOpenAssignExamRooms');
  const btnCloseAssignExamRooms = document.getElementById('btnCloseAssignExamRooms');
  const btnCancelAssignExamRooms = document.getElementById('btnCancelAssignExamRooms');
  const btnCloseAssignRoomExcelFooter = document.getElementById('btnCloseAssignRoomExcelFooter');
  const btnCloseAssignRoomManualFooter = document.getElementById('btnCloseAssignRoomManualFooter');
  const tabBtnAssignRoomAuto = document.getElementById('tabBtnAssignRoomAuto');
  const tabBtnAssignRoomExcel = document.getElementById('tabBtnAssignRoomExcel');
  const tabBtnAssignRoomManual = document.getElementById('tabBtnAssignRoomManual');
  const panelAssignRoomAuto = document.getElementById('panelAssignRoomAuto');
  const panelAssignRoomExcel = document.getElementById('panelAssignRoomExcel');
  const panelAssignRoomManual = document.getElementById('panelAssignRoomManual');
  const assignRoomMode = document.getElementById('assignRoomMode');
  const assignRoomOptionsWrap = document.getElementById('assignRoomOptionsWrap');
  const assignRoomCount = document.getElementById('assignRoomCount');
  const assignRoomPrefix = document.getElementById('assignRoomPrefix');
  const assignUseCustomCapacities = document.getElementById('assignUseCustomCapacities');
  const assignCustomCapacitiesWrap = document.getElementById('assignCustomCapacitiesWrap');
  const assignCustomCapacitiesGrid = document.getElementById('assignCustomCapacitiesGrid');
  const assignCustomCapacityTotalBadge = document.getElementById('assignCustomCapacityTotalBadge');
  const btnPresetSchoolCapacities = document.getElementById('btnPresetSchoolCapacities');
  const btnEqualizeCapacities = document.getElementById('btnEqualizeCapacities');
  const assignExcelRoomCount = document.getElementById('assignExcelRoomCount');
  const assignExcelRoomPrefix = document.getElementById('assignExcelRoomPrefix');
  const assignExcelCustomQuotaHint = document.getElementById('assignExcelCustomQuotaHint');
  const assignExamRoomsPreview = document.getElementById('assignExamRoomsPreview');
  const btnSubmitAssignExamRooms = document.getElementById('btnSubmitAssignExamRooms');
  const btnDownloadRoomTemplate = document.getElementById('btnDownloadRoomTemplate');
  const btnDownloadShuffledRoomTemplate = document.getElementById('btnDownloadShuffledRoomTemplate');
  const btnTriggerImportRoomExcel = document.getElementById('btnTriggerImportRoomExcel');
  const fileImportRoomExcel = document.getElementById('fileImportRoomExcel');
  const assignRoomExcelFeedback = document.getElementById('assignRoomExcelFeedback');

  // Kontrol Tab 3 Manual
  const assignManualTargetRoom = document.getElementById('assignManualTargetRoom');
  const btnAddManualNewRoom = document.getElementById('btnAddManualNewRoom');
  const assignManualNewRoomBox = document.getElementById('assignManualNewRoomBox');
  const assignManualNewRoomName = document.getElementById('assignManualNewRoomName');
  const btnConfirmManualNewRoom = document.getElementById('btnConfirmManualNewRoom');
  const btnManualCreateStudentInRoom = document.getElementById('btnManualCreateStudentInRoom');
  const assignManualCurrentCountBadge = document.getElementById('assignManualCurrentCountBadge');
  const assignManualCurrentList = document.getElementById('assignManualCurrentList');
  const assignManualOnlyUnassigned = document.getElementById('assignManualOnlyUnassigned');
  const assignManualSearch = document.getElementById('assignManualSearch');
  const assignManualClassFilter = document.getElementById('assignManualClassFilter');
  const assignManualPoolList = document.getElementById('assignManualPoolList');
  const btnSelectAllManualPool = document.getElementById('btnSelectAllManualPool');
  const btnAssignManualChecked = document.getElementById('btnAssignManualChecked');

  const ROOM_CAPACITIES_STORAGE_KEY = 'cbt_room_capacities_cfg';
  const SCHOOL_PRESET_7_CAPACITIES = [32, 32, 40, 40, 38, 34, 34];
  let customRoomCapacitiesState = [];
  let manualExtraRoomNames = [];

  function saveCustomCapacitiesConfig(enabled, capacities) {
    try {
      localStorage.setItem(ROOM_CAPACITIES_STORAGE_KEY, JSON.stringify({
        enabled: Boolean(enabled),
        capacities: Array.isArray(capacities) ? capacities.map(n => Math.max(0, parseInt(n, 10) || 0)) : []
      }));
    } catch (_) {}
  }

  function loadCustomCapacitiesConfig() {
    try {
      const raw = localStorage.getItem(ROOM_CAPACITIES_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.capacities)) {
        return { enabled: Boolean(parsed.enabled), capacities: parsed.capacities };
      }
    } catch (_) {}
    return null;
  }

  function buildEqualizedCapacities(totalStudents, roomCount) {
    const count = Math.max(1, Math.min(50, roomCount));
    const total = Math.max(0, totalStudents);
    const base = Math.floor(total / count);
    const rem = total % count;
    return Array.from({ length: count }, (_, idx) => base + (idx < rem ? 1 : 0));
  }

  function syncCustomCapacitiesArray(count, totalStudents, forceEqualize = false) {
    const safeCount = Math.max(1, Math.min(50, parseInt(count, 10) || 7));
    if (forceEqualize || customRoomCapacitiesState.length === 0) {
      customRoomCapacitiesState = buildEqualizedCapacities(totalStudents, safeCount);
    } else if (customRoomCapacitiesState.length !== safeCount) {
      const defaults = buildEqualizedCapacities(totalStudents, safeCount);
      const next = [];
      for (let i = 0; i < safeCount; i++) {
        next.push(i < customRoomCapacitiesState.length ? (parseInt(customRoomCapacitiesState[i], 10) || 0) : defaults[i]);
      }
      customRoomCapacitiesState = next;
    }
    renderCustomCapacitiesInputs();
  }

  function updateCustomCapacityTotalBadge() {
    const totalStudents = window.studentManager ? window.studentManager.getStudentCount() : 0;
    const sum = customRoomCapacitiesState.reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
    if (assignCustomCapacityTotalBadge) {
      const isExact = sum === totalStudents;
      assignCustomCapacityTotalBadge.className = isExact
        ? 'font-bold text-emerald-700'
        : 'font-bold text-amber-700';
      assignCustomCapacityTotalBadge.textContent = isExact
        ? `Total Kuota: ${sum} / ${totalStudents} siswa (Pas ✓)`
        : `Total Kuota: ${sum} / ${totalStudents} siswa (${sum < totalStudents ? `Kurang ${totalStudents - sum}` : `Lebih ${sum - totalStudents}`})`;
    }
    if (assignExcelCustomQuotaHint) {
      const isEnabled = Boolean(assignUseCustomCapacities && assignUseCustomCapacities.checked);
      if (isEnabled && customRoomCapacitiesState.length > 0) {
        const prefix = (assignExcelRoomPrefix ? assignExcelRoomPrefix.value.trim() : '') || 'Ruang';
        const txt = customRoomCapacitiesState.map((c, idx) => `${prefix} ${idx + 1}: ${c}`).join(', ');
        assignExcelCustomQuotaHint.textContent = `🎯 Kuota per ruang aktif (${txt}) — ikut dipakai saat "Unduh Sudah Diacak di Excel".`;
        assignExcelCustomQuotaHint.classList.remove('hidden');
      } else {
        assignExcelCustomQuotaHint.classList.add('hidden');
      }
    }
  }

  function renderCustomCapacitiesInputs() {
    const isEnabled = Boolean(assignUseCustomCapacities && assignUseCustomCapacities.checked);
    if (assignCustomCapacitiesWrap) {
      assignCustomCapacitiesWrap.classList.toggle('hidden', !isEnabled);
    }
    if (!assignCustomCapacitiesGrid) {
      updateCustomCapacityTotalBadge();
      return;
    }
    const prefix = (assignRoomPrefix ? assignRoomPrefix.value.trim() : '') || 'Ruang';
    assignCustomCapacitiesGrid.innerHTML = customRoomCapacitiesState.map((cap, idx) => `
      <div class="p-2 rounded-xl bg-white border border-violet-200 flex items-center justify-between gap-1.5">
        <label class="text-[11px] font-bold text-slate-700 truncate" for="customCapInput_${idx}">${escapeHtmlSafe(prefix)} ${idx + 1}</label>
        <input type="number" id="customCapInput_${idx}" data-cap-idx="${idx}" min="0" max="200" value="${cap}" class="w-14 px-1.5 py-1 rounded-lg border border-slate-300 text-center font-bold text-indigo-700 text-xs outline-none focus:ring-2 focus:ring-violet-500">
      </div>
    `).join('');

    assignCustomCapacitiesGrid.querySelectorAll('input[data-cap-idx]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.getAttribute('data-cap-idx'), 10);
        const val = Math.max(0, Math.min(200, parseInt(inp.value, 10) || 0));
        if (!Number.isNaN(idx) && idx >= 0 && idx < customRoomCapacitiesState.length) {
          customRoomCapacitiesState[idx] = val;
          saveCustomCapacitiesConfig(assignUseCustomCapacities ? assignUseCustomCapacities.checked : false, customRoomCapacitiesState);
          updateCustomCapacityTotalBadge();
          updateAssignExamRoomsPreview();
        }
      });
    });

    updateCustomCapacityTotalBadge();
  }

  function getActiveRoomCapacities() {
    if (!assignUseCustomCapacities || !assignUseCustomCapacities.checked) return null;
    const rCount = Math.max(1, Math.min(50, parseInt(assignRoomCount ? assignRoomCount.value : '7', 10) || 7));
    if (customRoomCapacitiesState.length !== rCount) {
      syncCustomCapacitiesArray(rCount, window.studentManager ? window.studentManager.getStudentCount() : 0);
    }
    return customRoomCapacitiesState.slice(0, rCount);
  }

  function populateManualRoomDropdown(preferredRoom = null) {
    if (!assignManualTargetRoom || !window.studentManager) return;
    const existingRooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
    const defaults = ['Ruang 1', 'Ruang 2', 'Ruang 3', 'Ruang 4', 'Ruang 5', 'Ruang 6', 'Ruang 7'];
    const map = new Map();
    [...existingRooms, ...manualExtraRoomNames, ...defaults].forEach(r => {
      const disp = String(r || '').trim();
      const key = disp.toLowerCase().replace(/\s+/g, ' ');
      if (disp && !map.has(key)) map.set(key, disp);
    });
    const list = Array.from(map.values()).sort((a, b) => window.studentManager.compareRoomNames(a, b));
    const currentVal = preferredRoom || assignManualTargetRoom.value;
    assignManualTargetRoom.innerHTML = list.map(rm => {
      const count = window.studentManager.getStudentsByRoom(rm).length;
      return `<option value="${escapeHtmlSafe(rm)}">${escapeHtmlSafe(rm)} (${count} siswa)</option>`;
    }).join('');
    if (currentVal && list.some(r => window.studentManager.matchesRoom(r, currentVal))) {
      const matched = list.find(r => window.studentManager.matchesRoom(r, currentVal));
      assignManualTargetRoom.value = matched;
    } else if (list.length > 0) {
      assignManualTargetRoom.value = list[0];
    }
  }

  function renderManualRoomPanel(preferredRoom = null) {
    if (!window.studentManager || !panelAssignRoomManual) return;
    populateManualRoomDropdown(preferredRoom);
    const targetRoom = assignManualTargetRoom ? assignManualTargetRoom.value : 'Ruang 1';

    if (assignManualClassFilter) {
      const classes = window.studentManager.getAllClasses();
      const prevCls = assignManualClassFilter.value || 'ALL';
      assignManualClassFilter.innerHTML = `<option value="ALL">Semua Kelas</option>` +
        classes.map(c => `<option value="${escapeHtmlSafe(c)}">Kelas ${escapeHtmlSafe(c)}</option>`).join('');
      if ([...assignManualClassFilter.options].some(o => o.value === prevCls)) {
        assignManualClassFilter.value = prevCls;
      }
    }

    const currentMembers = targetRoom ? window.studentManager.getStudentsByRoom(targetRoom) : [];
    if (assignManualCurrentCountBadge) {
      assignManualCurrentCountBadge.textContent = `${currentMembers.length} Peserta`;
    }
    if (assignManualCurrentList) {
      if (currentMembers.length === 0) {
        assignManualCurrentList.innerHTML = `<div class="p-3 text-center text-slate-400 text-[11px]">Belum ada peserta di ${escapeHtmlSafe(targetRoom)}. Pilih peserta di bawah atau klik "Tambah Siswa Baru ke Ruang Ini".</div>`;
      } else {
        assignManualCurrentList.innerHTML = currentMembers.map((stu, idx) => {
          const seatNo = Number(stu.seatOrder) > 0 ? stu.seatOrder : (idx + 1);
          return `
            <div class="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] hover:bg-slate-50">
              <div class="flex items-center gap-2 min-w-0">
                <span class="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-[10px]">#${seatNo}</span>
                <span class="font-bold text-slate-800 truncate">${escapeHtmlSafe(stu.name)}</span>
                <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">${escapeHtmlSafe(stu.class)}</span>
                <span class="text-slate-400 font-mono text-[10px] hidden sm:inline">${escapeHtmlSafe(stu.nisn)}</span>
              </div>
              <button type="button" data-remove-nisn="${escapeHtmlSafe(stu.nisn)}" class="px-2 py-0.5 rounded-lg text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer shrink-0">
                Keluarkan
              </button>
            </div>
          `;
        }).join('');

        assignManualCurrentList.querySelectorAll('button[data-remove-nisn]').forEach(btn => {
          btn.addEventListener('click', () => {
            const nisn = btn.getAttribute('data-remove-nisn');
            if (!nisn || typeof window.studentManager.removeStudentsFromRoom !== 'function') return;
            window.studentManager.removeStudentsFromRoom([nisn]);
            renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
            setupMonitoringControls();
            updateAssignExamRoomsPreview();
            renderManualRoomPanel(targetRoom);
          });
        });
      }
    }

    if (assignManualPoolList) {
      const q = (assignManualSearch ? assignManualSearch.value : '').trim().toLowerCase();
      const clsFilter = assignManualClassFilter ? assignManualClassFilter.value : 'ALL';
      const onlyUnassigned = Boolean(assignManualOnlyUnassigned && assignManualOnlyUnassigned.checked);
      const allStudents = window.studentManager.getAllStudents();
      const pool = allStudents.filter(stu => {
        if (window.studentManager.matchesRoom(stu.examRoom, targetRoom)) return false;
        if (onlyUnassigned && stu.examRoom) return false;
        if (clsFilter !== 'ALL' && String(stu.class || '').trim().toUpperCase() !== clsFilter.toUpperCase()) return false;
        if (q) {
          const hay = `${stu.name || ''} ${stu.nisn || ''} ${stu.class || ''} ${stu.examRoom || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }).sort((a, b) => window.studentManager.compareClassNames(a.class, b.class) || String(a.name || '').localeCompare(String(b.name || ''), 'id'));

      if (pool.length === 0) {
        assignManualPoolList.innerHTML = `<div class="p-3 text-center text-slate-400 text-[11px]">Tidak ada siswa lain yang cocok dengan filter ini.</div>`;
      } else {
        assignManualPoolList.innerHTML = pool.slice(0, 150).map(stu => `
          <label class="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] hover:bg-emerald-50/50 cursor-pointer">
            <span class="flex items-center gap-2 min-w-0">
              <input type="checkbox" class="manual-pool-chk w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 cursor-pointer" value="${escapeHtmlSafe(stu.nisn)}">
              <span class="font-bold text-slate-800 truncate">${escapeHtmlSafe(stu.name)}</span>
              <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">${escapeHtmlSafe(stu.class)}</span>
              <span class="text-slate-400 font-mono text-[10px] hidden sm:inline">${escapeHtmlSafe(stu.nisn)}</span>
            </span>
            <span class="text-[10px] font-semibold ${stu.examRoom ? 'text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded' : 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded'} shrink-0">
              ${stu.examRoom ? escapeHtmlSafe(stu.examRoom) : 'Belum ada ruang'}
            </span>
          </label>
        `).join('') + (pool.length > 150 ? `<div class="p-2 text-center text-[10px] text-slate-400">Menampilkan 150 dari ${pool.length} siswa. Gunakan pencarian untuk mempersempit.</div>` : '');
      }
    }
  }

  if (formStudentItem) {
    formStudentItem.addEventListener('submit', (e) => {
      e.preventDefault();
      const origNisn = document.getElementById('editStudentOriginalNisn').value;
      const roomInput = document.getElementById('stuInputRoom');
      const seatInput = document.getElementById('stuInputSeatOrder');
      const payload = {
        nisn: document.getElementById('stuInputNisn').value.trim(),
        name: document.getElementById('stuInputName').value.trim(),
        class: document.getElementById('stuInputClass').value.trim(),
        examRoom: roomInput ? roomInput.value.trim() : '',
        seatOrder: seatInput ? (parseInt(seatInput.value, 10) || 0) : 0,
        birthPlace: document.getElementById('stuInputBirthPlace').value.trim() || '-',
        birthDate: document.getElementById('stuInputBirthDate').value.trim() || '-',
        gender: document.getElementById('stuInputGender').value,
        password: document.getElementById('stuInputPassword').value.trim() || '123',
        address: document.getElementById('stuInputAddress').value.trim() || '-'
      };

      const res = origNisn
        ? window.studentManager.updateStudentProfile(origNisn, payload)
        : window.studentManager.addStudent(payload);

      if (res.success) {
        modalStudentForm.classList.add('hidden');
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
        setupSubjectAndClassFilters();
        setupMonitoringControls();
        if (modalAssignExamRooms && !modalAssignExamRooms.classList.contains('hidden')) {
          if (payload.examRoom && !manualExtraRoomNames.includes(payload.examRoom)) {
            manualExtraRoomNames.push(payload.examRoom);
          }
          renderManualRoomPanel(payload.examRoom || null);
          updateAssignExamRoomsPreview();
        }
        if (modalRoomDocsStudio && !modalRoomDocsStudio.classList.contains('hidden')) {
          openRoomDocsModal(payload.examRoom ? `ROOM:${payload.examRoom}` : (roomDocClassFilter?.value || null), activeRoomDocMode);
        }
      } else {
        alert(res.message);
      }
    });
  }

  function switchAssignRoomTab(activeTab = 'auto') {
    const mode = activeTab === 'excel' || activeTab === 'manual' ? activeTab : 'auto';
    if (panelAssignRoomAuto) panelAssignRoomAuto.classList.toggle('hidden', mode !== 'auto');
    if (panelAssignRoomExcel) panelAssignRoomExcel.classList.toggle('hidden', mode !== 'excel');
    if (panelAssignRoomManual) panelAssignRoomManual.classList.toggle('hidden', mode !== 'manual');

    const activeCls = 'py-2 px-2.5 rounded-xl text-[11.5px] sm:text-xs font-bold bg-white text-indigo-700 shadow-xs border border-indigo-200 cursor-pointer transition';
    const inactiveCls = 'py-2 px-2.5 rounded-xl text-[11.5px] sm:text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer transition';
    if (tabBtnAssignRoomAuto) tabBtnAssignRoomAuto.className = mode === 'auto' ? activeCls : inactiveCls;
    if (tabBtnAssignRoomExcel) tabBtnAssignRoomExcel.className = mode === 'excel' ? activeCls : inactiveCls;
    if (tabBtnAssignRoomManual) tabBtnAssignRoomManual.className = mode === 'manual' ? activeCls : inactiveCls;

    if (mode === 'manual') renderManualRoomPanel();
    if (mode === 'excel') updateCustomCapacityTotalBadge();
  }

  function showAssignRoomExcelFeedback(html, isSuccess = true) {
    if (!assignRoomExcelFeedback) return;
    assignRoomExcelFeedback.className = isSuccess
      ? 'p-3 rounded-xl text-[11px] leading-relaxed bg-emerald-100/80 border border-emerald-300 text-emerald-950'
      : 'p-3 rounded-xl text-[11px] leading-relaxed bg-rose-50 border border-rose-300 text-rose-900';
    assignRoomExcelFeedback.innerHTML = html;
    assignRoomExcelFeedback.classList.remove('hidden');
  }

  function updateAssignExamRoomsPreview() {
    if (!assignExamRoomsPreview || !window.studentManager) return;
    const allStudents = window.studentManager.getAllStudents();
    const mode = assignRoomMode ? assignRoomMode.value : 'mixed_random';
    if (assignRoomOptionsWrap) {
      if (mode === 'clear') assignRoomOptionsWrap.classList.add('hidden');
      else assignRoomOptionsWrap.classList.remove('hidden');
    }
    if (btnSubmitAssignExamRooms) {
      btnSubmitAssignExamRooms.disabled = allStudents.length === 0;
      btnSubmitAssignExamRooms.classList.toggle('opacity-50', allStudents.length === 0);
      btnSubmitAssignExamRooms.textContent = mode === 'clear' ? '🧹 Kosongkan Ruang Ujian' : '✅ Acak & Simpan Ruang';
    }

    if (allStudents.length === 0) {
      assignExamRoomsPreview.innerHTML = '<span class="text-amber-800 font-semibold">Belum ada data siswa.</span> Silakan impor data siswa lengkap terlebih dahulu, atau gunakan tab <strong>3. Tambah / Atur Manual</strong>.';
      return;
    }
    if (mode === 'clear') {
      assignExamRoomsPreview.innerHTML = `<strong>🧹 Kosongkan Ruang Ujian:</strong> Ruang ujian seluruh <strong>${allStudents.length} siswa</strong> akan dikosongkan agar kembali tampil per kelas asli (7A, 8B, dst).`;
      return;
    }

    const rCount = Math.max(1, Math.min(50, parseInt(assignRoomCount ? assignRoomCount.value : '7', 10) || 7));
    const rPrefix = (assignRoomPrefix ? assignRoomPrefix.value.trim() : '') || 'Ruang';
    const activeCaps = getActiveRoomCapacities();

    const preview = typeof window.studentManager.previewExamRoomsAllocation === 'function'
      ? window.studentManager.previewExamRoomsAllocation({ mode, roomCount: rCount, roomPrefix: rPrefix, roomCapacities: activeCaps })
      : null;

    const roomsSummary = preview && Array.isArray(preview.roomsSummary) ? preview.roomsSummary : [];
    const basePerRoom = Math.floor(allStudents.length / rCount);
    const extra = allStudents.length % rCount;
    const sizeRange = activeCaps
      ? `${Math.min(...(preview.effectiveCapacities || [0]))}–${Math.max(...(preview.effectiveCapacities || [0]))}`
      : (extra > 0 ? `${basePerRoom}–${basePerRoom + 1}` : `${basePerRoom}`);

    const headerLine = mode === 'mixed_random'
      ? `<div><strong>📊 Hasil Perkiraan:</strong> <strong>${allStudents.length} siswa</strong> dibagi ke <strong>${escapeHtmlSafe(rPrefix)} 1</strong> s.d. <strong>${escapeHtmlSafe(rPrefix)} ${rCount}</strong> (<strong>${sizeRange} siswa/ruang</strong>).</div>`
      : `<div><strong>📋 Hasil Perkiraan:</strong> <strong>${allStudents.length} siswa</strong> diurutkan per kelas lalu dibagi ke <strong>${escapeHtmlSafe(rPrefix)} 1</strong> s.d. <strong>${escapeHtmlSafe(rPrefix)} ${rCount}</strong> (<strong>${sizeRange} siswa/ruang</strong>).</div>`;

    const visibleRooms = roomsSummary.slice(0, 14);
    const firstRoomSamples = visibleRooms[0] && Array.isArray(visibleRooms[0].sampleSeats) ? visibleRooms[0].sampleSeats : [];
    const sampleSeatHtml = mode === 'mixed_random' && firstRoomSamples.length > 0
      ? `<div class="mt-2 px-2.5 py-1.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-[10.5px] text-indigo-950">
          <span class="font-bold">🪑 Contoh Urutan Duduk ${escapeHtmlSafe(visibleRooms[0].room)} (Daftar Hadir):</span>
          ${firstRoomSamples.map(item => `<span class="inline-block ml-1 px-1.5 py-0.5 rounded bg-white border border-indigo-200 font-semibold">${item.seatOrder}. ${escapeHtmlSafe(item.class)}</span>`).join('')}
        </div>`
      : '';
    const requestedSum = Array.isArray(activeCaps) ? activeCaps.reduce((a, b) => a + (parseInt(b, 10) || 0), 0) : allStudents.length;
    const quotaDiffNote = Array.isArray(activeCaps) && requestedSum !== allStudents.length
      ? (allStudents.length < requestedSum
          ? `<div class="mt-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[10.5px] text-amber-900">📌 <strong>Kekurangan ${requestedSum - allStudents.length} siswa</strong> dari target kuota ${requestedSum} kursi dibiarkan sebagai slot kosong di ruang akhir — nanti saat siswa baru diinput manual, tinggal masukkan ke ruang tersebut.</div>`
          : `<div class="mt-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[10.5px] text-amber-900">📌 Terdapat <strong>${allStudents.length - requestedSum} siswa tambahan</strong> di atas total kuota ${requestedSum} kursi (otomatis dimasukkan ke ruang akhir, atau sesuaikan angka kuota tiap ruang).</div>`)
      : '';
    const roomChipsHtml = visibleRooms.length > 0
      ? `<div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">${visibleRooms.map((item, rIdx) => {
          const grades = Object.entries(item.gradeCounts || {}).map(([g, n]) => `${escapeHtmlSafe(g)}: <strong>${n}</strong>`).join(', ');
          const targetCap = Array.isArray(activeCaps) && activeCaps[rIdx] !== undefined ? activeCaps[rIdx] : item.total;
          const capLabel = Array.isArray(activeCaps) && targetCap !== item.total
            ? `${item.total} / kuota ${targetCap}`
            : `${item.total}`;
          return `<div class="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-[10.5px]">
            <span class="font-bold text-indigo-800 whitespace-nowrap">${escapeHtmlSafe(item.room)} (${capLabel})</span>
            <span class="text-slate-600 truncate">${grades}</span>
          </div>`;
        }).join('')}</div>${roomsSummary.length > 14 ? `<div class="mt-1 text-[10px] text-slate-500">...dan ${roomsSummary.length - 14} ruang lainnya.</div>` : ''}${quotaDiffNote}${sampleSeatHtml}`
      : '';

    assignExamRoomsPreview.innerHTML = `${headerLine}${roomChipsHtml}`;
  }

  function closeAssignExamRoomsModal() {
    if (modalAssignExamRooms) modalAssignExamRooms.classList.add('hidden');
  }

  if (tabBtnAssignRoomAuto) tabBtnAssignRoomAuto.addEventListener('click', () => switchAssignRoomTab('auto'));
  if (tabBtnAssignRoomExcel) tabBtnAssignRoomExcel.addEventListener('click', () => switchAssignRoomTab('excel'));
  if (tabBtnAssignRoomManual) tabBtnAssignRoomManual.addEventListener('click', () => switchAssignRoomTab('manual'));

  if (assignUseCustomCapacities) {
    assignUseCustomCapacities.addEventListener('change', () => {
      const rCount = Math.max(1, Math.min(50, parseInt(assignRoomCount ? assignRoomCount.value : '7', 10) || 7));
      const totalStu = window.studentManager ? window.studentManager.getStudentCount() : 0;
      syncCustomCapacitiesArray(rCount, totalStu, customRoomCapacitiesState.length === 0);
      saveCustomCapacitiesConfig(assignUseCustomCapacities.checked, customRoomCapacitiesState);
      updateAssignExamRoomsPreview();
    });
  }

  if (btnPresetSchoolCapacities) {
    btnPresetSchoolCapacities.addEventListener('click', () => {
      if (assignUseCustomCapacities) assignUseCustomCapacities.checked = true;
      if (assignRoomCount) assignRoomCount.value = '7';
      if (assignExcelRoomCount) assignExcelRoomCount.value = '7';
      customRoomCapacitiesState = [...SCHOOL_PRESET_7_CAPACITIES];
      saveCustomCapacitiesConfig(true, customRoomCapacitiesState);
      renderCustomCapacitiesInputs();
      updateAssignExamRoomsPreview();
    });
  }

  if (btnEqualizeCapacities) {
    btnEqualizeCapacities.addEventListener('click', () => {
      const rCount = Math.max(1, Math.min(50, parseInt(assignRoomCount ? assignRoomCount.value : '7', 10) || 7));
      const totalStu = window.studentManager ? window.studentManager.getStudentCount() : 0;
      syncCustomCapacitiesArray(rCount, totalStu, true);
      saveCustomCapacitiesConfig(assignUseCustomCapacities ? assignUseCustomCapacities.checked : false, customRoomCapacitiesState);
      updateAssignExamRoomsPreview();
    });
  }

  if (assignManualTargetRoom) {
    assignManualTargetRoom.addEventListener('change', () => renderManualRoomPanel(assignManualTargetRoom.value));
  }
  if (assignManualSearch) {
    assignManualSearch.addEventListener('input', () => renderManualRoomPanel());
  }
  if (assignManualClassFilter) {
    assignManualClassFilter.addEventListener('change', () => renderManualRoomPanel());
  }
  if (assignManualOnlyUnassigned) {
    assignManualOnlyUnassigned.addEventListener('change', () => renderManualRoomPanel());
  }
  if (btnAddManualNewRoom && assignManualNewRoomBox) {
    btnAddManualNewRoom.addEventListener('click', () => {
      assignManualNewRoomBox.classList.toggle('hidden');
      if (!assignManualNewRoomBox.classList.contains('hidden') && assignManualNewRoomName) {
        const existingRooms = window.studentManager ? window.studentManager.getAllRooms() : [];
        assignManualNewRoomName.value = `Ruang ${existingRooms.length + 1}`;
        assignManualNewRoomName.focus();
      }
    });
  }
  if (btnConfirmManualNewRoom && assignManualNewRoomName) {
    btnConfirmManualNewRoom.addEventListener('click', () => {
      const val = assignManualNewRoomName.value.trim();
      if (!val) return;
      if (!manualExtraRoomNames.some(r => r.toLowerCase() === val.toLowerCase())) {
        manualExtraRoomNames.push(val);
      }
      if (assignManualNewRoomBox) assignManualNewRoomBox.classList.add('hidden');
      renderManualRoomPanel(val);
    });
  }
  if (btnManualCreateStudentInRoom) {
    btnManualCreateStudentInRoom.addEventListener('click', () => {
      const targetRoom = assignManualTargetRoom ? assignManualTargetRoom.value : 'Ruang 1';
      openStudentModal(null, targetRoom);
    });
  }
  if (btnSelectAllManualPool && assignManualPoolList) {
    btnSelectAllManualPool.addEventListener('click', () => {
      const chks = Array.from(assignManualPoolList.querySelectorAll('.manual-pool-chk'));
      if (chks.length === 0) return;
      const allChecked = chks.every(c => c.checked);
      chks.forEach(c => { c.checked = !allChecked; });
    });
  }
  if (btnAssignManualChecked && assignManualPoolList) {
    btnAssignManualChecked.addEventListener('click', () => {
      if (!window.studentManager || typeof window.studentManager.assignStudentsManualToRoom !== 'function') return;
      const targetRoom = assignManualTargetRoom ? assignManualTargetRoom.value : 'Ruang 1';
      const checkedNisns = Array.from(assignManualPoolList.querySelectorAll('.manual-pool-chk:checked')).map(c => c.value);
      const res = window.studentManager.assignStudentsManualToRoom({ roomName: targetRoom, nisns: checkedNisns, interleave: true });
      if (!res || !res.success) {
        alert((res && res.message) || 'Pilih minimal 1 peserta terlebih dahulu.');
        return;
      }
      renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
      setupMonitoringControls();
      updateAssignExamRoomsPreview();
      renderManualRoomPanel(res.roomName || targetRoom);
    });
  }

  if (btnOpenAssignExamRooms && modalAssignExamRooms) {
    btnOpenAssignExamRooms.addEventListener('click', () => {
      if (!window.studentManager) return;
      const totalStu = window.studentManager.getStudentCount();
      const savedCfg = loadCustomCapacitiesConfig();
      const useCfg = savedCfg && Array.isArray(savedCfg.capacities) && savedCfg.capacities.length > 0
        ? savedCfg
        : { enabled: true, capacities: [...SCHOOL_PRESET_7_CAPACITIES] };
      const suggestedCount = String(useCfg.capacities.length || 7);
      if (assignRoomCount) assignRoomCount.value = suggestedCount;
      if (assignExcelRoomCount) assignExcelRoomCount.value = suggestedCount;
      if (assignRoomPrefix && assignExcelRoomPrefix) assignExcelRoomPrefix.value = assignRoomPrefix.value || 'Ruang';

      customRoomCapacitiesState = [...useCfg.capacities];
      if (assignUseCustomCapacities) assignUseCustomCapacities.checked = Boolean(useCfg.enabled);
      saveCustomCapacitiesConfig(Boolean(useCfg.enabled), customRoomCapacitiesState);
      syncCustomCapacitiesArray(parseInt(suggestedCount, 10) || 7, totalStu, false);

      if (assignRoomExcelFeedback) {
        assignRoomExcelFeedback.classList.add('hidden');
        assignRoomExcelFeedback.innerHTML = '';
      }
      if (assignManualNewRoomBox) assignManualNewRoomBox.classList.add('hidden');
      switchAssignRoomTab('auto');
      updateAssignExamRoomsPreview();
      modalAssignExamRooms.classList.remove('hidden');
    });
  }
  if (btnCloseAssignExamRooms) btnCloseAssignExamRooms.addEventListener('click', closeAssignExamRoomsModal);
  if (btnCancelAssignExamRooms) btnCancelAssignExamRooms.addEventListener('click', closeAssignExamRoomsModal);
  if (btnCloseAssignRoomExcelFooter) btnCloseAssignRoomExcelFooter.addEventListener('click', closeAssignExamRoomsModal);
  if (btnCloseAssignRoomManualFooter) btnCloseAssignRoomManualFooter.addEventListener('click', closeAssignExamRoomsModal);
  if (assignRoomMode) assignRoomMode.addEventListener('change', updateAssignExamRoomsPreview);
  if (assignRoomCount) {
    assignRoomCount.addEventListener('input', () => {
      if (assignExcelRoomCount) assignExcelRoomCount.value = assignRoomCount.value;
      const rCount = Math.max(1, Math.min(50, parseInt(assignRoomCount.value, 10) || 7));
      syncCustomCapacitiesArray(rCount, window.studentManager ? window.studentManager.getStudentCount() : 0);
      saveCustomCapacitiesConfig(assignUseCustomCapacities ? assignUseCustomCapacities.checked : false, customRoomCapacitiesState);
      updateAssignExamRoomsPreview();
    });
  }
  if (assignExcelRoomCount) {
    assignExcelRoomCount.addEventListener('input', () => {
      if (assignRoomCount) assignRoomCount.value = assignExcelRoomCount.value;
      const rCount = Math.max(1, Math.min(50, parseInt(assignExcelRoomCount.value, 10) || 7));
      syncCustomCapacitiesArray(rCount, window.studentManager ? window.studentManager.getStudentCount() : 0);
      saveCustomCapacitiesConfig(assignUseCustomCapacities ? assignUseCustomCapacities.checked : false, customRoomCapacitiesState);
      updateAssignExamRoomsPreview();
    });
  }
  if (assignRoomPrefix) {
    assignRoomPrefix.addEventListener('input', () => {
      if (assignExcelRoomPrefix) assignExcelRoomPrefix.value = assignRoomPrefix.value;
      renderCustomCapacitiesInputs();
      updateAssignExamRoomsPreview();
    });
  }
  if (assignExcelRoomPrefix) {
    assignExcelRoomPrefix.addEventListener('input', () => {
      if (assignRoomPrefix) assignRoomPrefix.value = assignExcelRoomPrefix.value;
      renderCustomCapacitiesInputs();
      updateAssignExamRoomsPreview();
    });
  }

  if (btnDownloadRoomTemplate) {
    btnDownloadRoomTemplate.addEventListener('click', () => {
      if (!window.studentManager || typeof window.studentManager.downloadRoomExcelTemplate !== 'function') return;
      const res = window.studentManager.downloadRoomExcelTemplate({ preShuffleRandom: false });
      if (res && res.success) {
        showAssignRoomExcelFeedback(
          `✅ File <strong>${escapeHtmlSafe(res.fileName)}</strong> berhasil diunduh (${res.count} baris). Silakan isi/ubah kolom <strong>Ruang Ujian</strong> di Excel lalu upload di Langkah 3.`,
          true
        );
      }
    });
  }

  if (btnDownloadShuffledRoomTemplate) {
    btnDownloadShuffledRoomTemplate.addEventListener('click', () => {
      if (!window.studentManager || typeof window.studentManager.downloadRoomExcelTemplate !== 'function') return;
      const roomCount = assignExcelRoomCount
        ? parseInt(assignExcelRoomCount.value, 10)
        : (assignRoomCount ? parseInt(assignRoomCount.value, 10) : 7);
      const roomPrefix = (assignExcelRoomPrefix ? assignExcelRoomPrefix.value.trim() : '')
        || (assignRoomPrefix ? assignRoomPrefix.value.trim() : '')
        || 'Ruang';
      const activeCaps = getActiveRoomCapacities();
      const res = window.studentManager.downloadRoomExcelTemplate({
        preShuffleRandom: true,
        roomCount,
        roomPrefix,
        roomCapacities: activeCaps
      });
      if (res && res.success) {
        showAssignRoomExcelFeedback(
          `🎲 File <strong>${escapeHtmlSafe(res.fileName)}</strong> sudah teracak otomatis lintas kelas ke <strong>${roomCount} ruang</strong>. Cek/edit di Excel jika perlu, lalu upload di Langkah 3 untuk menerapkannya.`,
          true
        );
      }
    });
  }

  if (btnTriggerImportRoomExcel && fileImportRoomExcel) {
    btnTriggerImportRoomExcel.addEventListener('click', () => fileImportRoomExcel.click());
    fileImportRoomExcel.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !window.studentManager || typeof window.studentManager.importRoomAssignmentsFromExcel !== 'function') return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const res = window.studentManager.importRoomAssignmentsFromExcel(evt.target.result);
        if (!res || !res.success) {
          showAssignRoomExcelFeedback(`❌ <strong>Gagal Impor Ruang:</strong> ${escapeHtmlSafe((res && res.message) || 'Format Excel tidak sesuai.')}`, false);
          return;
        }
        const roomFilterEl = document.getElementById('filterStudentsRoom');
        if (roomFilterEl) roomFilterEl.value = 'ALL';
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
        setupMonitoringControls();
        updateAssignExamRoomsPreview();

        const roomListHtml = (res.roomsSummary || []).slice(0, 8).map(item => {
          const grades = Object.entries(item.gradeCounts || {}).map(([g, n]) => `${escapeHtmlSafe(g)}: ${n}`).join(', ');
          return `<li>• <strong>${escapeHtmlSafe(item.room)}</strong>: ${item.total} siswa (${grades})</li>`;
        }).join('');
        const extraRooms = (res.roomsSummary || []).length > 8
          ? `<div class="mt-0.5 text-[10px] text-emerald-800">...dan ${res.roomsSummary.length - 8} ruang lainnya.</div>`
          : '';
        const unmatchedNote = res.unmatchedCount > 0
          ? `<div class="mt-1 text-amber-800">⚠️ ${res.unmatchedCount} baris di Excel tidak cocok dengan NISN/Nama siswa terdaftar${res.unmatchedSamples && res.unmatchedSamples.length ? ` (${escapeHtmlSafe(res.unmatchedSamples.join(', '))})` : ''}.</div>`
          : '';

        showAssignRoomExcelFeedback(
          `<div>✅ <strong>Berhasil memperbarui ruang ujian untuk ${res.updatedCount} siswa!</strong></div>
          <ul class="mt-1 space-y-0.5">${roomListHtml}</ul>${extraRooms}${unmatchedNote}`,
          true
        );
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    });
  }

  if (formAssignExamRooms) {
    formAssignExamRooms.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!window.studentManager) return;
      if (window.studentManager.getStudentCount() === 0) {
        alert("Belum ada data siswa. Silakan impor data siswa terlebih dahulu.");
        return;
      }
      const mode = assignRoomMode ? assignRoomMode.value : 'mixed_random';
      const roomCount = assignRoomCount ? parseInt(assignRoomCount.value, 10) : 7;
      const roomPrefix = assignRoomPrefix ? assignRoomPrefix.value.trim() : 'Ruang';
      const activeCaps = getActiveRoomCapacities();

      if (mode === 'clear' && !confirm("Kosongkan pembagian Ruang Ujian untuk seluruh siswa?")) {
        return;
      }

      const res = window.studentManager.assignExamRooms({
        mode,
        roomCount,
        roomPrefix,
        roomCapacities: activeCaps
      });
      if (!res || !res.success) {
        alert((res && res.message) || "Gagal mengatur ruang ujian.");
        return;
      }

      closeAssignExamRoomsModal();
      const roomFilterEl = document.getElementById('filterStudentsRoom');
      if (roomFilterEl) roomFilterEl.value = 'ALL';
      renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
      setupMonitoringControls();
      if (modalRoomDocsStudio && !modalRoomDocsStudio.classList.contains('hidden')) {
        openRoomDocsModal(roomDocClassFilter?.value || null, activeRoomDocMode);
      }

      if (mode === 'clear') {
        alert(`Sukses! Ruang ujian seluruh ${res.assignedCount} siswa telah dikosongkan.`);
      } else {
        const previewLines = (res.roomsSummary || []).slice(0, 8).map(item => {
          const gradesTxt = Object.entries(item.gradeCounts || {}).map(([g, n]) => `${g}: ${n}`).join(', ');
          return `• ${item.room}: ${item.total} siswa (${gradesTxt})`;
        }).join('\n');
        const extraLine = (res.roomsSummary || []).length > 8 ? `\n...dan ${res.roomsSummary.length - 8} ruang lainnya.` : '';
        alert(`Sukses! ${res.assignedCount} siswa berhasil dibagi ke ${res.roomCount} ruang ujian.\n\n${previewLines}${extraLine}\n\nKelas asli siswa (7A, 8B, 9C) tetap aman untuk jadwal & soal.`);
      }
    });
  }

  const filterStudentsRoom = document.getElementById('filterStudentsRoom');
  if (filterStudentsRoom) {
    filterStudentsRoom.addEventListener('change', () => {
      renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
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
          setupMonitoringControls();
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
    const selectedFilter = cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL";
    let students = window.studentManager.getAllStudents();
    if (selectedFilter.startsWith("ROOM:")) {
      const targetRoom = selectedFilter.slice(5);
      students = students.filter(s =>
        typeof window.studentManager.matchesRoom === 'function'
          ? window.studentManager.matchesRoom(s.examRoom, targetRoom)
          : String(s.examRoom || '').trim().toUpperCase() === targetRoom.trim().toUpperCase()
      );
    } else if (selectedFilter !== "ALL") {
      students = students.filter(s => String(s.class).trim().toUpperCase() === String(selectedFilter).trim().toUpperCase());
    }
    return students;
  }

  function updateCardModalButtonLabels(selectedFilter = "ALL") {
    const rooms = (window.studentManager && typeof window.studentManager.getAllRooms === 'function')
      ? window.studentManager.getAllRooms()
      : [];
    if (btnDownloadCardsPerClassPdf) {
      if (selectedFilter === "ALL") {
        btnDownloadCardsPerClassPdf.innerHTML = rooms.length > 0
          ? '<span>📥 Download PDF Per Ruang</span>'
          : '<span>📥 Download PDF Per Kelas</span>';
      } else if (selectedFilter.startsWith("ROOM:")) {
        const rm = selectedFilter.slice(5);
        btnDownloadCardsPerClassPdf.innerHTML = `<span>📥 Download PDF ${escapeHtmlSafe(rm)}</span>`;
      } else {
        btnDownloadCardsPerClassPdf.innerHTML = `<span>📥 Download PDF Kelas ${escapeHtmlSafe(selectedFilter)}</span>`;
      }
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
      const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
      const classes = window.studentManager.getAllClasses();
      let filterHtml = `<option value="ALL">${rooms.length > 0 ? 'Semua Ruang &amp; Kelas' : 'Semua Kelas'} (${students.length} Siswa)</option>`;
      if (rooms.length > 0) {
        filterHtml += '<optgroup label="🏫 Berdasarkan Ruang Ujian">';
        rooms.forEach(rm => {
          const members = window.studentManager.getStudentsByRoom(rm);
          filterHtml += `<option value="ROOM:${escapeHtmlSafe(rm)}">🏫 ${escapeHtmlSafe(rm)} (${members.length} Siswa)</option>`;
        });
        filterHtml += '</optgroup>';
      }
      if (classes.length > 0) {
        filterHtml += (rooms.length > 0 ? '<optgroup label="🎓 Berdasarkan Kelas Asli">' : '');
        classes.forEach(c => {
          const count = students.filter(s => String(s.class).trim().toUpperCase() === String(c).trim().toUpperCase()).length;
          filterHtml += `<option value="${escapeHtmlSafe(c)}">Kelas ${escapeHtmlSafe(c)} (${count} Siswa)</option>`;
        });
        filterHtml += (rooms.length > 0 ? '</optgroup>' : '');
      }
      cardPreviewClassFilter.innerHTML = filterHtml;
      cardPreviewClassFilter.value = "ALL";
    }

    renderCardPreviewContent("ALL");
    modalPrintCardsPreview.classList.remove('hidden');
  }

  function renderCardPreviewContent(selectedFilter = "ALL") {
    if (!cardPreviewContainer || !window.studentManager) return;
    const allStudents = window.studentManager.getAllStudents();
    const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
    const students = getFilteredPreviewCardStudents();

    updateCardModalButtonLabels(selectedFilter);

    if (cardPreviewCountBadge) {
      const scopeText = selectedFilter === "ALL"
        ? (rooms.length > 0 ? "Semua Ruang" : "Semua Kelas")
        : (selectedFilter.startsWith("ROOM:") ? selectedFilter.slice(5) : "Kelas " + selectedFilter);
      cardPreviewCountBadge.innerText = `${students.length} Kartu (${scopeText})`;
    }

    if (selectedFilter === "ALL" && rooms.length > 0) {
      const groupedByRoom = rooms.map(rm => {
        const rmStudents = window.studentManager.getStudentsByRoom(rm);
        if (rmStudents.length === 0) return '';
        const rmCardsHtml = window.studentManager.generateCardsHtml(rmStudents, window.examEngine.config.examTitle);
        return `
          <div class="mb-6 last:mb-0">
            <div class="max-w-4xl mx-auto mb-3 px-3.5 py-2 rounded-xl bg-white border border-indigo-200 flex items-center justify-between shadow-xs">
              <span class="text-xs font-extrabold text-indigo-900">🏫 ${escapeHtmlSafe(rm)}</span>
              <span class="text-[11px] font-bold text-indigo-700">${rmStudents.length} Siswa</span>
            </div>
            <div class="cards-grid grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center max-w-4xl mx-auto">
              ${rmCardsHtml}
            </div>
          </div>
        `;
      }).join('');
      const unassigned = allStudents.filter(s => !s.examRoom || !String(s.examRoom).trim());
      const unassignedHtml = unassigned.length > 0
        ? `
          <div class="mb-6 last:mb-0">
            <div class="max-w-4xl mx-auto mb-3 px-3.5 py-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-xs">
              <span class="text-xs font-extrabold text-slate-700">Belum Diatur Ruang</span>
              <span class="text-[11px] font-bold text-slate-600">${unassigned.length} Siswa</span>
            </div>
            <div class="cards-grid grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center max-w-4xl mx-auto">
              ${window.studentManager.generateCardsHtml(unassigned, window.examEngine.config.examTitle)}
            </div>
          </div>
        `
        : '';
      cardPreviewContainer.innerHTML = groupedByRoom + unassignedHtml;
      return;
    }

    if (selectedFilter === "ALL") {
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
      const selectedFilter = cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL";
      const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
      const students = getFilteredPreviewCardStudents();
      closeCardPreviewModal();
      if (selectedFilter.startsWith("ROOM:")) {
        window.studentManager.printExamCards(students, window.examEngine.config.examTitle, {
          roomLabel: selectedFilter.slice(5),
          groupByClass: false,
          groupByRoom: false
        });
      } else {
        window.studentManager.printExamCards(students, window.examEngine.config.examTitle, {
          classLabel: selectedFilter === "ALL" ? "" : selectedFilter,
          groupByRoom: selectedFilter === "ALL" && rooms.length > 0,
          groupByClass: selectedFilter === "ALL" && rooms.length === 0
        });
      }
    });
  }

  if (btnDownloadCardsPerClassPdf) {
    btnDownloadCardsPerClassPdf.addEventListener('click', async () => {
      const selectedFilter = cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL";
      const allStudents = window.studentManager.getAllStudents();
      const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
      const classes = window.studentManager.getAllClasses();

      if (selectedFilter === "ALL" && rooms.length > 1) {
        if (!confirm(`Akan mengunduh ${rooms.length} file PDF terpisah (1 file PDF untuk setiap ruang: ${rooms.join(', ')}). Lanjutkan?`)) {
          return;
        }
      } else if (selectedFilter === "ALL" && rooms.length === 0 && classes.length > 1) {
        if (!confirm(`Akan mengunduh ${classes.length} file PDF terpisah (1 file PDF untuk setiap kelas: ${classes.join(', ')}). Lanjutkan?`)) {
          return;
        }
      }

      btnDownloadCardsPerClassPdf.disabled = true;
      if (btnDownloadCardsPdf) btnDownloadCardsPdf.disabled = true;
      try {
        if (selectedFilter.startsWith("ROOM:")) {
          const rm = selectedFilter.slice(5);
          btnDownloadCardsPerClassPdf.innerHTML = `<span>⏳ Membuat PDF ${escapeHtmlSafe(rm)}...</span>`;
          const students = getFilteredPreviewCardStudents();
          await window.studentManager.downloadCardsPdf(students, window.examEngine.config.examTitle, {
            roomLabel: rm,
            groupByClass: false,
            groupByRoom: false
          });
        } else if (selectedFilter !== "ALL") {
          btnDownloadCardsPerClassPdf.innerHTML = `<span>⏳ Membuat PDF ${escapeHtmlSafe(selectedFilter)}...</span>`;
          const students = getFilteredPreviewCardStudents();
          await window.studentManager.downloadCardsPdf(students, window.examEngine.config.examTitle, {
            classLabel: selectedFilter,
            groupByClass: false
          });
        } else if (rooms.length > 0 && typeof window.studentManager.downloadCardsPerRoomSeparatePdfs === 'function') {
          await window.studentManager.downloadCardsPerRoomSeparatePdfs(
            allStudents,
            window.examEngine.config.examTitle,
            (done, total, rm) => {
              btnDownloadCardsPerClassPdf.innerHTML = `<span>⏳ PDF ${done}/${total} (${escapeHtmlSafe(rm)})...</span>`;
            }
          );
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
      const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
      const prevHtml = btnDownloadCardsPdf.innerHTML;
      btnDownloadCardsPdf.disabled = true;
      if (btnDownloadCardsPerClassPdf) btnDownloadCardsPerClassPdf.disabled = true;
      btnDownloadCardsPdf.innerHTML = '<span>⏳ Membuat PDF Semua...</span>';
      try {
        await window.studentManager.downloadCardsPdf(students, window.examEngine.config.examTitle, {
          classLabel: "",
          groupByRoom: rooms.length > 0,
          groupByClass: rooms.length === 0
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

  // ===================== MODAL DAFTAR HADIR PESERTA RESMI (ADMIN + EDIT IDENTITAS) =====================
  const modalAttendanceSheet = document.getElementById('modalAttendanceSheet');
  const btnOpenAttendanceSheet = document.getElementById('btnOpenAttendanceSheet');
  const btnOpenAttendanceFromMonitoring = document.getElementById('btnOpenAttendanceFromMonitoring');
  const btnCloseAttendanceSheet = document.getElementById('btnCloseAttendanceSheet');
  const btnCancelAttendanceSheet = document.getElementById('btnCancelAttendanceSheet');
  const btnToggleAttIdentityEditor = document.getElementById('btnToggleAttIdentityEditor');
  const attIdentityEditorPanel = document.getElementById('attIdentityEditorPanel');
  const btnSaveAttIdentity = document.getElementById('btnSaveAttIdentity');
  const attClassFilter = document.getElementById('attClassFilter');
  const attScheduleSelect = document.getElementById('attScheduleSelect');
  const attPaperSize = document.getElementById('attPaperSize');
  const attRowsPerPage = document.getElementById('attRowsPerPage');
  const attPengawasPreset = document.getElementById('attPengawasPreset');
  const btnDownloadAttendancePdf = document.getElementById('btnDownloadAttendancePdf');
  const btnDownloadAttendanceDoc = document.getElementById('btnDownloadAttendanceDoc');
  const btnExecuteDirectPrintAttendance = document.getElementById('btnExecuteDirectPrintAttendance');
  const attKopImageFile = document.getElementById('attKopImageFile');
  const btnUploadAttKopImage = document.getElementById('btnUploadAttKopImage');
  const btnRemoveAttKopImage = document.getElementById('btnRemoveAttKopImage');

  function syncAttKopUi() {
    const statusEl = document.getElementById('attKopImageStatus');
    const cfg = window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : {};
    const hasKop = Boolean(cfg.kopSuratImage && String(cfg.kopSuratImage).trim() !== '');
    if (statusEl) {
      statusEl.innerText = hasKop ? 'Kop Surat Upload Aktif' : 'Kop Otomatis Sekolah';
      statusEl.className = hasKop
        ? 'text-[11px] font-bold text-emerald-700 truncate max-w-[140px]'
        : 'text-[11px] font-semibold text-slate-500 truncate max-w-[140px]';
    }
    if (btnRemoveAttKopImage) {
      if (hasKop) btnRemoveAttKopImage.classList.remove('hidden');
      else btnRemoveAttKopImage.classList.add('hidden');
    }
    syncNqKopUi();
  }

  function applyPengawasForSelectedClass(selectedFilter) {
    if (!window.cbtAdmin) return;
    const allTeachers = window.cbtAdmin.getAllTeachers() || [];
    const pengawasList = allTeachers.filter(t => t && window.cbtAdmin.isPengawasUser(t));
    const attDayVal = String(document.getElementById('attDayText')?.value || '').trim();
    if (attPengawasPreset) {
      attPengawasPreset.innerHTML = '<option value="">-- Isi Manual / Kosongkan --</option>';
      pengawasList.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const normSched = window.cbtAdmin.normalizePengawasRoomSchedule ? window.cbtAdmin.normalizePengawasRoomSchedule(t.roomSchedule) : {};
        const hasWeekly = Object.keys(normSched).length > 0;
        const clsLbl = hasWeekly
          ? ' (Jadwal Sen–Sab)'
          : (t.classes ? ` (${t.classes})` : ' (Fleksibel)');
        opt.innerText = `${t.name}${clsLbl}`;
        attPengawasPreset.appendChild(opt);
      });
    }

    const matched = typeof window.cbtAdmin.resolvePengawasForRoomAndDay === 'function'
      ? window.cbtAdmin.resolvePengawasForRoomAndDay(selectedFilter, attDayVal)
      : null;

    const nameEl = document.getElementById('attPengawasName');
    const nipEl = document.getElementById('attPengawasNip');
    if (matched) {
      if (attPengawasPreset) attPengawasPreset.value = matched.id;
      if (nameEl) nameEl.value = matched.name || '';
      if (nipEl) {
        const cleanNip = String(matched.nip || '').trim();
        nipEl.value = /^\d[\d\s.\-]{5,}$/.test(cleanNip) ? cleanNip : '';
      }
    } else {
      if (attPengawasPreset) attPengawasPreset.value = '';
      if (nameEl) nameEl.value = '';
      if (nipEl) nipEl.value = '';
    }
  }

  function applyScheduleToAttendanceFields(scheduleId) {
    if (!window.cbtAdmin) return;
    const schedules = window.cbtAdmin.getAllSchedules() || [];
    const subjEl = document.getElementById('attSubjectName');
    const dayEl = document.getElementById('attDayText');
    const dateEl = document.getElementById('attDateText');
    const timeEl = document.getElementById('attTimeRange');

    if (String(scheduleId).startsWith('__SUBJ__:')) {
      const subjName = String(scheduleId).slice('__SUBJ__:'.length).trim();
      if (subjEl && subjName) subjEl.value = subjName;
      const matchingSchedules = schedules.filter(s =>
        window.examEngine && typeof window.examEngine.matchesSubject === 'function'
          ? window.examEngine.matchesSubject(s.subject, subjName)
          : String(s.subject || '').trim().toLowerCase() === subjName.toLowerCase()
      );
      if (matchingSchedules.length > 0) {
        const matchedSch = matchingSchedules.find(s => s.isActive) || matchingSchedules[0];
        if (dayEl && matchedSch.day) dayEl.value = matchedSch.day;
        if (dateEl) {
          const dStr = matchedSch.dateFormatted || (matchedSch.dateIso && window.cbtAdmin.formatIndonesianDate ? window.cbtAdmin.formatIndonesianDate(matchedSch.dateIso) : '');
          if (dStr) dateEl.value = dStr;
        }
        if (timeEl && matchedSch.timeRange) timeEl.value = matchedSch.timeRange;
      }
      return;
    }

    if (scheduleId === '__AUTO_PER_GRADE__') {
      const activeList = schedules.filter(s => s.isActive);
      const uniqueSubs = [...new Set(activeList.map(s => String(s.subject || '').trim()).filter(Boolean))];
      if (subjEl && uniqueSubs.length > 0) subjEl.value = uniqueSubs.join(' / ');
      const firstSch = activeList[0] || schedules[0];
      if (firstSch) {
        if (dayEl && firstSch.day) dayEl.value = firstSch.day;
        if (dateEl) {
          const dStr = firstSch.dateFormatted || (firstSch.dateIso && window.cbtAdmin.formatIndonesianDate ? window.cbtAdmin.formatIndonesianDate(firstSch.dateIso) : '');
          if (dStr) dateEl.value = dStr;
        }
        if (timeEl && firstSch.timeRange) timeEl.value = firstSch.timeRange;
      }
      return;
    }
    const sch = schedules.find(s => String(s.id) === String(scheduleId));
    if (!sch) return;
    if (subjEl && sch.subject) subjEl.value = sch.subject;
    if (dayEl && sch.day) dayEl.value = sch.day;
    if (dateEl) {
      const dStr = sch.dateFormatted || (sch.dateIso && window.cbtAdmin.formatIndonesianDate ? window.cbtAdmin.formatIndonesianDate(sch.dateIso) : '');
      if (dStr) dateEl.value = dStr;
    }
    if (timeEl && sch.timeRange) timeEl.value = sch.timeRange;
  }

  function getAttendanceStudentsAndOptions() {
    const selectedFilter = attClassFilter ? attClassFilter.value : 'ALL';
    const isAllRoomsMode = selectedFilter === 'ALL_ROOMS';
    const isRoomMode = Boolean(selectedFilter && selectedFilter.startsWith('ROOM:'));
    const roomName = isRoomMode ? selectedFilter.slice(5) : '';
    const rooms = window.studentManager && typeof window.studentManager.getAllRooms === 'function'
      ? window.studentManager.getAllRooms()
      : [];
    let students = window.studentManager ? window.studentManager.getAllStudents() : [];
    const dayTextVal = document.getElementById('attDayText')?.value.trim() || '';
    let roomGroups = null;

    if (isAllRoomsMode && rooms.length > 0) {
      roomGroups = rooms.map(rm => {
        const rmStudents = window.studentManager.getStudentsByRoom(rm);
        const matchedP = window.cbtAdmin && typeof window.cbtAdmin.resolvePengawasForRoomAndDay === 'function'
          ? window.cbtAdmin.resolvePengawasForRoomAndDay(`ROOM:${rm}`, dayTextVal)
          : null;
        const cleanNip = matchedP ? String(matchedP.nip || '').trim() : '';
        return {
          roomLabel: rm,
          serverRoom: rm,
          isMixedRoom: true,
          students: rmStudents,
          pengawasName: matchedP ? (matchedP.name || '') : '',
          pengawasNip: /^\d[\d\s.\-]{5,}$/.test(cleanNip) ? cleanNip : ''
        };
      });
      students = roomGroups.flatMap(g => g.students);
    } else if (isRoomMode) {
      students = students.filter(s =>
        typeof window.studentManager.matchesRoom === 'function'
          ? window.studentManager.matchesRoom(s.examRoom, roomName)
          : String(s.examRoom || '').trim().toUpperCase() === roomName.trim().toUpperCase()
      );
    } else if (selectedFilter && selectedFilter !== 'ALL' && !isAllRoomsMode) {
      students = students.filter(s => {
        if (window.examEngine && typeof window.examEngine.matchesClassLevel === 'function') {
          return window.examEngine.matchesClassLevel(s.class, selectedFilter);
        }
        return String(s.class || '').trim().toUpperCase() === String(selectedFilter).trim().toUpperCase();
      });
    }
    if (!isAllRoomsMode) {
      if (isRoomMode && window.studentManager && typeof window.studentManager.sortRoomStudents === 'function') {
        students = window.studentManager.sortRoomStudents(students);
      } else {
        students = [...students].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
      }
    }

    const uniqueClassesInSelection = new Set(students.map(s => String(s.class || '').trim()).filter(Boolean));
    const isMixedRoom = Boolean(isRoomMode || isAllRoomsMode || uniqueClassesInSelection.size > 1);
    const activeSchedules = window.cbtAdmin && typeof window.cbtAdmin.getActiveSchedules === 'function'
      ? window.cbtAdmin.getActiveSchedules()
      : [];
    const schSelVal = attScheduleSelect ? attScheduleSelect.value : '';
    const resolveSubjectForStudent = (schSelVal === '__AUTO_PER_GRADE__' && activeSchedules.length > 0 && window.examEngine)
      ? (st) => {
          const matched = activeSchedules.find(sch =>
            window.examEngine.matchesClassLevel(sch.classLevel || sch.targetClass || 'Semua Kelas', st && st.class || '')
          );
          return matched ? matched.subject : (document.getElementById('attSubjectName')?.value.trim() || '');
        }
      : null;

    const paperVal = attPaperSize ? attPaperSize.value : 'F4';
    const rowsVal = attRowsPerPage ? parseInt(attRowsPerPage.value, 10) : 25;
    const options = {
      classLabel: (!isRoomMode && !isAllRoomsMode && selectedFilter && selectedFilter !== 'ALL') ? selectedFilter : '',
      roomLabel: roomName,
      roomGroups,
      isMixedRoom,
      resolveSubjectForStudent,
      docTitle: document.getElementById('attDocTitle')?.value.trim() || 'DAFTAR HADIR PESERTA',
      examTitle: document.getElementById('attExamTitle')?.value.trim() || 'ASESMEN SUMATIF AKHIR SEMESTER (ASAS)',
      academicYear: document.getElementById('attAcademicYear')?.value.trim() || 'TAHUN PELAJARAN 2026/2027',
      cityRegency: document.getElementById('attCityRegency')?.value.trim() || 'KABUPATEN CIANJUR',
      cityCode: document.getElementById('attCityCode')?.value.trim() || '',
      schoolName: document.getElementById('attSchoolName')?.value.trim() || 'SMP NEGERI 2 PACET',
      schoolCode: document.getElementById('attSchoolCode')?.value.trim() || '',
      serverRoom: document.getElementById('attServerRoom')?.value.trim() || (roomName || (selectedFilter && selectedFilter !== 'ALL' && !isAllRoomsMode ? `Ruang Ujian ${selectedFilter}` : 'Ruang Ujian 1')),
      session: document.getElementById('attSession')?.value.trim() || '1',
      dayText: dayTextVal,
      dateText: document.getElementById('attDateText')?.value.trim() || '',
      timeRange: document.getElementById('attTimeRange')?.value.trim() || '07.30 - 09.30',
      subjectName: document.getElementById('attSubjectName')?.value.trim() || '',
      headmasterName: document.getElementById('attHeadmasterName')?.value.trim() || '',
      headmasterNip: document.getElementById('attHeadmasterNip')?.value.trim() || '',
      pengawasName: document.getElementById('attPengawasName')?.value.trim() || '',
      pengawasNip: document.getElementById('attPengawasNip')?.value.trim() || '',
      notes: document.getElementById('attNotes')?.value || '',
      autoTotalStudents: Boolean(document.getElementById('attAutoTotalStudents')?.checked),
      paperSize: paperVal,
      rowsPerPage: isNaN(rowsVal) ? 25 : rowsVal
    };
    return { students, options };
  }

  function refreshAttendancePreview() {
    const container = document.getElementById('attendancePreviewContainer');
    const countBadge = document.getElementById('attendancePreviewCountBadge');
    const paperBadge = document.getElementById('attendancePaperBadge');
    if (!window.cbtAdmin) return;
    const { students, options } = getAttendanceStudentsAndOptions();
    if (countBadge) {
      const roomLbl = options.roomGroups && options.roomGroups.length > 0
        ? `Semua ${options.roomGroups.length} Ruang`
        : (options.roomLabel
          ? options.roomLabel
          : (options.classLabel ? `Kelas ${options.classLabel}` : 'Semua Peserta'));
      countBadge.innerText = `${students.length} Peserta (${roomLbl})`;
    }
    if (paperBadge) {
      paperBadge.innerText = options.paperSize === 'A4' ? 'Kertas A4 (21 × 29,7 cm)' : 'Kertas F4 (21 × 33 cm)';
    }
    if (container) {
      container.innerHTML = window.cbtAdmin.buildAttendanceSheetHtml(students, options);
    }
  }

  function openAttendanceSheetModal(preferredClass = null, preferredSubject = null) {
    if (!modalAttendanceSheet || !window.cbtAdmin || !window.studentManager) return;
    const allStudents = window.studentManager.getAllStudents();
    if (!allStudents || allStudents.length === 0) {
      alert("Belum ada data siswa. Silakan impor data siswa terlebih dahulu.");
      return;
    }

    const cfg = window.cbtAdmin.getSchoolConfig();
    const att = cfg.attendanceIdentity || window.cbtAdmin.getDefaultAttendanceIdentity(cfg);
    const examCfg = window.examEngine ? window.examEngine.config : {};

    // Isi dropdown ruang ujian & kelas
    const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
    const classes = window.studentManager.getAllClasses();
    if (attClassFilter) {
      let optHtml = '';
      if (rooms.length > 0) {
        optHtml += `<option value="ALL_ROOMS">🏫 Semua Ruang Ujian (${rooms.length} Ruang • Pengawas Per Ruang)</option>`;
        optHtml += '<optgroup label="🚪 Berdasarkan Ruang Ujian (Campur Kelas)">';
        rooms.forEach(rm => {
          const members = window.studentManager.getStudentsByRoom(rm);
          const gradeNums = [...new Set(members.map(m => {
            const gm = String(m.class || '').match(/^(VIII|VII|IX|\d+)/i);
            return gm ? gm[1].toUpperCase() : String(m.class || '');
          }).filter(Boolean))].sort().join(',');
          optHtml += `<option value="ROOM:${escapeHtmlSafe(rm)}">🏫 ${escapeHtmlSafe(rm)} (${members.length} Siswa${gradeNums ? ` • Kls ${escapeHtmlSafe(gradeNums)}` : ''})</option>`;
        });
        optHtml += '</optgroup>';
      }
      if (classes.length > 0) {
        optHtml += (rooms.length > 0 ? '<optgroup label="🎓 Berdasarkan Kelas Asli">' : '');
        classes.forEach(c => {
          const count = allStudents.filter(s => String(s.class || '').trim().toUpperCase() === String(c).trim().toUpperCase()).length;
          optHtml += `<option value="${escapeHtmlSafe(c)}">Kelas ${escapeHtmlSafe(c)} (${count} Siswa)</option>`;
        });
        optHtml += (rooms.length > 0 ? '</optgroup>' : '');
      }
      optHtml += `<option value="ALL">Semua Peserta (${allStudents.length} Siswa)</option>`;
      attClassFilter.innerHTML = optHtml;

      if (preferredClass === 'ALL_ROOMS' && rooms.length > 0) {
        attClassFilter.value = 'ALL_ROOMS';
      } else if (preferredClass && preferredClass !== 'ALL') {
        if (String(preferredClass).startsWith('ROOM:')) {
          const rmName = String(preferredClass).slice(5);
          const matchedRoom = rooms.find(r => window.studentManager.matchesRoom(r, rmName));
          attClassFilter.value = matchedRoom ? `ROOM:${matchedRoom}` : (rooms.length > 0 ? `ROOM:${rooms[0]}` : 'ALL');
        } else if (rooms.some(r => window.studentManager.matchesRoom(r, preferredClass))) {
          const matchedRoom = rooms.find(r => window.studentManager.matchesRoom(r, preferredClass));
          attClassFilter.value = `ROOM:${matchedRoom}`;
        } else if (classes.some(c => String(c).toUpperCase() === String(preferredClass).toUpperCase())) {
          attClassFilter.value = classes.find(c => String(c).toUpperCase() === String(preferredClass).toUpperCase());
        } else {
          attClassFilter.value = rooms.length > 0 ? `ROOM:${rooms[0]}` : (classes[0] || 'ALL');
        }
      } else if (rooms.length > 0) {
        attClassFilter.value = `ROOM:${rooms[0]}`;
      } else if (classes.length > 0) {
        attClassFilter.value = classes[0];
      } else {
        attClassFilter.value = 'ALL';
      }
    }

    // Isi dropdown jadwal ujian & seluruh mata pelajaran yang terdaftar
    const schedules = window.cbtAdmin.getAllSchedules() || [];
    const activeSchedules = schedules.filter(s => s.isActive);
    const knownSubjectMap = new Map();
    const registerSubjectOption = (rawSubj) => {
      const clean = String(rawSubj || '').trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!knownSubjectMap.has(key)) knownSubjectMap.set(key, clean);
    };
    (typeof window.cbtAdmin.getAllSubjects === 'function' ? window.cbtAdmin.getAllSubjects() : []).forEach(registerSubjectOption);
    schedules.forEach(s => { if (s && s.subject) registerSubjectOption(s.subject); });
    const allSortedSubjects = Array.from(knownSubjectMap.values()).sort((a, b) => a.localeCompare(b, 'id'));

    if (attScheduleSelect) {
      attScheduleSelect.innerHTML = '';
      if (activeSchedules.length > 1) {
        const autoOpt = document.createElement('option');
        autoOpt.value = '__AUTO_PER_GRADE__';
        autoOpt.innerText = '🔀 Otomatis Sesuai Jadwal Kelas Aktif (Campur 7–8–9)';
        attScheduleSelect.appendChild(autoOpt);
      }
      if (schedules.length > 0) {
        const schGroup = document.createElement('optgroup');
        schGroup.label = '📅 Dari Jadwal Ujian';
        schedules.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.innerText = `${s.isActive ? '🟢 ' : ''}${s.subject}${s.classLevel ? ' • ' + s.classLevel : ''}`;
          schGroup.appendChild(opt);
        });
        attScheduleSelect.appendChild(schGroup);
      }
      if (allSortedSubjects.length > 0) {
        const subjGroup = document.createElement('optgroup');
        subjGroup.label = '📚 Semua Mata Pelajaran';
        allSortedSubjects.forEach(subj => {
          const opt = document.createElement('option');
          opt.value = `__SUBJ__:${subj}`;
          opt.innerText = `📘 ${subj}`;
          subjGroup.appendChild(opt);
        });
        attScheduleSelect.appendChild(subjGroup);
      }
      const manualOpt = document.createElement('option');
      manualOpt.value = '__MANUAL__';
      manualOpt.innerText = '-- Isi Mapel / Jadwal Manual --';
      attScheduleSelect.appendChild(manualOpt);
    }

    // Isi nilai Edit Identitas dari konfigurasi tersimpan
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v !== undefined && v !== null ? String(v) : '';
    };
    setVal('attDocTitle', att.docTitle || 'DAFTAR HADIR PESERTA');
    setVal('attExamTitle', att.examTitle || examCfg.examTitle || 'ASESMEN SUMATIF AKHIR SEMESTER (ASAS)');
    setVal('attAcademicYear', att.academicYear || 'TAHUN PELAJARAN 2026/2027');
    setVal('attCityRegency', att.cityRegency || 'KABUPATEN CIANJUR');
    setVal('attCityCode', att.cityCode !== undefined ? att.cityCode : '15');
    setVal('attSchoolName', att.schoolName || cfg.schoolName || 'SMP NEGERI 2 PACET');
    setVal('attSchoolCode', att.schoolCode !== undefined ? att.schoolCode : '1031');
    setVal('attSession', att.session || '1');
    setVal('attDayText', att.dayText || '');
    setVal('attDateText', att.dateText || cfg.date || '');
    setVal('attTimeRange', att.timeRange || '07.30 - 09.30');
    setVal('attSubjectName', att.subjectName || examCfg.subject || '');
    setVal('attHeadmasterName', att.headmasterName || cfg.headmasterName || '');
    setVal('attHeadmasterNip', att.headmasterNip || cfg.headmasterNip || '');
    setVal('attPengawasName', att.pengawasName || '');
    setVal('attPengawasNip', att.pengawasNip || '');
    setVal('attNotes', att.notes || '');

    const autoChk = document.getElementById('attAutoTotalStudents');
    if (autoChk) autoChk.checked = att.autoTotalStudents !== false;
    if (attPaperSize) attPaperSize.value = att.paperSize === 'A4' ? 'A4' : 'F4';
    if (attRowsPerPage) attRowsPerPage.value = String(att.rowsPerPage !== undefined ? att.rowsPerPage : 25);

    const chosenFilter = attClassFilter ? attClassFilter.value : 'ALL';
    const isChosenRoom = String(chosenFilter).startsWith('ROOM:');
    const defaultRoomTitle = isChosenRoom
      ? String(chosenFilter).slice(5)
      : (chosenFilter !== 'ALL' ? `Ruang Ujian ${chosenFilter}` : 'Ruang Ujian 1');
    setVal('attServerRoom', isChosenRoom ? defaultRoomTitle : (att.serverRoom || defaultRoomTitle));

    // Pilih jadwal paling relevan (aktif / per-jenjang jika ruang campur / filter monitoring)
    if (attScheduleSelect) {
      let matchedSch = null;
      let matchedDirectSubj = null;
      if (preferredSubject && preferredSubject !== 'ALL' && window.examEngine) {
        matchedSch = schedules.find(s => window.examEngine.matchesSubject(s.subject, preferredSubject));
        if (!matchedSch) {
          matchedDirectSubj = allSortedSubjects.find(subj => window.examEngine.matchesSubject(subj, preferredSubject)) || null;
        }
      }
      if (matchedSch) {
        attScheduleSelect.value = matchedSch.id;
        applyScheduleToAttendanceFields(matchedSch.id);
      } else if (matchedDirectSubj) {
        attScheduleSelect.value = `__SUBJ__:${matchedDirectSubj}`;
        applyScheduleToAttendanceFields(`__SUBJ__:${matchedDirectSubj}`);
      } else if (isChosenRoom && activeSchedules.length > 1) {
        const roomMembers = window.studentManager.getStudentsByRoom(String(chosenFilter).slice(5));
        const activeMatchingRoom = activeSchedules.filter(sch =>
          roomMembers.some(m => window.examEngine.matchesClassLevel(sch.classLevel || sch.targetClass || 'Semua Kelas', m.class || ''))
        );
        if (activeMatchingRoom.length > 1) {
          attScheduleSelect.value = '__AUTO_PER_GRADE__';
          applyScheduleToAttendanceFields('__AUTO_PER_GRADE__');
        } else if (activeMatchingRoom.length === 1) {
          attScheduleSelect.value = activeMatchingRoom[0].id;
          applyScheduleToAttendanceFields(activeMatchingRoom[0].id);
        } else {
          const fallbackSch = activeSchedules[0] || schedules[0];
          attScheduleSelect.value = fallbackSch ? fallbackSch.id : (allSortedSubjects[0] ? `__SUBJ__:${allSortedSubjects[0]}` : '__MANUAL__');
          if (fallbackSch) applyScheduleToAttendanceFields(fallbackSch.id);
          else if (allSortedSubjects[0]) applyScheduleToAttendanceFields(`__SUBJ__:${allSortedSubjects[0]}`);
        }
      } else {
        matchedSch = schedules.find(s => s.isActive) || schedules[0] || null;
        if (matchedSch) {
          attScheduleSelect.value = matchedSch.id;
          applyScheduleToAttendanceFields(matchedSch.id);
        } else if (allSortedSubjects.length > 0) {
          attScheduleSelect.value = `__SUBJ__:${allSortedSubjects[0]}`;
          applyScheduleToAttendanceFields(`__SUBJ__:${allSortedSubjects[0]}`);
        } else {
          attScheduleSelect.value = '__MANUAL__';
        }
      }
    }

    applyPengawasForSelectedClass(chosenFilter);
    syncAttKopUi();
    refreshAttendancePreview();
    modalAttendanceSheet.classList.remove('hidden');
  }

  function closeAttendanceSheetModal() {
    if (modalAttendanceSheet) modalAttendanceSheet.classList.add('hidden');
  }

  if (btnOpenAttendanceSheet) {
    btnOpenAttendanceSheet.addEventListener('click', () => openAttendanceSheetModal());
  }
  if (btnOpenAttendanceFromMonitoring) {
    btnOpenAttendanceFromMonitoring.addEventListener('click', () => {
      const monCls = document.getElementById('filterMonitoringClass')?.value || 'ALL';
      const monSubj = document.getElementById('filterMonitoringSubject')?.value || 'ALL';
      openAttendanceSheetModal(monCls, monSubj);
    });
  }
  if (btnCloseAttendanceSheet) btnCloseAttendanceSheet.addEventListener('click', closeAttendanceSheetModal);
  if (btnCancelAttendanceSheet) btnCancelAttendanceSheet.addEventListener('click', closeAttendanceSheetModal);

  if (btnToggleAttIdentityEditor && attIdentityEditorPanel) {
    btnToggleAttIdentityEditor.addEventListener('click', () => {
      const isHidden = attIdentityEditorPanel.classList.contains('hidden');
      if (isHidden) {
        attIdentityEditorPanel.classList.remove('hidden');
        btnToggleAttIdentityEditor.innerHTML = '<span>🔼 Tutup Edit Identitas</span>';
      } else {
        attIdentityEditorPanel.classList.add('hidden');
        btnToggleAttIdentityEditor.innerHTML = '<span>✏️ Edit Identitas</span>';
      }
    });
  }

  if (attClassFilter) {
    attClassFilter.addEventListener('change', () => {
      const cls = attClassFilter.value;
      const roomEl = document.getElementById('attServerRoom');
      if (roomEl) {
        if (cls === 'ALL_ROOMS') {
          roomEl.value = 'Sesuai Masing-Masing Ruang';
        } else if (cls && cls.startsWith('ROOM:')) {
          roomEl.value = cls.slice(5);
        } else {
          const curRoom = roomEl.value.trim();
          if (!curRoom || /^Ruang/i.test(curRoom) || /^Lab/i.test(curRoom) || /^Sesuai/i.test(curRoom) || curRoom.includes('/')) {
            const basePrefix = curRoom.includes('/') ? curRoom.split('/')[0].trim() + ' / ' : '';
            roomEl.value = cls && cls !== 'ALL' ? `${basePrefix}Ruang Ujian ${cls}` : `${basePrefix}Ruang Ujian 1`;
          }
        }
      }
      applyPengawasForSelectedClass(cls);
      refreshAttendancePreview();
    });
  }

  if (attScheduleSelect) {
    attScheduleSelect.addEventListener('change', () => {
      if (attScheduleSelect.value && attScheduleSelect.value !== '__MANUAL__') {
        applyScheduleToAttendanceFields(attScheduleSelect.value);
      }
      applyPengawasForSelectedClass(attClassFilter ? attClassFilter.value : 'ALL');
      refreshAttendancePreview();
    });
  }

  const attDayInputEl = document.getElementById('attDayText');
  if (attDayInputEl) {
    const syncPengawasOnDayChange = () => {
      applyPengawasForSelectedClass(attClassFilter ? attClassFilter.value : 'ALL');
      refreshAttendancePreview();
    };
    attDayInputEl.addEventListener('input', syncPengawasOnDayChange);
    attDayInputEl.addEventListener('change', syncPengawasOnDayChange);
  }

  if (attPengawasPreset) {
    attPengawasPreset.addEventListener('change', () => {
      const tid = attPengawasPreset.value;
      const nameEl = document.getElementById('attPengawasName');
      const nipEl = document.getElementById('attPengawasNip');
      if (!tid || !window.cbtAdmin) {
        if (nameEl) nameEl.value = '';
        if (nipEl) nipEl.value = '';
      } else {
        const t = (window.cbtAdmin.getAllTeachers() || []).find(item => item.id === tid);
        if (t) {
          if (nameEl) nameEl.value = t.name || '';
          if (nipEl) {
            const cleanNip = String(t.nip || '').trim();
            nipEl.value = /^\d[\d\s.\-]{5,}$/.test(cleanNip) ? cleanNip : '';
          }
        }
      }
      refreshAttendancePreview();
    });
  }

  if (btnUploadAttKopImage && attKopImageFile) {
    btnUploadAttKopImage.addEventListener('click', () => attKopImageFile.click());
    attKopImageFile.addEventListener('change', (e) => {
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
        syncAttKopUi();
        refreshAttendancePreview();
      });
      attKopImageFile.value = '';
    });
  }

  if (btnRemoveAttKopImage) {
    btnRemoveAttKopImage.addEventListener('click', () => {
      if (window.cbtAdmin) {
        const cfg = window.cbtAdmin.getSchoolConfig();
        cfg.kopSuratImage = '';
        window.cbtAdmin.saveSchoolConfig(cfg);
      }
      if (attKopImageFile) attKopImageFile.value = '';
      syncAttKopUi();
      refreshAttendancePreview();
    });
  }

  [
    'attPaperSize', 'attRowsPerPage', 'attDocTitle', 'attExamTitle', 'attAcademicYear',
    'attCityRegency', 'attCityCode', 'attSchoolName', 'attSchoolCode',
    'attServerRoom', 'attSession', 'attDateText', 'attTimeRange',
    'attSubjectName', 'attHeadmasterName', 'attHeadmasterNip',
    'attPengawasName', 'attPengawasNip', 'attNotes', 'attAutoTotalStudents'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', refreshAttendancePreview);
      el.addEventListener('change', refreshAttendancePreview);
    }
  });

  if (btnSaveAttIdentity) {
    btnSaveAttIdentity.addEventListener('click', async () => {
      if (!window.cbtAdmin) return;
      const { options } = getAttendanceStudentsAndOptions();
      const cfg = window.cbtAdmin.getSchoolConfig();
      const updatedCfg = {
        ...cfg,
        headmasterName: options.headmasterName || cfg.headmasterName,
        headmasterNip: options.headmasterNip || cfg.headmasterNip,
        attendanceIdentity: {
          docTitle: options.docTitle,
          examTitle: options.examTitle,
          academicYear: options.academicYear,
          cityRegency: options.cityRegency,
          cityCode: options.cityCode,
          schoolName: options.schoolName,
          schoolCode: options.schoolCode,
          serverRoom: options.serverRoom,
          session: options.session,
          dayText: options.dayText,
          dateText: options.dateText,
          timeRange: options.timeRange,
          subjectName: options.subjectName,
          headmasterName: options.headmasterName,
          headmasterNip: options.headmasterNip,
          pengawasName: options.pengawasName,
          pengawasNip: options.pengawasNip,
          notes: options.notes,
          autoTotalStudents: options.autoTotalStudents,
          paperSize: options.paperSize,
          rowsPerPage: options.rowsPerPage
        }
      };

      const prevText = btnSaveAttIdentity.innerHTML;
      btnSaveAttIdentity.disabled = true;
      btnSaveAttIdentity.innerHTML = '<span>⏳ Menyimpan...</span>';
      try {
        window.cbtAdmin.saveSchoolConfig(updatedCfg, true);
        let cloudNote = '';
        if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
          const syncRes = await window.supabaseSync.pushStateKey('cbt_school_config', window.cbtAdmin.getSchoolConfig()).catch(() => ({ success: false }));
          if (!syncRes || !syncRes.success) {
            cloudNote = '\n\n⚠️ Tersimpan di perangkat ini, namun sinkron ke Cloud tertunda.';
          }
        }
        renderSchoolConfigForm();
        renderConfigInfoOnLogin();
        alert(`Identitas Daftar Hadir berhasil disimpan!${cloudNote}`);
      } finally {
        btnSaveAttIdentity.disabled = false;
        btnSaveAttIdentity.innerHTML = prevText;
      }
    });
  }

  if (btnDownloadAttendancePdf) {
    btnDownloadAttendancePdf.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      const { students, options } = getAttendanceStudentsAndOptions();
      window.cbtAdmin.downloadAttendancePDF(students, options);
    });
  }
  if (btnDownloadAttendanceDoc) {
    btnDownloadAttendanceDoc.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      const { students, options } = getAttendanceStudentsAndOptions();
      window.cbtAdmin.downloadAttendanceDOC(students, options);
    });
  }
  if (btnExecuteDirectPrintAttendance) {
    btnExecuteDirectPrintAttendance.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      const { students, options } = getAttendanceStudentsAndOptions();
      window.cbtAdmin.printAttendanceDirect(students, options);
    });
  }

  // ===================== MODAL STUDIO DAFTAR PESERTA PER RUANGAN, DENAH DUDUK & BERITA ACARA (v3.98) =====================
  const modalRoomDocsStudio = document.getElementById('modalRoomDocsStudio');
  const btnOpenRoomDocsModal = document.getElementById('btnOpenRoomDocsModal');
  const btnOpenRoomDocsFromMonitoring = document.getElementById('btnOpenRoomDocsFromMonitoring');
  const btnOpenBeritaAcaraModal = document.getElementById('btnOpenBeritaAcaraModal');
  const btnOpenBeritaAcaraFromMonitoring = document.getElementById('btnOpenBeritaAcaraFromMonitoring');
  const btnCloseRoomDocsModal = document.getElementById('btnCloseRoomDocsModal');
  const btnCancelRoomDocsModal = document.getElementById('btnCancelRoomDocsModal');
  const btnRoomDocModeRoster = document.getElementById('btnRoomDocModeRoster');
  const btnRoomDocModeSeating = document.getElementById('btnRoomDocModeSeating');
  const btnRoomDocModeBeritaAcara = document.getElementById('btnRoomDocModeBeritaAcara');
  const roomDocClassFilter = document.getElementById('roomDocClassFilter');
  const roomDocPaperSize = document.getElementById('roomDocPaperSize');
  const roomDocKopImageFile = document.getElementById('roomDocKopImageFile');
  const btnUploadRoomDocKopImage = document.getElementById('btnUploadRoomDocKopImage');
  const btnRemoveRoomDocKopImage = document.getElementById('btnRemoveRoomDocKopImage');
  const btnToggleRoomDocFormatEditor = document.getElementById('btnToggleRoomDocFormatEditor');
  const btnOpenAssignRoomsFromDocs = document.getElementById('btnOpenAssignRoomsFromDocs');
  const btnAddStudentFromRoomDocs = document.getElementById('btnAddStudentFromRoomDocs');
  const roomDocFormatEditorPanel = document.getElementById('roomDocFormatEditorPanel');
  const btnResetRoomDocFormat = document.getElementById('btnResetRoomDocFormat');
  const btnSaveRoomDocFormat = document.getElementById('btnSaveRoomDocFormat');
  const btnDownloadRoomDocWord = document.getElementById('btnDownloadRoomDocWord');
  const btnDownloadRoomDocPdf = document.getElementById('btnDownloadRoomDocPdf');
  const btnExecuteDirectPrintRoomDocs = document.getElementById('btnExecuteDirectPrintRoomDocs');

  let activeRoomDocMode = 'roster';

  const cbtKopAspectCache = new Map();

  function syncRoomDocsKopUi() {
    const statusEl = document.getElementById('roomDocKopImageStatus');
    const cfg = window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : {};
    const kopSrc = cfg.kopSuratImage ? String(cfg.kopSuratImage).trim() : '';
    const hasKop = kopSrc !== '';
    if (statusEl) {
      statusEl.innerText = hasKop ? 'Kop Surat Upload Aktif' : 'Kop Otomatis Sekolah';
      statusEl.className = hasKop
        ? 'text-[11px] font-bold text-emerald-700 truncate max-w-[140px]'
        : 'text-[11px] font-semibold text-slate-500 truncate max-w-[140px]';
    }
    if (btnRemoveRoomDocKopImage) {
      if (hasKop) btnRemoveRoomDocKopImage.classList.remove('hidden');
      else btnRemoveRoomDocKopImage.classList.add('hidden');
    }
    if (hasKop && !cbtKopAspectCache.has(kopSrc)) {
      const probe = new Image();
      probe.onload = () => {
        const w = probe.naturalWidth || probe.width || 1;
        const h = probe.naturalHeight || probe.height || 1;
        const isBanner = w >= h * 2.2;
        cbtKopAspectCache.set(kopSrc, isBanner);
        if (window.cbtAdmin && Boolean(cfg.kopSuratIsBanner) !== isBanner) {
          const latest = window.cbtAdmin.getSchoolConfig();
          if (latest.kopSuratImage === kopSrc) {
            latest.kopSuratIsBanner = isBanner;
            window.cbtAdmin.saveSchoolConfig(latest, true);
          }
        }
        if (activeRoomDocMode === 'berita_acara') {
          refreshRoomDocsPreview();
        }
      };
      probe.src = kopSrc;
    }
  }

  function syncBeritaAcaraAutoCountInputState() {
    const autoChk = document.getElementById('rdBaAutoCounts');
    const expectedInput = document.getElementById('rdBaTotalExpected');
    if (!autoChk || !expectedInput) return;
    const isAuto = Boolean(autoChk.checked);
    expectedInput.disabled = isAuto;
    expectedInput.classList.toggle('bg-slate-100', isAuto);
    expectedInput.classList.toggle('text-slate-400', isAuto);
    expectedInput.classList.toggle('bg-white', !isAuto);
  }

  function setRoomDocMode(mode) {
    activeRoomDocMode = (mode === 'seating' || mode === 'berita_acara') ? mode : 'roster';
    const commonGrp = document.getElementById('rdCommonSchoolFormatGroup');
    const rosterGrp = document.getElementById('rdRosterFormatGroup');
    const seatingGrp = document.getElementById('rdSeatingFormatGroup');
    const baGrp = document.getElementById('rdBeritaAcaraFormatGroup');

    const activeBtnCls = 'px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer bg-violet-600 text-white';
    const inactiveBtnCls = 'px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-slate-600 hover:bg-slate-100';
    if (btnRoomDocModeRoster) btnRoomDocModeRoster.className = activeRoomDocMode === 'roster' ? activeBtnCls : inactiveBtnCls;
    if (btnRoomDocModeSeating) btnRoomDocModeSeating.className = activeRoomDocMode === 'seating' ? activeBtnCls : inactiveBtnCls;
    if (btnRoomDocModeBeritaAcara) btnRoomDocModeBeritaAcara.className = activeRoomDocMode === 'berita_acara' ? activeBtnCls : inactiveBtnCls;

    if (commonGrp) {
      commonGrp.classList.toggle('hidden', activeRoomDocMode === 'berita_acara');
    }
    if (rosterGrp) {
      rosterGrp.classList.toggle('hidden', activeRoomDocMode !== 'roster');
      rosterGrp.style.borderColor = activeRoomDocMode === 'roster' ? '#7c3aed' : '#e2e8f0';
      rosterGrp.style.boxShadow = activeRoomDocMode === 'roster' ? '0 0 0 2px rgba(124,58,237,0.14)' : 'none';
    }
    if (seatingGrp) {
      seatingGrp.classList.toggle('hidden', activeRoomDocMode !== 'seating');
      seatingGrp.style.borderColor = activeRoomDocMode === 'seating' ? '#7c3aed' : '#e2e8f0';
      seatingGrp.style.boxShadow = activeRoomDocMode === 'seating' ? '0 0 0 2px rgba(124,58,237,0.14)' : 'none';
    }
    if (baGrp) {
      baGrp.classList.toggle('hidden', activeRoomDocMode !== 'berita_acara');
    }
    refreshRoomDocsPreview();
  }

  function populateRoomDocsFormatInputs(fmt) {
    if (!fmt) return;
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v !== undefined && v !== null ? String(v) : '';
    };
    const setChk = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(v);
    };
    setVal('roomDocPaperSize', fmt.paperSize === 'A4' ? 'A4' : 'F4');
    setVal('rdProvinceName', fmt.provinceName || '');
    setVal('rdCityRegency', fmt.cityRegency || '');
    setVal('rdSchoolName', fmt.schoolName || '');
    setVal('rdExamSubtitle', fmt.examSubtitle || '');
    setVal('rdAcademicYear', fmt.academicYear || '');
    setVal('rdSignCity', fmt.signCity || '');
    setVal('rdSignDate', fmt.signDate || '');
    setVal('rdSignerRole', fmt.signerRole || 'Kepala Sekolah,');
    setVal('rdHeadmasterName', fmt.headmasterName || '');
    setVal('rdHeadmasterNip', fmt.headmasterNip || '');

    setVal('rdRosterTitle', fmt.rosterTitle || 'DAFTAR NAMA PESERTA UJIAN SEKOLAH');
    setVal('rdRosterKetMode', fmt.rosterKetMode || 'class');
    setVal('rdRosterMinRows', fmt.rosterMinRows !== undefined ? fmt.rosterMinRows : 0);
    setChk('rdRosterShowClassInName', fmt.rosterShowClassInName !== false);

    setVal('rdSeatingTitle', fmt.seatingTitle || 'DENAH POSISI DUDUK PESERTA UJIAN SEKOLAH');
    setVal('rdSeatingCols', fmt.seatingCols !== undefined ? fmt.seatingCols : 4);
    setVal('rdSeatingFlow', fmt.seatingFlow || 'zigzag');
    setVal('rdProctorPos', fmt.proctorPos || 'left');
    setVal('rdSeatingNumberMode', fmt.seatingNumberMode || 'nisn');
    setVal('rdSeatingBottomMode', fmt.seatingBottomMode || 'seat_class');
    setVal('rdSeatingAccentColor', fmt.seatingAccentColor || '#b2a1c7');
    setChk('rdSeatingShowLegend', fmt.seatingShowLegend !== false);

    // Berita Acara (Full Edit)
    setVal('rdBaLogoMode', fmt.baLogoMode || 'auto');
    setVal('rdBaTitle1', fmt.baTitle1 !== undefined ? fmt.baTitle1 : 'BERITA ACARA PELAKSANAAN');
    setVal('rdBaTitle2', fmt.baTitle2 !== undefined ? fmt.baTitle2 : 'ASESMEN NASIONAL SMP/MTS');
    setVal('rdBaTitle3', fmt.baTitle3 !== undefined ? fmt.baTitle3 : `TAHUN ${new Date().getFullYear()}`);
    setVal('rdBaDayName', fmt.baDayName !== undefined ? fmt.baDayName : '');
    setVal('rdBaDateNum', fmt.baDateNum !== undefined ? fmt.baDateNum : '');
    setVal('rdBaMonthName', fmt.baMonthName !== undefined ? fmt.baMonthName : '');
    setVal('rdBaYearNum', fmt.baYearNum !== undefined ? fmt.baYearNum : '');
    setVal('rdBaLocationText', fmt.baLocationText !== undefined ? fmt.baLocationText : '');
    setVal('rdBaExamDesc', fmt.baExamDesc !== undefined ? fmt.baExamDesc : '');
    setVal('rdBaTimeStart', fmt.baTimeStart !== undefined ? fmt.baTimeStart : '07:30');
    setVal('rdBaTimeEnd', fmt.baTimeEnd !== undefined ? fmt.baTimeEnd : '09:30');
    setVal('rdBaUsername', fmt.baUsername !== undefined ? fmt.baUsername : '');
    setVal('rdBaSchoolName', fmt.baSchoolName !== undefined ? fmt.baSchoolName : '');
    setVal('rdBaIdServer', fmt.baIdServer !== undefined ? fmt.baIdServer : '');
    setVal('rdBaSession', fmt.baSession !== undefined ? fmt.baSession : '1');
    setVal('rdBaRoomOverride', fmt.baRoomOverride !== undefined ? fmt.baRoomOverride : '');
    setVal('rdBaTotalExpected', fmt.baTotalExpected !== undefined ? fmt.baTotalExpected : '');
    setVal('rdBaPresentCount', fmt.baPresentCount !== undefined ? fmt.baPresentCount : '');
    setVal('rdBaAbsentCount', fmt.baAbsentCount !== undefined ? fmt.baAbsentCount : '0');
    setVal('rdBaAbsentUsernames', fmt.baAbsentUsernames !== undefined ? fmt.baAbsentUsernames : '');
    setChk('rdBaAutoCounts', fmt.baAutoCounts !== false);
    setChk('rdBaAutoSyncPengawas', fmt.baAutoSyncPengawas !== false);
    setVal('rdBaRole2Label', fmt.baRole2Label !== undefined ? fmt.baRole2Label : 'Pengawas');
    setVal('rdBaRole2Name', fmt.baRole2Name !== undefined ? fmt.baRole2Name : '');
    setVal('rdBaRole2Nip', fmt.baRole2Nip !== undefined ? fmt.baRole2Nip : '-');
    setVal('rdBaRole3Label', fmt.baRole3Label !== undefined ? fmt.baRole3Label : 'Kepala Sekolah');
    setVal('rdBaRole3Name', fmt.baRole3Name !== undefined ? fmt.baRole3Name : '');
    setVal('rdBaRole3Nip', fmt.baRole3Nip !== undefined ? fmt.baRole3Nip : '-');
    setVal('rdBaTestNotes', fmt.baTestNotes !== undefined ? fmt.baTestNotes : '');
    setVal('rdBaBottomNotes', fmt.baBottomNotes !== undefined ? fmt.baBottomNotes : '');
    setVal('rdBaIntroSignLabel', fmt.baIntroSignLabel !== undefined ? fmt.baIntroSignLabel : 'Yang membuat berita acara :');
    setVal('rdBaFooterText', fmt.baFooterText !== undefined ? fmt.baFooterText : '');
    syncBeritaAcaraAutoCountInputState();
  }

  function readRoomDocsFormatInputs() {
    const cfg = window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : {};
    const base = window.cbtAdmin && typeof window.cbtAdmin.getDefaultRoomDocsFormat === 'function'
      ? window.cbtAdmin.getDefaultRoomDocsFormat(cfg)
      : {};
    const getVal = (id, fb) => {
      const el = document.getElementById(id);
      return el ? el.value : fb;
    };
    const getChk = (id, fb) => {
      const el = document.getElementById(id);
      return el ? Boolean(el.checked) : fb;
    };
    return {
      ...base,
      paperSize: getVal('roomDocPaperSize', 'F4') === 'A4' ? 'A4' : 'F4',
      provinceName: String(getVal('rdProvinceName', base.provinceName) || '').trim(),
      cityRegency: String(getVal('rdCityRegency', base.cityRegency) || '').trim(),
      schoolName: String(getVal('rdSchoolName', base.schoolName) || '').trim(),
      examSubtitle: String(getVal('rdExamSubtitle', base.examSubtitle) || '').trim(),
      academicYear: String(getVal('rdAcademicYear', base.academicYear) || '').trim(),
      signCity: String(getVal('rdSignCity', base.signCity) || '').trim(),
      signDate: String(getVal('rdSignDate', base.signDate) || '').trim(),
      signerRole: String(getVal('rdSignerRole', base.signerRole) || 'Kepala Sekolah,').trim(),
      headmasterName: String(getVal('rdHeadmasterName', base.headmasterName) || '').trim(),
      headmasterNip: String(getVal('rdHeadmasterNip', base.headmasterNip) || '').trim(),

      rosterTitle: String(getVal('rdRosterTitle', base.rosterTitle) || 'DAFTAR NAMA PESERTA UJIAN SEKOLAH').trim(),
      rosterKetMode: getVal('rdRosterKetMode', 'class'),
      rosterMinRows: Math.max(0, Math.min(60, parseInt(getVal('rdRosterMinRows', '0'), 10) || 0)),
      rosterShowClassInName: getChk('rdRosterShowClassInName', true),

      seatingTitle: String(getVal('rdSeatingTitle', base.seatingTitle) || 'DENAH POSISI DUDUK PESERTA UJIAN SEKOLAH').trim(),
      seatingCols: Math.max(2, Math.min(6, parseInt(getVal('rdSeatingCols', '4'), 10) || 4)),
      seatingFlow: getVal('rdSeatingFlow', 'zigzag') === 'ltr' ? 'ltr' : 'zigzag',
      proctorPos: getVal('rdProctorPos', 'left'),
      seatingNumberMode: getVal('rdSeatingNumberMode', 'nisn'),
      seatingBottomMode: getVal('rdSeatingBottomMode', 'seat_class'),
      seatingAccentColor: getVal('rdSeatingAccentColor', '#b2a1c7') || '#b2a1c7',
      seatingShowLegend: getChk('rdSeatingShowLegend', true),

      baLogoMode: getVal('rdBaLogoMode', base.baLogoMode || 'auto') || 'auto',
      baTitle1: String(getVal('rdBaTitle1', base.baTitle1) ?? '').trim(),
      baTitle2: String(getVal('rdBaTitle2', base.baTitle2) ?? '').trim(),
      baTitle3: String(getVal('rdBaTitle3', base.baTitle3) ?? '').trim(),
      baDayName: String(getVal('rdBaDayName', base.baDayName) ?? '').trim(),
      baDateNum: String(getVal('rdBaDateNum', base.baDateNum) ?? '').trim(),
      baMonthName: String(getVal('rdBaMonthName', base.baMonthName) ?? '').trim(),
      baYearNum: String(getVal('rdBaYearNum', base.baYearNum) ?? '').trim(),
      baLocationText: String(getVal('rdBaLocationText', base.baLocationText) ?? '').trim(),
      baExamDesc: String(getVal('rdBaExamDesc', base.baExamDesc) ?? '').trim(),
      baTimeStart: String(getVal('rdBaTimeStart', base.baTimeStart) ?? '').trim(),
      baTimeEnd: String(getVal('rdBaTimeEnd', base.baTimeEnd) ?? '').trim(),
      baUsername: String(getVal('rdBaUsername', base.baUsername) ?? '').trim(),
      baSchoolName: String(getVal('rdBaSchoolName', base.baSchoolName) ?? '').trim(),
      baIdServer: String(getVal('rdBaIdServer', base.baIdServer) ?? '').trim(),
      baSession: String(getVal('rdBaSession', base.baSession) ?? '').trim(),
      baRoomOverride: String(getVal('rdBaRoomOverride', '') ?? '').trim(),
      baTotalExpected: String(getVal('rdBaTotalExpected', '') ?? '').trim(),
      baPresentCount: String(getVal('rdBaPresentCount', '') ?? '').trim(),
      baAbsentCount: String(getVal('rdBaAbsentCount', '0') ?? '').trim(),
      baAbsentUsernames: String(getVal('rdBaAbsentUsernames', '') ?? '').trim(),
      baAutoCounts: getChk('rdBaAutoCounts', true),
      baAutoSyncPengawas: getChk('rdBaAutoSyncPengawas', true),
      baRole2Label: String(getVal('rdBaRole2Label', base.baRole2Label) ?? '').trim(),
      baRole2Name: String(getVal('rdBaRole2Name', '') ?? '').trim(),
      baRole2Nip: String(getVal('rdBaRole2Nip', '-') ?? '').trim(),
      baRole3Label: String(getVal('rdBaRole3Label', base.baRole3Label) ?? '').trim(),
      baRole3Name: String(getVal('rdBaRole3Name', base.baRole3Name) ?? '').trim(),
      baRole3Nip: String(getVal('rdBaRole3Nip', base.baRole3Nip) ?? '').trim(),
      baTestNotes: String(getVal('rdBaTestNotes', '') ?? ''),
      baBottomNotes: String(getVal('rdBaBottomNotes', base.baBottomNotes) ?? ''),
      baIntroSignLabel: String(getVal('rdBaIntroSignLabel', base.baIntroSignLabel) ?? '').trim(),
      baFooterText: String(getVal('rdBaFooterText', base.baFooterText) ?? '').trim()
    };
  }

  function getRoomDocsGroupsAndPayload() {
    const fmt = readRoomDocsFormatInputs();
    const filterVal = roomDocClassFilter ? roomDocClassFilter.value : 'ALL_ROOMS';
    const allStudents = window.studentManager ? window.studentManager.getAllStudents() : [];
    const rooms = window.studentManager && typeof window.studentManager.getAllRooms === 'function'
      ? window.studentManager.getAllRooms()
      : [];

    let groups = [];
    let scopeLabel = 'Ruang';

    if (filterVal === 'ALL_ROOMS') {
      if (rooms.length > 0) {
        groups = rooms.map(rm => ({
          roomLabel: rm,
          students: window.studentManager.getStudentsByRoom(rm)
        }));
        scopeLabel = `Semua_${rooms.length}_Ruang`;
      } else {
        const classes = window.studentManager ? window.studentManager.getAllClasses() : [];
        groups = classes.length > 0
          ? classes.map(c => ({
              roomLabel: `Ruang ${c}`,
              students: allStudents
                .filter(s => String(s.class || '').trim().toUpperCase() === String(c).trim().toUpperCase())
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
            }))
          : [{ roomLabel: 'RUANG 1', students: allStudents }];
        scopeLabel = 'Semua_Kelas';
      }
    } else if (filterVal && filterVal.startsWith('ROOM:')) {
      const rmName = filterVal.slice(5);
      const members = window.studentManager
        ? window.studentManager.getStudentsByRoom(rmName)
        : allStudents;
      groups = [{ roomLabel: rmName, students: members }];
      scopeLabel = rmName;
    } else if (filterVal && filterVal.startsWith('CLASS:')) {
      const clsName = filterVal.slice(6);
      const members = allStudents
        .filter(s => window.examEngine && typeof window.examEngine.matchesClassLevel === 'function'
          ? window.examEngine.matchesClassLevel(s.class, clsName)
          : String(s.class || '').trim().toUpperCase() === String(clsName).trim().toUpperCase())
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
      groups = [{ roomLabel: `Ruang ${clsName}`, students: members }];
      scopeLabel = `Kelas_${clsName}`;
    } else {
      const sorted = window.studentManager && typeof window.studentManager.sortRoomStudents === 'function'
        ? window.studentManager.sortRoomStudents(allStudents)
        : [...allStudents];
      groups = [{ roomLabel: 'RUANG 1 (SEMUA)', students: sorted }];
      scopeLabel = 'Semua_Peserta';
    }

    const cfgNow = window.cbtAdmin.getSchoolConfig();
    const kopSrcNow = String(cfgNow.kopSuratImage || '').trim();
    if (kopSrcNow && cbtKopAspectCache.has(kopSrcNow)) {
      fmt._kopIsBanner = cbtKopAspectCache.get(kopSrcNow);
    }

    let sheetsHtml = '';
    if (activeRoomDocMode === 'seating') {
      sheetsHtml = window.cbtAdmin.buildRoomSeatingPlanHtml(groups, fmt);
    } else if (activeRoomDocMode === 'berita_acara') {
      sheetsHtml = window.cbtAdmin.buildRoomBeritaAcaraHtml(groups, fmt);
    } else {
      sheetsHtml = window.cbtAdmin.buildRoomRosterSheetHtml(groups, fmt);
    }

    const totalStudents = groups.reduce((acc, g) => acc + (Array.isArray(g.students) ? g.students.length : 0), 0);
    return {
      fmt,
      groups,
      totalStudents,
      sheetsHtml,
      exportOptions: {
        docType: activeRoomDocMode,
        paperSize: fmt.paperSize,
        scopeLabel
      }
    };
  }

  function refreshRoomDocsPreview() {
    if (!window.cbtAdmin) return;
    const container = document.getElementById('roomDocsPreviewContainer');
    const countBadge = document.getElementById('roomDocPreviewCountBadge');
    const paperBadge = document.getElementById('roomDocPaperBadge');
    const { fmt, groups, totalStudents, sheetsHtml } = getRoomDocsGroupsAndPayload();
    if (countBadge) {
      countBadge.innerText = `${groups.length} Ruang • ${totalStudents} Peserta`;
    }
    if (paperBadge) {
      paperBadge.innerText = fmt.paperSize === 'A4' ? 'Kertas A4 (21 × 29,7 cm)' : 'Kertas F4 (21 × 33 cm)';
    }
    if (container) {
      container.innerHTML = sheetsHtml;
    }
  }

  function openRoomDocsModal(preferredFilter = null, preferredMode = 'roster', expandEditor = false) {
    if (!modalRoomDocsStudio || !window.cbtAdmin || !window.studentManager) return;
    const allStudents = window.studentManager.getAllStudents();
    if (!allStudents || allStudents.length === 0) {
      alert("Belum ada data siswa. Silakan impor data siswa terlebih dahulu.");
      return;
    }

    const cfg = window.cbtAdmin.getSchoolConfig();
    const defFmt = window.cbtAdmin.getDefaultRoomDocsFormat(cfg);
    const fmt = { ...defFmt, ...(cfg.roomDocsFormat || {}) };
    populateRoomDocsFormatInputs(fmt);

    const rooms = typeof window.studentManager.getAllRooms === 'function' ? window.studentManager.getAllRooms() : [];
    const classes = window.studentManager.getAllClasses();
    if (roomDocClassFilter) {
      let optHtml = '';
      if (rooms.length > 0) {
        optHtml += `<option value="ALL_ROOMS">🏫 Semua Ruang Ujian (${rooms.length} Ruang • 1 Hal/Ruang)</option>`;
        optHtml += '<optgroup label="🚪 Pilih Per Ruang Ujian (Urutan Kursi Acak)">';
        rooms.forEach(rm => {
          const members = window.studentManager.getStudentsByRoom(rm);
          const gradeNums = [...new Set(members.map(m => {
            const gm = String(m.class || '').match(/^(VIII|VII|IX|\d+)/i);
            return gm ? gm[1].toUpperCase() : String(m.class || '');
          }).filter(Boolean))].sort().join(',');
          optHtml += `<option value="ROOM:${escapeHtmlSafe(rm)}">🚪 ${escapeHtmlSafe(rm)} (${members.length} Siswa${gradeNums ? ` • Kls ${escapeHtmlSafe(gradeNums)}` : ''})</option>`;
        });
        optHtml += '</optgroup>';
      }
      if (classes.length > 0) {
        optHtml += '<optgroup label="🎓 Berdasarkan Kelas Asli">';
        classes.forEach(c => {
          const count = allStudents.filter(s => String(s.class || '').trim().toUpperCase() === String(c).trim().toUpperCase()).length;
          optHtml += `<option value="CLASS:${escapeHtmlSafe(c)}">Kelas ${escapeHtmlSafe(c)} (${count} Siswa)</option>`;
        });
        optHtml += '</optgroup>';
      }
      if (!optHtml) {
        optHtml = `<option value="ALL">Semua Peserta (${allStudents.length} Siswa)</option>`;
      }
      roomDocClassFilter.innerHTML = optHtml;

      if (preferredFilter && preferredFilter !== 'ALL') {
        if (preferredFilter === 'ALL_ROOMS' && rooms.length > 0) {
          roomDocClassFilter.value = 'ALL_ROOMS';
        } else if (String(preferredFilter).startsWith('ROOM:')) {
          const rmName = String(preferredFilter).slice(5);
          const matchedRoom = rooms.find(r => window.studentManager.matchesRoom(r, rmName));
          roomDocClassFilter.value = matchedRoom ? `ROOM:${matchedRoom}` : (rooms.length > 0 ? `ROOM:${rooms[0]}` : roomDocClassFilter.options[0]?.value);
        } else if (rooms.some(r => window.studentManager.matchesRoom(r, preferredFilter))) {
          const matchedRoom = rooms.find(r => window.studentManager.matchesRoom(r, preferredFilter));
          roomDocClassFilter.value = `ROOM:${matchedRoom}`;
        } else if (classes.some(c => String(c).toUpperCase() === String(preferredFilter).toUpperCase())) {
          const matchedCls = classes.find(c => String(c).toUpperCase() === String(preferredFilter).toUpperCase());
          roomDocClassFilter.value = `CLASS:${matchedCls}`;
        } else if (rooms.length > 0) {
          roomDocClassFilter.value = `ROOM:${rooms[0]}`;
        }
      } else if (rooms.length > 0) {
        roomDocClassFilter.value = `ROOM:${rooms[0]}`;
      }
    }

    if (roomDocFormatEditorPanel && btnToggleRoomDocFormatEditor) {
      if (expandEditor) {
        roomDocFormatEditorPanel.classList.remove('hidden');
        btnToggleRoomDocFormatEditor.innerHTML = '<span>🔼 Tutup Editor Format</span>';
      } else {
        roomDocFormatEditorPanel.classList.add('hidden');
        btnToggleRoomDocFormatEditor.innerHTML = '<span>✏️ Edit Format Sendiri</span>';
      }
    }

    syncRoomDocsKopUi();
    setRoomDocMode(preferredMode);
    if (roomDocFormatEditorPanel) roomDocFormatEditorPanel.scrollTop = 0;
    const previewContainerEl = document.getElementById('roomDocsPreviewContainer');
    if (previewContainerEl) previewContainerEl.scrollTop = 0;
    modalRoomDocsStudio.classList.remove('hidden');
  }

  function closeRoomDocsModal() {
    if (modalRoomDocsStudio) modalRoomDocsStudio.classList.add('hidden');
  }

  if (btnOpenRoomDocsModal) {
    btnOpenRoomDocsModal.addEventListener('click', () => openRoomDocsModal(null, 'roster', false));
  }
  if (btnOpenRoomDocsFromMonitoring) {
    btnOpenRoomDocsFromMonitoring.addEventListener('click', () => {
      const monCls = document.getElementById('filterMonitoringClass')?.value || 'ALL';
      openRoomDocsModal(monCls, 'roster', false);
    });
  }
  if (btnOpenBeritaAcaraModal) {
    btnOpenBeritaAcaraModal.addEventListener('click', () => openRoomDocsModal(null, 'berita_acara', true));
  }
  if (btnOpenBeritaAcaraFromMonitoring) {
    btnOpenBeritaAcaraFromMonitoring.addEventListener('click', () => {
      const monCls = document.getElementById('filterMonitoringClass')?.value || 'ALL';
      openRoomDocsModal(monCls, 'berita_acara', true);
    });
  }
  if (btnOpenAssignRoomsFromDocs) {
    btnOpenAssignRoomsFromDocs.addEventListener('click', () => {
      if (btnOpenAssignExamRooms) btnOpenAssignExamRooms.click();
    });
  }
  if (btnAddStudentFromRoomDocs) {
    btnAddStudentFromRoomDocs.addEventListener('click', () => {
      const fVal = roomDocClassFilter ? roomDocClassFilter.value : '';
      let prefillRoom = 'Ruang 1';
      if (fVal && fVal.startsWith('ROOM:')) {
        prefillRoom = fVal.slice(5);
      } else if (window.studentManager && typeof window.studentManager.getAllRooms === 'function') {
        const rms = window.studentManager.getAllRooms();
        if (rms.length > 0) prefillRoom = rms[0];
      }
      openStudentModal(null, prefillRoom);
    });
  }
  if (btnCloseRoomDocsModal) btnCloseRoomDocsModal.addEventListener('click', closeRoomDocsModal);
  if (btnCancelRoomDocsModal) btnCancelRoomDocsModal.addEventListener('click', closeRoomDocsModal);

  if (btnRoomDocModeRoster) {
    btnRoomDocModeRoster.addEventListener('click', () => setRoomDocMode('roster'));
  }
  if (btnRoomDocModeSeating) {
    btnRoomDocModeSeating.addEventListener('click', () => setRoomDocMode('seating'));
  }
  if (btnRoomDocModeBeritaAcara) {
    btnRoomDocModeBeritaAcara.addEventListener('click', () => setRoomDocMode('berita_acara'));
  }

  if (btnToggleRoomDocFormatEditor && roomDocFormatEditorPanel) {
    btnToggleRoomDocFormatEditor.addEventListener('click', () => {
      const isHidden = roomDocFormatEditorPanel.classList.contains('hidden');
      if (isHidden) {
        roomDocFormatEditorPanel.classList.remove('hidden');
        btnToggleRoomDocFormatEditor.innerHTML = '<span>🔼 Tutup Editor Format</span>';
      } else {
        roomDocFormatEditorPanel.classList.add('hidden');
        btnToggleRoomDocFormatEditor.innerHTML = '<span>✏️ Edit Format Sendiri</span>';
      }
    });
  }

  if (btnUploadRoomDocKopImage && roomDocKopImageFile) {
    btnUploadRoomDocKopImage.addEventListener('click', () => roomDocKopImageFile.click());
    roomDocKopImageFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) {
        if (file) alert("Harap pilih file gambar (PNG, JPG, atau WEBP) untuk Kop Surat.");
        return;
      }
      trimKopSuratWhitespace(file, 1600, (dataUrl, _changed, dims) => {
        const isBanner = Boolean(dims && dims.isBanner);
        cbtKopAspectCache.set(dataUrl, isBanner);
        if (window.cbtAdmin) {
          const cfg = window.cbtAdmin.getSchoolConfig();
          cfg.kopSuratImage = dataUrl;
          cfg.kopSuratIsBanner = isBanner;
          window.cbtAdmin.saveSchoolConfig(cfg);
        }
        const baLogoSel = document.getElementById('rdBaLogoMode');
        if (baLogoSel && activeRoomDocMode === 'berita_acara') {
          baLogoSel.value = 'auto';
        }
        syncRoomDocsKopUi();
        syncAttKopUi();
        refreshRoomDocsPreview();
      });
      roomDocKopImageFile.value = '';
    });
  }

  if (btnRemoveRoomDocKopImage) {
    btnRemoveRoomDocKopImage.addEventListener('click', () => {
      if (window.cbtAdmin) {
        const cfg = window.cbtAdmin.getSchoolConfig();
        cfg.kopSuratImage = '';
        cfg.kopSuratIsBanner = false;
        window.cbtAdmin.saveSchoolConfig(cfg);
      }
      if (roomDocKopImageFile) roomDocKopImageFile.value = '';
      syncRoomDocsKopUi();
      syncAttKopUi();
      refreshRoomDocsPreview();
    });
  }

  if (roomDocClassFilter) {
    roomDocClassFilter.addEventListener('change', refreshRoomDocsPreview);
  }

  const rdBaAutoCountsChk = document.getElementById('rdBaAutoCounts');
  if (rdBaAutoCountsChk) {
    rdBaAutoCountsChk.addEventListener('change', () => {
      syncBeritaAcaraAutoCountInputState();
      refreshRoomDocsPreview();
    });
  }

  [
    'roomDocPaperSize', 'rdProvinceName', 'rdCityRegency', 'rdSchoolName', 'rdExamSubtitle',
    'rdAcademicYear', 'rdSignCity', 'rdSignDate', 'rdSignerRole', 'rdHeadmasterName',
    'rdHeadmasterNip', 'rdRosterTitle', 'rdRosterKetMode', 'rdRosterMinRows',
    'rdRosterShowClassInName', 'rdSeatingTitle', 'rdSeatingCols', 'rdSeatingFlow',
    'rdProctorPos', 'rdSeatingNumberMode', 'rdSeatingBottomMode',
    'rdSeatingAccentColor', 'rdSeatingShowLegend',
    'rdBaLogoMode', 'rdBaTitle1', 'rdBaTitle2', 'rdBaTitle3',
    'rdBaDayName', 'rdBaDateNum', 'rdBaMonthName', 'rdBaYearNum',
    'rdBaLocationText', 'rdBaExamDesc', 'rdBaTimeStart', 'rdBaTimeEnd',
    'rdBaUsername', 'rdBaSchoolName', 'rdBaIdServer', 'rdBaSession',
    'rdBaRoomOverride', 'rdBaTotalExpected', 'rdBaPresentCount', 'rdBaAbsentCount',
    'rdBaAbsentUsernames', 'rdBaAutoSyncPengawas',
    'rdBaRole2Label', 'rdBaRole2Name', 'rdBaRole2Nip',
    'rdBaRole3Label', 'rdBaRole3Name', 'rdBaRole3Nip',
    'rdBaTestNotes', 'rdBaBottomNotes', 'rdBaIntroSignLabel', 'rdBaFooterText'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', refreshRoomDocsPreview);
      el.addEventListener('change', refreshRoomDocsPreview);
    }
  });

  if (btnResetRoomDocFormat) {
    btnResetRoomDocFormat.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      if (!confirm('Kembalikan pengaturan format Daftar Peserta, Denah Duduk & Berita Acara ke bawaan sekolah?')) return;
      const cfg = window.cbtAdmin.getSchoolConfig();
      const defFmt = window.cbtAdmin.getDefaultRoomDocsFormat(cfg);
      populateRoomDocsFormatInputs(defFmt);
      refreshRoomDocsPreview();
    });
  }

  if (btnSaveRoomDocFormat) {
    btnSaveRoomDocFormat.addEventListener('click', async () => {
      if (!window.cbtAdmin) return;
      const fmt = readRoomDocsFormatInputs();
      const cfg = window.cbtAdmin.getSchoolConfig();
      const updatedCfg = {
        ...cfg,
        headmasterName: fmt.headmasterName || cfg.headmasterName,
        headmasterNip: fmt.headmasterNip || cfg.headmasterNip,
        roomDocsFormat: fmt
      };
      const prevHtml = btnSaveRoomDocFormat.innerHTML;
      btnSaveRoomDocFormat.disabled = true;
      btnSaveRoomDocFormat.innerHTML = '<span>⏳ Menyimpan...</span>';
      try {
        window.cbtAdmin.saveSchoolConfig(updatedCfg, true);
        let cloudNote = '';
        if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
          const syncRes = await window.supabaseSync.pushStateKey('cbt_school_config', window.cbtAdmin.getSchoolConfig()).catch(() => ({ success: false }));
          if (!syncRes || !syncRes.success) {
            cloudNote = '\n\n⚠️ Tersimpan di perangkat ini, namun sinkron ke Cloud tertunda.';
          }
        }
        renderSchoolConfigForm();
        renderConfigInfoOnLogin();
        refreshRoomDocsPreview();
        alert(`Format Dokumen Ruang & Berita Acara berhasil disimpan permanen!${cloudNote}`);
      } finally {
        btnSaveRoomDocFormat.disabled = false;
        btnSaveRoomDocFormat.innerHTML = prevHtml;
      }
    });
  }

  if (btnDownloadRoomDocPdf) {
    btnDownloadRoomDocPdf.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      const { sheetsHtml, exportOptions } = getRoomDocsGroupsAndPayload();
      window.cbtAdmin.downloadRoomDocsPDF(sheetsHtml, exportOptions);
    });
  }

  if (btnDownloadRoomDocWord) {
    btnDownloadRoomDocWord.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      const { sheetsHtml, exportOptions } = getRoomDocsGroupsAndPayload();
      window.cbtAdmin.downloadRoomDocsDOC(sheetsHtml, exportOptions);
    });
  }

  if (btnExecuteDirectPrintRoomDocs) {
    btnExecuteDirectPrintRoomDocs.addEventListener('click', () => {
      if (!window.cbtAdmin) return;
      const { sheetsHtml } = getRoomDocsGroupsAndPayload();
      window.cbtAdmin.printRoomDocsDirect(sheetsHtml);
    });
  }

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

  // ===================== TAB 4: MANAJEMEN GURU & PENGAWAS + EXCEL TEMPLATE & IMPORT =====================
  const btnDownloadTeacherTemplate = document.getElementById('btnDownloadTeacherTemplate');
  if (btnDownloadTeacherTemplate) {
    btnDownloadTeacherTemplate.addEventListener('click', () => {
      window.cbtAdmin.downloadTeacherExcelTemplate();
    });
  }

  const btnDownloadPengawasTemplate = document.getElementById('btnDownloadPengawasTemplate');
  if (btnDownloadPengawasTemplate) {
    btnDownloadPengawasTemplate.addEventListener('click', () => {
      window.cbtAdmin.downloadPengawasExcelTemplate();
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
          const parts = [];
          if (result.guruCount > 0) parts.push(`${result.guruCount} Guru Mapel`);
          if (result.pengawasCount > 0) parts.push(`${result.pengawasCount} Pengawas Ruang`);
          const detailStr = parts.length > 0 ? ` (${parts.join(' • ')})` : '';
          const pinNote = result.pinAdjustedCount > 0
            ? `\n\nCatatan: ${result.pinAdjustedCount} akun memiliki NIP sama dengan peran lain sehingga PIN-nya otomatis dibedakan (misal: pengawas123 / guru123) agar tidak bentrok saat login.`
            : '';
          alert(`Sukses! Berhasil mengimpor / memperbarui ${result.count} akun${detailStr} dari file Excel.${pinNote}`);
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
        } else {
          alert(`Gagal impor Excel guru/pengawas: ${result.message}`);
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

    const roleFilter = document.getElementById('filterTeacherRole')?.value || 'ALL';
    const teachers = window.cbtAdmin.searchTeachers(searchQuery, roleFilter);

    if (badge) {
      const allNonAdmin = window.cbtAdmin.getAllTeachers().filter(t => t.role !== 'admin' && t.id !== 'admin');
      const pengawasCount = allNonAdmin.filter(t => String(t.role || '').toLowerCase() === 'pengawas').length;
      const guruCount = allNonAdmin.length - pengawasCount;
      badge.innerText = pengawasCount > 0
        ? `Total: ${guruCount} Guru • ${pengawasCount} Pengawas (+ 1 Proktor)`
        : `Total: ${guruCount} Guru (+ 1 Proktor)`;
    }

    if (teachers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Tidak ada data guru/pengawas ditemukan.</td></tr>`;
      return;
    }

    teachers.forEach((t, idx) => {
      const isSuperAdmin = t.role === 'admin' || t.id === 'admin';
      const isPengawas = !isSuperAdmin && String(t.role || '').toLowerCase() === 'pengawas';
      const parsedClasses = window.cbtAdmin.parseTeacherClasses(t.classes);
      const weeklySched = window.cbtAdmin.normalizePengawasRoomSchedule ? window.cbtAdmin.normalizePengawasRoomSchedule(t.roomSchedule) : {};
      const weeklyEntries = Object.entries(weeklySched);
      let classBadgeHtml = '';
      if (isSuperAdmin) {
        classBadgeHtml = `<span class="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold text-[11px]">Semua Kelas</span>`;
      } else if (isPengawas) {
        if (weeklyEntries.length > 0) {
          const shortMap = { Senin: 'Sen', Selasa: 'Sel', Rabu: 'Rab', Kamis: 'Kam', Jumat: 'Jum', Sabtu: 'Sab' };
          const summaryStr = weeklyEntries.map(([d, rm]) => `${shortMap[d] || d}:${rm}`).join(' • ');
          classBadgeHtml = `<div class="flex flex-col gap-0.5"><span class="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold text-[11px] w-fit">🗓️ Senin–Jumat</span><span class="text-[10px] text-slate-600 font-semibold whitespace-normal max-w-[200px]">${escapeHtmlSafe(summaryStr)}</span></div>`;
        } else if (parsedClasses.length > 0) {
          classBadgeHtml = `<span class="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-bold text-[11px]">🔒 ${escapeHtmlSafe(parsedClasses.join(', '))}</span>`;
        } else {
          classBadgeHtml = `<span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">🔄 Fleksibel (Pilih Saat Mengawas)</span>`;
        }
      } else {
        classBadgeHtml = parsedClasses.length > 0
          ? `<span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px]">${escapeHtmlSafe(parsedClasses.join(', '))}</span>`
          : `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium text-[11px]">Semua Kelas</span>`;
      }

      const roleBadgeHtml = isSuperAdmin
        ? '<span class="text-[10px] font-black text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full inline-block mt-0.5">Proktor Utama / Admin</span>'
        : (isPengawas
          ? '<span class="text-[10px] font-black text-teal-800 bg-teal-100 border border-teal-200 px-2 py-0.5 rounded-full inline-block mt-0.5">👀 Pengawas Ruang (Pantau Saja)</span>'
          : '<span class="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full inline-block mt-0.5">👨‍🏫 Guru Mapel</span>');

      const subjectCellHtml = isPengawas
        ? `<span class="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 font-bold text-xs">👀 Semua Mapel Aktif</span>`
        : `<span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs">${escapeHtmlSafe(t.subject || '-')}</span>`;

      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3 font-mono font-bold text-slate-700">${escapeHtmlSafe(t.nip)}</td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${escapeHtmlSafe(t.name)}</div>
          ${roleBadgeHtml}
        </td>
        <td class="p-3">${subjectCellHtml}</td>
        <td class="p-3 whitespace-nowrap">${classBadgeHtml}</td>
        <td class="p-3">
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-bold text-slate-700 teacher-pin-val">••••••</span>
            <button type="button" class="btn-toggle-row-pin text-[11px] text-blue-600 hover:underline cursor-pointer" title="Lihat Password">👁️</button>
          </div>
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          ${!isSuperAdmin ? `
            <button type="button" data-id="${t.id}" class="btn-toggle-teacher-role px-2 py-1 rounded-lg ${isPengawas ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200' : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200'} font-bold text-[11px] transition cursor-pointer mr-1" title="${isPengawas ? 'Kembalikan ke mode Guru Mapel' : 'Jadikan Pengawas Ruang (hanya pantau ujian)'}">
              ${isPengawas ? '👨‍🏫 Mode Guru' : '👀 Jadi Pengawas'}
            </button>
          ` : ''}
          <button type="button" data-id="${t.id}" class="btn-edit-teacher px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition cursor-pointer mr-1">
            ✏️ Edit
          </button>
          ${!isSuperAdmin ? `
            <button type="button" data-id="${t.id}" class="btn-delete-teacher px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition cursor-pointer" title="Hapus Akun">
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

      const btnToggleRole = tr.querySelector('.btn-toggle-teacher-role');
      if (btnToggleRole) {
        btnToggleRole.addEventListener('click', async () => {
          const nextRole = isPengawas ? 'guru' : 'pengawas';
          const upRes = window.cbtAdmin.updateTeacherProfile(t.id, { role: nextRole });
          if (upRes.success) {
            if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
              await window.supabaseSync.pushStateKey('cbt_teachers_list', window.cbtAdmin.teachers).catch(() => null);
            }
            renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value || '');
            setupSubjectAndClassFilters();
            setupQuestionBankFilters();
            setupMonitoringControls();
            renderAdminTeacherQuestionProgress();
          } else if (upRes && upRes.message) {
            alert(upRes.message);
          }
        });
      }

      tr.querySelector('.btn-edit-teacher').addEventListener('click', () => openEditTeacherModal(t));

      const btnDelete = tr.querySelector('.btn-delete-teacher');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          if (confirm(`Yakin ingin menghapus akun "${t.name}"?`)) {
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
    applyRoleButtonPermissions();
  }

  const searchTeacherInput = document.getElementById('searchTeacherInput');
  if (searchTeacherInput) {
    searchTeacherInput.addEventListener('input', (e) => renderAdminTeachersList(e.target.value.trim()));
  }
  const filterTeacherRole = document.getElementById('filterTeacherRole');
  if (filterTeacherRole) {
    filterTeacherRole.addEventListener('change', () => {
      renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value.trim() || '');
    });
  }

  const modalEditTeacher = document.getElementById('modalEditTeacher');
  const formEditTeacher = document.getElementById('formEditTeacher');
  const btnCloseEditTeacher = document.getElementById('btnCloseEditTeacher');
  const btnCancelEditTeacher = document.getElementById('btnCancelEditTeacher');
  const btnOpenAddTeacher = document.getElementById('btnOpenAddTeacher');
  const editTeacherRoleSelect = document.getElementById('editTeacherRole');

  const PENGAWAS_WEEKLY_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  function readModalPengawasRoomSchedule() {
    const out = {};
    PENGAWAS_WEEKLY_DAYS.forEach(day => {
      const el = document.getElementById(`editTeacherRoom${day}`);
      const val = el ? el.value.trim().toUpperCase() : '';
      if (val) out[day] = val;
    });
    return out;
  }

  function writeModalPengawasRoomSchedule(schedObj = null) {
    const norm = (window.cbtAdmin && typeof window.cbtAdmin.normalizePengawasRoomSchedule === 'function')
      ? window.cbtAdmin.normalizePengawasRoomSchedule(schedObj)
      : {};
    PENGAWAS_WEEKLY_DAYS.forEach(day => {
      const el = document.getElementById(`editTeacherRoom${day}`);
      if (el) el.value = norm[day] || '';
    });
  }

  function syncTeacherModalRoleUI() {
    const roleVal = editTeacherRoleSelect ? editTeacherRoleSelect.value : 'guru';
    const isPengawas = roleVal === 'pengawas';
    const subjInput = document.getElementById('editTeacherSubject');
    const subjLabel = document.getElementById('editTeacherSubjectLabel');
    const subjHint = document.getElementById('editTeacherSubjectHint');
    const clsLabel = document.getElementById('editTeacherClassesLabel');
    const clsHint = document.getElementById('editTeacherClassesHint');
    const roomSchedWrap = document.getElementById('editTeacherRoomScheduleWrap');
    const pinInput = document.getElementById('editTeacherPin');

    if (subjInput) subjInput.required = !isPengawas;
    if (subjLabel) subjLabel.innerText = isPengawas ? 'Mata Pelajaran (Otomatis Mengikuti Jadwal Ruang)' : 'Mata Pelajaran yang Diampu';
    if (subjHint) {
      subjHint.innerHTML = isPengawas
        ? '👀 Akun <strong>Pengawas Ruang</strong> otomatis menampilkan mapel yang sedang diujikan di ruangnya (kolom ini boleh dikosongkan).'
        : '💡 Jika mengampu 2 mapel, pisahkan dengan koma atau garis miring (Contoh: <strong>Informatika, Prakarya</strong>).';
    }
    if (clsLabel) clsLabel.innerText = isPengawas ? 'Kelas / Ruang Tetap (Opsional — Kosongkan jika berganti tiap hari)' : 'Kelas yang Diampu (Opsional)';
    if (clsHint) {
      clsHint.innerHTML = isPengawas
        ? '🏫 <strong>Kosongkan</strong> agar akun tidak terkunci di 1 kelas saja (Pengawas memilih ruang saat login, atau atur jadwal Senin–Sabtu di bawah). Isi misal <strong>7A</strong> hanya jika tetap di 7A.'
        : '💡 Untuk mapel yang dibagi beberapa guru (misal IPA: <strong>7B, 7C</strong> atau <strong>8A, 8B</strong>). Kosongkan jika mengajar semua kelas.';
    }
    if (roomSchedWrap) {
      roomSchedWrap.classList.toggle('hidden', !isPengawas);
    }
    if (pinInput && !document.getElementById('editTeacherId').value) {
      if (isPengawas && pinInput.value === 'guru123') pinInput.value = 'pengawas123';
      else if (!isPengawas && pinInput.value === 'pengawas123') pinInput.value = 'guru123';
    }
  }

  if (editTeacherRoleSelect) {
    editTeacherRoleSelect.addEventListener('change', syncTeacherModalRoleUI);
  }

  if (btnOpenAddTeacher) btnOpenAddTeacher.addEventListener('click', openAddTeacherModal);

  function openAddTeacherModal() {
    if (!modalEditTeacher) return;
    document.getElementById('modalEditTeacherTitle').innerText = "Tambah Guru / Pengawas Baru";
    document.getElementById('modalEditTeacherSubtitle').innerText = "Pilih peran Guru Mapel atau Pengawas Ruang & atur PIN login";
    document.getElementById('btnSubmitEditTeacher').innerText = "Simpan Akun Baru";

    const roleGroup = document.getElementById('editTeacherRoleGroup');
    if (roleGroup) roleGroup.classList.remove('hidden');
    if (editTeacherRoleSelect) {
      editTeacherRoleSelect.disabled = false;
      editTeacherRoleSelect.value = "guru";
    }

    document.getElementById('editTeacherId').value = "";
    document.getElementById('editTeacherName').value = "";
    document.getElementById('editTeacherNip').value = "";
    document.getElementById('editTeacherSubject').value = "";
    document.getElementById('editTeacherClasses').value = "";
    writeModalPengawasRoomSchedule({});
    document.getElementById('editTeacherPin').value = "guru123";
    syncTeacherModalRoleUI();

    modalEditTeacher.classList.remove('hidden');
    document.getElementById('editTeacherName').focus();
  }

  function openEditTeacherModal(teacher) {
    if (!modalEditTeacher) return;
    const isSuperAdmin = teacher.role === 'admin' || teacher.id === 'admin';
    document.getElementById('modalEditTeacherTitle').innerText = isSuperAdmin ? "Edit Akun Proktor / Admin" : "Edit Data & Peran Akun";
    document.getElementById('modalEditTeacherSubtitle').innerText = "Perbarui peran (Guru/Pengawas), jadwal ruang Senin–Sabtu, atau PIN akun";
    document.getElementById('btnSubmitEditTeacher').innerText = "Simpan Perubahan";

    const roleGroup = document.getElementById('editTeacherRoleGroup');
    if (roleGroup) {
      if (isSuperAdmin) roleGroup.classList.add('hidden');
      else roleGroup.classList.remove('hidden');
    }
    if (editTeacherRoleSelect) {
      editTeacherRoleSelect.disabled = isSuperAdmin;
      editTeacherRoleSelect.value = String(teacher.role || '').toLowerCase() === 'pengawas' ? 'pengawas' : 'guru';
    }

    document.getElementById('editTeacherId').value = teacher.id;
    document.getElementById('editTeacherName').value = teacher.name;
    document.getElementById('editTeacherNip').value = teacher.nip;
    document.getElementById('editTeacherSubject').value = teacher.subject || "";
    document.getElementById('editTeacherClasses').value = teacher.classes || "";
    writeModalPengawasRoomSchedule(teacher.roomSchedule || {});
    document.getElementById('editTeacherPin').value = teacher.pin;
    syncTeacherModalRoleUI();

    modalEditTeacher.classList.remove('hidden');
  }

  function closeEditTeacherModal() {
    if (modalEditTeacher) modalEditTeacher.classList.add('hidden');
  }

  if (btnCloseEditTeacher) btnCloseEditTeacher.addEventListener('click', closeEditTeacherModal);
  if (btnCancelEditTeacher) btnCancelEditTeacher.addEventListener('click', closeEditTeacherModal);

  if (formEditTeacher) {
    formEditTeacher.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editTeacherId').value;
      const role = editTeacherRoleSelect && !editTeacherRoleSelect.disabled ? editTeacherRoleSelect.value : 'guru';
      const name = document.getElementById('editTeacherName').value.trim();
      const nip = document.getElementById('editTeacherNip').value.trim();
      const subject = document.getElementById('editTeacherSubject').value.trim();
      const classes = document.getElementById('editTeacherClasses').value.trim().toUpperCase();
      const roomSchedule = role === 'pengawas' ? readModalPengawasRoomSchedule() : {};
      const pin = document.getElementById('editTeacherPin').value.trim();

      if (!name || !nip || (role !== 'pengawas' && !subject) || !pin) {
        alert(role === 'pengawas'
          ? "Nama Pengawas, NIP/ID Login, dan PIN wajib diisi!"
          : "Semua kolom wajib harus diisi!");
        return;
      }

      const btnSub = document.getElementById('btnSubmitEditTeacher');
      const prevBtnText = btnSub ? btnSub.innerText : '';
      if (btnSub) {
        btnSub.disabled = true;
        btnSub.innerText = 'Menyimpan...';
      }

      try {
        if (!id) {
          const res = window.cbtAdmin.addTeacher({ name, nip, subject, classes, pin, role, roomSchedule });
          if (res.success) {
            let cloudMsg = '';
            if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
              const syncRes = await window.supabaseSync.pushStateKey('cbt_teachers_list', window.cbtAdmin.teachers).catch(() => ({ success: false }));
              if (!syncRes || !syncRes.success) {
                cloudMsg = '\n\n⚠️ Tersimpan di perangkat ini, namun sinkron ke Cloud tertunda. Klik "Kirim Semua Data ke Cloud" di Manajemen Database sebelum menguji login dari perangkat/tab lain.';
              }
            }
            alert(`Sukses! ${role === 'pengawas' ? 'Pengawas Ruang' : 'Guru'} "${name}" berhasil ditambahkan ke pangkalan data.${cloudMsg}`);
            closeEditTeacherModal();
            renderAdminTeachersList();
            setupSubjectAndClassFilters();
            setupQuestionBankFilters();
            setupMonitoringControls();
            renderAdminTeacherQuestionProgress();
          } else {
            alert(`Gagal menambah akun: ${res.message}`);
          }
        } else {
          const res = window.cbtAdmin.updateTeacherProfile(id, { name, nip, subject, classes, pin, role, roomSchedule });
          if (res.success) {
            let cloudMsg = '';
            if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
              const syncRes = await window.supabaseSync.pushStateKey('cbt_teachers_list', window.cbtAdmin.teachers).catch(() => ({ success: false }));
              if (!syncRes || !syncRes.success) {
                cloudMsg = '\n\n⚠️ Tersimpan di perangkat ini, namun sinkron ke Cloud tertunda. Klik "Kirim Semua Data ke Cloud" di Manajemen Database.';
              }
            }
            alert(`Data akun "${name}" berhasil diperbarui!${cloudMsg}`);
            closeEditTeacherModal();
            renderAdminTeachersList();
            setupSubjectAndClassFilters();
            setupQuestionBankFilters();
            setupMonitoringControls();
            renderAdminTeacherQuestionProgress();
            const cur = window.cbtAdmin.getCurrentTeacher();
            if (cur && cur.id === id) renderAdminDashboard();
          } else {
            alert(`Gagal edit akun: ${res.message}`);
          }
        }
      } finally {
        if (btnSub) {
          btnSub.disabled = false;
          btnSub.innerText = prevBtnText || 'Simpan';
        }
      }
    });
  }

  // Modal Matriks Jadwal Ruang Pengawas Senin - Sabtu
  const modalPengawasWeekly = document.getElementById('modalPengawasWeeklySchedule');
  const btnOpenPengawasWeekly = document.getElementById('btnOpenPengawasWeeklyMatrix');
  const btnClosePengawasWeekly = document.getElementById('btnClosePengawasWeeklyMatrix');
  const btnCancelPengawasWeekly = document.getElementById('btnCancelPengawasWeeklyMatrix');
  const btnSavePengawasWeekly = document.getElementById('btnSavePengawasWeeklyMatrix');

  function renderPengawasWeeklyMatrix() {
    const tbody = document.getElementById('pengawasWeeklyMatrixTbody');
    if (!tbody || !window.cbtAdmin) return;
    const pengawasList = (window.cbtAdmin.getAllTeachers() || []).filter(t => window.cbtAdmin.isPengawasUser(t));
    if (pengawasList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-500">Belum ada akun dengan peran <strong>Pengawas Ruang</strong>. Klik <strong>+ Tambah Guru / Pengawas</strong> atau ubah peran guru dengan tombol <strong>👀 Jadi Pengawas</strong>.</td></tr>';
      return;
    }
    tbody.innerHTML = pengawasList.map(t => {
      const sched = window.cbtAdmin.normalizePengawasRoomSchedule(t.roomSchedule);
      const dayInputs = PENGAWAS_WEEKLY_DAYS.map(day => `
        <td class="p-2 text-center">
          <input type="text" data-pw-id="${escapeHtmlSafe(t.id)}" data-pw-day="${day}" value="${escapeHtmlSafe(sched[day] || '')}" placeholder="-" class="w-20 px-1.5 py-1.5 rounded-lg border border-slate-300 bg-white uppercase font-bold text-center text-xs outline-none focus:ring-2 focus:ring-teal-500">
        </td>
      `).join('');
      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50/70">
          <td class="p-2.5">
            <div class="font-bold text-slate-900">${escapeHtmlSafe(t.name)}</div>
            <div class="text-[10px] font-mono text-slate-500">${escapeHtmlSafe(t.nip)}</div>
          </td>
          <td class="p-2 text-center">
            <input type="text" data-pw-id="${escapeHtmlSafe(t.id)}" data-pw-fixed="1" value="${escapeHtmlSafe(t.classes || '')}" placeholder="Kosong" class="w-24 px-1.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 uppercase font-bold text-center text-xs outline-none focus:ring-2 focus:ring-blue-500">
          </td>
          ${dayInputs}
        </tr>
      `;
    }).join('');
  }

  function closePengawasWeeklyModal() {
    if (modalPengawasWeekly) modalPengawasWeekly.classList.add('hidden');
  }

  if (btnOpenPengawasWeekly) {
    btnOpenPengawasWeekly.addEventListener('click', () => {
      renderPengawasWeeklyMatrix();
      if (modalPengawasWeekly) modalPengawasWeekly.classList.remove('hidden');
    });
  }
  if (btnClosePengawasWeekly) btnClosePengawasWeekly.addEventListener('click', closePengawasWeeklyModal);
  if (btnCancelPengawasWeekly) btnCancelPengawasWeekly.addEventListener('click', closePengawasWeeklyModal);
  if (btnSavePengawasWeekly) {
    btnSavePengawasWeekly.addEventListener('click', async () => {
      const tbody = document.getElementById('pengawasWeeklyMatrixTbody');
      if (!tbody || !window.cbtAdmin) return;
      const pengawasList = (window.cbtAdmin.getAllTeachers() || []).filter(t => window.cbtAdmin.isPengawasUser(t));
      if (pengawasList.length === 0) {
        closePengawasWeeklyModal();
        return;
      }
      const prevTxt = btnSavePengawasWeekly.innerText;
      btnSavePengawasWeekly.disabled = true;
      btnSavePengawasWeekly.innerText = 'Menyimpan...';
      try {
        pengawasList.forEach(t => {
          const fixedInp = tbody.querySelector(`input[data-pw-id="${t.id}"][data-pw-fixed="1"]`);
          const nextClasses = fixedInp ? fixedInp.value.trim().toUpperCase() : (t.classes || '');
          const nextSched = {};
          PENGAWAS_WEEKLY_DAYS.forEach(day => {
            const dInp = tbody.querySelector(`input[data-pw-id="${t.id}"][data-pw-day="${day}"]`);
            const val = dInp ? dInp.value.trim().toUpperCase() : '';
            if (val) nextSched[day] = val;
          });
          window.cbtAdmin.updateTeacherProfile(t.id, { classes: nextClasses, roomSchedule: nextSched });
        });

        let cloudMsg = '';
        if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
          const syncRes = await window.supabaseSync.pushStateKey('cbt_teachers_list', window.cbtAdmin.teachers).catch(() => ({ success: false }));
          if (!syncRes || !syncRes.success) {
            cloudMsg = '\n\n⚠️ Tersimpan di perangkat ini, namun sinkron ke Cloud tertunda. Klik "Kirim Semua Data ke Cloud" di Manajemen Database.';
          }
        }
        renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value || '');
        setupMonitoringControls();
        closePengawasWeeklyModal();
        alert(`Jadwal ruang pengawas Senin–Sabtu berhasil disimpan!${cloudMsg}`);
      } finally {
        btnSavePengawasWeekly.disabled = false;
        btnSavePengawasWeekly.innerText = prevTxt;
      }
    });
  }

  const btnResetAllTeacherPasswords = document.getElementById('btnResetAllTeacherPasswords');
  if (btnResetAllTeacherPasswords) {
    btnResetAllTeacherPasswords.addEventListener('click', () => {
      if (confirm("Yakin ingin mereset password/PIN SELURUH guru & pengawas ke default 'guru123'?")) {
        const res = window.cbtAdmin.resetAllTeacherPasswords("guru123");
        alert(`Sukses! Password ${res.count} akun guru/pengawas telah direset ke 'guru123'.`);
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
      let labelDesc = 'Guru & Pengawas';
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
        <option value="GURU_ONLY">Semua Guru &amp; Pengawas (${guruOnlyList.length} Akun)</option>
        <option value="ALL">Semua Akun (+ Proktor/Admin: ${allTeachers.length})</option>
      `;
      allTeachers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = `TEACHER:${t.id}`;
        const isAdm = t.role === 'admin' || t.id === 'admin';
        const isPeng = !isAdm && String(t.role || '').toLowerCase() === 'pengawas';
        const roleTag = isAdm ? 'Admin' : (isPeng ? `Pengawas${t.classes ? ' ' + t.classes : ''}` : (t.subject || 'Guru'));
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
    const catEl = document.getElementById('cfgQuestionCategory');
    if (catEl) catEl.value = config.questionCategory || 'ALL';
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
        questionCategory: document.getElementById('cfgQuestionCategory')?.value || 'ALL',
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
      renderAdminSchedulesList();
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
    renderButtonPermissionsControl();
  }

  // ===================== KONTROL HAK NONAKTIFKAN TOMBOL (ADMIN & GURU) =====================
  let permControlsBound = false;

  function applyRoleButtonPermissions() {
    if (!window.cbtAdmin || typeof window.cbtAdmin.getButtonPermissionCatalog !== 'function') return;
    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    if (!currentTeacher) return;

    const isAdmin = Boolean(currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const isPengawas = Boolean(!isAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser(currentTeacher));
    const catalog = window.cbtAdmin.getButtonPermissionCatalog();
    const perms = window.cbtAdmin.getButtonPermissions();
    const mode = perms.mode === 'hide' ? 'hide' : 'disable';
    const disabledMap = perms.disabled || {};

    // Gabungkan semua selector agar elemen yang sebelumnya dikunci bisa dipulihkan bersih terlebih dahulu
    const allItems = [...(catalog.guru || []), ...(catalog.admin || [])];
    const selectorLockStatus = new Map();

    allItems.forEach(item => {
      if (!item || !item.selector) return;
      if (!selectorLockStatus.has(item.selector)) {
        selectorLockStatus.set(item.selector, false);
      }
    });

    const activeRoleItems = isAdmin ? (catalog.admin || []) : (catalog.guru || []);
    activeRoleItems.forEach(item => {
      if (isPengawas && item && item.key === 'guru_tab_monitoring') return;
      if (item && item.selector && disabledMap[item.key] === true) {
        selectorLockStatus.set(item.selector, true);
      }
    });

    const viewAdminRoot = document.getElementById('viewAdmin') || document;
    selectorLockStatus.forEach((shouldLock, selector) => {
      let nodes = [];
      try {
        nodes = Array.from(viewAdminRoot.querySelectorAll(selector));
      } catch (e) {
        nodes = [];
      }
      nodes.forEach(el => {
        if (!el || el.closest('#adminButtonPermissionsCard')) return;

        if (shouldLock) {
          if (el.dataset.permOrigTitle === undefined) {
            el.dataset.permOrigTitle = el.getAttribute('title') || '';
          }
          el.dataset.permLocked = '1';
          if (mode === 'hide') {
            el.classList.add('cbt-perm-hidden');
            el.classList.remove('cbt-perm-disabled');
            if ('disabled' in el) el.disabled = false;
          } else {
            el.classList.remove('cbt-perm-hidden');
            el.classList.add('cbt-perm-disabled');
            if ('disabled' in el) el.disabled = true;
            el.setAttribute('title', '🔒 Tombol ini dinonaktifkan dari Pengaturan Admin');
          }
        } else {
          el.classList.remove('cbt-perm-hidden', 'cbt-perm-disabled');
          if (el.dataset.permLocked === '1') {
            if ('disabled' in el) el.disabled = false;
            delete el.dataset.permLocked;
          }
          if (el.dataset.permOrigTitle !== undefined) {
            if (el.dataset.permOrigTitle) {
              el.setAttribute('title', el.dataset.permOrigTitle);
            } else {
              el.removeAttribute('title');
            }
            delete el.dataset.permOrigTitle;
          }
        }
      });
    });

    // Jika tab aktif sekarang tiba-tiba dinonaktifkan lewat sync Cloud/Pengaturan, pindahkan ke Dashboard
    if (typeof window.cbtAdmin.isTabDisabledForRole === 'function') {
      const currentActiveBtn = document.querySelector('#adminTabsBar .admin-tab-btn.from-\\[\\#124196\\]');
      const currentTabId = currentActiveBtn ? currentActiveBtn.getAttribute('data-tab') : '';
      if (currentTabId && window.cbtAdmin.isTabDisabledForRole(currentTabId, isAdmin)) {
        switchAdminTab('tabDashboard', { skipSkeleton: true });
      }
    }
  }

  function flashPermSyncStatus(text = '✓ Tersimpan & Tersinkron Cloud') {
    const badge = document.getElementById('permSyncBadge');
    if (!badge) return;
    badge.innerText = text;
    badge.className = 'px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold transition';
  }

  function renderPermissionRoleColumn(containerEl, counterEl, items, perms, searchQuery, roleTag) {
    if (!containerEl) return;
    const disabledMap = perms.disabled || {};
    const q = String(searchQuery || '').trim().toLowerCase();

    const totalCount = items.length;
    const disabledCount = items.filter(it => disabledMap[it.key] === true).length;
    if (counterEl) {
      counterEl.innerText = `${disabledCount} / ${totalCount} Dinonaktifkan`;
      counterEl.className = disabledCount > 0
        ? 'text-[11px] text-rose-600 dark:text-rose-300 font-bold mt-0.5'
        : 'text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold mt-0.5';
    }

    const filteredItems = q
      ? items.filter(it => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q))
      : items;

    if (filteredItems.length === 0) {
      containerEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Tidak ada tombol/menu yang cocok dengan pencarian.</div>`;
      return;
    }

    const grouped = new Map();
    filteredItems.forEach(it => {
      if (!grouped.has(it.group)) grouped.set(it.group, []);
      grouped.get(it.group).push(it);
    });

    const htmlParts = [];
    grouped.forEach((groupItems, groupName) => {
      htmlParts.push(`
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-700 p-2.5 space-y-1.5">
          <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 pb-1 border-b border-slate-100 dark:border-slate-800">${escapeHtmlSafe(groupName)}</p>
          ${groupItems.map(it => {
            const isDisabled = disabledMap[it.key] === true;
            return `
              <label class="flex items-center justify-between gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer transition">
                <div class="min-w-0">
                  <span class="block text-xs font-bold ${isDisabled ? 'text-rose-700 dark:text-rose-300 line-through decoration-rose-400/70' : 'text-slate-800 dark:text-slate-100'}">${escapeHtmlSafe(it.label)}</span>
                  <span class="block text-[10px] font-semibold ${isDisabled ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">
                    ${isDisabled ? '🔒 Dinonaktifkan' : '✅ Aktif (Bisa Dipakai)'}
                  </span>
                </div>
                <div class="shrink-0 flex items-center gap-2">
                  <input type="checkbox" class="perm-toggle-checkbox sr-only" data-perm-key="${escapeHtmlSafe(it.key)}" data-perm-role="${escapeHtmlSafe(roleTag)}" ${isDisabled ? '' : 'checked'}>
                  <span class="w-10 h-5 rounded-full transition-colors relative inline-flex items-center px-0.5 ${isDisabled ? 'bg-rose-500/85' : 'bg-emerald-500'}">
                    <span class="w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform ${isDisabled ? 'translate-x-0' : 'translate-x-5'}"></span>
                  </span>
                </div>
              </label>
            `;
          }).join('')}
        </div>
      `);
    });

    containerEl.innerHTML = htmlParts.join('');

    containerEl.querySelectorAll('.perm-toggle-checkbox').forEach(chk => {
      chk.addEventListener('change', () => {
        const key = chk.getAttribute('data-perm-key');
        if (!key || !window.cbtAdmin) return;
        const latestPerms = window.cbtAdmin.getButtonPermissions();
        const nextDisabled = { ...(latestPerms.disabled || {}) };
        if (chk.checked) {
          delete nextDisabled[key];
        } else {
          nextDisabled[key] = true;
        }
        window.cbtAdmin.saveButtonPermissions({
          ...latestPerms,
          disabled: nextDisabled
        });
        flashPermSyncStatus('✓ Tersimpan & Tersinkron Cloud');
        renderButtonPermissionsControl();
        applyRoleButtonPermissions();
      });
    });
  }

  function renderButtonPermissionsControl() {
    if (!window.cbtAdmin || typeof window.cbtAdmin.getButtonPermissionCatalog !== 'function') return;
    const card = document.getElementById('adminButtonPermissionsCard');
    if (!card) return;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = Boolean(currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin'));
    if (!isAdmin) return;

    const catalog = window.cbtAdmin.getButtonPermissionCatalog();
    const perms = window.cbtAdmin.getButtonPermissions();
    const searchEl = document.getElementById('permSearchInput');
    const behaviorEl = document.getElementById('permBehaviorSelect');

    if (behaviorEl) {
      behaviorEl.value = perms.mode === 'hide' ? 'hide' : 'disable';
    }

    const query = searchEl ? searchEl.value : '';
    renderPermissionRoleColumn(
      document.getElementById('permGuruListContainer'),
      document.getElementById('permGuruCounter'),
      catalog.guru || [],
      perms,
      query,
      'guru'
    );
    renderPermissionRoleColumn(
      document.getElementById('permAdminListContainer'),
      document.getElementById('permAdminCounter'),
      catalog.admin || [],
      perms,
      query,
      'admin'
    );

    if (!permControlsBound) {
      permControlsBound = true;

      if (searchEl) {
        searchEl.addEventListener('input', () => renderButtonPermissionsControl());
      }

      if (behaviorEl) {
        behaviorEl.addEventListener('change', () => {
          const latestPerms = window.cbtAdmin.getButtonPermissions();
          window.cbtAdmin.saveButtonPermissions({
            ...latestPerms,
            mode: behaviorEl.value === 'hide' ? 'hide' : 'disable'
          });
          flashPermSyncStatus('✓ Mode Tampilan Tersimpan');
          applyRoleButtonPermissions();
        });
      }

      const batchToggleRole = (roleKey, disableAll) => {
        const latestCatalog = window.cbtAdmin.getButtonPermissionCatalog();
        const roleItems = roleKey === 'admin' ? (latestCatalog.admin || []) : (latestCatalog.guru || []);
        if (roleKey === 'admin' && disableAll) {
          if (!confirm("Yakin ingin menonaktifkan semua tombol & menu di Panel Admin (kecuali menu Pengaturan ini)?\n\nAnda tetap bisa mengaktifkannya kembali kapan saja di halaman ini.")) {
            return;
          }
        }
        const latestPerms = window.cbtAdmin.getButtonPermissions();
        const nextDisabled = { ...(latestPerms.disabled || {}) };
        roleItems.forEach(it => {
          if (disableAll) nextDisabled[it.key] = true;
          else delete nextDisabled[it.key];
        });
        window.cbtAdmin.saveButtonPermissions({
          ...latestPerms,
          disabled: nextDisabled
        });
        flashPermSyncStatus(disableAll ? '✓ Semua Tombol Dinonaktifkan' : '✓ Semua Tombol Diaktifkan');
        renderButtonPermissionsControl();
        applyRoleButtonPermissions();
      };

      document.getElementById('btnPermGuruEnableAll')?.addEventListener('click', () => batchToggleRole('guru', false));
      document.getElementById('btnPermGuruDisableAll')?.addEventListener('click', () => batchToggleRole('guru', true));
      document.getElementById('btnPermAdminEnableAll')?.addEventListener('click', () => batchToggleRole('admin', false));
      document.getElementById('btnPermAdminDisableAll')?.addEventListener('click', () => batchToggleRole('admin', true));
    }
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

  async function refreshSupabaseTablesHealthUI(urlOverride = null, keyOverride = null) {
    const badge = document.getElementById('supabaseOverallHealthBadge');
    const banner = document.getElementById('supabaseHealthSummaryBanner');
    const grid = document.getElementById('supabaseTablesHealthGrid');
    if (!badge || !banner || !grid || !window.supabaseSync || typeof window.supabaseSync.checkTablesHealth !== 'function') {
      return null;
    }

    const inputUrl = document.getElementById('cfgSupabaseUrl')?.value?.trim() || '';
    const inputKey = document.getElementById('cfgSupabaseKey')?.value?.trim() || '';
    const targetUrl = String(urlOverride || inputUrl || window.supabaseSync.config?.supabaseUrl || '').trim();
    const targetKey = String(keyOverride || inputKey || window.supabaseSync.config?.supabaseKey || '').trim();

    if (!targetUrl || !targetKey) {
      badge.className = 'px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold';
      badge.innerText = 'Belum Terhubung';
      banner.className = 'mt-3 p-3 rounded-2xl text-xs leading-relaxed bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
      banner.innerHTML = 'Masukkan <strong>Supabase Project URL</strong> dan <strong>Anon Public API Key</strong> terlebih dahulu, lalu simpan konfigurasi untuk mengecek status 6 tabel khusus.';
      grid.innerHTML = '';
      return null;
    }

    badge.className = 'px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold animate-pulse';
    badge.innerText = 'Mengecek Tabel...';

    const health = await window.supabaseSync.checkTablesHealth(targetUrl, targetKey);
    if (!health || !health.success) {
      badge.className = 'px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-bold';
      badge.innerText = 'Gagal Mengecek';
      banner.className = 'mt-3 p-3 rounded-2xl text-xs leading-relaxed bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800';
      banner.innerHTML = `<strong>Gagal memeriksa database Supabase:</strong> ${escapeHtmlSafe(health?.message || 'Periksa koneksi internet serta URL/Key Supabase Anda.')}`;
      return health;
    }

    const totalTables = Array.isArray(health.tables) ? health.tables.length : 6;
    const readyCount = Array.isArray(health.tables) ? health.tables.filter(t => t.ready).length : 0;

    if (health.allOptimal) {
      badge.className = 'px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold';
      badge.innerText = `✅ ${readyCount}/${totalTables} Tabel + RPC Optimal`;
      banner.className = 'mt-3 p-3 rounded-2xl text-xs leading-relaxed bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800';
      banner.innerHTML = '<strong>🚀 Database Sudah Optimal untuk 250 Siswa Serentak!</strong> Semua 6 tabel khusus (termasuk brankas kunci &amp; brankas token server) serta validasi server-side sudah aktif &amp; terkunci aman.';
    } else if (health.allDedicatedTablesReady && (!health.rpcReady || !health.tokenRpcReady || health.classMatcherFixed === false)) {
      badge.className = 'px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-bold';
      badge.innerText = `⚡ ${readyCount}/${totalTables} Tabel Aktif (Perbarui SQL RPC)`;
      banner.className = 'mt-3 p-3 rounded-2xl text-xs leading-relaxed bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800';
      banner.innerHTML = `<strong>Semua ${totalTables} tabel sudah ada</strong>, namun fungsi server (RPC validasi token / pencocokan kelas VII–IX) belum versi terbaru. Klik <strong>📋 Salin Script SQL Optimal</strong> lalu jalankan (<strong>Run</strong>) di <em>SQL Editor</em> Supabase untuk pembaruan lengkap.`;
    } else {
      badge.className = 'px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-bold';
      badge.innerText = `⚠️ Mode Fallback (${health.missingTables.length} Tabel Belum Ada)`;
      banner.className = 'mt-3 p-3 rounded-2xl text-xs leading-relaxed bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800';
      banner.innerHTML = `<strong>⚠️ Masih perlu pembaruan tabel khusus</strong> (tabel berikut belum dibuat: <code>${escapeHtmlSafe(health.missingTables.join(', ') || '-')}</code>).<br>Agar brankas token server &amp; ujian serentak <strong>250 siswa</strong> aman optimal: klik <strong>📋 Salin Script SQL Optimal</strong> → Paste &amp; klik <strong>Run</strong> di menu <em>SQL Editor</em> Supabase → lalu klik <strong>🚀 Pindahkan &amp; Sinkronkan Data ke Tabel Khusus</strong>.`;
    }

    const cards = (health.tables || []).map(tbl => {
      const ok = Boolean(tbl.ready);
      const wrapCls = ok
        ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25'
        : 'border-amber-300 dark:border-amber-700/70 bg-amber-50/60 dark:bg-amber-950/30';
      const statusBadge = ok
        ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">✅ ${escapeHtmlSafe(tbl.note || 'Aktif')}</span>`
        : `<span class="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/70 text-amber-800 dark:text-amber-300 text-[10px] font-bold">⚠️ ${escapeHtmlSafe(tbl.note || 'Belum Aktif')}</span>`;
      return `
        <div class="p-3 rounded-2xl border ${wrapCls} flex flex-col justify-between gap-1.5">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-extrabold text-slate-800 dark:text-slate-100 text-xs">${escapeHtmlSafe(tbl.label)}</p>
              <p class="font-mono text-[10px] text-slate-500 dark:text-slate-400">${escapeHtmlSafe(tbl.name)}</p>
            </div>
            ${statusBadge}
          </div>
          <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">${escapeHtmlSafe(tbl.purpose)}</p>
        </div>
      `;
    });

    const rpcWrapCls = health.rpcReady
      ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25'
      : 'border-amber-300 dark:border-amber-700/70 bg-amber-50/60 dark:bg-amber-950/30';
    const rpcStatusBadge = health.rpcReady
      ? '<span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">✅ Aktif &amp; Terkunci</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/70 text-amber-800 dark:text-amber-300 text-[10px] font-bold">⚠️ Belum Terpasang</span>';

    cards.push(`
      <div class="p-3 rounded-2xl border ${rpcWrapCls} flex flex-col justify-between gap-1.5">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-extrabold text-slate-800 dark:text-slate-100 text-xs">RPC Keamanan &amp; Index</p>
            <p class="font-mono text-[10px] text-slate-500 dark:text-slate-400">cbt_grade_and_submit_exam</p>
          </div>
          ${rpcStatusBadge}
        </div>
        <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">Koreksi nilai otomatis di server &amp; index cepat untuk 250 siswa serentak.</p>
      </div>
    `);

    grid.innerHTML = cards.join('');
    refreshWorkerEgressMonitorUI(targetUrl);
    return health;
  }

  function renderWorkerEgressStatsUI(stats) {
    const warnBanner = document.getElementById('adminEgressEarlyWarningBanner');
    const warnTitle = document.getElementById('adminEgressWarningTitle');
    const warnText = document.getElementById('adminEgressWarningText');
    const warnIcon = document.getElementById('adminEgressWarningIcon');
    const badge = document.getElementById('workerEgressStatusBadge');
    const body = document.getElementById('workerEgressMonitorBody');

    const isAdmin = Boolean(window.cbtAdmin && typeof window.cbtAdmin.isSuperAdminUser === 'function' && window.cbtAdmin.isSuperAdminUser());

    const cloudRestrictedMsg = (window.supabaseSync && window.supabaseSync.lastCloudRestrictionMessage) || '';

    if (!stats || !stats.supported) {
      if (warnBanner) {
        if (isAdmin && cloudRestrictedMsg) {
          warnBanner.className = 'rounded-2xl border p-3.5 sm:p-4 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-3 bg-rose-50 border-rose-300 text-rose-900';
          if (warnIcon) warnIcon.innerText = '🚨';
          if (warnTitle) warnTitle.innerText = 'Cloud Supabase Terkunci (exceed_egress_quota) — Mode Login Darurat Lokal Aktif';
          if (warnText) warnText.innerText = 'Database Supabase sedang dibatasi kuota egress. Segera buka menu Manajemen Database untuk beralih ke Cloudflare D1 atau ganti ke project aktif.';
        } else {
          warnBanner.classList.add('hidden');
        }
      }
      if (badge) {
        badge.className = 'px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold';
        badge.innerText = stats && stats.reason === 'not_proxy' ? 'Non-Worker' : 'Pelacak Belum Aktif';
      }
      if (body) {
        body.innerHTML = stats && stats.reason === 'not_proxy'
          ? '<p class="text-slate-500">URL Cloud saat ini mengarah langsung ke Supabase (belum lewat Cloudflare Worker).</p>'
          : '<p class="text-slate-500">Endpoint <code>/__cbt-egress-stats</code> belum tersedia di Worker. Pasang script pelacak egress di Cloudflare Worker Anda lalu klik <strong>🔄 Cek Kuota Egress</strong>.</p>';
      }
      return;
    }

    const pct = Math.max(0, Number(stats.percentUsed || 0));
    const barPct = Math.min(100, pct);
    const status = String(stats.status || 'OK').toUpperCase();

    if (warnBanner && isAdmin) {
      if (status === 'EXCEEDED' || status === 'CRITICAL') {
        warnBanner.className = 'rounded-2xl border p-3.5 sm:p-4 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-3 bg-rose-50 border-rose-300 text-rose-900';
        if (warnIcon) warnIcon.innerText = '🚨';
        if (warnTitle) warnTitle.innerText = status === 'EXCEEDED' ? 'Kuota Egress Supabase Terlampaui!' : 'Peringatan Kritis Kuota Egress Supabase';
        if (warnText) warnText.innerText = stats.warningMessage || `Pemakaian mencapai ${pct}% (${stats.egressMB} MB dari ${stats.quotaGB || 5} GB).`;
      } else if (status === 'WARNING') {
        warnBanner.className = 'rounded-2xl border p-3.5 sm:p-4 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-3 bg-amber-50 border-amber-300 text-amber-900';
        if (warnIcon) warnIcon.innerText = '⚠️';
        if (warnTitle) warnTitle.innerText = 'Peringatan Dini Kuota Egress Supabase';
        if (warnText) warnText.innerText = stats.warningMessage || `Pemakaian mencapai ${pct}% (${stats.egressMB} MB dari ${stats.quotaGB || 5} GB).`;
      } else {
        warnBanner.classList.add('hidden');
      }
    } else if (warnBanner) {
      warnBanner.classList.add('hidden');
    }

    if (badge) {
      if (status === 'EXCEEDED' || status === 'CRITICAL') {
        badge.className = 'px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold';
        badge.innerText = `${status === 'EXCEEDED' ? '🚨 Penuh' : '🚨 Kritis'} (${pct}%)`;
      } else if (status === 'WARNING') {
        badge.className = 'px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold';
        badge.innerText = `⚠️ Peringatan (${pct}%)`;
      } else {
        badge.className = 'px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold';
        badge.innerText = `✅ Aman (${pct}%)`;
      }
    }

    if (body) {
      const barColor = (status === 'EXCEEDED' || status === 'CRITICAL')
        ? 'bg-rose-600'
        : (status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-600');
      const warnBox = stats.warningMessage
        ? `<div class="p-2.5 rounded-xl border ${status === 'WARNING' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-900'} font-semibold">${escapeHtmlSafe(stats.warningMessage)}</div>`
        : '';
      const epRows = Array.isArray(stats.topEndpoints) && stats.topEndpoints.length > 0
        ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">${stats.topEndpoints.map(ep => `
            <div class="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-[11px]">
              <span class="font-mono text-slate-700 truncate">${escapeHtmlSafe(ep.name)}</span>
              <span class="font-bold text-slate-900 shrink-0">${ep.egressMB} MB <span class="text-emerald-700 font-semibold">(hemat ${ep.savedMB} MB)</span></span>
            </div>
          `).join('')}</div>`
        : '';

      body.innerHTML = `
        ${warnBox}
        <div class="space-y-1.5">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span class="font-bold text-slate-800">Terpakai: ${stats.egressMB} MB / ${stats.quotaMB} MB (${pct}%)</span>
            <span class="text-[11px] text-slate-500">Periode: ${escapeHtmlSafe(String(stats.billingWindow || '-').replace('_to_', ' s/d '))}</span>
          </div>
          <div class="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
            <div class="h-full ${barColor} transition-all" style="width:${barPct}%"></div>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <p class="text-slate-500">Egress ke Supabase</p>
            <p class="font-extrabold text-slate-900 text-xs mt-0.5">${stats.egressMB} MB</p>
          </div>
          <div class="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <p class="text-emerald-700">Dihemat Cache CF</p>
            <p class="font-extrabold text-emerald-900 text-xs mt-0.5">${stats.savedMB} MB</p>
          </div>
          <div class="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
            <p class="text-indigo-700">Rasio Cache Hit</p>
            <p class="font-extrabold text-indigo-900 text-xs mt-0.5">${stats.cacheHitRatePct || 0}% (${stats.cacheHits || 0} hit)</p>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <p class="text-slate-500">Penyimpanan Counter</p>
            <p class="font-extrabold text-slate-800 text-xs mt-0.5">${escapeHtmlSafe(stats.persistentBackend || 'worker-memory')}</p>
          </div>
        </div>
        ${epRows}
      `;
    }
  }

  async function refreshWorkerEgressMonitorUI(urlOverride = null) {
    if (!window.supabaseSync || typeof window.supabaseSync.fetchWorkerEgressStats !== 'function') {
      return null;
    }
    const inputUrl = document.getElementById('cfgSupabaseUrl')?.value?.trim() || '';
    const targetUrl = String(urlOverride || inputUrl || window.supabaseSync.config?.supabaseUrl || '').trim();
    const stats = await window.supabaseSync.fetchWorkerEgressStats(targetUrl);
    renderWorkerEgressStatsUI(stats);
    return stats;
  }

  const btnRefreshWorkerEgress = document.getElementById('btnRefreshWorkerEgress');
  if (btnRefreshWorkerEgress) {
    btnRefreshWorkerEgress.addEventListener('click', async () => {
      btnRefreshWorkerEgress.disabled = true;
      btnRefreshWorkerEgress.innerText = '⏳ Mengecek...';
      await refreshWorkerEgressMonitorUI();
      btnRefreshWorkerEgress.disabled = false;
      btnRefreshWorkerEgress.innerText = '🔄 Cek Kuota Egress';
    });
  }

  const btnCalibrateWorkerEgress = document.getElementById('btnCalibrateWorkerEgress');
  const workerEgressCalibrateBox = document.getElementById('workerEgressCalibrateBox');
  const inputWorkerEgressInitialMb = document.getElementById('inputWorkerEgressInitialMb');
  const btnSaveWorkerEgressInitialMb = document.getElementById('btnSaveWorkerEgressInitialMb');
  const btnCancelWorkerEgressInitialMb = document.getElementById('btnCancelWorkerEgressInitialMb');
  const workerEgressActionMsg = document.getElementById('workerEgressActionMsg');

  if (btnCalibrateWorkerEgress && workerEgressCalibrateBox) {
    btnCalibrateWorkerEgress.addEventListener('click', () => {
      workerEgressCalibrateBox.classList.toggle('hidden');
      if (!workerEgressCalibrateBox.classList.contains('hidden') && inputWorkerEgressInitialMb) {
        inputWorkerEgressInitialMb.focus();
      }
    });
  }
  if (btnCancelWorkerEgressInitialMb && workerEgressCalibrateBox) {
    btnCancelWorkerEgressInitialMb.addEventListener('click', () => {
      workerEgressCalibrateBox.classList.add('hidden');
    });
  }
  if (btnSaveWorkerEgressInitialMb) {
    btnSaveWorkerEgressInitialMb.addEventListener('click', async () => {
      const mbVal = Math.max(0, Number(inputWorkerEgressInitialMb?.value || 0));
      const res = await window.supabaseSync.calibrateWorkerEgress('set_initial_mb', mbVal);
      if (workerEgressCalibrateBox) workerEgressCalibrateBox.classList.add('hidden');
      if (res && res.supported) {
        renderWorkerEgressStatsUI(res);
        if (workerEgressActionMsg) workerEgressActionMsg.innerText = `Kalibrasi tersimpan (${mbVal} MB).`;
      } else if (workerEgressActionMsg) {
        workerEgressActionMsg.innerText = 'Pelacak egress belum aktif di Worker.';
      }
    });
  }

  const btnResetWorkerEgress = document.getElementById('btnResetWorkerEgress');
  if (btnResetWorkerEgress) {
    btnResetWorkerEgress.addEventListener('click', async () => {
      const res = await window.supabaseSync.calibrateWorkerEgress('reset', 0);
      if (res && res.supported) {
        renderWorkerEgressStatsUI(res);
        if (workerEgressActionMsg) workerEgressActionMsg.innerText = 'Counter periode ini direset ke 0 MB.';
      } else if (workerEgressActionMsg) {
        workerEgressActionMsg.innerText = 'Pelacak egress belum aktif di Worker.';
      }
    });
  }

  async function loadSupabaseSchemaSqlText() {
    const resp = await fetch('/supabase-schema.sql?v=3.70', { cache: 'no-store' });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return await resp.text();
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
      await refreshSupabaseTablesHealthUI(url, key);
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
      refreshSupabaseTablesHealthUI();
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
      await refreshSupabaseTablesHealthUI(url, key);
      updateCloudBadge();
      setTimeout(() => alert(res.message), 30);
    });
  }

  const btnCheckSupabaseTables = document.getElementById('btnCheckSupabaseTables');
  if (btnCheckSupabaseTables) {
    btnCheckSupabaseTables.addEventListener('click', async () => {
      btnCheckSupabaseTables.disabled = true;
      btnCheckSupabaseTables.innerText = "⏳ Mengecek...";
      await refreshSupabaseTablesHealthUI();
      btnCheckSupabaseTables.disabled = false;
      btnCheckSupabaseTables.innerText = "🔍 Cek Status Tabel";
    });
  }

  const btnCopySupabaseSchemaSql = document.getElementById('btnCopySupabaseSchemaSql');
  const supabaseSqlPreviewWrap = document.getElementById('supabaseSqlPreviewWrap');
  const supabaseSqlPreviewTextarea = document.getElementById('supabaseSqlPreviewTextarea');
  const btnCloseSqlPreview = document.getElementById('btnCloseSqlPreview');

  if (btnCloseSqlPreview && supabaseSqlPreviewWrap) {
    btnCloseSqlPreview.addEventListener('click', () => {
      supabaseSqlPreviewWrap.classList.add('hidden');
    });
  }

  if (btnCopySupabaseSchemaSql) {
    btnCopySupabaseSchemaSql.addEventListener('click', async () => {
      const origHtml = btnCopySupabaseSchemaSql.innerHTML;
      btnCopySupabaseSchemaSql.disabled = true;
      btnCopySupabaseSchemaSql.innerHTML = '<span>⏳ Memuat SQL...</span>';
      try {
        const sqlText = await loadSupabaseSchemaSqlText();
        if (supabaseSqlPreviewTextarea) supabaseSqlPreviewTextarea.value = sqlText;
        if (supabaseSqlPreviewWrap) supabaseSqlPreviewWrap.classList.remove('hidden');

        let copied = false;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            await navigator.clipboard.writeText(sqlText);
            copied = true;
          } catch (e) {}
        }
        if (!copied && supabaseSqlPreviewTextarea) {
          supabaseSqlPreviewTextarea.focus();
          supabaseSqlPreviewTextarea.select();
          try {
            copied = document.execCommand('copy');
          } catch (e) {}
        }

        if (copied) {
          alert("✅ Script SQL Optimal berhasil disalin ke Clipboard!\n\nLangkah selanjutnya:\n1. Buka Dashboard Supabase Anda → menu 'SQL Editor' → '+ New query'\n2. Paste (Ctrl+V) script SQL yang barusan disalin\n3. Klik tombol 'Run'\n4. Kembali ke aplikasi ini, lalu klik '🚀 Pindahkan & Sinkronkan Data ke Tabel Khusus'.");
        } else {
          alert("Script SQL sudah ditampilkan di kotak di bawah tombol.\nSilakan tekan Ctrl+A lalu Ctrl+C pada kotak teks tersebut, kemudian Paste & Run di SQL Editor Supabase.");
        }
      } catch (err) {
        alert("Gagal memuat file supabase-schema.sql: " + (err.message || err));
      } finally {
        btnCopySupabaseSchemaSql.disabled = false;
        btnCopySupabaseSchemaSql.innerHTML = origHtml;
      }
    });
  }

  const btnDownloadSupabaseSchemaSql = document.getElementById('btnDownloadSupabaseSchemaSql');
  if (btnDownloadSupabaseSchemaSql) {
    btnDownloadSupabaseSchemaSql.addEventListener('click', async () => {
      const origHtml = btnDownloadSupabaseSchemaSql.innerHTML;
      btnDownloadSupabaseSchemaSql.disabled = true;
      btnDownloadSupabaseSchemaSql.innerHTML = '<span>⏳ Mengunduh...</span>';
      try {
        const sqlText = await loadSupabaseSchemaSqlText();
        const blob = new Blob([sqlText], { type: 'text/sql;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'supabase-schema.sql';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert("Gagal mengunduh supabase-schema.sql: " + (err.message || err));
      } finally {
        btnDownloadSupabaseSchemaSql.disabled = false;
        btnDownloadSupabaseSchemaSql.innerHTML = origHtml;
      }
    });
  }

  const btnMigrateToDedicatedTables = document.getElementById('btnMigrateToDedicatedTables');
  if (btnMigrateToDedicatedTables) {
    btnMigrateToDedicatedTables.addEventListener('click', async () => {
      if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum aktif. Simpan Project URL dan Anon Key terlebih dahulu.");
        return;
      }
      const origHtml = btnMigrateToDedicatedTables.innerHTML;
      btnMigrateToDedicatedTables.disabled = true;
      btnMigrateToDedicatedTables.innerHTML = '<span>⏳ Memindahkan ke Tabel Khusus...</span>';
      try {
        const res = await window.supabaseSync.migrateFallbackToDedicatedTables();
        await refreshSupabaseTablesHealthUI();
        if (res && res.success) {
          alert(res.message);
        } else {
          alert("⚠️ " + (res?.message || "Gagal memindahkan data ke tabel khusus."));
        }
      } catch (err) {
        alert("Terjadi kesalahan saat migrasi: " + (err.message || err));
      } finally {
        btnMigrateToDedicatedTables.disabled = false;
        btnMigrateToDedicatedTables.innerHTML = origHtml;
      }
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
      const origBtnHtml = btnTriggerImportFullBackup.innerHTML;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        btnTriggerImportFullBackup.disabled = true;
        btnTriggerImportFullBackup.innerText = '⏳ Memulihkan & Sinkron ke Cloud...';
        try {
          const res = window.cbtAdmin.importAllAppData(evt.target.result, { deferCloudSync: true });
          if (!res.success) {
            alert(res.message);
            return;
          }

          renderAdminDashboard();
          renderConfigInfoOnLogin();
          updateCloudBadge();

          let cloudNote = '';
          if (typeof window.cbtAdmin.syncRestoredBackupToCloud === 'function') {
            const cloudRes = await window.cbtAdmin.syncRestoredBackupToCloud(window.examEngine ? window.examEngine.questions : null);
            if (cloudRes && cloudRes.cloudConnected) {
              if (cloudRes.questionsSynced) {
                cloudNote = `\n• Cloud Database: ✅ Tersinkron (${cloudRes.syncedQuestionsCount} soal masuk ke cbt_questions)`;
              } else {
                cloudNote = `\n• Cloud Database: ⚠️ Soal baru tersimpan lokal (${cloudRes.syncedQuestionsCount}/${res.questionsCount} terunggah: ${cloudRes.message || 'cek koneksi'}). Klik "☁️ Kirim Semua Data ke Cloud" setelah koneksi stabil.`;
              }
            } else {
              cloudNote = '\n• Cloud Database: Belum terhubung (data aman di perangkat ini).';
            }
          }

          if (typeof refreshSupabaseTablesHealthUI === 'function') {
            refreshSupabaseTablesHealthUI();
          }

          const localWarn = res.localQuestionsPersisted === false
            ? '\n⚠️ Peringatan: Ukuran soal terlalu besar untuk cache browser lokal, pastikan Cloud tersinkron hijau!'
            : '';

          alert(`Pemulihan Sukses!\n• Guru: ${res.teachersCount}\n• Siswa: ${res.studentsCount}\n• Jadwal: ${res.schedulesCount}\n• Soal: ${res.questionsCount}${cloudNote}${localWarn}`);
        } finally {
          btnTriggerImportFullBackup.disabled = false;
          btnTriggerImportFullBackup.innerHTML = origBtnHtml;
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

    const isPengawas = typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser(currentTeacher);
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher).map(s => s.toLowerCase());
    const subLower = String(subject || '').trim().toLowerCase();
    const subOk = isPengawas || teacherSubjects.length === 0 || teacherSubjects.some(ts => subLower === ts || subLower.includes(ts) || ts.includes(subLower));

    const assignedClasses = currentTeacher.classes ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes) : [];
    const clsUpper = String(className || '').trim().toUpperCase();
    const clsOk = assignedClasses.length === 0 || (
      (window.examEngine && typeof window.examEngine.matchesClassLevel === 'function')
        ? window.examEngine.matchesClassLevel(assignedClasses.join(', '), className || '')
        : assignedClasses.some(tc => clsUpper === tc || clsUpper.startsWith(tc))
    );

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

    const isPengawasScope = Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser());
    listEl.innerHTML = filtered.map(item => {
      const isCheat = item.type === 'cheat';
      const iconBg = isCheat
        ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
        : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300';
      const badgeCls = isCheat
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
      const targetTab = (isCheat || isPengawasScope) ? 'tabMonitoring' : 'tabResults';
      const actionLabel = (isCheat || isPengawasScope) ? 'Pantau Siswa →' : 'Lihat Nilai →';

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
    const isPengawasScope = Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser());
    const targetTab = (isCheat || isPengawasScope) ? 'tabMonitoring' : 'tabResults';
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
            ${(isCheat || isPengawasScope) ? 'Pantau Live →' : 'Buka Rekap →'}
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
    if (now - realtimeLastCloudResultPullAt < 8000) return;
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
          const isPengawasScope = Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser());
          const scoreTxt = (!isPengawasScope && sess.finalScore !== undefined && sess.finalScore !== null) ? `Nilai Akhir: ${sess.finalScore}` : 'Ujian telah selesai';
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
    const isPengawasScope = Boolean(window.cbtAdmin && typeof window.cbtAdmin.isPengawasUser === 'function' && window.cbtAdmin.isPengawasUser());
    const scoreTxt = (!isPengawasScope && resObj.finalScore !== undefined && resObj.finalScore !== null) ? `Nilai Akhir: ${resObj.finalScore}` : 'Jawaban siswa telah masuk';
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
      if (document.hidden) return;
      pollRealtimeStudentEvents(false);

      // Cadangan polling bank soal hemat egress (cek watermark ~120 byte tiap 30 detik di Bank Soal / 60 detik di tab lain)
      realtimeQuestionPollTick += 1;
      const tabQ = document.getElementById('tabQuestions');
      const isQuestionsTabOpen = Boolean(tabQ && !tabQ.classList.contains('hidden'));
      if ((isQuestionsTabOpen && realtimeQuestionPollTick % 2 === 0) || realtimeQuestionPollTick % 4 === 0) {
        syncQuestionsFromCloud(true);
      }
    }, 15000);
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
