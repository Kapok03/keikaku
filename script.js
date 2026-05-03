const PX_PER_HOUR = 60;
const PX_PER_30_MIN = 30;
const PX_PER_10_MIN = 10;
const MAX_HEIGHT_PX = 1320; 
const LOCAL_STORAGE_KEY = 'weeklyPlannerUltimatePro'; 
const SIDEBAR_DRAWER_BREAKPOINT = 1180;

let undoStack = [];
let redoStack = [];
let isProgrammaticChange = false;
let currentEditingBlock = null;
let isResizing = false;
let activeQualityBox = null;
let copiedDayBlocks = [];
let currentTimeTimer = null;
let draggedPlanBlockMove = null;
let draggedPlanBlockDropped = false;
let nowNextOriginalParent = null;
let touchReadyPlanBlock = null;

let folders = [
    { id: 'f-all', name: '全て表示' },
    { id: 'f-math', name: '数学' },
    { id: 'f-english', name: '英語' },
    { id: 'f-life', name: '生活' },
    { id: 'f-fav', name: 'お気に入り' }
];
let materials = [
    { id: 'm1', folderId: 'f-life', name: '睡眠', color: '#B2C8DF', category: 'none', isFav: false },
    { id: 'm2', folderId: 'f-life', name: '移動', color: '#FDEFC1', category: 'none', isFav: false },
    { id: 'm3', folderId: 'f-life', name: 'ごはん', color: '#F5B7B1', category: 'none', isFav: false },
    { id: 'm4', folderId: 'f-life', name: '休憩', color: '#D2B4DE', category: 'none', isFav: false },
    { id: 'm5', folderId: 'f-math', name: 'FG', color: '#22209b', category: 'subject', isFav: true },
    { id: 'm6', folderId: 'f-english', name: '英単語帳', color: '#DB4437', category: 'subject', isFav: false }
];

let autoAddRules = []; 
let appSettings = {
    confirmDayReset: true,
    defaultBlockMinutes: 60
};

document.addEventListener('DOMContentLoaded', () => {
    runInit('initTimetable', initTimetable);
    runInit('initShortcuts', initShortcuts);
    runInit('initWeeklyTasks', initWeeklyTasks);
    runInit('loadLocalData', loadLocalData);
    runInit('initSidebar', initSidebar);
    runInit('initDateLogic', initDateLogic);
    runInit('initCurrentTimeIndicator', initCurrentTimeIndicator);
    runInit('initButtons', initButtons);
    runInit('initResponsivePlanner', initResponsivePlanner);
    runInit('initModalScrollLock', initModalScrollLock);
    runInit('saveState', saveState);
});

function runInit(name, fn) {
    try {
        fn();
    } catch (err) {
        console.error(`${name} failed`, err);
    }
}

function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseTime(val) {
    if (!val) return 0;
    const match = val.match(/[\d\.]+/);
    return match ? parseFloat(match[0]) : 0;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function setPointerCaptureSafely(el, pointerId) {
    if (pointerId == null || !el.setPointerCapture) return;
    try { el.setPointerCapture(pointerId); } catch (err) {}
}

function releasePointerCaptureSafely(el, pointerId) {
    if (pointerId == null || !el.releasePointerCapture) return;
    try { el.releasePointerCapture(pointerId); } catch (err) {}
}

function isTouchPlannerMode() {
    return window.innerWidth <= SIDEBAR_DRAWER_BREAKPOINT;
}

function clearTouchReadyPlanBlock(exceptBlock = null) {
    if (touchReadyPlanBlock && touchReadyPlanBlock !== exceptBlock) {
        touchReadyPlanBlock.classList.remove('is-touch-ready');
    }
    if (touchReadyPlanBlock !== exceptBlock) touchReadyPlanBlock = null;
}

// --- 左サイドバーと教材管理 ---
function initSidebar() {
    const container = document.getElementById('sidebar-content');
    if (!container) return;
    container.innerHTML = '';

    folders.forEach(f => {
        const fDiv = document.createElement('div');
        fDiv.className = 'folder-group';
        const isOpen = ''; 
        fDiv.innerHTML = `<div class="folder-title" onclick="toggleFolder(this)">📁 ${f.name}</div><div class="folder-items ${isOpen}" id="folder-${f.id}"></div>`;
        container.appendChild(fDiv);
    });

    materials.forEach(mat => {
        const itemHtml = `
            <div class="material-item" draggable="true" onclick="openMatEditModal('${mat.id}')" data-id="${mat.id}" data-category="${mat.category}" data-name="${mat.name}" data-color="${mat.color}">
                <span class="color-dot" style="background: ${mat.color};"></span>
                ${mat.name}
            </div>
        `;
        
        const allFolder = document.getElementById('folder-f-all');
        if(allFolder) allFolder.insertAdjacentHTML('beforeend', itemHtml);
        
        if(mat.folderId && mat.folderId !== 'f-fav' && mat.folderId !== 'f-all') {
            const targetFolder = document.getElementById(`folder-${mat.folderId}`);
            if(targetFolder) targetFolder.insertAdjacentHTML('beforeend', itemHtml);
        }

        if (mat.isFav) {
            const favFolder = document.getElementById('folder-f-fav');
            if(favFolder) favFolder.insertAdjacentHTML('beforeend', itemHtml);
        }
    });

    document.querySelectorAll('.material-item').forEach(item => {
        item.draggable = window.innerWidth > SIDEBAR_DRAWER_BREAKPOINT;
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('name', item.dataset.name);
            e.dataTransfer.setData('color', item.dataset.color);
            e.dataTransfer.setData('category', item.dataset.category);
            e.dataTransfer.setData('height', String(getDefaultBlockHeight()));
            e.dataTransfer.setData('dragOffsetY', '0');
        });
        initTouchMaterialDrag(item);
    });

    initSidebarDropDelete();

    updateFolderSelects();
    renderFolderManageList();
}

function initSidebarDropDelete() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.dataset.dropDeleteReady === 'true') return;

    sidebar.dataset.dropDeleteReady = 'true';
    sidebar.addEventListener('dragover', (e) => {
        if (Array.from(e.dataTransfer.types).includes('application/x-plan-block')) {
            e.preventDefault();
            sidebar.classList.add('delete-drop-target');
        }
    });
    sidebar.addEventListener('dragleave', (e) => {
        if (!sidebar.contains(e.relatedTarget)) {
            sidebar.classList.remove('delete-drop-target');
        }
    });
    sidebar.addEventListener('drop', (e) => {
        if (!Array.from(e.dataTransfer.types).includes('application/x-plan-block')) return;
        e.preventDefault();
        sidebar.classList.remove('delete-drop-target');
        draggedPlanBlockDropped = true;
        saveState();
        setStatusMessage('予定を削除しました');
        clearStatusMessage();
    });
}

window.toggleFolder = function(el) {
    el.nextElementSibling.classList.toggle('open');
};

function updateFolderSelects() {
    const options = folders.filter(f => f.id !== 'f-fav' && f.id !== 'f-all').map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    const newF = document.getElementById('new-mat-folder');
    const editF = document.getElementById('edit-mat-folder');
    if(newF) newF.innerHTML = options;
    if(editF) editF.innerHTML = options;
}

function renderFolderManageList() {
    const list = document.getElementById('folder-manage-list');
    if(!list) return;
    list.innerHTML = folders.map((f, i) => {
        const isBase = (f.id === 'f-fav' || f.id === 'f-all');
        const deleteBtn = isBase ? '' : `<button class="btn btn-danger" style="padding: 2px 8px; font-size: 10px;" onclick="deleteFolder('${f.id}')">削除</button>`;
        
        return `
        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size: 13px; align-items:center; background:#fff; padding:6px 8px; border-radius:6px; border:1px solid #E2E8F0;">
            <span>📁 ${f.name} ${isBase ? '(基本)' : ''}</span>
            <div style="display:flex; gap:4px;">
                ${deleteBtn}
            </div>
        </div>
        `;
    }).join('');
}

window.deleteFolder = function(id) {
    if(confirm('このフォルダを削除しますか？\n(中の教材は消えずに「全て表示」に残ります)')) {
        folders = folders.filter(f => f.id !== id);
        materials.forEach(m => { if(m.folderId === id) m.folderId = ''; });
        initSidebar();
        saveLocalData();
    }
};

window.openMatEditModal = function(id) {
    const mat = materials.find(m => m.id === id);
    if(!mat) return;
    editingMatId = id;
    document.getElementById('edit-mat-name').value = mat.name;
    document.getElementById('edit-mat-folder').value = mat.folderId;
    document.getElementById('edit-mat-color').value = mat.color;
    document.getElementById('edit-mat-fav').checked = !!mat.isFav;
    document.getElementById('mat-edit-modal').classList.remove('modal-hidden');
};

// --- すべてのボタンイベントを安全に登録 ---
function initButtons() {
    // ヘッダーバーのボタン群
    document.getElementById('undo-btn')?.addEventListener('click', performUndo);
    document.getElementById('redo-btn')?.addEventListener('click', performRedo);
    document.getElementById('gcal-sync-btn')?.addEventListener('click', () => { document.getElementById('gcal-modal').classList.remove('modal-hidden'); });
    document.getElementById('export-modal-btn')?.addEventListener('click', () => { document.getElementById('export-modal').classList.remove('modal-hidden'); });
    document.getElementById('reset-planner-btn')?.addEventListener('click', resetPlanner);
    document.getElementById('dl-btn')?.addEventListener('click', () => { document.getElementById('download-format-modal').classList.remove('modal-hidden'); });
    document.getElementById('settings-btn')?.addEventListener('click', () => {
        initSettingsModal();
        document.getElementById('settings-modal').classList.remove('modal-hidden');
    });
    document.getElementById('app-settings-btn')?.addEventListener('click', () => {
        initAppSettingsModal();
        document.getElementById('app-settings-modal').classList.remove('modal-hidden');
    });

    // 読み込みボタン
    document.getElementById('import-file')?.addEventListener('change', importData);

    // サイドバーの管理ボタン群
    document.getElementById('sidebar-edit-btn')?.addEventListener('click', () => document.getElementById('sidebar-manage-modal').classList.remove('modal-hidden'));
    document.getElementById('sidebar-sort-btn')?.addEventListener('click', () => {
        initFolderSortModal();
        document.getElementById('folder-sort-modal').classList.remove('modal-hidden');
    });

    // モーダルを閉じる・キャンセルボタン群
    document.getElementById('btn-manage-close')?.addEventListener('click', () => document.getElementById('sidebar-manage-modal').classList.add('modal-hidden'));
    document.getElementById('btn-sort-cancel')?.addEventListener('click', () => document.getElementById('folder-sort-modal').classList.add('modal-hidden'));
    document.getElementById('btn-export-close')?.addEventListener('click', () => document.getElementById('export-modal').classList.add('modal-hidden'));
    document.getElementById('btn-download-close')?.addEventListener('click', () => document.getElementById('download-format-modal').classList.add('modal-hidden'));
    document.getElementById('btn-settings-close')?.addEventListener('click', () => document.getElementById('settings-modal').classList.add('modal-hidden'));
    document.getElementById('btn-app-settings-close')?.addEventListener('click', () => document.getElementById('app-settings-modal').classList.add('modal-hidden'));
    document.getElementById('btn-app-settings-save')?.addEventListener('click', saveAppSettingsFromModal);
    document.getElementById('btn-gcal-close')?.addEventListener('click', () => document.getElementById('gcal-modal').classList.add('modal-hidden'));
    document.getElementById('btn-mat-cancel')?.addEventListener('click', () => document.getElementById('mat-edit-modal').classList.add('modal-hidden'));
    document.getElementById('btn-cancel')?.addEventListener('click', closeEditModal); 

    // 計画票のDL
    document.getElementById('download-pdf-btn')?.addEventListener('click', () => downloadPlanner('pdf'));
    document.getElementById('download-image-btn')?.addEventListener('click', () => downloadPlanner('image'));

    // フォルダ・教材の追加・更新・削除
    document.getElementById('add-folder-btn')?.addEventListener('click', () => {
        const name = document.getElementById('new-folder-name').value;
        if(name) { folders.push({ id: 'f-' + Date.now(), name }); document.getElementById('new-folder-name').value = ''; initSidebar(); saveLocalData(); }
    });
    document.getElementById('add-mat-btn')?.addEventListener('click', () => {
        const name = document.getElementById('new-mat-name').value;
        const folderId = document.getElementById('new-mat-folder').value;
        const color = document.getElementById('new-mat-color').value;
        const category = document.getElementById('new-mat-category').value;
        if(name) { materials.push({ id: 'm-' + Date.now(), folderId, name, color, category, isFav: false }); document.getElementById('new-mat-name').value = ''; initSidebar(); saveLocalData(); }
    });
    document.getElementById('btn-mat-update')?.addEventListener('click', () => {
        const mat = materials.find(m => m.id === editingMatId);
        if(mat) {
            mat.name = document.getElementById('edit-mat-name').value; mat.folderId = document.getElementById('edit-mat-folder').value;
            mat.color = document.getElementById('edit-mat-color').value; mat.isFav = document.getElementById('edit-mat-fav').checked;
            initSidebar(); saveLocalData();
        }
        document.getElementById('mat-edit-modal').classList.add('modal-hidden');
    });
    document.getElementById('btn-mat-delete')?.addEventListener('click', () => {
        if(confirm('この教材をリストから削除しますか？')) {
            materials = materials.filter(m => m.id !== editingMatId); autoAddRules = autoAddRules.filter(r => r.matId !== editingMatId);
            initSidebar(); saveLocalData(); document.getElementById('mat-edit-modal').classList.add('modal-hidden');
        }
    });

    // フォルダ並び替えの決定
    document.getElementById('btn-sort-apply')?.addEventListener('click', () => {
        const list = document.getElementById('sortable-folder-list');
        const sortedIds = Array.from(list.querySelectorAll('.sortable-item')).map(item => item.dataset.id);
        const newFolders = [];
        sortedIds.forEach(id => { const f = folders.find(folder => folder.id === id); if (f) newFolders.push(f); });
        folders = newFolders;
        initSidebar(); saveLocalData(); document.getElementById('folder-sort-modal').classList.add('modal-hidden');
    });

    // 自動追加設定の追加と適用
    document.getElementById('add-auto-rule-btn')?.addEventListener('click', () => {
        const matId = document.getElementById('auto-mat-select').value;
        const start = parseInt(document.getElementById('auto-start-time').value, 10);
        const end = parseInt(document.getElementById('auto-end-time').value, 10);
        if(start >= end) { alert('終了時間は開始時間より後に設定してください'); return; }
        if(matId) { autoAddRules.push({ matId, start, end }); renderAutoAddRules(); saveLocalData(); }
    });
    document.getElementById('apply-auto-add-btn')?.addEventListener('click', () => {
        const grids = document.querySelectorAll('.day-col .day-grid');
        grids.forEach((grid) => {
            autoAddRules.forEach(rule => {
                const mat = materials.find(m => m.id === rule.matId); if (!mat) return;
                createBlock(grid, { name: mat.name, color: mat.color, category: mat.category, top: rule.start, height: rule.end - rule.start });
            });
        });
        saveState(); document.getElementById('settings-modal').classList.add('modal-hidden');
    });

    // ブロック時間編集の更新と削除
    document.getElementById('btn-update')?.addEventListener('click', () => {
        if(currentEditingBlock) {
            const newMins = parseInt(document.getElementById('edit-duration').value, 10);
            if(newMins > 0) {
                let newHeightPx = (newMins / 60) * PX_PER_HOUR;
                const currentTop = parseFloat(currentEditingBlock.style.top);
                if (currentTop + newHeightPx > MAX_HEIGHT_PX) { newHeightPx = MAX_HEIGHT_PX - currentTop; alert('最大高さを超えるため調整しました。'); }
                currentEditingBlock.style.height = newHeightPx + 'px';
                setBlockNote(currentEditingBlock, document.getElementById('edit-note').value);
                saveState(); 
                updateDailyTodos();
            }
        }
        closeEditModal();
    });
    document.getElementById('btn-delete')?.addEventListener('click', () => {
        if(currentEditingBlock) { currentEditingBlock.remove(); saveState(); } 
        closeEditModal();
    });

    // 書き出しボタン
    document.getElementById('export-all-btn')?.addEventListener('click', exportAllData);
    document.getElementById('export-planner-btn')?.addEventListener('click', exportPlannerData);
    document.getElementById('export-mat-btn')?.addEventListener('click', exportMaterialsData);

    // GCal同期ボタン
    document.getElementById('btn-gcal-sync')?.addEventListener('click', fetchGCalData);
}

// --- フォルダ並び替え初期化 ---
function initFolderSortModal() {
    const list = document.getElementById('sortable-folder-list'); if(!list) return;
    list.innerHTML = '';
    folders.forEach(f => {
        const item = document.createElement('div');
        item.className = 'sortable-item'; item.draggable = window.innerWidth > SIDEBAR_DRAWER_BREAKPOINT; item.dataset.id = f.id;
        const isBase = (f.id === 'f-fav' || f.id === 'f-all') ? ' (基本)' : '';
        item.innerHTML = `<span class="drag-handle">≡</span> 📁 ${f.name}${isBase}`;
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', f.id);
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
        initTouchFolderSortItem(item, list);
        list.appendChild(item);
    });

    if (list.dataset.dragReady !== 'true') {
        list.dataset.dragReady = 'true';
        list.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (!draggable) return;
            if (afterElement == null) { list.appendChild(draggable); } else { list.insertBefore(draggable, afterElement); }
        });
        list.addEventListener('touchmove', e => {
            if (list.dataset.touchSorting === 'true') e.preventDefault();
        }, { passive: false });
    }
}

function initTouchFolderSortItem(item, list) {
    const startSort = (startY, pointerId) => {
        setPointerCaptureSafely(item, pointerId);
        item.classList.add('dragging', 'touch-dragging');
        list.dataset.touchSorting = 'true';

        return {
            move(clientY) {
                const afterElement = getDragAfterElement(list, clientY);
                if (afterElement == null) list.appendChild(item);
                else list.insertBefore(item, afterElement);
            },
            stop() {
                releasePointerCaptureSafely(item, pointerId);
                item.classList.remove('dragging', 'touch-dragging');
                list.dataset.touchSorting = 'false';
            }
        };
    };

    item.addEventListener('pointerdown', (e) => {
        if (e.button && e.button !== 0) return;
        if (e.pointerType === 'mouse') return;
        e.preventDefault();
        const sorter = startSort(e.clientY, e.pointerId);

        const moveItem = (ev) => {
            ev.preventDefault();
            sorter.move(ev.clientY);
        };

        const stopSort = (ev) => {
            ev.preventDefault();
            sorter.stop();
            document.removeEventListener('pointermove', moveItem);
            document.removeEventListener('pointerup', stopSort);
            document.removeEventListener('pointercancel', stopSort);
        };

        document.addEventListener('pointermove', moveItem, { passive: false });
        document.addEventListener('pointerup', stopSort, { passive: false });
        document.addEventListener('pointercancel', stopSort, { passive: false });
    });

    if (!window.PointerEvent) {
        item.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            if (!touch) return;
            e.preventDefault();
            const sorter = startSort(touch.clientY);

            const moveItem = (ev) => {
                const moveTouch = ev.touches[0];
                if (!moveTouch) return;
                ev.preventDefault();
                sorter.move(moveTouch.clientY);
            };

            const stopSort = (ev) => {
                ev.preventDefault();
                sorter.stop();
                document.removeEventListener('touchmove', moveItem);
                document.removeEventListener('touchend', stopSort);
                document.removeEventListener('touchcancel', stopSort);
            };

            document.addEventListener('touchmove', moveItem, { passive: false });
            document.addEventListener('touchend', stopSort, { passive: false });
            document.addEventListener('touchcancel', stopSort, { passive: false });
        }, { passive: false });
    }
}

function initTouchMaterialDrag(item) {
    if (item.dataset.touchDragReady === 'true') return;
    item.dataset.touchDragReady = 'true';

    let suppressClick = false;
    item.addEventListener('click', (e) => {
        if (!suppressClick) return;
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
    }, true);

    const startTouchDrag = (startX, startY, pointerId) => {
        let isDragging = false;
        let ghost = null;

        const move = (ev, clientX, clientY) => {
            const dx = clientX - startX;
            const dy = clientY - startY;
            if (!isDragging && Math.hypot(dx, dy) < 8) return;

            ev.preventDefault();
            if (!isDragging) {
                isDragging = true;
                suppressClick = true;
                document.body.classList.add('material-dragging');
                ghost = item.cloneNode(true);
                ghost.classList.add('material-drag-ghost');
                document.body.appendChild(ghost);
                setPointerCaptureSafely(item, pointerId);
            }

            if (ghost) {
                ghost.style.left = `${clientX}px`;
                ghost.style.top = `${clientY}px`;
            }
        };

        const end = (ev, clientX, clientY) => {
            if (ghost) ghost.remove();
            document.body.classList.remove('material-dragging');
            if (!isDragging) return;

            ev.preventDefault();
            const grid = getPlannerGridAtPoint(clientX, clientY);
            if (!grid) {
                setTimeout(() => { suppressClick = false; }, 0);
                return;
            }

            createMaterialBlockAtPoint(grid, clientY, {
                name: item.dataset.name,
                color: item.dataset.color,
                category: item.dataset.category,
                note: '',
                height: getDefaultBlockHeight()
            });
            saveState();
            setTimeout(() => { suppressClick = false; }, 0);
        };

        return { move, end };
    };

    item.addEventListener('pointerdown', (e) => {
        if (e.button && e.button !== 0) return;
        if (window.innerWidth > SIDEBAR_DRAWER_BREAKPOINT && e.pointerType === 'mouse') return;
        e.preventDefault();
        const drag = startTouchDrag(e.clientX, e.clientY, e.pointerId);

        const move = (ev) => drag.move(ev, ev.clientX, ev.clientY);
        const end = (ev) => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', end);
            document.removeEventListener('pointercancel', end);
            releasePointerCaptureSafely(item, e.pointerId);
            drag.end(ev, ev.clientX, ev.clientY);
        };

        document.addEventListener('pointermove', move, { passive: false });
        document.addEventListener('pointerup', end, { passive: false });
        document.addEventListener('pointercancel', end, { passive: false });
    });

    if (!window.PointerEvent) {
        item.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            if (!touch) return;
            e.preventDefault();
            const drag = startTouchDrag(touch.clientX, touch.clientY);

            const move = (ev) => {
                const moveTouch = ev.touches[0];
                if (!moveTouch) return;
                drag.move(ev, moveTouch.clientX, moveTouch.clientY);
            };
            const end = (ev) => {
                const endTouch = ev.changedTouches[0];
                document.removeEventListener('touchmove', move);
                document.removeEventListener('touchend', end);
                document.removeEventListener('touchcancel', end);
                if (!endTouch) return;
                drag.end(ev, endTouch.clientX, endTouch.clientY);
            };

            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', end, { passive: false });
            document.addEventListener('touchcancel', end, { passive: false });
        }, { passive: false });
    }
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.sortable-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; } else { return closest; }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- 自動追加設定の描画 ---
function initSettingsModal() {
    const select = document.getElementById('auto-mat-select');
    if(select) select.innerHTML = materials.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

    let timeOptions = '';
    for(let i=0; i<=22; i++) {
        for(let m=0; m<60; m+=30) {
            if (i===22 && m>0) continue; 
            let totalMins = i * 60 + m;
            let h = (i + 5) % 24;
            let label = h + ':' + (m === 0 ? '00' : '30');
            if(i + 5 >= 24) label = '翌' + label;
            timeOptions += `<option value="${totalMins}">${label}</option>`;
        }
    }
    const st = document.getElementById('auto-start-time');
    const et = document.getElementById('auto-end-time');
    if(st) st.innerHTML = timeOptions;
    if(et) et.innerHTML = timeOptions;

    renderAutoAddRules();
}

function renderAutoAddRules() {
    const list = document.getElementById('auto-add-list'); if(!list) return;
    list.innerHTML = autoAddRules.map((rule, index) => {
        const mat = materials.find(m => m.id === rule.matId); if(!mat) return '';
        const startOpt = document.querySelector(`#auto-start-time option[value="${rule.start}"]`);
        const endOpt = document.querySelector(`#auto-end-time option[value="${rule.end}"]`);
        const startLabel = startOpt ? startOpt.innerText : rule.start;
        const endLabel = endOpt ? endOpt.innerText : rule.end;

        return `<div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:12px; align-items:center; background:#fff; padding:6px; border-radius:6px; border:1px solid #E2E8F0;">
            <span><span class="color-dot" style="background:${mat.color};"></span> ${mat.name} (${startLabel} ～ ${endLabel})</span>
            <button class="btn btn-danger" style="padding:4px 8px; font-size:10px;" onclick="deleteAutoAddRule(${index})">削除</button>
        </div>`;
    }).join('');
}

window.deleteAutoAddRule = function(index) {
    autoAddRules.splice(index, 1);
    renderAutoAddRules();
    saveLocalData();
};

function getDefaultBlockHeight() {
    const mins = Number(appSettings.defaultBlockMinutes);
    return Math.max(1, Number.isFinite(mins) ? mins : 60);
}

function initAppSettingsModal() {
    const confirmDayReset = document.getElementById('setting-confirm-day-reset');
    const defaultMinutes = document.getElementById('setting-default-minutes');

    if (confirmDayReset) confirmDayReset.checked = !!appSettings.confirmDayReset;
    if (defaultMinutes) defaultMinutes.value = getDefaultBlockHeight();
}

function saveAppSettingsFromModal() {
    const confirmDayReset = document.getElementById('setting-confirm-day-reset');
    const defaultMinutes = document.getElementById('setting-default-minutes');
    const minutes = parseInt(defaultMinutes?.value, 10);

    appSettings = {
        confirmDayReset: !!confirmDayReset?.checked,
        defaultBlockMinutes: Math.max(1, Number.isFinite(minutes) ? minutes : 60)
    };
    saveLocalData();
    document.getElementById('app-settings-modal')?.classList.add('modal-hidden');
}

// --- 履歴管理 ---
function saveState() {
    if (isProgrammaticChange) return;
    updateDailyTodos(); 
    updateNowNextPanel();
    const state = getBlocksState();
    if (undoStack[undoStack.length - 1] === state) {
        saveLocalData();
        return;
    }
    undoStack.push(state);
    redoStack = []; 
    saveLocalData();
}

function getBlocksState() {
    const blocks = [];
    document.querySelectorAll('.plan-block').forEach(block => {
        blocks.push({
            name: block.querySelector('.plan-block-content').innerText,
            note: block.dataset.note || '',
            colIndex: block.parentElement.dataset.colIndex,
            top: block.style.top,
            height: block.style.height,
            color: block.dataset.color,
            category: block.dataset.category
        });
    });
    return JSON.stringify(blocks);
}

function restoreState(stateStr) {
    if(!stateStr) return;
    isProgrammaticChange = true;
    const blocksData = JSON.parse(stateStr);
    document.querySelectorAll('.plan-block').forEach(b => b.remove());
    const grids = document.querySelectorAll('.day-col .day-grid');
    
    blocksData.forEach(b => {
        if(b.colIndex !== undefined && grids[b.colIndex]) {
            createBlock(grids[b.colIndex], b);
        }
    });
    updateDailyTodos(); 
    updateNowNextPanel();
    isProgrammaticChange = false;
}

function performUndo() {
    if (undoStack.length > 1) { 
        redoStack.push(undoStack.pop());
        restoreState(undoStack[undoStack.length - 1]);
        saveLocalData();
    }
}
function performRedo() {
    if (redoStack.length > 0) {
        const state = redoStack.pop();
        undoStack.push(state);
        restoreState(state);
        saveLocalData();
    }
}

function resetPlanner() {
    const blocks = document.querySelectorAll('.plan-block');
    if (blocks.length === 0) return;

    if (!confirm('計画表に入れた教材をすべてリセットしますか？\nUndo または Ctrl+Z で元に戻せます。')) {
        return;
    }

    const beforeResetState = getBlocksState();
    if (undoStack[undoStack.length - 1] !== beforeResetState) {
        undoStack.push(beforeResetState);
    }

    blocks.forEach(block => block.remove());
    if (currentEditingBlock) closeEditModal();
    updateDailyTodos();
    updateNowNextPanel();

    const afterResetState = getBlocksState();
    if (undoStack[undoStack.length - 1] !== afterResetState) {
        undoStack.push(afterResetState);
    }
    redoStack = [];
    saveLocalData();
}

function initShortcuts() {
    document.addEventListener('keydown', (e) => {
        const isUndoKey = e.key?.toLowerCase() === 'z' || e.code === 'KeyZ';
        const isRedoKey = e.key?.toLowerCase() === 'y' || e.code === 'KeyY';
        const modifierPressed = e.ctrlKey || e.metaKey;

        if (!modifierPressed || (!isUndoKey && !isRedoKey)) return;

        if (e.target.isContentEditable) return;

        e.preventDefault();
        e.stopPropagation();

        if ((isUndoKey && e.shiftKey) || isRedoKey) {
            performRedo();
        } else if (isUndoKey) {
            performUndo();
        }
    }, true);
}

// --- 日付管理 ---
function initDateLogic() {
    const startInput = document.getElementById('start-date-input');
    if(!startInput) return;
    if(!startInput.value) {
        const today = new Date();
        const diff = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
        const monday = new Date(today.setDate(diff));
        startInput.value = monday.toISOString().split('T')[0];
    }
    updateHeaders(parseDateInputValue(startInput.value));

    startInput.addEventListener('change', (e) => {
        if(e.target.value) {
            updateHeaders(parseDateInputValue(e.target.value));
            updateCurrentTimeIndicator();
            saveLocalData();
        }
    });
}

function parseDateInputValue(value) {
    if (!value) return new Date();
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return new Date(value);
    return new Date(year, month - 1, day);
}

function updateHeaders(startDate) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const headers = document.querySelectorAll('.day-header');
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return;
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dayLabel = days[d.getDay()] || '';
        if(headers[i+1]) {
            const label = headers[i+1].querySelector('.day-header-label');
            if (label) label.innerText = `${d.getMonth()+1}/${d.getDate()} (${dayLabel})`;
            else headers[i+1].innerText = `${d.getMonth()+1}/${d.getDate()} (${dayLabel})`;
        }
    }
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const sdDisplay = document.getElementById('display-start-date');
    const edDisplay = document.getElementById('display-end-date');
    if(sdDisplay) sdDisplay.innerText = `${startDate.getFullYear()}/${startDate.getMonth()+1}/${startDate.getDate()}`;
    if(edDisplay) edDisplay.innerText = `${endDate.getFullYear()}/${endDate.getMonth()+1}/${endDate.getDate()}`;
    updateCurrentTimeIndicator();
}

function initCurrentTimeIndicator() {
    updateCurrentTimeIndicator();
    if (currentTimeTimer) clearInterval(currentTimeTimer);
    currentTimeTimer = setInterval(updateCurrentTimeIndicator, 60 * 1000);
}

function getDateAtStartOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

function getDaysDiff(fromDate, toDate) {
    const from = getDateAtStartOfDay(fromDate);
    const to = getDateAtStartOfDay(toDate);
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function updateCurrentTimeIndicator() {
    const startInput = document.getElementById('start-date-input');
    if (!startInput?.value) return;

    document.querySelectorAll('.day-col').forEach(col => {
        col.classList.remove('is-today');
    });
    document.querySelector('.timetable .current-time-line')?.remove();

    const startDate = parseDateInputValue(startInput.value);
    const now = new Date();
    const todayIndex = getDaysDiff(startDate, now);

    const dayCols = document.querySelectorAll('.day-col');
    if (todayIndex >= 0 && todayIndex < dayCols.length) {
        dayCols[todayIndex].classList.add('is-today');
    }

    const scheduleDate = new Date(now);
    let scheduleHour = now.getHours();
    if (scheduleHour < 5) {
        scheduleDate.setDate(scheduleDate.getDate() - 1);
        scheduleHour += 24;
    }

    const lineTop = ((scheduleHour - 5) * 60) + now.getMinutes();
    if (lineTop < 0 || lineTop > MAX_HEIGHT_PX) {
        updateNowNextPanel();
        return;
    }

    const timetable = document.getElementById('timetable');
    if (!timetable) {
        updateNowNextPanel();
        return;
    }

    const line = document.createElement('div');
    line.className = 'current-time-line';
    const headerHeight = timetable.querySelector('.day-header')?.offsetHeight || 44;
    line.style.top = `${headerHeight + lineTop}px`;
    timetable.appendChild(line);
    updateNowNextPanel();
}

function getCurrentSchedulePosition() {
    const startInput = document.getElementById('start-date-input');
    if (!startInput?.value) return null;

    const startDate = parseDateInputValue(startInput.value);
    const now = new Date();
    const scheduleDate = new Date(now);
    let scheduleHour = now.getHours();

    if (scheduleHour < 5) {
        scheduleDate.setDate(scheduleDate.getDate() - 1);
        scheduleHour += 24;
    }

    const dayIndex = getDaysDiff(startDate, scheduleDate);
    const minuteInDay = ((scheduleHour - 5) * 60) + now.getMinutes();
    return {
        dayIndex,
        minuteInDay,
        absoluteMinute: (dayIndex * MAX_HEIGHT_PX) + minuteInDay
    };
}

function getScheduledPlanItems() {
    return Array.from(document.querySelectorAll('.day-grid .plan-block')).map(block => {
        const colIndex = parseInt(block.parentElement.dataset.colIndex, 10);
        const top = parseFloat(block.style.top) || 0;
        const height = parseFloat(block.style.height) || 0;

        return {
            name: block.dataset.name || block.querySelector('.plan-block-content')?.innerText || '',
            note: block.dataset.note || '',
            color: block.dataset.color || '#6f9de7',
            category: block.dataset.category || '',
            colIndex,
            top,
            height,
            start: (colIndex * MAX_HEIGHT_PX) + top,
            end: (colIndex * MAX_HEIGHT_PX) + top + height
        };
    }).sort((a, b) => a.start - b.start);
}

function formatScheduleTime(minute) {
    const totalMinutes = 5 * 60 + Math.round(minute);
    const hour = Math.floor(totalMinutes / 60);
    const displayHour = hour % 24;
    const displayMinute = totalMinutes % 60;
    const prefix = hour >= 24 ? '翌' : '';
    return `${prefix}${displayHour}:${String(displayMinute).padStart(2, '0')}`;
}

function renderSchedulePanelCard(container, item, statusText) {
    if (!container) return;

    if (!item) {
        container.className = 'schedule-placeholder';
        container.removeAttribute('style');
        container.innerHTML = '該当なし';
        return;
    }

    container.className = 'schedule-card';
    container.style.backgroundColor = hexToRgba(item.color, 0.2);
    container.style.borderLeftColor = item.color;
    const timeText = statusText
        ? `${escapeHtml(statusText)} / ${formatScheduleTime(item.top)}-${formatScheduleTime(item.top + item.height)}`
        : `${formatScheduleTime(item.top)}-${formatScheduleTime(item.top + item.height)}`;
    container.innerHTML = `
        <div class="schedule-card-time">${timeText}</div>
        <span class="plan-block-content">${escapeHtml(item.name)}</span>
        <span class="plan-block-note">${escapeHtml(item.note)}</span>
    `;
}

function updateNowNextPanel() {
    const currentContainer = document.getElementById('current-plan-card');
    const nextContainer = document.getElementById('next-plan-card');
    if (!currentContainer || !nextContainer) return;

    const position = getCurrentSchedulePosition();
    if (!position) {
        renderSchedulePanelCard(currentContainer, null, '');
        renderSchedulePanelCard(nextContainer, null, '');
        return;
    }

    const items = getScheduledPlanItems();
    const currentItem = items.find(item => item.start <= position.absoluteMinute && position.absoluteMinute < item.end);
    const nextItem = items.find(item => item.start > position.absoluteMinute);

    const currentStatus = currentItem ? `あと${Math.max(0, Math.ceil(currentItem.end - position.absoluteMinute))}分` : '';

    renderSchedulePanelCard(currentContainer, currentItem, currentStatus);
    renderSchedulePanelCard(nextContainer, nextItem, '');
}

// --- タイムテーブル生成 ---
function initTimetable() {
    const timetable = document.getElementById('timetable');
    if(!timetable) return;
    timetable.innerHTML = '';
    
    const timeCol = document.createElement('div');
    timeCol.className = 'time-col-labels';
    let timeHtml = `<div class="day-header"> </div><div class="time-grid">`;
    for(let i=0; i<22; i++) {
        let h = (i + 5) % 24;
        timeHtml += `<div class="grid-line"><span class="time-label">${h}:00</span></div>`;
    }
    timeHtml += `</div><div class="daily-footer" style="visibility:hidden;"></div>`;
    timeCol.innerHTML = timeHtml;
    timetable.appendChild(timeCol);

    for (let index = 0; index < 7; index++) {
        const col = document.createElement('div');
        col.className = 'day-col';
        
        let colHtml = `<div class="day-header">
            <span class="day-header-label"></span>
            <span class="day-actions">
                <button type="button" class="day-copy-btn" title="この日の予定をコピー" data-col-index="${index}">コピー</button>
                <button type="button" class="day-paste-btn" title="コピーした予定をこの日に貼り付け" data-col-index="${index}">貼付</button>
                <button type="button" class="day-reset-btn" title="この日の予定をリセット" data-col-index="${index}">リセット</button>
            </span>
        </div><div class="day-grid" data-col-index="${index}">`;
        for(let i=0; i<22; i++) {
            colHtml += `<div class="grid-line"></div><div class="grid-line-half" style="top: ${i * PX_PER_HOUR + PX_PER_30_MIN}px;"></div>`;
        }
        colHtml += `</div>`;
        
        let footerHtml = `<div class="daily-footer">
            <div class="footer-section">
                <div class="fs-title">To Do (教科)</div>
                <div class="todo-rows-container"></div>
            </div>
            <div class="footer-section">
                <div class="fs-title">To Do (その他)</div>
                <div class="other-rows-container"></div>
            </div>
            <div class="footer-section">
                <div class="fs-title">振り返り</div>
                <div class="achieve-row"><span>達成度(量)</span> <div><input type="number" class="daily-achieved" step="0.5">h / <input type="number" class="daily-total" step="0.5">h</div></div>
                <div class="achieve-row"><span>達成度(質)</span> <div class="quality-box" data-value="">-</div></div>
                <textarea class="reflection-textarea" placeholder="気づき・反省"></textarea>
            </div>
        `;
        
        if(index === 6) {
            footerHtml += `
            <div class="weekly-summary-box">
                <div class="fs-title">週集計</div>
                <div class="achieve-row"><span>達成度(量)</span> <div><input type="number" class="weekly-achieved" step="0.5">h / <input type="number" class="weekly-total" step="0.5">h</div></div>
                <div class="achieve-row"><span>達成度(質)</span> <div class="weekly-quality-display">-</div></div>
            </div>`;
        }
        
        footerHtml += `</div>`;
        col.innerHTML = colHtml + footerHtml;

        const grid = col.querySelector('.day-grid');
        grid.addEventListener('dragover', e => e.preventDefault());
        grid.addEventListener('drop', handleDrop);
        timetable.appendChild(col);
    }

    timetable.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.day-copy-btn');
        const pasteBtn = e.target.closest('.day-paste-btn');
        const resetBtn = e.target.closest('.day-reset-btn');

        if (copyBtn) {
            e.stopPropagation();
            copyDaySchedule(copyBtn.dataset.colIndex);
            return;
        }

        if (pasteBtn) {
            e.stopPropagation();
            pasteDaySchedule(pasteBtn.dataset.colIndex);
            return;
        }

        if (resetBtn) {
            e.stopPropagation();
            resetDaySchedule(resetBtn.dataset.colIndex);
        }
    });

    timetable.addEventListener('pointerdown', (e) => {
        if (!isTouchPlannerMode() || e.pointerType === 'mouse') return;
        if (e.target.closest('.plan-block, button, input, textarea, select')) return;
        const grid = e.target.closest('.day-grid');
        if (!grid) return;

        const startX = e.clientX;
        const startY = e.clientY;

        const clearOnTap = (ev) => {
            document.removeEventListener('pointerup', clearOnTap);
            document.removeEventListener('pointercancel', cancelClear);
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (Math.hypot(dx, dy) < 8) clearTouchReadyPlanBlock();
        };

        const cancelClear = () => {
            document.removeEventListener('pointerup', clearOnTap);
            document.removeEventListener('pointercancel', cancelClear);
        };

        document.addEventListener('pointerup', clearOnTap, { passive: true });
        document.addEventListener('pointercancel', cancelClear, { passive: true });
    });

    timetable.addEventListener('input', (e) => {
        const t = e.target;
        if(t.classList.contains('todo-time') || t.tagName === 'TEXTAREA' || t.classList.contains('daily-total') || t.classList.contains('weekly-achieved') || t.classList.contains('weekly-total')) {
            t.dataset.manual = t.value === "" ? "false" : "true";
        }

        if (t.classList.contains('todo-time')) {
            const col = t.closest('.day-col');
            if (col) {
                let sum = 0;
                col.querySelectorAll('.todo-time').forEach(inp => { sum += parseTime(inp.value); });
                const dailyTotalInput = col.querySelector('.daily-total');
                if (dailyTotalInput && dailyTotalInput.dataset.manual !== "true") {
                    dailyTotalInput.value = sum > 0 ? sum.toFixed(1).replace('.0', '') : '';
                }
            }
        }
        updateWeeklySummary();
        if (t.matches('.todo-row textarea')) autosizeTodoTextarea(t);
        saveLocalData();
    });
}

// --- 質(Quality)ポップアップ制御 ---
function openQualitySelector(box) {
    const popup = document.getElementById('quality-selector-popup');
    if (!popup) return;

    activeQualityBox = box;
    const rect = activeQualityBox.getBoundingClientRect();
    const popupWidth = 190;
    const left = Math.max(8, window.scrollX + rect.left - (popupWidth / 2) + (rect.width / 2));

    popup.style.top = (window.scrollY + rect.bottom + 5) + 'px';
    popup.style.left = left + 'px';
    popup.classList.remove('modal-hidden');
    popup.classList.add('modal-open');
}

function closeQualitySelector() {
    const popup = document.getElementById('quality-selector-popup');
    if (!popup) return;

    popup.classList.remove('modal-open');
    popup.classList.add('modal-hidden');
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('quality-box')) {
        e.stopPropagation();
        openQualitySelector(e.target);
    } else if (e.target.classList.contains('q-opt')) {
        e.stopPropagation();
        if (activeQualityBox) {
            const val = e.target.dataset.value;
            activeQualityBox.dataset.value = val;
            activeQualityBox.innerText = val === "" ? "-" : val;
            updateWeeklySummary();
            saveLocalData();
        }
        closeQualitySelector();
    } else {
        closeQualitySelector();
    }
});

function handleDrop(e) {
    e.preventDefault();
    const grid = e.currentTarget;
    const passedHeight = e.dataTransfer.getData('height');
    const finalHeight = passedHeight ? parseFloat(passedHeight) : getDefaultBlockHeight();
    const name = e.dataTransfer.getData('name');
    if(!name) return; 

    createMaterialBlockAtPoint(grid, e.clientY, {
        name: name,
        color: e.dataTransfer.getData('color'),
        category: e.dataTransfer.getData('category'),
        note: e.dataTransfer.getData('note'),
        height: finalHeight
    }, {
        snapInterval: e.shiftKey ? PX_PER_10_MIN : PX_PER_30_MIN,
        dragOffsetY: parseFloat(e.dataTransfer.getData('dragOffsetY')) || 0
    });
    if (e.dataTransfer.getData('planAction') === 'move') {
        draggedPlanBlockDropped = true;
    }
    saveState(); 
}

function createMaterialBlockAtPoint(grid, clientY, data, options = {}) {
    if (!isValidPlannerGrid(grid)) return;

    const rect = grid.getBoundingClientRect();
    const scaleY = rect.height > 0 ? rect.height / MAX_HEIGHT_PX : 1;
    const dragOffsetY = options.dragOffsetY || 0;
    const offsetY = ((clientY - rect.top) / scaleY) - dragOffsetY;
    const snapInterval = options.snapInterval || PX_PER_30_MIN;
    const snappedY = Math.floor(offsetY / snapInterval) * snapInterval;

    let top = Math.max(0, snappedY);
    let height = parseFloat(data.height) || getDefaultBlockHeight();

    if (top + height > MAX_HEIGHT_PX) {
        top = MAX_HEIGHT_PX - height;
        if (top < 0) {
            top = 0;
            height = MAX_HEIGHT_PX;
        }
    }

    createBlock(grid, {
        name: data.name,
        color: data.color,
        category: data.category,
        note: data.note || '',
        top,
        height
    });
}

function isValidPlannerGrid(grid) {
    return !!grid && grid.classList.contains('day-grid') && grid.dataset.colIndex !== undefined;
}

function getPlannerGridAtPoint(clientX, clientY) {
    const dropTarget = document.elementFromPoint(clientX, clientY);
    const grid = dropTarget?.closest?.('.day-grid');
    return isValidPlannerGrid(grid) ? grid : null;
}

function getSnappedBlockTopFromPoint(grid, clientY, height, dragOffsetY = 0, snapInterval = PX_PER_30_MIN) {
    const rect = grid.getBoundingClientRect();
    const scaleY = rect.height > 0 ? rect.height / MAX_HEIGHT_PX : 1;
    const offsetY = ((clientY - rect.top) / scaleY) - dragOffsetY;
    const snappedY = Math.floor(offsetY / snapInterval) * snapInterval;
    return Math.max(0, Math.min(snappedY, MAX_HEIGHT_PX - height));
}

function movePlanBlockAtPoint(block, clientX, clientY, dragOffsetY = 0) {
    const grid = getPlannerGridAtPoint(clientX, clientY);
    if (!grid) return false;

    const height = parseFloat(block.style.height) || getDefaultBlockHeight();
    const top = getSnappedBlockTopFromPoint(grid, clientY, height, dragOffsetY);
    if (block.parentElement !== grid) grid.appendChild(block);
    block.style.top = `${top}px`;
    return true;
}

function createBlock(parentGrid, data) {
    const block = document.createElement('div');
    block.className = 'plan-block';
    block.style.backgroundColor = hexToRgba(data.color, 0.2);
    block.style.borderLeftColor = data.color;
    block.style.top = data.top + (typeof data.top === 'number' ? 'px' : '');
    block.style.height = data.height + (typeof data.height === 'number' ? 'px' : '');
    
    block.dataset.category = data.category;
    block.dataset.color = data.color;
    block.dataset.name = data.name;
    block.dataset.note = data.note || '';
    
    block.innerHTML = `
        <div class="resize-handle-top"></div>
        <span class="plan-block-content">${escapeHtml(data.name)}</span>
        <span class="plan-block-note">${escapeHtml(data.note || '')}</span>
        <div class="resize-handle-bottom"></div>
    `;
    
    block.draggable = !isTouchPlannerMode();
    block.addEventListener('dragstart', (e) => {
        const rect = block.getBoundingClientRect();
        const blockData = {
            name: block.dataset.name || data.name,
            color: block.dataset.color || data.color,
            category: block.dataset.category || data.category,
            note: block.dataset.note || '',
            top: block.style.top,
            height: block.style.height
        };

        if(!e.altKey) {
            const originGrid = block.parentElement;
            draggedPlanBlockMove = { originGrid, blockData };
            draggedPlanBlockDropped = false;
            setTimeout(() => { 
                block.remove(); 
            }, 0);
            e.dataTransfer.setData('planAction', 'move');
        } else {
            e.dataTransfer.setData('planAction', 'copy');
        }
        e.dataTransfer.setData('application/x-plan-block', 'true');
        e.dataTransfer.setData('name', blockData.name);
        e.dataTransfer.setData('color', blockData.color);
        e.dataTransfer.setData('category', blockData.category);
        e.dataTransfer.setData('height', blockData.height);
        e.dataTransfer.setData('note', blockData.note);
        e.dataTransfer.setData('dragOffsetY', String(Math.max(0, e.clientY - rect.top)));
    });
    
    block.addEventListener('dragend', () => {
        document.querySelector('.sidebar')?.classList.remove('delete-drop-target');
        if (draggedPlanBlockMove && !draggedPlanBlockDropped) {
            createBlock(draggedPlanBlockMove.originGrid, draggedPlanBlockMove.blockData);
        }
        draggedPlanBlockMove = null;
        draggedPlanBlockDropped = false;
    });

    block.addEventListener('click', (e) => {
        if(isResizing || e.target.className.includes('resize')) return; 
        if (isTouchPlannerMode()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        openEditModal(block);
    });

    block.querySelector('.resize-handle-top').addEventListener('mousedown', (e) => initResize(e, 'top', block));
    block.querySelector('.resize-handle-bottom').addEventListener('mousedown', (e) => initResize(e, 'bottom', block));
    block.querySelectorAll('.resize-handle-top, .resize-handle-bottom').forEach(handle => {
        handle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isTouchPlannerMode()) return;
            if (!isResizing) openEditModal(block);
        });
    });
    initTouchPlanBlock(block);

    parentGrid.appendChild(block);
}

function initTouchPlanBlock(block) {
    block.addEventListener('pointerdown', (e) => {
        if (!isTouchPlannerMode() || e.pointerType === 'mouse') return;
        if (e.button && e.button !== 0) return;
        e.stopPropagation();

        const wasReady = touchReadyPlanBlock === block;
        const startX = e.clientX;
        const startY = e.clientY;
        const resizeHandle = e.target.closest('.resize-handle-top, .resize-handle-bottom');
        const resizeEdge = resizeHandle?.classList.contains('resize-handle-top') ? 'top' : (resizeHandle ? 'bottom' : null);
        const startGrid = block.parentElement;
        const startTop = block.style.top;
        const startTopPx = parseFloat(block.style.top) || 0;
        const startHeight = parseFloat(block.style.height) || getDefaultBlockHeight();
        let gesture = null;
        let moved = false;
        let longPressReady = false;
        const rect = block.getBoundingClientRect();
        const dragOffsetY = Math.max(0, startY - rect.top);

        const selectBlock = () => {
            clearTouchReadyPlanBlock(block);
            touchReadyPlanBlock = block;
            block.classList.add('is-touch-ready');
        };

        const resizeBlock = (clientY) => {
            const dy = clientY - startY;

            if (resizeEdge === 'bottom') {
                const rawHeight = Math.max(PX_PER_10_MIN, startHeight + dy);
                let snappedHeight = Math.round(rawHeight / PX_PER_10_MIN) * PX_PER_10_MIN;
                snappedHeight = Math.min(snappedHeight, MAX_HEIGHT_PX - startTopPx);
                block.style.height = `${snappedHeight}px`;
                return;
            }

            const bottom = startTopPx + startHeight;
            const rawTop = Math.max(0, Math.min(startTopPx + dy, bottom - PX_PER_10_MIN));
            const snappedTop = Math.max(0, Math.min(Math.round(rawTop / PX_PER_10_MIN) * PX_PER_10_MIN, bottom - PX_PER_10_MIN));
            block.style.top = `${snappedTop}px`;
            block.style.height = `${bottom - snappedTop}px`;
        };

        const longPressTimer = !resizeEdge ? setTimeout(() => {
            longPressReady = true;
            selectBlock();
            document.body.classList.add('material-dragging');
            setPointerCaptureSafely(block, e.pointerId);
        }, 420) : null;

        if (wasReady && resizeEdge) {
            e.preventDefault();
            document.body.classList.add('material-dragging');
            setPointerCaptureSafely(block, e.pointerId);
        }

        const move = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            if (!resizeEdge && !longPressReady && Math.hypot(dx, dy) >= 8) {
                clearTimeout(longPressTimer);
                cleanup();
                return;
            }

            if (!gesture && Math.hypot(dx, dy) < 8) return;

            if (!gesture) {
                if (wasReady && resizeEdge) {
                    gesture = 'resize';
                } else if (longPressReady) {
                    gesture = 'move';
                } else {
                    return;
                }
            }

            ev.preventDefault();

            if (gesture === 'resize') {
                resizeBlock(ev.clientY);
                return;
            }

            moved = movePlanBlockAtPoint(block, ev.clientX, ev.clientY, dragOffsetY) || moved;
        };

        const cleanup = () => {
            clearTimeout(longPressTimer);
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', end);
            document.removeEventListener('pointercancel', cancel);
            releasePointerCaptureSafely(block, e.pointerId);
            document.body.classList.remove('material-dragging');
        };

        const end = (ev) => {
            cleanup();

            if (gesture === 'move') {
                ev.preventDefault();
                if (!moved && startGrid) {
                    startGrid.appendChild(block);
                    block.style.top = startTop;
                }
                saveState();
                return;
            }

            if (gesture === 'resize') {
                ev.preventDefault();
                saveState();
                return;
            }

            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (Math.hypot(dx, dy) < 8) {
                ev.preventDefault();
                if (wasReady) {
                    openEditModal(block);
                    clearTouchReadyPlanBlock();
                } else {
                    selectBlock();
                }
            }
        };

        const cancel = () => {
            cleanup();
            if (startGrid) {
                startGrid.appendChild(block);
                block.style.top = startTop;
                block.style.height = `${startHeight}px`;
            }
        };

        document.addEventListener('pointermove', move, { passive: false });
        document.addEventListener('pointerup', end, { passive: false });
        document.addEventListener('pointercancel', cancel, { passive: false });
    });
}

function getDayBlockData(grid) {
    return Array.from(grid.querySelectorAll('.plan-block')).map(block => ({
        name: block.dataset.name || block.querySelector('.plan-block-content').innerText,
        note: block.dataset.note || '',
        top: block.style.top,
        height: block.style.height,
        color: block.dataset.color,
        category: block.dataset.category
    }));
}

function getBlockIntervals(grid) {
    return Array.from(grid.querySelectorAll('.plan-block')).map(block => {
        const top = parseFloat(block.style.top) || 0;
        const height = parseFloat(block.style.height) || 0;
        return { start: top, end: top + height };
    });
}

function hasTimeOverlap(start, height, intervals) {
    const end = start + height;
    return intervals.some(interval => start < interval.end && end > interval.start);
}

function getNonOverlappingTop(desiredTop, height, intervals) {
    const clampedTop = Math.max(0, Math.min(desiredTop, MAX_HEIGHT_PX - height));
    if (!hasTimeOverlap(clampedTop, height, intervals)) return clampedTop;
    return null;
}

function copyDaySchedule(colIndex) {
    const grid = document.querySelector(`.day-grid[data-col-index="${colIndex}"]`);
    if (!grid) return;

    copiedDayBlocks = getDayBlockData(grid);
    setStatusMessage(copiedDayBlocks.length > 0 ? '1日の予定をコピーしました' : 'コピーする予定がありません');
    clearStatusMessage();
}

function pasteDaySchedule(colIndex) {
    if (copiedDayBlocks.length === 0) {
        setStatusMessage('先に予定をコピーしてください');
        clearStatusMessage();
        return;
    }

    const grid = document.querySelector(`.day-grid[data-col-index="${colIndex}"]`);
    if (!grid) return;

    const intervals = getBlockIntervals(grid);
    let pastedCount = 0;
    let skippedCount = 0;

    copiedDayBlocks.forEach(blockData => {
        const desiredTop = parseFloat(blockData.top) || 0;
        const height = parseFloat(blockData.height) || PX_PER_HOUR;
        const availableTop = getNonOverlappingTop(desiredTop, height, intervals);

        if (availableTop === null) {
            skippedCount++;
            return;
        }

        createBlock(grid, { ...blockData, top: availableTop, height });
        intervals.push({ start: availableTop, end: availableTop + height });
        pastedCount++;
    });

    if (pastedCount > 0) saveState();
    const message = pastedCount === 0
        ? '貼り付け先に空きがありません'
        : skippedCount > 0
            ? `予定を貼り付けました (${skippedCount}件は空きなし)`
            : '予定を貼り付けました';
    setStatusMessage(message);
    clearStatusMessage();
}

function resetDaySchedule(colIndex) {
    const grid = document.querySelector(`.day-grid[data-col-index="${colIndex}"]`);
    if (!grid) return;

    const blocks = grid.querySelectorAll('.plan-block');
    if (blocks.length === 0) {
        setStatusMessage('リセットする予定がありません');
        clearStatusMessage();
        return;
    }

    if (appSettings.confirmDayReset && !confirm('この日の予定をリセットしますか？\nUndo または Ctrl+Z で元に戻せます。')) {
        return;
    }

    const beforeResetState = getBlocksState();
    if (undoStack[undoStack.length - 1] !== beforeResetState) {
        undoStack.push(beforeResetState);
    }

    blocks.forEach(block => block.remove());
    updateDailyTodos();
    updateNowNextPanel();

    const afterResetState = getBlocksState();
    if (undoStack[undoStack.length - 1] !== afterResetState) {
        undoStack.push(afterResetState);
    }
    redoStack = [];
    saveLocalData();
    setStatusMessage('この日の予定をリセットしました');
    clearStatusMessage();
}

function setBlockNote(block, note) {
    const cleanNote = note.trim();
    block.dataset.note = cleanNote;
    const noteEl = block.querySelector('.plan-block-note');
    if (noteEl) noteEl.innerText = cleanNote;
}

function autosizeTodoTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(32, textarea.scrollHeight)}px`;
}

function autosizeTodoTextareas(root = document) {
    root.querySelectorAll('.todo-row textarea').forEach(autosizeTodoTextarea);
}

function initModalScrollLock() {
    const modals = Array.from(document.querySelectorAll('#edit-modal, #sidebar-manage-modal, #mat-edit-modal, #export-modal, #download-format-modal, #settings-modal, #app-settings-modal, #folder-sort-modal, #gcal-modal'));
    if (modals.length === 0) return;

    const updateLock = () => {
        const hasOpenModal = modals.some(modal => !modal.classList.contains('modal-hidden'));
        document.body.classList.toggle('modal-open', hasOpenModal);
    };

    modals.forEach(modal => {
        new MutationObserver(updateLock).observe(modal, { attributes: true, attributeFilter: ['class'] });
        modal.addEventListener('touchmove', (e) => {
            if (e.target === modal) e.preventDefault();
        }, { passive: false });
    });
    updateLock();
}

function initResponsivePlanner() {
    initSidebarToggle();
    moveNowNextPanelForViewport();
    updateSidebarDrawerState();
    updatePlannerScale();
    window.addEventListener('resize', () => {
        moveNowNextPanelForViewport();
        updateSidebarDrawerState();
        updatePlannerScale();
    });
    window.addEventListener('orientationchange', () => setTimeout(() => {
        moveNowNextPanelForViewport();
        updateSidebarDrawerState();
        updatePlannerScale();
    }, 250));
}

function initSidebarToggle() {
    const toggle = document.getElementById('sidebar-toggle-btn');
    const sidebar = document.getElementById('sidebar');
    if (!toggle || !sidebar || toggle.dataset.ready === 'true') return;

    toggle.dataset.ready = 'true';
    toggle.addEventListener('click', () => {
        const isClosed = sidebar.classList.toggle('is-collapsed');
        updateSidebarDrawerState();
        setTimeout(updatePlannerScale, 220);
    });
}

function updateSidebarDrawerState() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle-btn');
    const isMobile = window.innerWidth <= SIDEBAR_DRAWER_BREAKPOINT;
    const isOpen = isMobile && sidebar && !sidebar.classList.contains('is-collapsed');

    document.body.classList.toggle('sidebar-drawer-open', !!isOpen);
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(!!isOpen));
        toggle.innerText = isOpen ? '教材' : '教材を開く';
    }
}

function moveNowNextPanelForViewport() {
    const panel = document.getElementById('now-next-panel');
    const mobileSlot = document.getElementById('sidebar-now-next-slot');
    const plannerLayout = document.querySelector('.planner-layout');
    const sidebar = document.getElementById('sidebar');
    if (!panel || !mobileSlot || !plannerLayout) return;

    if (!nowNextOriginalParent) nowNextOriginalParent = plannerLayout;

    if (window.innerWidth <= SIDEBAR_DRAWER_BREAKPOINT) {
        if (sidebar && sidebar.dataset.mobileInitialized !== 'true') {
            sidebar.classList.add('is-collapsed');
            sidebar.dataset.mobileInitialized = 'true';
        }
        if (panel.parentElement !== mobileSlot) mobileSlot.appendChild(panel);
        return;
    }

    if (panel.parentElement !== nowNextOriginalParent) {
        nowNextOriginalParent.appendChild(panel);
    }
    sidebar?.classList.remove('is-collapsed');
    if (sidebar) sidebar.dataset.mobileInitialized = 'false';
    document.body.classList.remove('sidebar-drawer-open');
    const toggle = document.getElementById('sidebar-toggle-btn');
    if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.innerText = '教材';
    }
}

function updatePlannerScale() {
    const board = document.getElementById('capture-area');
    const layout = board?.querySelector('.planner-layout');
    const timetable = board?.querySelector('.timetable');
    if (!board || !layout || !timetable || board.classList.contains('is-exporting')) return;

    board.style.removeProperty('--planner-scale');
    if (window.innerWidth > SIDEBAR_DRAWER_BREAKPOINT) {
        board.classList.remove('is-scaled-mobile');
        return;
    }

    const availableWidth = Math.max(320, board.clientWidth - 40);
    const layoutWidth = timetable.scrollWidth;
    const scale = Math.min(1, availableWidth / layoutWidth);
    board.style.setProperty('--planner-scale', scale.toFixed(3));
    board.classList.toggle('is-scaled-mobile', scale < 1);
}

function initResize(e, edge, block) {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    
    const startY = e.clientY;
    const startTop = parseFloat(block.style.top);
    const startHeight = parseFloat(block.style.height);

    function resize(ev) {
        const dy = ev.clientY - startY;
        const snapInterval = ev.shiftKey ? PX_PER_10_MIN : PX_PER_30_MIN; 
        
        if (edge === 'bottom') {
            const newHeight = startHeight + dy;
            let snappedHeight = Math.max(PX_PER_10_MIN, Math.round(newHeight / snapInterval) * snapInterval);
            
            if (startTop + snappedHeight > MAX_HEIGHT_PX) {
                snappedHeight = MAX_HEIGHT_PX - startTop;
            }
            block.style.height = snappedHeight + 'px';
            
        } else if (edge === 'top') {
            const newTop = startTop + dy;
            let snappedTop = Math.max(0, Math.round(newTop / snapInterval) * snapInterval);
            let snappedHeight = startHeight + (startTop - snappedTop);

            if (snappedHeight >= PX_PER_10_MIN) {
                block.style.top = snappedTop + 'px';
                block.style.height = snappedHeight + 'px';
            }
        }
    }

    function stopResize() {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResize);
        saveState(); 
        setTimeout(() => isResizing = false, 100);
    }

    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResize);
}

function initTouchResize(e, edge, block) {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    document.body.classList.add('material-dragging');

    const startY = e.clientY;
    const startTop = parseFloat(block.style.top) || 0;
    const startHeight = parseFloat(block.style.height) || getDefaultBlockHeight();
    setPointerCaptureSafely(block, e.pointerId);

    const resize = (ev) => {
        ev.preventDefault();
        const dy = ev.clientY - startY;

        if (edge === 'bottom') {
            const newHeight = Math.max(PX_PER_10_MIN, startHeight + dy);
            let snappedHeight = Math.round(newHeight / PX_PER_10_MIN) * PX_PER_10_MIN;
            if (startTop + snappedHeight > MAX_HEIGHT_PX) snappedHeight = MAX_HEIGHT_PX - startTop;
            block.style.height = `${snappedHeight}px`;
            return;
        }

        const newTop = Math.max(0, startTop + dy);
        const snappedTop = Math.round(newTop / PX_PER_10_MIN) * PX_PER_10_MIN;
        const snappedHeight = startHeight + (startTop - snappedTop);
        if (snappedHeight >= PX_PER_10_MIN) {
            block.style.top = `${snappedTop}px`;
            block.style.height = `${snappedHeight}px`;
        }
    };

    const stopResize = (ev) => {
        ev.preventDefault();
        document.removeEventListener('pointermove', resize);
        document.removeEventListener('pointerup', stopResize);
        document.removeEventListener('pointercancel', cancelResize);
        releasePointerCaptureSafely(block, e.pointerId);
        document.body.classList.remove('material-dragging');
        saveState();
        updateDailyTodos();
        setTimeout(() => { isResizing = false; }, 100);
    };

    const cancelResize = () => {
        document.removeEventListener('pointermove', resize);
        document.removeEventListener('pointerup', stopResize);
        document.removeEventListener('pointercancel', cancelResize);
        releasePointerCaptureSafely(block, e.pointerId);
        document.body.classList.remove('material-dragging');
        block.style.top = `${startTop}px`;
        block.style.height = `${startHeight}px`;
        setTimeout(() => { isResizing = false; }, 100);
    };

    document.addEventListener('pointermove', resize, { passive: false });
    document.addEventListener('pointerup', stopResize, { passive: false });
    document.addEventListener('pointercancel', cancelResize, { passive: false });
}

// --- 自動集計 ---
function updateDailyTodos() {
    const dayCols = document.querySelectorAll('.day-col');
    dayCols.forEach(col => {
        const blocks = col.querySelectorAll('.plan-block');
        const subjects = {};
        const others = {};
        let totalDailyMins = 0;

        blocks.forEach(block => {
            const height = parseFloat(block.style.height);
            const mins = Math.round((height / PX_PER_HOUR) * 60);
            const name = block.dataset.name || block.querySelector('.plan-block-content').innerText;
            const category = block.dataset.category;
            const note = (block.dataset.note || '').trim();

            const addTodoData = (target) => {
                if (!target[name]) {
                    target[name] = { mins: 0, notes: [] };
                }
                target[name].mins += mins;
                if (note) target[name].notes.push(note);
            };

            if (category === 'subject') {
                addTodoData(subjects);
                totalDailyMins += mins;
            } else if (category === 'other') {
                addTodoData(others);
                totalDailyMins += mins;
            }
        });

        const updateRows = (containerClass, data, minRows) => {
            const container = col.querySelector(containerClass);
            if (!container) return;
            
            const names = Object.keys(data);
            const requiredRows = Math.max(minRows, names.length);
            
            const existingRows = Array.from(container.querySelectorAll('.todo-row'));
            const savedState = existingRows.map(row => {
                const ta = row.querySelector('textarea');
                const ti = row.querySelector('.todo-time');
                return {
                    textVal: ta.value, textMan: ta.dataset.manual,
                    timeVal: ti.value, timeMan: ti.dataset.manual
                };
            });
            
            container.innerHTML = ''; 
            
            for (let i = 0; i < requiredRows; i++) {
                const row = document.createElement('div');
                row.className = 'todo-row';
                row.innerHTML = `<textarea rows="2"></textarea><input type="text" class="todo-time" placeholder="h">`;
                const ta = row.querySelector('textarea');
                const ti = row.querySelector('.todo-time');
                
                if (savedState[i]) {
                    if (savedState[i].textMan === "true") ta.dataset.manual = "true";
                    if (savedState[i].timeMan === "true") ti.dataset.manual = "true";
                }
                
                if (i < names.length) {
                    const name = names[i];
                    const item = data[name];
                    const h = (item.mins / 60).toFixed(1).replace('.0', '');
                    const uniqueNotes = [...new Set(item.notes)];
                    const todoText = uniqueNotes.length > 0 ? `${name}: ${uniqueNotes.join(', ')}` : name;
                    
                    ta.value = todoText;
                    ta.dataset.manual = "false";
                    ti.value = `${h}h`;
                    ti.dataset.manual = "false";
                } else {
                    if (ta.dataset.manual !== "true") ta.value = '';
                    else ta.value = savedState[i].textVal;
                    
                    if (ti.dataset.manual !== "true") ti.value = '';
                    else ti.value = savedState[i].timeVal;
                }
                
                container.appendChild(row);
                autosizeTodoTextarea(ta);
            }
        };

        updateRows('.todo-rows-container', subjects, 4);
        updateRows('.other-rows-container', others, 3);

        let sum = 0;
        col.querySelectorAll('.todo-time').forEach(inp => {
            sum += parseTime(inp.value);
        });

        const dailyTotalInput = col.querySelector('.daily-total');
        if (dailyTotalInput && dailyTotalInput.dataset.manual !== "true") {
            dailyTotalInput.value = sum > 0 ? sum.toFixed(1).replace('.0', '') : '';
        }
    });
    
    updateWeeklySummary();
}

function updateWeeklySummary() {
    let sumAchieved = 0;
    let sumTotal = 0;
    let sumQuality = 0;
    
    document.querySelectorAll('.daily-achieved').forEach(input => {
        sumAchieved += parseFloat(input.value) || 0;
    });
    document.querySelectorAll('.daily-total').forEach(input => {
        sumTotal += parseFloat(input.value) || 0;
    });
    document.querySelectorAll('.quality-box').forEach(box => {
        sumQuality += parseInt(box.dataset.value) || 0;
    });

    const weekAchieved = document.querySelector('.weekly-achieved');
    const weekTotal = document.querySelector('.weekly-total');
    const weekQualityDisplay = document.querySelector('.weekly-quality-display'); 

    if (weekAchieved && weekAchieved.dataset.manual !== "true") {
        weekAchieved.value = sumAchieved > 0 ? sumAchieved.toFixed(1).replace('.0', '') : '';
    }
    if (weekTotal && weekTotal.dataset.manual !== "true") {
        weekTotal.value = sumTotal > 0 ? sumTotal.toFixed(1).replace('.0', '') : '';
    }
    if (weekQualityDisplay) {
        weekQualityDisplay.innerText = sumQuality > 0 ? sumQuality : '-';
    }
}

// --- 保存・書き出し系 ---
function setStatusMessage(message) {
    const statusEl = document.getElementById('status-msg');
    if (statusEl) statusEl.innerText = message;
}

function clearStatusMessage(delay = 1500) {
    setTimeout(() => setStatusMessage(''), delay);
}

function getPlannerFileBaseName() {
    const startInput = document.getElementById('start-date-input');
        const startDate = startInput?.value ? parseDateInputValue(startInput.value) : new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const formatDate = (date) => `${date.getMonth() + 1}.${date.getDate()}`;
    return `${formatDate(startDate)}~${formatDate(endDate)}の計画表`;
}

async function capturePlannerCanvas() {
    const area = document.getElementById('capture-area');
    if (!area) throw new Error('capture-area not found');
    if (typeof html2canvas !== 'function') {
        throw new Error('html2canvas is not available');
    }
    updateDailyTodos();
    autosizeTodoTextareas(area);
    area.classList.add('is-exporting');
    try {
        await new Promise(resolve => requestAnimationFrame(resolve));
        return await html2canvas(area, { scale: 2, windowWidth: area.scrollWidth, windowHeight: area.scrollHeight });
    } finally {
        area.classList.remove('is-exporting');
        updatePlannerScale();
    }
}

async function downloadPlanner(format) {
    const modal = document.getElementById('download-format-modal');
    if (modal) modal.classList.add('modal-hidden');

    try {
        setStatusMessage('DL準備中...');
        const canvas = await capturePlannerCanvas();

        if (format === 'image') {
            const link = document.createElement('a');
            link.download = `${getPlannerFileBaseName()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            setStatusMessage('画像ダウンロード完了');
            clearStatusMessage();
            return;
        }

        const jsPDF = window.jspdf?.jsPDF;
        if (!jsPDF) {
            alert('PDF生成ライブラリの読み込みに失敗しました。画像ダウンロードを使ってください。');
            setStatusMessage('');
            return;
        }

        const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 6;
        const maxWidth = pageWidth - margin * 2;
        const maxHeight = pageHeight - margin * 2;
        const imageRatio = canvas.width / canvas.height;
        const pageRatio = maxWidth / maxHeight;

        let imageWidth = maxWidth;
        let imageHeight = imageWidth / imageRatio;
        if (imageRatio < pageRatio) {
            imageHeight = maxHeight;
            imageWidth = imageHeight * imageRatio;
        }

        const x = (pageWidth - imageWidth) / 2;
        const y = (pageHeight - imageHeight) / 2;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imageWidth, imageHeight);
        pdf.save(`${getPlannerFileBaseName()}.pdf`);
        setStatusMessage('PDF ダウンロード完了');
        clearStatusMessage();
    } catch (err) {
        console.error(err);
        if (err.message === 'html2canvas is not available') {
            alert('画像生成ライブラリの読み込みに失敗しました。オンライン状態で再読み込みしてからもう一度試してください。');
            setStatusMessage('');
            return;
        }
        alert('ダウンロードに失敗しました。もう一度試してください。');
        setStatusMessage('');
    }
}

function saveLocalData() {
    const inputs = Array.from(document.querySelectorAll('.timetable input, .timetable textarea')).map(el => ({
        val: el.value,
        manual: el.dataset.manual || "false"
    }));
    const qualityStates = Array.from(document.querySelectorAll('.quality-box')).map(b => b.dataset.value || "");
    
    const wtContent = document.getElementById('wt-content');
    const mtContent = document.getElementById('mt-content');
    const data = { 
        blocksState: getBlocksState(), 
        inputs, 
        qualityStates,
        startDate: document.getElementById('start-date-input').value,
        folders: folders,
        materials: materials,
        autoAddRules: autoAddRules,
        appSettings: appSettings,
        weeklyTasksHtml: wtContent ? wtContent.innerHTML : '',
        monthlyTasksHtml: mtContent ? mtContent.innerHTML : ''
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
}

function loadLocalData() {
    const jsonStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if(!jsonStr) return;
    
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch (err) {
        console.error('保存データの読み込みに失敗しました', err);
        return;
    }
    
    if(data.folders) {
        folders = data.folders;
        if (!folders.find(f => f.id === 'f-all')) {
            folders.unshift({ id: 'f-all', name: '全て表示' });
        }
    }
    if(data.materials) materials = data.materials;
    if(data.autoAddRules) autoAddRules = data.autoAddRules;
    if(data.appSettings) {
        appSettings = {
            confirmDayReset: data.appSettings.confirmDayReset ?? appSettings.confirmDayReset,
            defaultBlockMinutes: data.appSettings.defaultBlockMinutes ?? appSettings.defaultBlockMinutes
        };
    }
    if(typeof initSidebar === 'function') initSidebar();
    
    const wtContent = document.getElementById('wt-content');
    if(data.weeklyTasksHtml && wtContent) wtContent.innerHTML = data.weeklyTasksHtml;

    const mtContent = document.getElementById('mt-content');
    if(data.monthlyTasksHtml && mtContent) mtContent.innerHTML = data.monthlyTasksHtml;
    
    if(data.blocksState) restoreState(data.blocksState);
    if(data.startDate) {
        const sInput = document.getElementById('start-date-input');
        if(sInput) sInput.value = data.startDate;
        if(typeof updateHeaders === 'function') updateHeaders(parseDateInputValue(data.startDate));
    }
    
    const allInputs = document.querySelectorAll('.timetable input, .timetable textarea');
    (data.inputs || []).forEach((item, i) => {
        if(allInputs[i]) {
            const val = typeof item === 'object' ? item.val : item;
            const manual = typeof item === 'object' ? item.manual : "false";
            allInputs[i].value = val;
            allInputs[i].dataset.manual = manual;
        }
    });

    const allBoxes = document.querySelectorAll('.quality-box');
    (data.qualityStates || []).forEach((val, i) => {
        if(allBoxes[i]) {
            allBoxes[i].dataset.value = val;
            allBoxes[i].innerText = val === "" ? "-" : val;
        }
    });
    
    if(typeof updateDailyTodos === 'function') updateDailyTodos();
    if(typeof updateWeeklySummary === 'function') updateWeeklySummary();
}

function exportAllData() {
    saveLocalData(); 
    const dataStr = localStorage.getItem(LOCAL_STORAGE_KEY) || "{}";
    downloadDataFile(JSON.parse(dataStr), 'AllDATA.data');
    document.getElementById('export-modal').classList.add('modal-hidden');
}

function exportPlannerData() {
    const inputs = Array.from(document.querySelectorAll('.timetable input, .timetable textarea')).map(el => ({
        val: el.value,
        manual: el.dataset.manual || "false"
    }));
    const qualityStates = Array.from(document.querySelectorAll('.quality-box')).map(b => b.dataset.value || "");
    const wtContent = document.getElementById('wt-content');
    const mtContent = document.getElementById('mt-content');
    const data = {
        blocksState: getBlocksState(),
        inputs,
        qualityStates,
        startDate: document.getElementById('start-date-input').value,
        weeklyTasksHtml: wtContent ? wtContent.innerHTML : '',
        monthlyTasksHtml: mtContent ? mtContent.innerHTML : ''
    };

    downloadDataFile(data, `${getPlannerFileBaseName()}.data`);
    document.getElementById('export-modal').classList.add('modal-hidden');
}

function exportMaterialsData() {
    const data = { folders, materials };
    downloadDataFile(data, 'list.data');
    document.getElementById('export-modal').classList.add('modal-hidden');
}

function downloadDataFile(dataObj, filename) {
    const blob = new Blob([JSON.stringify(dataObj)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const content = evt.target.result;
            const parsed = JSON.parse(content);
            
            if (parsed.blocksState !== undefined) {
                localStorage.setItem(LOCAL_STORAGE_KEY, content);
                loadLocalData();
            } else {
                if (parsed.folders) folders = parsed.folders;
                if (parsed.materials) materials = parsed.materials;
                initSidebar();
                saveLocalData();
            }
            alert('読み込みに成功しました');
        } catch(err) {
            alert('ファイルの読み込みに失敗しました。正しい .data ファイルを選択してください。');
        }
        document.getElementById('import-file').value = ''; 
    };
    reader.readAsText(file);
}



function processICalData(icsData) {
    const startDateStr = document.getElementById('start-date-input').value;
    if (!startDateStr) return;
    
    const currentWeekStart = new Date(startDateStr);
    currentWeekStart.setHours(0,0,0,0);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 7);

    const lines = icsData.split(/\r?\n/);
    let events = [];
    let currentEvent = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        while (i + 1 < lines.length && (lines[i+1].startsWith(' ') || lines[i+1].startsWith('\t'))) {
            i++;
            line += lines[i].substring(1);
        }

        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = {};
        } else if (line.startsWith('END:VEVENT')) {
            if (currentEvent && currentEvent.start && currentEvent.end) {
                events.push(currentEvent);
            }
            currentEvent = null;
        } else if (currentEvent) {
            if (line.startsWith('SUMMARY:')) {
                currentEvent.summary = line.substring(8);
            } else if (line.startsWith('DTSTART')) {
                currentEvent.start = parseICalDate(line);
            } else if (line.startsWith('DTEND')) {
                currentEvent.end = parseICalDate(line);
            }
        }
    }

    const grids = document.querySelectorAll('.day-col .day-grid');
    
    events.forEach(ev => {
        if (!ev.start || !ev.end) return;
        
        if (ev.start >= currentWeekStart && ev.start < currentWeekEnd) {
            let startHour = ev.start.getHours();
            let startMin = ev.start.getMinutes();
            let colIndex = ev.start.getDay() === 0 ? 6 : ev.start.getDay() - 1;
            
            if (startHour < 5) {
                startHour += 24;
                colIndex = (colIndex + 6) % 7;
            }
            
            const top = (startHour - 5) * 60 + startMin;
            const durationMins = (ev.end - ev.start) / (1000 * 60);
            
            if (top >= 0 && top < MAX_HEIGHT_PX && grids[colIndex]) {
                createBlock(grids[colIndex], {
                    name: ev.summary,
                    color: '#4285F4',
                    category: 'none', 
                    top: top,
                    height: durationMins
                });
            }
        }
    });
    saveState();
}

function parseICalDate(line) {
    const parts = line.split(':');
    if (parts.length < 2) return null;
    const dateStr = parts[1]; 
    if (dateStr.length < 8) return null;

    const year = parseInt(dateStr.substring(0,4));
    const month = parseInt(dateStr.substring(4,6)) - 1;
    const day = parseInt(dateStr.substring(6,8));

    if (dateStr.length >= 15) {
        const hour = parseInt(dateStr.substring(9,11));
        const min = parseInt(dateStr.substring(11,13));
        const sec = parseInt(dateStr.substring(13,15));

        if (dateStr.endsWith('Z')) {
            return new Date(Date.UTC(year, month, day, hour, min, sec));
        } else {
            return new Date(year, month, day, hour, min, sec);
        }
    } else {
        return new Date(year, month, day);
    }
}

const modal = document.getElementById('edit-modal');
const timeInput = document.getElementById('edit-duration');
const noteInput = document.getElementById('edit-note');

function openEditModal(block) {
    currentEditingBlock = block;
    const mins = Math.round((parseFloat(block.style.height) / PX_PER_HOUR) * 60);
    timeInput.value = mins;
    if (noteInput) noteInput.value = block.dataset.note || '';
    modal.classList.remove('modal-hidden');
}
function closeEditModal() {
    modal.classList.add('modal-hidden');
    currentEditingBlock = null;
    if (noteInput) noteInput.value = '';
}

window.toggleTaskEdit = function(contentId, buttonId) {
    const content = document.getElementById(contentId);
    const editBtn = document.getElementById(buttonId);
    if (!content || !editBtn) return;

    const isEditing = content.getAttribute('contenteditable') === 'true';
    if (isEditing) {
        content.setAttribute('contenteditable', 'false');
        editBtn.innerText = '編集';
        saveLocalData();
    } else {
        content.setAttribute('contenteditable', 'true');
        content.focus();
        editBtn.innerText = '保存';
    }
};

function initWeeklyTasks() {
    document.querySelectorAll('.task-edit-btn').forEach(editBtn => {
        editBtn.onclick = () => {
            window.toggleTaskEdit(editBtn.dataset.target, editBtn.id);
        };
    });

    document.querySelectorAll('.wt-content').forEach(content => {
        content.addEventListener('input', () => saveLocalData());
    });
}
