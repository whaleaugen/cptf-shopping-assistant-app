const EVENT = { id: 7166, exhibitId: 7940, name: 'COMICUP CITYTOUR FU', date: '2026-11-08T09:00:00+08:00', venue: '海峡国际会展中心' };
const STORAGE_KEY = 'cptf-shopping-v1';
const CATALOG_VERSION = '2026-10-28-v3.1';
const CATALOG_URL = `./data/cptf-catalog.json?v=${CATALOG_VERSION}`;
const HALL_ORDER = ['创', '壹', '贰', '叁', '肆'];
const MEMO_TYPES = { freebie: '无料', stamp: '盖章', promo: '摊宣', reminder: '提醒' };
const DEFAULT_MEMO_TYPES = Object.entries(MEMO_TYPES).map(([id, name]) => ({ id, name }));
const INTENTS = { must: '必买', want: '想买', maybe: '纠结', browse: '只逛逛' };
const INTENT_RANK = { must: 0, want: 1, maybe: 2, browse: 3 };
const BOOTH_STATES = { pending: '未到达', visited: '已逛', return: '需要返场', queue: '排队中', away: '摊主暂离', skipped: '已跳过' };
const SEED_ITEMS = [];

let state = loadState();
let activeHall = HALL_ORDER.find(hall => state.items.some(item => hallOf(item.boothRaw) === hall)) || '壹';
let memoFilter = 'all';
let editingMemoId = '';
let pendingMemoImage = '';
let cropSourceImage = null;
let cropRect = null;
let cropDrag = null;
let cropRatio = 'free';
let quickPurchaseImage = '';
let catalogPromise = null;

function cloneSeed() { return SEED_ITEMS.map(item => ({ ...item })); }
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.items)) return normalizeState(parsed);
  } catch (_) {}
  return normalizeState({ version: 3, showPurchased: true, items: cloneSeed(), memos: [], starredBooths: [] });
}
function normalizeState(data) { const normalized = { version: 9, showPurchased: true, memos: [], memoTypes: DEFAULT_MEMO_TYPES, starredBooths: [], starredItems: [], boothStates: {}, boothProfiles: {}, manualBooths: [], budgetLimit: null, visitDate: '2026-11-07', listView: 'list', organizerView: 'list', ...data, memos: Array.isArray(data.memos) ? data.memos : [], memoTypes: Array.isArray(data.memoTypes) && data.memoTypes.length ? data.memoTypes : DEFAULT_MEMO_TYPES, starredBooths: Array.isArray(data.starredBooths) ? data.starredBooths : [], starredItems: Array.isArray(data.starredItems) ? data.starredItems : [], manualBooths: Array.isArray(data.manualBooths) ? data.manualBooths : [], boothStates: data.boothStates && typeof data.boothStates === 'object' ? data.boothStates : {}, boothProfiles: data.boothProfiles && typeof data.boothProfiles === 'object' ? data.boothProfiles : {}, items: data.items.map((item, index) => ({ ...item, qty: Number(item.qty) > 0 ? Number(item.qty) : 1, intent: item.intent || 'want', intentReviewed: item.intentReviewed === true, order: Number.isFinite(item.order) ? item.order : index })) }; if (normalized.listView === 'large') normalized.listView = 'grid'; Object.keys(normalized.boothProfiles).forEach(booth => { const profile=normalized.boothProfiles[booth] || {}; profile.note=profile.note || ''; profile.links=Array.isArray(profile.links) ? profile.links : []; normalized.boothProfiles[booth]=profile; }); return normalized; }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderStats(); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function safeUrl(value) { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } }
function uid() { return `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function hallOf(booth) { return HALL_ORDER.find(hall => String(booth || '').trim().startsWith(hall)) || '其他'; }
function laneOf(booth) { return (String(booth || '').match(/[A-Z]/i) || ['创作摊'])[0].toUpperCase(); }
function boothNumber(booth) { return Number((String(booth || '').match(/\d+/) || [999])[0]); }
function routeIndex(item) { const hall = HALL_ORDER.indexOf(hallOf(item.boothRaw)); return (hall < 0 ? 99 : hall) * 10000 + laneOf(item.boothRaw).charCodeAt(0) * 100 + boothNumber(item.boothRaw); }
function money(value) { return `¥${Math.round(value || 0).toLocaleString('zh-CN')}`; }
function statusLabel(status) { return status === 'purchased' ? '已购买' : status === 'soldout' ? '已完售' : status === 'abandoned' ? '已放弃' : '待购买'; }
function memoTypeLabel(id) { return state.memoTypes.find(type => type.id === id)?.name || '提醒'; }
function boothProfile(booth) { if (!state.boothProfiles[booth]) state.boothProfiles[booth] = { note: '', links: [] }; return state.boothProfiles[booth]; }
function isStarred(booth) { return state.starredBooths.includes(booth); }
function toggleStar(booth) { state.starredBooths = isStarred(booth) ? state.starredBooths.filter(value => value !== booth) : [...state.starredBooths, booth]; saveState(); renderRoute(); renderList(); toast(isStarred(booth) ? '已设为重点摊位' : '已取消星标'); }
function isItemStarred(id) { return state.starredItems.includes(id); }
function toggleItemStar(id) { state.starredItems = isItemStarred(id) ? state.starredItems.filter(value => value !== id) : [...state.starredItems, id]; saveState(); renderList(); toast(isItemStarred(id) ? '已标记重点制品' : '已取消制品星标'); }
function toast(message) { const el = document.getElementById('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 1900); }

function renderCountdown() {
  const target = new Date(`${state.visitDate || '2026-11-07'}T09:00:00+08:00`), days = Math.ceil((target - new Date()) / 86400000);
  const el = document.getElementById('countdown');
  if (days > 0) el.innerHTML = `<strong>${days}</strong><span>天后开场</span>`;
  else if (days >= -2) el.innerHTML = '<strong>NOW</strong><span>活动进行中</span>';
  else el.innerHTML = '<strong>2026</strong><span>活动已结束</span>';
}
function renderStats() {
  const booths = new Set([...state.items.map(item => item.boothRaw), ...state.memos.map(memo => memo.booth).filter(Boolean), ...state.manualBooths]);
  const pending = state.items.filter(item => item.status === 'pending').length;
  const budget = state.items.filter(item => !item.manualPurchase && item.intentReviewed && ['must','want'].includes(item.intent) && item.status === 'pending').reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
  const maybe = state.items.filter(item => !item.manualPurchase && item.intentReviewed && item.intent === 'maybe' && item.status === 'pending').reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
  const spent = state.items.filter(item => item.status === 'purchased').reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
  const noPrice = state.items.filter(item => item.status === 'pending' && item.intentReviewed && item.intent !== 'browse' && !(Number(item.price) >= 0 && item.price !== null && item.price !== '')).length;
  document.getElementById('statItems').textContent = state.items.length;
  document.getElementById('statBooths').textContent = booths.size;
  document.getElementById('statBudget').textContent = state.budgetLimit ? `${money(budget)} / ${money(state.budgetLimit)}` : money(budget);
  document.getElementById('statSpent').textContent = money(spent);
  document.getElementById('statMaybe').textContent = money(maybe);
  document.getElementById('statNoPrice').textContent = noPrice;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statBudget').title = state.budgetLimit ? `预算上限 ${money(state.budgetLimit)}，实际已购 ${money(spent)}` : `实际已购 ${money(spent)}`;
  const unreviewed=state.items.filter(item=>!item.intentReviewed).length, prompt=document.getElementById('organizePrompt'); if(prompt){prompt.hidden=!unreviewed;document.getElementById('unreviewedCount').textContent=unreviewed;}
}
function groupedBooths(hall) {
  const map = new Map();
  state.items.filter(item => hallOf(item.boothRaw) === hall && (state.showPurchased || item.status !== 'purchased')).forEach(item => {
    if (!map.has(item.boothRaw)) map.set(item.boothRaw, { items: [], memos: [] });
    map.get(item.boothRaw).items.push(item);
  });
  state.memos.filter(memo => memo.booth && hallOf(memo.booth) === hall).forEach(memo => {
    if (!map.has(memo.booth)) map.set(memo.booth, { items: [], memos: [] });
    map.get(memo.booth).memos.push(memo);
  });
  state.manualBooths.filter(booth => hallOf(booth) === hall).forEach(booth => { if (!map.has(booth)) map.set(booth, { items: [], memos: [] }); });
  return [...map.entries()].sort((a, b) => Number(isStarred(b[0])) - Number(isStarred(a[0])) || routeIndex({ boothRaw: a[0] }) - routeIndex({ boothRaw: b[0] }));
}
function renderRoute() {
  const grid = document.getElementById('hallGrid');
  grid.innerHTML = HALL_ORDER.map(hall => {
    const items = state.items.filter(item => hallOf(item.boothRaw) === hall);
    const memos = state.memos.filter(memo => memo.booth && hallOf(memo.booth) === hall && !memo.done);
    const pending = items.filter(item => item.status === 'pending').length;
    return `<button class="hall-card ${activeHall === hall ? 'active' : ''}" data-hall="${hall}"><b>${hall === '创' ? '创作摊' : hall + '馆'}</b><em>${items.length + memos.length}</em><span>${pending} 件待买 · ${memos.length} 个备忘</span></button>`;
  }).join('');
  grid.querySelectorAll('[data-hall]').forEach(button => button.addEventListener('click', () => { activeHall = button.dataset.hall; renderRoute(); }));
  const groups = groupedBooths(activeHall);
  const lanes = new Map(); groups.forEach(group => { const lane = laneOf(group[0]); if (!lanes.has(lane)) lanes.set(lane, []); lanes.get(lane).push(group); });
  document.getElementById('routeSummary').textContent = `${groups.length} 个摊位`;
  document.getElementById('routeBoard').innerHTML = `<div class="route-head"><h3>${activeHall === '创' ? '创作摊' : activeHall + '馆'}摊位</h3><small>按摊位号整理，不推断实际相邻关系</small></div>` +
    (lanes.size ? `<div class="lane-list">${[...lanes.entries()].map(([lane, boothGroups]) => `<div class="lane"><div class="lane-letter">${lane === '创作摊' ? '创' : lane}</div><div class="booth-chips">${boothGroups.map(([booth, data]) => { const circle = data.items[0]?.circle || data.memos[0]?.circle || '已关注摊位'; const complete = data.items.length + data.memos.length > 0 && data.items.every(item => item.status !== 'pending') && data.memos.every(memo => memo.done); const visitState = state.boothStates[booth] || 'pending'; return `<button class="booth-chip ${complete ? 'done' : ''} ${isStarred(booth) ? 'starred' : ''} visit-${visitState}" data-booth="${esc(booth)}"><strong>${isStarred(booth) ? '★ ' : ''}${esc(booth)}</strong><small>${data.items.length} 件 · ${data.memos.length} 备忘 · ${esc(BOOTH_STATES[visitState])} · ${esc(circle)}</small></button>`; }).join('')}</div></div>`).join('')}</div>` : '<div class="empty-state">这个馆暂时没有清单或备忘。</div>');
  document.querySelectorAll('[data-booth]').forEach(button => button.addEventListener('click', () => openBooth(button.dataset.booth)));
}
function filteredItems() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const intent = document.getElementById('intentFilter').value;
  const sort = document.getElementById('sortSelect').value;
  const result = state.items.filter(item => {
    const haystack = [item.name, item.boothRaw, item.circle, item.source, item.type, item.author].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (status === 'all' || item.status === status) && (intent === 'all' || (item.intentReviewed && item.intent === intent));
  });
  result.sort((a, b) => Number(isItemStarred(b.id)) - Number(isItemStarred(a.id)) || Number(isStarred(b.boothRaw)) - Number(isStarred(a.boothRaw)) || (INTENT_RANK[a.intent] ?? 9) - (INTENT_RANK[b.intent] ?? 9) || (sort === 'heat' ? (Number(b.heat) || 0) - (Number(a.heat) || 0) : sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : sort === 'custom' ? a.order - b.order : routeIndex(a) - routeIndex(b)));
  return result;
}
function coverMarkup(item) {
  return item.coverUrl ? `<img class="product-cover" src="${esc(item.coverUrl)}" alt="${esc(item.name)}封面" loading="lazy" referrerpolicy="no-referrer">` : '<div class="product-cover cover-placeholder">C</div>';
}
function renderList() {
  const items = filteredItems();
  const list = document.getElementById('productList');
  list.className = `product-list view-${state.listView || 'list'}`;
  list.innerHTML = items.length ? items.map(item => `<article class="product-card ${isItemStarred(item.id) ? 'starred' : ''} intent-${item.intent}" draggable="true" data-open-id="${item.id}"><span class="drag-handle" title="拖动排序" aria-hidden="true">⋮⋮</span>${coverMarkup(item)}<div class="product-copy"><h3>${isItemStarred(item.id) ? '<span class="star-inline">★</span>' : ''}${esc(item.name)}</h3><p>${esc(item.boothRaw)} · ${esc(item.circle)} · ${esc(item.source)}${isStarred(item.boothRaw) ? ' · ★重点摊位' : ''}</p><div class="tags"><span class="tag intent-tag ${item.intentReviewed ? item.intent : 'undecided'}">${item.intentReviewed ? esc(INTENTS[item.intent] || '想买') : '待决定'}</span><span class="tag">${esc(item.type || '未分类')}</span><span class="tag">${esc(item.prepStatus || '状态未知')}</span>${item.heat ? `<span class="tag heat">热度 ${item.heat}</span>` : ''}</div></div><div class="product-actions"><div class="mobile-order"><button data-move-id="${item.id}" data-move-dir="-1" type="button" aria-label="上移${esc(item.name)}">↑</button><button data-move-id="${item.id}" data-move-dir="1" type="button" aria-label="下移${esc(item.name)}">↓</button></div><button class="star-button ${isItemStarred(item.id) ? 'active' : ''}" data-star-item="${item.id}" type="button" aria-label="${isItemStarred(item.id) ? '取消重点制品' : '设为重点制品'}">★</button><input class="price-input" data-price-id="${item.id}" type="number" min="0" placeholder="价格" value="${item.price ?? ''}" aria-label="${esc(item.name)}价格"><input class="qty-input" data-qty-id="${item.id}" type="number" min="1" value="${item.qty || 1}" aria-label="${esc(item.name)}数量"><select class="status-select ${item.status}" data-status-id="${item.id}" aria-label="${esc(item.name)}购买状态"><option value="pending">待购买</option><option value="purchased">已购买</option><option value="soldout">已完售</option><option value="abandoned">已放弃</option></select></div></article>`).join('') : '<div class="empty-state">没有找到符合条件的展品。</div>';
  list.querySelectorAll('[data-open-id]').forEach(card => card.addEventListener('click', event => { if (!event.target.closest('input,button')) openItem(card.dataset.openId); }));
  list.querySelectorAll('[data-price-id]').forEach(input => input.addEventListener('change', () => { const item = state.items.find(row => row.id === input.dataset.priceId); item.price = input.value === '' ? null : Number(input.value); saveState(); }));
  list.querySelectorAll('[data-qty-id]').forEach(input => input.addEventListener('change', () => { const item=state.items.find(row=>row.id===input.dataset.qtyId);item.qty=Math.max(1,Number(input.value)||1);saveState(); }));
  list.querySelectorAll('[data-status-id]').forEach(select => { select.value=state.items.find(item=>item.id===select.dataset.statusId)?.status||'pending'; select.addEventListener('change', event => { event.stopPropagation(); const item=state.items.find(row=>row.id===select.dataset.statusId);item.status=select.value;saveState();renderRoute();renderList(); }); });
  list.querySelectorAll('[data-star-item]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); toggleItemStar(button.dataset.starItem); }));
  list.querySelectorAll('[data-move-id]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); moveItemBy(button.dataset.moveId, Number(button.dataset.moveDir)); }));
  bindProductDragging(list);
}

function organizedItems() {
  const query = document.getElementById('organizeSearch').value.trim().toLowerCase();
  const filter = document.getElementById('organizeFilter').value;
  return [...state.items].filter(item => {
    const matchesQuery = !query || [item.name, item.boothRaw, item.circle, item.source].join(' ').toLowerCase().includes(query);
    const matchesFilter = filter === 'all' ? true : filter === 'unreviewed' ? !item.intentReviewed : item.intentReviewed && item.intent === filter;
    return matchesQuery && matchesFilter;
  }).sort((a, b) => routeIndex(a) - routeIndex(b));
}
function renderOrganizer() {
  const items = organizedItems();
  const reviewed = state.items.filter(item => item.intentReviewed).length;
  document.getElementById('organizeSummary').textContent = `已整理 ${reviewed} / ${state.items.length}`;
  document.getElementById('bulkIntentButtons').innerHTML = Object.entries(INTENTS).map(([value, label]) => `<button class="intent-choice ${value}" type="button" data-bulk-intent="${value}">${label}</button>`).join('');
  const list = document.getElementById('organizeList');
  list.className = `organize-list view-${state.organizerView || 'list'}`;
  list.innerHTML = items.length ? items.map(item => `<article class="organize-row ${item.intentReviewed ? 'reviewed' : ''}">${coverMarkup(item)}<div class="organize-copy"><b>${esc(item.name)}</b><span>${esc(item.boothRaw)} · ${esc(item.circle || item.source || '')}</span></div><div class="intent-choices" role="group" aria-label="${esc(item.name)}的购买意向">${Object.entries(INTENTS).map(([value,label]) => `<button class="intent-choice ${value} ${item.intentReviewed && item.intent === value ? 'active' : ''}" type="button" data-organize-id="${item.id}" data-organize-intent="${value}">${label}</button>`).join('')}</div></article>`).join('') : '<div class="empty-state">这里已经整理完啦，可以切换到“全部制品”继续调整。</div>';
  list.querySelectorAll('[data-organize-id]').forEach(button => button.addEventListener('click', () => {
    const item = state.items.find(row => row.id === button.dataset.organizeId); if (!item) return;
    item.intent = button.dataset.organizeIntent; item.intentReviewed = true; saveState(); renderOrganizer(); renderList(); renderRoute();
  }));
  document.querySelectorAll('[data-bulk-intent]').forEach(button => button.onclick = () => {
    if (!items.length || !confirm(`把当前显示的 ${items.length} 件制品全部设为“${INTENTS[button.dataset.bulkIntent]}”吗？`)) return;
    items.forEach(item => { item.intent = button.dataset.bulkIntent; item.intentReviewed = true; }); saveState(); renderOrganizer(); renderList(); renderRoute(); toast(`已批量标记 ${items.length} 件`);
  });
}
function cycleStatus(id) { const item = state.items.find(row => row.id === id); if (!item) return; item.status = item.status === 'pending' ? 'purchased' : item.status === 'purchased' ? 'soldout' : item.status === 'soldout' ? 'abandoned' : 'pending'; saveState(); renderRoute(); renderList(); }
function bindProductDragging(list) { let draggedId = ''; list.querySelectorAll('.product-card').forEach(card => { card.addEventListener('dragstart', event => { draggedId = card.dataset.openId; card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; }); card.addEventListener('dragend', () => card.classList.remove('dragging')); card.addEventListener('dragover', event => { event.preventDefault(); card.classList.add('drag-over'); }); card.addEventListener('dragleave', () => card.classList.remove('drag-over')); card.addEventListener('drop', event => { event.preventDefault(); card.classList.remove('drag-over'); moveItemBefore(draggedId, card.dataset.openId); }); }); }
function moveItemBefore(sourceId, targetId) { if (!sourceId || sourceId === targetId) return; const ordered = [...state.items].sort((a,b) => a.order - b.order); const from = ordered.findIndex(item => item.id === sourceId), to = ordered.findIndex(item => item.id === targetId); if (from < 0 || to < 0) return; const [moved] = ordered.splice(from,1); ordered.splice(to,0,moved); ordered.forEach((item,index) => item.order = index); document.getElementById('sortSelect').value = 'custom'; saveState(); renderList(); toast('顺序已更新'); }
function moveItemBy(id, direction) { const ordered = [...state.items].sort((a,b) => a.order - b.order), from = ordered.findIndex(item => item.id === id), to = from + direction; if (from < 0 || to < 0 || to >= ordered.length) return; [ordered[from], ordered[to]] = [ordered[to], ordered[from]]; ordered.forEach((item,index) => item.order = index); document.getElementById('sortSelect').value = 'custom'; saveState(); renderList(); }
function openItem(id) {
  const item = state.items.find(row => row.id === id); if (!item) return;
  const cppLink = item.cppId ? `https://www.allcpp.cn/d/${encodeURIComponent(item.cppId)}.do` : '';
  const profile=boothProfile(item.boothRaw), socialLinks=profile.links.filter(link=>safeUrl(link.url));
  document.getElementById('dialogContent').innerHTML = `<div class="dialog-image-wrap">${item.coverUrl ? `<img class="dialog-cover" src="${esc(item.coverUrl)}" alt="${esc(item.name)}封面" referrerpolicy="no-referrer">` : '<div class="dialog-cover dialog-cover-empty">还没有图片</div>'}</div><div class="dialog-image-actions"><label class="image-upload-button">${item.coverUrl ? '更换图片' : '添加图片'}<input id="itemImageInput" type="file" accept="image/*" hidden></label>${item.coverUrl ? '<button id="removeImageButton" type="button">移除图片</button>' : ''}</div><p class="eyebrow">${esc(item.boothRaw)} · ${esc(item.type || '展品')}</p><h2>${esc(item.name)}</h2><div class="dialog-meta-grid"><div><small>社团</small><strong>${esc(item.circle || '未填写')}</strong></div><div><small>作者</small><strong>${esc(item.author || '未填写')}</strong></div><div><small>原作</small><strong>${esc(item.source || '未填写')}</strong></div><div><small>热度 / 筹备</small><strong>${item.heat ? esc(item.heat) : '—'} · ${esc(item.prepStatus || '未知')}</strong></div></div>${socialLinks.length?`<div class="social-links"><strong>老师 / 社团主页</strong>${socialLinks.map(link=>`<a href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${esc(link.platform||'主页')}${link.label?` · ${esc(link.label)}`:''} ↗</a>`).join('')}</div>`:''}${item.description ? `<p>${esc(item.description)}</p>` : ''}${cppLink ? `<a class="external-link" href="${cppLink}" target="_blank" rel="noopener noreferrer">在 CPP 查看原展品 ↗</a>` : ''}<div class="dialog-controls three"><select id="dialogStatus"><option value="pending">待购买</option><option value="purchased">已购买</option><option value="soldout">已完售</option><option value="abandoned">已放弃</option></select><input id="dialogPrice" type="number" min="0" placeholder="价格" value="${item.price ?? ''}"><input id="dialogQty" type="number" min="1" placeholder="数量" value="${item.qty || 1}"></div><div class="planning-controls one"><label><span>购买意向</span><select id="dialogIntent"><option value="must">必买</option><option value="want">想买</option><option value="maybe">纠结</option><option value="browse">只逛逛</option></select></label></div><button class="open-booth-link" id="dialogOpenBooth" type="button">查看 ${esc(item.boothRaw)} 摊位全部信息</button><div class="dialog-item-actions"><button id="dialogStar" class="star-action ${isItemStarred(item.id) ? 'active' : ''}" type="button">${isItemStarred(item.id) ? '★ 重点制品' : '☆ 标记重点制品'}</button><button id="deleteItemButton" class="delete-item-button" type="button">删除这个制品</button></div>`;
  const dialog = document.getElementById('itemDialog'); if (!dialog.open) dialog.showModal();
  const status = document.getElementById('dialogStatus'); status.value = item.status; status.onchange = () => { item.status = status.value; saveState(); renderRoute(); renderList(); };
  const price = document.getElementById('dialogPrice'); price.onchange = () => { item.price = price.value === '' ? null : Number(price.value); saveState(); renderList(); };
  const qty = document.getElementById('dialogQty'); qty.onchange = () => { item.qty=Math.max(1,Number(qty.value)||1);saveState();renderList(); };
  const intent = document.getElementById('dialogIntent'); intent.value = item.intent; intent.onchange = () => { item.intent = intent.value; item.intentReviewed = true; saveState(); renderList(); renderRoute(); renderOrganizer(); };
  document.getElementById('dialogOpenBooth').onclick=()=>{dialog.close();openBooth(item.boothRaw);};
  document.getElementById('dialogStar').onclick = () => { toggleItemStar(item.id); openItem(id); };
  document.getElementById('itemImageInput').onchange = async event => { const file = event.target.files[0]; if (!file) return; try { const previous = item.coverUrl, previousCustom = item.customCover; item.coverUrl = await imageFileToDataUrl(file); item.customCover = true; try { saveState(); } catch (error) { item.coverUrl = previous; item.customCover = previousCustom; throw error; } renderList(); renderRoute(); openItem(id); toast('图片已保存，会随备份导出'); } catch (error) { console.error(error); toast('图片保存失败，可能是文件太大'); } };
  const removeImage = document.getElementById('removeImageButton'); if (removeImage) removeImage.onclick = () => { item.coverUrl = ''; item.customCover = false; saveState(); renderList(); openItem(id); toast('图片已移除'); };
  document.getElementById('deleteItemButton').onclick = () => { if (!confirm(`确定删除“${item.name}”吗？导出过的旧备份仍可恢复。`)) return; state.items = state.items.filter(row => row.id !== id); state.starredItems = state.starredItems.filter(value => value !== id); saveState(); document.getElementById('itemDialog').close(); renderRoute(); renderList(); toast('制品已删除'); };
}

async function imageFileToDataUrl(file) { if (!file.type.startsWith('image/')) throw new Error('not-image'); const bitmap = await createImageBitmap(file); const max = 1100, scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas.toDataURL('image/jpeg', .82); }

function allBoothSearchRows() {
  const booths = new Map();
  state.items.forEach(item => {
    if (!booths.has(item.boothRaw)) booths.set(item.boothRaw, { booth: item.boothRaw, items: [], memos: [] });
    booths.get(item.boothRaw).items.push(item);
  });
  state.memos.filter(memo => memo.booth).forEach(memo => {
    if (!booths.has(memo.booth)) booths.set(memo.booth, { booth: memo.booth, items: [], memos: [] });
    booths.get(memo.booth).memos.push(memo);
  });
  state.manualBooths.forEach(booth => { if (!booths.has(booth)) booths.set(booth,{booth,items:[],memos:[]}); });
  return [...booths.values()].sort((a,b) => routeIndex({boothRaw:a.booth}) - routeIndex({boothRaw:b.booth}));
}
function renderBoothSearch() {
  const query = document.getElementById('boothSearchInput').value.trim().toLowerCase();
  const rows = allBoothSearchRows().filter(row => {const profile=state.boothProfiles[row.booth]||{};return !query || [row.booth,profile.note,...(profile.links||[]).flatMap(link=>[link.platform,link.label]), ...row.items.flatMap(item => [item.name,item.circle,item.source]), ...row.memos.flatMap(memo => [memo.title,memo.circle])].join(' ').toLowerCase().includes(query);}).slice(0, 20);
  const results = document.getElementById('boothSearchResults');
  results.innerHTML = rows.length ? rows.map(row => `<article><div><b>${esc(row.booth)}</b><span>${esc([...new Set(row.items.map(item => item.circle).filter(Boolean))].slice(0,2).join(' · ') || row.memos[0]?.circle || '已记录摊位')}</span><small>${row.items.length} 件制品 · ${row.memos.length} 个备忘</small></div><div><button type="button" data-find-booth="${esc(row.booth)}">查看摊位</button><button class="accent" type="button" data-buy-booth="${esc(row.booth)}">记一笔</button></div></article>`).join('') : '<div class="empty-state">没有找到这个摊位，可以直接“记一笔”手动输入摊位号。</div>';
  results.querySelectorAll('[data-find-booth]').forEach(button => button.onclick = () => { document.getElementById('boothSearchDialog').close(); openBooth(button.dataset.findBooth); });
  results.querySelectorAll('[data-buy-booth]').forEach(button => button.onclick = () => { document.getElementById('boothSearchDialog').close(); openQuickPurchase(button.dataset.buyBooth); });
}
function openBoothSearch() { renderBoothSearch(); const dialog = document.getElementById('boothSearchDialog'); dialog.showModal(); setTimeout(() => document.getElementById('boothSearchInput').focus(), 50); }
function openQuickPurchase(booth = '') { const form = document.getElementById('quickPurchaseForm'); form.reset(); quickPurchaseImage = ''; document.getElementById('quickPurchaseBooth').value = booth; document.getElementById('quickPurchasePhotoHint').textContent = '可以直接拍照或从相册选择'; document.getElementById('quickPurchaseDialog').showModal(); setTimeout(() => (booth ? document.getElementById('quickPurchaseName') : document.getElementById('quickPurchaseBooth')).focus(), 50); }
function saveQuickPurchase(event) {
  event.preventDefault(); const booth = document.getElementById('quickPurchaseBooth').value.trim(); const name = document.getElementById('quickPurchaseName').value.trim(); const amount = Number(document.getElementById('quickPurchaseAmount').value); if (!booth || !name || !Number.isFinite(amount)) return;
  state.items.push({ id: uid(), boothRaw: booth, name: `现场加购：${name}`, type: '现场加购', heat: null, prepStatus: '现场购买', source: '', circle: '', price: amount, qty: 1, status: 'purchased', note: '', coverUrl: quickPurchaseImage, customCover: Boolean(quickPurchaseImage), description: name, author: '', cppId: '', order: state.items.length, intent: 'want', intentReviewed: true, visitDay: 'any', visitPeriod: 'any', manualPurchase: true, createdAt: Date.now() });
  saveState(); renderRoute(); renderList(); renderOrganizer(); document.getElementById('quickPurchaseDialog').close(); toast(`已记录 ${booth} · ${money(amount)}`);
}

function openBooth(booth) {
  const items = state.items.filter(item => item.boothRaw === booth);
  const memos = state.memos.filter(memo => memo.booth === booth);
  const pending = items.filter(item => item.status === 'pending').length + memos.filter(memo => !memo.done).length;
  const profile=boothProfile(booth), circle=items.find(item=>item.circle)?.circle||memos.find(memo=>memo.circle)?.circle||'未填写社团', sources=[...new Set(items.map(item=>item.source).filter(Boolean))];
  const content = document.getElementById('boothDialogContent');
  content.innerHTML = `<div class="booth-mode-head"><p class="eyebrow">BOOTH</p><h2>${isStarred(booth) ? '★ ' : ''}${esc(booth)} · ${esc(circle)}</h2><div class="booth-mode-summary">${pending} 项待完成 · ${items.length} 件展品 · ${memos.length} 个备忘${sources.length?` · ${esc(sources.join(' / '))}`:''}</div><div class="booth-head-actions"><select id="boothVisitState">${Object.entries(BOOTH_STATES).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select><button class="booth-star-action ${isStarred(booth) ? 'active' : ''}" data-booth-star="${esc(booth)}" type="button">${isStarred(booth) ? '★ 重点摊位' : '☆ 加星重点'}</button><button class="booth-add-memo" id="boothAddMemo" type="button">＋ 添加备忘</button></div></div><section class="booth-profile"><label><span>摊位备注</span><textarea id="boothNote" placeholder="老师公告、领取提醒、返场原因……">${esc(profile.note)}</textarea></label><div class="booth-social"><h3>老师 / 社团主页</h3><div class="social-links-list">${profile.links.length?profile.links.map(link=>`<div><a href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${esc(link.platform||'其他')}${link.label?` · ${esc(link.label)}`:''} ↗</a><button type="button" data-delete-social="${esc(link.id)}">删除</button></div>`).join(''):'<p>还没有保存社媒主页。</p>'}</div><div class="social-add"><select id="socialPlatform"><option>小红书</option><option>微博</option><option>B站</option><option>LOFTER</option><option>其他</option></select><input id="socialLabel" placeholder="老师名称或备注"><input id="socialUrl" type="url" placeholder="https://…"><button id="addSocialLink" type="button">添加链接</button></div></div></section><div class="booth-task-list"><h3>关联制品</h3>${items.length?items.map(item => `<div class="booth-task">${coverMarkup(item)}<div class="booth-task-copy"><h4><span class="intent-mini ${item.intentReviewed?item.intent:'undecided'}">${item.intentReviewed?esc(INTENTS[item.intent]):'待决定'}</span>${esc(item.name)}</h4><p>${esc(item.circle)} · ${esc(item.prepStatus || '')}</p></div><div class="booth-task-controls"><input type="number" min="0" placeholder="价格" value="${item.price ?? ''}" data-booth-price="${item.id}"><select class="status-select" data-booth-status="${item.id}"><option value="pending">待购买</option><option value="purchased">已购买</option><option value="soldout">已完售</option><option value="abandoned">已放弃</option></select></div></div>`).join(''):'<div class="booth-empty">这个摊位暂时没有心愿制品。</div>'}<h3>关联备忘</h3>${memos.length?memos.map(memo => { const link = safeUrl(memo.link); return `<div class="booth-memo">${memo.image ? `<img class="memo-image" src="${esc(memo.image)}" alt="">` : ''}<b><span class="memo-type ${memo.type}">${esc(memoTypeLabel(memo.type))}</span>${esc(memo.title)}</b><p>${esc(memo.note || memo.circle || '')}</p><div class="memo-actions"><button class="memo-done" type="button" data-booth-memo="${memo.id}">${memo.done ? '恢复待办' : '标记完成'}</button>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">打开链接 ↗</a>` : ''}</div></div>`; }).join(''):'<div class="booth-empty">还没有关联备忘。</div>'}</div>`;
  content.querySelectorAll('[data-booth-status]').forEach(select => { const item=state.items.find(row=>row.id===select.dataset.boothStatus);select.value=item?.status||'pending';select.addEventListener('change',()=>{item.status=select.value;saveState();renderList();renderRoute();openBooth(booth);}); });
  content.querySelectorAll('[data-booth-price]').forEach(input => input.addEventListener('change', () => { const item = state.items.find(row => row.id === input.dataset.boothPrice); item.price = input.value === '' ? null : Number(input.value); saveState(); renderList(); }));
  content.querySelectorAll('[data-booth-memo]').forEach(button => button.addEventListener('click', () => { toggleMemo(button.dataset.boothMemo); openBooth(booth); }));
  content.querySelector('[data-booth-star]').addEventListener('click', () => { toggleStar(booth); openBooth(booth); });
  content.querySelector('#boothNote').addEventListener('change',event=>{profile.note=event.target.value.trim();saveState();});
  content.querySelector('#addSocialLink').addEventListener('click',()=>{const url=safeUrl(content.querySelector('#socialUrl').value);if(!url){toast('请输入安全的 HTTP/HTTPS 链接');return;}profile.links.push({id:uid(),platform:content.querySelector('#socialPlatform').value,label:content.querySelector('#socialLabel').value.trim(),url});saveState();openBooth(booth);toast('社媒主页已保存');});
  content.querySelectorAll('[data-delete-social]').forEach(button=>button.addEventListener('click',()=>{profile.links=profile.links.filter(link=>link.id!==button.dataset.deleteSocial);saveState();openBooth(booth);}));
  content.querySelector('#boothAddMemo').addEventListener('click',()=>{document.getElementById('boothDialog').close();activateView('memo');document.getElementById('memoForm').classList.remove('is-collapsed');document.getElementById('memoBooth').value=booth;document.getElementById('memoTitle').focus();});
  const boothVisitState = content.querySelector('#boothVisitState'); boothVisitState.value = state.boothStates[booth] || 'pending'; boothVisitState.addEventListener('change', () => { state.boothStates[booth] = boothVisitState.value; saveState(); renderRoute(); toast(`摊位状态：${BOOTH_STATES[boothVisitState.value]}`); });
  const dialog = document.getElementById('boothDialog'); if (!dialog.open) dialog.showModal();
}

function renderMemos() {
  const statusFilter=document.getElementById('memoStatusFilter')?.value||'all', hallFilter=document.getElementById('memoHallFilter')?.value||'all';
  const memos = state.memos.filter(memo => (memoFilter === 'all' || memo.type === memoFilter) && (statusFilter==='all'||(statusFilter==='done')===Boolean(memo.done)) && (hallFilter==='all'||hallOf(memo.booth)===hallFilter)).sort((a, b) => Number(a.done) - Number(b.done) || routeIndex({ boothRaw: a.booth }) - routeIndex({ boothRaw: b.booth }));
  document.getElementById('memoSummary').textContent = `${state.memos.filter(memo => !memo.done).length} 项待办`;
  const list = document.getElementById('memoList');
  list.innerHTML = memos.length ? memos.map(memo => { const link = safeUrl(memo.link); return `<article class="memo-card ${memo.done ? 'done' : ''}">${memo.image ? `<img class="memo-image" src="${esc(memo.image)}" alt="${esc(memo.title)}">` : ''}<div class="memo-card-head"><div class="memo-card-title"><h3><span class="memo-type ${memo.type}">${esc(memoTypeLabel(memo.type))}</span>${esc(memo.title)}</h3><p>${[memo.booth, memo.circle].filter(Boolean).map(esc).join(' · ') || '未关联摊位'}</p></div></div>${memo.note ? `<p class="memo-card-note">${esc(memo.note)}</p>` : ''}<div class="memo-actions"><button class="memo-done" type="button" data-memo-toggle="${memo.id}">${memo.done ? '恢复待办' : '完成'}</button>${memo.booth ? `<button type="button" data-memo-booth="${esc(memo.booth)}">打开摊位</button>` : ''}${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${memo.linkType === 'xiaohongshu' ? '小红书' : memo.linkType === 'weibo' ? '微博' : '打开链接'} ↗</a>` : ''}<button type="button" data-memo-edit="${memo.id}">编辑</button><button class="memo-delete" type="button" data-memo-delete="${memo.id}">删除</button></div></article>`; }).join('') : '<div class="empty-state">还没有这类备忘。可以先记一条想领取的无料或盖章点。</div>';
  list.querySelectorAll('[data-memo-toggle]').forEach(button => button.addEventListener('click', () => toggleMemo(button.dataset.memoToggle)));
  list.querySelectorAll('[data-memo-booth]').forEach(button => button.addEventListener('click', () => openBooth(button.dataset.memoBooth)));
  list.querySelectorAll('[data-memo-delete]').forEach(button => button.addEventListener('click', () => deleteMemo(button.dataset.memoDelete)));
  list.querySelectorAll('[data-memo-edit]').forEach(button => button.addEventListener('click', () => editMemo(button.dataset.memoEdit)));
}
function toggleMemo(id) { const memo = state.memos.find(row => row.id === id); if (!memo) return; memo.done = !memo.done; saveState(); renderMemos(); renderRoute(); }
function deleteMemo(id) { state.memos = state.memos.filter(memo => memo.id !== id); saveState(); renderMemos(); renderRoute(); toast('备忘已删除'); }
function refreshMemoTypes() { const select = document.getElementById('memoType'); select.innerHTML = state.memoTypes.map(type => `<option value="${esc(type.id)}">${esc(type.name)}</option>`).join(''); const filters = document.getElementById('memoFilters'); filters.innerHTML = `<button class="${memoFilter === 'all' ? 'active' : ''}" type="button" data-memo-filter="all">全部</button>${state.memoTypes.map(type => `<button class="${memoFilter === type.id ? 'active' : ''}" type="button" data-memo-filter="${esc(type.id)}">${esc(type.name)}</button>`).join('')}`; filters.querySelectorAll('[data-memo-filter]').forEach(button => button.addEventListener('click', () => { memoFilter = button.dataset.memoFilter; refreshMemoTypes(); renderMemos(); })); }
function renderMemoTypesDialog() { const list = document.getElementById('memoTypesList'); list.innerHTML = state.memoTypes.map(type => `<div><span>${esc(type.name)}</span><button data-type-rename="${esc(type.id)}" type="button">改名</button><button data-type-delete="${esc(type.id)}" type="button">删除</button></div>`).join(''); list.querySelectorAll('[data-type-rename]').forEach(button => button.onclick = () => { const type = state.memoTypes.find(row => row.id === button.dataset.typeRename), name = prompt('新的类型名称', type.name)?.trim(); if (!name) return; type.name = name; saveState(); refreshMemoTypes(); renderMemos(); renderMemoTypesDialog(); }); list.querySelectorAll('[data-type-delete]').forEach(button => button.onclick = () => { const id = button.dataset.typeDelete, count = state.memos.filter(memo => memo.type === id).length; if (!confirm(`删除这个类型吗？${count ? `已有 ${count} 条备忘会改为“提醒”。` : ''}`)) return; state.memoTypes = state.memoTypes.filter(type => type.id !== id); state.memos.forEach(memo => { if (memo.type === id) memo.type = state.memoTypes[0]?.id || 'reminder'; }); saveState(); refreshMemoTypes(); renderMemos(); renderMemoTypesDialog(); }); }
function resetMemoForm() { editingMemoId = ''; pendingMemoImage = ''; document.getElementById('memoForm').reset(); document.getElementById('memoFormTitle').textContent = '记一件想做的事'; document.getElementById('memoSubmit').textContent = '加入逛展备忘'; document.getElementById('memoCancelEdit').hidden = true; document.getElementById('memoImageHint').textContent = '未选择图片'; refreshMemoTypes(); }
function editMemo(id) { const memo = state.memos.find(row => row.id === id); if (!memo) return; editingMemoId = id; pendingMemoImage = memo.image || ''; document.getElementById('memoForm').classList.remove('is-collapsed'); refreshMemoTypes(); document.getElementById('memoType').value = memo.type; document.getElementById('memoBooth').value = memo.booth || ''; document.getElementById('memoTitle').value = memo.title || ''; document.getElementById('memoCircle').value = memo.circle || ''; document.getElementById('memoLinkType').value = memo.linkType || 'other'; document.getElementById('memoLink').value = memo.link || ''; document.getElementById('memoNote').value = memo.note || ''; document.getElementById('memoFormTitle').textContent = '编辑逛展备忘'; document.getElementById('memoSubmit').textContent = '保存修改'; document.getElementById('memoCancelEdit').hidden = false; document.getElementById('memoImageHint').textContent = pendingMemoImage ? '已保留裁剪图片，可重新上传替换' : '未选择图片'; document.getElementById('memoForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

function cropBounds() { const canvas=document.getElementById('cropCanvas'), image=cropSourceImage, fit=Math.min(canvas.width/image.width,canvas.height/image.height), w=image.width*fit,h=image.height*fit; return {x:(canvas.width-w)/2,y:(canvas.height-h)/2,w,h,fit}; }
function constrainCrop(rect,bounds) { const min=36; rect.w=Math.max(min,Math.min(rect.w,bounds.w)); rect.h=Math.max(min,Math.min(rect.h,bounds.h)); if(cropRatio!=='free'){const ratio=Number(cropRatio); if(rect.w/rect.h>ratio)rect.w=rect.h*ratio;else rect.h=rect.w/ratio;} rect.x=Math.max(bounds.x,Math.min(rect.x,bounds.x+bounds.w-rect.w)); rect.y=Math.max(bounds.y,Math.min(rect.y,bounds.y+bounds.h-rect.h)); return rect; }
function drawCropPreview() { if (!cropSourceImage) return; const canvas=document.getElementById('cropCanvas'),ctx=canvas.getContext('2d'),b=cropBounds(); if(!cropRect)cropRect=constrainCrop({x:b.x+b.w*.12,y:b.y+b.h*.12,w:b.w*.76,h:b.h*.76},b); const r=constrainCrop(cropRect,b); ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(cropSourceImage,b.x,b.y,b.w,b.h);ctx.fillStyle='rgba(20,20,20,.55)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();ctx.drawImage(cropSourceImage,b.x,b.y,b.w,b.h);ctx.restore();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeRect(r.x,r.y,r.w,r.h);[[r.x,r.y],[r.x+r.w,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h]].forEach(([x,y])=>{ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();}); canvas.dataset.crop=JSON.stringify({sx:(r.x-b.x)/b.fit,sy:(r.y-b.y)/b.fit,sw:r.w/b.fit,sh:r.h/b.fit}); }
function cropPoint(event){const canvas=document.getElementById('cropCanvas'),box=canvas.getBoundingClientRect();return{x:(event.clientX-box.left)*canvas.width/box.width,y:(event.clientY-box.top)*canvas.height/box.height};}
function startCropDrag(event){if(!cropRect)return;event.preventDefault();const p=cropPoint(event),r=cropRect,handles=[['nw',r.x,r.y],['ne',r.x+r.w,r.y],['sw',r.x,r.y+r.h],['se',r.x+r.w,r.y+r.h]],hit=handles.find(([,x,y])=>Math.hypot(p.x-x,p.y-y)<22);cropDrag={mode:hit?.[0]||(p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h?'move':'draw'),start:p,original:{...r}};if(cropDrag.mode==='draw')cropRect={x:p.x,y:p.y,w:36,h:36};event.currentTarget.setPointerCapture?.(event.pointerId);}
function moveCropDrag(event){if(!cropDrag)return;event.preventDefault();const p=cropPoint(event),d=cropDrag,o=cropDrag.original,b=cropBounds(),dx=p.x-d.start.x,dy=p.y-d.start.y;if(d.mode==='move')cropRect={...o,x:o.x+dx,y:o.y+dy};else if(d.mode==='draw')cropRect={x:Math.min(d.start.x,p.x),y:Math.min(d.start.y,p.y),w:Math.abs(p.x-d.start.x),h:Math.abs(p.y-d.start.y)};else{let x1=o.x,y1=o.y,x2=o.x+o.w,y2=o.y+o.h;if(d.mode.includes('n'))y1+=dy;if(d.mode.includes('s'))y2+=dy;if(d.mode.includes('w'))x1+=dx;if(d.mode.includes('e'))x2+=dx;cropRect={x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.abs(x2-x1),h:Math.abs(y2-y1)};}cropRect=constrainCrop(cropRect,b);drawCropPreview();}
function endCropDrag(){cropDrag=null;}
function applyMemoCrop() { const crop=JSON.parse(document.getElementById('cropCanvas').dataset.crop), out=document.createElement('canvas'), max=1100, ratio=crop.sw/crop.sh; if(ratio>=1){out.width=max;out.height=Math.max(1,Math.round(max/ratio));}else{out.height=max;out.width=Math.max(1,Math.round(max*ratio));} out.getContext('2d').drawImage(cropSourceImage,crop.sx,crop.sy,crop.sw,crop.sh,0,0,out.width,out.height); pendingMemoImage=out.toDataURL('image/jpeg',.82); document.getElementById('memoImageHint').textContent=`已截取 ${out.width}×${out.height}，会随备份导出`; document.getElementById('cropDialog').close(); }

function u16(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8); }
function u32(bytes, offset) { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }
async function unzipEntries(buffer) {
  const bytes = new Uint8Array(buffer); if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('legacy-xls');
  let eocd = -1; for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip'); const total = u16(bytes, eocd + 10); let pointer = u32(bytes, eocd + 16); const output = {};
  for (let index = 0; index < total; index++) {
    if (u32(bytes, pointer) !== 0x02014b50) throw new Error('zip-cd');
    const method = u16(bytes, pointer + 10), compressedSize = u32(bytes, pointer + 20), nameLength = u16(bytes, pointer + 28), extraLength = u16(bytes, pointer + 30), commentLength = u16(bytes, pointer + 32), localOffset = u32(bytes, pointer + 42);
    const name = new TextDecoder().decode(bytes.slice(pointer + 46, pointer + 46 + nameLength)); const localNameLength = u16(bytes, localOffset + 26), localExtraLength = u16(bytes, localOffset + 28), start = localOffset + 30 + localNameLength + localExtraLength; const compressed = bytes.slice(start, start + compressedSize);
    if (method === 0) output[name] = compressed; else if (method === 8) { const stream = new DecompressionStream('deflate-raw'); output[name] = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(stream)).arrayBuffer()); } else throw new Error('zip-method');
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return output;
}
function decodeXml(value) { return value.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(parseInt(number, 10))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
function parseShared(xml) { const values = []; for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) { let text = ''; for (const part of match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += decodeXml(part[1]); values.push(text); } return values; }
function columnIndex(reference) { let number = 0; for (const char of reference.match(/[A-Z]+/)[0]) number = number * 26 + char.charCodeAt(0) - 64; return number - 1; }
function parseSheet(xml, shared = []) { const rows = []; for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) { const row = []; for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) { const attributes = cellMatch[1], body = cellMatch[2], reference = (attributes.match(/\br="([A-Z]+\d+)"/) || [])[1]; if (!reference) continue; const index = columnIndex(reference), type = (attributes.match(/\bt="([^"]+)"/) || [])[1] || ''; let value = ''; if (type === 'inlineStr') value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(part => decodeXml(part[1])).join(''); else { const match = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/); if (match) { value = decodeXml(match[1]); if (type === 's') value = shared[Number(value)] ?? ''; } } row[index] = value; } rows.push(row); } return rows; }
async function readWishlistWorkbook(file) {
  const archive = await unzipEntries(await file.arrayBuffer()), decoder = new TextDecoder(), shared = archive['xl/sharedStrings.xml'] ? parseShared(decoder.decode(archive['xl/sharedStrings.xml'])) : [], sheetPath = Object.keys(archive).find(path => /^xl\/worksheets\/sheet\d+\.xml$/.test(path)); if (!sheetPath) throw new Error('sheet');
  const rows = parseSheet(decoder.decode(archive[sheetPath]), shared), headerIndex = rows.findIndex(row => row.includes('摊位号') && row.includes('展品名称')); if (headerIndex < 0) throw new Error('header');
  const headers = rows[headerIndex].map(value => String(value || '').trim()), indexes = {}; headers.forEach((header, index) => indexes[header] = index); const value = (row, key) => String(row[indexes[key]] ?? '').trim();
  return rows.slice(headerIndex + 1).filter(row => value(row, '摊位号') && value(row, '展品名称')).map(row => ({ boothRaw: value(row, '摊位号'), name: value(row, '展品名称'), type: value(row, '类型'), heat: Number(value(row, '热度')) || null, prepStatus: value(row, '筹备状态'), source: value(row, '原作'), circle: value(row, '社团名称') }));
}
function mergeImported(rows) { let added = 0, updated = 0; rows.forEach(row => { const existing = state.items.find(item => item.boothRaw === row.boothRaw && item.name === row.name); if (existing) { Object.assign(existing, row); updated++; } else { state.items.push({ id: uid(), ...row, price: null, qty: 1, status: 'pending', intent: 'want', visitDay: 'any', visitPeriod: 'any', note: '', coverUrl: '', description: '', author: '', cppId: '', order: state.items.length }); added++; } }); saveState(); return { added, updated }; }
function matchText(value) { return String(value || '').normalize('NFKC').replace(/[\s《》【】\[\]「」『』·•|｜:：~～—_-]/g, '').toLowerCase(); }
function mergeEnrichment(rows) {
  let matched = 0, imagesUpdated = 0;
  const matchedItemIds = new Set(), matchedRowIndexes = new Set();
  rows.forEach((row, rowIndex) => {
    const booth = matchText(row.booth || row.boothRaw), name = matchText(row.name);
    const nameMatches = state.items.filter(candidate => matchText(candidate.name) === name);
    const boothMatches = state.items.filter(candidate => matchText(candidate.boothRaw) === booth);
    const fuzzyBoothMatches = boothMatches.filter(candidate => { const candidateName=matchText(candidate.name), similarity=Math.min(candidateName.length,name.length)/Math.max(candidateName.length,name.length); return name.length>=4 && candidateName.length>=4 && similarity>=.8 && (candidateName.includes(name) || name.includes(candidateName)); });
    const item = state.items.find(candidate => row.cppId && String(candidate.cppId) === String(row.cppId)) ||
      state.items.find(candidate => matchText(candidate.boothRaw) === booth && matchText(candidate.name) === name) ||
      (fuzzyBoothMatches.length === 1 ? fuzzyBoothMatches[0] : null) ||
      (nameMatches.length === 1 ? nameMatches[0] : null);
    if (item && !matchedItemIds.has(item.id)) {
      if (!item.customCover && row.coverUrl && row.coverUrl !== item.coverUrl) imagesUpdated++;
      ['description','author','cppId','heat'].forEach(key => { if (row[key] != null) item[key] = row[key]; });
      ['circle','type'].forEach(key => { if (!item[key] && row[key]) item[key] = row[key]; });
      if (!item.customCover && row.coverUrl != null) item.coverUrl = row.coverUrl;
      matched++; matchedItemIds.add(item.id); matchedRowIndexes.add(rowIndex);
    }
  });
  saveState();
  return { matched, imagesUpdated, missingImages: state.items.filter(item => matchedItemIds.has(item.id) && !item.coverUrl).length, unmatched: state.items.filter(item => !matchedItemIds.has(item.id)), extraCount: Math.max(0, rows.length - matchedRowIndexes.size), sourceCount: rows.length };
}
async function loadPublicCatalog() {
  if (!catalogPromise) catalogPromise = fetch(CATALOG_URL).then(response => { if (!response.ok) throw new Error('catalog-http'); return response.json(); }).then(data => { if (!Array.isArray(data.items)) throw new Error('catalog-format'); return data.items; });
  return catalogPromise;
}
async function enrichFromPublicCatalog(showReport = true) {
  if (!state.items.length) return null;
  toast('正在从 CPTF 公共资料库自动补全…');
  const report = mergeEnrichment(await loadPublicCatalog());
  report.publicCatalog = true;
  state.catalogVersion = CATALOG_VERSION;
  saveState(); renderRoute(); renderList(); renderOrganizer();
  if (showReport) showSyncReport(report);
  toast(`公共资料库已匹配 ${report.matched} 件制品`);
  return report;
}
function showSyncReport(report) {
  const content = document.getElementById('reportDialogContent');
  content.innerHTML = `<p class="eyebrow">SYNC REPORT</p><h2>${report.publicCatalog ? '公共资料库自动补全' : '图片同步结果'}</h2><div class="report-stats"><div><strong>${report.matched}</strong><small>成功匹配</small></div><div><strong>${report.imagesUpdated}</strong><small>图片更新</small></div><div><strong>${report.unmatched.length}</strong><small>清单未匹配</small></div></div><p class="report-note">${report.publicCatalog ? '已自动查询 20115 件 CPTF 公开制品。' : `同步源共有 ${report.sourceCount} 条展品。`}价格、数量、意向和购买状态全部保留。${report.missingImages ? `其中 ${report.missingImages} 件在 CPP 公开资料中本身没有封面，可以在制品详情中自行添加。` : ''}</p>${report.unmatched.length ? `<h3>未匹配的清单条目</h3><ul class="report-list">${report.unmatched.map(item => `<li>${esc(item.boothRaw)} · ${esc(item.name)}</li>`).join('')}</ul>` : '<p>当前清单已全部匹配。</p>'}`;
  document.getElementById('reportDialog').showModal();
}
function downloadJson() { const blob = new Blob([JSON.stringify({ ...state, event: EVENT, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'CPTF-shopping-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }

function activateView(name,scroll=true){document.querySelectorAll('[data-view]').forEach(tab=>tab.classList.toggle('active',tab.dataset.view===name));document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===`${name}View`));if(name==='list')renderList();if(name==='route')renderRoute();if(name==='organize')renderOrganizer();if(name==='memo')renderMemos();if(scroll)window.scrollTo({top:document.querySelector('.view-tabs').offsetTop-12,behavior:'smooth'});}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)));
['organizeSearch','organizeFilter'].forEach(id => document.getElementById(id).addEventListener(id === 'organizeSearch' ? 'input' : 'change', renderOrganizer));
['searchInput','statusFilter','intentFilter','sortSelect'].forEach(id => document.getElementById(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderList));
document.getElementById('resetFilters').addEventListener('click', () => { document.getElementById('searchInput').value = ''; document.getElementById('statusFilter').value = 'all'; document.getElementById('intentFilter').value = 'all'; document.getElementById('sortSelect').value = 'custom'; renderList(); });
document.getElementById('organizePrompt').addEventListener('click',()=>activateView('organize'));document.getElementById('openOrganizer').addEventListener('click',()=>activateView('organize'));document.getElementById('closeOrganizer').addEventListener('click',()=>activateView('list'));
document.getElementById('openMemoForm').addEventListener('click',()=>{const form=document.getElementById('memoForm');form.classList.toggle('is-collapsed');if(!form.classList.contains('is-collapsed'))form.scrollIntoView({behavior:'smooth',block:'start'});});
document.getElementById('addManualBooth').addEventListener('click',()=>{const booth=prompt('输入想关注的摊位号，例如：肆C03')?.trim();if(!booth)return;if(!state.manualBooths.includes(booth))state.manualBooths.push(booth);if(!state.starredBooths.includes(booth))state.starredBooths.push(booth);saveState();activeHall=hallOf(booth);renderRoute();openBooth(booth);});
document.getElementById('excelInput').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const result = mergeImported(await readWishlistWorkbook(file)); renderRoute(); renderList(); toast(`导入完成：新增 ${result.added}，更新 ${result.updated}`); try { await enrichFromPublicCatalog(true); } catch (catalogError) { console.error(catalogError); toast('清单已导入，但公共图片资料库暂时无法连接'); } } catch (error) { console.error(error); toast(error.message === 'legacy-xls' ? '暂不支持旧式 .xls，请另存为 .xlsx' : 'Excel 读取失败，请检查文件格式'); } event.target.value = ''; });
document.getElementById('enrichmentInput').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const data = JSON.parse(await file.text()), rows = Array.isArray(data) ? data : data.items; if (!Array.isArray(rows)) throw new Error('format'); const report = mergeEnrichment(rows); renderList(); showSyncReport(report); toast(`已补全 ${report.matched} 条展品`); } catch (_) { toast('无法读取补全 JSON'); } event.target.value = ''; });
document.getElementById('backupInput').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const data = JSON.parse(await file.text()); if (!Array.isArray(data.items)) throw new Error('format'); state = normalizeState(data); saveState(); document.getElementById('budgetLimit').value=state.budgetLimit??'';document.getElementById('visitDate').value=state.visitDate||'2026-11-07';renderCountdown();renderRoute();renderList();renderOrganizer();renderMemos(); toast('备份已恢复，图片、社媒和备忘均已载入'); } catch (_) { toast('无法读取该备份'); } event.target.value = ''; });
document.getElementById('exportButton').addEventListener('click', downloadJson);
document.querySelectorAll('[data-list-view]').forEach(button => button.addEventListener('click', () => { state.listView = button.dataset.listView; document.querySelectorAll('[data-list-view]').forEach(row => row.classList.toggle('active', row === button)); saveState(); renderList(); }));
document.querySelectorAll('[data-organize-view]').forEach(button => button.addEventListener('click', () => { state.organizerView = button.dataset.organizeView; document.querySelectorAll('[data-organize-view]').forEach(row => row.classList.toggle('active', row === button)); saveState(); renderOrganizer(); }));
document.getElementById('settingsButton').addEventListener('click', () => document.getElementById('settingsDialog').showModal());
document.getElementById('refreshCatalogButton').addEventListener('click', async () => { try { catalogPromise=null; await enrichFromPublicCatalog(true); } catch (error) { console.error(error); toast('公共资料库暂时无法连接，请稍后重试'); } });
document.getElementById('showPurchased').checked = state.showPurchased;
document.getElementById('showPurchased').addEventListener('change', event => { state.showPurchased = event.target.checked; saveState(); renderRoute(); });
document.getElementById('budgetLimit').value = state.budgetLimit ?? '';
document.getElementById('budgetLimit').addEventListener('change', event => { state.budgetLimit = event.target.value === '' ? null : Number(event.target.value); saveState(); });
document.getElementById('visitDate').value=state.visitDate||'2026-11-07';document.getElementById('visitDate').addEventListener('change',event=>{state.visitDate=event.target.value||'2026-11-07';saveState();renderCountdown();});
document.getElementById('resetDataButton').addEventListener('click', () => { if (!confirm('恢复初始 CPTF 清单？当前价格、状态、备忘、星标、顺序和图片数据都会被清除。')) return; state = normalizeState({ version: 3, showPurchased: true, items: cloneSeed(), memos: [], starredBooths: [] }); saveState(); renderRoute(); renderList(); renderMemos(); toast('已恢复初始清单'); });
document.getElementById('memoForm').addEventListener('submit', event => {
  event.preventDefault();
  const title = document.getElementById('memoTitle').value.trim(); if (!title) return;
  const values = { type: document.getElementById('memoType').value, booth: document.getElementById('memoBooth').value.trim(), title, circle: document.getElementById('memoCircle').value.trim(), linkType: document.getElementById('memoLinkType').value, link: document.getElementById('memoLink').value.trim(), note: document.getElementById('memoNote').value.trim(), image: pendingMemoImage };
  if (editingMemoId) Object.assign(state.memos.find(memo => memo.id === editingMemoId), values); else state.memos.push({ id: uid(), ...values, done: false, createdAt: Date.now() });
  saveState(); const edited = Boolean(editingMemoId); resetMemoForm(); document.getElementById('memoForm').classList.add('is-collapsed'); renderMemos(); renderRoute(); toast(edited ? '备忘已更新' : '已加入逛展备忘');
});
document.getElementById('memoCancelEdit').addEventListener('click', resetMemoForm);
['memoStatusFilter','memoHallFilter'].forEach(id=>document.getElementById(id).addEventListener('change',renderMemos));
document.getElementById('manageMemoTypes').addEventListener('click', () => { renderMemoTypesDialog(); document.getElementById('memoTypesDialog').showModal(); });
document.getElementById('addMemoType').addEventListener('click', () => { const input=document.getElementById('newMemoTypeName'), name=input.value.trim(); if(!name)return; state.memoTypes.push({id:`custom-${uid()}`,name}); input.value=''; saveState(); refreshMemoTypes(); renderMemoTypesDialog(); });
document.getElementById('memoImageInput').addEventListener('change', async event => { const file=event.target.files[0]; if(!file)return; const data=await imageFileToDataUrl(file), image=new Image(); image.onload=()=>{cropSourceImage=image;cropRect=null;cropRatio='free';document.querySelectorAll('[data-crop-ratio]').forEach(button=>button.classList.toggle('active',button.dataset.cropRatio==='free'));drawCropPreview();document.getElementById('cropDialog').showModal();}; image.src=data; event.target.value=''; });
const cropCanvas=document.getElementById('cropCanvas');cropCanvas.addEventListener('pointerdown',startCropDrag);cropCanvas.addEventListener('pointermove',moveCropDrag);cropCanvas.addEventListener('pointerup',endCropDrag);cropCanvas.addEventListener('pointercancel',endCropDrag);document.querySelectorAll('[data-crop-ratio]').forEach(button=>button.addEventListener('click',()=>{cropRatio=button.dataset.cropRatio;document.querySelectorAll('[data-crop-ratio]').forEach(row=>row.classList.toggle('active',row===button));cropRect=null;drawCropPreview();}));document.getElementById('applyCrop').addEventListener('click',applyMemoCrop);
document.getElementById('quickBoothSearch').addEventListener('click', openBoothSearch);
document.getElementById('quickPurchaseOpen').addEventListener('click', () => openQuickPurchase());
document.getElementById('boothSearchInput').addEventListener('input', renderBoothSearch);
document.getElementById('quickPurchaseClose').addEventListener('click', () => document.getElementById('quickPurchaseDialog').close());
document.getElementById('quickPurchaseForm').addEventListener('submit', saveQuickPurchase);
async function loadQuickPurchasePhoto(event) { const file = event.target.files[0]; if (!file) return; try { quickPurchaseImage = await imageFileToDataUrl(file); document.getElementById('quickPurchasePhotoHint').textContent = `已选择：${file.name || '现场照片'}，会进入离线备份`; } catch (_) { quickPurchaseImage = ''; toast('照片读取失败，请换一张试试'); } event.target.value=''; }
document.getElementById('quickPurchasePhoto').addEventListener('change',loadQuickPurchasePhoto);document.getElementById('quickPurchaseCamera').addEventListener('change',loadQuickPurchasePhoto);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(() => {});

refreshMemoTypes(); document.querySelectorAll('[data-list-view]').forEach(button => button.classList.toggle('active', button.dataset.listView === (state.listView || 'list'))); document.querySelectorAll('[data-organize-view]').forEach(button => button.classList.toggle('active', button.dataset.organizeView === (state.organizerView || 'list'))); renderCountdown(); renderStats(); renderRoute(); renderList(); renderOrganizer(); renderMemos();activateView('list',false);
if (state.items.length && state.catalogVersion !== CATALOG_VERSION) setTimeout(() => enrichFromPublicCatalog(false).catch(error => console.warn('公共资料库自动补全失败', error)), 500);
