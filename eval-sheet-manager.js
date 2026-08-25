(function() {
    window.EvalSheetManager = {
        sheetsMeta: [],
        currentSheetId: null,
        unsubscribeMeta: null,
        draggedMetaId: null,
        inited: false,
        workUsersCache: {},

        init: function() {
            if (this.inited) return;
            this.inited = true;
            console.log('EvalSheetManager initialized');
            
            // 모달 닫기
            document.getElementById('btn-eval-sheet-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('eval-sheet-modal')?.addEventListener('click', (e) => {
                if (e.target.id === 'eval-sheet-modal') this.closeModal();
            });

            // 마스터 전용 추가 버튼
            const btnAdd = document.getElementById('btn-add-eval-sheet');
            if (btnAdd) {
                btnAdd.addEventListener('click', () => this.openModal());
            }

            // 모달 저장 버튼
            document.getElementById('btn-eval-sheet-save')?.addEventListener('click', () => this.saveSheetMeta());

            // 전체선택/해제 버튼
            const btnToggleAll = document.getElementById('btn-eval-sheet-toggle-all');
            if (btnToggleAll) {
                btnToggleAll.addEventListener('click', () => {
                    const checkboxes = document.querySelectorAll('.eval-user-cb');
                    if (checkboxes.length === 0) return;
                    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                    checkboxes.forEach(cb => cb.checked = !allChecked);
                });
            }
        },

        loadList: async function() {
            const isMaster = !!(window.currentUserDocGlobal && window.currentUserDocGlobal.isMaster);
            const currentUser = window.auth && window.auth.currentUser;
            if (!currentUser) return;

            const btnAdd = document.getElementById('btn-add-eval-sheet');
            if (btnAdd) btnAdd.style.display = isMaster ? 'inline-block' : 'none';

            // Cache users for displaying names
            if (Object.keys(this.workUsersCache).length === 0) {
                try {
                    const snap = await window.db.collection('workUsers').get();
                    snap.forEach(doc => {
                        this.workUsersCache[doc.id] = doc.data().nickname || doc.data().email || '팀원';
                    });
                } catch(e) { console.error(e); }
            }

            if (this.unsubscribeMeta) this.unsubscribeMeta();

            const query = window.db.collection('workEvalSheetsMeta');
            // 마스터는 모두 보고, 일반 유저는 allowedUsers 배열에 본인 uid가 포함된 것만 본다.
            let activeQuery = query;
            if (!isMaster) {
                activeQuery = query.where('allowedUsers', 'array-contains', currentUser.uid);
            }

            this.unsubscribeMeta = activeQuery.onSnapshot(snapshot => {
                this.sheetsMeta = [];
                snapshot.forEach(doc => {
                    this.sheetsMeta.push({ id: doc.id, ...doc.data() });
                });
                // 정렬: order 오름차순, 없으면 createdAt 내림차순
                this.sheetsMeta.sort((a, b) => {
                    const orderA = a.order !== undefined ? a.order : 999999;
                    const orderB = b.order !== undefined ? b.order : 999999;
                    if (orderA !== orderB) return orderA - orderB;
                    return b.createdAt - a.createdAt;
                });
                this.renderList();
            }, err => {
                console.error("Eval sheets meta load error:", err);
            });
        },

        renderList: function() {
            const listEl = document.getElementById('eval-sheet-list');
            if (!listEl) return;

            listEl.innerHTML = '';
            const isMaster = !!(window.currentUserDocGlobal && window.currentUserDocGlobal.isMaster);

            if (this.sheetsMeta.length === 0) {
                listEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.9rem;">시트가 없습니다.</div>';
                return;
            }

            this.sheetsMeta.forEach(meta => {
                const item = document.createElement('div');
                item.className = 'eval-sheet-item';
                const isMaster = !!(window.currentUserDocGlobal && window.currentUserDocGlobal.isMaster);
                
                item.style.cssText = `
                    display: flex; justify-content: space-between; align-items: center; 
                    padding: 10px 12px; border-radius: 8px; cursor: pointer; 
                    background: ${this.currentSheetId === meta.id ? 'var(--primary-color)' : 'var(--input-bg)'};
                    color: ${this.currentSheetId === meta.id ? '#fff' : 'var(--text-color)'};
                    border: 1px solid ${this.currentSheetId === meta.id ? 'var(--primary-color)' : 'var(--card-border)'};
                    transition: all 0.2s;
                    user-select: none;
                `;
                let allowedNamesStr = '';
                if (meta.allowedUsers && meta.allowedUsers.length > 0) {
                    const names = meta.allowedUsers.map(uid => this.workUsersCache[uid] || '알수없음');
                    allowedNamesStr = `<div style="font-size: 0.75rem; color: ${this.currentSheetId === meta.id ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)'}; margin-top: 4px; padding-left: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">👤 ${names.join(', ')}</div>`;
                } else {
                    allowedNamesStr = `<div style="font-size: 0.75rem; color: ${this.currentSheetId === meta.id ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)'}; margin-top: 4px; padding-left: 0;">권한 지정 안됨</div>`;
                }

                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;">
                        ${isMaster ? `<div class="eval-drag-handle" style="cursor: grab; padding: 10px 5px; margin-left: -5px; color: ${this.currentSheetId === meta.id ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)'}; font-size: 1.1rem;"><i class="fa-solid fa-grip-vertical"></i></div>` : ''}
                        <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden; pointer-events: none;">
                            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                                <i class="fa-solid fa-file-excel"></i>
                                <span style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${meta.name}</span>
                            </div>
                            ${allowedNamesStr}
                        </div>
                    </div>
                `;
                
                if (isMaster) {
                    const btnContainer = document.createElement('div');
                    btnContainer.style.display = 'flex';

                    const btnEdit = document.createElement('button');
                    btnEdit.innerHTML = '<i class="fa-solid fa-pen"></i>';
                    btnEdit.style.cssText = `background: none; border: none; color: ${this.currentSheetId === meta.id ? '#fff' : 'var(--text-muted)'}; cursor: pointer; padding: 5px;`;
                    btnEdit.title = '수정';
                    btnEdit.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openModal(meta);
                    });
                    
                    const btnDelete = document.createElement('button');
                    btnDelete.innerHTML = '<i class="fa-solid fa-trash"></i>';
                    btnDelete.style.cssText = `background: none; border: none; color: ${this.currentSheetId === meta.id ? '#fff' : 'var(--text-muted)'}; cursor: pointer; padding: 5px; margin-left: 2px;`;
                    btnDelete.title = '삭제';
                    btnDelete.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`'${meta.name}' 시트를 정말 삭제하시겠습니까?\n복구할 수 없습니다.`)) {
                            try {
                                await window.db.collection('workEvalSheetsMeta').doc(meta.id).delete();
                                await window.db.collection('workEvalSheetsData').doc(meta.id).delete();
                                if (this.currentSheetId === meta.id) {
                                    this.currentSheetId = null;
                                    const container = document.getElementById('evaluation-excel-container');
                                    if(container) container.innerHTML = '';
                                    document.getElementById('eval-current-sheet-title').innerText = '시트를 선택하세요';
                                    document.getElementById('eval-master-controls').style.display = 'none';
                                }
                            } catch(err) {
                                console.error('삭제 오류:', err);
                                alert('삭제 중 오류가 발생했습니다.');
                            }
                        }
                    });

                    btnContainer.appendChild(btnEdit);
                    btnContainer.appendChild(btnDelete);
                    item.appendChild(btnContainer);

                    // 드래그 앤 드롭 정렬 이벤트
                    item.draggable = false;
                    const dragHandle = item.querySelector('.eval-drag-handle');
                    if (dragHandle) {
                        dragHandle.addEventListener('mouseenter', () => item.draggable = true);
                        dragHandle.addEventListener('mouseleave', () => item.draggable = false);
                    }

                    item.addEventListener('dragstart', (e) => {
                        this.draggedMetaId = meta.id;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', meta.id);
                        item.style.opacity = '0.4';
                    });
                    item.addEventListener('dragend', (e) => {
                        item.style.opacity = '1';
                        this.draggedMetaId = null;
                        document.querySelectorAll('.eval-sheet-item').forEach(el => {
                            el.style.borderTop = '';
                            el.style.borderBottom = '';
                        });
                    });
                    item.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const bounding = item.getBoundingClientRect();
                        const offset = bounding.y + (bounding.height / 2);
                        if (e.clientY - offset > 0) {
                            item.style.borderBottom = '2px solid var(--primary-color)';
                            item.style.borderTop = '';
                        } else {
                            item.style.borderTop = '2px solid var(--primary-color)';
                            item.style.borderBottom = '';
                        }
                    });
                    item.addEventListener('dragleave', (e) => {
                        item.style.borderBottom = '';
                        item.style.borderTop = '';
                    });
                    item.addEventListener('drop', (e) => {
                        e.preventDefault();
                        item.style.borderBottom = '';
                        item.style.borderTop = '';
                        
                        const draggedId = e.dataTransfer.getData('text/plain') || this.draggedMetaId;
                        if (!draggedId || draggedId === meta.id) return;
                        
                        const oldArray = [...this.sheetsMeta];
                        const draggedIndex = oldArray.findIndex(m => m.id === draggedId);
                        if (draggedIndex === -1) return;
                        
                        const draggedItem = oldArray[draggedIndex];
                        oldArray.splice(draggedIndex, 1);
                        
                        let newDropIndex = oldArray.findIndex(m => m.id === meta.id);
                        if (newDropIndex === -1) newDropIndex = 0;
                        
                        const bounding = item.getBoundingClientRect();
                        const offset = bounding.y + (bounding.height / 2);
                        if (e.clientY - offset > 0) {
                            newDropIndex++;
                        }
                        
                        oldArray.splice(newDropIndex, 0, draggedItem);
                        
                        oldArray.forEach((m, i) => {
                            if (m.order !== i) {
                                m.order = i;
                                window.db.collection('workEvalSheetsMeta').doc(m.id).update({ order: i }).catch(err => console.error(err));
                            }
                        });
                    });
                }

                item.addEventListener('click', () => {
                    this.loadSheetData(meta.id, meta.name);
                });

                listEl.appendChild(item);
            });
        },

        openModal: async function(meta = null) {
            const isMaster = !!(window.currentUserDocGlobal && window.currentUserDocGlobal.isMaster);
            if (!isMaster) return;

            document.getElementById('eval-sheet-modal').classList.remove('hidden');
            document.getElementById('eval-sheet-modal').style.display = 'flex';
            
            document.getElementById('eval-sheet-modal-title').innerText = meta ? '평가시트 수정' : '새 평가시트 만들기';
            document.getElementById('eval-sheet-name-input').value = meta ? meta.name : '';
            document.getElementById('eval-sheet-id-input').value = meta ? meta.id : '';

            // 가입된 팀원 목록 로드
            const usersListEl = document.getElementById('eval-sheet-users-list');
            usersListEl.innerHTML = '<div style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i></div>';

            try {
                const snap = await window.db.collection('workUsers').get();
                usersListEl.innerHTML = '';
                
                const allowedUsers = meta && meta.allowedUsers ? meta.allowedUsers : [];

                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.isMaster) return; // 마스터는 자동 조회 가능하므로 목록에서 제외

                    const label = document.createElement('label');
                    label.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-color);';
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = doc.id;
                    cb.className = 'eval-user-cb';
                    cb.checked = allowedUsers.includes(doc.id);
                    cb.style.cursor = 'pointer';

                    label.appendChild(cb);
                    label.appendChild(document.createTextNode(data.nickname || data.email));
                    usersListEl.appendChild(label);
                });
            } catch (e) {
                console.error(e);
                usersListEl.innerHTML = '팀원 목록을 불러올 수 없습니다.';
            }
        },

        closeModal: function() {
            document.getElementById('eval-sheet-modal').classList.add('hidden');
            document.getElementById('eval-sheet-modal').style.display = 'none';
        },

        saveSheetMeta: async function() {
            const name = document.getElementById('eval-sheet-name-input').value.trim();
            const id = document.getElementById('eval-sheet-id-input').value;
            if (!name) { alert('시트 이름을 입력하세요.'); return; }

            const cbList = document.querySelectorAll('#eval-sheet-users-list input[type="checkbox"]:checked');
            const allowedUsers = Array.from(cbList).map(cb => cb.value);

            const data = {
                name: name,
                allowedUsers: allowedUsers,
                updatedAt: Date.now()
            };

            const btn = document.getElementById('btn-eval-sheet-save');
            btn.disabled = true;
            btn.innerHTML = '저장 중...';

            try {
                if (id) {
                    await window.db.collection('workEvalSheetsMeta').doc(id).update(data);
                } else {
                    data.createdAt = Date.now();
                    const newRef = await window.db.collection('workEvalSheetsMeta').add(data);
                    // Create empty sheet
                    await window.db.collection('workEvalSheetsData').doc(newRef.id).set({
                        sheets: [{ name: "Sheet1", color: "", status: 1, order: 0, data: [], config: {}, index: 0 }],
                        savedAt: Date.now()
                    });
                }
                this.closeModal();
            } catch (e) {
                console.error(e);
                alert('저장 중 오류 발생');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '저장하기';
            }
        },

        loadSheetData: function(sheetId, sheetName) {
            this.currentSheetId = sheetId;
            this.renderList(); // 활성 상태 업데이트

            const isMaster = !!(window.currentUserDocGlobal && window.currentUserDocGlobal.isMaster);
            
            document.getElementById('eval-current-sheet-title').innerText = sheetName;
            const em = document.getElementById('eval-empty-msg');
            if (em) em.style.display = 'none';
            if (isMaster) {
                document.getElementById('eval-master-controls').style.display = 'flex';
            }

            console.log('[평가시트 로드] 시작 - sheetId:', sheetId, 'sheetName:', sheetName);

            window.db.collection('workEvalSheetsData').doc(sheetId).get().then(doc => {
                if (doc.exists && doc.data() && doc.data().sheets) {
                    const d = doc.data();
                    console.log('[평가시트 로드] 데이터 발견! 시트 수:', d.sheets.length);
                    d.sheets.forEach((s, i) => {
                        console.log(`[평가시트 로드] 시트[${i}] "${s.name}" - celldata: ${s.celldata ? s.celldata.length : 0}개, data: ${s.data ? '있음' : '없음'}`);
                    });
                    window.doInitLuckysheet(d.sheets, sheetName, isMaster, true);
                    const savedAt = d.savedAt ? new Date(d.savedAt).toLocaleString('ko-KR') : '';
                    window.showBanner(isMaster ? `<i class="fa-solid fa-crown"></i> 마스터 편집 모드 | 최근 저장: ${savedAt}` : `<i class="fa-solid fa-eye"></i> 읽기 전용 모드 | 최근 저장: ${savedAt}`, isMaster ? 'success' : 'readonly');
                } else {
                    console.log('[평가시트 로드] 데이터 없음 (빈 시트)');
                    window.doInitLuckysheet(null, sheetName, isMaster, true);
                    window.showBanner(isMaster ? `<i class="fa-solid fa-crown"></i> 마스터 편집 모드 (빈 시트)` : `<i class="fa-solid fa-eye"></i> 빈 시트`, isMaster ? 'info' : 'readonly');
                }
            }).catch(err => {
                console.error("[평가시트 로드] 오류:", err);
                alert('시트 데이터를 불러오는 중 오류가 발생했습니다.');
            });
        },

        saveCurrentSheet: function() {
            if (!this.currentSheetId) { alert('선택된 시트가 없습니다.'); return; }
            if (!window.db) { alert('Firebase 연결 오류'); return; }
            if (!window.luckysheet) { alert('시트가 아직 준비되지 않았습니다.'); return; }
            
            const sheetId = this.currentSheetId; // 저장 시점의 sheetId를 캡처
            console.log('[평가시트 저장] 시작 - sheetId:', sheetId);
            
            let sheets;
            try {
                sheets = luckysheet.getAllSheets();
            } catch(e) {
                console.error('[평가시트 저장] getAllSheets 오류:', e);
                alert('시트 데이터를 가져올 수 없습니다.');
                return;
            }
            
            if (!sheets || sheets.length === 0) { alert('저장할 데이터가 없습니다.'); return; }
            console.log('[평가시트 저장] getAllSheets 성공, 시트 수:', sheets.length);

            const saveBtn = document.getElementById('btn-eval-save');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...'; }

            try {
                const optimizedSheets = sheets.map((s, idx) => {
                    const celldata = [];
                    
                    // data (2D 배열)가 있으면 celldata (1D 배열)로 변환
                    if (s.data && Array.isArray(s.data) && s.data.length > 0) {
                        for (let r = 0; r < s.data.length; r++) {
                            if (!s.data[r] || !Array.isArray(s.data[r])) continue;
                            for (let c = 0; c < s.data[r].length; c++) {
                                const cell = s.data[r][c];
                                if (cell != null && typeof cell === 'object' && Object.keys(cell).length > 0) {
                                    celldata.push({ r: r, c: c, v: cell });
                                }
                            }
                        }
                    } else if (s.celldata && Array.isArray(s.celldata)) {
                        // data가 없고 celldata만 있는 경우 (아직 초기화 안 된 시트)
                        celldata.push(...s.celldata);
                    }
                    
                    console.log(`[평가시트 저장] 시트[${idx}] "${s.name}" - celldata 셀 수: ${celldata.length}`);
                    
                    // 깨끗한 시트 객체 구성 (Luckysheet 런타임 찌꺼기 제거)
                    const clean = {
                        name: s.name || 'Sheet1',
                        color: s.color || '',
                        status: s.status != null ? s.status : (idx === 0 ? 1 : 0),
                        order: s.order != null ? s.order : idx,
                        index: s.index != null ? s.index : idx,
                        celldata: celldata,
                        config: s.config || {},
                        row: s.row,
                        column: s.column,
                        defaultRowHeight: s.defaultRowHeight,
                        defaultColWidth: s.defaultColWidth,
                        showGridLines: s.showGridLines,
                        calcChain: s.calcChain || [],
                        frozen: s.frozen || null,
                        filter: s.filter || null,
                        filter_select: s.filter_select || null,
                        images: s.images || {},
                        dataVerification: s.dataVerification || {},
                        hyperlink: s.hyperlink || {},
                        hide: s.hide || 0,
                        authority: s.authority || null
                    };
                    
                    // undefined 값 제거 (Firestore는 undefined를 저장 못함)
                    Object.keys(clean).forEach(key => {
                        if (clean[key] === undefined || clean[key] === null) {
                            delete clean[key];
                        }
                    });
                    
                    return clean;
                });
                
                // JSON 직렬화하여 깊은 복사 + 순환 참조 등 제거
                const sheetsToSave = JSON.parse(JSON.stringify(optimizedSheets));
                
                // Firestore 문서 크기 체크 (1MB 제한)
                const jsonStr = JSON.stringify(sheetsToSave);
                const sizeKB = Math.round(jsonStr.length / 1024);
                console.log(`[평가시트 저장] 총 데이터 크기: ${sizeKB}KB`);
                
                if (jsonStr.length > 950000) {
                    alert(`데이터가 너무 큽니다 (${sizeKB}KB). Firestore 제한(1MB)에 가깝습니다.\n일부 내용을 줄여주세요.`);
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 저장'; }
                    return;
                }

                window.db.collection('workEvalSheetsData').doc(sheetId).set({
                    sheets: sheetsToSave,
                    savedAt: Date.now(),
                    savedBy: window.currentUserDocGlobal ? (window.currentUserDocGlobal.nickname || window.currentUserDocGlobal.email) : '마스터',
                }).then(() => {
                    console.log('[평가시트 저장] Firebase 저장 완료! sheetId:', sheetId);
                    window.showBanner(`<i class="fa-solid fa-crown"></i> 저장 완료: ${new Date().toLocaleString('ko-KR')}`, 'success');
                }).catch(err => {
                    console.error('[평가시트 저장] Firebase 오류:', err);
                    alert('저장 오류: ' + err.message);
                }).finally(() => {
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 저장'; }
                });
            } catch (e) {
                console.error('[평가시트 저장] 변환 오류:', e);
                alert('데이터 변환 중 오류가 발생했습니다: ' + e.message);
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 저장'; }
            }
        }
    };
})();
