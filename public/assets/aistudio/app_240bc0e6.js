// Main UI Controller & View Manager: Multi-Perangkat (Laptop, Chromebook, Tab, Ponsel)
// 13 Guru Mapel + 250 Siswa + Upload Gambar Langsung + Ekspor Excel & PDF + Cloud Supabase

document.addEventListener('DOMContentLoaded', () => {
  // Elements: Views
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

  // PWA Install Button
  const btnPwaInstall = document.getElementById('btnPwaInstall');
  let deferredPrompt = null;

  // Temp State
  let tempStudent = null;
  let currentUploadedImageBase64 = ""; // Menyimpan file gambar terkompresi Base64

  function init() {
    renderConfigInfoOnLogin();
    setupPwaPrompt();
    setupKeyboardShortcuts();
    setupImageUploader();
    setupStudentNisnDetection();
    setupSubjectAndClassFilters();
    setupAdminLoginHelpers();
    updateCloudBadge();

    const active = window.examEngine.checkActiveSession();
    if (active) {
      if (confirm(`Ditemukan sesi ujian aktif atas nama "${active.student?.name}". Ingin melanjutkan ujian?`)) {
        window.examEngine.resumeSession(active);
        showView('examRoom');
        renderExamRoom();
      } else {
        window.examEngine.clearSession();
        showView('login');
      }
    } else {
      showView('login');
    }
  }

  // ===================== SISTEM UPLOAD FILE GAMBAR LANGSUNG (BASE64 + KOMPRESI) =====================
  function setupImageUploader() {
    const fileInput = document.getElementById('qInputFileImage');
    const btnTrigger = document.getElementById('btnTriggerUploadImage');
    const btnRemove = document.getElementById('btnRemoveImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreviewImg');

    if (btnTrigger && fileInput) {
      btnTrigger.addEventListener('click', () => {
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          alert("File yang dipilih harus berupa gambar (JPG, PNG, atau WEBP)!");
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round(width * (MAX_HEIGHT / height));
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            currentUploadedImageBase64 = canvas.toDataURL('image/jpeg', 0.82);

            if (previewImg && previewContainer) {
              previewImg.src = currentUploadedImageBase64;
              previewContainer.classList.remove('hidden');
            }
            if (btnRemove) btnRemove.classList.remove('hidden');
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
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

  function resetImageUploader() {
    currentUploadedImageBase64 = "";
    const fileInput = document.getElementById('qInputFileImage');
    const btnRemove = document.getElementById('btnRemoveImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreviewImg');

    if (fileInput) fileInput.value = "";
    if (previewImg) previewImg.src = "";
    if (previewContainer) previewContainer.classList.add('hidden');
    if (btnRemove) btnRemove.classList.add('hidden');
  }

  // ===================== PWA PROMPT =====================
  function setupPwaPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btnPwaInstall) {
        btnPwaInstall.classList.remove('hidden');
        btnPwaInstall.classList.add('flex');
      }
    });

    if (btnPwaInstall) {
      btnPwaInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            btnPwaInstall.classList.add('hidden');
          }
          deferredPrompt = null;
        } else {
          alert("Aplikasi ini dapat dipasang lewat menu browser Anda (Pilih 'Tambahkan ke Layar Utama' / 'Install App').");
        }
      });
    }
  }

  // ===================== SHORTCUT KEYBOARD (LAPTOP & CHROMEBOOK) =====================
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (!window.examEngine.isExamActive || viewExamRoom.classList.contains('hidden')) {
        return;
      }

      const q = window.examEngine.getCurrentQuestion();
      if (!q) return;

      const key = e.key.toUpperCase();
      const type = q.type || 'single';

      const keyMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E' };
      const selectedOptionKey = ['A', 'B', 'C', 'D', 'E'].includes(key) ? key : keyMap[e.key];

      if (selectedOptionKey) {
        if (type === 'single') {
          e.preventDefault();
          window.examEngine.selectSingleAnswer(selectedOptionKey);
          renderExamRoom();
          renderQuestionPalette();
        } else if (type === 'multiple') {
          e.preventDefault();
          window.examEngine.toggleMultipleAnswer(selectedOptionKey);
          renderExamRoom();
          renderQuestionPalette();
        }
      }

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (window.examEngine.prevQuestion()) renderExamRoom();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        const isLast = window.examEngine.currentQuestionIndex === window.examEngine.questions.length - 1;
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

  function renderConfigInfoOnLogin() {
    const titleEl = document.getElementById('loginExamTitle');
    const subtitleEl = document.getElementById('loginExamSubtitle');
    const tokenHintEl = document.getElementById('loginTokenHint');
    if (titleEl) titleEl.innerText = window.examEngine.config.examTitle;
    if (subtitleEl) subtitleEl.innerText = `${window.examEngine.config.subject} • Alokasi Waktu: ${window.examEngine.config.durationMinutes} Menit`;
    if (tokenHintEl) tokenHintEl.innerText = `Token Ujian Aktif: ${window.examEngine.config.examToken}`;
  }

  function showView(viewName) {
    [viewLogin, viewExamConfirm, viewExamRoom, viewResult, viewAdmin].forEach(v => {
      if (v) v.classList.add('hidden');
    });

    if (viewName === 'login') {
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
    }
  }

  // ===================== AUTODETEKSI NISN SISWA =====================
  function setupStudentNisnDetection() {
    const studentNisnInput = document.getElementById('studentNisn');
    const studentFoundHint = document.getElementById('studentFoundHint');
    const studentFoundName = document.getElementById('studentFoundName');
    const studentFoundClass = document.getElementById('studentFoundClass');

    if (studentNisnInput) {
      studentNisnInput.addEventListener('input', () => {
        const nisn = studentNisnInput.value.trim();
        if (nisn.length >= 3 && window.studentManager) {
          const student = window.studentManager.getStudentByNisn(nisn);
          if (student) {
            if (studentFoundName) studentFoundName.innerText = student.name;
            if (studentFoundClass) studentFoundClass.innerText = `Kelas ${student.class}`;
            if (studentFoundHint) studentFoundHint.classList.remove('hidden');
          } else {
            if (studentFoundHint) studentFoundHint.classList.add('hidden');
          }
        } else {
          if (studentFoundHint) studentFoundHint.classList.add('hidden');
        }
      });
    }
  }

  // ===================== LOGIN SISWA (NISN + PASSWORD + TOKEN) =====================
  const studentLoginForm = document.getElementById('studentLoginForm');
  if (studentLoginForm) {
    studentLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nisn = document.getElementById('studentNisn').value.trim();
      const password = document.getElementById('studentPassword').value.trim();
      const token = document.getElementById('studentToken').value.trim().toUpperCase();

      if (!nisn || !password) {
        alert("Harap lengkapi semua kolom!");
        return;
      }

      // Deteksi otomatis jika Proktor mencoba login lewat layar depan
      if (nisn.toLowerCase() === 'admin' || nisn.toLowerCase().includes('proktor')) {
        const adminRes = window.cbtAdmin.login('admin', password);
        if (adminRes && adminRes.success) {
          showView('admin');
          return;
        } else {
          modalAdminPin.classList.remove('hidden');
          const usernameInput = document.getElementById('adminUsernameInput');
          const pinInput = document.getElementById('adminPinInput');
          if (usernameInput) usernameInput.value = 'admin';
          if (pinInput) {
            pinInput.value = password;
            pinInput.focus();
          }
          alert("Silakan masukkan PIN Proktor Anda.");
          return;
        }
      }

      if (!token) {
        alert("Harap masukkan Token Ujian!");
        return;
      }

      const validToken = window.examEngine.config.examToken.toUpperCase();
      if (token !== validToken) {
        alert(`Token ujian salah! Masukkan token aktif: ${validToken}`);
        return;
      }

      let authenticatedStudent = null;
      if (window.studentManager) {
        const auth = window.studentManager.authenticateStudent(nisn, password);
        if (!auth.success) {
          alert(auth.message);
          return;
        }
        authenticatedStudent = auth.student;
      } else {
        authenticatedStudent = { nisn, name: "Siswa Peserta", class: "Umum" };
      }

      tempStudent = {
        name: authenticatedStudent.name,
        nisn: authenticatedStudent.nisn,
        class: authenticatedStudent.class,
        token: token
      };

      document.getElementById('confirmName').innerText = tempStudent.name;
      document.getElementById('confirmNisn').innerText = tempStudent.nisn;
      document.getElementById('confirmClass').innerText = `Kelas ${tempStudent.class}`;
      document.getElementById('confirmSubject').innerText = window.examEngine.config.subject;
      document.getElementById('confirmDuration').innerText = `${window.examEngine.config.durationMinutes} Menit`;
      document.getElementById('confirmQuestionsCount').innerText = `${window.examEngine.questions.length} Butir Soal`;

      showView('confirm');
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

      window.examEngine.startExam(tempStudent);
      showView('examRoom');
      renderExamRoom();
    });
  }

  // ===================== EXAM ROOM: MULTI-FORMAT SOAL =====================
  function renderExamRoom() {
    const q = window.examEngine.getCurrentQuestion();
    if (!q) return;

    const type = q.type || 'single';

    // Header Info
    document.getElementById('examSubjectHeader').innerText = window.examEngine.config.subject;
    document.getElementById('examStudentNameHeader').innerText = window.examEngine.student?.name || 'Peserta';
    document.getElementById('currentQuestionNumberBadge').innerText = `Soal No. ${window.examEngine.currentQuestionIndex + 1} dari ${window.examEngine.questions.length}`;

    // Badge Tipe Soal
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

    // Question Text
    document.getElementById('questionText').innerText = q.question;

    // Tampilkan Gambar Soal (Otomatis mendukung Base64 hasil upload langsung)
    const qImageContainer = document.getElementById('questionImageContainer');
    const qImageEl = document.getElementById('questionImage');
    if (q.image && q.image.trim() !== "") {
      qImageEl.src = q.image;
      qImageContainer.classList.remove('hidden');
    } else {
      qImageContainer.classList.add('hidden');
    }

    // Render Options
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';

    const currentAnswerData = window.examEngine.answers[q.id]?.answer;

    if (type === 'single') {
      q.options.forEach(opt => {
        const isSelected = currentAnswerData === opt.key;
        const optEl = document.createElement('div');
        optEl.className = `option-label cursor-pointer flex items-center p-3 sm:p-4 rounded-2xl border-2 transition-all ${
          isSelected 
            ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs' 
            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
        }`;
        optEl.innerHTML = `
          <div class="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl font-bold text-xs sm:text-sm mr-3 transition-colors flex-shrink-0 ${
            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
          }">${opt.key}</div>
          <div class="text-xs sm:text-base font-medium flex-1 text-slate-800">${opt.text}</div>
          <span class="hidden md:inline-flex kbd-hint ml-2">${opt.key}</span>
        `;
        optEl.addEventListener('click', () => {
          window.examEngine.selectSingleAnswer(opt.key);
          renderExamRoom();
          renderQuestionPalette();
        });
        optionsContainer.appendChild(optEl);
      });

    } else if (type === 'multiple') {
      const selectedArr = Array.isArray(currentAnswerData) ? currentAnswerData : [];

      const hintEl = document.createElement('div');
      hintEl.className = "text-[11px] sm:text-xs font-bold text-purple-700 bg-purple-50 p-2.5 rounded-xl border border-purple-200 mb-2 flex items-center gap-1.5";
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
            ? 'border-purple-600 bg-purple-50 text-purple-950 shadow-xs' 
            : 'border-slate-200 bg-white hover:border-purple-300 hover:bg-slate-50'
        }`;
        optEl.innerHTML = `
          <div class="w-8 h-8 flex items-center justify-center rounded-lg font-bold text-xs sm:text-sm mr-3 transition-colors flex-shrink-0 ${
            isChecked ? 'bg-purple-600 text-white' : 'border-2 border-slate-300 text-slate-600 bg-white'
          }">
            ${isChecked ? '✓' : opt.key}
          </div>
          <div class="text-xs sm:text-base font-medium flex-1 text-slate-800">${opt.text}</div>
          <span class="hidden md:inline-flex kbd-hint ml-2">${opt.key}</span>
        `;
        optEl.addEventListener('click', () => {
          window.examEngine.toggleMultipleAnswer(opt.key);
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
              }">
                Benar
              </button>
            </td>
            <td class="p-2.5 sm:p-3.5 text-center w-20 sm:w-24">
              <button type="button" data-stmt="${stmt.id}" data-val="S" class="btn-tf w-full py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition cursor-pointer ${
                val === 'S' 
                  ? 'bg-red-600 text-white border-red-600 shadow-xs' 
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-red-400'
              }">
                Salah
              </button>
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
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `;

      tableWrapper.querySelectorAll('.btn-tf').forEach(btn => {
        btn.addEventListener('click', () => {
          const stmtId = btn.getAttribute('data-stmt');
          const value = btn.getAttribute('data-val');
          window.examEngine.selectTrueFalseAnswer(stmtId, value);
          renderExamRoom();
          renderQuestionPalette();
        });
      });

      optionsContainer.appendChild(tableWrapper);
    }

    // Checkbox Ragu-ragu
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

    // Prev / Next button states
    const btnPrev = document.getElementById('btnPrevQuestion');
    const btnNext = document.getElementById('btnNextQuestion');
    const isFirst = window.examEngine.currentQuestionIndex === 0;
    const isLast = window.examEngine.currentQuestionIndex === window.examEngine.questions.length - 1;

    if (btnPrev) btnPrev.disabled = isFirst;
    if (btnNext) {
      if (isLast) {
        btnNext.innerHTML = `<span>Selesai</span> <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
        btnNext.className = "flex items-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 shadow-sm transition";
      } else {
        btnNext.innerHTML = `<span>Berikutnya</span> <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
        btnNext.className = "flex items-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition";
      }
    }

    renderQuestionPalette();
  }

  // Render Palet Nomor Soal
  function renderQuestionPalette() {
    const paletteContainers = [
      document.getElementById('questionPaletteDesktop'),
      document.getElementById('questionPaletteDrawer')
    ];

    paletteContainers.forEach(container => {
      if (!container) return;
      container.innerHTML = '';

      window.examEngine.questions.forEach((q, idx) => {
        const ansData = window.examEngine.answers[q.id];
        const isCurrent = idx === window.examEngine.currentQuestionIndex;
        const isAnswered = window.examEngine.isQuestionAnswered(q);

        let statusClass = 'unanswered';
        if (ansData?.doubt) {
          statusClass = 'doubt';
        } else if (isAnswered) {
          statusClass = 'answered';
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `q-btn w-9 h-9 sm:w-11 sm:h-11 rounded-lg font-bold text-xs sm:text-sm flex flex-col items-center justify-center shadow-xs cursor-pointer ${statusClass} ${isCurrent ? 'current ring-3 ring-blue-500' : ''}`;
        
        btn.innerHTML = `
          <span>${idx + 1}</span>
          ${isAnswered ? `<span class="text-[8px] -mt-0.5 uppercase opacity-90">✓</span>` : ''}
        `;

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

  // Kontrol Navigasi Soal
  const btnPrev = document.getElementById('btnPrevQuestion');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (window.examEngine.prevQuestion()) renderExamRoom();
    });
  }

  const btnNext = document.getElementById('btnNextQuestion');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const isLast = window.examEngine.currentQuestionIndex === window.examEngine.questions.length - 1;
      if (isLast) {
        openFinishConfirmModal();
      } else {
        window.examEngine.nextQuestion();
        renderExamRoom();
      }
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
  if (btnTriggerFinish) {
    btnTriggerFinish.addEventListener('click', openFinishConfirmModal);
  }

  function openFinishConfirmModal() {
    const summary = window.examEngine.getAnswerSummary();
    document.getElementById('modalSummaryAnswered').innerText = summary.answered;
    document.getElementById('modalSummaryDoubt').innerText = summary.doubt;
    document.getElementById('modalSummaryUnanswered').innerText = summary.unanswered;

    const warningBox = document.getElementById('modalFinishWarningNote');
    if (summary.unanswered > 0 || summary.doubt > 0) {
      warningBox.classList.remove('hidden');
    } else {
      warningBox.classList.add('hidden');
    }

    modalFinishConfirm.classList.remove('hidden');
  }

  const btnCancelFinish = document.getElementById('btnCancelFinish');
  if (btnCancelFinish) {
    btnCancelFinish.addEventListener('click', () => modalFinishConfirm.classList.add('hidden'));
  }

  const btnConfirmFinishFinal = document.getElementById('btnConfirmFinishFinal');
  if (btnConfirmFinishFinal) {
    btnConfirmFinishFinal.addEventListener('click', () => {
      modalFinishConfirm.classList.add('hidden');
      window.examEngine.finishExam('Selesai mandiri oleh peserta');
    });
  }

  // Font Size
  const btnFontDec = document.getElementById('btnFontDecrease');
  const btnFontReset = document.getElementById('btnFontReset');
  const btnFontInc = document.getElementById('btnFontIncrease');
  if (btnFontDec) btnFontDec.addEventListener('click', () => window.examEngine.changeFontSize('decrease'));
  if (btnFontReset) btnFontReset.addEventListener('click', () => window.examEngine.changeFontSize('reset'));
  if (btnFontInc) btnFontInc.addEventListener('click', () => window.examEngine.changeFontSize('increase'));

  // Mobile Drawer
  const btnOpenDrawer = document.getElementById('btnOpenQuestionDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseQuestionDrawer');
  if (btnOpenDrawer) {
    btnOpenDrawer.addEventListener('click', () => {
      modalQuestionDrawer.classList.remove('hidden');
      renderQuestionPalette();
    });
  }
  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => modalQuestionDrawer.classList.add('hidden'));
  }

  // Timer Tick Event
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

  // Anti-Cheat Warning Event
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
  if (btnAcknowledgeCheat) {
    btnAcknowledgeCheat.addEventListener('click', () => {
      modalCheatWarning.classList.add('hidden');
    });
  }

  // Selesai Ujian Event (Nilai Dirahasiakan dari Siswa)
  window.addEventListener('cbt-exam-finished', (e) => {
    const { result } = e.detail;
    showView('result');

    document.getElementById('resStudentName').innerText = result.student?.name || '-';
    document.getElementById('resStudentNisn').innerText = result.student?.nisn || '-';
    document.getElementById('resStudentClass').innerText = result.student?.class ? `Kelas ${result.student.class}` : '-';
    document.getElementById('resSubject').innerText = result.subject;
    document.getElementById('resCompletedAt').innerText = result.completedAt;
    document.getElementById('resTotalQuestions').innerText = `${result.totalQuestions} Butir Soal`;
    document.getElementById('resCheatCount').innerText = `${result.cheatCount || 0} Kali Pelanggaran`;
  });

  const btnPrintResult = document.getElementById('btnPrintResult');
  if (btnPrintResult) btnPrintResult.addEventListener('click', () => window.print());

  const btnReturnHome = document.getElementById('btnReturnHome');
  if (btnReturnHome) btnReturnHome.addEventListener('click', () => showView('login'));

  // ===================== PANEL PROKTOR & GURU: LOGIN SECURE =====================
  function setupAdminLoginHelpers() {
    // Toggle lihat/sembunyikan PIN
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

  const btnOpenAdminLogin = document.getElementById('btnOpenAdminLogin');
  if (btnOpenAdminLogin) {
    btnOpenAdminLogin.addEventListener('click', () => {
      modalAdminPin.classList.remove('hidden');
      const usernameInput = document.getElementById('adminUsernameInput');
      const pinInput = document.getElementById('adminPinInput');
      if (usernameInput) {
        usernameInput.value = '';
        usernameInput.focus();
      }
      if (pinInput) pinInput.value = '';
    });
  }

  const btnCloseAdminPin = document.getElementById('btnCloseAdminPin');
  if (btnCloseAdminPin) {
    btnCloseAdminPin.addEventListener('click', () => modalAdminPin.classList.add('hidden'));
  }

  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('adminUsernameInput');
      const pinInput = document.getElementById('adminPinInput');
      const identifier = usernameInput ? usernameInput.value.trim() : '';
      const pin = pinInput ? pinInput.value.trim() : '';

      if (!identifier || !pin) {
        alert("Harap masukkan Username/NIP dan PIN!");
        return;
      }

      const loginRes = window.cbtAdmin.login(identifier, pin);
      if (loginRes && loginRes.success) {
        modalAdminPin.classList.add('hidden');
        if (usernameInput) usernameInput.value = '';
        if (pinInput) pinInput.value = '';
        showView('admin');
      } else {
        alert("Username / NIP atau PIN salah!");
      }
    });
  }

  const btnAdminLogout = document.getElementById('btnAdminLogout');
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      window.cbtAdmin.logout();
      showView('login');
    });
  }

  // ===================== 5 ADMIN TABS SWITCHER & RBAC =====================
  const adminTabButtons = document.querySelectorAll('.admin-tab-btn');
  const adminTabPanes = document.querySelectorAll('.admin-tab-pane');

  function switchAdminTab(targetTab) {
    const currentTeacher = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');

    // Strict RBAC: Jika guru biasa mencoba mengakses tab Data Siswa, Data Guru, atau Pengaturan, tolak & arahkan ke Rekap Nilai
    if (!isAdmin && (targetTab === 'tabStudents' || targetTab === 'tabTeachers' || targetTab === 'tabSettings')) {
      targetTab = 'tabResults';
    }

    const allTabBtns = document.querySelectorAll('.admin-tab-btn');
    const allTabPanes = document.querySelectorAll('.admin-tab-pane');

    allTabBtns.forEach(b => {
      b.classList.remove('border-blue-600', 'text-blue-600', 'bg-blue-50');
      b.classList.add('border-transparent', 'text-slate-600', 'hover:text-slate-900');
      if (b.getAttribute('data-tab') === targetTab) {
        b.classList.add('border-blue-600', 'text-blue-600', 'bg-blue-50');
        b.classList.remove('border-transparent', 'text-slate-600');
      }
    });

    allTabPanes.forEach(pane => {
      if (pane.id === targetTab) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });

    // Render ulang konten tab yang aktif agar selalu termutakhir
    try {
      if (targetTab === 'tabResults') {
        renderAdminAnalyticsAndResults();
      } else if (targetTab === 'tabQuestions') {
        renderAdminQuestionList();
      } else if (targetTab === 'tabStudents' && isAdmin) {
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
      } else if (targetTab === 'tabTeachers' && isAdmin) {
        renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value || '');
      } else if (targetTab === 'tabSettings' && isAdmin) {
        renderAdminConfigForm();
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
    const tabStudentsBtn = document.getElementById('adminTabBtnStudents');
    const tabTeachersBtn = document.getElementById('adminTabBtnTeachers');
    const tabSettingsBtn = document.getElementById('adminTabBtnSettings');

    const tabStudentsPane = document.getElementById('tabStudents');
    const tabTeachersPane = document.getElementById('tabTeachers');
    const tabSettingsPane = document.getElementById('tabSettings');

    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');

    if (currentTeacher) {
      const nameDisp = document.getElementById('adminTeacherNameDisplay');
      const roleBadge = document.getElementById('adminRoleBadge');
      const subjDisp = document.getElementById('adminSubjectDisplay');
      if (nameDisp) nameDisp.innerText = `Panel: ${currentTeacher.name}`;
      if (roleBadge) {
        roleBadge.innerText = isAdmin ? 'Proktor Utama / Admin' : 'Guru Mata Pelajaran';
        roleBadge.className = isAdmin ? 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 border border-purple-200' : 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200';
      }
      if (subjDisp) {
        subjDisp.innerText = isAdmin 
          ? `Mata Pelajaran: Semua Mapel • Status: Hak Akses Penuh (Super Admin)`
          : `Mata Pelajaran: ${currentTeacher.subject} • NIP: ${currentTeacher.nip}`;
      }

      // STRICT RBAC:
      // Guru Biasa: Tab Pengaturan & Cloud serta Tab Data Guru dan Siswa TIDAK DITAMPILKAN SAMA SEKALI
      if (!isAdmin) {
        if (tabStudentsBtn) tabStudentsBtn.classList.add('hidden');
        if (tabTeachersBtn) tabTeachersBtn.classList.add('hidden');
        if (tabSettingsBtn) tabSettingsBtn.classList.add('hidden');

        if (tabStudentsPane) tabStudentsPane.classList.add('hidden');
        if (tabTeachersPane) tabTeachersPane.classList.add('hidden');
        if (tabSettingsPane) tabSettingsPane.classList.add('hidden');

        switchAdminTab('tabResults');
      } else {
        // Proktor / Admin: Akses Penuh ke seluruh 5 tab
        if (tabStudentsBtn) tabStudentsBtn.classList.remove('hidden');
        if (tabTeachersBtn) tabTeachersBtn.classList.remove('hidden');
        if (tabSettingsBtn) tabSettingsBtn.classList.remove('hidden');
      }
    }
    setupSubjectAndClassFilters();
    renderAdminAnalyticsAndResults();
    renderAdminQuestionList();

    if (isAdmin) {
      renderAdminStudentsList();
      renderAdminTeachersList();
      renderAdminConfigForm();
      renderSupabaseConfigForm();
    }
  }

  // ===================== FILTER MAPEL & KELAS =====================
  function setupSubjectAndClassFilters() {
    const subjSelect = document.getElementById('filterResultsSubject');
    const classSelect = document.getElementById('filterResultsClass');
    if (!subjSelect || !classSelect || !window.cbtAdmin) return;

    const allSubjects = window.cbtAdmin.getAllSubjects();
    subjSelect.innerHTML = '<option value="ALL">Semua Mata Pelajaran</option>';
    allSubjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.innerText = s;
      if (window.cbtAdmin.selectedSubjectFilter === s) opt.selected = true;
      subjSelect.appendChild(opt);
    });

    const allClasses = window.studentManager ? window.studentManager.getAllClasses() : [];
    classSelect.innerHTML = '<option value="ALL">Semua Kelas</option>';
    allClasses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = `Kelas ${c}`;
      if (window.cbtAdmin.selectedClassFilter === c) opt.selected = true;
      classSelect.appendChild(opt);
    });

    subjSelect.onchange = (e) => {
      window.cbtAdmin.setSubjectFilter(e.target.value);
      renderAdminAnalyticsAndResults();
    };

    classSelect.onchange = (e) => {
      window.cbtAdmin.setClassFilter(e.target.value);
      renderAdminAnalyticsAndResults();
    };
  }

  // ===================== REKAP OTOMATIS: STATISTIK & TABEL RANKING =====================
  function renderAdminAnalyticsAndResults() {
    const analytics = window.cbtAdmin.getExamAnalytics();
    const sortedResults = window.cbtAdmin.getAllResultsSorted();

    document.getElementById('kpiAvgScore').innerText = analytics.averageScore;
    document.getElementById('kpiHighestScore').innerText = analytics.highestScore;
    document.getElementById('kpiHighestStudent').innerText = analytics.highestStudent;
    document.getElementById('kpiLowestScore').innerText = analytics.lowestScore;
    document.getElementById('kpiLowestStudent').innerText = analytics.lowestStudent;
    document.getElementById('kpiTotalStudents').innerText = `${analytics.totalStudents} Siswa`;
    document.getElementById('kpiPassRate').innerText = `Ketuntasan (≥75): ${analytics.passRatePercentage}%`;

    const tbody = document.getElementById('adminResultsTbody');
    const emptyRow = document.getElementById('adminResultsEmpty');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (sortedResults.length === 0) {
      if (emptyRow) emptyRow.classList.remove('hidden');
      return;
    }

    if (emptyRow) emptyRow.classList.add('hidden');

    sortedResults.forEach((r, idx) => {
      const rank = idx + 1;
      let rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-black text-xs inline-flex items-center justify-center">${rank}</span>`;
      if (rank === 1) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-black text-xs inline-flex items-center justify-center shadow-xs">🥇 1</span>`;
      } else if (rank === 2) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-black text-xs inline-flex items-center justify-center shadow-xs">🥈 2</span>`;
      } else if (rank === 3) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-50 text-amber-900 border border-amber-300 font-black text-xs inline-flex items-center justify-center shadow-xs">🥉 3</span>`;
      }

      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition text-xs sm:text-sm";
      tr.innerHTML = `
        <td class="p-3 text-center font-bold">${rankBadge}</td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${r.student?.name || '-'}</div>
          <div class="text-[10px] text-slate-400">NISN: ${r.student?.nisn || '-'} • ${r.subject}</div>
        </td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs">${r.student?.class ? 'Kelas ' + r.student.class : '-'}</span>
        </td>
        <td class="p-3">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black ${
            r.finalScore >= 75 
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
              : 'bg-amber-100 text-amber-800 border border-amber-200'
          }">
            ${r.finalScore}
          </span>
        </td>
        <td class="p-3">
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-emerald-600 font-bold">✓ ${r.correctCount}</span>
            <span class="text-red-500 font-bold">✗ ${r.incorrectCount}</span>
            <span class="text-slate-400">? ${r.unattemptedCount}</span>
          </div>
        </td>
        <td class="p-3 text-slate-600 text-xs">${r.completedAt}</td>
        <td class="p-3">
          ${(r.cheatCount || 0) > 0 
            ? `<span class="text-[11px] font-bold px-2 py-0.5 bg-red-100 text-red-600 rounded">${r.cheatCount}x Pindah Tab</span>` 
            : `<span class="text-[11px] text-emerald-600 font-medium">Tertib (0)</span>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ===================== TOMBOL EKSPOR: EXCEL (.xlsx) & PDF (.pdf) =====================
  const btnExportExcel = document.getElementById('btnExportExcel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      window.cbtAdmin.exportResultsExcel();
    });
  }

  const btnExportPDF = document.getElementById('btnExportPDF');
  if (btnExportPDF) {
    btnExportPDF.addEventListener('click', () => {
      window.cbtAdmin.exportResultsPDF();
    });
  }

  const btnClearAllResults = document.getElementById('btnClearAllResults');
  if (btnClearAllResults) {
    btnClearAllResults.addEventListener('click', () => {
      if (confirm("Peringatan: Yakin ingin menghapus seluruh riwayat rekap nilai ujian?")) {
        window.cbtAdmin.clearAllResults();
        renderAdminAnalyticsAndResults();
      }
    });
  }

  // ===================== BANK SOAL UJIAN (NO TKA - GENERAL SOAL) =====================
  function renderAdminQuestionList() {
    const listContainer = document.getElementById('adminQuestionList');
    const totalCountEl = document.getElementById('adminTotalQuestionsCount');
    const questions = window.cbtAdmin.getAllQuestions();

    if (totalCountEl) totalCountEl.innerText = `${questions.length} Soal Tersedia`;
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (questions.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center py-12 text-slate-400 bg-white rounded-3xl border border-slate-200">
          <p class="font-semibold text-base">Belum ada soal dalam bank soal.</p>
          <p class="text-sm mt-1">Klik tombol "+ Tambah Soal" untuk membuat soal baru.</p>
        </div>
      `;
      return;
    }

    questions.forEach((q, index) => {
      const type = q.type || 'single';
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

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center">
              ${index + 1}
            </span>
            ${typeBadge}
            <span class="text-[11px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
              Bobot: ${q.weight || 10}
            </span>
          </div>
          <button class="btn-delete-q text-red-600 hover:text-red-800 p-1 rounded-lg hover:bg-red-50 text-xs font-medium cursor-pointer">
            🗑️ Hapus
          </button>
        </div>

        <p class="text-slate-800 text-xs sm:text-sm font-medium mt-2.5 whitespace-pre-line leading-relaxed">${q.question}</p>

        ${q.image ? `
          <div class="mt-2.5 p-1.5 bg-slate-50 rounded-xl border border-slate-200 inline-block max-w-xs">
            <img src="${q.image}" alt="Gambar Soal" class="rounded-lg max-h-28 object-contain">
          </div>
        ` : ''}

        ${answerDetailsHtml}
      `;

      card.querySelector('.btn-delete-q').addEventListener('click', () => {
        if (confirm(`Yakin ingin menghapus Soal No. ${index + 1}?`)) {
          window.cbtAdmin.deleteQuestion(q.id);
          renderAdminQuestionList();
        }
      });

      listContainer.appendChild(card);
    });
  }

  // Form Input Soal Ujian Dinamis
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

  if (btnOpenAddQuestion) {
    btnOpenAddQuestion.addEventListener('click', () => {
      document.getElementById('formQuestionItem').reset();
      resetImageUploader();
      if (qInputType) qInputType.dispatchEvent(new Event('change'));
      modalQuestionForm.classList.remove('hidden');
    });
  }

  if (btnCloseQuestionForm) {
    btnCloseQuestionForm.addEventListener('click', () => {
      modalQuestionForm.classList.add('hidden');
      resetImageUploader();
    });
  }

  const formQuestionItem = document.getElementById('formQuestionItem');
  if (formQuestionItem) {
    formQuestionItem.addEventListener('submit', (e) => {
      e.preventDefault();
      const type = qInputType.value;
      const questionText = document.getElementById('qInputText').value.trim();
      const weight = parseInt(document.getElementById('qInputWeight').value) || 10;
      const image = currentUploadedImageBase64 || "";

      let qData = { type, question: questionText, image, weight };

      if (type === 'single') {
        qData.options = [
          { key: "A", text: document.getElementById('qInputOptA').value.trim() },
          { key: "B", text: document.getElementById('qInputOptB').value.trim() },
          { key: "C", text: document.getElementById('qInputOptC').value.trim() },
          { key: "D", text: document.getElementById('qInputOptD').value.trim() },
          { key: "E", text: document.getElementById('qInputOptE').value.trim() }
        ];
        qData.correctAnswer = document.getElementById('qInputCorrectSingle').value;
      } else if (type === 'multiple') {
        qData.options = [
          { key: "A", text: document.getElementById('qInputOptA').value.trim() },
          { key: "B", text: document.getElementById('qInputOptB').value.trim() },
          { key: "C", text: document.getElementById('qInputOptC').value.trim() },
          { key: "D", text: document.getElementById('qInputOptD').value.trim() },
          { key: "E", text: document.getElementById('qInputOptE').value.trim() }
        ];
        const checkedBoxes = Array.from(document.querySelectorAll('input[name="multiCorrect"]:checked')).map(el => el.value);
        if (checkedBoxes.length === 0) {
          alert("Pilih minimal 1 kunci jawaban untuk soal pilihan ganda kompleks!");
          return;
        }
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

      window.cbtAdmin.addQuestion(qData);
      modalQuestionForm.classList.add('hidden');
      resetImageUploader();
      renderAdminQuestionList();
    });
  }

  // Export / Import / Reset Soal
  const btnExportQuestions = document.getElementById('btnExportQuestions');
  if (btnExportQuestions) btnExportQuestions.addEventListener('click', () => window.cbtAdmin.exportQuestionsJSON());

  const btnImportQuestions = document.getElementById('btnImportQuestions');
  const fileImportInput = document.getElementById('fileImportQuestions');
  if (btnImportQuestions && fileImportInput) {
    btnImportQuestions.addEventListener('click', () => fileImportInput.click());
    fileImportInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const res = window.cbtAdmin.importQuestionsJSON(event.target.result);
        if (res.success) {
          alert(`Berhasil mengimpor ${res.count} butir soal ujian!`);
          renderAdminQuestionList();
        } else {
          alert(`Gagal impor: ${res.message}`);
        }
      };
      reader.readAsText(file);
      fileImportInput.value = '';
    });
  }

  const btnResetDefaultQuestions = document.getElementById('btnResetDefaultQuestions');
  if (btnResetDefaultQuestions) {
    btnResetDefaultQuestions.addEventListener('click', () => {
      if (confirm("Reset bank soal ke soal bawaan ujian demo?")) {
        window.cbtAdmin.resetToDefaultQuestions();
        renderAdminQuestionList();
      }
    });
  }

  // ===================== TAB 3: MANAJEMEN 250 SISWA =====================
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
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Tidak ada data siswa ditemukan.</td></tr>`;
      return;
    }

    students.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3 font-mono font-bold text-blue-700">${s.nisn}</td>
        <td class="p-3 font-semibold text-slate-800">${s.name}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">Kelas ${s.class}</span></td>
        <td class="p-3 font-mono text-slate-500">${s.password}</td>
        <td class="p-3 text-center">
          <button type="button" data-nisn="${s.nisn}" class="btn-delete-student text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded text-xs cursor-pointer" title="Hapus Siswa">
            🗑️
          </button>
        </td>
      `;
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

  // Cari Siswa
  const searchStudentInput = document.getElementById('searchStudentInput');
  if (searchStudentInput) {
    searchStudentInput.addEventListener('input', (e) => {
      renderAdminStudentsList(e.target.value.trim());
    });
  }

  // Unduh Template Excel Siswa
  const btnDownloadStudentTemplate = document.getElementById('btnDownloadStudentTemplate');
  if (btnDownloadStudentTemplate) {
    btnDownloadStudentTemplate.addEventListener('click', () => {
      window.studentManager.downloadExcelTemplate();
    });
  }

  // Impor Siswa dari Excel (.xlsx)
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

  // Generator 250 Siswa Demo
  const btnGenerate250Demo = document.getElementById('btnGenerate250Demo');
  if (btnGenerate250Demo) {
    btnGenerate250Demo.addEventListener('click', () => {
      if (confirm("Buat otomatis 250 akun siswa demo lengkap dengan NISN dan Kelas (7A-7D, 8A-8D, 9A-9D)?")) {
        const res = window.studentManager.generate250DemoStudents();
        alert(`Sukses! ${res.count} siswa demo berhasil dimuat ke pangkalan data sekolah.`);
        renderAdminStudentsList();
        setupSubjectAndClassFilters();
      }
    });
  }

  // Modal Preview & Cetak Kartu Peserta Ujian (250 Siswa)
  const modalPrintCardsPreview = document.getElementById('modalPrintCardsPreview');
  const cardPreviewContainer = document.getElementById('cardPreviewContainer');
  const cardPreviewClassFilter = document.getElementById('cardPreviewClassFilter');
  const cardPreviewCountBadge = document.getElementById('cardPreviewCountBadge');
  const btnCloseCardPreview = document.getElementById('btnCloseCardPreview');
  const btnCancelCardPreview = document.getElementById('btnCancelCardPreview');
  const btnExecuteDirectPrintCards = document.getElementById('btnExecuteDirectPrintCards');

  function openCardPreviewModal() {
    if (!modalPrintCardsPreview || !window.studentManager) return;
    const students = window.studentManager.getAllStudents();
    if (students.length === 0) {
      alert("Belum ada data siswa. Silakan klik '🎲 Isi 250 Siswa Demo' atau '📥 Impor dari Excel' terlebih dahulu.");
      return;
    }

    if (cardPreviewClassFilter) {
      const classes = window.studentManager.getAllClasses();
      cardPreviewClassFilter.innerHTML = '<option value="ALL">Semua Kelas (Cetak Semua)</option>';
      classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = `Kelas ${c}`;
        cardPreviewClassFilter.appendChild(opt);
      });
      cardPreviewClassFilter.value = "ALL";
    }

    renderCardPreviewContent("ALL");
    modalPrintCardsPreview.classList.remove('hidden');
  }

  function renderCardPreviewContent(selectedClass = "ALL") {
    if (!cardPreviewContainer || !window.studentManager) return;
    let students = window.studentManager.getAllStudents();
    if (selectedClass !== "ALL") {
      students = students.filter(s => String(s.class).trim().toUpperCase() === String(selectedClass).trim().toUpperCase());
    }

    if (cardPreviewCountBadge) {
      cardPreviewCountBadge.innerText = `${students.length} Kartu (${selectedClass === "ALL" ? "Semua Kelas" : "Kelas " + selectedClass})`;
    }

    const cardsHtml = window.studentManager.generateCardsHtml(students, "UJIAN SEKOLAH BERBASIS KOMPUTER");
    cardPreviewContainer.innerHTML = `
      <div class="cards-grid grid grid-cols-1 md:grid-cols-2 gap-3.5 max-w-4xl mx-auto">
        ${cardsHtml}
      </div>
    `;
  }

  function closeCardPreviewModal() {
    if (modalPrintCardsPreview) modalPrintCardsPreview.classList.add('hidden');
  }

  if (cardPreviewClassFilter) {
    cardPreviewClassFilter.addEventListener('change', (e) => {
      renderCardPreviewContent(e.target.value);
    });
  }

  if (btnCloseCardPreview) btnCloseCardPreview.addEventListener('click', closeCardPreviewModal);
  if (btnCancelCardPreview) btnCancelCardPreview.addEventListener('click', closeCardPreviewModal);

  if (btnExecuteDirectPrintCards) {
    btnExecuteDirectPrintCards.addEventListener('click', () => {
      const selectedClass = cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL";
      let students = window.studentManager.getAllStudents();
      if (selectedClass !== "ALL") {
        students = students.filter(s => String(s.class).trim().toUpperCase() === String(selectedClass).trim().toUpperCase());
      }
      closeCardPreviewModal();
      window.studentManager.printExamCards(students);
    });
  }

  const btnPrintStudentCards = document.getElementById('btnPrintStudentCards');
  if (btnPrintStudentCards) {
    btnPrintStudentCards.addEventListener('click', () => {
      openCardPreviewModal();
    });
  }

  // Reset Semua Password Siswa ke 123
  const btnResetAllStudentPasswords = document.getElementById('btnResetAllStudentPasswords');
  if (btnResetAllStudentPasswords) {
    btnResetAllStudentPasswords.addEventListener('click', () => {
      if (confirm("Peringatan Proktor: Yakin ingin mereset password SELURUH siswa peserta ujian ke default '123'?")) {
        const res = window.studentManager.resetAllStudentPasswords("123");
        alert(`Sukses! Password ${res.count} siswa berhasil direset ke '123'.`);
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
      }
    });
  }

  // Hapus Semua Siswa
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

  // ===================== TAB 4: MANAJEMEN GURU MAPEL & ADMIN =====================
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
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Tidak ada data guru ditemukan.</td></tr>`;
      return;
    }

    teachers.forEach((t, idx) => {
      const isSuperAdmin = t.role === 'admin' || t.id === 'admin';
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
        <td class="p-3">
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-bold text-slate-700 teacher-pin-val" data-real-pin="${t.pin}">••••••</span>
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

      // Toggle lihat PIN
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

      tr.querySelector('.btn-edit-teacher').addEventListener('click', () => {
        openEditTeacherModal(t);
      });

      const btnDelete = tr.querySelector('.btn-delete-teacher');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          if (confirm(`Peringatan Proktor: Yakin ingin menghapus guru "${t.name}" (${t.subject})?`)) {
            const delRes = window.cbtAdmin.deleteTeacher(t.id);
            if (delRes.success) {
              alert(delRes.message);
              renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value || '');
              setupSubjectAndClassFilters();
            } else {
              alert(delRes.message);
            }
          }
        });
      }

      tbody.appendChild(tr);
    });
  }

  // Live search guru
  const searchTeacherInput = document.getElementById('searchTeacherInput');
  if (searchTeacherInput) {
    searchTeacherInput.addEventListener('input', (e) => {
      renderAdminTeachersList(e.target.value.trim());
    });
  }

  // Modal Tambah & Edit Guru
  const modalEditTeacher = document.getElementById('modalEditTeacher');
  const formEditTeacher = document.getElementById('formEditTeacher');
  const btnCloseEditTeacher = document.getElementById('btnCloseEditTeacher');
  const btnCancelEditTeacher = document.getElementById('btnCancelEditTeacher');
  const btnOpenAddTeacher = document.getElementById('btnOpenAddTeacher');

  if (btnOpenAddTeacher) {
    btnOpenAddTeacher.addEventListener('click', () => {
      openAddTeacherModal();
    });
  }

  function openAddTeacherModal() {
    if (!modalEditTeacher) return;
    const titleEl = document.getElementById('modalEditTeacherTitle');
    const subEl = document.getElementById('modalEditTeacherSubtitle');
    const submitBtn = document.getElementById('btnSubmitEditTeacher');

    if (titleEl) titleEl.innerText = "Tambah Guru Baru";
    if (subEl) subEl.innerText = "Masukkan data guru pengampu mata pelajaran & password login";
    if (submitBtn) submitBtn.innerText = "Simpan Guru Baru";

    document.getElementById('editTeacherId').value = "";
    document.getElementById('editTeacherName').value = "";
    document.getElementById('editTeacherNip').value = "";
    document.getElementById('editTeacherSubject').value = "";
    document.getElementById('editTeacherPin').value = "guru123";

    modalEditTeacher.classList.remove('hidden');
    document.getElementById('editTeacherName').focus();
  }

  function openEditTeacherModal(teacher) {
    if (!modalEditTeacher) return;
    const titleEl = document.getElementById('modalEditTeacherTitle');
    const subEl = document.getElementById('modalEditTeacherSubtitle');
    const submitBtn = document.getElementById('btnSubmitEditTeacher');

    if (titleEl) titleEl.innerText = "Edit Data & Password Guru";
    if (subEl) subEl.innerText = "Perbarui identitas, mapel, atau password/PIN akun guru";
    if (submitBtn) submitBtn.innerText = "Simpan Perubahan";

    document.getElementById('editTeacherId').value = teacher.id;
    document.getElementById('editTeacherName').value = teacher.name;
    document.getElementById('editTeacherNip').value = teacher.nip;
    document.getElementById('editTeacherSubject').value = teacher.subject;
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
      const pin = document.getElementById('editTeacherPin').value.trim();

      if (!name || !nip || !subject || !pin) {
        alert("Semua kolom harus diisi!");
        return;
      }

      if (!id) {
        // Mode: Tambah Guru Baru
        const res = window.cbtAdmin.addTeacher({ name, nip, subject, pin });
        if (res.success) {
          alert(`Sukses! Guru "${name}" berhasil ditambahkan ke pangkalan data.`);
          closeEditTeacherModal();
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
        } else {
          alert(`Gagal menambah guru: ${res.message}`);
        }
      } else {
        // Mode: Edit Guru
        const res = window.cbtAdmin.updateTeacherProfile(id, { name, nip, subject, pin });
        if (res.success) {
          alert(`Data guru "${name}" berhasil diperbarui!`);
          closeEditTeacherModal();
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
          const cur = window.cbtAdmin.getCurrentTeacher();
          if (cur && cur.id === id) {
            renderAdminDashboard();
          }
        } else {
          alert(`Gagal edit guru: ${res.message}`);
        }
      }
    });
  }

  // Reset Semua Password Guru ke guru123
  const btnResetAllTeacherPasswords = document.getElementById('btnResetAllTeacherPasswords');
  if (btnResetAllTeacherPasswords) {
    btnResetAllTeacherPasswords.addEventListener('click', () => {
      if (confirm("Peringatan Proktor: Yakin ingin mereset password/PIN SELURUH guru ke default 'guru123'?")) {
        const res = window.cbtAdmin.resetAllTeacherPasswords("guru123");
        alert(`Sukses! Password ${res.count} guru telah direset ke 'guru123'.`);
        renderAdminTeachersList();
      }
    });
  }

  // ===================== TAB 5: PENGATURAN & KONEKSI CLOUD SUPABASE =====================
  function renderAdminConfigForm() {
    const config = window.examEngine.config;
    document.getElementById('cfgExamTitle').value = config.examTitle || '';
    document.getElementById('cfgSubject').value = config.subject || '';
    document.getElementById('cfgDurationMinutes').value = config.durationMinutes || 80;
    document.getElementById('cfgExamToken').value = config.examToken || 'CBT80M';
    document.getElementById('cfgMaxCheats').value = config.maxCheatViolations || 3;
    
    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    document.getElementById('cfgAdminPin').value = currentTeacher ? currentTeacher.pin : 'guru123';
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
        maxCheatViolations: parseInt(document.getElementById('cfgMaxCheats').value) || 3
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

    if (window.supabaseSync.isCloudConfigured()) {
      badge.className = "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300";
      if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
      if (text) text.innerText = "Cloud Online";
    } else {
      badge.className = "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200";
      if (dot) dot.className = "w-2 h-2 rounded-full bg-slate-400";
      if (text) text.innerText = "Mode Lokal";
    }
  }

  const formSupabaseConfig = document.getElementById('formSupabaseConfig');
  if (formSupabaseConfig) {
    formSupabaseConfig.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = document.getElementById('cfgSupabaseUrl').value.trim();
      const key = document.getElementById('cfgSupabaseKey').value.trim();
      window.supabaseSync.saveConfig(url, key);
      updateCloudBadge();
      alert("Konfigurasi Cloud Supabase berhasil disimpan!");
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
        alert("Supabase Cloud belum dikonfigurasi. Masukkan Project URL dan Anon Key di tab 'Pengaturan & Cloud'.");
        return;
      }
      btnSyncCloudResults.disabled = true;
      btnSyncCloudResults.innerText = "Menyinkronkan...";
      const res = await window.supabaseSync.fetchCloudResults();
      btnSyncCloudResults.disabled = false;
      btnSyncCloudResults.innerText = "🔄 Sinkron Cloud";
      if (res.success) {
        alert(`Sinkronisasi sukses! Mengambil ${res.count} data hasil ujian dari cloud.`);
        renderAdminAnalyticsAndResults();
      } else {
        alert(`Gagal sinkron cloud: ${res.message}`);
      }
    });
  }

  init();
});
