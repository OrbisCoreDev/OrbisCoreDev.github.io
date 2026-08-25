/* ==========================================================================
   DODO Family Work Space Javascript
   ========================================================================== */

const firebaseConfig = window.ORBIS_SITE_CONFIG && window.ORBIS_SITE_CONFIG.firebase;
if (!firebaseConfig || !firebaseConfig.projectId) {
    throw new Error('Firebase configuration is missing. Update site-config.js.');
}

// Initialize a separate Firebase App ("work") to isolate the login session and authentication from the family space.
let workApp;
if (!firebase.apps.some(app => app.name === "work")) {
    workApp = firebase.initializeApp(firebaseConfig, "work");
} else {
    workApp = firebase.app("work");
}
const db = workApp.firestore();
const auth = workApp.auth();
window.db = db; // 평가시트 등 외부 스크립트에서 접근용
window.auth = auth;

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 기본 네이비 테마 고정
    // ----------------------------------------------------
    // ----------------------------------------------------
    // 모바일 퀵 내비게이션 (Tabs Dropdown)
    // ----------------------------------------------------
    const mobileNavBtn = document.getElementById('work-mobile-nav-btn');
    const mobileNavDropdown = document.getElementById('work-mobile-nav-dropdown');

    if (mobileNavBtn && mobileNavDropdown) {
        mobileNavBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileNavDropdown.classList.toggle('hidden');
        });

        // 화면 바깥을 클릭하면 모바일 메뉴 닫기
        document.addEventListener('click', (e) => {
            if (!mobileNavBtn.contains(e.target) && !mobileNavDropdown.contains(e.target)) {
                mobileNavDropdown.classList.add('hidden');
            }
        });

        // 탭 메뉴 항목을 클릭하면 모바일 메뉴 닫기
        mobileNavDropdown.addEventListener('click', (e) => {
            if (e.target.closest('.work-tab')) {
                mobileNavDropdown.classList.add('hidden');
            }
        });
    }

    // ----------------------------------------------------
    // 인증 및 승인 관리 (workUsers)
    // ----------------------------------------------------
    let currentUser = null;
    let currentUserDoc = null;
    let workUserListener = null;
    let isSigningUp = false;

    // 탭별 접근 권한 설정 객체 (공개, 로그인필수, 승인필수 등)
    let tabPermissions = {};

    // Firestore 설정 리스너 등록
    db.collection('workSettings').doc('permissions').onSnapshot(doc => {
        if (doc.exists) {
            tabPermissions = doc.data() || {};
        } else {
            tabPermissions = {};
        }
        // 권한 변경 시 화면 재렌더링
        if (typeof renderRestrictedContent === 'function') {
            renderRestrictedContent();
        }
    }, err => console.error("권한 설정 로드 에러:", err));

    let workUserListenerActive = false;

    const authStatusHeader = document.getElementById('auth-status-header');
    const btnWorkLogin = document.getElementById('btn-work-login');
    const userProfileIcon = document.getElementById('user-profile-icon');
    const userProfileImg = document.getElementById('user-profile-img');
    const btnMasterAdmin = document.getElementById('btn-master-admin');

    // 모달들 (로그인 안 된 경우 보여주던 기존 모달들)
    const loginRequiredModal = document.getElementById('login-required-modal');

    // --- Work 전용 독립 인증 모달 로직 ---
    const workAuthContainer = document.getElementById('work-auth-container');
    const workAuthCloseBtn = document.getElementById('work-auth-close-btn');
    const workAuthWelcome = document.getElementById('work-auth-welcome');
    const workAuthLoginScreen = document.getElementById('work-auth-login-screen');
    const workAuthSignupScreen = document.getElementById('work-auth-signup-screen');
    const workAuthErrorMsg = document.getElementById('work-auth-error-msg');
    const btnWorkGoLogin = document.getElementById('work-btn-go-login');
    const btnWorkGoSignup = document.getElementById('work-btn-go-signup');
    const linkWorkToSignup = document.getElementById('work-link-to-signup');
    const linkWorkToLogin = document.getElementById('work-link-to-login');
    const workAuthBackBtns = document.querySelectorAll('.work-auth-back-btn');

    function openWorkAuth() {
        if (workAuthContainer) {
            workAuthContainer.classList.remove('hidden');
            showWorkAuthScreen('welcome');
            workAuthErrorMsg.classList.add('hidden');
        }
    }

    function closeWorkAuth() {
        if (workAuthContainer) workAuthContainer.classList.add('hidden');
    }

    function showWorkAuthScreen(screen) {
        if (!workAuthWelcome) return;
        workAuthWelcome.classList.add('hidden');
        workAuthLoginScreen.classList.add('hidden');
        workAuthSignupScreen.classList.add('hidden');
        workAuthErrorMsg.classList.add('hidden');

        if (screen === 'welcome') workAuthWelcome.classList.remove('hidden');
        else if (screen === 'login') workAuthLoginScreen.classList.remove('hidden');
        else if (screen === 'signup') workAuthSignupScreen.classList.remove('hidden');
    }

    if (btnWorkLogin) btnWorkLogin.addEventListener('click', openWorkAuth);
    if (workAuthCloseBtn) workAuthCloseBtn.addEventListener('click', closeWorkAuth);
    if (btnWorkGoLogin) btnWorkGoLogin.addEventListener('click', () => showWorkAuthScreen('login'));
    if (btnWorkGoSignup) btnWorkGoSignup.addEventListener('click', () => showWorkAuthScreen('signup'));
    if (linkWorkToSignup) linkWorkToSignup.addEventListener('click', (e) => { e.preventDefault(); showWorkAuthScreen('signup'); });
    if (linkWorkToLogin) linkWorkToLogin.addEventListener('click', (e) => { e.preventDefault(); showWorkAuthScreen('login'); });

    workAuthBackBtns.forEach(btn => {
        btn.addEventListener('click', () => showWorkAuthScreen('welcome'));
    });

    function showWorkAuthError(msg) {
        if (workAuthErrorMsg) {
            workAuthErrorMsg.innerText = msg;
            workAuthErrorMsg.classList.remove('hidden');
        } else {
            alert(msg);
        }
    }

    // 로그인 처리
    const workLoginForm = document.getElementById('work-login-form');
    if (workLoginForm) {
        workLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('work-login-email').value;
            const password = document.getElementById('work-login-password').value;

            auth.signInWithEmailAndPassword(email, password)
                .then(async (userCredential) => {
                    const user = userCredential.user;
                    // 회사 공간 유저인지 검증
                    try {
                        const doc = await db.collection('workUsers').doc(user.uid).get();
                        if (!doc.exists) {
                            await auth.signOut();
                            showWorkAuthError("회사 공간에 등록되지 않은 계정입니다.");
                            return;
                        }
                        closeWorkAuth();
                    } catch (err) {
                        console.error("유저 검증 오류:", err);
                        await auth.signOut();
                        showWorkAuthError("로그인 검증 중 오류가 발생했습니다.");
                    }
                })
                .catch(err => {
                    console.error("Work 로그인 에러:", err);
                    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                        showWorkAuthError("이메일 또는 비밀번호가 일치하지 않습니다.");
                    } else {
                        showWorkAuthError("로그인 실패: " + err.message);
                    }
                });
        });
    }

    // 회원가입 처리
    const workSignupForm = document.getElementById('work-signup-form');
    if (workSignupForm) {
        workSignupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('work-signup-email').value;
            const password = document.getElementById('work-signup-password').value;
            const nickname = document.getElementById('work-signup-nickname').value;
            const dept = document.getElementById('work-signup-dept').value;

            isSigningUp = true;
            auth.createUserWithEmailAndPassword(email, password)
                .then(async (userCredential) => {
                    const user = userCredential.user;
                    await user.updateProfile({ displayName: nickname });

                    // workUsers 컬렉션에 커스텀 데이터(직책 포함) 강제 기록 (onSnapshot 덮어쓰기 방지)
                    await db.collection('workUsers').doc(user.uid).set({
                        uid: user.uid,
                        email: user.email,
                        nickname: nickname,
                        dept: dept,
                        photoURL: null,
                        isApproved: false,
                        isMaster: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    isSigningUp = false;
                    closeWorkAuth();
                    alert("회원가입 완료! 마스터의 가입 승인을 기다려주세요.");
                })
                .catch(err => {
                    isSigningUp = false;
                    console.error("Work 회원가입 에러:", err);
                    if (err.code === 'auth/email-already-in-use') {
                        showWorkAuthError("이미 사용중인 이메일입니다.");
                    } else if (err.code === 'auth/weak-password') {
                        showWorkAuthError("비밀번호는 6자리 이상이어야 합니다.");
                    } else {
                        showWorkAuthError("회원가입 실패: " + err.message);
                    }
                });
        });
    }

    const btnMasterLogout = document.getElementById('btn-master-logout');

    if (userProfileIcon) {
        userProfileIcon.style.cursor = 'pointer';
        userProfileIcon.addEventListener('click', () => {
            if (confirm('로그아웃 하시겠습니까?')) {
                auth.signOut().then(() => location.reload());
            }
        });
    }

    if (btnMasterLogout) {
        btnMasterLogout.addEventListener('click', () => {
            if (confirm('로그아웃 하시겠습니까?')) {
                auth.signOut().then(() => location.reload());
            }
        });
    }

    // 보안 영역 처리 함수
    function showAuthRequiredMessage(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div style="text-align:center; padding: 100px 50px; color: var(--text-muted);">
                <i class="fa-solid fa-lock" style="font-size: 3rem; margin-bottom: 20px; color: #ff4757;"></i>
                <h3 style="font-size: 1.5rem; margin-bottom: 10px;">접근 권한이 없습니다</h3>
                <p>내용을 보려면 로그인 및 마스터의 승인이 필요합니다.</p>
            </div>`;
        }
    }

    function showTabLockOverlay(tabId) {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;

        if (tabEl.querySelector('.tab-lock-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'tab-lock-overlay';
        overlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; min-height: 450px; background: linear-gradient(135deg, #f5f7fa 0%, #f0f2f8 50%, #f5f7fa 100%); z-index: 100; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-sizing: border-box; overflow: hidden;';

        // 장식용 점/선 배경 생성
        const dots = [];
        const colors = ['rgba(255, 71, 87, 0.15)', 'rgba(27, 79, 114, 0.12)', 'rgba(0, 206, 201, 0.12)', 'rgba(253, 203, 110, 0.15)', 'rgba(27, 79, 114, 0.08)'];
        const positions = [
            { x: '10%', y: '20%', size: 10 }, { x: '25%', y: '35%', size: 6 }, { x: '15%', y: '65%', size: 8 },
            { x: '75%', y: '25%', size: 7 }, { x: '85%', y: '50%', size: 10 }, { x: '70%', y: '70%', size: 5 },
            { x: '40%', y: '15%', size: 5 }, { x: '60%', y: '80%', size: 8 }, { x: '90%', y: '35%', size: 6 },
            { x: '5%', y: '45%', size: 7 }
        ];
        let dotsHTML = '';
        positions.forEach((pos, i) => {
            dotsHTML += `<div style="position:absolute; left:${pos.x}; top:${pos.y}; width:${pos.size}px; height:${pos.size}px; border-radius:50%; background:${colors[i % colors.length]}; pointer-events:none;"></div>`;
        });

        // 장식용 선 생성
        const linesHTML = `
            <svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; opacity:0.08;" xmlns="http://www.w3.org/2000/svg">
                <line x1="5%" y1="30%" x2="30%" y2="50%" stroke="#1b4f72" stroke-width="1"/>
                <line x1="30%" y1="50%" x2="20%" y2="75%" stroke="#1b4f72" stroke-width="1"/>
                <line x1="70%" y1="20%" x2="90%" y2="45%" stroke="#1b4f72" stroke-width="1"/>
                <line x1="60%" y1="65%" x2="85%" y2="55%" stroke="#1b4f72" stroke-width="1"/>
                <line x1="15%" y1="25%" x2="40%" y2="18%" stroke="#00cec9" stroke-width="1"/>
                <line x1="75%" y1="70%" x2="55%" y2="80%" stroke="#00cec9" stroke-width="1"/>
            </svg>
        `;

        overlay.innerHTML = `
            ${dotsHTML}
            ${linesHTML}
            <div style="position:relative; z-index:2; display:flex; flex-direction:column; align-items:center;">
                <div style="width:64px; height:64px; border-radius:16px; background:linear-gradient(135deg, #ff4757, #ff6b81); display:flex; align-items:center; justify-content:center; margin-bottom:24px; box-shadow: 0 8px 24px rgba(255,71,87,0.25);">
                    <i class="fa-solid fa-lock" style="font-size: 1.6rem; color: white;"></i>
                </div>
                <h3 style="font-size: 1.6rem; font-weight: 800; margin: 0 0 12px 0; color: #2d3436; letter-spacing: -0.5px;">접근 권한이 없습니다</h3>
                <p style="color: #636e72; font-size: 0.95rem; margin: 0; line-height: 1.6;">내용을 보려면 로그인 및 마스터의 승인이 필요합니다.</p>
            </div>
        `;

        if (window.getComputedStyle(tabEl).position === 'static') {
            tabEl.style.position = 'relative';
        }
        tabEl.appendChild(overlay);
    }

    function hideTabLockOverlay(tabId) {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;
        const overlay = tabEl.querySelector('.tab-lock-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    function renderRestrictedContent() {
        const psApp = document.querySelector('.ps-desktop-app');
        const psLock = document.getElementById('ps-auth-lock');
        const btnAddIdea = document.getElementById('btn-add-idea');
        const btnAddInfo = document.getElementById('btn-add-info');

        const allTabs = ['tab-schedule', 'tab-performance', 'tab-members', 'tab-ideas', 'tab-info', 'tab-notice', 'tab-bookmarks', 'tab-projects', 'tab-evaluation'];

        // 항상 먼저 모든 오버레이를 제거
        allTabs.forEach(tabId => hideTabLockOverlay(tabId));

        let anyLocked = false;

        allTabs.forEach(tabId => {
            const reqPerm = tabPermissions[tabId] || 'approval_required'; // 기본 읽기 권한
            const reqWritePerm = tabPermissions[tabId + '_write'] || 'approval_required'; // 기본 쓰기 권한

            let hasAccess = false;
            let hasWriteAccess = false;

            // 1. 읽기 권한 확인
            if (reqPerm === 'public') {
                hasAccess = true;
            } else if (reqPerm === 'login_only') {
                hasAccess = !!currentUser;
            } else if (reqPerm === 'private') {
                hasAccess = !!(currentUser && currentUserDoc && currentUserDoc.isMaster);
            } else { // approval_required
                hasAccess = !!(currentUser && currentUserDoc && (currentUserDoc.isApproved || currentUserDoc.isMaster));
            }

            // 2. 쓰기 권한 확인
            if (reqWritePerm === 'public') {
                hasWriteAccess = true;
            } else if (reqWritePerm === 'login_only') {
                hasWriteAccess = !!currentUser;
            } else if (reqWritePerm === 'master_only') {
                hasWriteAccess = !!(currentUser && currentUserDoc && currentUserDoc.isMaster);
            } else { // approval_required
                hasWriteAccess = !!(currentUser && currentUserDoc && (currentUserDoc.isApproved || currentUserDoc.isMaster));
            }

            // 읽기 권한이 없으면 쓰기 권한도 무조건 없음
            if (!hasAccess) hasWriteAccess = false;

            if (!hasAccess) {
                showTabLockOverlay(tabId);
                anyLocked = true;

                // 해당 탭의 데이터 구독 해제 및 기본 요소 숨김
                if (tabId === 'tab-ideas') {
                    if (btnAddIdea) btnAddIdea.style.display = 'none';
                    if (typeof window.unsubscribeIdeas === 'function') window.unsubscribeIdeas();
                }
                if (tabId === 'tab-info') {
                    if (btnAddInfo) btnAddInfo.style.display = 'none';
                    if (typeof window.unsubscribeInfo === 'function') window.unsubscribeInfo();
                }
                if (tabId === 'tab-projects' && psApp) {
                    psApp.style.setProperty('display', 'none', 'important');
                }
            } else {
                // 접근 허용 시 데이터 구독 복구
                if (tabId === 'tab-ideas') {
                    if (typeof window.subscribeIdeas === 'function') window.subscribeIdeas();
                }
                if (tabId === 'tab-info') {
                    if (typeof window.subscribeInfo === 'function') window.subscribeInfo();
                }
                if (tabId === 'tab-projects' && psApp) {
                    psApp.style.display = '';
                }
            }

            // 3. 쓰기 권한에 따른 작성/추가 버튼 UI 제어
            if (tabId === 'tab-ideas' && btnAddIdea) {
                btnAddIdea.style.display = hasWriteAccess ? '' : 'none';
            }
            if (tabId === 'tab-info' && btnAddInfo) {
                btnAddInfo.style.display = hasWriteAccess ? '' : 'none';
            }
            if (tabId === 'tab-notice') {
                const btnWriteNotice = document.getElementById('btn-write-notice');
                if (btnWriteNotice) btnWriteNotice.style.display = hasWriteAccess ? '' : 'none';
            }
            if (tabId === 'tab-bookmarks') {
                const btnAddBookmark = document.getElementById('btn-add-bookmark-top');
                if (btnAddBookmark) btnAddBookmark.style.display = hasWriteAccess ? '' : 'none';
            }
            if (tabId === 'tab-projects') {
                const projectToolbox = document.querySelector('.ps-left-toolbar');
                if (projectToolbox) {
                    projectToolbox.style.pointerEvents = hasWriteAccess ? 'auto' : 'none';
                    projectToolbox.style.opacity = hasWriteAccess ? '1' : '0.4';
                }
            }
            if (tabId === 'tab-evaluation') {
                const btnEvalSave = document.getElementById('btn-eval-save');
                if (btnEvalSave) {
                    btnEvalSave.style.display = hasWriteAccess ? '' : 'none';
                }
            }
            // (일정관리는 캘린더 빈칸 클릭 시 이벤트 추가가 동작하므로 별도로 hasWriteAccess 변수를 전역적으로 체크하게 할 수 있음)
        });

        // 일정관리 쓰기 권한은 전역변수로 저장하여 달력 클릭 시 체크
        const scheduleWritePerm = tabPermissions['tab-schedule_write'] || 'approval_required';
        let scheduleHasWriteAccess = false;
        if (scheduleWritePerm === 'public') scheduleHasWriteAccess = true;
        else if (scheduleWritePerm === 'login_only') scheduleHasWriteAccess = !!currentUser;
        else if (scheduleWritePerm === 'master_only') scheduleHasWriteAccess = !!(currentUser && currentUserDoc && currentUserDoc.isMaster);
        else scheduleHasWriteAccess = !!(currentUser && currentUserDoc && (currentUserDoc.isApproved || currentUserDoc.isMaster));
        window.scheduleHasWriteAccess = scheduleHasWriteAccess;

        if (psLock) {
            if (anyLocked) {
                // 혹시 프로젝트 앱 자체에 오버레이를 띄워야 한다면 여기에 처리 (현재는 탭에 오버레이)
            } else {
                psLock.classList.add('hidden');
                psLock.innerHTML = '';
            }
        }

        // 공통 UI 요소 렌더링 (마스터 전용 버튼 등)
        const workHeroEditTrigger = document.getElementById('work-hero-img-edit-trigger');
        if (workHeroEditTrigger) {
            if (currentUserDoc && currentUserDoc.isMaster) {
                workHeroEditTrigger.classList.remove('hidden');
            } else {
                workHeroEditTrigger.classList.add('hidden');
            }
        }

        const btnGcalSettings = document.getElementById('btn-gcal-settings');
        if (btnGcalSettings) {
            if (currentUserDoc && currentUserDoc.isMaster) {
                btnGcalSettings.style.display = 'inline-block';
            } else {
                btnGcalSettings.style.display = 'none';
            }
        }

        // 공통 렌더링 로직 재호출 (권한 있는 곳만 볼 수 있도록 각 함수 내부에서 권한을 재확인하거나 렌더링)
        // 위에서 권한 있는 탭에 한해서 subscribe 함수들이 호출되므로 여기서는 제외함
        if (typeof renderWorkLinks === 'function') renderWorkLinks();
        if (typeof renderSchedules === 'function') renderSchedules();
        if (typeof renderPerformances === 'function') renderPerformances();
        if (window.renderWorkMembersChatList) window.renderWorkMembersChatList();
        if (typeof renderPsScheduler === 'function') renderPsScheduler();
        if (typeof renderNotices === 'function') renderNotices();
    }

    auth.onAuthStateChanged((user) => {
        // LOCAL TEST OVERRIDE (Disabled for production)
        // user = { uid: "M7XrlN7UNNYJf4cIQyDKwyml2pr1", email: "lck1316@gmail.com" };
        currentUser = user;
        if (workUserListener) {
            workUserListener(); // Unsubscribe previous listener
            workUserListener = null;
        }

        if (user) {
            // 개인 캘린더 리스너는 공유 캘린더(workSiteSettings)로 대체되어 비활성화
            // (마스터가 workSiteSettings에 저장한 공유 캘린더를 모든 팀원이 볼 수 있음)
            if (userGoogleCalendarListener) {
                userGoogleCalendarListener();
                userGoogleCalendarListener = null;
            }

            // Check workUsers collection
            const userRef = db.collection('workUsers').doc(user.uid);

            workUserListener = userRef.onSnapshot(doc => {
                if (!doc.exists) {
                    if (isSigningUp) {
                        return; // 회원가입 중에는 강제 로그아웃 로직 우회
                    }
                    alert("회사 공간에 등록되지 않은 사용자 계정입니다. 계정을 새로 생성하거나 확인해주세요.");
                    auth.signOut();
                    return;
                }

                currentUserDoc = doc.data();
                window.currentUserDocGlobal = currentUserDoc; // 평가시트 스크립트에서 접근용
                // 공통: 로그인 사용자 이름 헤더 표시
                const loggedInUsernameEl = document.getElementById('logged-in-username');
                if (loggedInUsernameEl) {
                    const displayName = currentUserDoc.nickname || currentUserDoc.email || user.email || '';
                    loggedInUsernameEl.textContent = displayName;
                    loggedInUsernameEl.title = displayName;
                    loggedInUsernameEl.style.display = 'inline-block';
                }

                if (currentUserDoc.isApproved || currentUserDoc.isMaster) {
                    // 승인됨 또는 마스터 -> 화면 표시
                    authStatusHeader.style.display = 'none';
                    btnWorkLogin.style.display = 'none';

                    if (currentUserDoc.isMaster) {
                        btnMasterAdmin.style.display = 'inline-block';
                        const masterZone = document.getElementById('ps-master-zone');
                        if (masterZone) masterZone.style.display = 'flex';
                        if (userProfileIcon) userProfileIcon.style.display = 'none';
                    } else {
                        btnMasterAdmin.style.display = 'none';
                        const masterZone = document.getElementById('ps-master-zone');
                        if (masterZone) masterZone.style.display = 'none';
                        if (userProfileIcon) {
                            userProfileIcon.style.display = 'block';
                            let pUrl = currentUserDoc.photoURL;
                            const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2IwYmVjNSI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg==';
                            userProfileImg.src = (pUrl && pUrl !== 'null' && pUrl.trim() !== '') ? pUrl : DEFAULT_AVATAR;
                        }
                    }

                    renderRestrictedContent();
                    if (typeof renderPsScheduler === 'function') renderPsScheduler();
                } else {
                    // 승인 대기중 -> 화면 가림
                    authStatusHeader.style.display = 'inline-block';
                    btnWorkLogin.style.display = 'none';
                    if (userProfileIcon) {
                        userProfileIcon.style.display = 'block';
                        let pUrl = currentUserDoc.photoURL;
                        const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2IwYmVjNSI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg==';
                        userProfileImg.src = (pUrl && pUrl !== 'null' && pUrl.trim() !== '') ? pUrl : DEFAULT_AVATAR;
                    }
                    if (btnMasterAdmin) btnMasterAdmin.style.display = 'none';
                    const masterZone = document.getElementById('ps-master-zone');
                    if (masterZone) masterZone.style.display = 'none';

                    renderRestrictedContent();
                }
            });
        } else {
            // 로그아웃 됨
            currentUserDoc = null;
            window.currentUserDocGlobal = null;
            authStatusHeader.style.display = 'none';
            btnWorkLogin.style.display = 'inline-block';

            // 로그인 아이디 숨기기
            const loggedInUsernameElOut = document.getElementById('logged-in-username');
            if (loggedInUsernameElOut) loggedInUsernameElOut.style.display = 'none';

            if (userProfileIcon) userProfileIcon.style.display = 'none';
            if (btnMasterAdmin) btnMasterAdmin.style.display = 'none';
            const masterZone = document.getElementById('ps-master-zone');
            if (masterZone) masterZone.style.display = 'none';

            if (userGoogleCalendarListener) {
                userGoogleCalendarListener();
                userGoogleCalendarListener = null;
            }
            // 공유 캘린더(workSiteSettings)는 별도 onSnapshot이 관리하므로 여기서 초기화하지 않음
            googleEvents = {};
            if (typeof renderWorkCalendar === 'function') {
                renderWorkCalendar();
            }

            // 로그아웃 상태일 때도 restricted message 렌더링
            renderRestrictedContent();
        }
    });

// ----------------------------------------------------
// 마스터 회원 관리 로직
// ----------------------------------------------------
const masterAdminModal = document.getElementById('master-admin-modal');
const masterApprovalList = document.getElementById('master-approval-list');

if (btnMasterAdmin) {
    btnMasterAdmin.addEventListener('click', () => {
        masterAdminModal.classList.remove('hidden');
        // 기본 탭 활성화
        document.getElementById('tab-btn-master-users').click();
    });
}

// 마스터 모달 탭 전환 로직
const tabBtnMasterUsers = document.getElementById('tab-btn-master-users');
const tabBtnMasterPerms = document.getElementById('tab-btn-master-perms');
const tabBtnMasterBackup = document.getElementById('tab-btn-master-backup');
const masterUsersSection = document.getElementById('master-users-section');
const masterPermsSection = document.getElementById('master-perms-section');
const masterBackupSection = document.getElementById('master-backup-section');

if (tabBtnMasterUsers && tabBtnMasterPerms) {
    tabBtnMasterUsers.addEventListener('click', () => {
        tabBtnMasterUsers.style.background = 'var(--primary-color)';
        tabBtnMasterUsers.style.color = '#fff';
        tabBtnMasterPerms.style.background = '#f1f2f6';
        tabBtnMasterPerms.style.color = '#576574';
        if (tabBtnMasterBackup) {
            tabBtnMasterBackup.style.background = '#f1f2f6';
            tabBtnMasterBackup.style.color = '#576574';
        }

        masterUsersSection.classList.remove('hidden');
        masterPermsSection.classList.add('hidden');
        if (masterBackupSection) masterBackupSection.classList.add('hidden');
        loadMasterApprovalList();
    });

    tabBtnMasterPerms.addEventListener('click', () => {
        tabBtnMasterPerms.style.background = 'var(--primary-color)';
        tabBtnMasterPerms.style.color = '#fff';
        tabBtnMasterUsers.style.background = '#f1f2f6';
        tabBtnMasterUsers.style.color = '#576574';
        if (tabBtnMasterBackup) {
            tabBtnMasterBackup.style.background = '#f1f2f6';
            tabBtnMasterBackup.style.color = '#576574';
        }

        masterPermsSection.classList.remove('hidden');
        masterUsersSection.classList.add('hidden');
        if (masterBackupSection) masterBackupSection.classList.add('hidden');
        loadMasterPermissionsList();
    });

    if (tabBtnMasterBackup) {
        tabBtnMasterBackup.addEventListener('click', () => {
            tabBtnMasterBackup.style.background = 'var(--primary-color)';
            tabBtnMasterBackup.style.color = '#fff';
            tabBtnMasterUsers.style.background = '#f1f2f6';
            tabBtnMasterUsers.style.color = '#576574';
            tabBtnMasterPerms.style.background = '#f1f2f6';
            tabBtnMasterPerms.style.color = '#576574';

            if (masterBackupSection) masterBackupSection.classList.remove('hidden');
            masterUsersSection.classList.add('hidden');
            masterPermsSection.classList.add('hidden');
        });
    }
}

// --- 백업/복원 로직 ---
const btnBackupData = document.getElementById('btn-backup-data');
const inputRestoreFile = document.getElementById('input-restore-file');
const btnSelectRestoreFile = document.getElementById('btn-select-restore-file');
const restoreFileName = document.getElementById('restore-file-name');
const btnRestoreData = document.getElementById('btn-restore-data');

const backupCollections = [
    'workSettings', 'workUsers', 'workSchedules', 'workProjects', 'workLinks',
    'workNotices', 'workMembers', 'workSiteSettings', 'workMemberChats',
    'workEvaluations', 'workIdeas', 'workEvalSheet'
];

if (btnBackupData) {
    btnBackupData.addEventListener('click', async () => {
        if (!confirm('전체 데이터를 백업하시겠습니까? (데이터 양에 따라 시간이 소요될 수 있습니다)')) return;

        btnBackupData.disabled = true;
        btnBackupData.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 백업 진행 중...';

        try {
            const backupData = {};
            for (const col of backupCollections) {
                backupData[col] = {};
                const snapshot = await db.collection(col).get();
                snapshot.forEach(doc => {
                    backupData[col][doc.id] = doc.data();
                });
            }

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const timeStr = now.toISOString().replace(/[:.]/g, '-');
            a.download = `dodo_work_backup_${timeStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            alert('백업이 완료되었습니다.');
        } catch (err) {
            console.error("백업 오류:", err);
            alert('백업 중 오류가 발생했습니다.');
        } finally {
            btnBackupData.disabled = false;
            btnBackupData.innerHTML = '<i class="fa-solid fa-file-arrow-down"></i> 전체 데이터 백업하기';
        }
    });
}

let selectedRestoreData = null;

if (btnSelectRestoreFile && inputRestoreFile) {
    btnSelectRestoreFile.addEventListener('click', () => {
        inputRestoreFile.click();
    });

    inputRestoreFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            restoreFileName.innerText = '선택된 파일 없음';
            btnRestoreData.disabled = true;
            selectedRestoreData = null;
            return;
        }

        restoreFileName.innerText = file.name;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                selectedRestoreData = JSON.parse(event.target.result);
                btnRestoreData.disabled = false;
            } catch (err) {
                alert('유효한 JSON 파일이 아닙니다.');
                restoreFileName.innerText = '선택된 파일 없음';
                btnRestoreData.disabled = true;
                selectedRestoreData = null;
                inputRestoreFile.value = '';
            }
        };
        reader.readAsText(file);
    });
}

if (btnRestoreData) {
    btnRestoreData.addEventListener('click', async () => {
        if (!selectedRestoreData) return;
        if (!confirm('경고: 데이터를 복원하면 기존 데이터가 덮어씌워집니다! 정말 복원하시겠습니까?')) return;

        const pwd = prompt('마스터 확인: 복원하려면 "DODO_RESTORE" 를 입력하세요.');
        if (pwd !== 'DODO_RESTORE') {
            alert('입력값이 일치하지 않아 복원을 취소합니다.');
            return;
        }

        btnRestoreData.disabled = true;
        btnRestoreData.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 복원 진행 중...';

        try {
            let totalDocs = 0;
            // Timestamp 필드 복구 유틸리티 함수
            const fixTimestamps = (obj) => {
                if (obj === null || typeof obj !== 'object') return obj;

                if ('seconds' in obj && 'nanoseconds' in obj && Object.keys(obj).length === 2) {
                    return new firebase.firestore.Timestamp(obj.seconds, obj.nanoseconds);
                }

                for (const key in obj) {
                    obj[key] = fixTimestamps(obj[key]);
                }
                return obj;
            };

            for (const col of Object.keys(selectedRestoreData)) {
                if (!backupCollections.includes(col)) continue; // 안전 확인

                const colData = selectedRestoreData[col];
                for (const docId of Object.keys(colData)) {
                    let docData = colData[docId];
                    docData = fixTimestamps(docData);
                    await db.collection(col).doc(docId).set(docData);
                    totalDocs++;
                }
            }

            alert(`복원이 성공적으로 완료되었습니다! (총 ${totalDocs}개 문서 복원) 새로고침을 진행합니다.`);
            location.reload();
        } catch (err) {
            console.error("복원 오류:", err);
            alert('복원 중 오류가 발생했습니다. 콘솔을 확인하세요.');
            btnRestoreData.disabled = false;
            btnRestoreData.innerHTML = '<i class="fa-solid fa-file-arrow-up"></i> 복원 실행하기';
        }
    });
}

// 메뉴 권한 설정 로드
const TABS_INFO = [
    { id: 'tab-schedule', name: '일정관리', icon: 'fa-calendar-check' },
    { id: 'tab-performance', name: '개인성과', icon: 'fa-trophy' },
    { id: 'tab-projects', name: '프로젝트', icon: 'fa-bars-progress' },
    { id: 'tab-evaluation', name: '평가시트', icon: 'fa-file-excel' },
    { id: 'tab-ideas', name: '아이디어', icon: 'fa-lightbulb' },
    { id: 'tab-members', name: '구성원', icon: 'fa-users' },
    { id: 'tab-info', name: '정보마당', icon: 'fa-newspaper' },
    { id: 'tab-notice', name: '알림마당', icon: 'fa-bullhorn' },
    { id: 'tab-bookmarks', name: '북마크', icon: 'fa-bookmark' }
];

function loadMasterPermissionsList() {
    const listEl = document.getElementById('master-permissions-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    TABS_INFO.forEach(tab => {
        const currentPerm = tabPermissions[tab.id] || 'approval_required'; // 기본 읽기 권한
        const currentWritePerm = tabPermissions[tab.id + '_write'] || 'approval_required'; // 기본 쓰기 권한

        const item = document.createElement('div');
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 10px;';

        item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; min-width: 120px;">
                    <div style="width: 30px; height: 30px; border-radius: 6px; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid ${tab.icon}"></i>
                    </div>
                    <span style="font-weight: bold; color: #2d3436;">${tab.name}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 250px; align-items: flex-end;">
                    <div style="display: flex; align-items: center; gap: 10px; width: 100%; justify-content: flex-end;">
                        <span style="font-size: 0.8rem; color: #636e72; font-weight: bold; width: 60px; text-align: right;">보기 권한</span>
                        <select id="perm-select-${tab.id}" style="padding: 6px; border-radius: 6px; border: 1px solid #ced4da; font-family: inherit; font-size: 0.8rem; color: #495057; outline: none; background: #fff; width: 180px;">
                            <option value="public" ${currentPerm === 'public' ? 'selected' : ''}>전체 공개 (비로그인 가능)</option>
                            <option value="login_only" ${currentPerm === 'login_only' ? 'selected' : ''}>로그인 필수</option>
                            <option value="approval_required" ${currentPerm === 'approval_required' ? 'selected' : ''}>마스터 승인 회원 전용</option>
                            <option value="private" ${currentPerm === 'private' ? 'selected' : ''}>비공개 (마스터 전용)</option>
                        </select>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; width: 100%; justify-content: flex-end;">
                        <span style="font-size: 0.8rem; color: #ff4757; font-weight: bold; width: 60px; text-align: right;">쓰기 권한</span>
                        <select id="perm-write-select-${tab.id}" style="padding: 6px; border-radius: 6px; border: 1px solid #ced4da; font-family: inherit; font-size: 0.8rem; color: #495057; outline: none; background: #fff; width: 180px;">
                            <option value="public" ${currentWritePerm === 'public' ? 'selected' : ''}>전체 공개 (비로그인 가능)</option>
                            <option value="login_only" ${currentWritePerm === 'login_only' ? 'selected' : ''}>로그인 필수</option>
                            <option value="approval_required" ${currentWritePerm === 'approval_required' ? 'selected' : ''}>마스터 승인 회원 전용</option>
                            <option value="master_only" ${currentWritePerm === 'master_only' ? 'selected' : ''}>마스터 전용</option>
                        </select>
                    </div>
                </div>
            `;
        listEl.appendChild(item);
    });
}

const btnSavePermissions = document.getElementById('btn-save-permissions');
if (btnSavePermissions) {
    btnSavePermissions.addEventListener('click', () => {
        const newPerms = {};
        TABS_INFO.forEach(tab => {
            const selectEl = document.getElementById(`perm-select-${tab.id}`);
            const writeSelectEl = document.getElementById(`perm-write-select-${tab.id}`);

            if (selectEl) {
                newPerms[tab.id] = selectEl.value;
            }
            if (writeSelectEl) {
                newPerms[tab.id + '_write'] = writeSelectEl.value;
            }
        });

        btnSavePermissions.disabled = true;
        btnSavePermissions.innerHTML = '저장 중...';

        db.collection('workSettings').doc('permissions').set(newPerms, { merge: true })
            .then(() => {
                alert('권한 설정이 저장되었습니다.');
            })
            .catch(err => {
                console.error('권한 저장 오류:', err);
                alert('저장 중 오류가 발생했습니다.');
            })
            .finally(() => {
                btnSavePermissions.disabled = false;
                btnSavePermissions.innerHTML = '권한 설정 저장';
            });
    });
}

function loadMasterApprovalList() {
    if (!masterApprovalList) return;
    masterApprovalList.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">로딩 중...</p>';

    db.collection('workUsers').get()
        .then(snapshot => {
            masterApprovalList.innerHTML = '';
            if (snapshot.empty) {
                masterApprovalList.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">가입된 회원이 없습니다.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const data = doc.data();

                const item = document.createElement('div');
                item.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 10px; color: #2d3436;';

                const isApproved = data.isApproved === true;
                const isUserMaster = data.isMaster === true;

                const statusBadge = isApproved
                    ? `<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(46, 213, 115, 0.2); color: #2ed573;">승인됨</span>`
                    : `<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(255, 71, 87, 0.2); color: #ff4757;">대기중</span>`;

                const roleBadge = isUserMaster
                    ? `<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(255, 165, 2, 0.2); color: #ffa502; margin-left: 5px;">마스터</span>`
                    : `<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(148, 163, 184, 0.2); color: #94a3b8; margin-left: 5px;">일반</span>`;

                const actionBtn = isApproved
                    ? `<button class="btn btn-secondary" onclick="window.workToggleApproval('${doc.id}', false)" style="padding: 6px 10px; font-size: 0.8rem; border-color: #ff4757; color: #ff4757; flex: 1; background: #ffffff;">승인 취소</button>`
                    : `<button class="btn btn-primary" onclick="window.workToggleApproval('${doc.id}', true)" style="padding: 6px 10px; font-size: 0.8rem; flex: 1;">가입 승인</button>`;

                const roleBtn = isUserMaster
                    ? `<button class="btn btn-secondary" onclick="window.workToggleMaster('${doc.id}', false)" style="padding: 6px 10px; font-size: 0.8rem; border-color: #ffa502; color: #ffa502; flex: 1; background: #ffffff;">일반으로 강등</button>`
                    : `<button class="btn btn-secondary" onclick="window.workToggleMaster('${doc.id}', true)" style="padding: 6px 10px; font-size: 0.8rem; border-color: #2ed573; color: #2ed573; flex: 1; background: #ffffff;">마스터 임명</button>`;

                item.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <p style="margin: 0; font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 5px;">${data.nickname} ${statusBadge} ${roleBadge}</p>
                                <p style="margin: 0; font-size: 0.8rem; color: #636e72; margin-top: 4px;">${data.email}</p>
                            </div>
                            <button class="btn btn-secondary" onclick="window.workRejectUser('${doc.id}')" style="padding: 6px 12px; font-size: 0.8rem; border-color: #ff4757; color: #ff4757; background: #ffffff;" title="계정 완전 삭제"><i class="fa-solid fa-user-xmark"></i> 강제 탈퇴</button>
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 5px;">
                            ${actionBtn}
                            ${roleBtn}
                        </div>
                    `;
                masterApprovalList.appendChild(item);
            });
        })
        .catch(err => {
            console.error("회원 리스트 로드 실패:", err);
            masterApprovalList.innerHTML = '<p style="text-align: center; color: #ff4757; font-size: 0.9rem;">리스트를 불러오는 중 오류가 발생했습니다.</p>';
        });
}

window.workToggleApproval = function (userId, approve) {
    const actionStr = approve ? "승인" : "승인 해제";
    if (confirm(`이 회원을 ${actionStr} 처리하시겠습니까?`)) {
        db.collection('workUsers').doc(userId).update({ isApproved: approve })
            .then(() => {
                alert(`${actionStr} 완료되었습니다.`);
                loadMasterApprovalList();
            })
            .catch(err => {
                console.error("승인/해제 실패:", err);
                alert("처리 중 오류가 발생했습니다.");
            });
    }
};

window.workToggleMaster = function (userId, makeMaster) {
    const actionStr = makeMaster ? "마스터로 임명" : "일반 계정으로 강등";
    if (confirm(`이 회원을 ${actionStr}하시겠습니까?`)) {
        db.collection('workUsers').doc(userId).update({ isMaster: makeMaster })
            .then(() => {
                alert(`${actionStr} 처리되었습니다.`);
                loadMasterApprovalList();
            })
            .catch(err => {
                console.error("권한 설정 실패:", err);
                alert("처리 중 오류가 발생했습니다.");
            });
    }
};

window.workRejectUser = function (userId) {
    if (confirm("이 회원의 가입을 거절하시겠습니까? 기록이 삭제됩니다.")) {
        db.collection('workUsers').doc(userId).delete()
            .then(() => {
                alert("거절 및 삭제되었습니다.");
                loadMasterApprovalList();
            })
            .catch(err => {
                alert("오류가 발생했습니다.");
            });
    }
};

const btnResignMaster = document.getElementById('btn-resign-master');
if (btnResignMaster) {
    btnResignMaster.addEventListener('click', () => {
        if (confirm("정말 마스터 권한을 포기하시겠습니까? 권한을 포기하면 다른 회원이 마스터가 될 수 있습니다.")) {
            db.collection('workUsers').doc(currentUser.uid).update({
                isMaster: false
            }).then(() => {
                alert("마스터 권한을 포기하셨습니다.");
                masterAdminModal.classList.add('hidden');
            });
        }
    });
}

// ----------------------------------------------------
// 탭 네비게이션
// ----------------------------------------------------
let currentTab = 'main';
const tabs = document.querySelectorAll('.work-tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => {
            c.classList.remove('active');
            c.style.display = ''; // CSS가 제어하도록 빈 문자열 할당
        });

        tab.classList.add('active');
        currentTab = tab.getAttribute('data-tab');
        const targetContent = document.getElementById(`tab-${currentTab}`);
        if (targetContent) {
            targetContent.classList.add('active');
            targetContent.style.display = ''; // CSS가 제어하도록 빈 문자열 할당
        }

        // 프로젝트 탭 또는 평가시트 탭일 경우 브라우저 덜컹거림 방지 및 전체 화면 사용을 위해 전역 스크롤 제거
        if (currentTab === 'projects' || currentTab === 'evaluation') {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        }
        // 평가시트 전용: position: fixed로 완전 잠금 (셀 클릭 덜컹거림 방지)
        if (currentTab === 'evaluation') {
            document.body.classList.add('eval-active');
            document.documentElement.classList.add('eval-active');
        } else {
            document.body.classList.remove('eval-active');
            document.documentElement.classList.remove('eval-active');
        }

        const btnOpenModal = document.getElementById('btn-open-modal');
        if (btnOpenModal) {
            if (currentTab === 'main' || currentTab === 'members' || currentTab === 'projects' || currentTab === 'performance' || currentTab === 'ideas' || currentTab === 'info' || currentTab === 'notice' || currentTab === 'schedule' || currentTab === 'bookmarks' || currentTab === 'evaluation') {
                btnOpenModal.style.display = 'none';
            } else {
                btnOpenModal.style.display = 'flex';
            }
        }
    });
});

// ----------------------------------------------------
// 모달 관리
// ----------------------------------------------------
window.closeAllWriteModals = function () {
    const modals = [
        'main-notice-write-modal',
        'idea-write-modal',
        'info-write-modal',
        'notice-write-modal'
    ];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
};

const btnOpenModal = document.getElementById('btn-open-modal');

btnOpenModal.addEventListener('click', () => {
    if (!currentUser) {
        loginRequiredModal.classList.remove('hidden');
        return;
    }
    const modal = document.getElementById(`modal-${currentTab}`);
    if (modal) modal.classList.remove('hidden');
});

// 북마크 탭 상단의 '북마크 추가' 버튼 연결
const btnAddBookmarkTop = document.getElementById('btn-add-bookmark-top');
if (btnAddBookmarkTop) {
    btnAddBookmarkTop.addEventListener('click', () => {
        if (!currentUser) {
            loginRequiredModal.classList.remove('hidden');
            return;
        }
        const modal = document.getElementById('modal-bookmarks');
        if (modal) modal.classList.remove('hidden');
    });
}

document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.auth-modal-overlay').classList.add('hidden');
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('auth-modal-overlay')) {
        e.target.classList.add('hidden');
    }
});

// 전역 삭제 함수
window.deleteItem = function (collection, id) {
    if (!currentUser) {
        loginRequiredModal.classList.remove('hidden');
        return;
    }
    if (confirm('정말 삭제하시겠습니까?')) {
        db.collection(collection).doc(id).delete().catch(err => console.error(err));
    }
};

// 토글 함수 (일정 완료 처리 등)
window.toggleSchedule = function (id, currentStatus) {
    if (!currentUser) return;
    db.collection('workSchedules').doc(id).update({
        completed: !currentStatus
    }).catch(err => console.error(err));
};

window.updateProjectStatus = function (id, newStatus) {
    if (!currentUser) return;
    db.collection('workProjects').doc(id).update({
        status: newStatus
    }).catch(err => console.error(err));
}

// ====================================================
// 북마크 (Bookmarks)
// ====================================================
const workContainer = document.getElementById('work-content-container');
let workLinksData = [];

db.collection('workLinks').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    workLinksData = [];
    snapshot.forEach(doc => workLinksData.push({ id: doc.id, ...doc.data() }));
    renderWorkLinks();
});

function renderWorkLinks() {
    workContainer.innerHTML = '';
    if (workLinksData.length === 0) {
        workContainer.innerHTML = '<div style="text-align:center; padding: 50px; color: var(--text-muted);"><i class="fa-solid fa-folder-open"></i> 등록된 업무 북마크가 없습니다.</div>';
        return;
    }
    const grouped = {};
    workLinksData.forEach(link => {
        const cat = link.category || '기타';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(link);
    });

    for (const [category, links] of Object.entries(grouped)) {
        const catTitle = document.createElement('h3');
        catTitle.className = 'work-category-title';
        catTitle.innerHTML = `<i class="fa-solid fa-bookmark"></i> ${category}`;
        workContainer.appendChild(catTitle);

        const grid = document.createElement('div');
        grid.className = 'work-grid';

        links.forEach(link => {
            const iconClass = link.icon || 'fa-solid fa-link';
            const isMine = currentUser && link.authorId && currentUser.uid === link.authorId;
            const isMaster = currentUserDoc && currentUserDoc.isMaster === true;
            const canEditDelete = isMine || isMaster;

            let actionBtnsHtml = '';
            if (canEditDelete) {
                actionBtnsHtml = `
                    <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px; z-index: 10;">
                        <button class="btn-edit-bookmark" data-id="${link.id}" data-title="${(link.title || '').replace(/"/g, '&quot;')}" data-url="${link.url}" data-category="${(link.category || '').replace(/"/g, '&quot;')}" data-icon="${(link.icon || '').replace(/"/g, '&quot;')}" onclick="event.preventDefault(); window.openEditBookmarkModal(this);" style="background: rgba(255,255,255,0.8); border: none; border-radius: 4px; padding: 5px 8px; cursor: pointer; color: #4a69bd;" title="수정"><i class="fa-solid fa-pen"></i></button>
                        <button class="work-card-delete item-delete-btn" style="position: static;" onclick="event.preventDefault(); window.deleteItem('workLinks', '${link.id}')" title="삭제"><i class="fa-solid fa-xmark"></i></button>
                    </div>`;
            }

            // 도메인 추출 및 파비콘 이미지 적용
            let domain = '';
            try {
                let targetUrl = link.url;
                if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                    targetUrl = 'https://' + targetUrl;
                }
                const urlObj = new URL(targetUrl);
                domain = urlObj.hostname;
            } catch (e) { }

            const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
            const iconHtml = faviconUrl
                ? `<img src="${faviconUrl}" style="width: 24px; height: 24px; border-radius: 6px; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"><i class="${iconClass}" style="display:none;"></i>`
                : `<i class="${iconClass}"></i>`;

            grid.insertAdjacentHTML('beforeend', `
                    <a href="${link.url}" target="_blank" class="work-card glass-card">
                        <div class="work-icon-wrap" style="display: flex; align-items: center; justify-content: center; overflow: hidden; background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); border-radius: 8px; width: 42px; height: 42px; padding: 0;">
                            ${iconHtml}
                        </div>
                        <div class="work-info"><h4>${link.title}</h4><p>${link.url}</p></div>
                        ${actionBtnsHtml}
                    </a>
                `);
        });
        workContainer.appendChild(grid);
    }
}

document.getElementById('form-bookmarks').addEventListener('submit', (e) => {
    e.preventDefault();
    const category = document.getElementById('bm-category').value.trim();
    db.collection('workLinks').add({
        category: category || '기타',
        title: document.getElementById('bm-title').value.trim(),
        url: document.getElementById('bm-url').value.trim(),
        icon: document.getElementById('bm-icon').value.trim(),
        authorId: currentUser ? currentUser.uid : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        e.target.reset();
        document.getElementById('modal-bookmarks').classList.add('hidden');
    });
});

window.openEditBookmarkModal = function (btn) {
    document.getElementById('edit-bm-id').value = btn.getAttribute('data-id');
    document.getElementById('edit-bm-category').value = btn.getAttribute('data-category');
    document.getElementById('edit-bm-title').value = btn.getAttribute('data-title');
    document.getElementById('edit-bm-url').value = btn.getAttribute('data-url');
    document.getElementById('edit-bm-icon').value = btn.getAttribute('data-icon');
    document.getElementById('modal-edit-bookmarks').classList.remove('hidden');
};

document.getElementById('form-edit-bookmarks')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-bm-id').value;
    const category = document.getElementById('edit-bm-category').value.trim();
    db.collection('workLinks').doc(id).update({
        category: category || '기타',
        title: document.getElementById('edit-bm-title').value.trim(),
        url: document.getElementById('edit-bm-url').value.trim(),
        icon: document.getElementById('edit-bm-icon').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        alert("북마크가 수정되었습니다.");
        document.getElementById('form-edit-bookmarks').reset();
        document.getElementById('modal-edit-bookmarks').classList.add('hidden');
    }).catch(err => {
        console.error(err);
        alert("수정 실패: " + err.message);
    });
});

// 모달 닫기 버튼 이벤트 위임
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-close-btn')) {
        const overlay = e.target.closest('.auth-modal-overlay');
        if (overlay) overlay.classList.add('hidden');
    }
});

// ====================================================
// 공지사항 (Notices)
// ====================================================
const noticeContainer = document.getElementById('notice-list-container');
const noticeWriteModal = document.getElementById('main-notice-write-modal');
const noticeWriteClose = document.getElementById('notice-write-close');
const btnSubmitNotice = document.getElementById('btn-submit-notice');

document.body.addEventListener('click', (e) => {
    if (e.target.closest('#btn-write-notice')) {
        document.getElementById('notice-write-title').value = '';
        document.getElementById('notice-write-content').value = '';
        if (typeof closeAllWriteModals === 'function') closeAllWriteModals();
        noticeWriteModal.classList.remove('hidden');
    }
});

if (noticeWriteClose) {
    noticeWriteClose.addEventListener('click', () => noticeWriteModal.classList.add('hidden'));
}

if (btnSubmitNotice) {
    btnSubmitNotice.addEventListener('click', () => {
        const title = document.getElementById('notice-write-title').value.trim();
        const content = document.getElementById('notice-write-content').value.trim();
        if (!title || !content) return alert("제목과 내용을 입력하세요.");

        db.collection('workNotices').add({
            title,
            content,
            authorId: currentUser.uid,
            authorName: currentUser.displayName || currentUserDoc?.nickname || '관리자',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            noticeWriteModal.classList.add('hidden');
            alert("공지사항이 등록되었습니다.");
        }).catch(e => {
            alert("공지 등록 실패: " + e.message);
        });
    });
}

let noticesData = [];
db.collection('workNotices').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    noticesData = [];
    snapshot.forEach(doc => noticesData.push({ id: doc.id, ...doc.data() }));
    if (typeof renderNotices === 'function') renderNotices();
});

window.renderNotices = function () {
    if (!noticeContainer) return;
    noticeContainer.innerHTML = '';
    if (noticesData.length === 0) {
        noticeContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);"><i class="fa-solid fa-bullhorn"></i> 등록된 공지사항이 없습니다.</div>';
        return;
    }

    noticesData.forEach(notice => {
        const div = document.createElement('div');
        div.style.cssText = "padding: 1rem; border-bottom: 1px solid var(--card-border); position: relative;";

        const dateStr = notice.createdAt ? new Date(notice.createdAt.toDate()).toLocaleDateString() : '';

        let delBtn = '';
        if (currentUserDoc && currentUserDoc.isMaster) {
            delBtn = `<button onclick="deleteNotice('${notice.id}')" style="position:absolute; right:10px; top:10px; background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-solid fa-trash"></i></button>`;
        }

        div.innerHTML = `
                <div style="font-weight:700; color:var(--primary-color); margin-bottom:0.5rem; display:flex; align-items:center; gap:0.5rem; padding-right: 30px;">
                    <i class="fa-solid fa-thumbtack"></i> ${notice.title}
                </div>
                <div style="font-size:0.9rem; color:var(--text-color); margin-bottom:0.5rem; white-space:pre-wrap;">${notice.content}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">작성자: ${notice.authorName} | ${dateStr}</div>
                ${delBtn}
            `;
        noticeContainer.appendChild(div);
    });
}

window.deleteNotice = function (id) {
    if (confirm("정말 공지사항을 삭제하시겠습니까?")) {
        db.collection('workNotices').doc(id).delete().then(() => {
            alert("삭제되었습니다.");
        }).catch(e => alert("삭제 실패: " + e.message));
    }
}

// ====================================================
// 일정관리 (Schedule Calendar)
// ====================================================
let schedulesData = [];
const workCalendarGrid = document.getElementById('work-calendar-grid');
const workCalendarMonthYear = document.getElementById('work-calendar-month-year');

let workCurrentDate = new Date();
let workCurrentYear = workCurrentDate.getFullYear();
let workCurrentMonth = workCurrentDate.getMonth();

// 구글 캘린더 연동 변수 (onSnapshot은 아래 함수 정의 완료 후 등록)
let googleCalendarUrls = [];
let googleEvents = {};
let userGoogleCalendarListener = null;


function parseICalDateString(dStr) {
    if (!dStr.includes('T')) {
        if (dStr.length >= 8) {
            return `${dStr.substring(0, 4)}-${dStr.substring(4, 6)}-${dStr.substring(6, 8)}`;
        }
        return null;
    }
    if (dStr.length >= 15) {
        const y = dStr.substring(0, 4);
        const m = dStr.substring(4, 6);
        const d = dStr.substring(6, 8);
        const h = dStr.substring(9, 11);
        const min = dStr.substring(11, 13);
        const s = dStr.substring(13, 15);
        const isZ = dStr.endsWith('Z');

        const isoStr = `${y}-${m}-${d}T${h}:${min}:${s}${isZ ? 'Z' : ''}`;
        const dateObj = new Date(isoStr);

        if (!isNaN(dateObj.getTime())) {
            const localY = dateObj.getFullYear();
            const localM = String(dateObj.getMonth() + 1).padStart(2, '0');
            const localD = String(dateObj.getDate()).padStart(2, '0');
            return `${localY}-${localM}-${localD}`;
        }
    }
    return null;
}

// iCal 텍스트를 파싱하여 이벤트 객체 배열 반환
function parseICalText(text) {
    const events = [];
    const unfoldedText = text.replace(/\r?\n[ \t]/g, '');
    const lines = unfoldedText.split(/\r?\n/);
    let currentEvent = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = {};
        } else if (line.startsWith('END:VEVENT')) {
            if (currentEvent && currentEvent.title && currentEvent.dateStr) {
                if (!currentEvent.endDateStr || currentEvent.endDateStr === currentEvent.dateStr) {
                    events.push(currentEvent);
                } else {
                    let isAllDay = !currentEvent.hasTime;

                    let endParts = currentEvent.endDateStr.split('-');
                    let loopEnd = new Date(endParts[0], endParts[1] - 1, endParts[2]);

                    let startParts = currentEvent.dateStr.split('-');
                    let startObj = new Date(startParts[0], startParts[1] - 1, startParts[2]);
                    let current = new Date(startParts[0], startParts[1] - 1, startParts[2]);

                    while (current <= loopEnd) {
                        if (isAllDay && current.getTime() === loopEnd.getTime() && current.getTime() > startObj.getTime()) {
                            break;
                        }

                        const y = current.getFullYear();
                        const m = String(current.getMonth() + 1).padStart(2, '0');
                        const d = String(current.getDate()).padStart(2, '0');

                        events.push({
                            title: currentEvent.title,
                            dateStr: `${y}-${m}-${d}`
                        });

                        current.setDate(current.getDate() + 1);
                    }
                }
            }
            currentEvent = null;
        } else if (currentEvent) {
            if (line.startsWith('SUMMARY:')) {
                currentEvent.title = line.substring(8).trim();
            } else if (line.startsWith('DTSTART')) {
                const colonIdx = line.indexOf(':');
                if (colonIdx !== -1) {
                    const dStr = line.substring(colonIdx + 1).trim();
                    currentEvent.hasTime = dStr.includes('T');
                    const parsedDate = parseICalDateString(dStr);
                    if (parsedDate) currentEvent.dateStr = parsedDate;
                }
            } else if (line.startsWith('DTEND')) {
                const colonIdx = line.indexOf(':');
                if (colonIdx !== -1) {
                    const dStr = line.substring(colonIdx + 1).trim();
                    const parsedDate = parseICalDateString(dStr);
                    if (parsedDate) currentEvent.endDateStr = parsedDate;
                }
            }
        }
    }
    return events;
}

// webcal 및 다중 프록시를 적용해 캘린더 데이터를 가져오는 헬퍼 함수
async function fetchWithProxy(url, proxyIndexOffset = 0) {
    let targetUrl = url.trim();
    if (targetUrl.startsWith('webcal://')) {
        targetUrl = 'https://' + targetUrl.substring(9);
    }

    const proxies = [
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
    ];

    let lastError = null;
    for (let i = 0; i < proxies.length; i++) {
        const idx = (i + proxyIndexOffset) % proxies.length;
        const getProxyUrl = proxies[idx];
        try {
            const proxyUrl = getProxyUrl(targetUrl);
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error(`HTTP 에러! 상태코드: ${res.status}`);
            const text = await res.text();
            if (text && (text.includes('BEGIN:VCALENDAR') || text.includes('begin:vcalendar'))) {
                return text;
            } else {
                throw new Error('올바른 iCal(ICS) 형식이 아닙니다.');
            }
        } catch (err) {
            console.warn(`프록시 실패 (${getProxyUrl(targetUrl)}): ${err.message}`);
            lastError = err;
        }
    }
    throw lastError || new Error('모든 프록시 서버 연결 실패');
}

// 다중 캘린더 동시 fetch
async function fetchGoogleCalendarEvents() {
    if (!googleCalendarUrls || googleCalendarUrls.length === 0) {
        googleEvents = {};
        if (typeof renderWorkCalendar === 'function') renderWorkCalendar();
        return;
    }
    const syncIcon = document.querySelector('#work-calendar-sync-btn i');
    if (syncIcon) syncIcon.classList.add('fa-spin');

    const results = [];
    for (let i = 0; i < googleCalendarUrls.length; i++) {
        const cal = googleCalendarUrls[i];

        // 비활성화된 것은 페치를 건너뜁니다
        if (cal.enabled === false) {
            continue;
        }

        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        try {
            const text = await fetchWithProxy(cal.url, i);
            const events = parseICalText(text);
            console.log(`[DODO.work - ${cal.name}] 구글 캘린더 동기화 완료: ${events.length}개 일정`);
            results.push({ name: cal.name, events: events, success: true, index: i });
        } catch (err) {
            console.error(`[DODO.work - ${cal.name}] 구글 캘린더 동기화 실패:`, err);
            results.push({ name: cal.name, events: [], success: false, error: err.message, index: i });
        }
    }

    try {
        googleEvents = {};
        let failedList = [];
        const googleCalendarColors = ['#4285F4', '#34A853', '#E67C73', '#F7CB4D', '#7986CB'];

        results.forEach(result => {
            if (!result.success) failedList.push(result.name);
            const calColor = googleCalendarColors[result.index % googleCalendarColors.length] || '#4285F4';
            result.events.forEach(ev => {
                if (!googleEvents[ev.dateStr]) googleEvents[ev.dateStr] = [];
                googleEvents[ev.dateStr].push({
                    title: ev.title,
                    color: calColor,
                    isGoogle: true
                });
            });
        });
        if (typeof renderWorkCalendar === 'function') renderWorkCalendar();
        if (failedList.length > 0) {
            console.warn(`일부 캘린더 동기화 실패: ${failedList.join(', ')}`);
        }
    } catch (e) {
        console.error("구글 캘린더 통합 렌더링 중 오류:", e);
    } finally {
        if (syncIcon) syncIcon.classList.remove('fa-spin');
    }
}

// 5칸 고정 입력필드에 저장된 데이터 채우기
function fillGcalSlots() {
    for (let i = 0; i < 5; i++) {
        const nameEl = document.getElementById(`work-gcal-name-${i}`);
        const urlEl = document.getElementById(`work-gcal-url-${i}`);
        const enableEl = document.getElementById(`work-gcal-enable-${i}`);
        if (nameEl) nameEl.value = (googleCalendarUrls[i] && googleCalendarUrls[i].name) || '';
        if (urlEl) urlEl.value = (googleCalendarUrls[i] && googleCalendarUrls[i].url) || '';
        if (enableEl) {
            enableEl.checked = !(googleCalendarUrls[i] && googleCalendarUrls[i].enabled === false);
        }
    }
}

// 구글 캘린더 개별 표시 필터 렌더링
function renderGoogleCalendarFilters() {
    const isMaster = currentUserDoc && currentUserDoc.isMaster === true;
    const settingsBtn = document.getElementById('work-calendar-settings-btn');
    const gcalSettingsBtn = document.getElementById('btn-gcal-settings');

    if (settingsBtn) {
        settingsBtn.style.display = isMaster ? 'inline-block' : 'none';
    }
    if (gcalSettingsBtn) {
        gcalSettingsBtn.style.display = isMaster ? 'inline-block' : 'none';
    }

    const filterContainer = document.getElementById('work-gcal-filter-container');
    if (!filterContainer) return;

    const activeCals = googleCalendarUrls.filter(cal => cal && cal.url && cal.name);
    if (activeCals.length === 0) {
        filterContainer.innerHTML = '';
        filterContainer.classList.add('hidden');
        return;
    }

    filterContainer.classList.remove('hidden');

    // 5가지 구글 캘린더 테마 파스텔톤 색상 지정
    const googleCalendarColors = [
        '#4285F4', // 1번: 블루
        '#34A853', // 2번: 그린
        '#E67C73', // 3번: 레드/자몽
        '#F7CB4D', // 4번: 옐로우/바나나
        '#7986CB'  // 5번: 라벤더/퍼플
    ];

    let html = '<span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-right: 5px;"><i class="fa-solid fa-filter"></i> 캘린더 필터:</span>';

    googleCalendarUrls.forEach((cal, index) => {
        if (!cal || !cal.url || !cal.name) return;

        const calColor = googleCalendarColors[index % googleCalendarColors.length] || '#4285F4';
        const isChecked = cal.enabled !== false;

        html += `
                <label class="gcal-filter-item" style="display: flex; align-items: center; gap: 8px; cursor: ${isMaster ? 'pointer' : 'default'}; padding: 6px 12px; border-radius: 20px; background: rgba(255,255,255,0.04); font-size: 0.85rem; border: 1px solid var(--card-border); user-select: none; transition: all 0.2s ease; ${isMaster ? '' : 'opacity: 0.8;'}">
                    <input type="checkbox" data-index="${index}" ${isChecked ? 'checked' : ''} ${isMaster ? '' : 'disabled'} style="width: 14px; height: 14px; cursor: ${isMaster ? 'pointer' : 'default'}; accent-color: ${calColor}; margin: 0;">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${calColor};"></span>
                    <span style="color: ${isChecked ? 'var(--text-color)' : 'var(--text-muted)'}; font-weight: ${isChecked ? '600' : '400'};">${cal.name}</span>
                </label>
            `;
    });

    filterContainer.innerHTML = html;

    // 이벤트 바인딩
    const checkboxes = filterContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(chk => {
        chk.addEventListener('change', (e) => {
            if (!isMaster) {
                e.preventDefault();
                return;
            }
            const idx = parseInt(e.target.getAttribute('data-index'), 10);
            const isChecked = e.target.checked;

            if (googleCalendarUrls[idx]) {
                googleCalendarUrls[idx].enabled = isChecked;

                // 로컬 슬롯 체크박스 UI도 즉시 반영
                fillGcalSlots();

                // Firestore에 실시간 저장 (마스터만)
                db.collection('workSiteSettings').doc('calendarSettings').set({
                    urls: googleCalendarUrls
                }, { merge: true }).catch(err => {
                    console.error("Firestore 필터 동기화 실패:", err);
                });

                // 캘린더 표시 갱신
                fetchGoogleCalendarEvents();
            }
        });
    });
}

// ====================================================
// 마스터 공유 캘린더 실시간 리스너
// - workSiteSettings/calendarSettings 에 저장된 구글 캘린더 URL을
//   모든 팀원이 로그인 시 자동으로 가져와 캘린더에 표시합니다.
// ====================================================
db.collection('workSiteSettings').doc('calendarSettings').onSnapshot(doc => {
    if (doc.exists && doc.data().urls && Array.isArray(doc.data().urls)) {
        googleCalendarUrls = doc.data().urls;
    } else {
        googleCalendarUrls = [];
    }

    // Iframe 캘린더 연동 렌더링
    const iframeUrl = doc.exists ? doc.data().iframeUrl : '';
    const container = document.getElementById('google-calendar-container');
    const wrapper = document.getElementById('google-calendar-iframe-wrapper');
    const inputUrl = document.getElementById('input-gcal-url');

    if (inputUrl && iframeUrl) {
        inputUrl.value = iframeUrl;
    }

    if (iframeUrl && iframeUrl.trim() !== '') {
        if (container) container.style.display = 'block';
        if (wrapper) {
            // iframe 태그 전체인지 url인지 확인
            let finalIframe = '';
            if (iframeUrl.trim().toLowerCase().startsWith('<iframe')) {
                finalIframe = iframeUrl;
            } else {
                finalIframe = `<iframe src="${iframeUrl}" style="border: 0" width="100%" height="100%" frameborder="0" scrolling="no"></iframe>`;
            }
            wrapper.innerHTML = finalIframe;

            // 크기 강제 조정
            setTimeout(() => {
                const iframeEl = wrapper.querySelector('iframe');
                if (iframeEl) {
                    iframeEl.style.width = '100%';
                    iframeEl.style.height = '100%';
                    iframeEl.style.border = 'none';
                }
            }, 100);
        }
    } else {
        if (container) container.style.display = 'none';
        if (wrapper) wrapper.innerHTML = '';
    }

    fillGcalSlots();
    renderGoogleCalendarFilters();
    fetchGoogleCalendarEvents();
}, err => console.error("[캘린더] 공유 캘린더 로드 오류:", err));

db.collection('workSchedules').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    schedulesData = [];
    snapshot.forEach(doc => schedulesData.push({ id: doc.id, ...doc.data() }));
    if (typeof renderWorkCalendar === 'function') {
        renderWorkCalendar();
    }
});

document.getElementById('work-prev-year-btn')?.addEventListener('click', () => { workCurrentYear--; renderWorkCalendar(); });
document.getElementById('work-next-year-btn')?.addEventListener('click', () => { workCurrentYear++; renderWorkCalendar(); });
document.getElementById('work-prev-month-btn')?.addEventListener('click', () => {
    workCurrentMonth--;
    if (workCurrentMonth < 0) { workCurrentMonth = 11; workCurrentYear--; }
    renderWorkCalendar();
});
document.getElementById('work-next-month-btn')?.addEventListener('click', () => {
    workCurrentMonth++;
    if (workCurrentMonth > 11) { workCurrentMonth = 0; workCurrentYear++; }
    renderWorkCalendar();
});

// 구글 캘린더 UI 연동
document.getElementById('work-calendar-sync-btn')?.addEventListener('click', () => {
    fetchGoogleCalendarEvents();
});
document.getElementById('work-calendar-settings-btn')?.addEventListener('click', () => {
    document.getElementById('work-calendar-settings-modal')?.classList.remove('hidden');
});
document.getElementById('work-calendar-settings-close')?.addEventListener('click', () => {
    document.getElementById('work-calendar-settings-modal')?.classList.add('hidden');
});
document.getElementById('work-calendar-settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const newList = [];
    for (let i = 0; i < 5; i++) {
        const nameVal = document.getElementById(`work-gcal-name-${i}`).value.trim();
        const urlVal = document.getElementById(`work-gcal-url-${i}`).value.trim();
        const enableEl = document.getElementById(`work-gcal-enable-${i}`);
        const enabled = enableEl ? enableEl.checked : true;
        if (urlVal) {
            newList.push({
                name: nameVal || `캘린더 ${i + 1}`,
                url: urlVal,
                enabled: enabled
            });
        }
    }
    if (!currentUserDoc || currentUserDoc.isMaster !== true) {
        alert("관리자만 캘린더 설정을 변경할 수 있습니다.");
        return;
    }

    db.collection('workSiteSettings').doc('calendarSettings').set({
        urls: newList,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        alert("구글 캘린더 설정이 저장되었습니다.\n팀원들도 같은 캘린더 일정을 볼 수 있습니다! 🗓️");
        document.getElementById('work-calendar-settings-modal')?.classList.add('hidden');
    }).catch(err => {
        console.error("캘린더 설정 저장 오류:", err);
        alert("설정 저장 중 오류가 발생했습니다.");
    });
});

// 구글 캘린더 iframe 설정 모달 (마스터 전용)
const btnGcalSettings = document.getElementById('btn-gcal-settings');
const gcalSettingsModal = document.getElementById('gcal-settings-modal');
const btnGcalSettingsCancel = document.getElementById('btn-gcal-settings-cancel');
const btnGcalSettingsSave = document.getElementById('btn-gcal-settings-save');
const inputGcalUrl = document.getElementById('input-gcal-url');

if (btnGcalSettings) {
    btnGcalSettings.addEventListener('click', () => {
        if (!currentUserDoc || currentUserDoc.isMaster !== true) {
            alert("관리자만 캘린더 연동을 설정할 수 있습니다.");
            return;
        }
        if (gcalSettingsModal) gcalSettingsModal.classList.remove('hidden');
    });
}

if (btnGcalSettingsCancel) {
    btnGcalSettingsCancel.addEventListener('click', () => {
        if (gcalSettingsModal) gcalSettingsModal.classList.add('hidden');
    });
}

if (btnGcalSettingsSave) {
    btnGcalSettingsSave.addEventListener('click', () => {
        if (!currentUserDoc || currentUserDoc.isMaster !== true) {
            alert("관리자 권한이 없습니다.");
            return;
        }
        const iframeUrl = inputGcalUrl ? inputGcalUrl.value.trim() : '';

        db.collection('workSiteSettings').doc('calendarSettings').set({
            iframeUrl: iframeUrl,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            alert("구글 캘린더 연동이 저장되었습니다.\n이제 팀원들도 구글 캘린더를 볼 수 있습니다! 🎉");
            if (gcalSettingsModal) gcalSettingsModal.classList.add('hidden');
        }).catch(err => {
            console.error("캘린더 연동 저장 오류:", err);
            alert("저장 중 오류가 발생했습니다.");
        });
    });
}

window.renderWorkCalendar = function () {
    if (!workCalendarGrid) return;
    workCalendarGrid.innerHTML = '';

    if (workCalendarMonthYear) {
        workCalendarMonthYear.innerText = `${workCurrentYear}년 ${workCurrentMonth + 1}월`;
    }

    const firstDay = new Date(workCurrentYear, workCurrentMonth, 1).getDay();
    const daysInMonth = new Date(workCurrentYear, workCurrentMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const blankCell = document.createElement('div');
        blankCell.className = 'calendar-day empty';
        blankCell.style.cssText = "min-height: 80px; background: rgba(255,255,255,0.02); border-radius: 8px;";
        workCalendarGrid.appendChild(blankCell);
    }

    const today = new Date();
    const isCurrentMonth = (workCurrentYear === today.getFullYear() && workCurrentMonth === today.getMonth());

    for (let d = 1; d <= daysInMonth; d++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        dayCell.style.cssText = "min-height: 80px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 5px; position: relative; cursor: pointer; display: flex; flex-direction: column; gap: 4px;";

        const dayStr = String(d).padStart(2, '0');
        const monthStr = String(workCurrentMonth + 1).padStart(2, '0');
        const dateString = `${workCurrentYear}-${monthStr}-${dayStr}`;

        let dateColor = "var(--text-color)";
        const dayOfWeek = new Date(workCurrentYear, workCurrentMonth, d).getDay();
        if (dayOfWeek === 0) dateColor = "#ff4757"; // Sunday
        if (dayOfWeek === 6) dateColor = "#3742fa"; // Saturday
        if (isCurrentMonth && d === today.getDate()) {
            dateColor = "var(--primary-color)";
            dayCell.style.border = "2px solid var(--primary-color)";
        }

        const dateSpan = document.createElement('span');
        dateSpan.style.cssText = `font-size: 0.85rem; font-weight: bold; color: ${dateColor}; align-self: flex-start;`;
        dateSpan.innerText = d;
        dayCell.appendChild(dateSpan);

        let combinedEvents = [];

        // 기존 Firestore 일정 데이터를 combinedEvents 형태로 변환
        const daySchedules = schedulesData.filter(sch => sch.date === dateString);
        daySchedules.forEach(sch => {
            combinedEvents.push({
                id: sch.id,
                title: sch.title,
                completed: sch.completed,
                isGoogle: false
            });
        });

        // 구글 캘린더 일정 추가
        if (googleEvents[dateString]) {
            googleEvents[dateString].forEach(gev => {
                combinedEvents.push({
                    title: gev.title,
                    color: gev.color,
                    isGoogle: true
                });
            });
        }

        dayCell.onclick = (e) => {
            if (e.target.closest('.schedule-item')) return; // Ignore if clicked on a schedule
            if (!currentUser) {
                const reqModal = document.getElementById('login-required-modal');
                if (reqModal) reqModal.classList.remove('hidden');
                return;
            }

            const formSchedule = document.getElementById('form-schedule');
            if (formSchedule) {
                if (window.scheduleHasWriteAccess) {
                    formSchedule.style.display = 'block';
                } else {
                    formSchedule.style.display = 'none';
                }
            }

            const dateInput = document.getElementById('sch-date');
            if (dateInput) dateInput.value = dateString;
            const titleInput = document.getElementById('sch-title');
            if (titleInput) titleInput.value = '';

            const listEl = document.getElementById('sch-existing-list');
            if (listEl) {
                listEl.innerHTML = '';
                if (combinedEvents.length === 0) {
                    listEl.innerHTML = '<div style="color: #888; font-size: 0.9rem; text-align: center; padding: 10px;">등록된 일정이 없습니다.</div>';
                } else {
                    combinedEvents.forEach((evt, idx) => {
                        const evtDiv = document.createElement('div');
                        evtDiv.className = 'event-item';

                        const baseColor = evt.isGoogle ? (evt.color || '#4285F4') : 'var(--primary-color)';
                        // rgba() workaround for hex colors is tricky without parsing, so we just set border color and use css for background
                        evtDiv.style.borderLeftColor = baseColor;
                        evtDiv.style.marginBottom = '4px';

                        const isOwner = !evt.isGoogle; // Only firestore events can be deleted here
                        const delBtnHTML = isOwner
                            ? `<button class="event-del-btn" data-index="${idx}"><i class="fa-regular fa-trash-can"></i></button>`
                            : '';

                        const titleHTML = evt.isGoogle
                            ? `<i class="fa-brands fa-google" style="margin-right: 5px; color: #4285F4;"></i> <span style="flex: 1; ${evt.completed ? 'text-decoration: line-through; color: #999;' : ''}">${evt.title}</span>`
                            : `<i class="fa-solid fa-list-check" style="color:var(--primary-color); margin-right: 5px;"></i> <span style="flex: 1; ${evt.completed ? 'text-decoration: line-through; color: #999;' : ''}">${evt.title}</span>`;

                        evtDiv.innerHTML = `
                                <span class="event-item-title" style="display:flex; align-items:center;">${titleHTML}</span>
                                ${delBtnHTML}
                            `;

                        listEl.appendChild(evtDiv);
                    });

                    // Add delete event listeners
                    listEl.querySelectorAll('.event-del-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const index = parseInt(btn.getAttribute('data-index'));
                            const targetEvent = combinedEvents[index];
                            if (targetEvent && !targetEvent.isGoogle) {
                                if (confirm('이 일정을 삭제하시겠습니까?')) {
                                    try {
                                        await db.collection('workSchedules').doc(targetEvent.id).delete();
                                        // The onSnapshot will refresh the grid, but we should close the modal or re-render the list
                                        const modal = document.getElementById('modal-schedule');
                                        if (modal) modal.classList.add('hidden');
                                    } catch (err) {
                                        console.error("Error deleting schedule: ", err);
                                        alert("삭제 실패");
                                    }
                                }
                            }
                        });
                    });
                }
            }

            const modal = document.getElementById('modal-schedule');
            if (modal) modal.classList.remove('hidden');
        };

        combinedEvents.forEach(evt => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'schedule-item';

            if (evt.isGoogle) {
                itemDiv.style.cssText = `font-size: 0.75rem; padding: 4px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: ${evt.color || '#4285F4'}40; color: ${evt.color || '#4285F4'}; cursor: default; border-left: 3px solid ${evt.color || '#4285F4'};`;
                itemDiv.innerHTML = `<i class="fa-brands fa-google"></i> ${evt.title}`;
                itemDiv.onclick = (e) => {
                    e.stopPropagation();
                    alert(`[구글 일정] ${evt.title}`);
                };
            } else {
                itemDiv.style.cssText = `font-size: 0.75rem; padding: 4px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: ${evt.completed ? 'rgba(255,255,255,0.05)' : 'rgba(0, 206, 201, 0.2)'}; color: ${evt.completed ? 'var(--text-muted)' : '#00cec9'}; text-decoration: ${evt.completed ? 'line-through' : 'none'}; cursor: pointer;`;
                itemDiv.innerText = evt.title;
                itemDiv.onclick = (e) => {
                    e.stopPropagation();
                    if (!currentUser) return;
                    if (confirm(`'${evt.title}' 일정을 삭제하시겠습니까?`)) {
                        window.deleteItem('workSchedules', evt.id);
                    } else if (confirm(`'${evt.title}' 일정의 완료 상태를 변경하시겠습니까?`)) {
                        window.toggleSchedule(evt.id, evt.completed);
                    }
                };
            }
            itemDiv.title = evt.title;
            dayCell.appendChild(itemDiv);
        });

        workCalendarGrid.appendChild(dayCell);
    }
}

const formSchedule = document.getElementById('form-schedule');
if (formSchedule) {
    formSchedule.addEventListener('submit', (e) => {
        e.preventDefault();
        db.collection('workSchedules').add({
            title: document.getElementById('sch-title').value.trim(),
            date: document.getElementById('sch-date').value,
            completed: false,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            e.target.reset();
            document.getElementById('modal-schedule').classList.add('hidden');
        });
    });
}

// ====================================================
// 개인성과 (Performance) - 신규 팀원 평가 매트릭스로 개편됨 (하단 initPerformanceLogic 참고)
// ====================================================

// ====================================================
// 구성원 소개 (Members)
// ====================================================
const membersContainer = document.getElementById('members-content-container');
let membersData = [];

// 기존 카드형 멤버 렌더링 로직(renderWorkMembers)은 구성원 채팅 UI(member-list)로 대체되어 삭제됨.

document.getElementById('form-members')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('mem-photo');
    const name = document.getElementById('mem-name').value.trim();
    const role = document.getElementById('mem-role').value.trim();
    const hobby = document.getElementById('mem-hobby').value.trim();
    const comment = document.getElementById('mem-comment').value.trim();
    const like = document.getElementById('mem-like').value.trim();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
    submitBtn.disabled = true;

    const saveToDb = (base64Str) => {
        db.collection('workMembers').add({
            name, role, hobby, comment, like,
            photoBase64: base64Str,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            e.target.reset();
            document.getElementById('modal-members').classList.add('hidden');
        }).catch(err => {
            console.error(err);
            alert("저장 중 오류가 발생했습니다.");
        }).finally(() => {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        });
    };

    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (event) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max_size = 400;

                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const base64Str = canvas.toDataURL('image/jpeg', 0.8);
                saveToDb(base64Str);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        saveToDb(null);
    }
});

// ====================================================
// 프로젝트 스케줄러 (Projects Scheduler - Desktop Replica)
// ====================================================
let psData = [];
let psYear = new Date().getFullYear();
let psDayWidth = 30; // DAY_WIDTH from python
let psSelectedId = null;
let psRowIndexMap = []; // Maps Y-index to Task ID

// Display date range (auto-calculated from tasks)
let psDisplayStartYear = psYear;
let psDisplayStartMonth = 0;
let psDisplayEndYear = psYear;
let psDisplayEndMonth = 11;
let psSearchFilter = '';
let psFirstRender = true; // 처음 진입 시 오늘 날짜로 스크롤하기 위한 플래그

db.collection('workProjects').orderBy('order', 'asc').onSnapshot((snapshot) => {
    psData = [];
    snapshot.forEach(doc => psData.push({ id: doc.id, ...doc.data() }));
    
    // 프로젝트(부모) 일정 자동 계산: 하위 태스크의 최소 시작일 ~ 최대 마감일 반영
    psData.filter(p => !p.parentId).forEach(project => {
        const childTasks = psData.filter(t => t.parentId === project.id);
        if (childTasks.length > 0) {
            let minStart = null;
            let maxEnd = null;
            
            childTasks.forEach(t => {
                if (t.startDate) {
                    if (!minStart || t.startDate < minStart) minStart = t.startDate;
                }
                if (t.endDate) {
                    if (!maxEnd || t.endDate > maxEnd) maxEnd = t.endDate;
                }
            });
            
            if (minStart) project.startDate = minStart;
            if (maxEnd) project.endDate = maxEnd;
        }
    });

    updateSearchDropdown();
    renderPsScheduler();
    if (typeof window.renderPerformanceDashboard === 'function') {
        window.renderPerformanceDashboard();
    }
    if (typeof window.checkAndRunAutoBackup === 'function') {
        window.checkAndRunAutoBackup();
    }
});

function updateSearchDropdown() {
    const searchSelect = document.getElementById('ps-search');
    if (!searchSelect) return;

    const currentVal = searchSelect.value || 'all';

    let html = '<option value="all">🔍 전체보기 (필터)</option>';
    html += '<optgroup label="진행 상태">';
    html += '<option value="status:대기중">상태: 대기중</option>';
    html += '<option value="status:진행중">상태: 진행중</option>';
    html += '<option value="status:완료">상태: 완료</option>';
    html += '</optgroup>';

    const assignees = [...new Set(psData.map(p => p.assignee ? p.assignee.trim() : '').filter(name => name !== ''))];
    if (assignees.length > 0) {
        html += '<optgroup label="담당자별 필터">';
        assignees.forEach(name => {
            html += `<option value="assignee:${name}">${name}</option>`;
        });
        html += '</optgroup>';
    }

    // Project name quick-jump list
    const rootProjects = psData.filter(p => !p.parentId);
    if (rootProjects.length > 0) {
        html += '<optgroup label="프로젝트 이동">';
        rootProjects.forEach(p => {
            const displayName = p.name || '(무제)';
            html += `<option value="goto:${p.id}">${displayName}</option>`;
        });
        html += '</optgroup>';
    }

    searchSelect.innerHTML = html;

    if (searchSelect.querySelector(`option[value="${currentVal}"]`)) {
        searchSelect.value = currentVal;
    } else {
        searchSelect.value = 'all';
    }
}

document.getElementById('ps-search')?.addEventListener('change', (e) => {
    const val = e.target.value || 'all';
    if (val.startsWith('goto:')) {
        const id = val.split(':')[1];
        // Clear name filter and render so DOM rows exist
        psSearchFilter = '';
        renderPsScheduler();
        // After render, scroll to the target row if present
        setTimeout(() => {
            const row = Array.from(document.querySelectorAll('.ps-tree-row')).find(r => r.dataset && r.dataset.taskId === id);
            const container = document.getElementById('ps-gantt-container');
            if (row && container) {
                // scroll tree area to show the row
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 80);
    } else {
        renderPsScheduler();
    }
});

document.getElementById('ps-search-input')?.addEventListener('input', (e) => {
    psSearchFilter = e.target.value.trim();
    renderPsScheduler();
});

document.getElementById('ps-year')?.addEventListener('change', (e) => { psYear = parseInt(e.target.value); renderPsScheduler(); });
document.getElementById('ps-btn-today')?.addEventListener('click', () => {
    psYear = new Date().getFullYear();
    if (document.getElementById('ps-year')) {
        document.getElementById('ps-year').value = psYear;
    }
    renderPsScheduler();

    // 오늘 날짜 위치로 가로 스크롤 부드럽게 이동
    const container = document.getElementById('ps-gantt-container');
    if (container) {
        const today = new Date();
        const yStart = new Date(psDisplayStartYear, psDisplayStartMonth, 1);
        const diffDays = Math.floor((today - yStart) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0) {
            const todayX = diffDays * psDayWidth;
            container.scrollTo({
                left: todayX - (container.clientWidth / 2),
                behavior: 'smooth'
            });
        }
    }
});

document.getElementById('ps-btn-fit-screen')?.addEventListener('click', () => {
    // 화면 맞춤: 전체 날짜 범위를 한 화면에 맞춥니다
    const container = document.getElementById('ps-gantt-container');
    if (!container) return;
    const displayStart = new Date(psDisplayStartYear, psDisplayStartMonth, 1);
    const displayEnd = new Date(psDisplayEndYear, psDisplayEndMonth + 1, 0);
    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.floor((displayEnd - displayStart) / msPerDay) + 1;
    if (totalDays <= 0) return;
    const targetWidth = container.clientWidth - 40; // leave some margin
    let newDayWidth = targetWidth / totalDays;
    newDayWidth = Math.max(1, newDayWidth); // 1년 전체를 볼 수 있도록 최소폭을 1px로 완화
    psDayWidth = newDayWidth;
    renderPsScheduler();
    // scroll to start of timeline
    container.scrollTo({ left: 0, behavior: 'smooth' });
});

document.getElementById('ps-btn-zoom-in')?.addEventListener('click', () => { psDayWidth = Math.min(psDayWidth + 5, 100); renderPsScheduler(); });
document.getElementById('ps-btn-zoom-out')?.addEventListener('click', () => { psDayWidth = Math.max(psDayWidth - 5, 10); renderPsScheduler(); });
document.getElementById('ps-btn-zoom-reset')?.addEventListener('click', () => { psDayWidth = 30; renderPsScheduler(); });

document.getElementById('ps-btn-add-project')?.addEventListener('click', () => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    db.collection('workProjects').add({
        parentId: null,
        name: '새 프로젝트',
        assignee: '',
        status: '대기중',
        startDate: '',
        endDate: '',
        color: '#fffacd',
        order: Date.now(),
        expanded: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then((docRef) => {
        if (typeof window.logProjectAction === 'function') window.logProjectAction('CREATE', docRef.id, '새 프로젝트', '새 프로젝트 생성');
        alert('새 프로젝트가 추가되었습니다. 목록 맨 아래를 확인해주세요.');
    }).catch(err => alert("추가 실패: " + err.message));
});

document.getElementById('ps-btn-add-task')?.addEventListener('click', () => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    if (!psSelectedId) return alert('추가할 프로젝트/태스크를 먼저 선택하세요.');
    const parentTask = psData.find(p => p.id === psSelectedId);
    if (!parentTask) return;
    const parentId = parentTask.parentId ? parentTask.parentId : parentTask.id;

    db.collection('workProjects').add({
        parentId: parentId,
        name: '새 태스크',
        assignee: '',
        status: '대기중',
        startDate: '',
        endDate: '',
        color: '#e0f7fa',
        order: Date.now(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then((docRef) => {
        if (typeof window.logProjectAction === 'function') {
            let parentName = '알 수 없는 프로젝트';
            const parentProj = psData.find(p => p.id === parentId);
            if (parentProj) parentName = parentProj.name;
            window.logProjectAction('CREATE', docRef.id, `${parentName} > 새 태스크`, `새 태스크 생성`);
        }
    }).catch(err => alert("추가 실패: " + err.message));

    // 부모 태스크가 닫혀있다면 열어주기
    if (parentTask.expanded === false) {
        window.psUpdateField(parentId, 'expanded', true);
    }
});

document.getElementById('ps-btn-delete')?.addEventListener('click', () => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    if (!psSelectedId) return alert('삭제할 항목을 선택하세요.');
    if (confirm('선택한 항목을 삭제하시겠습니까? (하위 태스크가 있다면 함께 삭제되지 않을 수 있습니다)')) {
        const task = psData.find(p => p.id === psSelectedId);
        if (task && typeof window.logProjectAction === 'function') {
            let delType = '프로젝트 삭제';
            let logProjectName = task.name;
            if (task.parentId) {
                const parentProj = psData.find(p => p.id === task.parentId);
                const parentName = parentProj ? parentProj.name : '알 수 없는 프로젝트';
                logProjectName = `${parentName} > ${task.name}`;
                delType = `태스크 삭제`;
            }
            window.logProjectAction('DELETE', task.id, logProjectName, delType);
        }
        db.collection('workProjects').doc(psSelectedId).delete().catch(err => alert("삭제 실패: " + err.message));
        psSelectedId = null;
    }
});

let psCopiedTask = null;

document.getElementById('ps-btn-copy')?.addEventListener('click', () => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    if (!psSelectedId) return alert('복사할 항목을 선택하세요.');
    const task = psData.find(p => p.id === psSelectedId);
    if (task) {
        psCopiedTask = { ...task };
        delete psCopiedTask.id;
        alert(`'${task.name}' 복사되었습니다. 원하는 위치를 선택하고 붙여넣기 하세요.`);
    }
});

document.getElementById('ps-btn-paste')?.addEventListener('click', () => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    if (!psCopiedTask) return alert('먼저 복사할 항목을 선택하세요.');

    let parentId = null;
    if (psSelectedId) {
        const parentTask = psData.find(p => p.id === psSelectedId);
        if (parentTask) {
            parentId = parentTask.parentId ? parentTask.parentId : parentTask.id;
        }
    }

    const newTask = { ...psCopiedTask };
    newTask.parentId = parentId;
    newTask.name = newTask.name + ' (복사본)';
    newTask.order = Date.now();
    newTask.createdAt = firebase.firestore.FieldValue.serverTimestamp();

    db.collection('workProjects').add(newTask).then((docRef) => {
        if (typeof window.logProjectAction === 'function') {
            let logProjectName = newTask.name;
            if (parentId) {
                const parentProj = psData.find(p => p.id === parentId);
                const parentName = parentProj ? parentProj.name : '알 수 없는 프로젝트';
                logProjectName = `${parentName} > ${newTask.name}`;
            }
            window.logProjectAction('CREATE', docRef.id, logProjectName, '항목 복사본 생성');
        }
    }).catch(err => alert("붙여넣기 실패: " + err.message));
});

document.getElementById('ps-btn-color')?.addEventListener('click', () => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    if (!psSelectedId) return alert('항목을 선택하세요.');
    const task = psData.find(p => p.id === psSelectedId);
    if (!task) return;

    // 숨겨진 color input 생성 또는 재사용
    let colorInput = document.getElementById('ps-hidden-color-input');
    if (!colorInput) {
        colorInput = document.createElement('input');
        colorInput.id = 'ps-hidden-color-input';
        colorInput.type = 'color';
        colorInput.style.display = 'none';
        document.body.appendChild(colorInput);
    }

    // 현재 색상을 HEX로 변환
    const currentColor = task.color || '#fffacd';
    colorInput.value = currentColor.startsWith('#') ? currentColor : '#fffacd';

    // color input 변경 이벤트
    colorInput.onchange = (e) => {
        const selectedColor = e.target.value;
        window.psUpdateField(psSelectedId, 'color', selectedColor);
    };

    // 색상 선택 창 열기
    colorInput.click();
});

window.psUpdateField = (id, field, value) => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    const proj = psData.find(p => p.id === id);
    if (proj && field !== 'expanded' && field !== 'order') {
        const isTask = !!proj.parentId;
        let fieldStr = field;
        if (field === 'name') fieldStr = isTask ? '태스크명' : '프로젝트명';
        else if (field === 'assignee') fieldStr = '담당자';
        else if (field === 'status') fieldStr = '상태';
        else if (field === 'startDate') fieldStr = '시작일';
        else if (field === 'endDate') fieldStr = '종료일';
        else if (field === 'color') fieldStr = '색상';
        else if (field === 'memo') fieldStr = '메모';
        
        let displayValue = value;
        // 색상코드이거나 내용이 너무 길면 자르기
        if (typeof value === 'string' && value.length > 30) {
            displayValue = value.substring(0, 30) + '...';
        }
        
        let logProjectName = proj.name;
        let details = `${fieldStr} 변경: ${displayValue}`;
        if (isTask) {
            const parentProj = psData.find(p => p.id === proj.parentId);
            const parentName = parentProj ? parentProj.name : '알 수 없는 프로젝트';
            logProjectName = `${parentName} > ${proj.name}`;
        }

        if (typeof window.logProjectAction === 'function') {
            window.logProjectAction('UPDATE', id, logProjectName, details);
        }
    }
    db.collection('workProjects').doc(id).update({ [field]: value }).catch(e => console.error(e));
};

window.psUpdateFields = (id, fieldsObj) => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    const proj = psData.find(p => p.id === id);
    if (proj && typeof window.logProjectAction === 'function') {
        const isTask = !!proj.parentId;
        const keysMap = { name: isTask ? '태스크명' : '프로젝트명', assignee: '담당자', status: '상태', startDate: '시작일', endDate: '종료일', color: '색상', memo: '메모' };
        
        const changes = Object.keys(fieldsObj).filter(k => k !== 'expanded' && k !== 'order').map(k => {
            let val = fieldsObj[k];
            if (typeof val === 'string' && val.length > 30) val = val.substring(0, 30) + '...';
            return `${keysMap[k] || k}: ${val}`;
        }).join(', ');
        
        if (changes) {
            let logProjectName = proj.name;
            let detailsStr = `항목 변경 (${changes})`;
            if (isTask) {
                const parentProj = psData.find(p => p.id === proj.parentId);
                const parentName = parentProj ? parentProj.name : '알 수 없는 프로젝트';
                logProjectName = `${parentName} > ${proj.name}`;
            }
            window.logProjectAction('UPDATE', id, logProjectName, detailsStr);
        }
    }
    db.collection('workProjects').doc(id).update(fieldsObj).catch(e => console.error(e));
};

function renderPsScheduler() {
    const treeBody = document.getElementById('ps-tree-body');
    const ganttHeader = document.getElementById('ps-gantt-header');
    const ganttBody = document.getElementById('ps-gantt-body');
    const bgGrid = document.getElementById('ps-gantt-bg-grid');
    const bgHlines = document.getElementById('ps-gantt-horizontal-lines');
    const ganttBlocks = document.getElementById('ps-gantt-blocks');

    if (!treeBody || !ganttHeader || !ganttBody) return;

    // --- 0. Calculate date range from tasks ---
    // 사용자의 요청으로: 왼쪽 상단 연도(psYear)의 1월 1일부터 12월 31일까지만 표시하도록 고정
    psDisplayStartYear = psYear || new Date().getFullYear();
    psDisplayStartMonth = 0;
    psDisplayEndYear = psDisplayStartYear;
    psDisplayEndMonth = 11;

    const displayStartYear = psDisplayStartYear;
    const displayStartMonth = psDisplayStartMonth;
    const displayEndYear = psDisplayEndYear;
    const displayEndMonth = psDisplayEndMonth;

    // --- 1. Gantt Header & Grid ---
    let headerHtml = `
            <div class="ps-gantt-header-row" id="gh-years"></div>
            <div class="ps-gantt-header-row" id="gh-weeks"></div>
            <div class="ps-gantt-header-row" id="gh-months"></div>
            <div class="ps-gantt-header-row" id="gh-days"></div>
            <div class="ps-gantt-header-row" id="gh-weekdays"></div>
        `;
    ganttHeader.innerHTML = headerHtml;

    const ghYears = document.getElementById('gh-years');
    const ghWeeks = document.getElementById('gh-weeks');
    const ghMonths = document.getElementById('gh-months');
    const ghDays = document.getElementById('gh-days');
    const ghWeekdays = document.getElementById('gh-weekdays');

    bgGrid.innerHTML = '';

    const today = new Date();
    const weekdaysStr = ['일', '월', '화', '수', '목', '금', '토'];

    let totalDays = 0;

    // Generate months and days based on date range
    const daysInMonthFunc = (year, month) => {
        const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
        return [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
    };

    let currentYear = displayStartYear;
    let currentMonth = displayStartMonth;

    // 년도별 colspan 계산용
    let yearGroupDays = 0;
    let yearGroupYear = currentYear;

    // 엑셀과 동일한 월별 주차 계산 로직을 버리고 년도별 1~52주차 연속 로직을 사용합니다.
    let weekDaysCount = 0;
    let currentBlockWeekNum = 0;

    while (currentYear < displayEndYear || (currentYear === displayEndYear && currentMonth <= displayEndMonth)) {
        const mDays = daysInMonthFunc(currentYear, currentMonth);

        // 년도가 바뀌면 이전 년도 그룹 마무리
        if (currentYear !== yearGroupYear) {
            const yDiv = document.createElement('div');
            yDiv.className = 'ps-gh-cell';
            yDiv.style.width = `${yearGroupDays * psDayWidth}px`;
            yDiv.style.minWidth = `${yearGroupDays * psDayWidth}px`;
            yDiv.style.fontWeight = 'bold';
            yDiv.style.background = 'var(--primary-color)';
            yDiv.style.color = '#fff';
            // 텍스트가 왼쪽에서 고정되어 보이도록 처리
            yDiv.style.justifyContent = 'flex-start';
            yDiv.innerHTML = `<span style="position: sticky; left: 12px; display: inline-block; padding: 4px 0;">${yearGroupYear}년</span>`;
            ghYears.appendChild(yDiv);
            yearGroupDays = 0;
            yearGroupYear = currentYear;
        }
        yearGroupDays += mDays;

        // Month
        const mDiv = document.createElement('div');
        mDiv.className = 'ps-gh-cell';
        mDiv.style.width = `${mDays * psDayWidth}px`;
        mDiv.style.minWidth = `${mDays * psDayWidth}px`;
        mDiv.style.justifyContent = 'flex-start';
        mDiv.innerHTML = `<span style="position: sticky; left: 12px; display: inline-block;">${currentMonth + 1}월</span>`;
        ghMonths.appendChild(mDiv);

        for (let d = 1; d <= mDays; d++) {
            const dayDate = new Date(currentYear, currentMonth, d);
            const dayOfWeek = dayDate.getDay(); // 0: 일, 1: 월, 6: 토
            const isToday = (dayDate.getFullYear() === today.getFullYear() && dayDate.getMonth() === today.getMonth() && dayDate.getDate() === today.getDate());

            // --- 연간 주차(Week of the Year) 계산 함수 ---
            // 년도가 넘어가면 무조건 1주차부터 다시 시작하도록 보장
            function getStrictYearWeek(y, m, day) {
                const dt = new Date(y, m, day);
                const firstDayOfYear = new Date(y, 0, 1);
                const dayOfWeekOfFirstDay = firstDayOfYear.getDay();
                const daysToFirstSunday = dayOfWeekOfFirstDay === 0 ? 0 : 7 - dayOfWeekOfFirstDay;
                const firstSunday = new Date(y, 0, 1 + daysToFirstSunday);
                if (dt <= firstSunday) return 1;
                const msSinceFirstSunday = dt.getTime() - firstSunday.getTime();
                const daysSinceFirstSunday = Math.round(msSinceFirstSunday / 86400000);
                return Math.floor(daysSinceFirstSunday / 7) + 2;
            }

            if (weekDaysCount === 0) {
                currentBlockWeekNum = getStrictYearWeek(currentYear, currentMonth, d);
            }

            weekDaysCount++;

            // Day number
            const dDiv = document.createElement('div');
            dDiv.className = 'ps-gh-cell';
            dDiv.style.width = `${psDayWidth}px`;
            dDiv.style.minWidth = `${psDayWidth}px`;
            dDiv.innerText = d;
            if (isToday) dDiv.classList.add('today');
            ghDays.appendChild(dDiv);

            // Weekday
            const wdDiv = document.createElement('div');
            wdDiv.className = 'ps-gh-cell';
            wdDiv.style.width = `${psDayWidth}px`;
            wdDiv.style.minWidth = `${psDayWidth}px`;
            wdDiv.innerText = weekdaysStr[dayOfWeek];
            if (dayOfWeek === 0) wdDiv.classList.add('weekend-sun');
            if (dayOfWeek === 6) wdDiv.classList.add('weekend-sat');
            if (isToday) wdDiv.classList.add('today');
            ghWeekdays.appendChild(wdDiv);

            // Background Grid Line
            const gridLine = document.createElement('div');
            gridLine.className = 'ps-gantt-bg-day';
            gridLine.style.width = `${psDayWidth}px`;
            gridLine.style.minWidth = `${psDayWidth}px`;
            if (dayOfWeek === 0) gridLine.classList.add('weekend-sun');
            if (dayOfWeek === 6) gridLine.classList.add('weekend-sat');
            if (isToday) gridLine.classList.add('today');

            // --- 날짜 클릭 연장 기능 ---
            gridLine.style.cursor = 'pointer';
            const currentClickedDateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;

            gridLine.onclick = (e) => {
                if (!psSelectedId) return;
                const task = window.psFindTaskById ? window.psFindTaskById(psSelectedId) : null;
                if (!task) return;

                if (!task.startDate || !task.endDate) {
                    window.psUpdateField(psSelectedId, 'startDate', currentClickedDateStr);
                    window.psUpdateField(psSelectedId, 'endDate', currentClickedDateStr);
                    return;
                }

                const clickedMs = dayDate.getTime();
                const startMs = new Date(task.startDate).getTime();
                const endMs = new Date(task.endDate).getTime();

                if (clickedMs < startMs) {
                    window.psUpdateField(psSelectedId, 'startDate', currentClickedDateStr);
                } else if (clickedMs > endMs) {
                    window.psUpdateField(psSelectedId, 'endDate', currentClickedDateStr);
                }
            };

            bgGrid.appendChild(gridLine);
            totalDays++;

            // 달의 마지막 날, 년도의 마지막 날, 혹은 차트의 마지막 날인지 확인
            const isLastDayOfYear = (currentMonth === 11 && d === mDays);
            const isLastDayOfChart = (currentYear === displayEndYear && currentMonth === displayEndMonth && d === mDays);

            // 일요일(0)이거나, 년도의 마지막 날이거나, 차트의 마지막 날이면 주차 블록 마감
            if (dayOfWeek === 0 || isLastDayOfYear || isLastDayOfChart) {
                const wDiv = document.createElement('div');
                wDiv.className = 'ps-gh-cell';
                wDiv.style.width = `${weekDaysCount * psDayWidth}px`;
                wDiv.style.minWidth = `${weekDaysCount * psDayWidth}px`;
                wDiv.innerText = `${currentBlockWeekNum}주차`;
                ghWeeks.appendChild(wDiv);
                weekDaysCount = 0;
            }
        }

        // Move to next month
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
    }

    // 마지막 년도 그룹 마무리
    if (yearGroupDays > 0) {
        const yDiv = document.createElement('div');
        yDiv.className = 'ps-gh-cell';
        yDiv.style.width = `${yearGroupDays * psDayWidth}px`;
        yDiv.style.minWidth = `${yearGroupDays * psDayWidth}px`;
        yDiv.style.fontWeight = 'bold';
        yDiv.style.background = 'var(--primary-color)';
        yDiv.style.color = '#fff';
        yDiv.innerText = `${yearGroupYear}년`;
        ghYears.appendChild(yDiv);
    }

    // 헤더와 바디의 가로 폭을 전체 스케줄 너비로 명시적으로 설정하여 가로 스크롤 가능 범위를 확보합니다.
    ganttHeader.style.width = `${totalDays * psDayWidth}px`;
    ganttBody.style.width = `${totalDays * psDayWidth}px`;

    // --- 2. Tree Body & Gantt Blocks ---
    // 스크롤 위치 저장 (innerHTML 초기화 시 scrollTop이 0으로 리셋되는 것 방지)
    const ganttContainer = document.getElementById('ps-gantt-container');
    const savedScrollTop = ganttContainer ? ganttContainer.scrollTop : 0;
    const savedScrollLeft = ganttContainer ? ganttContainer.scrollLeft : 0;

    treeBody.innerHTML = '';
    bgHlines.innerHTML = '';
    ganttBlocks.innerHTML = '';

    psRowIndexMap = []; // Reset map

    // 지연 상태(알람) 계산 로직
    const now = new Date();
    const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const twoDaysLaterDateOnly = new Date(todayDateOnly.getTime() + 2 * 24 * 60 * 60 * 1000);
    
    psData.forEach(task => {
        task._isDelayed = false;
        task._isWarning = false;
        if (task.status && task.status.trim() !== '완료' && task.endDate) {
            const endDate = new Date(task.endDate);
            if (!isNaN(endDate.getTime())) {
                if (endDate < todayDateOnly) {
                    task._isDelayed = true;
                } else if (endDate <= twoDaysLaterDateOnly) {
                    task._isWarning = true;
                }
            }
        }
    });

    let statusChanged;
    do {
        statusChanged = false;
        psData.forEach(task => {
            if (task.parentId) {
                const parent = psData.find(p => p.id === task.parentId);
                if (parent) {
                    if (task._isDelayed && !parent._isDelayed) {
                        parent._isDelayed = true;
                        statusChanged = true;
                    }
                    if (task._isWarning && !parent._isWarning) {
                        parent._isWarning = true;
                        statusChanged = true;
                    }
                }
            }
        });
    } while (statusChanged);

    // Apply select-based filters and name search before rendering
    let dataToRender = psData.slice();
    const searchSelect = document.getElementById('ps-search');
    if (searchSelect) {
        const val = searchSelect.value || 'all';
        if (val.startsWith('status:')) {
            const st = val.split(':')[1];
            dataToRender = dataToRender.filter(p => p.status === st);
        } else if (val.startsWith('assignee:')) {
            const a = val.split(':')[1];
            dataToRender = dataToRender.filter(p => (p.assignee || '').trim() === a);
        }
    }
    if (psSearchFilter && psSearchFilter.length > 0) {
        const q = psSearchFilter.toLowerCase();
        dataToRender = dataToRender.filter(p => (p.name || '').toLowerCase().includes(q));
    }

    const rootTasks = dataToRender.filter(p => !p.parentId).sort((a, b) => a.order - b.order);
    let globalIndex = 0;

    function renderRow(task, level, prefix) {
        psRowIndexMap.push(task.id);
        globalIndex++;
        const children = psData.filter(p => p.parentId === task.id).sort((a, b) => a.order - b.order);
        const isExpanded = task.expanded !== false;
        const hasChildren = children.length > 0;

        const isSelected = psSelectedId === task.id;

        // Tree Row
        const tr = document.createElement('div');
        tr.className = `ps-tree-row ${isSelected ? 'selected' : ''}`;
        tr.style.cssText = 'height: 30px !important; min-height: 30px !important; max-height: 30px !important; display: flex; box-sizing: border-box; overflow: hidden;';
        tr.dataset.taskId = task.id;
        tr.onclick = (e) => {
            if (psSelectedId === task.id) return;
            psSelectedId = task.id;
            document.querySelectorAll('.ps-tree-row').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
        };

        const disabledAttr = !currentUser ? 'disabled' : '';

        if (currentUser) {
            tr.draggable = true;
            tr.addEventListener('dragstart', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                    e.preventDefault();
                    return;
                }
                e.dataTransfer.setData('text/plain', task.id);
                e.dataTransfer.effectAllowed = 'move';
                tr.style.opacity = '0.5';
            });
            tr.addEventListener('dragend', (e) => {
                tr.style.opacity = '1';
                document.querySelectorAll('.ps-tree-row').forEach(r => {
                    r.style.borderTop = '';
                    r.style.borderBottom = '';
                });
            });
            tr.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = tr.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (e.clientY < mid) {
                    tr.style.borderTop = '2px solid var(--primary-color)';
                    tr.style.borderBottom = '';
                } else {
                    tr.style.borderBottom = '2px solid var(--primary-color)';
                    tr.style.borderTop = '';
                }
            });
            tr.addEventListener('dragleave', (e) => {
                tr.style.borderTop = '';
                tr.style.borderBottom = '';
            });
            tr.addEventListener('drop', async (e) => {
                e.preventDefault();
                tr.style.borderTop = '';
                tr.style.borderBottom = '';
                const draggedId = e.dataTransfer.getData('text/plain');
                if (!draggedId || draggedId === task.id) return;

                const draggedTask = psData.find(p => p.id === draggedId);
                const targetTask = task;

                if (draggedTask.parentId !== targetTask.parentId) {
                    alert('동일한 상위 항목(같은 레벨) 내에서만 순서를 변경할 수 있습니다.');
                    return;
                }

                const siblings = psData.filter(p => p.parentId === targetTask.parentId).sort((a, b) => a.order - b.order);
                const draggedIdx = siblings.findIndex(p => p.id === draggedId);

                const rect = tr.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const insertAfter = e.clientY >= mid;

                siblings.splice(draggedIdx, 1);

                let newTargetIdx = siblings.findIndex(p => p.id === targetTask.id);
                if (insertAfter) newTargetIdx++;

                siblings.splice(newTargetIdx, 0, draggedTask);

                const batch = db.batch();
                siblings.forEach((sib, idx) => {
                    sib.order = idx + 1;
                    batch.update(db.collection('workProjects').doc(sib.id), { order: sib.order });
                });

                try {
                    await batch.commit();
                } catch (err) {
                    console.error('Order update failed:', err);
                }
            });
        }

        let alarmIcon = '';
        if (task._isDelayed) {
            alarmIcon = `<i class="fa-solid fa-bell" style="color: #e55039; font-size: 11px; margin-right: 5px;" title="일정 지연 알림"></i>`;
        } else if (task._isWarning) {
            alarmIcon = `<i class="fa-solid fa-bell" style="color: #fa8231; font-size: 11px; margin-right: 5px;" title="마감일 임박 알림"></i>`;
        }

        tr.innerHTML = `
                <div class="ps-col-0">${globalIndex}</div>
                <div class="ps-col-1" style="padding-left: ${10 + level * 20}px; display: flex; align-items: center; padding-right: 5px;">
                    <span style="width:20px; display:inline-block; text-align:center; cursor:pointer;" onclick="event.stopPropagation(); window.psUpdateField('${task.id}', 'expanded', ${!isExpanded})">
                        ${hasChildren ? (isExpanded ? '<i class="fa-solid fa-chevron-down" style="color:#888; font-size:10px;"></i>' : '<i class="fa-solid fa-chevron-right" style="color:#888; font-size:10px;"></i>') : ''}
                    </span>
                    <span style="margin-right:5px; color:#666; font-size:11px; display:inline-block; min-width:45px; flex-shrink:0; white-space:nowrap;">${prefix}</span>
                    ${alarmIcon}
                    <input class="ps-tree-input" value="${task.name || ''}" onchange="window.psUpdateField('${task.id}', 'name', this.value)" ${disabledAttr} style="flex: 1; ${task._isDelayed ? 'color: #e55039; font-weight: bold;' : (task._isWarning ? 'color: #fa8231; font-weight: bold;' : '')}">
                    <i class="fa-solid fa-note-sticky" onclick="event.stopPropagation(); psSelectedId='${task.id}'; window.openMemoModal(${JSON.stringify(task).replace(/"/g, '&quot;')}, event.clientX, event.clientY);" style="margin-left:5px; cursor:pointer; font-size:13px; color: ${task.memo ? '#f59e0b' : '#ccc'};" title="메모 열기"></i>
                </div>
                <div class="ps-col-2">
                    <input class="ps-tree-input" value="${task.assignee || ''}" onchange="window.psUpdateField('${task.id}', 'assignee', this.value)" ${disabledAttr}>
                </div>
                <div class="ps-col-3">
                    <select class="ps-tree-combo" onchange="window.psUpdateField('${task.id}', 'status', this.value)" ${disabledAttr} style="color: ${task.status === '완료' ? '#10b981' : task.status === '진행중' ? '#3b82f6' : '#6b7280'}; font-weight: bold;">
                        <option value="대기중" ${task.status === '대기중' ? 'selected' : ''} style="color: #6b7280;">대기중</option>
                        <option value="진행중" ${task.status === '진행중' ? 'selected' : ''} style="color: #3b82f6;">진행중</option>
                        <option value="완료" ${task.status === '완료' ? 'selected' : ''} style="color: #10b981;">완료</option>
                    </select>
                </div>
                <div class="ps-col-4">
                    <input type="date" class="ps-tree-input" value="${task.startDate || ''}" onchange="window.psUpdateField('${task.id}', 'startDate', this.value)" ${disabledAttr} style="font-size:11px; letter-spacing:-1px;">
                </div>
                <div class="ps-col-5" style="border-right: none;">
                    <input type="date" class="ps-tree-input" value="${task.endDate || ''}" onchange="window.psUpdateField('${task.id}', 'endDate', this.value)" ${disabledAttr} style="font-size:11px; letter-spacing:-1px;">
                </div>
            `;
        treeBody.appendChild(tr);

        // Background Horizontal Line
        const hline = document.createElement('div');
        hline.className = 'ps-gantt-hline';
        hline.style.cssText = `width: ${totalDays * psDayWidth}px; height: 30px !important; min-height: 30px !important; max-height: 30px !important; box-sizing: border-box;`;
        bgHlines.appendChild(hline);

        // Gantt Block (based on display range)
        if (task.startDate && task.endDate) {
            const sDate = new Date(task.startDate);
            const eDate = new Date(task.endDate);

            const displayStart = new Date(displayStartYear, displayStartMonth, 1);
            const displayEnd = new Date(displayEndYear, displayEndMonth + 1, 0); // last day

            let drawStart = sDate < displayStart ? displayStart : sDate;
            let drawEnd = eDate > displayEnd ? displayEnd : eDate;

            const msPerDay = 1000 * 60 * 60 * 24;
            const daysFromStart = Math.floor((drawStart - displayStart) / msPerDay);
            const durationDays = Math.floor((drawEnd - drawStart) / msPerDay) + 1;

            if (durationDays > 0 && daysFromStart + durationDays > 0) {
                const block = document.createElement('div');
                block.className = `ps-block ${isSelected ? 'selected' : ''}`;
                block.dataset.taskId = task.id;
                block.style.left = `${Math.max(0, daysFromStart) * psDayWidth}px`;
                block.style.width = `${Math.max(0, durationDays) * psDayWidth}px`;
                block.style.top = `${(globalIndex - 1) * 30 + 5}px`;
                block.style.background = task.color || '#fffacd';

                const hasMemo = !!task.memo;
                block.innerHTML = `
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${task.name}</span>
                        <i class="fa-solid fa-note-sticky ps-memo-trigger" style="margin-left:5px; font-size:11px; cursor:pointer; opacity: ${hasMemo ? '1' : '0.3'};"></i>
                    `;
                if (hasMemo) {
                    block.title = task.memo;
                }

                const memoTrigger = block.querySelector('.ps-memo-trigger');
                if (memoTrigger) {
                    memoTrigger.onclick = (e) => {
                        e.stopPropagation();
                        psSelectedId = task.id;
                        if (window.openMemoModal) {
                            window.openMemoModal(task, e.clientX, e.clientY);
                        }
                        renderPsScheduler();
                    };
                }

                block.onclick = (e) => {
                    e.stopPropagation();
                    psSelectedId = task.id;
                    renderPsScheduler();
                };

                block.ondblclick = (e) => {
                    e.stopPropagation();
                    if (window.openMemoModal) {
                        window.openMemoModal(task, e.clientX, e.clientY);
                    }
                };
                ganttBlocks.appendChild(block);
            }
        }

        // 하위 노드 렌더링 (isExpanded가 true일 때만)
        if (isExpanded) {
            children.forEach((child, idx) => {
                renderRow(child, level + 1, `${prefix}-${idx + 1}`);
            });
        }
    }

    rootTasks.forEach((root, idx) => {
        renderRow(root, 0, `${idx + 1}`);
    });

    // 양쪽 하단 빈 공간(스크롤바 영역 등)을 자연스럽게 채우기 위해 더미 빈 줄 추가
    for (let i = 0; i < 3; i++) {
        const hline = document.createElement('div');
        hline.className = 'ps-gantt-hline';
        bgHlines.appendChild(hline);

        const tr = document.createElement('div');
        tr.className = 'ps-tree-row';
        tr.style.cssText = 'height: 30px !important; min-height: 30px !important; max-height: 30px !important; box-sizing: border-box; cursor: default; display: flex;';
        tr.innerHTML = `<div class="ps-col-0"></div><div class="ps-col-1"></div><div class="ps-col-2"></div><div class="ps-col-3"></div><div class="ps-col-4"></div>`;
        treeBody.appendChild(tr);
    }

    // 높이 강제 설정 (더미 줄 포함한 전체 높이 적용)
    const baseContentHeight = (globalIndex + 3) * 30;
    ganttBody.style.height = `${baseContentHeight}px`;
    treeBody.style.paddingBottom = '0'; // 기존 여백 계산 로직 제거

    if (psData.length === 0) {
        treeBody.innerHTML = '<div style="text-align:center; padding: 20px; color: #888;">등록된 일정이 없습니다.</div>';
    }

    // --- 3. Synchronize Scrolling ---
    // 스크롤 위치 복원 (렌더링 후)
    if (ganttContainer) {
        // 가로 스크롤바 높이 차이 보정:
        // 간트 컨테이너에는 가로 스크롤바가 있어 세로 표시 영역이 줄어듦
        // 왼쪽 트리바디에는 스크롤바가 숨겨져 있어 세로 표시 영역이 더 넓음
        // 이 차이를 treeBody에 음의 마진 또는 패딩으로 보정
        const ganttScrollbarH = ganttContainer.offsetHeight - ganttContainer.clientHeight;
        const treeScrollbarH = treeBody.offsetHeight - treeBody.clientHeight;
        const scrollbarDiff = ganttScrollbarH - treeScrollbarH;
        if (scrollbarDiff > 0) {
            // 트리바디 하단에 간트 가로 스크롤바와 동일한 높이의 여백 추가
            treeBody.style.marginBottom = `-${scrollbarDiff}px`;
            treeBody.style.paddingBottom = `${scrollbarDiff}px`;
        }

        ganttContainer.scrollTop = savedScrollTop;
        treeBody.scrollTop = savedScrollTop;

        if (psFirstRender) {
            // 처음 진입 시: 오늘 날짜 위치로 자동 스크롤
            psFirstRender = false;
            const todayObj = new Date();
            const displayStart = new Date(psDisplayStartYear, psDisplayStartMonth, 1);
            const diffMs = todayObj.getTime() - displayStart.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                // 오늘 날짜 위치에서 약간 왼쪽(여유 2주)부터 보이도록 조정
                const scrollToX = Math.max(0, (diffDays - 14) * psDayWidth);
                requestAnimationFrame(() => {
                    ganttContainer.scrollLeft = scrollToX;
                });
            }
        } else {
            ganttContainer.scrollLeft = savedScrollLeft;
        }
    }

    // 스크롤 동기화 핸들러 (onscroll = 매번 덮어쓰므로 누적 안됨)

    // [강제 단차 교정 로직]
    // OS나 브라우저별 스크롤바, 보더, 렌더링 차이로 인해 미세하게 틀어지는 단차를
    // 첫 번째 행의 실제 화면상 좌표(BoundingClientRect)를 직접 측정하여 완벽하게 일치시킵니다.
    requestAnimationFrame(() => {
        const firstTr = treeBody.querySelector('.ps-tree-row');
        const firstHline = bgHlines.querySelector('.ps-gantt-hline');
        if (firstTr && firstHline) {
            const trRect = firstTr.getBoundingClientRect();
            const hlRect = firstHline.getBoundingClientRect();
            const diff = trRect.top - hlRect.top;
            if (Math.abs(diff) > 0.5) {
                const currentMargin = parseFloat(window.getComputedStyle(ganttBody).marginTop) || 0;
                ganttBody.style.marginTop = `${currentMargin + diff}px`;
                console.log('[단차 자동 교정] 좌우 패널 높이 차이 보정:', diff, 'px');
            }
        }
    });
    if (ganttContainer) {
        let _syncLock = false;

        treeBody.onscroll = () => {
            if (_syncLock) return;
            _syncLock = true;
            ganttContainer.scrollTop = treeBody.scrollTop;
            // 가로 스크롤 동기화 (트리 바디 -> 트리 헤더)
            const treeHeader = document.querySelector('.ps-tree-header');
            if (treeHeader) {
                treeHeader.scrollLeft = treeBody.scrollLeft;
            }
            requestAnimationFrame(() => { _syncLock = false; });
        };

        ganttContainer.onscroll = () => {
            if (_syncLock) return;
            _syncLock = true;
            treeBody.scrollTop = ganttContainer.scrollTop;
            requestAnimationFrame(() => { _syncLock = false; });
        };

        // 왼쪽 트리 wheel 이벤트 (누적 방지: 기존 리스너 제거 후 재등록)
        if (treeBody._psWheelHandler) {
            treeBody.removeEventListener('wheel', treeBody._psWheelHandler);
        }
        treeBody._psWheelHandler = (e) => {
            if (!e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                ganttContainer.scrollTop += e.deltaY;
                treeBody.scrollTop = ganttContainer.scrollTop; // 즉시 동기화
                treeBody.scrollLeft += e.deltaX;
            }
        };
        treeBody.addEventListener('wheel', treeBody._psWheelHandler, { passive: false });
    }
}

// --- 4. Drag to Draw, Move, Resize Block ---
let isDrawing = false;
let isMoving = false;
let isResizingLeft = false;
let isResizingRight = false;
let isPanning = false;
let panPending = false;
let panStartX = null;
let panStartY = null;
let panScrollLeft = 0;
let panScrollTop = 0;


let actionTaskId = null;
let actionBlock = null;

let drawStartDayIndex = 0;
let originalStartDay = 0;
let originalEndDay = 0;
let dragStartX = 0;
let dragStartDayIndex = 0;

function getDayIndexFromX(x) {
    return Math.floor(x / psDayWidth);
}
function getDateFromDayIndex(dayIndex) {
    const startDate = new Date(psDisplayStartYear, psDisplayStartMonth, 1);
    const d = new Date(startDate.getTime() + dayIndex * 24 * 60 * 60 * 1000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function getDayIndexFromDateStr(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    const startDate = new Date(psDisplayStartYear, psDisplayStartMonth, 1);
    return Math.floor((d - startDate) / (1000 * 60 * 60 * 24));
}

document.addEventListener('mousedown', (e) => {
    const ganttBody = document.getElementById('ps-gantt-body');
    if (!ganttBody || !ganttBody.contains(e.target)) return;
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }

    const container = document.getElementById('ps-gantt-container');
    const rect = ganttBody.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dayIndex = getDayIndexFromX(x);
    const rowIndex = Math.floor(y / 30);

    const blockEl = e.target.closest('.ps-block');

    if (blockEl) {
        const task = psData.find(p => p.id === blockEl.dataset.taskId);
        if (!task) return;

        // 커맨드 키 없이 블럭 클릭 시에는 이동/선택 대신 팬 동작만 허용합니다.
        if (!e.ctrlKey && !e.metaKey) {
            isPanning = false;
            panPending = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            panScrollLeft = container.scrollLeft;
            panScrollTop = container.scrollTop;
            e.preventDefault();
            return;
        }

        actionTaskId = blockEl.dataset.taskId;
        psSelectedId = actionTaskId;

        // 드래그 시작 전 DOM을 전면 리빌드(renderPsScheduler)하면 포커스가 날아가고 스크롤 튕김 오류가 발생하므로 클래스명만 수동 제어합니다.
        document.querySelectorAll('.ps-block, .ps-tree-row').forEach(el => el.classList.remove('selected'));
        blockEl.classList.add('selected');

        const targetRowIndex = psRowIndexMap.indexOf(actionTaskId);
        if (targetRowIndex !== -1) {
            const treeRows = document.querySelectorAll('.ps-tree-row');
            if (treeRows[targetRowIndex]) treeRows[targetRowIndex].classList.add('selected');
        }

        if (task.startDate && task.endDate) {
            originalStartDay = getDayIndexFromDateStr(task.startDate);
            originalEndDay = getDayIndexFromDateStr(task.endDate);
            dragStartX = x;
            dragStartDayIndex = dayIndex;
            actionBlock = blockEl;

            const blockRect = blockEl.getBoundingClientRect();
            const mouseXInBlock = e.clientX - blockRect.left;

            // Ctrl/Meta(Cmd) 키를 누른 채 가장자리를 잡았을 때만 늘리기/줄이기(Resize)가 작동하도록 조건을 제한합니다
            if ((e.ctrlKey || e.metaKey) && mouseXInBlock <= 12) {
                isResizingLeft = true;
            } else if ((e.ctrlKey || e.metaKey) && mouseXInBlock >= blockRect.width - 12) {
                isResizingRight = true;
            } else {
                isMoving = true;
            }

            actionBlock.classList.add('dragging');

            // 들리는 입체적인 입체 효과 부여 (스케일 업 및 부드러운 하이라이트 그림자)
            actionBlock.style.transform = 'translateY(-3px) scale(1.02)';
            actionBlock.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.45)';
            actionBlock.style.zIndex = '999';
            actionBlock.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';

            e.preventDefault();
            return;
        }
    }

    if (rowIndex >= 0 && rowIndex < psRowIndexMap.length) {
        const taskId = psRowIndexMap[rowIndex];
        psSelectedId = taskId;

        document.querySelectorAll('.ps-tree-row').forEach(r => r.classList.remove('selected'));
        const treeRows = document.querySelectorAll('.ps-tree-row');
        if (treeRows[rowIndex]) treeRows[rowIndex].classList.add('selected');

        document.querySelectorAll('.ps-gantt-row').forEach(r => r.classList.remove('selected'));
        const ganttRows = document.querySelectorAll('.ps-gantt-row');
        if (ganttRows[rowIndex]) ganttRows[rowIndex].classList.add('selected');

        const task = psData.find(p => p.id === taskId);

        if (!e.ctrlKey && !e.metaKey) {
            // Just select row and prepare for panning
            isPanning = false;
            panPending = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            panScrollLeft = container.scrollLeft;
            panScrollTop = container.scrollTop;
            e.preventDefault();
            return;
        }

        // Draw new block
        isDrawing = true;
        drawStartDayIndex = dayIndex;
        actionTaskId = taskId;

        if (task.startDate && task.endDate) {
            originalStartDay = getDayIndexFromDateStr(task.startDate);
            originalEndDay = getDayIndexFromDateStr(task.endDate);
        } else {
            originalStartDay = null;
            originalEndDay = null;
        }

        actionBlock = document.createElement('div');
        actionBlock.className = 'ps-block selected dragging';
        actionBlock.style.left = `${dayIndex * psDayWidth}px`;
        actionBlock.style.width = `${psDayWidth}px`;
        actionBlock.style.top = `${rowIndex * 30 + 5}px`;
        actionBlock.style.background = 'rgba(255, 107, 129, 0.7)';
        actionBlock.innerText = '설정 중...';
        document.getElementById('ps-gantt-blocks').appendChild(actionBlock);
        e.preventDefault();
    }

    // Empty space - only allow panning
    if (rowIndex < 0 || rowIndex >= psRowIndexMap.length) {
        isPanning = false;
        panPending = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panScrollLeft = container.scrollLeft;
        panScrollTop = container.scrollTop;
        e.preventDefault();
        return;
    }
});

document.addEventListener('mousemove', (e) => {
    if (isPanning) {
        const container = document.getElementById('ps-gantt-container');
        const treeBody = document.getElementById('ps-tree-body');
        if (container) {
            container.scrollLeft = panScrollLeft - (e.clientX - panStartX);
            container.scrollTop = panScrollTop - (e.clientY - panStartY);
            if (treeBody) treeBody.scrollTop = container.scrollTop; // 좌측 동기화
            container.style.cursor = 'grabbing';
        }
        return;
    }

    const ganttBody = document.getElementById('ps-gantt-body');
    if (!ganttBody) return;

    const blockEl = e.target.closest('.ps-block');
    if (blockEl && !isDrawing && !isMoving && !isResizingLeft && !isResizingRight) {
        const blockRect = blockEl.getBoundingClientRect();
        const mouseXInBlock = e.clientX - blockRect.left;

        // Ctrl/Meta(Cmd) 키를 누른 채 가장자리에 올렸을 때만 늘리기/줄이기(ew-resize) 커서를 표시합니다
        if ((e.ctrlKey || e.metaKey) && (mouseXInBlock <= 12 || mouseXInBlock >= blockRect.width - 12)) {
            blockEl.style.cursor = 'ew-resize';
        } else {
            blockEl.style.cursor = 'grab';
        }
    }

    if (!isDrawing && !isMoving && !isResizingLeft && !isResizingRight) {
        // Check for panning initiation
        if (e.buttons === 1 && !e.ctrlKey && !e.metaKey && panStartX !== null) {
            const deltaX = e.clientX - panStartX;
            const deltaY = e.clientY - panStartY;
            if (panPending && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
                isPanning = true;
                panPending = false;
                isClickExtendCandidate = false; // Cancel extend if panning
            }
            if (isPanning) {
                const container = document.getElementById('ps-gantt-container');
                const treeBody = document.getElementById('ps-tree-body');
                if (container) {
                    container.scrollLeft = panScrollLeft - deltaX;
                    container.scrollTop = panScrollTop - deltaY;
                    if (treeBody) treeBody.scrollTop = container.scrollTop; // 좌측 동기화
                    container.style.cursor = 'grabbing';
                }
            }
        }
        return;
    }

    const container = document.getElementById('ps-gantt-container');
    const rect = ganttBody.getBoundingClientRect();
    let x = e.clientX - rect.left;
    if (x < 0) x = 0;
    const dayIndex = getDayIndexFromX(x);

    if (isDrawing && actionBlock) {
        let minDay = Math.min(drawStartDayIndex, dayIndex);
        let maxDay = Math.max(drawStartDayIndex, dayIndex);

        if (originalStartDay !== null && originalEndDay !== null) {
            minDay = Math.min(minDay, originalStartDay);
            maxDay = Math.max(maxDay, originalEndDay);
        }

        actionBlock.style.left = `${minDay * psDayWidth}px`;
        actionBlock.style.width = `${(maxDay - minDay + 1) * psDayWidth}px`;
    }
    else if (isResizingLeft && actionBlock) {
        const minDay = Math.min(dayIndex, originalEndDay);
        const maxDay = originalEndDay;
        actionBlock.style.left = `${minDay * psDayWidth}px`;
        actionBlock.style.width = `${(maxDay - minDay + 1) * psDayWidth}px`;
    }
    else if (isResizingRight && actionBlock) {
        const minDay = originalStartDay;
        const maxDay = Math.max(dayIndex, originalStartDay);
        actionBlock.style.left = `${minDay * psDayWidth}px`;
        actionBlock.style.width = `${(maxDay - minDay + 1) * psDayWidth}px`;
    }
    else if (isMoving && actionBlock) {
        const deltaDays = dayIndex - dragStartDayIndex;
        const newStartDay = originalStartDay + deltaDays;
        actionBlock.style.left = `${newStartDay * psDayWidth}px`;
        actionBlock.style.cursor = 'grabbing';
    }
});

document.addEventListener('mouseup', (e) => {
    if (isPanning) {
        isPanning = false;
        panPending = false;
        const container = document.getElementById('ps-gantt-container');
        const treeBody = document.getElementById('ps-tree-body');
        if (container) {
            container.style.cursor = '';
            const dx = e.clientX - panStartX;
            const dy = e.clientY - panStartY;
            container.scrollLeft = panScrollLeft - dx;
            container.scrollTop = panScrollTop - dy;
            if (treeBody) treeBody.scrollTop = container.scrollTop; // 좌측 동기화
        }
        panStartX = null;
        panStartY = null;
        e.preventDefault();
        return;
    }

    if (!isDrawing && !isMoving && !isResizingLeft && !isResizingRight) {
        panPending = false;
        panStartX = null;
        panStartY = null;
        return;
    }

    const ganttBody = document.getElementById('ps-gantt-body');
    const container = document.getElementById('ps-gantt-container');
    if (!ganttBody || !container || !actionTaskId) return;

    const rect = ganttBody.getBoundingClientRect();
    let x = e.clientX - rect.left;
    if (x < 0) x = 0;
    const dayIndex = getDayIndexFromX(x);

    let finalStartDay = originalStartDay;
    let finalEndDay = originalEndDay;

    if (isDrawing) {
        let minDay = Math.min(drawStartDayIndex, dayIndex);
        let maxDay = Math.max(drawStartDayIndex, dayIndex);

        if (originalStartDay !== null && originalEndDay !== null) {
            minDay = Math.min(minDay, originalStartDay);
            maxDay = Math.max(maxDay, originalEndDay);
        }
        finalStartDay = minDay;
        finalEndDay = maxDay;
    } else if (isResizingLeft) {
        finalStartDay = Math.min(dayIndex, originalEndDay);
        finalEndDay = originalEndDay;
    } else if (isResizingRight) {
        finalStartDay = originalStartDay;
        finalEndDay = Math.max(dayIndex, originalStartDay);
    } else if (isMoving) {
        const deltaDays = dayIndex - dragStartDayIndex;
        finalStartDay = originalStartDay + deltaDays;
        finalEndDay = originalEndDay + deltaDays;
    }

    window.psUpdateFields(actionTaskId, {
        startDate: getDateFromDayIndex(finalStartDay),
        endDate: getDateFromDayIndex(finalEndDay)
    });

    if (isDrawing && actionBlock) {
        actionBlock.remove();
    } else if (actionBlock) {
        actionBlock.style.cursor = '';
        actionBlock.style.transform = '';
        actionBlock.style.boxShadow = '';
        actionBlock.style.zIndex = '';
        actionBlock.style.transition = '';
        actionBlock.classList.remove('dragging');
    }

    isDrawing = false;
    isMoving = false;
    isResizingLeft = false;
    isResizingRight = false;
    actionBlock = null;
    actionTaskId = null;
});

// Gantt Container Wheel Zoom (Ctrl + Mouse Wheel)
const ganttContainerEl = document.getElementById('ps-gantt-container');
if (ganttContainerEl) {
    ganttContainerEl.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                psDayWidth = Math.min(psDayWidth + 5, 100);
            } else {
                psDayWidth = Math.max(psDayWidth - 5, 10);
            }
            renderPsScheduler();
        }
    }, { passive: false });
}

// ====================================================
// 파티클 배경 로직 (기존 유지)
// ====================================================
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let particlesArray = [];
const numberOfParticles = 40;
const mouse = { x: null, y: null, radius: 120 };

window.addEventListener('mousemove', (event) => { mouse.x = event.x; mouse.y = event.y; });
window.addEventListener('mouseout', () => { mouse.x = null; mouse.y = null; });
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; initParticles(); });

class Particle {
    constructor(x, y, directionX, directionY, size, color) {
        this.x = x; this.y = y; this.directionX = directionX; this.directionY = directionY; this.size = size; this.color = color;
    }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.fill();
    }
    update() {
        if (this.x > canvas.width || this.x < 0) this.directionX = -this.directionX;
        if (this.y > canvas.height || this.y < 0) this.directionY = -this.directionY;
        let dx = mouse.x - this.x; let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < mouse.radius + this.size) {
            if (mouse.x < this.x && this.x < canvas.width - this.size * 10) this.x += 2;
            if (mouse.x > this.x && this.x > this.size * 10) this.x -= 2;
            if (mouse.y < this.y && this.y < canvas.height - this.size * 10) this.y += 2;
            if (mouse.y > this.y && this.y > this.size * 10) this.y -= 2;
        }
        this.x += this.directionX; this.y += this.directionY;
        this.draw();
    }
}

function initParticles() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight; particlesArray = [];
    const colors = [
        'rgba(45, 156, 219, 0.12)',
        'rgba(156, 219, 217, 0.10)',
        'rgba(255, 255, 255, 0.05)'
    ];

    for (let i = 0; i < numberOfParticles; i++) {
        let size = (Math.random() * 8) + 4;
        let x = (Math.random() * ((innerWidth - size * 2) - (size * 2)) + size * 2);
        let y = (Math.random() * ((innerHeight - size * 2) - (size * 2)) + size * 2);
        let directionX = (Math.random() * 0.4) - 0.2; let directionY = (Math.random() * 0.4) - 0.2;
        let color = colors[Math.floor(Math.random() * colors.length)];
        particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
    }
}

function animateParticles() {
    requestAnimationFrame(animateParticles);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = 0; i < particlesArray.length; i++) { particlesArray[i].update(); }
    connectParticles();
}

function connectParticles() {
    const lineColor = 'rgba(156, 219, 217, 0.035)';
    let maxDistance = 150;
    for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a; b < particlesArray.length; b++) {
            let dx = particlesArray[a].x - particlesArray[b].x;
            let dy = particlesArray[a].y - particlesArray[b].y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < maxDistance) {
                ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.beginPath();
                ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                ctx.lineTo(particlesArray[b].x, particlesArray[b].y); ctx.stroke();
            }
        }
    }
}

// ====================================================
// Work Hero 배경 사진 (Slider & Manager)
// ====================================================
const workHeroSliderTrack = document.getElementById('work-hero-slider-track');
const workHeroSliderDots = document.getElementById('work-hero-slider-dots');
const workHeroPrevBtn = document.getElementById('work-hero-prev-btn');
const workHeroNextBtn = document.getElementById('work-hero-next-btn');
const workHeroEditTrigger = document.getElementById('work-hero-img-edit-trigger');

const workHeroManagerModal = document.getElementById('work-hero-manager-modal');
const workHeroManagerClose = document.getElementById('work-hero-manager-close');
const workHeroImagesGrid = document.getElementById('work-hero-images-grid');
const workHeroUploadDropzone = document.getElementById('work-hero-upload-dropzone');
const workHeroSliderFileInput = document.getElementById('work-hero-slider-file-input');

let workHeroImages = [];
let workHeroSliderIndex = 0;
let workHeroSliderInterval = null;
const defaultHeroImage = './assets/dodo_hero.png';

function normalizeWorkHeroImages(images) {
    if (!Array.isArray(images)) return [];
    return images.filter(imgUrl => imgUrl && imgUrl !== defaultHeroImage);
}

function getWorkHeroIntroSlide() {
    return '<div class="hero-slide hero-intro-slide"><iframe class="work-hero-intro" src="./assets/orbis-intro.html" title="ORBiS CORE 인트로 애니메이션" tabindex="-1"></iframe></div>';
}

function setWorkHeroControlsVisible(visible) {
    if (workHeroPrevBtn) workHeroPrevBtn.style.display = visible ? '' : 'none';
    if (workHeroNextBtn) workHeroNextBtn.style.display = visible ? '' : 'none';
}

db.collection('workSiteSettings').doc('heroImages').onSnapshot(doc => {
    workHeroImages = doc.exists ? normalizeWorkHeroImages(doc.data().images) : [];
    localStorage.setItem('dodo-work-hero-images-cache', JSON.stringify(workHeroImages));
    renderWorkHeroSlider();
    if (workHeroManagerModal && !workHeroManagerModal.classList.contains('hidden')) {
        renderWorkHeroManager();
    }
});

function renderWorkHeroSlider() {
    if (!workHeroSliderTrack) return;
    if (workHeroSliderInterval) clearInterval(workHeroSliderInterval);
    workHeroSliderTrack.innerHTML = '';
    if (workHeroSliderDots) workHeroSliderDots.innerHTML = '';

    if (workHeroImages.length === 0) {
        workHeroSliderTrack.innerHTML = getWorkHeroIntroSlide();
        workHeroSliderIndex = 0;
        workHeroSliderTrack.style.transform = 'translateX(0)';
        setWorkHeroControlsVisible(false);
        return;
    }

    setWorkHeroControlsVisible(workHeroImages.length > 1);

    workHeroImages.forEach((imgUrl, idx) => {
        const slide = document.createElement('div');
        slide.className = 'hero-slide';
        slide.style.width = '100%';
        slide.style.height = '100%';
        slide.style.flexShrink = '0';
        slide.style.display = 'flex';
        slide.style.alignItems = 'center';
        slide.style.justifyContent = 'center';
        slide.style.overflow = 'hidden';
        slide.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; display:block; vertical-align:middle;">`;
        workHeroSliderTrack.appendChild(slide);

        if (workHeroSliderDots) {
            const dot = document.createElement('div');
            dot.className = `hero-slider-dot ${idx === workHeroSliderIndex ? 'active' : ''}`;
            dot.addEventListener('click', () => goWorkHeroSlide(idx));
            workHeroSliderDots.appendChild(dot);
        }
    });

    if (workHeroSliderIndex >= workHeroImages.length) {
        workHeroSliderIndex = 0;
    }
    updateWorkHeroSliderPosition();
    startWorkHeroAutoSlide();
}

function updateWorkHeroSliderPosition() {
    if (!workHeroSliderTrack) return;
    workHeroSliderTrack.style.transform = `translateX(-${workHeroSliderIndex * 100}%)`;

    if (workHeroSliderDots) {
        const dots = workHeroSliderDots.querySelectorAll('.hero-slider-dot');
        dots.forEach((dot, idx) => {
            if (idx === workHeroSliderIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }
}

function goWorkHeroSlide(index) {
    if (workHeroImages.length < 2) return;
    workHeroSliderIndex = index;
    if (workHeroSliderIndex >= workHeroImages.length) workHeroSliderIndex = 0;
    if (workHeroSliderIndex < 0) workHeroSliderIndex = workHeroImages.length - 1;
    updateWorkHeroSliderPosition();
    startWorkHeroAutoSlide();
}

if (workHeroPrevBtn) workHeroPrevBtn.addEventListener('click', () => goWorkHeroSlide(workHeroSliderIndex - 1));
if (workHeroNextBtn) workHeroNextBtn.addEventListener('click', () => goWorkHeroSlide(workHeroSliderIndex + 1));

function startWorkHeroAutoSlide() {
    if (workHeroSliderInterval) clearInterval(workHeroSliderInterval);
    if (workHeroImages.length < 2) return;
    workHeroSliderInterval = setInterval(() => {
        goWorkHeroSlide(workHeroSliderIndex + 1);
    }, 5000);
}

if (workHeroEditTrigger) {
    workHeroEditTrigger.addEventListener('click', () => {
        renderWorkHeroManager();
        if (workHeroManagerModal) workHeroManagerModal.classList.remove('hidden');
    });
}

if (workHeroManagerClose) {
    workHeroManagerClose.addEventListener('click', () => {
        if (workHeroManagerModal) workHeroManagerModal.classList.add('hidden');
    });
}

function renderWorkHeroManager() {
    if (!workHeroImagesGrid) return;
    workHeroImagesGrid.innerHTML = '';

    // 등록된 이미지가 없으면 인트로 애니메이션이 기본 배경으로 표시됨
    if (workHeroImages.length === 0) {
        workHeroImagesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding: 1.5rem; color:var(--text-muted); font-size:0.85rem;">등록된 배경 사진이 없습니다.</p>';
        return;
    }

    workHeroImages.forEach((imgUrl, idx) => {

        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.aspectRatio = '16/9';
        wrapper.style.borderRadius = '8px';
        wrapper.style.overflow = 'hidden';
        wrapper.style.border = '1px solid var(--input-border)';

        const img = document.createElement('img');
        img.src = imgUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';

        const delBtn = document.createElement('button');
        delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        delBtn.style.position = 'absolute';
        delBtn.style.top = '5px';
        delBtn.style.right = '5px';
        delBtn.style.background = 'rgba(255, 71, 87, 0.9)';
        delBtn.style.color = 'white';
        delBtn.style.border = 'none';
        delBtn.style.borderRadius = '50%';
        delBtn.style.width = '24px';
        delBtn.style.height = '24px';
        delBtn.style.cursor = 'pointer';
        delBtn.style.display = 'flex';
        delBtn.style.alignItems = 'center';
        delBtn.style.justifyContent = 'center';
        delBtn.style.fontSize = '0.7rem';

        delBtn.addEventListener('click', () => {
            if (confirm("이 배경 사진을 삭제하시겠습니까?")) {
                const newImages = [...workHeroImages];
                newImages.splice(idx, 1);
                db.collection('workSiteSettings').doc('heroImages').set({
                    images: newImages,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    if (workHeroSliderIndex >= newImages.length) {
                        workHeroSliderIndex = 0;
                    }
                });
            }
        });

        wrapper.appendChild(img);
        wrapper.appendChild(delBtn);
        workHeroImagesGrid.appendChild(wrapper);
    });
}

if (workHeroUploadDropzone) {
    workHeroUploadDropzone.addEventListener('click', () => {
        if (workHeroSliderFileInput) workHeroSliderFileInput.click();
    });
}

if (workHeroSliderFileInput) {
    workHeroSliderFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const originalHtml = workHeroUploadDropzone.innerHTML;
        workHeroUploadDropzone.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i><p style="margin-top:10px; font-weight:bold;">업로드 중...</p>';

        const reader = new FileReader();
        reader.onload = function (event) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max_size = 1200;

                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);

                const newImages = [...workHeroImages, compressedBase64];

                db.collection('workSiteSettings').doc('heroImages').set({
                    images: newImages,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    workHeroUploadDropzone.innerHTML = originalHtml;
                    e.target.value = '';
                }).catch(err => {
                    console.error(err);
                    alert("업로드 실패");
                    workHeroUploadDropzone.innerHTML = originalHtml;
                });
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ====================================================
// 프로젝트 데이터 내보내기 / 불러오기
// ====================================================
const psExportBtn = document.getElementById('ps-btn-export-file');
const psImportBtn = document.getElementById('ps-btn-import-file');
const psFileInput = document.getElementById('ps-file-input');

if (psExportBtn) {
    psExportBtn.addEventListener('click', async () => {
        if (!currentUser) { alert('로그인이 필요합니다.'); return; }
        if (psData.length === 0) { alert('내보낼 데이터가 없습니다.'); return; }

        const nestedData = {
            year: psYear,
            layout: {
                splitter_sizes: [650, 749],
                left_column_widths: [136, 200, 80, 80, 100, 100]
            },
            left_panel: [],
            right_panel: {}
        };

        const rootItems = psData.filter(p => !p.parentId).sort((a, b) => a.order - b.order);

        function buildChildren(parentId, prefix) {
            const children = psData.filter(p => p.parentId === parentId).sort((a, b) => a.order - b.order);
            return children.map((child, index) => {
                const currentPrefix = `${prefix}-${index + 1}`;
                return {
                    col0: currentPrefix,
                    col1: child.name || "",
                    assignee: child.assignee || "",
                    status: child.status || "대기중",
                    start: child.startDate || "",
                    end: child.endDate || "",
                    expanded: child.expanded ?? true,
                    uid: child.id,
                    children: buildChildren(child.id, currentPrefix)
                };
            });
        }

        nestedData.left_panel = rootItems.map((root, index) => {
            const prefix = String(index + 1);
            return {
                col0: prefix,
                col1: root.name || "",
                assignee: root.assignee || "",
                status: root.status || "대기중",
                start: root.startDate || "",
                end: root.endDate || "",
                expanded: root.expanded ?? true,
                uid: root.id,
                children: buildChildren(root.id, prefix)
            };
        });

        const dataStr = JSON.stringify(nestedData, null, 2);
        const defaultFilename = `schedule_${psYear}.json`;

        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultFilename,
                    types: [{
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(dataStr);
                await writable.close();
                return;
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('File System Access API failed:', err);
            }
            return; // User cancelled the save dialog
        }

        // Fallback for browsers that don't support showSaveFilePicker
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

if (psImportBtn && psFileInput) {
    psImportBtn.addEventListener('click', () => {
        if (!currentUser) { alert('로그인이 필요합니다.'); return; }
        psFileInput.click();
    });

    psFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const parsedData = JSON.parse(event.target.result);

                // 호환성 체크: 윈도우 프로그램 형식인지, 아니면 이전 배열 형식인지
                let isNestedFormat = false;
                let importItems = [];

                if (parsedData.left_panel && Array.isArray(parsedData.left_panel)) {
                    isNestedFormat = true;
                } else if (!Array.isArray(parsedData)) {
                    alert('지원하지 않는 파일 형식입니다.');
                    return;
                }

                if (confirm('파일 데이터를 불러오면 기존 프로젝트 데이터가 모두 덮어씌워집니다. 계속하시겠습니까?')) {
                    const batch = db.batch();

                    // 기존 데이터 삭제
                    const snapshot = await db.collection('workProjects').get();
                    snapshot.docs.forEach(doc => batch.delete(doc.ref));

                    if (isNestedFormat) {
                        // 중첩된 윈도우 데이터 평면화
                        let orderCounter = 0;
                        function flatten(items, parentId) {
                            items.forEach(item => {
                                orderCounter += 1000;
                                const docId = item.uid || db.collection('workProjects').doc().id;
                                const flatItem = {
                                    parentId: parentId,
                                    name: item.col1 || "",
                                    assignee: item.assignee || "",
                                    status: item.status || "대기중",
                                    startDate: item.start || "",
                                    endDate: item.end || "",
                                    expanded: item.expanded ?? true,
                                    color: parentId ? '#e0f7fa' : '#fffacd',
                                    order: orderCounter,
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                };
                                const ref = db.collection('workProjects').doc(docId);
                                batch.set(ref, flatItem);

                                if (item.children && item.children.length > 0) {
                                    flatten(item.children, docId);
                                }
                            });
                        }
                        flatten(parsedData.left_panel, null);

                        if (parsedData.year) {
                            psYear = parsedData.year;
                            const yearInput = document.getElementById('ps-year');
                            if (yearInput) yearInput.value = psYear;
                        }
                    } else {
                        // 구버전 평면 배열 형식 호환
                        parsedData.forEach(item => {
                            const docId = item.id;
                            const itemData = { ...item };
                            delete itemData.id;
                            const ref = docId ? db.collection('workProjects').doc(docId) : db.collection('workProjects').doc();
                            batch.set(ref, itemData);
                        });
                    }

                    await batch.commit();
                    alert('프로젝트 데이터를 성공적으로 불러왔습니다!');
                    psFileInput.value = '';
                    renderPsScheduler(); // 반영 후 새로고침
                } else {
                    psFileInput.value = '';
                }
            } catch (err) {
                console.error('불러오기 실패:', err);
                alert('JSON 파일을 파싱하고 저장하는 중 오류가 발생했습니다.');
            }
        };
        reader.readAsText(file);
    });
}
// ====================================================
// ☁️ 클라우드 백업 (Firestore workProjectBackups)
// ====================================================
(function initBackupLogic() {
    const backupModal = document.getElementById('ps-backup-modal');
    const backupModalClose = document.getElementById('ps-backup-modal-close');
    const backupManageBtn = document.getElementById('ps-btn-backup-manage');
    const backupSaveBtn = document.getElementById('ps-backup-save-btn');
    const backupNameInput = document.getElementById('ps-backup-name-input');
    const backupList = document.getElementById('ps-backup-list');
    const backupCount = document.getElementById('ps-backup-count');
    const restoreConfirm = document.getElementById('ps-backup-restore-confirm');
    const restoreNameEl = document.getElementById('ps-backup-restore-name');
    const restoreOkBtn = document.getElementById('ps-backup-restore-ok');
    const restoreCancelBtn = document.getElementById('ps-backup-restore-cancel');

    if (!backupModal || !backupManageBtn) return;

    let pendingRestoreId = null; // 복원 대기 중인 백업 ID

    // ── 모달 열기/닫기 ──────────────────────────────
    backupManageBtn.addEventListener('click', () => {
        if (!currentUser) { alert('로그인이 필요합니다.'); return; }
        backupModal.classList.remove('hidden');
        loadBackupList();
    });
    backupModalClose.addEventListener('click', () => backupModal.classList.add('hidden'));
    backupModal.addEventListener('click', e => { if (e.target === backupModal) backupModal.classList.add('hidden'); });

    // ── 복원 확인 모달 ────────────────────────────────
    restoreCancelBtn?.addEventListener('click', () => {
        restoreConfirm.classList.add('hidden');
        pendingRestoreId = null;
    });
    restoreOkBtn?.addEventListener('click', async () => {
        if (!pendingRestoreId) return;
        restoreOkBtn.disabled = true;
        restoreOkBtn.textContent = '복원 중...';
        try {
            await doRestore(pendingRestoreId);
            restoreConfirm.classList.add('hidden');
            backupModal.classList.add('hidden');
            alert('✅ 백업이 성공적으로 복원되었습니다!');
        } catch (e) {
            alert('복원 실패: ' + e.message);
        } finally {
            restoreOkBtn.disabled = false;
            restoreOkBtn.textContent = '복원하기';
            pendingRestoreId = null;
        }
    });

    async function cleanupOldBackups() {
        try {
            const snap = await db.collection('workProjectBackups').orderBy('createdAt', 'desc').get();
            const autoDocs = [];
            const manualDocs = [];

            snap.forEach(doc => {
                const d = doc.data();
                if (d.type === 'auto') autoDocs.push(doc);
                else manualDocs.push(doc);
            });

            const batch = db.batch();
            let deleteCount = 0;

            // 자동 백업 50개 유지
            if (autoDocs.length > 50) {
                for (let i = 50; i < autoDocs.length; i++) {
                    batch.delete(autoDocs[i].ref);
                    deleteCount++;
                }
            }
            // 수동 백업 50개 유지
            if (manualDocs.length > 50) {
                for (let i = 50; i < manualDocs.length; i++) {
                    batch.delete(manualDocs[i].ref);
                    deleteCount++;
                }
            }

            if (deleteCount > 0) {
                await batch.commit();
                console.log(`오래된 백업 ${deleteCount}개 자동 삭제 완료`);
            }
        } catch (e) {
            console.error("백업 정리 중 오류:", e);
        }
    }

    async function saveBackup(name, type, silent = false) {
        const rootItems = psData.filter(p => !p.parentId).sort((a, b) => a.order - b.order);
        function buildChildren(parentId) {
            return psData.filter(p => p.parentId === parentId)
                .sort((a, b) => a.order - b.order)
                .map(child => ({ ...child, children: buildChildren(child.id) }));
        }
        const nested = rootItems.map(r => ({ ...r, children: buildChildren(r.id) }));

        const dateStr = new Date().toLocaleDateString('ko-KR');

        await db.collection('workProjectBackups').add({
            name: name,
            type: type, // 'auto' or 'manual'
            dateStr: dateStr,
            year: psYear,
            data: nested,
            itemCount: psData.length,
            createdBy: currentUserDoc?.nickname || currentUser.email || 'System',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await cleanupOldBackups();

        if (!silent) {
            backupNameInput.value = '';
            alert(`✅ "${name}" 백업이 저장되었습니다!`);
            loadBackupList();
        }
    }

    window.lastAutoBackupDateStr = null;

    function scheduleNextMidnightBackup() {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1); // 다음날 0시 0분 1초
        const timeUntilMidnight = tomorrow.getTime() - now.getTime();

        setTimeout(() => {
            if (typeof window.checkAndRunAutoBackup === 'function') {
                console.log("자정이 되었습니다. 자동 백업을 실행합니다.");
                window.checkAndRunAutoBackup();
            }
        }, timeUntilMidnight);
    }

    window.checkAndRunAutoBackup = async function () {
        if (!currentUser || psData.length === 0) return;

        const todayStr = new Date().toLocaleDateString('ko-KR');
        if (window.lastAutoBackupDateStr === todayStr) return; // 이미 오늘 실행됨

        window.lastAutoBackupDateStr = todayStr;

        try {
            // 최근 10개만 조회해서 오늘 자동 백업이 있는지 확인
            const snap = await db.collection('workProjectBackups').orderBy('createdAt', 'desc').limit(10).get();
            let alreadyBackedUp = false;
            snap.forEach(doc => {
                const d = doc.data();
                if (d.type === 'auto' && d.dateStr === todayStr) {
                    alreadyBackedUp = true;
                }
            });

            if (!alreadyBackedUp) {
                console.log("오늘의 프로젝트 자동 백업을 시작합니다...");
                await saveBackup(`자동 백업 ${todayStr}`, 'auto', true);
            }

            // 백업 처리가 끝난 후 다음 자정 타이머 설정
            scheduleNextMidnightBackup();
        } catch (e) {
            console.error("자동 백업 오류:", e);
            window.lastAutoBackupDateStr = null; // 실패 시 다시 시도할 수 있도록 초기화
        }
    };

    // ── 현재 데이터를 Firestore에 백업 저장 (수동) ──────────
    backupSaveBtn.addEventListener('click', async () => {
        if (!currentUser) { alert('로그인이 필요합니다.'); return; }
        if (psData.length === 0) { alert('백업할 프로젝트 데이터가 없습니다.'); return; }

        const name = (backupNameInput.value.trim()) || `수동 백업 ${new Date().toLocaleString('ko-KR')}`;
        backupSaveBtn.disabled = true;
        backupSaveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

        try {
            await saveBackup(name, 'manual', false);
        } catch (e) {
            alert('백업 저장 실패: ' + e.message);
        } finally {
            backupSaveBtn.disabled = false;
            backupSaveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 지금 백업';
        }
    });

    // ── 백업 목록 불러오기 ───────────────────────────
    async function loadBackupList() {
        if (!backupList) return;
        backupList.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> 불러오는 중...</div>';
        try {
            const snap = await db.collection('workProjectBackups').orderBy('createdAt', 'desc').get();
            if (snap.empty) {
                backupList.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted);"><i class="fa-solid fa-cloud-slash" style="font-size:2rem; display:block; margin-bottom:8px;"></i>저장된 백업이 없습니다.</div>';
                if (backupCount) backupCount.textContent = '0개';
                return;
            }
            if (backupCount) backupCount.textContent = `${snap.size}개`;

            let autoCardsHtml = '';
            let manualCardsHtml = '';
            let autoCount = 0;
            let manualCount = 0;

            snap.forEach(doc => {
                const d = doc.data();
                const dateStr = d.createdAt ? new Date(d.createdAt.toDate()).toLocaleString('ko-KR') : '';
                const cardHtml = `
                        <div style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; margin-bottom: 12px; transition: box-shadow 0.2s;">
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:700; color:var(--text-color); font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                    <i class="fa-solid fa-database" style="color:${d.type === 'auto' ? '#ff9f43' : '#1b4f72'}; margin-right:6px;"></i>${d.name || '이름 없음'}
                                    ${d.type === 'auto' ? '<span style="font-size:0.7rem; background:#ff9f43; color:white; padding:2px 6px; border-radius:4px; margin-left:6px; vertical-align:middle;">자동</span>' : '<span style="font-size:0.7rem; background:#1b4f72; color:white; padding:2px 6px; border-radius:4px; margin-left:6px; vertical-align:middle;">수동</span>'}
                                </div>
                                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px; display:flex; gap:12px; flex-wrap:wrap;">
                                    <span><i class="fa-regular fa-clock"></i> ${dateStr}</span>
                                    <span><i class="fa-solid fa-list-check"></i> ${d.itemCount || '?'}개 항목</span>
                                    <span><i class="fa-solid fa-calendar"></i> ${d.year || ''}년</span>
                                    <span><i class="fa-solid fa-user"></i> ${d.createdBy || ''}</span>
                                </div>
                            </div>
                            <div style="display:flex; gap:8px; flex-shrink:0;">
                                <button class="btn-restore-backup" data-id="${doc.id}" data-name="${(d.name || '').replace(/"/g, '')}" style="background: linear-gradient(135deg, #0f2b46, #2f6d95); color:#fff; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:0.82rem; font-weight:600; white-space:nowrap;">
                                    <i class="fa-solid fa-rotate-left"></i> 복원
                                </button>
                                <button class="btn-delete-backup" data-id="${doc.id}" style="background:transparent; color:#ff4757; border:1px solid #ff4757; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:0.82rem; white-space:nowrap;">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;

                if (d.type === 'auto') {
                    autoCardsHtml += cardHtml;
                    autoCount++;
                } else {
                    manualCardsHtml += cardHtml;
                    manualCount++;
                }
            });

            backupList.innerHTML = `
                    <div style="margin-bottom: 24px;">
                        <h3 style="font-size: 1.05rem; color: var(--text-color); margin-bottom: 12px; border-bottom: 2px solid #1b4f72; padding-bottom: 8px; display:flex; justify-content:space-between;">
                            <span><i class="fa-solid fa-hand-pointer" style="color:#1b4f72; margin-right:8px;"></i>수동 백업 목록</span>
                            <span style="font-size:0.9rem; color:var(--text-muted);">${manualCount} / 50</span>
                        </h3>
                        ${manualCardsHtml || '<div style="color:var(--text-muted); text-align:center; padding: 12px;">수동 백업이 없습니다.</div>'}
                    </div>
                    <div>
                        <h3 style="font-size: 1.05rem; color: var(--text-color); margin-bottom: 12px; border-bottom: 2px solid #ff9f43; padding-bottom: 8px; display:flex; justify-content:space-between;">
                            <span><i class="fa-solid fa-robot" style="color:#ff9f43; margin-right:8px;"></i>자동 백업 목록</span>
                            <span style="font-size:0.9rem; color:var(--text-muted);">${autoCount} / 50</span>
                        </h3>
                        ${autoCardsHtml || '<div style="color:var(--text-muted); text-align:center; padding: 12px;">자동 백업이 없습니다.</div>'}
                    </div>
                `;

            // 복원 버튼
            backupList.querySelectorAll('.btn-restore-backup').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingRestoreId = btn.dataset.id;
                    if (restoreNameEl) restoreNameEl.textContent = `"${btn.dataset.name}"`;
                    restoreConfirm?.classList.remove('hidden');
                });
            });
            // 삭제 버튼
            backupList.querySelectorAll('.btn-delete-backup').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('이 백업을 삭제하시겠습니까?')) return;
                    await db.collection('workProjectBackups').doc(btn.dataset.id).delete();
                    loadBackupList();
                });
            });
        } catch (e) {
            backupList.innerHTML = `<div style="text-align:center; padding:24px; color:#ff4757;">오류: ${e.message}</div>`;
        }
    }

    // ── 실제 복원 실행 ───────────────────────────────
    async function doRestore(backupId) {
        const doc = await db.collection('workProjectBackups').doc(backupId).get();
        if (!doc.exists) throw new Error('백업 데이터를 찾을 수 없습니다.');
        const bData = doc.data();

        const batch = db.batch();
        // 기존 데이터 삭제
        const snap = await db.collection('workProjects').get();
        snap.docs.forEach(d => batch.delete(d.ref));

        // 중첩 데이터 평면화해서 저장
        let orderCounter = 0;
        function flattenAndSave(items, parentId) {
            items.forEach(item => {
                orderCounter += 1000;
                const children = item.children || [];
                const docId = item.id || db.collection('workProjects').doc().id;
                const flatItem = {
                    parentId: parentId,
                    name: item.name || '',
                    assignee: item.assignee || '',
                    status: item.status || '대기중',
                    startDate: item.startDate || '',
                    endDate: item.endDate || '',
                    expanded: item.expanded ?? true,
                    color: item.color || (parentId ? '#e0f7fa' : '#fffacd'),
                    order: orderCounter,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                batch.set(db.collection('workProjects').doc(docId), flatItem);
                if (children.length > 0) flattenAndSave(children, docId);
            });
        }
        flattenAndSave(bData.data || [], null);

        if (bData.year) {
            psYear = bData.year;
            const yearInput = document.getElementById('ps-year');
            if (yearInput) yearInput.value = psYear;
        }

        await batch.commit();
        renderPsScheduler();
    }
})();

// ====================================================
// 개인별 프로젝트 업무량 통계 그래프
// ====================================================
let statsChart = null;
(function initWorkloadStatsLogic() {
    const btn = document.getElementById('ps-btn-workload-stats');
    const modal = document.getElementById('workload-stats-modal');
    const closeBtn = document.getElementById('workload-stats-close-btn');
    const typeSelect = document.getElementById('workload-type-select');
    const assigneeSelect = document.getElementById('workload-assignee-select');
    const canvas = document.getElementById('workloadChart');

    if (!btn || !modal) return;

    btn.addEventListener('click', () => {
        if (!currentUserDoc || !currentUserDoc.isMaster) {
            alert('개인별 업무량 통계는 마스터 권한이 필요합니다.');
            return;
        }
        modal.classList.remove('hidden');
        populateAssigneeSelect();
        renderWorkloadChart();
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    typeSelect.addEventListener('change', () => {
        renderWorkloadChart();
    });

    assigneeSelect?.addEventListener('change', () => {
        renderWorkloadChart();
    });

    document.getElementById('workload-deselect-all-btn')?.addEventListener('click', () => {
        if (!statsChart) return;
        statsChart.data.datasets.forEach((ds, i) => {
            if (typeof statsChart.hide === 'function') {
                statsChart.hide(i);
            } else {
                ds.hidden = true;
            }
        });
        if (typeof statsChart.hide !== 'function') statsChart.update();
    });

    document.getElementById('workload-select-all-btn')?.addEventListener('click', () => {
        if (!statsChart) return;
        statsChart.data.datasets.forEach((ds, i) => {
            if (typeof statsChart.show === 'function') {
                statsChart.show(i);
            } else {
                ds.hidden = false;
            }
        });
        if (typeof statsChart.show !== 'function') statsChart.update();
    });

    function populateAssigneeSelect() {
        if (!assigneeSelect) return;
        const allAssignees = new Set();
        psData.forEach(task => {
            if (task.assignee) {
                task.assignee.split(',').forEach(a => {
                    const name = a.trim();
                    if (name) allAssignees.add(name);
                });
            }
        });
        
        const currentValue = assigneeSelect.value;
        assigneeSelect.innerHTML = '<option value="all">모든 인원</option>';
        
        Array.from(allAssignees).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            assigneeSelect.appendChild(opt);
        });
        
        if (allAssignees.has(currentValue) || currentValue === 'all') {
            assigneeSelect.value = currentValue;
        } else {
            assigneeSelect.value = 'all';
        }
    }

    // 전역으로 툴팁 정보를 담을 객체
    let tooltipDataObj = {};

    function renderWorkloadChart() {
        const type = typeSelect.value; // 'monthly' or 'weekly'
        const selectedAssignee = assigneeSelect ? assigneeSelect.value : 'all';

        // 데이터 집계
        // 구조: { assigneeName: { '2026년 1월': { days: 5, projects: Set() }, ... } }
        const dataByAssignee = {};
        const labelsSet = new Set();

        // 보조 함수: 특정 날짜의 속한 주차 (1~52)
        function getWeekNumber(d) {
            const date = new Date(d.getTime());
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
            const week1 = new Date(date.getFullYear(), 0, 4);
            return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        }

        psData.forEach(task => {
            if (!task.assignee || task.assignee.trim() === '') return;
            if (!task.startDate || !task.endDate) return;

            const start = new Date(task.startDate);
            const end = new Date(task.endDate);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
            if (end < start) return;

            const assignees = task.assignee.split(',').map(a => a.trim()).filter(a => a !== '');

            let current = new Date(start);
            while (current <= end) {
                // 현재 선택된 연도(psYear)에 해당하는 데이터만 집계할 수도 있으나, 전체 범위를 다 보여주도록 함

                let label = '';
                if (type === 'monthly') {
                    label = `${current.getFullYear()}년 ${current.getMonth() + 1}월`;
                } else {
                    label = `${current.getFullYear()}년 ${getWeekNumber(current)}주차`;
                }

                labelsSet.add(label);

                assignees.forEach(assignee => {
                    if (selectedAssignee !== 'all' && assignee !== selectedAssignee) return;
                    
                    if (!dataByAssignee[assignee]) dataByAssignee[assignee] = {};
                    if (!dataByAssignee[assignee][label]) dataByAssignee[assignee][label] = { days: 0, projects: new Set() };
                    dataByAssignee[assignee][label].days += 1;
                    dataByAssignee[assignee][label].projects.add(task.name);
                });

                current.setDate(current.getDate() + 1);
            }
        });

        // 툴팁용 데이터를 전역 변수에 저장 (차트 콜백에서 접근 가능하도록)
        tooltipDataObj = dataByAssignee;

        // 라벨 정렬
        let sortedLabels = Array.from(labelsSet);
        if (type === 'monthly') {
            sortedLabels.sort((a, b) => {
                const [ya, ma] = a.replace('월', '').split('년 ');
                const [yb, mb] = b.replace('월', '').split('년 ');
                if (ya !== yb) return parseInt(ya) - parseInt(yb);
                return parseInt(ma) - parseInt(mb);
            });
        } else {
            sortedLabels.sort((a, b) => {
                const [ya, wa] = a.replace('주차', '').split('년 ');
                const [yb, wb] = b.replace('주차', '').split('년 ');
                if (ya !== yb) return parseInt(ya) - parseInt(yb);
                return parseInt(wa) - parseInt(wb);
            });
        }

        // 차트용 datasets 구성
        const datasets = [];
        const colors = [
            '#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#3742fa',
            '#ff6b81', '#7bed9f', '#70a1ff', '#eccc68', '#5352ed',
            '#00cec9', '#fdcb6e', '#e84393', '#1b4f72', '#00b894'
        ];
        let colorIndex = 0;

        for (const assignee in dataByAssignee) {
            const data = sortedLabels.map(label => {
                const val = dataByAssignee[assignee][label];
                return val ? val.days : 0;
            });
            datasets.push({
                label: assignee,
                data: data,
                backgroundColor: colors[colorIndex % colors.length],
                borderColor: colors[colorIndex % colors.length],
                borderWidth: 1,
                borderRadius: 4
            });
            colorIndex++;
        }

        if (statsChart) {
            statsChart.destroy();
        }

        if (!window.Chart) {
            alert('차트 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요. (또는 새로고침 해주세요)');
            return;
        }

        const ctx = canvas.getContext('2d');
        statsChart = new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedLabels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                family: "'Noto Sans KR', sans-serif"
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const assignee = context.dataset.label;
                                const label = context.label;
                                const dataObj = tooltipDataObj[assignee] ? tooltipDataObj[assignee][label] : null;
                                let projectsStr = '';
                                if (dataObj && dataObj.projects && dataObj.projects.size > 0) {
                                    projectsStr = ' [' + Array.from(dataObj.projects).join(', ') + ']';
                                }
                                return assignee + ': ' + context.parsed.y + '일' + projectsStr;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: false,
                        ticks: {
                            font: {
                                family: "'Noto Sans KR', sans-serif"
                            }
                        }
                    },
                    y: {
                        stacked: false,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '투입 일수',
                            font: {
                                family: "'Noto Sans KR', sans-serif"
                            }
                        }
                    }
                }
            }
        });
    }
})();

// ====================================================
// 마감일 기준 업무 조회 모달 (마스터 전용)
// ====================================================
(function initDeadlineSearchLogic() {
    const btn = document.getElementById('ps-btn-deadline-search');
    const modal = document.getElementById('deadline-search-modal');
    const closeBtn = document.getElementById('deadline-search-close-btn');
    const execBtn = document.getElementById('deadline-search-execute-btn');
    const daysInput = document.getElementById('deadline-days-input');
    const resultsContainer = document.getElementById('deadline-search-results');

    if (!btn || !modal) return;

    btn.addEventListener('click', () => {
        if (!currentUserDoc || !currentUserDoc.isMaster) {
            alert('이 기능은 마스터 권한이 필요합니다.');
            return;
        }
        modal.classList.remove('hidden');
        resultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">숫자를 입력하고 검색 버튼을 눌러주세요.</div>';
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    execBtn.addEventListener('click', () => {
        const days = parseInt(daysInput.value, 10);
        if (isNaN(days)) return alert('숫자를 입력해주세요.');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + days);
        
        const formatDate = d => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const todayStr = formatDate(today);
        const targetDateStr = formatDate(targetDate);
        
        // 프로젝트 맵 구성
        const projectsMap = {};
        psData.forEach(item => {
            if (!item.parentId) {
                projectsMap[item.id] = { ...item, matchedTasks: [], isMatched: false };
            }
        });

        // 조건: 오늘 ~ N일 이내 마감 (완료된 항목 제외)
        psData.forEach(item => {
            if (item.status === '완료') return;
            if (!item.endDate) return;

            const isMatch = item.endDate >= todayStr && item.endDate <= targetDateStr;
            const isOverdue = item.endDate < todayStr; 
            
            // 지연된 업무도 마감일 임박 업무 조회에서 중요하므로 포함 (isMatch || isOverdue)
            if (isMatch || isOverdue) {
                if (!item.parentId) { // 프로젝트
                    if (projectsMap[item.id]) projectsMap[item.id].isMatched = true;
                } else { // 태스크
                    if (projectsMap[item.parentId]) projectsMap[item.parentId].matchedTasks.push(item);
                }
            }
        });

        const matchingProjects = Object.values(projectsMap).filter(p => p.isMatched || p.matchedTasks.length > 0);
        
        let html = `<div style="margin-bottom: 15px; font-weight: bold; color: #0984e3; font-size: 1.1rem;">
            <i class="fa-regular fa-calendar-check"></i> 마감 임박 및 지연 업무 ( ~ ${targetDateStr} 마감)
        </div>`;
        
        const getDdayString = (dateStr) => {
            if (!dateStr) return '';
            const end = new Date(dateStr);
            end.setHours(0,0,0,0);
            const diffTime = end.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) return `<span style="color:#e67e22; font-weight:bold; margin-left:6px;">[D-Day]</span>`;
            if (diffDays > 0) return `<span style="color:#2980b9; font-weight:bold; margin-left:6px;">[D-${diffDays}]</span>`;
            return `<span style="color:#e74c3c; font-weight:bold; margin-left:6px;">[지연 D+${Math.abs(diffDays)}]</span>`;
        };

        if (matchingProjects.length === 0) {
            resultsContainer.innerHTML = html + `<div style="text-align: center; color: var(--text-muted); padding: 40px;"><i class="fa-regular fa-face-smile" style="font-size: 2rem; margin-bottom: 10px;"></i><br>해당 기간 내에 마감인 업무가 없습니다!</div>`;
            return;
        }
        
        html += `<div style="display: flex; flex-direction: column; gap: 15px;">`;
        matchingProjects.forEach(p => {
            html += `<div style="border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">`;
            
            // 프로젝트 헤더
            html += `<div style="padding: 12px 15px; background: rgba(0,0,0,0.03); border-bottom: ${p.matchedTasks.length > 0 ? '1px solid var(--border-color)' : 'none'}; display: flex; justify-content: space-between; align-items: center;">`;
            html += `<div>
                <div style="font-weight: bold; font-size: 1.1rem; color: ${p.isMatched ? '#e74c3c' : 'var(--text-color)'};">
                    <i class="fa-solid fa-folder-open" style="color:#f1c40f; margin-right: 6px;"></i>${p.name}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                    담당: ${p.assignee || '없음'} | 상태: ${p.status} | 마감일: <span style="${p.isMatched ? 'color:#e74c3c; font-weight:bold;' : ''}">${p.endDate || '없음'}</span> ${p.isMatched ? getDdayString(p.endDate) : ''}
                </div>
            </div>`;
            html += `</div>`;
            
            // 포함된 태스크 목록
            if (p.matchedTasks.length > 0) {
                html += `<ul style="list-style: none; padding: 0; margin: 0; background: var(--bg-color);">`;
                p.matchedTasks.forEach(t => {
                    html += `<li style="padding: 10px 15px; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center;">
                        <div style="padding-left: 15px; border-left: 3px solid #0984e3;">
                            <div style="font-weight: bold; color: var(--text-color);">${t.name}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">담당: ${t.assignee || '없음'} | 상태: ${t.status}</div>
                        </div>
                        <div style="font-weight: bold; color: #e74c3c; font-size: 0.9rem;">
                            마감일: ${t.endDate} ${getDdayString(t.endDate)}
                        </div>
                    </li>`;
                });
                html += `</ul>`;
            }
            
            html += `</div>`;
        });
        html += `</div>`;
        
        resultsContainer.innerHTML = html;
    });
})();

// ====================================================
// 프로젝트 엑셀 출력 (CSV 변환)
// ====================================================
const psExcelAllBtn = document.getElementById('ps-btn-excel-all');
const psExcelSelectedBtn = document.getElementById('ps-btn-excel-selected');

function exportToExcelWithStyle(data, filename) {
    if (!data || data.length === 0) {
        alert('출력할 데이터가 없습니다.');
        return;
    }

    let minDate = null;
    let maxDate = null;

    data.forEach(item => {
        if (item.startDate) {
            if (!minDate || item.startDate < minDate) minDate = item.startDate;
            if (!maxDate || item.startDate > maxDate) maxDate = item.startDate;
        }
        if (item.endDate) {
            if (!minDate || item.endDate < minDate) minDate = item.endDate;
            if (!maxDate || item.endDate > maxDate) maxDate = item.endDate;
        }
    });

    const dateObjects = [];
    if (minDate && maxDate) {
        let curr = new Date(minDate);
        const end = new Date(maxDate);
        while (curr <= end) {
            dateObjects.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }
    }

    let monthGroups = [];
    let weekGroups = [];
    let yearGroups = [];
    let dayCells = '';
    let weekdayCells = '';
    const weekdaysKR = ['일', '월', '화', '수', '목', '금', '토'];

    if (dateObjects.length > 0) {
        let currentMonth = dateObjects[0].getMonth();
        let monthColspan = 0;

        // 년도 그룹 계산용 변수
        let currentYear = dateObjects[0].getFullYear();
        let yearColspan = 0;

        // 엑셀 주차 계산용 변수
        let weekColspan = 0;
        let currentBlockWeekNum = 0;

        // 동일한 주차 계산 함수 사용
        function getStrictYearWeek(y, m, day) {
            const dt = new Date(y, m, day);
            const firstDayOfYear = new Date(y, 0, 1);
            const dayOfWeekOfFirstDay = firstDayOfYear.getDay();
            const daysToFirstSunday = dayOfWeekOfFirstDay === 0 ? 0 : 7 - dayOfWeekOfFirstDay;
            const firstSunday = new Date(y, 0, 1 + daysToFirstSunday);
            if (dt <= firstSunday) return 1;
            const msSinceFirstSunday = dt.getTime() - firstSunday.getTime();
            const daysSinceFirstSunday = Math.round(msSinceFirstSunday / 86400000);
            return Math.floor(daysSinceFirstSunday / 7) + 2;
        }

        for (let i = 0; i < dateObjects.length; i++) {
            const d = dateObjects[i];
            const day = d.getDay(); // 0: Sun, 1: Mon
            const m = d.getMonth();
            const y = d.getFullYear();

            // 년도 그룹 계산
            if (y === currentYear) {
                yearColspan++;
            } else {
                yearGroups.push({ text: currentYear + '년', colspan: yearColspan });
                currentYear = y;
                yearColspan = 1;
            }

            if (m === currentMonth) {
                monthColspan++;
            } else {
                monthGroups.push({ text: (currentMonth + 1) + '월', colspan: monthColspan });
                currentMonth = m;
                monthColspan = 1;
            }

            if (weekColspan === 0) {
                currentBlockWeekNum = getStrictYearWeek(y, m, d.getDate());
            }

            weekColspan++;

            const isLastDayOfYear = (m === 11 && d.getDate() === new Date(y, 11, 31).getDate());
            const isLastDayOfChart = (i === dateObjects.length - 1);

            // 일요일이거나, 년도의 마지막 날이거나, 차트의 마지막 날이면 주차 블록 마감
            if (day === 0 || isLastDayOfYear || isLastDayOfChart) {
                weekGroups.push({ text: currentBlockWeekNum + '주차', colspan: weekColspan });
                weekColspan = 0;
            }

            if (isLastDayOfChart) {
                monthGroups.push({ text: (currentMonth + 1) + '월', colspan: monthColspan });
                yearGroups.push({ text: currentYear + '년', colspan: yearColspan });
            }

            let color = '#333';
            let bg = '#fff';
            if (day === 0) { color = 'red'; bg = '#fff0f0'; }
            if (day === 6) { color = 'blue'; bg = '#f0f4ff'; }

            dayCells += `<th style="background:#f8f9fa; border:1px solid #ddd; min-width:25px;">${d.getDate()}</th>`;
            weekdayCells += `<th style="color:${color}; background:${bg}; border:1px solid #ddd; font-weight:normal;">${weekdaysKR[day]}</th>`;
        }
    }

    let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
        <meta charset="utf-8">
        <style>
            table { border-collapse: collapse; font-family: 'Malgun Gothic', sans-serif; font-size: 9pt; }
            th, td { border: 1px solid #d1d5db; text-align: center; vertical-align: middle; white-space: nowrap; height: 25px; }
            .header-cell { background: #f1f5f9; font-weight: bold; }
            .row-project { background: #ede9fe; font-weight: bold; }
            .row-task { background: #ffffff; }
        </style>
        </head>
        <body>
        <table>
            <thead>
                <tr>
                    <th rowspan="5" class="header-cell" style="width: 40px;">No.</th>
                    <th rowspan="5" class="header-cell" style="width: 250px; text-align:left; padding-left:8px;">Project / Task</th>
                    <th rowspan="5" class="header-cell" style="width: 80px;">Assignee</th>
                    <th rowspan="5" class="header-cell" style="width: 80px;">Status</th>
                    <th rowspan="5" class="header-cell" style="width: 90px;">Start</th>
                    <th rowspan="5" class="header-cell" style="width: 90px;">End</th>
                    ${yearGroups.map(yg => `<th colspan="${yg.colspan}" class="header-cell" style="background:#e2e8f0; font-size:10pt;">${yg.text}</th>`).join('')}
                </tr>
                <tr>
                    ${weekGroups.map(wg => `<th colspan="${wg.colspan}" class="header-cell">${wg.text}</th>`).join('')}
                </tr>
                <tr>
                    ${monthGroups.map(mg => `<th colspan="${mg.colspan}" class="header-cell">${mg.text}</th>`).join('')}
                </tr>
                <tr>${dayCells}</tr>
                <tr>${weekdayCells}</tr>
            </thead>
            <tbody>
        `;

    data.forEach((item, idx) => {
        const isProject = !item.parentId;
        const rowClass = isProject ? 'row-project' : 'row-task';
        const rowBgBase = isProject ? '#ede9fe' : '#ffffff';
        const indent = isProject ? '' : '&nbsp;&nbsp;&nbsp;└ ';

        let tr = `<tr class="${rowClass}">`;
        tr += `<td style="background:${rowBgBase};">${idx + 1}</td>`;
        tr += `<td style="text-align:left; padding-left:8px; background:${rowBgBase}; font-weight:${isProject ? 'bold' : 'normal'};">${indent}${(item.name || '').replace(/</g, '&lt;')}</td>`;
        tr += `<td style="background:${rowBgBase};">${item.assignee || ''}</td>`;
        const statusColor = item.status === '진행중' ? '#3b82f6' : (item.status === '완료' ? '#10b981' : '#6b7280');
        tr += `<td style="color:${statusColor}; background:${rowBgBase};">${item.status || ''}</td>`;
        tr += `<td style="background:${rowBgBase};">${item.startDate || ''}</td>`;
        tr += `<td style="background:${rowBgBase};">${item.endDate || ''}</td>`;

        dateObjects.forEach(d => {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dStr = `${yyyy}-${mm}-${dd}`;

            const day = d.getDay();
            let bg = rowBgBase;
            if (day === 0) bg = isProject ? '#ffd6da' : '#fff0f0';
            if (day === 6) bg = isProject ? '#d6e4ff' : '#f0f4ff';

            let isFill = false;
            if (item.startDate && item.endDate && dStr >= item.startDate && dStr <= item.endDate) {
                isFill = true;
            } else if (item.startDate && !item.endDate && dStr === item.startDate) {
                isFill = true;
            }

            if (isFill) {
                const fillColor = item.color || '#fde047';
                tr += `<td style="background:${fillColor}; border-top:1px solid #aaa; border-bottom:1px solid #aaa; border-left:none; border-right:none;"></td>`;
            } else {
                tr += `<td style="background:${bg};"></td>`;
            }
        });

        tr += '</tr>';
        html += tr;
    });

    html += `
            </tbody>
        </table>
        </body>
        </html>
        `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 트리 순서로 정렬 (프로젝트 → 해당 태스크들 → 다음 프로젝트 → ...)
function flattenTreeOrder(dataArr) {
    const result = [];
    const roots = dataArr.filter(p => !p.parentId).sort((a, b) => a.order - b.order);

    function addWithChildren(item) {
        result.push(item);
        const children = dataArr.filter(p => p.parentId === item.id).sort((a, b) => a.order - b.order);
        children.forEach(child => addWithChildren(child));
    }

    roots.forEach(root => addWithChildren(root));

    return result;
}

if (psExcelAllBtn) {
    psExcelAllBtn.addEventListener('click', () => {
        if (!currentUser) { alert('로그인이 필요합니다.'); return; }
        const sortedData = flattenTreeOrder(psData);
        exportToExcelWithStyle(sortedData, `project_all_${new Date().toISOString().slice(0, 10)}.xls`);
    });
}

if (psExcelSelectedBtn) {
    psExcelSelectedBtn.addEventListener('click', () => {
        if (!currentUser) { alert('로그인이 필요합니다.'); return; }
        if (!psSelectedId) {
            alert('엑셀로 출력할 프로젝트/태스크를 먼저 선택하세요.');
            return;
        }

        const selectedItems = [];

        function findChildren(parentId) {
            const item = psData.find(p => p.id === parentId);
            if (item && !selectedItems.find(p => p.id === item.id)) {
                selectedItems.push(item);
            }
            const children = psData.filter(p => p.parentId === parentId).sort((a, b) => a.order - b.order);
            children.forEach(child => findChildren(child.id));
        }

        findChildren(psSelectedId);
        exportToExcelWithStyle(selectedItems, `project_selected_${new Date().toISOString().slice(0, 10)}.xls`);
    });
}

// --- 5. Column Resizer ---
function initColumnResizers() {
    const headers = document.querySelectorAll('.ps-tree-header > div');
    headers.forEach((header, index) => {
        if (index === headers.length - 1) return; // 마지막 컬럼은 리사이즈 제외

        const resizer = document.createElement('div');
        resizer.style.width = '8px';
        resizer.style.cursor = 'col-resize';
        resizer.style.position = 'absolute';
        resizer.style.right = '-4px';
        resizer.style.top = '0';
        resizer.style.bottom = '0';
        resizer.style.zIndex = '10';

        header.style.position = 'relative';
        header.appendChild(resizer);

        let startX, startWidth;
        resizer.addEventListener('mousedown', function (e) {
            startX = e.clientX;
            startWidth = header.offsetWidth;

            const mouseMoveHandler = function (e) {
                const newWidth = Math.max(30, startWidth + (e.clientX - startX));
                updateColumnWidth(index, newWidth);
            };

            const mouseUpHandler = function () {
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
                if (window.psColWidths) {
                    localStorage.setItem('psColWidths', JSON.stringify(window.psColWidths));
                }
            };

            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
            e.stopPropagation();
            e.preventDefault();
        });
    });

    const saved = localStorage.getItem('psColWidths');
    if (saved) {
        try {
            window.psColWidths = JSON.parse(saved);
            updateColumnWidth(-1, 0); // 초기 렌더링
        } catch (e) { }
    }
}

function updateColumnWidth(index, width) {
    let styleEl = document.getElementById('ps-dynamic-col-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'ps-dynamic-col-style';
        document.head.appendChild(styleEl);
    }
    if (!window.psColWidths) window.psColWidths = {};
    if (index >= 0) window.psColWidths[index] = width;

    let cssStr = '';
    for (let i in window.psColWidths) {
        cssStr += `.ps-col-${i} { width: ${window.psColWidths[i]}px !important; flex: none !important; }\n`;
    }

    // 전체 컬럼 폭의 합을 계산하여 트리 헤더와 로우의 최소 너비로 지정 (스크롤 영역 보정)
    const defaultWidths = { 0: 90, 1: 205, 2: 100, 3: 100, 4: 90, 5: 90 };
    let totalWidth = 0;
    for (let i = 0; i <= 5; i++) {
        totalWidth += window.psColWidths[i] || defaultWidths[i];
    }
    cssStr += `.ps-tree-header, .ps-tree-row { min-width: ${totalWidth}px !important; }\n`;

    styleEl.innerHTML = cssStr;
}

// UI 렌더링이 안정화될 수 있도록 약간의 지연 후 리사이저 초기화
setTimeout(initColumnResizers, 500);

// --- 6. Memo Modal Logic ---
let currentMemoTask = null;
const memoModal = document.getElementById('ps-memo-modal');
const memoContent = document.getElementById('ps-memo-content');

window.openMemoModal = function (task, clientX, clientY) {
    if (!memoModal || !memoContent) return;
    currentMemoTask = task;
    memoContent.value = task.memo || '';
    memoModal.classList.remove('hidden');

    if (clientX !== undefined && clientY !== undefined) {
        let left = clientX + 15;
        let top = clientY + 15;
        if (left + 320 > window.innerWidth) left = window.innerWidth - 330;
        if (top + 200 > window.innerHeight) top = window.innerHeight - 210;
        memoModal.style.left = left + 'px';
        memoModal.style.top = top + 'px';
    } else {
        memoModal.style.left = (window.innerWidth / 2 - 160) + 'px';
        memoModal.style.top = (window.innerHeight / 2 - 100) + 'px';
    }

    setTimeout(() => memoContent.focus(), 100);
};

document.getElementById('ps-btn-memo')?.addEventListener('click', (e) => {
    if (!psSelectedId) {
        alert('먼저 메모를 작성할 프로젝트/태스크 바를 선택하세요.');
        return;
    }
    const task = psData.find(p => p.id === psSelectedId);
    if (task && window.openMemoModal) {
        // 버튼 클릭 시에는 화면 중앙에 모달이 뜨도록 undefined 전달
        window.openMemoModal(task, undefined, undefined);
    }
});

document.getElementById('ps-memo-close')?.addEventListener('click', () => {
    memoModal?.classList.add('hidden');
});

document.getElementById('ps-btn-save-memo')?.addEventListener('click', () => {
    if (!currentMemoTask || !memoContent || !memoModal) return;
    const newMemo = memoContent.value.trim();
    window.psUpdateField(currentMemoTask.id, 'memo', newMemo);
    memoModal.classList.add('hidden');
});

// --- 7. Performance Dashboard ---
window.renderPerformanceDashboard = function () {
    if (currentTab !== 'performance') return;

    let uName = '';
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.displayName) {
        uName = currentUser.displayName;
    } else if (typeof auth !== 'undefined' && auth.currentUser) {
        uName = auth.currentUser.displayName || '';
    }

    const myTasks = psData.filter(t => t.assignee && t.assignee.includes(uName));
    const total = myTasks.length;
    const completed = myTasks.filter(t => t.status === '완료').length;
    const inProgress = myTasks.filter(t => t.status === '진행중').length;
    const pending = myTasks.filter(t => !t.status || t.status === '대기중').length;

    const progressRate = total === 0 ? 0 : Math.round((completed / total) * 100);

    const elTotal = document.getElementById('perf-total-tasks');
    if (elTotal) {
        elTotal.innerText = total;
        document.getElementById('perf-completed-tasks').innerText = completed;
        document.getElementById('perf-inprogress-tasks').innerText = inProgress;
        document.getElementById('perf-progress-rate').innerText = `${progressRate}%`;

        const chartContainer = document.getElementById('perf-chart-container');
        if (chartContainer) {
            chartContainer.innerHTML = `
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 5px;"><span>완료</span><span style="font-weight:bold;">${completed}건</span></div>
                        <div style="width: 100%; height: 10px; background: #eee; border-radius: 5px; overflow: hidden;">
                            <div style="width: ${total === 0 ? 0 : (completed / total) * 100}%; height: 100%; background: #10b981; transition: width 0.5s ease-out;"></div>
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 5px;"><span>진행중</span><span style="font-weight:bold;">${inProgress}건</span></div>
                        <div style="width: 100%; height: 10px; background: #eee; border-radius: 5px; overflow: hidden;">
                            <div style="width: ${total === 0 ? 0 : (inProgress / total) * 100}%; height: 100%; background: #3b82f6; transition: width 0.5s ease-out;"></div>
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 5px;"><span>대기중</span><span style="font-weight:bold;">${pending}건</span></div>
                        <div style="width: 100%; height: 10px; background: #eee; border-radius: 5px; overflow: hidden;">
                            <div style="width: ${total === 0 ? 0 : (pending / total) * 100}%; height: 100%; background: #6b7280; transition: width 0.5s ease-out;"></div>
                        </div>
                    </div>
                `;
        }

        const recentContainer = document.getElementById('perf-recent-completed');
        if (recentContainer) {
            const recent = myTasks.filter(t => t.status === '완료').slice(0, 5);
            if (recent.length === 0) {
                recentContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #888;">최근 완료된 업무가 없습니다.</div>';
            } else {
                recentContainer.innerHTML = recent.map(t => `
                        <div style="padding: 15px; border-left: 4px solid #10b981; background: #f8f9fa; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <div style="font-weight: bold; color: #333; font-size: 1.05rem;">${t.name}</div>
                            <div style="font-size: 0.85rem; color: #666; margin-top: 6px;"><i class="fa-regular fa-calendar-check"></i> 종료일: ${t.endDate || '미상'}</div>
                        </div>
                    `).join('');
            }
        }
    }
};

// --- 8. Members Chat Logic ---
let currentSelectedMemberId = null;
let unsubscribeMemberChat = null;
let currentChatMode = 'public';

let lastMembersSnapshot = null;

// ── 읽지 않은 메시지 추적 ──
// localStorage에 { roomId: lastReadTimestamp(ms) } 형태로 저장
const UNREAD_STORAGE_KEY = 'work_chat_last_read';
let chatUnreadMap = {}; // { roomId: true/false } - 읽지 않은 메시지가 있는지
let unsubscribeChatUnread = null;

function getLastReadMap() {
    try {
        return JSON.parse(localStorage.getItem(UNREAD_STORAGE_KEY) || '{}');
    } catch (e) { return {}; }
}
function setLastRead(roomId) {
    const map = getLastReadMap();
    map[roomId] = Date.now();
    localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify(map));
    chatUnreadMap[roomId] = false;
    updateNewBadges();
}
function updateNewBadges() {
    // 전체 광장 뱃지
    const hallBadge = document.getElementById('chat-new-badge-public_hall');
    if (hallBadge) hallBadge.style.display = chatUnreadMap['public_hall'] ? 'inline-block' : 'none';

    // 각 구성원 뱃지
    document.querySelectorAll('[id^="chat-new-badge-"]').forEach(badge => {
        const roomId = badge.id.replace('chat-new-badge-', '');
        badge.style.display = chatUnreadMap[roomId] ? 'inline-block' : 'none';
    });
}
function startChatUnreadListener() {
    if (!db || !auth.currentUser) return;
    if (unsubscribeChatUnread) unsubscribeChatUnread();

    const myUid = auth.currentUser.uid;
    const lastReadMap = getLastReadMap();

    // 전체 공개 채팅 + 나에게 보내진 1:1 채팅 모두 감시
    unsubscribeChatUnread = db.collection('workMemberChats')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .onSnapshot(snapshot => {
            const lastReadMap = getLastReadMap();
            const newUnread = {};

            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.createdAt) return;
                const msgTime = data.createdAt.seconds ? data.createdAt.seconds * 1000 : 0;
                if (msgTime === 0) return;

                const roomId = data.roomId || 'public_hall';

                // 나에게 관련된 채팅방만 체크
                if (data.chatType === 'private') {
                    if (!roomId.includes(myUid)) return; // 내가 참여한 방이 아님
                }

                // 내가 보낸 메시지는 무시
                const senderUid = data.senderUid || null;
                if (senderUid === myUid) return;

                const lastRead = lastReadMap[roomId] || 0;
                if (msgTime > lastRead) {
                    newUnread[roomId] = true;
                }
            });

            chatUnreadMap = newUnread;
            updateNewBadges();
        });
}

window.renderWorkMembersChatList = function () {
    if (!lastMembersSnapshot) return;
    const listEl = document.getElementById('member-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const snapshot = lastMembersSnapshot;

    // 1. 전체 광장 채팅방 아이템 상단 고정 추가
    const hallDiv = document.createElement('div');
    hallDiv.className = `member-list-item`;
    const isHallSelected = currentSelectedMemberId === 'public_hall' || !currentSelectedMemberId;
    if (isHallSelected) {
        currentSelectedMemberId = 'public_hall';
    }
    hallDiv.style.cssText = `padding: 10px 15px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.2s; background: ${isHallSelected ? '#e3f2fd' : 'transparent'}; font-weight: bold;`;
    hallDiv.innerHTML = `
            <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary-color, #6b46c1); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px;"><i class="fa-solid fa-comments"></i></div>
            <div style="flex: 1;">
                <div style="color: #333; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">💬 전체 광장 채팅방
                    <span id="chat-new-badge-public_hall" style="display: ${chatUnreadMap['public_hall'] ? 'inline-block' : 'none'}; background: #ff3b30; color: #fff; font-size: 0.65rem; padding: 1px 6px; border-radius: 8px; font-weight: bold; animation: newBadgePulse 1.5s ease-in-out infinite;">NEW</span>
                </div>
                <div style="font-size: 0.8rem; color: #888; font-weight: normal;">모든 멤버 수다방</div>
            </div>
        `;
    hallDiv.onmouseover = () => { if (currentSelectedMemberId !== 'public_hall') hallDiv.style.background = '#f1f3f5'; };
    hallDiv.onmouseout = () => { if (currentSelectedMemberId !== 'public_hall') hallDiv.style.background = 'transparent'; };
    hallDiv.onclick = () => selectMember('public_hall', '전체 광장 채팅방', '모든 멤버 수다방', hallDiv);
    listEl.appendChild(hallDiv);

    // 2. 내 정보 가져오기 및 본인 필터링
    const myProfileContainer = document.getElementById('my-profile-container');
    const myUid = currentUser ? currentUser.uid : (auth.currentUser ? auth.currentUser.uid : null);
    let myInfo = null;

    const usersList = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (myUid && doc.id === myUid) {
            myInfo = { id: doc.id, data: data };
        } else {
            usersList.push({ id: doc.id, data: data });
        }
    });

    // 내 정보 상단 렌더링
    if (myInfo && myProfileContainer) {
        const isMaster = myInfo.data.isMaster === true;
        const nickname = myInfo.data.nickname || '이름 없음';
        const dept = myInfo.data.dept || '';

        myProfileContainer.style.display = 'flex';
        myProfileContainer.innerHTML = `
                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary-color, #6b46c1); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px;"><i class="fa-solid fa-user-check"></i></div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; color: #333; font-size: 0.9rem; display: flex; align-items: center; gap: 4px; line-height: 1.2;">
                        <span style="color: #888; font-size: 0.8rem; font-weight: normal;">나:</span> ${nickname}${isMaster ? ' 👑' : ''}
                    </div>
                    ${dept ? `<div style="font-size: 0.75rem; color: #777; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">${dept}</div>` : ''}
                </div>
            `;
    } else if (myProfileContainer) {
        myProfileContainer.style.display = 'none';
        myProfileContainer.innerHTML = '';
    }

    if (usersList.length === 0) {
        if (currentSelectedMemberId === 'public_hall') {
            selectMember('public_hall', '전체 광장 채팅방', '모든 멤버 수다방', hallDiv);
        }
        return;
    }

    usersList.sort((a, b) => {
        const ta = a.data.createdAt ? a.data.createdAt.toMillis() : 0;
        const tb = b.data.createdAt ? b.data.createdAt.toMillis() : 0;
        return ta - tb;
    });

    usersList.forEach(item => {
        const docId = item.id;
        const data = item.data;
        const isMaster = data.isMaster === true;
        const nickname = data.nickname || '이름 없음';
        const dept = data.dept || '';

        // 마스터는 이름 옆에 👑 표시
        const nameDisplay = isMaster ? `${nickname} 👑` : nickname;

        const div = document.createElement('div');
        div.className = `member-list-item`;
        div.style.cssText = `padding: 10px 15px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.2s; background: ${currentSelectedMemberId === docId ? '#e3f2fd' : 'transparent'};`;
        // 1:1 채팅방의 roomId 계산
        const myUid = auth.currentUser ? auth.currentUser.uid : null;
        const memberRoomId = myUid ? [myUid, docId].sort().join('_') : null;
        const hasUnread = memberRoomId && chatUnreadMap[memberRoomId];

        div.innerHTML = `
                <div style="width: 32px; height: 32px; border-radius: 50%; background: #ccc; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px;"><i class="fa-solid fa-user"></i></div>
                <div style="flex: 1;">
                    <div style="font-weight: bold; color: #333; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">${nameDisplay}
                        <span id="chat-new-badge-${memberRoomId || docId}" style="display: ${hasUnread ? 'inline-block' : 'none'}; background: #ff3b30; color: #fff; font-size: 0.65rem; padding: 1px 6px; border-radius: 8px; font-weight: bold; animation: newBadgePulse 1.5s ease-in-out infinite;">NEW</span>
                    </div>
                    ${dept ? `<div style="font-size: 0.8rem; color: #888;">${dept}</div>` : ''}
                </div>
            `;

        div.onmouseover = () => { if (currentSelectedMemberId !== docId) div.style.background = '#f1f3f5'; };
        div.onmouseout = () => { if (currentSelectedMemberId !== docId) div.style.background = 'transparent'; };

        div.onclick = () => selectMember(docId, nickname, dept, div);
        listEl.appendChild(div);
    });

    // 초기 자동 진입
    if (currentSelectedMemberId === 'public_hall') {
        selectMember('public_hall', '전체 광장 채팅방', '모든 멤버 수다방', hallDiv);
    } else {
        const foundItem = usersList.find(u => u.id === currentSelectedMemberId);
        if (foundItem) {
            selectMember(foundItem.id, foundItem.data.nickname || '이름 없음', foundItem.data.dept || '', null);
        }
    }
};

function initMembersLogic() {

    // Load Members from workUsers
    db.collection('workUsers').where('isApproved', '==', true).onSnapshot(snapshot => {
        lastMembersSnapshot = snapshot;
        window.renderWorkMembersChatList();
    });

    // 읽지 않은 채팅 메시지 감시 시작
    startChatUnreadListener();

    const btnSend = document.getElementById('btn-send-member-chat');
    const inputChat = document.getElementById('member-chat-input');

    const sendMessage = async () => {
        if (!currentSelectedMemberId) return;
        const text = inputChat.value.trim();
        if (!text) return;

        let uName = '익명';
        let uRole = '팀원';
        let myUid = 'anonymous';
        if (currentUserDoc && currentUserDoc.nickname) {
            uName = currentUserDoc.nickname;
            uRole = currentUserDoc.dept || '팀원';
            myUid = auth.currentUser ? auth.currentUser.uid : (currentUserDoc.id || 'anonymous');
        } else if (typeof auth !== 'undefined' && auth.currentUser) {
            uName = auth.currentUser.displayName || '익명';
            myUid = auth.currentUser.uid;
            if (currentUserDoc) uRole = currentUserDoc.dept || '팀원';
        }

        const isHall = currentSelectedMemberId === 'public_hall';
        const chatType = isHall ? 'public' : 'private';
        const roomId = isHall ? 'public_hall' : [myUid, currentSelectedMemberId].sort().join('_');

        try {
            inputChat.value = ''; // 긍정적 UI 응답
            await db.collection('workMemberChats').add({
                roomId: roomId,
                memberId: currentSelectedMemberId,
                chatType: chatType,
                text: text,
                senderName: uName,
                senderRole: uRole,
                senderUid: myUid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error(e);
            alert('메시지 전송 실패');
        }
    };

    btnSend?.addEventListener('click', sendMessage);
    inputChat?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function selectMember(id, name, role, element) {
    // 1:1 대화방 진입 시 로그인 체크 및 본인 체크
    if (id !== 'public_hall') {
        if (!auth.currentUser || !currentUserDoc) {
            alert('1:1 비밀 대화는 로그인이 필요합니다. 로그인 화면으로 이동합니다.');
            if (typeof openWorkAuth === 'function') openWorkAuth();
            // 1:1 방으로 진입하지 않고 전체 광장 채팅방으로 강제 복귀
            setTimeout(() => {
                const hallDiv = document.querySelector('.member-list-item');
                selectMember('public_hall', '전체 광장 채팅방', '모든 멤버 수다방', hallDiv);
            }, 0);
            return;
        }
        if (auth.currentUser && auth.currentUser.uid === id) {
            alert('나 자신과의 1:1 대화는 지원하지 않습니다. 다른 구성원을 선택해 주세요.');
            setTimeout(() => {
                const hallDiv = document.querySelector('.member-list-item');
                selectMember('public_hall', '전체 광장 채팅방', '모든 멤버 수다방', hallDiv);
            }, 0);
            return;
        }
    }

    currentSelectedMemberId = id;

    // 읽음 처리 - 해당 채팅방의 NEW 뱃지 제거
    const myUidForRead = auth.currentUser ? auth.currentUser.uid : null;
    if (id === 'public_hall') {
        setLastRead('public_hall');
    } else if (myUidForRead) {
        const readRoomId = [myUidForRead, id].sort().join('_');
        setLastRead(readRoomId);
    }
    document.getElementById('member-chat-empty').style.display = 'none';
    document.getElementById('member-chat-area').style.display = 'flex';

    const avatarEl = document.getElementById('chat-member-avatar');
    const inputChat = document.getElementById('member-chat-input');
    const btnSend = document.getElementById('btn-send-member-chat');

    // 전체 광장이냐 1:1 대화냐에 따라 UI 정보 변경
    if (id === 'public_hall') {
        document.getElementById('chat-member-name').innerText = "💬 전체 광장 채팅방";
        document.getElementById('chat-member-role').innerText = "모든 구성원 수다방";
        if (avatarEl) avatarEl.innerHTML = '<i class="fa-solid fa-comments" style="color: var(--primary-color);"></i>';
        if (inputChat) {
            inputChat.disabled = false;
            inputChat.placeholder = "전체 광장에 메시지를 입력하세요...";
        }
        if (btnSend) btnSend.disabled = false;
    } else {
        document.getElementById('chat-member-name').innerText = `🔒 ${name} 님과의 1:1 비밀 대화`;
        document.getElementById('chat-member-role').innerText = `${role || ''} • 1:1 비밀 대화`;
        if (avatarEl) avatarEl.innerHTML = '<i class="fa-solid fa-lock" style="color: #ff9f43;"></i>';
        if (inputChat) {
            inputChat.disabled = false;
            inputChat.placeholder = `${name} 님에게 비밀 메시지 전송...`;
        }
        if (btnSend) btnSend.disabled = false;
    }

    // Refresh list to highlight selected
    const items = document.querySelectorAll('.member-list-item');
    items.forEach(item => {
        item.style.background = 'transparent';
    });
    if (element) {
        element.style.background = '#e3f2fd';
    } else {
        const listItems = document.querySelectorAll('.member-list-item');
        listItems.forEach(li => {
            if (id === 'public_hall' && li.innerText.includes('전체 광장 채팅방')) {
                li.style.background = '#e3f2fd';
            } else if (li.innerText.includes(name)) {
                li.style.background = '#e3f2fd';
            }
        });
    }

    if (unsubscribeMemberChat) unsubscribeMemberChat();

    const messagesEl = document.getElementById('member-chat-messages');
    messagesEl.innerHTML = '<div style="text-align:center; color:#888;">메시지 로딩중...</div>';

    function loadChatMessages() {
        if (unsubscribeMemberChat) unsubscribeMemberChat();

        let query;
        if (id === 'public_hall') {
            query = db.collection('workMemberChats').where('chatType', '==', 'public');
        } else {
            const myUid = auth.currentUser ? auth.currentUser.uid : null;
            const roomId = myUid ? [myUid, id].sort().join('_') : 'unknown';
            query = db.collection('workMemberChats').where('roomId', '==', roomId);
        }

        unsubscribeMemberChat = query.onSnapshot(snapshot => {
            messagesEl.innerHTML = '';

            let uName = '';
            let uRole = '';
            if (currentUserDoc && currentUserDoc.nickname) {
                uName = currentUserDoc.nickname;
                uRole = currentUserDoc.dept || '팀원';
            } else if (typeof auth !== 'undefined' && auth.currentUser) {
                uName = auth.currentUser.displayName || '';
                if (currentUserDoc) uRole = currentUserDoc.dept || '팀원';
            }

            let validDocs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                validDocs.push({ id: doc.id, data: data });
            });

            validDocs.sort((a, b) => {
                const t1 = a.data.createdAt ? (a.data.createdAt.seconds || 0) : Date.now() / 1000;
                const t2 = b.data.createdAt ? (b.data.createdAt.seconds || 0) : Date.now() / 1000;
                return t1 - t2;
            });

            if (validDocs.length === 0) {
                messagesEl.innerHTML = '<div style="text-align:center; padding: 20px; color:#aaa;">아직 남겨진 메시지가 없습니다. 첫 메시지를 남겨보세요!</div>';
                return;
            }

            let lastDateStr = '';

            validDocs.forEach(item => {
                const doc = item;
                const data = item.data;
                const isMe = data.senderName === uName;
                const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();

                const dateStr = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                if (dateStr !== lastDateStr) {
                    const dateDiv = document.createElement('div');
                    dateDiv.style.cssText = 'text-align: center; margin: 15px 0; width: 100%;';
                    dateDiv.innerHTML = `<span style="background: rgba(0,0,0,0.1); color: #666; padding: 4px 12px; border-radius: 12px; font-size: 0.75rem;">${dateStr}</span>`;
                    messagesEl.appendChild(dateDiv);
                    lastDateStr = dateStr;
                }

                const div = document.createElement('div');
                div.style.cssText = `display: flex; flex-direction: column; max-width: 80%; ${isMe ? 'align-self: flex-end; align-items: flex-end;' : 'align-self: flex-start; align-items: flex-start;'}`;

                const safeText = (data.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                const deleteBtnHtml = isMe ? `<button class="chat-del-btn" style="background:none; border:none; color:#ccc; font-size:0.75rem; cursor:pointer; padding: 2px; margin-bottom: 2px;" title="메시지 삭제"><i class="fa-solid fa-trash-can"></i></button>` : '';

                div.innerHTML = `
                            ${!isMe ? `<div style="font-size: 0.8rem; color: #888; margin-bottom: 4px; margin-left: 5px;">${data.senderName}</div>` : ''}
                            <div style="display: flex; align-items: flex-end; gap: 6px; ${isMe ? 'flex-direction: row-reverse;' : ''}">
                                <div style="background: ${isMe ? 'var(--primary-color, #6b46c1)' : '#ffffff'}; color: ${isMe ? '#ffffff' : '#333333'}; padding: 10px 16px; border-radius: ${isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'}; border: ${isMe ? 'none' : '1px solid #e2e8f0'}; box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-size: 0.95rem; line-height: 1.5; word-break: break-all;">
                                    ${safeText}
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'};">
                                    ${deleteBtnHtml}
                                    <div style="font-size: 0.7rem; color: #a0aec0;">${timeStr}</div>
                                </div>
                            </div>
                        `;

                if (isMe) {
                    const delBtn = div.querySelector('.chat-del-btn');
                    if (delBtn) {
                        delBtn.addEventListener('click', () => {
                            if (confirm('이 메시지를 삭제하시겠습니까?')) {
                                db.collection('workMemberChats').doc(doc.id).delete().catch(err => console.error('Delete failed', err));
                            }
                        });
                    }
                }

                messagesEl.appendChild(div);
            });
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });
    }

    loadChatMessages();
}

// 메인 리사이저 (좌/우 패널 크기 조절) 기능 초기화
function initMainResizer() {
    const resizer = document.getElementById('ps-main-resizer');
    const leftPanel = document.querySelector('.ps-left-panel');
    if (!resizer || !leftPanel) return;

    let startX, startWidth;

    const mouseMoveHandler = function (e) {
        const newWidth = Math.max(300, startWidth + (e.clientX - startX));
        // 오른쪽 패널이 너무 찌그러지지 않도록 최대 너비 제한
        const containerWidth = leftPanel.parentElement.offsetWidth;
        if (newWidth > containerWidth - 100) return;

        leftPanel.style.width = newWidth + 'px';
    };

    const mouseUpHandler = function () {
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);

        localStorage.setItem('psLeftPanelWidth', leftPanel.style.width);
    };

    resizer.addEventListener('mousedown', function (e) {
        startX = e.clientX;
        startWidth = leftPanel.offsetWidth;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        e.preventDefault();
    });

    const savedWidth = localStorage.getItem('psLeftPanelWidth');
    if (savedWidth) {
        leftPanel.style.width = savedWidth;
    }
}

initMainResizer();
if (typeof initMembersLogic === 'function') initMembersLogic();

// --- 9. Personal Performance Dashboard Logic ---
function initPerformanceLogic() {
    const btnAddRow = document.getElementById('btn-perf-add-row');
    const btnAddCol = document.getElementById('btn-perf-add-col');
    const btnSave = document.getElementById('btn-perf-save');
    const theadTr = document.getElementById('perf-matrix-header');
    const tbody = document.getElementById('perf-matrix-body');
    const emptyState = document.getElementById('perf-matrix-empty');
    const table = document.getElementById('perf-matrix-table');

    let matrixData = { rows: [], cols: [], cells: {}, colWidths: {}, rowHeights: {} };
    let unsubscribePerf = null;
    let isEditing = false; // 방해 방지용

    // 커스텀 리사이즈 변수
    let resizingCol = null;
    let resizingRow = null;
    let startPos = 0;
    let startSize = 0;

    document.addEventListener('mousemove', (e) => {
        if (resizingCol && resizingCol.th) {
            const newWidth = Math.max(50, startSize + (e.pageX - startPos));
            resizingCol.th.style.width = newWidth + 'px';
            resizingCol.th.style.minWidth = newWidth + 'px';
            resizingCol.th.style.maxWidth = newWidth + 'px';
        }
        if (resizingRow && resizingRow.td) {
            const newHeight = Math.max(60, startSize + (e.pageY - startPos));
            resizingRow.td.style.height = newHeight + 'px';
            if (resizingRow.td.parentElement) {
                resizingRow.td.parentElement.style.height = newHeight + 'px';
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (resizingCol) {
            const cIdx = resizingCol.cIdx;
            matrixData.colWidths[cIdx] = parseFloat(resizingCol.th.style.width);
            saveMatrixToDB();
            if (resizingCol.resizer) resizingCol.resizer.style.background = 'transparent';
            resizingCol = null;
            document.body.cursor = 'default';
        }
        if (resizingRow) {
            const rIdx = resizingRow.rIdx;
            matrixData.rowHeights[rIdx] = parseFloat(resizingRow.td.style.height);
            saveMatrixToDB();
            if (resizingRow.resizer) resizingRow.resizer.style.background = 'transparent';
            resizingRow = null;
            document.body.style.cursor = 'default';
        }
    });

    function renderMatrix() {
        if (!theadTr || !tbody) return;
        const isMaster = currentUserDoc && currentUserDoc.isMaster === true;

        if (btnAddRow) btnAddRow.style.display = isMaster ? 'inline-block' : 'none';
        if (btnAddCol) btnAddCol.style.display = isMaster ? 'inline-block' : 'none';
        if (btnSave) btnSave.style.display = isMaster ? 'inline-block' : 'none';

        // 헤더 렌더링
        theadTr.innerHTML = '<th style="border: 1px solid var(--card-border); padding: 12px; text-align: left; position: sticky; top: 0; left: 0; background: var(--bg-color); z-index: 2; width: 1%; white-space: nowrap; font-weight: bold; color: var(--text-color);">평가 항목</th>';
        matrixData.cols.forEach((colName, cIdx) => {
            const savedWidth = matrixData.colWidths && matrixData.colWidths[cIdx] ? `${matrixData.colWidths[cIdx]}px` : '150px';
            const th = document.createElement('th');
            th.style.cssText = `border: 1px solid var(--card-border); padding: 0; text-align: center; background: var(--bg-color); font-weight: bold; color: var(--text-color); min-width: ${savedWidth}; max-width: ${savedWidth}; width: ${savedWidth}; cursor: ${currentUser ? 'grab' : 'default'};`;
            th.draggable = !!currentUser;
            th.dataset.cIdx = cIdx;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position: relative; width: 100%; height: 100%; padding: 12px; box-sizing: border-box;';

            const content = document.createElement('div');
            content.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px;';
            content.innerHTML = `
                    <span style="display: flex; align-items: center; gap: 4px;">
                        ${currentUser ? '<i class="fa-solid fa-grip-vertical" style="color: var(--text-muted); opacity: 0.5;"></i>' : ''} ${colName}
                    </span>
                    ${isMaster ? `<div style="display:flex;gap:4px;"><button class="btn-edit-col" data-idx="${cIdx}" style="background: none; border: none; color: #4a69bd; cursor: pointer; padding: 2px 5px;" title="이름 수정"><i class="fa-solid fa-pen"></i></button><button class="btn-del-col" data-idx="${cIdx}" style="background: none; border: none; color: #ff4757; cursor: pointer; padding: 2px 5px;" title="삭제"><i class="fa-solid fa-times"></i></button></div>` : ''}
                `;
            wrapper.appendChild(content);

            if (isMaster) {
                const resizer = document.createElement('div');
                resizer.style.cssText = 'position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 10; background: transparent;';
                resizer.addEventListener('mouseenter', () => { if (!resizingCol) resizer.style.background = 'var(--primary-color)'; });
                resizer.addEventListener('mouseleave', () => { if (!resizingCol) resizer.style.background = 'transparent'; });
                resizer.addEventListener('mousedown', (e) => {
                    e.stopPropagation(); e.preventDefault();
                    resizingCol = { th: th, cIdx: cIdx, resizer: resizer };
                    startPos = e.pageX;
                    startSize = th.offsetWidth;
                    document.body.style.cursor = 'col-resize';
                    resizer.style.background = 'var(--primary-color)';
                });
                wrapper.appendChild(resizer);
            }

            th.appendChild(wrapper);

            th.addEventListener('dragstart', function (e) {
                if (isEditing) { e.preventDefault(); return; }
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `col_${this.dataset.cIdx}`);
                this.style.opacity = '0.4';
            });
            th.addEventListener('dragover', function (e) {
                if (e.preventDefault) { e.preventDefault(); }
                e.dataTransfer.dropEffect = 'move';
                return false;
            });
            th.addEventListener('dragenter', function (e) {
                this.style.borderLeft = '2px dashed var(--primary-color)';
            });
            th.addEventListener('dragleave', function (e) {
                this.style.borderLeft = '';
            });
            th.addEventListener('drop', function (e) {
                if (e.stopPropagation) { e.stopPropagation(); }
                this.style.borderLeft = '';

                const dragData = e.dataTransfer.getData('text/plain');
                if (!dragData.startsWith('col_')) return;

                const fromIdx = parseInt(dragData.substring(4));
                const toIdx = parseInt(this.dataset.cIdx);

                if (fromIdx !== toIdx && !isNaN(fromIdx) && !isNaN(toIdx)) {
                    const colCount = matrixData.cols.length;

                    // 새 cells 구성
                    const oldIdxs = [];
                    for (let i = 0; i < colCount; i++) {
                        if (i === toIdx) {
                            oldIdxs.push(fromIdx);
                        } else {
                            let old = i;
                            if (fromIdx < toIdx) {
                                if (i >= fromIdx && i < toIdx) {
                                    old = i + 1;
                                }
                            } else {
                                if (i > toIdx && i <= fromIdx) {
                                    old = i - 1;
                                }
                            }
                            oldIdxs.push(old);
                        }
                    }

                    const newCells = {};
                    matrixData.rows.forEach((_, r) => {
                        for (let c = 0; c < colCount; c++) {
                            const oldC = oldIdxs[c];
                            newCells[`${r}_${c}`] = matrixData.cells[`${r}_${oldC}`] || '';
                        }
                    });

                    const movedCol = matrixData.cols.splice(fromIdx, 1)[0];
                    matrixData.cols.splice(toIdx, 0, movedCol);

                    matrixData.cells = newCells;
                    renderMatrix();
                    saveMatrixToDB();
                }
            });
            th.addEventListener('dragend', function (e) {
                this.style.opacity = '1';
            });

            theadTr.appendChild(th);
        });

        // 바디 렌더링
        tbody.innerHTML = '';
        matrixData.rows.forEach((rowName, rIdx) => {
            const tr = document.createElement('tr');
            tr.draggable = !!currentUser;
            tr.dataset.rIdx = rIdx;

            tr.addEventListener('dragstart', function (e) {
                if (isEditing) { e.preventDefault(); return; }
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', this.dataset.rIdx);
                this.style.opacity = '0.4';
            });
            tr.addEventListener('dragover', function (e) {
                if (e.preventDefault) { e.preventDefault(); }
                e.dataTransfer.dropEffect = 'move';
                return false;
            });
            tr.addEventListener('dragenter', function (e) {
                this.style.borderTop = '2px dashed var(--primary-color)';
            });
            tr.addEventListener('dragleave', function (e) {
                this.style.borderTop = '';
            });
            tr.addEventListener('drop', function (e) {
                if (e.stopPropagation) { e.stopPropagation(); }
                this.style.borderTop = '';

                const dragData = e.dataTransfer.getData('text/plain');
                if (dragData.startsWith('col_')) return; // ignore column drag here

                const fromIdx = parseInt(dragData);
                const toIdx = parseInt(this.dataset.rIdx);
                if (fromIdx !== toIdx && !isNaN(fromIdx) && !isNaN(toIdx)) {
                    const oldOrder = matrixData.rows.map((_, i) => i);
                    const movedItem = oldOrder.splice(fromIdx, 1)[0];
                    oldOrder.splice(toIdx, 0, movedItem);

                    const movedRowName = matrixData.rows.splice(fromIdx, 1)[0];
                    matrixData.rows.splice(toIdx, 0, movedRowName);

                    const newCells = {};
                    for (let r = 0; r < oldOrder.length; r++) {
                        const oldR = oldOrder[r];
                        for (let c = 0; c < matrixData.cols.length; c++) {
                            newCells[`${r}_${c}`] = matrixData.cells[`${oldR}_${c}`] || '';
                        }
                    }
                    matrixData.cells = newCells;
                    renderMatrix();
                    saveMatrixToDB();
                }
                return false;
            });
            tr.addEventListener('dragend', function (e) {
                this.style.opacity = '1';
            });

            // 첫 번째 열 (항목 이름)
            const savedRowHeight = matrixData.rowHeights && matrixData.rowHeights[rIdx] ? `${matrixData.rowHeights[rIdx]}px` : '60px';
            const th = document.createElement('td');
            th.style.cssText = `border: 1px solid var(--card-border); padding: 0; background: var(--card-bg); color: var(--text-color); font-weight: bold; position: sticky; left: 0; z-index: 1; width: 1%; white-space: nowrap; height: ${savedRowHeight}; ${currentUser ? 'cursor: grab;' : ''}`;
            tr.style.height = savedRowHeight;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position: relative; width: 100%; height: 100%; padding: 12px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center;';

            wrapper.innerHTML = `
                    <span style="display: flex; align-items: center; gap: 8px;">${currentUser ? '<i class="fa-solid fa-grip-vertical" style="color: var(--text-muted); opacity: 0.5;"></i>' : ''} ${rowName}</span>
                    ${isMaster ? `<div style="display:flex;gap:4px;"><button class="btn-edit-row" data-idx="${rIdx}" style="background: none; border: none; color: #4a69bd; cursor: pointer; padding: 2px 5px;" title="이름 수정"><i class="fa-solid fa-pen"></i></button><button class="btn-del-row" data-idx="${rIdx}" style="background: none; border: none; color: #ff4757; cursor: pointer; padding: 2px 5px;" title="삭제"><i class="fa-solid fa-times"></i></button></div>` : ''}
                `;

            if (isMaster) {
                const rowResizer = document.createElement('div');
                rowResizer.style.cssText = 'position: absolute; bottom: 0; left: 0; width: 100%; height: 6px; cursor: row-resize; z-index: 10; background: transparent;';
                rowResizer.addEventListener('mouseenter', () => { if (!resizingRow) rowResizer.style.background = 'var(--primary-color)'; });
                rowResizer.addEventListener('mouseleave', () => { if (!resizingRow) rowResizer.style.background = 'transparent'; });
                rowResizer.addEventListener('mousedown', (e) => {
                    e.stopPropagation(); e.preventDefault();
                    resizingRow = { td: th, rIdx: rIdx, resizer: rowResizer };
                    startPos = e.pageY;
                    startSize = th.offsetHeight;
                    document.body.style.cursor = 'row-resize';
                    rowResizer.style.background = 'var(--primary-color)';
                });
                wrapper.appendChild(rowResizer);
            }
            th.appendChild(wrapper);
            tr.appendChild(th);

            // 나머지 열 (팀원별 셀)
            matrixData.cols.forEach((_, cIdx) => {
                const td = document.createElement('td');
                td.style.cssText = 'border: 1px solid var(--card-border); padding: 0; background: var(--card-bg); vertical-align: top; height: 1px;';

                const cellKey = `${rIdx}_${cIdx}`;
                const val = matrixData.cells[cellKey] || '';

                const cellWrapper = document.createElement('div');
                cellWrapper.style.cssText = 'position: relative; width: 100%; height: 100%; min-width: 100px; min-height: 60px;';

                cellWrapper.innerHTML = `<textarea class="matrix-cell-input" wrap="off" data-key="${cellKey}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; padding: 10px; resize: none; outline: none; background: transparent; color: var(--text-color); font-family: inherit; font-size: 0.9rem; overflow: auto; box-sizing: border-box;" ${isMaster ? '' : 'readonly'}>${val}</textarea>`;

                if (isMaster) {
                    // 열 리사이저 (우측 가장자리)
                    const colResizer = document.createElement('div');
                    colResizer.style.cssText = 'position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 10; background: transparent;';
                    colResizer.addEventListener('mouseenter', () => { if (!resizingCol) colResizer.style.background = 'var(--primary-color)'; });
                    colResizer.addEventListener('mouseleave', () => { if (!resizingCol) colResizer.style.background = 'transparent'; });
                    colResizer.addEventListener('mousedown', (e) => {
                        e.stopPropagation(); e.preventDefault();
                        const th = document.querySelector(`#perf-matrix-header th[data-c-idx="${cIdx}"]`);
                        resizingCol = { th: th, cIdx: cIdx, resizer: colResizer };
                        startPos = e.pageX;
                        startSize = th.offsetHeight; // we only need startPos and width/height for calc
                        // Wait, th.offsetWidth! 
                        startSize = th ? th.offsetWidth : td.offsetWidth;
                        document.body.style.cursor = 'col-resize';
                        colResizer.style.background = 'var(--primary-color)';
                    });
                    cellWrapper.appendChild(colResizer);

                    // 행 리사이저 (하단 가장자리)
                    const rowResizer = document.createElement('div');
                    rowResizer.style.cssText = 'position: absolute; bottom: 0; left: 0; width: 100%; height: 6px; cursor: row-resize; z-index: 10; background: transparent;';
                    rowResizer.addEventListener('mouseenter', () => { if (!resizingRow) rowResizer.style.background = 'var(--primary-color)'; });
                    rowResizer.addEventListener('mouseleave', () => { if (!resizingRow) rowResizer.style.background = 'transparent'; });
                    rowResizer.addEventListener('mousedown', (e) => {
                        e.stopPropagation(); e.preventDefault();
                        const rowTh = tr.querySelector('td:first-child');
                        resizingRow = { td: rowTh, rIdx: rIdx, resizer: rowResizer };
                        startPos = e.pageY;
                        startSize = rowTh ? rowTh.offsetHeight : td.offsetHeight;
                        document.body.style.cursor = 'row-resize';
                        rowResizer.style.background = 'var(--primary-color)';
                    });
                    cellWrapper.appendChild(rowResizer);
                }
                td.appendChild(cellWrapper);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        // 엠프티 스테이트 처리
        if (matrixData.rows.length === 0 && matrixData.cols.length === 0) {
            if (table) table.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
        } else {
            if (table) table.style.display = 'table';
            if (emptyState) emptyState.style.display = 'none';
        }

        bindEvents();
    }

    function bindEvents() {
        // 셀 입력 시 포커스 방해 금지 및 데이터 업데이트
        document.querySelectorAll('.matrix-cell-input').forEach(input => {
            input.addEventListener('focus', () => isEditing = true);
            input.addEventListener('blur', () => {
                isEditing = false;
                saveMatrixToDB(); // 자동 저장 기능
            });
            input.addEventListener('input', (e) => {
                const key = e.target.dataset.key;
                matrixData.cells[key] = e.target.value;
            });
        });

        // 행 삭제
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!confirm('이 평가 항목을 삭제하시겠습니까?')) return;
                const rIdx = parseInt(e.currentTarget.dataset.idx);
                matrixData.rows.splice(rIdx, 1);
                const newCells = {};
                for (let r = 0; r < matrixData.rows.length; r++) {
                    for (let c = 0; c < matrixData.cols.length; c++) {
                        let oldR = r >= rIdx ? r + 1 : r;
                        newCells[`${r}_${c}`] = matrixData.cells[`${oldR}_${c}`] || '';
                    }
                }
                matrixData.cells = newCells;
                renderMatrix();
                saveMatrixToDB();
            });
        });

        // 열 삭제
        document.querySelectorAll('.btn-del-col').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!confirm('이 팀원을 평가 대상에서 제외하시겠습니까?')) return;
                const cIdx = parseInt(e.currentTarget.dataset.idx);
                matrixData.cols.splice(cIdx, 1);
                const newCells = {};
                for (let r = 0; r < matrixData.rows.length; r++) {
                    for (let c = 0; c < matrixData.cols.length; c++) {
                        let oldC = c >= cIdx ? c + 1 : c;
                        newCells[`${r}_${c}`] = matrixData.cells[`${r}_${oldC}`] || '';
                    }
                }
                matrixData.cells = newCells;
                renderMatrix();
                saveMatrixToDB();
            });
        });

        // 열 이름 편집
        document.querySelectorAll('.btn-edit-col').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cIdx = parseInt(e.currentTarget.dataset.idx);
                const oldName = matrixData.cols[cIdx];
                const newName = prompt('팀원 이름을 수정하세요:', oldName);
                if (newName !== null && newName.trim() !== '') {
                    matrixData.cols[cIdx] = newName.trim();
                    saveMatrixToDB();
                    renderMatrix();
                }
            });
        });

        // 행 이름 편집
        document.querySelectorAll('.btn-edit-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rIdx = parseInt(e.currentTarget.dataset.idx);
                const oldName = matrixData.rows[rIdx];
                const newName = prompt('평가 항목 이름을 수정하세요:', oldName);
                if (newName !== null && newName.trim() !== '') {
                    matrixData.rows[rIdx] = newName.trim();
                    saveMatrixToDB();
                    renderMatrix();
                }
            });
        });
    }

    async function saveMatrixToDB() {
        if (!currentUser) return; // auth.currentUser 대신 전역 변수 currentUser 사용
        try {
            await db.collection('workEvaluations').doc('shared').set(matrixData);
        } catch (e) {
            console.error("Matrix save error:", e);
        }
    }

    btnAddRow?.addEventListener('click', () => {
        if (!currentUserDoc || currentUserDoc.isMaster !== true) return alert('마스터 권한이 필요합니다.');
        const name = prompt('추가할 평가 항목의 이름을 입력하세요 (예: 업무 완성도, 책임감 등)');
        if (name && name.trim()) {
            matrixData.rows.push(name.trim());
            renderMatrix();
            saveMatrixToDB();
        }
    });

    btnAddCol?.addEventListener('click', () => {
        if (!currentUserDoc || currentUserDoc.isMaster !== true) return alert('마스터 권한이 필요합니다.');
        const name = prompt('평가할 팀원의 이름을 입력하세요 (예: 홍길동)');
        if (name && name.trim()) {
            matrixData.cols.push(name.trim());
            renderMatrix();
            saveMatrixToDB();
        }
    });

    btnSave?.addEventListener('click', async () => {
        if (!currentUser) return alert('로그인이 필요합니다.');
        if (!currentUserDoc || currentUserDoc.isMaster !== true) return alert('마스터 권한이 필요합니다.');

        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장중';

        await saveMatrixToDB();

        setTimeout(() => {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="fa-solid fa-save"></i> 저장';
            alert('평가 내용이 성공적으로 저장되었습니다!');
        }, 500);
    });

    auth.onAuthStateChanged(user => {
        if (user) {
            if (unsubscribePerf) unsubscribePerf();

            unsubscribePerf = db.collection('workEvaluations').doc('shared').onSnapshot(doc => {
                if (!isEditing) {
                    if (doc.exists) {
                        const data = doc.data();
                        matrixData.rows = data.rows || [];
                        matrixData.cols = data.cols || [];
                        matrixData.cells = data.cells || {};
                        matrixData.colWidths = data.colWidths || {};
                        matrixData.rowHeights = data.rowHeights || {};
                    } else {
                        matrixData = { rows: [], cols: [], cells: {}, colWidths: {}, rowHeights: {} };
                    }
                    renderMatrix();
                }
            });
        } else {
            if (unsubscribePerf) {
                unsubscribePerf();
                unsubscribePerf = null;
            }
            matrixData = { rows: [], cols: [], cells: {}, colWidths: {}, rowHeights: {} };
            renderMatrix();
        }
    });

    window.renderPerformances = renderMatrix;
}
initPerformanceLogic();

// --- 10. Idea Board Logic ---
function initIdeasLogic() {
    const btnAddIdea = document.getElementById('btn-add-idea');
    const ideaModal = document.getElementById('idea-write-modal');
    const closeIdeaModal = document.getElementById('close-idea-write');
    const btnSubmitIdea = document.getElementById('btn-submit-idea');
    const ideaTitle = document.getElementById('idea-title');
    const ideaContent = document.getElementById('idea-content');

    const imageInput = document.getElementById('idea-image-input');
    const btnSelectImage = document.getElementById('btn-select-idea-image');
    const imagePreviewContainer = document.getElementById('idea-image-preview-container');
    const imagePreview = document.getElementById('idea-image-preview');
    const btnRemoveImage = document.getElementById('btn-remove-idea-image');

    const ideasGrid = document.getElementById('ideas-grid');

    let currentImageBase64 = null;
    let ideasUnsubscribe = null;

    // 모달 열기/닫기
    btnAddIdea?.addEventListener('click', () => {
        if (!currentUser) {
            loginRequiredModal.classList.remove('hidden');
            return;
        }
        if (typeof closeAllWriteModals === 'function') closeAllWriteModals();
        ideaModal?.classList.remove('hidden');
    });

    closeIdeaModal?.addEventListener('click', () => {
        ideaModal?.classList.add('hidden');
        resetIdeaForm();
    });

    // 폼 초기화
    function resetIdeaForm() {
        if (ideaTitle) ideaTitle.value = '';
        if (ideaContent) ideaContent.value = '';
        if (imageInput) imageInput.value = '';
        currentImageBase64 = null;
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '';
        if (btnSelectImage) btnSelectImage.style.display = 'flex';
    }

    // 이미지 첨부 버튼 클릭
    btnSelectImage?.addEventListener('click', () => {
        imageInput?.click();
    });

    // 이미지 삭제 버튼
    btnRemoveImage?.addEventListener('click', () => {
        if (imageInput) imageInput.value = '';
        currentImageBase64 = null;
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '';
        if (btnSelectImage) btnSelectImage.style.display = 'flex';
    });

    // 이미지 파일 선택 시 압축 (Canvas 이용)
    imageInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 첨부할 수 있습니다.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 800; // 최대 폭/높이 800px로 제한

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // JPEG 70% 품질로 압축 (용량 획기적 감소)
                currentImageBase64 = canvas.toDataURL('image/jpeg', 0.7);

                // 미리보기 표시
                if (imagePreview) imagePreview.src = currentImageBase64;
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
                if (btnSelectImage) btnSelectImage.style.display = 'none';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // 아이디어 등록 및 수정
    btnSubmitIdea?.addEventListener('click', async () => {
        const title = ideaTitle?.value.trim();
        const content = ideaContent?.value.trim();

        if (!title) return alert('아이디어 제목을 입력해주세요!');

        btnSubmitIdea.disabled = true;
        btnSubmitIdea.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

        const authorId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
        const authorName = auth.currentUser
            ? ((currentUserDoc && currentUserDoc.nickname) ? currentUserDoc.nickname : (auth.currentUser.displayName || '익명'))
            : '익명';

        try {
            const editId = ideaModal?.getAttribute('data-edit-id');
            if (editId) {
                await db.collection('workIdeas').doc(editId).update({
                    title: title,
                    content: content,
                    image: currentImageBase64
                });
            } else {
                await db.collection('workIdeas').add({
                    title: title,
                    content: content,
                    image: currentImageBase64,
                    authorId: authorId,
                    authorName: authorName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            ideaModal?.classList.add('hidden');
            ideaModal?.removeAttribute('data-edit-id');
            resetIdeaForm();
        } catch (error) {
            console.error('Idea save error:', error);
            alert('아이디어 저장 실패: ' + error.message);
        } finally {
            btnSubmitIdea.disabled = false;
            btnSubmitIdea.innerHTML = '저장 완료 🚀';
        }
    });

    // 아이디어 실시간 목록 렌더링
    function subscribeIdeas() {
        if (ideasUnsubscribe) {
            ideasUnsubscribe();
            ideasUnsubscribe = null;
        }
        if (!currentUser || !currentUserDoc || !currentUserDoc.isApproved) {
            return;
        }

        ideasUnsubscribe = db.collection('workIdeas')
            .orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                if (!ideasGrid) return;
                ideasGrid.innerHTML = '';

                if (snapshot.empty) {
                    ideasGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 50px; color: #888;">아직 등록된 아이디어가 없습니다. 첫 번째 아이디어를 올려보세요!</div>';
                    return;
                }

                snapshot.forEach(doc => {
                    const data = doc.data();
                    const card = document.createElement('div');
                    card.style.cssText = 'background: #fff; border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); transition: transform 0.2s ease, box-shadow 0.2s ease;';
                    card.onmouseover = () => { card.style.transform = 'translateY(-5px)'; card.style.boxShadow = '0 8px 15px rgba(0,0,0,0.1)'; };
                    card.onmouseout = () => { card.style.transform = 'none'; card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)'; };

                    let imgHtml = '';
                    if (data.image) {
                        imgHtml = `<img src="${data.image}" style="width: 100%; height: 200px; object-fit: cover; border-bottom: 1px solid #eee;">`;
                    } else {
                        imgHtml = `<div style="width: 100%; height: 120px; background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%); display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #eee;"><i class="fa-solid fa-lightbulb" style="font-size: 3rem; color: #e2e8f0;"></i></div>`;
                    }

                    const date = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString('ko-KR') : '방금 전';

                    let editBtnHtml = '';
                    let deleteBtnHtml = '';
                    if (auth.currentUser && (auth.currentUser.uid === data.authorId || (currentUserDoc && currentUserDoc.isMaster === true))) {
                        if (auth.currentUser.uid === data.authorId) {
                            editBtnHtml = `<button class="btn-edit-idea" data-id="${doc.id}" style="background: none; border: none; color: var(--primary-color); cursor: pointer; padding: 5px;" title="수정"><i class="fa-solid fa-pen"></i></button>`;
                        }
                        deleteBtnHtml = `<button class="btn-delete-idea" data-id="${doc.id}" style="background: none; border: none; color: #ff4757; cursor: pointer; padding: 5px;" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
                    }

                    card.innerHTML = `
                            ${imgHtml}
                            <div style="padding: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: bold; color: var(--text-color); line-height: 1.3;">${data.title}</h3>
                                    <div style="display: flex; gap: 5px;">
                                        ${editBtnHtml}
                                        ${deleteBtnHtml}
                                    </div>
                                </div>
                                ${data.content ? `<p style="margin: 0 0 15px 0; font-size: 0.9rem; color: #555; white-space: pre-wrap; word-break: break-all; max-height: 80px; overflow-y: auto;">${data.content}</p>` : ''}
                                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f0f0f0; padding-top: 10px;">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: bold;">
                                            ${(data.authorName || '?').charAt(0)}
                                        </div>
                                        <span style="font-size: 0.8rem; color: #666; font-weight: 500;">${data.authorName}</span>
                                    </div>
                                    <span style="font-size: 0.75rem; color: #999;">${date}</span>
                                </div>
                            </div>
                        `;
                    card.style.cursor = 'pointer';
                    card.addEventListener('click', () => {
                        showPostDetail(data, '아이디어');
                    });
                    ideasGrid.appendChild(card);
                });

                // 수정 버튼 이벤트 바인딩
                document.querySelectorAll('.btn-edit-idea').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const docId = btn.dataset.id;
                        db.collection('workIdeas').doc(docId).get().then(doc => {
                            if (doc.exists) {
                                const d = doc.data();
                                resetIdeaForm();
                                ideaModal?.setAttribute('data-edit-id', docId);

                                const modalTitle = ideaModal?.querySelector('.modal-title') || ideaModal?.querySelector('h2');
                                if (modalTitle) modalTitle.innerText = '💡 아이디어 수정';
                                if (btnSubmitIdea) btnSubmitIdea.innerHTML = '수정 완료 🚀';

                                if (ideaTitle) ideaTitle.value = d.title || '';
                                if (ideaContent) ideaContent.value = d.content || '';
                                if (d.image) {
                                    currentImageBase64 = d.image;
                                    if (imagePreview) imagePreview.src = d.image;
                                    if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
                                    if (btnSelectImage) btnSelectImage.style.display = 'none';
                                }

                                if (typeof closeAllWriteModals === 'function') closeAllWriteModals();
                                ideaModal?.classList.remove('hidden');
                            }
                        });
                    });
                });

                // 삭제 버튼 이벤트 바인딩
                document.querySelectorAll('.btn-delete-idea').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm('이 아이디어를 삭제하시겠습니까?')) {
                            try {
                                await db.collection('workIdeas').doc(btn.dataset.id).delete();
                            } catch (err) {
                                alert('삭제 실패: ' + err.message);
                            }
                        }
                    });
                });
            }, error => {
                console.error("Error fetching ideas:", error);
            });
    }
    window.subscribeIdeas = subscribeIdeas;
    window.unsubscribeIdeas = function () {
        if (ideasUnsubscribe) {
            ideasUnsubscribe();
            ideasUnsubscribe = null;
        }
    };

    // 구독은 renderRestrictedContent()에서 관리
}
initIdeasLogic();

// --- 11. Info Board Logic ---
function initInfoLogic() {
    const btnAddInfo = document.getElementById('btn-add-info');
    const infoModal = document.getElementById('info-write-modal');
    const closeInfoModal = document.getElementById('close-info-write');
    const btnSubmitInfo = document.getElementById('btn-submit-info');
    const infoTitle = document.getElementById('info-title');
    const infoContent = document.getElementById('info-content');

    const imageInput = document.getElementById('info-image-input');
    const btnSelectImage = document.getElementById('btn-select-info-image');
    const imagePreviewContainer = document.getElementById('info-image-preview-container');
    const imagePreview = document.getElementById('info-image-preview');
    const btnRemoveImage = document.getElementById('btn-remove-info-image');

    const infoGrid = document.getElementById('info-grid');

    let currentImageBase64 = null;
    let infoUnsubscribe = null;

    btnAddInfo?.addEventListener('click', () => {
        if (!currentUser) {
            loginRequiredModal.classList.remove('hidden');
            return;
        }
        if (typeof closeAllWriteModals === 'function') closeAllWriteModals();
        resetInfoForm();
        infoModal?.classList.remove('hidden');
    });

    closeInfoModal?.addEventListener('click', () => {
        infoModal?.classList.add('hidden');
        resetInfoForm();
    });

    function resetInfoForm() {
        if (infoTitle) infoTitle.value = '';
        if (infoContent) infoContent.value = '';
        if (imageInput) imageInput.value = '';
        currentImageBase64 = null;
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '';
        if (btnSelectImage) btnSelectImage.style.display = 'flex';

        infoModal?.removeAttribute('data-edit-id');
        const modalTitle = infoModal?.querySelector('.modal-title') || infoModal?.querySelector('h2');
        if (modalTitle) modalTitle.innerText = '📰 정보마당 글쓰기';
        if (btnSubmitInfo) {
            btnSubmitInfo.innerHTML = '등록하기 🚀';
            btnSubmitInfo.disabled = false;
        }
    }

    btnSelectImage?.addEventListener('click', () => {
        imageInput?.click();
    });

    btnRemoveImage?.addEventListener('click', () => {
        if (imageInput) imageInput.value = '';
        currentImageBase64 = null;
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '';
        if (btnSelectImage) btnSelectImage.style.display = 'flex';
    });

    imageInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 첨부할 수 있습니다.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 800;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                currentImageBase64 = canvas.toDataURL('image/jpeg', 0.7);

                if (imagePreview) imagePreview.src = currentImageBase64;
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
                if (btnSelectImage) btnSelectImage.style.display = 'none';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    btnSubmitInfo?.addEventListener('click', async () => {
        const title = infoTitle?.value.trim();
        const content = infoContent?.value.trim();

        if (!title) return alert('정보 제목을 입력해주세요!');

        btnSubmitInfo.disabled = true;
        btnSubmitInfo.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

        const authorId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
        const authorName = auth.currentUser
            ? ((currentUserDoc && currentUserDoc.nickname) ? currentUserDoc.nickname : (auth.currentUser.displayName || '익명'))
            : '익명';

        try {
            const editId = infoModal?.getAttribute('data-edit-id');
            if (editId) {
                await db.collection('workInfo').doc(editId).update({
                    title: title,
                    content: content,
                    image: currentImageBase64
                });
            } else {
                await db.collection('workInfo').add({
                    title: title,
                    content: content,
                    image: currentImageBase64,
                    authorId: authorId,
                    authorName: authorName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            infoModal?.classList.add('hidden');
            infoModal?.removeAttribute('data-edit-id');
            resetInfoForm();
        } catch (error) {
            console.error('Info save error:', error);
            alert('정보 저장 실패: ' + error.message);
        } finally {
            btnSubmitInfo.disabled = false;
            btnSubmitInfo.innerHTML = '저장 완료 🚀';
        }
    });

    let currentInfoPage = 1;
    const INFO_ITEMS_PER_PAGE = 10;
    let allInfoDocs = [];

    function renderInfoBoard() {
        const tbody = document.getElementById('info-board-tbody');
        const pagination = document.getElementById('info-pagination');
        const totalCountSpan = document.getElementById('info-total-count');

        if (!tbody || !pagination) return;
        tbody.innerHTML = '';

        if (totalCountSpan) totalCountSpan.innerText = `전체보기 ${allInfoDocs.length}개의 글`;

        if (allInfoDocs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 50px; color: #888;">등록된 정보가 없습니다. 첫 글을 남겨보세요!</td></tr>';
            pagination.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(allInfoDocs.length / INFO_ITEMS_PER_PAGE);
        if (currentInfoPage > totalPages) currentInfoPage = totalPages;
        if (currentInfoPage < 1) currentInfoPage = 1;

        const startIndex = (currentInfoPage - 1) * INFO_ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + INFO_ITEMS_PER_PAGE, allInfoDocs.length);

        const pageDocs = allInfoDocs.slice(startIndex, endIndex);
        const nowTime = Date.now();

        pageDocs.forEach(item => {
            const data = item.data;
            const docId = item.id;

            const tr = document.createElement('tr');

            // N 마크 계산 (3일 이내)
            const docTime = data.createdAt ? data.createdAt.toMillis() : Date.now();
            const isNew = (nowTime - docTime) < (3 * 24 * 60 * 60 * 1000);
            const newBadgeHtml = isNew ? '<span class="board-title-new">N</span>' : '';

            // 날짜 포맷
            const dateObj = new Date(docTime);
            const dateStr = `${dateObj.getFullYear()}. ${dateObj.getMonth() + 1}. ${dateObj.getDate()}.`;

            const views = data.views || 0;

            tr.innerHTML = `
                    <td class="col-title"><span class="board-title-text">${data.title}</span>${newBadgeHtml}</td>
                    <td class="col-author">${data.authorName || '익명'}</td>
                    <td class="col-views">${views}</td>
                    <td class="col-date">${dateStr}</td>
                `;

            tr.addEventListener('click', () => {
                showInfoDetailBoard(docId, data);
            });

            tbody.appendChild(tr);
        });

        renderInfoPagination(totalPages);
    }

    function renderInfoPagination(totalPages) {
        const pagination = document.getElementById('info-pagination');
        pagination.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `board-page-btn ${i === currentInfoPage ? 'active' : ''}`;
            btn.innerText = i;
            btn.addEventListener('click', () => {
                currentInfoPage = i;
                renderInfoBoard();
            });
            pagination.appendChild(btn);
        }
    }

    async function showInfoDetailBoard(docId, data) {
        const boardContainer = document.getElementById('info-board-container');
        const detailContainer = document.getElementById('info-detail-container');

        if (!boardContainer || !detailContainer) return;

        if (auth.currentUser && auth.currentUser.uid !== data.authorId) {
            try {
                await db.collection('workInfo').doc(docId).update({
                    views: firebase.firestore.FieldValue.increment(1)
                });
            } catch (e) { }
        }

        boardContainer.style.display = 'none';
        detailContainer.style.display = 'block';

        const docTime = data.createdAt ? data.createdAt.toMillis() : Date.now();
        const dateObj = new Date(docTime);
        const dateStr = `${dateObj.getFullYear()}. ${dateObj.getMonth() + 1}. ${dateObj.getDate()}. ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

        const firstChar = (data.authorName || '?').charAt(0);
        const contentHtml = (data.content || '').replace(/\n/g, '<br>');
        const imageHtml = data.image ? `<img src="${data.image}" alt="첨부 이미지">` : '';

        let editDeleteHtml = '';
        if (auth.currentUser && (auth.currentUser.uid === data.authorId || (currentUserDoc && currentUserDoc.isMaster === true))) {
            editDeleteHtml = `
                    <div style="display:flex; gap: 10px; align-items:center;">
                        <button id="btn-info-detail-edit" data-id="${docId}" style="background:none; border:none; color:#4a69bd; cursor:pointer; font-size:0.95rem; font-weight:600;"><i class="fa-solid fa-pen"></i> 수정</button>
                        <button id="btn-info-detail-delete" data-id="${docId}" style="background:none; border:none; color:#e55039; cursor:pointer; font-size:0.95rem; font-weight:600;"><i class="fa-solid fa-trash-can"></i> 삭제</button>
                    </div>
                `;
        }

        detailContainer.innerHTML = `
                <div class="blog-detail-wrapper">
                    <div class="blog-detail-category">정보마당</div>
                    <div class="blog-detail-title">${data.title}</div>
                    
                    <div class="blog-detail-meta">
                        <div class="blog-meta-left">
                            <div class="blog-author-avatar">${firstChar}</div>
                            <div class="blog-meta-info">
                                <div class="blog-author-name">${data.authorName || '익명'}</div>
                                <div class="blog-post-date">${dateStr}</div>
                            </div>
                        </div>
                        <div class="blog-meta-right">
                            <div style="display:flex; align-items:center; gap:5px;"><i class="fa-regular fa-eye"></i> ${(data.views || 0) + (auth.currentUser && auth.currentUser.uid !== data.authorId ? 1 : 0)}</div>
                        </div>
                    </div>
                    
                    <div class="blog-content-body">
                        ${contentHtml}
                        ${imageHtml}
                    </div>
                    
                    <div class="blog-actions">
                        ${editDeleteHtml}
                        <button class="btn-blog-back" id="btn-info-back-list"><i class="fa-solid fa-list"></i> 목록으로</button>
                    </div>
                </div>
            `;

        document.getElementById('btn-info-back-list')?.addEventListener('click', () => {
            detailContainer.style.display = 'none';
            detailContainer.innerHTML = '';
            boardContainer.style.display = 'block';
        });

        document.getElementById('btn-info-detail-edit')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const id = btn.dataset.id;
            db.collection('workInfo').doc(id).get().then(doc => {
                if (doc.exists) {
                    const d = doc.data();
                    const infoTitle = document.getElementById('info-title');
                    const infoContent = document.getElementById('info-content');
                    if (infoTitle) infoTitle.value = d.title || '';
                    if (infoContent) infoContent.value = d.content || '';
                    if (d.image) {
                        currentImageBase64 = d.image;
                        const imagePreview = document.getElementById('info-image-preview');
                        if (imagePreview) imagePreview.src = d.image;
                        const imagePreviewContainer = document.getElementById('info-image-preview-container');
                        if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
                        const btnSelectImage = document.getElementById('btn-select-info-image');
                        if (btnSelectImage) btnSelectImage.style.display = 'none';
                    }
                    const infoModal = document.getElementById('info-write-modal');
                    infoModal?.setAttribute('data-edit-id', id);
                    const modalTitle = infoModal?.querySelector('.modal-title') || infoModal?.querySelector('h2');
                    if (modalTitle) modalTitle.innerText = '📰 정보 수정';
                    const btnSubmitInfo = document.getElementById('btn-submit-info');
                    if (btnSubmitInfo) btnSubmitInfo.innerHTML = '수정 완료 🚀';
                    if (typeof closeAllWriteModals === 'function') closeAllWriteModals();
                    infoModal?.classList.remove('hidden');
                }
            });
        });

        document.getElementById('btn-info-detail-delete')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const id = btn.dataset.id;
            if (confirm('이 정보를 삭제하시겠습니까?')) {
                try {
                    await db.collection('workInfo').doc(id).delete();
                    detailContainer.style.display = 'none';
                    detailContainer.innerHTML = '';
                    boardContainer.style.display = 'block';
                } catch (err) { alert('삭제 실패: ' + err.message); }
            }
        });
    }

    function subscribeInfo() {
        if (infoUnsubscribe) {
            infoUnsubscribe();
            infoUnsubscribe = null;
        }
        if (!currentUser || !currentUserDoc || !currentUserDoc.isApproved) {
            return;
        }

        infoUnsubscribe = db.collection('workInfo')
            .onSnapshot(snapshot => {
                let validDocs = [];
                snapshot.forEach(doc => {
                    validDocs.push({ id: doc.id, data: doc.data() });
                });

                validDocs.sort((a, b) => {
                    const t1 = a.data.createdAt ? (a.data.createdAt.seconds || 0) : Date.now() / 1000;
                    const t2 = b.data.createdAt ? (b.data.createdAt.seconds || 0) : Date.now() / 1000;
                    return t2 - t1;
                });

                allInfoDocs = validDocs;
                renderInfoBoard();

            }, error => {
                console.error("Error fetching info:", error);
            });
    }
    window.subscribeInfo = subscribeInfo;
    window.unsubscribeInfo = function () {
        if (infoUnsubscribe) {
            infoUnsubscribe();
            infoUnsubscribe = null;
        }
    };

    // 구독은 renderRestrictedContent()에서 관리
}
initInfoLogic();

// --- 12. Notices Board Logic ---
function initNoticesLogic() {
    const btnAddNotice = document.getElementById('btn-add-notice');
    const noticeModal = document.getElementById('notice-write-modal');
    const closeNoticeModal = document.getElementById('close-notice-write');
    const btnSubmitNotice = document.getElementById('btn-submit-notice-new');
    const noticeTitle = document.getElementById('notice-title');
    const noticeContent = document.getElementById('notice-content');

    const imageInput = document.getElementById('notice-image-input');
    const btnSelectImage = document.getElementById('btn-select-notice-image');
    const imagePreviewContainer = document.getElementById('notice-image-preview-container');
    const imagePreview = document.getElementById('notice-image-preview');
    const btnRemoveImage = document.getElementById('btn-remove-notice-image');

    const noticeGrid = document.getElementById('notice-grid');

    let currentImageBase64 = null;
    let noticeUnsubscribe = null;

    btnAddNotice?.addEventListener('click', () => {
        if (!currentUser) {
            loginRequiredModal.classList.remove('hidden');
            return;
        }
        if (typeof closeAllWriteModals === 'function') closeAllWriteModals();
        noticeModal?.classList.remove('hidden');
    });

    closeNoticeModal?.addEventListener('click', () => {
        noticeModal?.classList.add('hidden');
        resetNoticeForm();
    });

    function resetNoticeForm() {
        if (noticeTitle) noticeTitle.value = '';
        if (noticeContent) noticeContent.value = '';
        if (imageInput) imageInput.value = '';
        currentImageBase64 = null;
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '';
        if (btnSelectImage) btnSelectImage.style.display = 'flex';
    }

    btnSelectImage?.addEventListener('click', () => {
        imageInput?.click();
    });

    btnRemoveImage?.addEventListener('click', () => {
        if (imageInput) imageInput.value = '';
        currentImageBase64 = null;
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '';
        if (btnSelectImage) btnSelectImage.style.display = 'flex';
    });

    imageInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 첨부할 수 있습니다.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 800;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                currentImageBase64 = canvas.toDataURL('image/jpeg', 0.7);

                if (imagePreview) imagePreview.src = currentImageBase64;
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
                if (btnSelectImage) btnSelectImage.style.display = 'none';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    btnSubmitNotice?.addEventListener('click', async () => {
        const title = noticeTitle?.value.trim();
        const content = noticeContent?.value.trim();

        if (!title) return alert('알림 제목을 입력해주세요!');

        btnSubmitNotice.disabled = true;
        btnSubmitNotice.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

        const authorId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
        const authorName = auth.currentUser
            ? ((currentUserDoc && currentUserDoc.nickname) ? currentUserDoc.nickname : (auth.currentUser.displayName || '익명'))
            : '익명';

        try {
            const editId = noticeModal?.getAttribute('data-edit-id');
            if (editId) {
                await db.collection('workNotices').doc(editId).update({
                    title: title,
                    content: content,
                    image: currentImageBase64
                });
            } else {
                await db.collection('workNotices').add({
                    title: title,
                    content: content,
                    image: currentImageBase64,
                    authorId: authorId,
                    authorName: authorName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            noticeModal?.classList.add('hidden');
            noticeModal?.removeAttribute('data-edit-id');
            resetNoticeForm();
        } catch (error) {
            console.error('Notice save error:', error);
            alert('알림 저장 실패: ' + error.message);
        } finally {
            btnSubmitNotice.disabled = false;
            btnSubmitNotice.innerHTML = '저장 완료 🚀';
        }
    });

    function subscribeNotices() {
        if (noticeUnsubscribe) noticeUnsubscribe();

        noticeUnsubscribe = db.collection('workNotices')
            .onSnapshot(snapshot => {
                if (!noticeGrid) return;
                noticeGrid.innerHTML = '';

                if (snapshot.empty) {
                    noticeGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 50px; color: #888;">아직 등록된 알림이 없습니다. 첫 알림을 올려보세요!</div>';
                    return;
                }

                let validDocs = [];
                snapshot.forEach(doc => {
                    validDocs.push({ id: doc.id, data: doc.data() });
                });

                validDocs.sort((a, b) => {
                    const t1 = a.data.createdAt ? (a.data.createdAt.seconds || 0) : Date.now() / 1000;
                    const t2 = b.data.createdAt ? (b.data.createdAt.seconds || 0) : Date.now() / 1000;
                    return t2 - t1;
                });

                validDocs.forEach(item => {
                    const data = item.data;
                    const docId = item.id;
                    const card = document.createElement('div');
                    card.style.cssText = 'background: #fff; border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); transition: transform 0.2s ease, box-shadow 0.2s ease;';
                    card.onmouseover = () => { card.style.transform = 'translateY(-5px)'; card.style.boxShadow = '0 8px 15px rgba(0,0,0,0.1)'; };
                    card.onmouseout = () => { card.style.transform = 'none'; card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)'; };

                    let imgHtml = '';
                    if (data.image) {
                        imgHtml = `<img src="${data.image}" style="width: 100%; height: 200px; object-fit: cover; border-bottom: 1px solid #eee;">`;
                    } else {
                        imgHtml = `<div style="width: 100%; height: 120px; background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%); display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #eee;"><i class="fa-solid fa-bullhorn" style="font-size: 3rem; color: #e2e8f0;"></i></div>`;
                    }

                    const date = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString('ko-KR') : '방금 전';

                    let editBtnHtml = '';
                    let deleteBtnHtml = '';
                    if (auth.currentUser && (auth.currentUser.uid === data.authorId || (currentUserDoc && currentUserDoc.isMaster === true))) {
                        if (auth.currentUser.uid === data.authorId) {
                            editBtnHtml = `<button class="btn-edit-notice" data-id="${docId}" style="background: none; border: none; color: #e55039; cursor: pointer; padding: 5px;" title="수정"><i class="fa-solid fa-pen"></i></button>`;
                        }
                        deleteBtnHtml = `<button class="btn-delete-notice" data-id="${docId}" style="background: none; border: none; color: #ff4757; cursor: pointer; padding: 5px;" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
                    }

                    card.innerHTML = `
                            ${imgHtml}
                            <div style="padding: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: bold; color: var(--text-color); line-height: 1.3;">${data.title}</h3>
                                    <div style="display: flex; gap: 5px;">
                                        ${editBtnHtml}
                                        ${deleteBtnHtml}
                                    </div>
                                </div>
                                ${data.content ? `<p style="margin: 0 0 15px 0; font-size: 0.9rem; color: #555; white-space: pre-wrap; word-break: break-all; max-height: 80px; overflow-y: auto;">${data.content}</p>` : ''}
                                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f0f0f0; padding-top: 10px;">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <div style="width: 24px; height: 24px; border-radius: 50%; background: #e55039; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: bold;">
                                            ${(data.authorName || '?').charAt(0)}
                                        </div>
                                        <span style="font-size: 0.8rem; color: #666; font-weight: 500;">${data.authorName}</span>
                                    </div>
                                    <span style="font-size: 0.75rem; color: #999;">${date}</span>
                                </div>
                            </div>
                        `;
                    card.style.cursor = 'pointer';
                    card.addEventListener('click', () => {
                        showPostDetail(data, '알림마당');
                    });
                    noticeGrid.appendChild(card);
                });

                document.querySelectorAll('.btn-edit-notice').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const docId = btn.dataset.id;
                        db.collection('workNotices').doc(docId).get().then(doc => {
                            if (doc.exists) {
                                const d = doc.data();
                                resetNoticeForm();
                                noticeModal?.setAttribute('data-edit-id', docId);

                                const modalTitle = noticeModal?.querySelector('.modal-title') || noticeModal?.querySelector('h2');
                                if (modalTitle) modalTitle.innerText = '📢 알림 수정';
                                if (btnSubmitNotice) btnSubmitNotice.innerHTML = '수정 완료 🚀';

                                if (noticeTitle) noticeTitle.value = d.title || '';
                                if (noticeContent) noticeContent.value = d.content || '';
                                if (d.image) {
                                    currentImageBase64 = d.image;
                                    if (imagePreview) imagePreview.src = d.image;
                                    if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
                                    if (btnSelectImage) btnSelectImage.style.display = 'none';
                                }

                                if (typeof closeAllWriteModals === 'function') closeAllWriteModals();
                                noticeModal?.classList.remove('hidden');
                            }
                        });
                    });
                });

                document.querySelectorAll('.btn-delete-notice').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm('이 알림을 삭제하시겠습니까?')) {
                            try {
                                await db.collection('workNotices').doc(btn.dataset.id).delete();
                            } catch (err) {
                                alert('삭제 실패: ' + err.message);
                            }
                        }
                    });
                });
            }, error => {
                console.error("Error fetching notices:", error);
            });
    }

    auth.onAuthStateChanged(user => {
        subscribeNotices();
    });
}
initNoticesLogic();

// 게시글 상세보기 모달 함수 정의 및 이벤트 바인딩
function showPostDetail(data, categoryName) {
    const viewModal = document.getElementById('view-post-modal');
    const viewImageContainer = document.getElementById('post-view-image-container');
    const viewImage = document.getElementById('post-view-image');
    const viewBadge = document.getElementById('post-view-badge');
    const viewTitle = document.getElementById('post-view-title');
    const viewAvatar = document.getElementById('post-view-avatar');
    const viewAuthor = document.getElementById('post-view-author');
    const viewDate = document.getElementById('post-view-date');
    const viewContent = document.getElementById('post-view-content');

    if (!viewModal) return;

    // 이미지 표시 여부
    if (data.image) {
        viewImage.src = data.image;
        viewImageContainer.style.display = 'block';
    } else {
        viewImage.src = '';
        viewImageContainer.style.display = 'none';
    }

    // 분류 뱃지 색상 및 텍스트 설정
    viewBadge.innerText = categoryName;
    if (categoryName === '아이디어') {
        viewBadge.style.background = 'rgba(27, 79, 114, 0.15)';
        viewBadge.style.color = '#1b4f72';
        viewBadge.style.borderColor = 'rgba(27, 79, 114, 0.3)';
        viewAvatar.style.background = '#1b4f72';
    } else if (categoryName === '정보마당') {
        viewBadge.style.background = 'rgba(74, 105, 189, 0.15)';
        viewBadge.style.color = '#4a69bd';
        viewBadge.style.borderColor = 'rgba(74, 105, 189, 0.3)';
        viewAvatar.style.background = '#4a69bd';
    } else if (categoryName === '알림마당') {
        viewBadge.style.background = 'rgba(229, 80, 57, 0.15)';
        viewBadge.style.color = '#e55039';
        viewBadge.style.borderColor = 'rgba(229, 80, 57, 0.3)';
        viewAvatar.style.background = '#e55039';
    }

    viewTitle.innerText = data.title || '';
    viewAuthor.innerText = data.authorName || '익명';
    viewAvatar.innerText = (data.authorName || '?').charAt(0);

    const date = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString('ko-KR') : '방금 전';
    viewDate.innerText = date;
    viewContent.innerText = data.content || '';

    viewModal.classList.remove('hidden');
}

const closePostViewBtn = document.getElementById('close-post-view');
closePostViewBtn?.addEventListener('click', () => {
    document.getElementById('view-post-modal')?.classList.add('hidden');
});


// --- 팀원별 프로젝트 리스트 모달 기능 ---
const btnMemberProjects = document.getElementById('ps-btn-member-projects');
const modalMemberProjects = document.getElementById('member-projects-modal');
const closeBtnMemberProjects = document.getElementById('member-projects-close-btn');
const mpMemberList = document.getElementById('mp-member-list');
const mpProjectList = document.getElementById('mp-project-list');
const mpRightTitle = document.getElementById('mp-right-title');

if (btnMemberProjects && modalMemberProjects && closeBtnMemberProjects) {
    btnMemberProjects.addEventListener('click', () => {
        if (!currentUserDoc || !currentUserDoc.isMaster) {
            alert('팀원별 프로젝트 현황은 마스터 권한이 필요합니다.');
            return;
        }
        openMemberProjectsModal();
    });
    closeBtnMemberProjects.addEventListener('click', () => {
        modalMemberProjects.classList.add('hidden');
    });
}

function openMemberProjectsModal() {
    modalMemberProjects.classList.remove('hidden');
    
    // Extract unique members from psData based on top-level projects
    const membersMap = {}; // { name: projectCount }
    const topProjectsCount = psData.filter(t => !t.parentId);
    let totalProjects = 0;

    topProjectsCount.forEach(proj => {
        const projAssignees = new Set();
        const findAssignees = (parentId) => {
            const children = psData.filter(t => t.parentId === parentId);
            children.forEach(child => {
                if (child.assignee) {
                    const assignees = child.assignee.split(',').map(a => a.trim()).filter(a => a !== '');
                    assignees.forEach(a => projAssignees.add(a));
                }
                findAssignees(child.id);
            });
        };
        findAssignees(proj.id);

        if (projAssignees.size > 0) {
            totalProjects += 1;
        }

        projAssignees.forEach(a => {
            membersMap[a] = (membersMap[a] || 0) + 1;
        });
    });

    const members = Object.keys(membersMap).sort();

    // Render Left Pane
    let htmlLeft = `<div class="mp-member-item active" data-member="all" style="padding: 12px; border-radius: 8px; cursor: pointer; transition: 0.2s; background: rgba(243, 156, 18, 0.2); color: #f39c12; font-weight: bold; border: 1px solid rgba(243, 156, 18, 0.4);">
        <div style="display: flex; justify-content: space-between;">
            <span>전체 현황</span>
            <span style="background: rgba(243, 156, 18, 0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">${totalProjects}건</span>
        </div>
    </div>`;

    members.forEach(member => {
        htmlLeft += `<div class="mp-member-item" data-member="${member}" style="padding: 12px; border-radius: 8px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; color: var(--text-color);">
            <div style="display: flex; justify-content: space-between;">
                <span>${member}</span>
                <span style="background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">${membersMap[member]}건</span>
            </div>
        </div>`;
    });

    mpMemberList.innerHTML = htmlLeft;

    // Attach click events to left pane items
    const items = mpMemberList.querySelectorAll('.mp-member-item');
    items.forEach(item => {
        item.addEventListener('click', (e) => {
            items.forEach(i => {
                i.style.background = 'transparent';
                i.style.color = 'var(--text-color)';
                i.style.border = '1px solid transparent';
            });
            
            const member = item.getAttribute('data-member');
            if (member === 'all') {
                item.style.background = 'rgba(243, 156, 18, 0.2)';
                item.style.color = '#f39c12';
                item.style.border = '1px solid rgba(243, 156, 18, 0.4)';
            } else {
                item.style.background = 'rgba(0, 206, 201, 0.15)';
                item.style.color = '#00cec9';
                item.style.border = '1px solid rgba(0, 206, 201, 0.3)';
            }
            
            renderMemberProjectsRightPane(member);
        });
    });

    // Default to 'all'
    renderMemberProjectsRightPane('all');
}

function renderMemberProjectsRightPane(member) {
    if (member === 'all') {
        mpRightTitle.innerText = `전체 프로젝트 현황 (프로젝트 단위)`;
        mpRightTitle.style.color = '#e67e22';
    } else {
        mpRightTitle.innerText = `${member}님의 담당 프로젝트`;
        mpRightTitle.style.color = '#00cec9';
    }

    // Find all top-level projects
    const topProjects = psData.filter(t => !t.parentId);
    
    let htmlRight = '';

    topProjects.forEach(proj => {
        // Find tasks in this project
        const projTasks = [];
        const findTasks = (parentId) => {
            const children = psData.filter(t => t.parentId === parentId);
            children.forEach(child => {
                let isMatch = false;
                if (member === 'all') {
                    isMatch = true;
                } else {
                    if (child.assignee) {
                        const assignees = child.assignee.split(',').map(a => a.trim());
                        if (assignees.includes(member)) isMatch = true;
                    }
                }
                if (isMatch) projTasks.push(child);
                findTasks(child.id);
            });
        };
        findTasks(proj.id);

        if (projTasks.length > 0 || (member === 'all')) {
            const total = projTasks.length;
            const completed = projTasks.filter(t => t.status === '완료').length;
            const delayed = projTasks.filter(t => t._isDelayed).length;
            
            // For 'all' member, we calculate progress of all subtasks of project
            let displayTotal = total;
            let displayCompleted = completed;
            if (member === 'all') {
                const allSubTasks = [];
                const findAllTasks = (parentId) => {
                    const children = psData.filter(t => t.parentId === parentId);
                    children.forEach(c => {
                        allSubTasks.push(c);
                        findAllTasks(c.id);
                    });
                };
                findAllTasks(proj.id);
                displayTotal = allSubTasks.length;
                displayCompleted = allSubTasks.filter(t => t.status === '완료').length;
            }

            const progress = displayTotal === 0 ? 0 : Math.round((displayCompleted / displayTotal) * 100);
            
            let statusBadge = `<span style="background: rgba(39, 174, 96, 0.2); color: #27ae60; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">진행 중</span>`;
            if (proj.status === '완료') {
                statusBadge = `<span style="background: rgba(27, 79, 114, 0.2); color: #1b4f72; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">완료</span>`;
            } else if (proj._isDelayed) {
                statusBadge = `<span style="background: rgba(229, 80, 57, 0.2); color: #e55039; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">지연</span>`;
            }

            let tasksHtml = '';
            if (member !== 'all' && projTasks.length > 0) {
                tasksHtml = `<div style="margin-top: 15px; background: rgba(0,0,0,0.1); border-radius: 8px; padding: 10px;">
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">담당 세부 업무 (${total}개)</div>`;
                projTasks.forEach(pt => {
                    let icon = '<i class="fa-solid fa-circle" style="color: #27ae60; font-size: 0.6rem;"></i>';
                    if (pt.status === '완료') icon = '<i class="fa-solid fa-circle-check" style="color: #1b4f72; font-size: 0.8rem;"></i>';
                    else if (pt._isDelayed) icon = '<i class="fa-solid fa-circle-exclamation" style="color: #e55039; font-size: 0.8rem;"></i>';
                    else if (pt._isWarning) icon = '<i class="fa-solid fa-circle-exclamation" style="color: #fa8231; font-size: 0.8rem;"></i>';
                    
                    tasksHtml += `<div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.9rem; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.1);">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${icon} <span>${pt.name}</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${pt.endDate || '-'}</div>
                    </div>`;
                });
                tasksHtml += `</div>`;
            } else if (member === 'all') {
                tasksHtml = `<div style="margin-top: 15px; display: flex; align-items: center; gap: 10px;">
                    <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: ${progress}%; background: #00cec9;"></div>
                    </div>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${progress}% (${displayCompleted}/${displayTotal})</span>
                </div>`;
            }

            htmlRight += `<div class="glass-card" style="padding: 15px; border-left: 4px solid ${proj._isDelayed ? '#e55039' : (proj.status==='완료' ? '#1b4f72' : '#00cec9')};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 5px;">${proj.name}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-calendar"></i> ${proj.startDate || '-'} ~ ${proj.endDate || '-'}</div>
                    </div>
                    <div>${statusBadge}</div>
                </div>
                ${tasksHtml}
            </div>`;
        }
    });

    if (htmlRight === '') {
        htmlRight = `<div style="text-align: center; color: var(--text-muted); margin-top: 50px;">
            <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i>
            <div>담당 중인 프로젝트가 없습니다.</div>
        </div>`;
    }

    mpProjectList.innerHTML = htmlRight;
}

// --- 프로젝트 활동 로그 ---
window.logProjectAction = function(action, projectId, projectName, details) {
    if (!currentUserDoc && !currentUser) return;
    try {
        const uid = currentUserDoc ? currentUserDoc.uid : currentUser.uid;
        const uName = (currentUserDoc ? currentUserDoc.nickname : null) || (currentUser ? currentUser.displayName : null) || '알 수 없음';
        const displayId = currentUser && currentUser.email ? currentUser.email.split('@')[0] : uid.substring(0, 6);
        const finalName = `${uName} (${displayId})`;
        db.collection('workProjectLogs').add({
            action: action,
            projectId: projectId,
            projectName: projectName || '이름 없음',
            details: details || '',
            userUid: uid,
            userName: finalName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) {
        console.error('로그 저장 실패:', e);
    }
};

const btnProjectLogs = document.getElementById('ps-btn-project-logs');
const modalProjectLogs = document.getElementById('project-logs-modal');
const closeBtnProjectLogs = document.getElementById('project-logs-close-btn');
const plUserFilter = document.getElementById('pl-user-filter');
const plLogList = document.getElementById('pl-log-list');

if (btnProjectLogs && modalProjectLogs && closeBtnProjectLogs) {
    btnProjectLogs.addEventListener('click', () => {
        if (!currentUserDoc || !currentUserDoc.isMaster) {
            alert('활동 로그는 마스터 권한이 필요합니다.');
            return;
        }
        modalProjectLogs.classList.remove('hidden');
        loadProjectLogs();
    });

    closeBtnProjectLogs.addEventListener('click', () => {
        modalProjectLogs.classList.add('hidden');
    });

    plUserFilter.addEventListener('change', () => {
        loadProjectLogs();
    });
}

async function loadProjectLogs() {
    if (!plLogList) return;
    plLogList.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> 로그 불러오는 중...</div>';
    
    try {
        // 1. 전체 사용자 정보 가져오기 (UID 기반 실명 매핑)
        const usersSnap = await db.collection('workUsers').get();
        let globalUsersMap = {};
        usersSnap.forEach(uDoc => {
            const data = uDoc.data();
            const name = data.nickname || data.name || '알 수 없음';
            const emailId = data.email ? data.email.split('@')[0] : '';
            globalUsersMap[uDoc.id] = emailId ? `${name} (${emailId})` : name;
        });

        // 2. 로그 정보 가져오기
        const snap = await db.collection('workProjectLogs').orderBy('createdAt', 'desc').limit(200).get();
        let logs = [];
        let filterUsersMap = {}; // 드롭다운용 사용자 목록
        
        snap.forEach(doc => {
            const d = doc.data();
            logs.push({ id: doc.id, ...d });
            if (d.userUid) {
                // 이전 데이터에 '알 수 없음'으로 기록되었어도 workUsers에서 실명을 가져옴
                filterUsersMap[d.userUid] = globalUsersMap[d.userUid] || d.userName || '알 수 없음';
            }
        });
        
        // Update user filter options (only if it has 1 option initially)
        if (plUserFilter.options.length <= 1) {
            Object.keys(filterUsersMap).forEach(uid => {
                const opt = document.createElement('option');
                opt.value = uid;
                opt.textContent = filterUsersMap[uid];
                plUserFilter.appendChild(opt);
            });
        }
        
        const selectedUid = plUserFilter.value;
        if (selectedUid !== 'all') {
            logs = logs.filter(log => log.userUid === selectedUid);
        }
        
        if (logs.length === 0) {
            plLogList.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">활동 로그가 없습니다.</div>';
            return;
        }
        
        let html = '';
        logs.forEach(log => {
            const dateStr = log.createdAt && log.createdAt.toDate ? log.createdAt.toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '시간 정보 없음';
            let actionColor = '#2563eb'; // 형광색(#00cec9)에서 짙은 파란색으로 변경
            let actionIcon = '<i class="fa-solid fa-pen"></i>';
            if (log.action === 'CREATE') { actionColor = '#27ae60'; actionIcon = '<i class="fa-solid fa-plus"></i>'; }
            if (log.action === 'DELETE') { actionColor = '#e74c3c'; actionIcon = '<i class="fa-solid fa-trash"></i>'; }
            
            const actualUserName = globalUsersMap[log.userUid] || log.userName || '알 수 없음';
            const actionText = log.action === 'UPDATE' ? '수정' : (log.action === 'CREATE' ? '생성' : '삭제');

            let formattedProjectName = log.projectName || '이름 없음';
            // ' > ' 패턴을 좀 더 예쁘게 (아이콘 추가 등) 표시
            formattedProjectName = formattedProjectName.replace(/ > /g, ` <span style="color: var(--text-muted); font-size: 0.8rem; margin: 0 4px;"><i class="fa-solid fa-chevron-right"></i></span> `);
            // 과거 [부모 프로젝트] 뱃지 변환 호환
            formattedProjectName = formattedProjectName.replace(/^\[(.*?)\]\s*/, `<span style="font-size: 0.8rem; background: rgba(128,128,128,0.15); border: 1px solid var(--border-color); padding: 3px 6px; border-radius: 4px; margin-right: 8px; color: var(--text-muted); vertical-align: middle;"><i class="fa-solid fa-code-branch"></i> $1</span> `);

            let formattedDetails = log.details || '';
            // 불필요한 '부모 프로젝트(OOO)에 ' 등 과거 문구 청소
            formattedDetails = formattedDetails.replace(/^부모 프로젝트\(.*?\)에\s*/, '');
            // (이전 데이터 호환용) details에 남아있는 [부모 프로젝트] 뱃지 처리
            formattedDetails = formattedDetails.replace(/^\[(.*?)\]\s*/, `<span style="font-size: 0.8rem; background: rgba(128,128,128,0.15); border: 1px solid var(--border-color); padding: 3px 6px; border-radius: 4px; margin-right: 8px; color: var(--text-muted);"><i class="fa-solid fa-code-branch"></i> $1</span> `);
            
            // '변경: OOO' 부분 하이라이트
            formattedDetails = formattedDetails.replace(/변경:\s*(.*)/, `변경: <strong style="color: #2563eb; background: rgba(37,99,235,0.1); padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px;">$1</strong>`);
            
            // '변경 (OOO)' 부분 하이라이트
            formattedDetails = formattedDetails.replace(/변경 \((.*?)\)/, `변경 (<strong style="color: #2563eb; background: rgba(37,99,235,0.1); padding: 2px 6px; border-radius: 4px;">$1</strong>)`);

            html += `<div style="background: rgba(0,0,0,0.15); border-left: 4px solid ${actionColor}; border-radius: 6px; padding: 10px 15px; margin-bottom: 8px; display: flex; align-items: center; gap: 15px; font-size: 0.9rem; transition: all 0.2s;">
                <div style="width: 75px; font-weight: bold; color: ${actionColor}; flex-shrink: 0; text-align: center; border: 1px solid ${actionColor}40; padding: 2px 0; border-radius: 12px; font-size: 0.85rem;">${actionIcon} ${actionText}</div>
                <div style="flex: 1; display: flex; align-items: center; gap: 15px; overflow: hidden; white-space: nowrap;">
                    <span style="font-weight: bold; font-size: 0.95rem; display: flex; align-items: center; flex-shrink: 0; min-width: 150px; max-width: 400px; overflow: hidden; text-overflow: ellipsis;">${formattedProjectName}</span>
                    <span style="color: var(--text-color); overflow: hidden; text-overflow: ellipsis; flex: 1;">${formattedDetails}</span>
                </div>
                <div style="width: 130px; color: #f39c12; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; font-weight: bold;"><i class="fa-solid fa-user" style="margin-right:4px;"></i>${actualUserName}</div>
                <div style="width: 110px; color: var(--text-muted); text-align: right; white-space: nowrap; flex-shrink: 0;">${dateStr}</div>
            </div>`;
        });
        
        plLogList.innerHTML = html;
        
    } catch (e) {
        console.error('로그 로드 실패:', e);
        plLogList.innerHTML = '<div style="color:#e74c3c; padding:20px;">로그를 불러오는데 실패했습니다.</div>';
    }
}

initParticles();
});
