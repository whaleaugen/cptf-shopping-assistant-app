const EVENT = { id: 7166, exhibitId: 7940, name: 'COMICUP CITYTOUR FU', date: '2026-11-08T09:00:00+08:00', venue: '海峡国际会展中心' };
const STORAGE_KEY = 'cptf-shopping-v1';
const DEMO_STORAGE_KEY = 'cptf-shopping-demo-v1';
const IS_DEMO = new URLSearchParams(location.search).get('demo') === '1';
const ACTIVE_STORAGE_KEY = IS_DEMO ? DEMO_STORAGE_KEY : STORAGE_KEY;
const RESTORE_SNAPSHOT_KEY = 'cptf-shopping-pre-restore-v1';
const APP_RELEASE = '2026.10.30';
const CHANGELOG_SEEN_KEY = IS_DEMO ? 'cptf-changelog-seen-demo-v1' : 'cptf-changelog-seen-v1';
const CATALOG_VERSION = '2026-10-29-v4';
const CATALOG_UPDATED_AT = '2026 年 10 月 29 日';
const CATALOG_URL = `./data/cptf-catalog.json?v=${CATALOG_VERSION}`;
const TRANSFER_API = 'https://cptf-transfer.whale-keyjoon.workers.dev';
const HALL_ORDER = ['创', '壹', '贰', '叁', '肆'];
const MEMO_TYPES = { freebie: '无料', stamp: '盖章', promo: '摊宣', reminder: '提醒' };
const DEFAULT_MEMO_TYPES = Object.entries(MEMO_TYPES).map(([id, name]) => ({ id, name }));
const INTENTS = { must: '必买', want: '想买', maybe: '纠结', freebie: '无料', browse: '只逛逛' };
const INTENT_RANK = { must: 0, want: 1, maybe: 2, freebie: 3, browse: 4 };
const BOOTH_STATES = { pending: '未到达', visited: '已逛', return: '需要返场', queue: '排队中', away: '摊主暂离', skipped: '已跳过' };
const SEED_ITEMS = [];
const CHANGELOG = [
  { version: '2026.10.30', title: '心愿单体验与公共资料更新', changes: [
    '新增“无料”购买意向，并补回制品类型筛选和热度标签。',
    '心愿单支持在卡片上快速修改意向，手机管理模式也更紧凑。',
    '公共制品资料更新至 10 月 29 日，目前收录 20,370 条制品信息。',
    '恢复 JSON 或迁移存档前会保留本地快照，误覆盖时可以撤销。',
    '新增更新提醒；以后错过弹窗，也能从设置里重新查看。'
  ]},
  { version: '2026.10.29', title: '跨设备迁移', changes: [
    '加入 72 小时有效的加密迁移码，可在手机和电脑之间迁移完整存档。',
    '网络不便时仍可使用 JSON 文件备份；个人数据继续优先保存在本机。'
  ]},
  { version: '2026.10.28', title: '页面整合与现场工具', changes: [
    '主页面整理为“心愿单、摊位、备忘”，减少重复入口。',
    '新增摊位社媒、备忘联动、快速查摊位与现场记一笔。',
    '优化手机列表、双列视图和长图片展示。'
  ]}
];

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
let manageMode = false;
let selectedItemIds = new Set();
let editingIntentItemId = '';
let previousManageSort = 'custom';
if(IS_DEMO){document.body.classList.add('demo-mode');document.getElementById('demoBanner').hidden=false;}
document.getElementById('catalogUpdatedAt').textContent = CATALOG_UPDATED_AT;
document.getElementById('currentReleaseLabel').textContent = `v${APP_RELEASE}`;

function renderChangelog() {
  document.getElementById('changelogContent').innerHTML = CHANGELOG.map((release, index) => {
    const details = `<ul>${release.changes.map(change => `<li>${esc(change)}</li>`).join('')}</ul>`;
    if (index === 0) return `<article class="changelog-release current"><div class="changelog-release-head"><span>最新版本</span><time>${esc(release.version)}</time></div><h3>${esc(release.title)}</h3>${details}</article>`;
    return `<details class="changelog-release"><summary><span><time>${esc(release.version)}</time>${esc(release.title)}</span><b>查看</b></summary>${details}</details>`;
  }).join('');
}
function openChangelog() { renderChangelog(); document.getElementById('changelogDialog').showModal(); }
function markChangelogSeen() { try { localStorage.setItem(CHANGELOG_SEEN_KEY, APP_RELEASE); } catch (_) {} }

function cloneSeed() { return SEED_ITEMS.map(item => ({ ...item })); }
function demoCover(label, width, height, colors) { const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="100%" height="100%" rx="24" fill="url(#g)"/><circle cx="${width*.7}" cy="${height*.3}" r="${Math.min(width,height)*.18}" fill="white" opacity=".35"/><text x="50%" y="48%" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(22,Math.min(width,height)*.1)}" fill="#463b36">${label}</text><text x="50%" y="58%" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(12,Math.min(width,height)*.045)}" fill="#655650">CPTF DEMO</text></svg>`; return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }
function createDemoState(){const specs=[['方形徽章套组',500,500,'壹A01','must',68,'pending'],['横版双人亚克力立牌',800,450,'壹A01','want',120,'pending'],['超长竖版海报｜Special Edition 2026',420,900,'壹A01','maybe',45,'pending'],['没有图片的神秘福袋',500,500,'贰B08','browse',null,'pending'],['《非常非常长的中英文混合制品名称 / The Longest Souvenir Name!》',700,500,'贰B08','want',88,'soldout'],['角色票根纪念套装',520,740,'叁C12','must',35,'purchased'],['随机吧唧 × 3',500,500,'叁C12','want',20,'pending'],['尚未决定的插画本',640,860,'肆D05','want',55,'pending'],['闪粉明信片组',760,500,'肆D05','maybe',null,'pending'],['限定帆布袋',600,720,'肆F16','browse',90,'pending']];const items=specs.map((s,i)=>({id:`demo-${i+1}`,name:s[0],coverUrl:i===3?'':demoCover(`DEMO ${i+1}`,s[1],s[2],i%2?['#dfeadf','#f3c6b8']:['#f5dfd2','#dce9e1']),boothRaw:s[3],circle:i<3?'月光社':i<7?'软糖工房':'云朵研究所',source:i%2?'原创':'幻想作品',type:i%3?'周边':'图集',heat:120-i*7,prepStatus:'策划中',intent:s[4],intentReviewed:i!==7,price:s[5],qty:i===6?3:1,status:s[6],order:i}));return normalizeState({version:9,items,memos:[{id:'demo-m1',type:'freebie',booth:'创E03',title:'领取无料明信片',circle:'星屑老师',note:'关注主页后领取',done:false},{id:'demo-m2',type:'stamp',booth:'创E03',title:'免费盖章',circle:'星屑老师',note:'自带手账本',done:false},{id:'demo-m3',type:'reminder',booth:'肆F16',title:'等待老师发布最终摊宣',circle:'云朵研究所',done:false}],starredBooths:['壹A01','创E03'],starredItems:['demo-1'],manualBooths:['创E03','肆F16'],boothProfiles:{'壹A01':{note:'重点先逛',links:[{id:'demo-link',platform:'微博',label:'月光老师',url:'https://weibo.com/'}]},'创E03':{note:'只有无料和盖章',links:[]}},budgetLimit:500,listView:'grid'});}
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_STORAGE_KEY));
    if (parsed && Array.isArray(parsed.items)) return normalizeState(parsed);
  } catch (_) {}
  if (IS_DEMO) return createDemoState();
  return normalizeState({ version: 3, showPurchased: true, items: cloneSeed(), memos: [], starredBooths: [] });
}
function normalizeState(data) { const normalized = { version: 9, showPurchased: true, memos: [], memoTypes: DEFAULT_MEMO_TYPES, starredBooths: [], starredItems: [], boothStates: {}, boothProfiles: {}, manualBooths: [], budgetLimit: null, visitDate: '2026-11-07', listView: 'list', organizerView: 'list', ...data, memos: Array.isArray(data.memos) ? data.memos : [], memoTypes: Array.isArray(data.memoTypes) && data.memoTypes.length ? data.memoTypes : DEFAULT_MEMO_TYPES, starredBooths: Array.isArray(data.starredBooths) ? data.starredBooths : [], starredItems: Array.isArray(data.starredItems) ? data.starredItems : [], manualBooths: Array.isArray(data.manualBooths) ? data.manualBooths : [], boothStates: data.boothStates && typeof data.boothStates === 'object' ? data.boothStates : {}, boothProfiles: data.boothProfiles && typeof data.boothProfiles === 'object' ? data.boothProfiles : {}, items: data.items.map((item, index) => ({ ...item, qty: Number(item.qty) > 0 ? Number(item.qty) : 1, intent: item.intent || 'want', intentReviewed: item.intentReviewed === true, order: Number.isFinite(item.order) ? item.order : index })) }; if (normalized.listView === 'large') normalized.listView = 'grid'; Object.keys(normalized.boothProfiles).forEach(booth => { const profile=normalized.boothProfiles[booth] || {}; profile.note=profile.note || ''; profile.links=Array.isArray(profile.links) ? profile.links : []; normalized.boothProfiles[booth]=profile; }); return normalized; }
function saveState() { localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(state)); renderStats(); }
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
  const noPrice = state.items.filter(item => item.status === 'pending' && item.intentReviewed && !['browse','freebie'].includes(item.intent) && !(Number(item.price) >= 0 && item.price !== null && item.price !== '')).length;
  document.getElementById('statItems').textContent = state.items.length;
  document.getElementById('statBooths').textContent = booths.size;
  const projected = spent + budget;
  const limit = Number(state.budgetLimit);
  const hasLimit = state.budgetLimit !== null && state.budgetLimit !== '' && Number.isFinite(limit);
  document.getElementById('statBudgetLimit').textContent = hasLimit ? money(limit) : '未设置';
  document.getElementById('statBudget').textContent = money(budget);
  document.getElementById('statSpent').textContent = money(spent);
  document.getElementById('statProjected').textContent = money(projected);
  const remainingCard = document.getElementById('remainingCard');
  remainingCard.classList.toggle('over-budget', hasLimit && projected > limit);
  document.getElementById('statRemaining').textContent = !hasLimit ? '未设置预算' : projected > limit ? `超出 ${money(projected - limit)}` : money(limit - projected);
  document.getElementById('statMaybe').textContent = money(maybe);
  document.getElementById('statNoPrice').textContent = noPrice;
  document.getElementById('statPending').textContent = pending;
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
  const type = document.getElementById('typeFilter').value;
  const sort = document.getElementById('sortSelect').value;
  const result = state.items.filter(item => {
    const haystack = [item.name, item.boothRaw, item.circle, item.source, item.type, item.author].join(' ').toLowerCase();
    const itemType = String(item.type || '').trim() || '__uncategorized__';
    return (!query || haystack.includes(query)) && (status === 'all' || item.status === status) && (intent === 'all' || (item.intentReviewed && item.intent === intent)) && (type === 'all' || itemType === type);
  });
  result.sort((a, b) => sort === 'custom' ? a.order - b.order : sort === 'priority' ? Number(isItemStarred(b.id)) - Number(isItemStarred(a.id)) || Number(isStarred(b.boothRaw)) - Number(isStarred(a.boothRaw)) || (INTENT_RANK[a.intent] ?? 9) - (INTENT_RANK[b.intent] ?? 9) || a.order - b.order : sort === 'heat' ? (Number(b.heat) || 0) - (Number(a.heat) || 0) : sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : routeIndex(a) - routeIndex(b));
  return result;
}

function refreshTypeFilter() {
  const select = document.getElementById('typeFilter'); if (!select) return;
  const current = select.value || 'all';
  const types = [...new Set(state.items.map(item => String(item.type || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const hasUncategorized = state.items.some(item => !String(item.type || '').trim());
  select.innerHTML = `<option value="all">全部类型</option>${types.map(type=>`<option value="${esc(type)}">${esc(type)}</option>`).join('')}${hasUncategorized?'<option value="__uncategorized__">未分类</option>':''}`;
  select.value = [...select.options].some(option => option.value === current) ? current : 'all';
}

function hasActiveListSubset() {
  return document.getElementById('searchInput').value.trim() || document.getElementById('statusFilter').value !== 'all' || document.getElementById('intentFilter').value !== 'all' || document.getElementById('typeFilter').value !== 'all';
}
function coverMarkup(item) {
  return item.coverUrl ? `<img class="product-cover" src="${esc(item.coverUrl)}" alt="${esc(item.name)}封面" loading="lazy" referrerpolicy="no-referrer">` : '<div class="product-cover cover-placeholder">C</div>';
}
function renderList() {
  refreshTypeFilter();
  const items = filteredItems();
  const list = document.getElementById('productList');
  const sortingDisabled = manageMode && hasActiveListSubset();
  list.className = `product-list view-${manageMode ? 'list' : (state.listView || 'list')} ${manageMode ? 'is-managing' : ''} ${sortingDisabled ? 'sorting-disabled' : ''}`;
  document.getElementById('firstUse').hidden = state.items.length !== 0;
  const noMatches = state.items.length ? '<div class="empty-state">没有找到符合条件的展品。</div>' : '';
  list.innerHTML = items.length ? items.map(item => {
    const priceText = item.price === null || item.price === '' || item.price === undefined ? '价格待定' : `${money(Number(item.price) * (Number(item.qty) || 1))}${Number(item.qty) > 1 ? ` · ${item.qty}件` : ''}`;
    const statusTag = item.status !== 'pending' ? `<span class="tag status-tag ${item.status}">${statusLabel(item.status)}</span>` : '';
    const manageTools = manageMode ? `<input class="manage-checkbox" type="checkbox" data-select-item="${item.id}" ${selectedItemIds.has(item.id) ? 'checked' : ''} aria-label="选择${esc(item.name)}">` : '';
    const dragHandle = manageMode ? `<span class="touch-drag" ${sortingDisabled ? '' : `data-drag-id="${item.id}"`} aria-label="${sortingDisabled ? '筛选时不可排序' : '拖动排序'}" role="button" tabindex="0">⠿</span>` : '';
    const typeTag = item.type ? `<span class="tag type-tag">${esc(item.type)}</span>` : '<span class="tag type-tag muted">未分类</span>';
    const heatTag = item.heat !== null && item.heat !== undefined && item.heat !== '' ? `<span class="tag heat">热度 ${esc(item.heat)}</span>` : '';
    const intentControl = manageMode ? `<span class="tag intent-tag ${item.intentReviewed ? item.intent : 'undecided'}">${item.intentReviewed ? esc(INTENTS[item.intent] || '想买') : '待决定'}</span>` : `<button class="tag intent-tag ${item.intentReviewed ? item.intent : 'undecided'}" data-quick-intent="${item.id}" type="button">${item.intentReviewed ? esc(INTENTS[item.intent] || '想买') : '待决定'}</button>`;
    return `<article class="product-card ${isItemStarred(item.id) ? 'starred' : ''} intent-${item.intent}" draggable="${manageMode && !sortingDisabled}" data-open-id="${item.id}">${manageTools}${coverMarkup(item)}<div class="product-copy"><h3>${isItemStarred(item.id) ? '<span class="star-inline">★</span>' : ''}${esc(item.name)}</h3><p>${esc(item.boothRaw)} · ${esc(item.circle)}${item.source ? ` · ${esc(item.source)}` : ''}</p><div class="product-summary"><span>${priceText}</span>${intentControl}${typeTag}${heatTag}${statusTag}</div></div>${dragHandle}${manageMode ? '' : `<button class="star-button ${isItemStarred(item.id) ? 'active' : ''}" data-star-item="${item.id}" type="button" aria-label="${isItemStarred(item.id) ? '取消重点制品' : '设为重点制品'}">★</button>`}</article>`;
  }).join('') : noMatches;
  list.querySelectorAll('[data-open-id]').forEach(card => card.addEventListener('click', event => { if (!manageMode && !event.target.closest('input,button,select,[role="button"]')) openItem(card.dataset.openId); }));
  list.querySelectorAll('[data-price-id]').forEach(input => input.addEventListener('change', () => { const item = state.items.find(row => row.id === input.dataset.priceId); item.price = input.value === '' ? null : Number(input.value); saveState(); }));
  list.querySelectorAll('[data-qty-id]').forEach(input => input.addEventListener('change', () => { const item=state.items.find(row=>row.id===input.dataset.qtyId);item.qty=Math.max(1,Number(input.value)||1);saveState(); }));
  list.querySelectorAll('[data-status-id]').forEach(select => { select.value=state.items.find(item=>item.id===select.dataset.statusId)?.status||'pending'; select.addEventListener('change', event => { event.stopPropagation(); const item=state.items.find(row=>row.id===select.dataset.statusId);item.status=select.value;saveState();renderRoute();renderList(); }); });
  list.querySelectorAll('[data-star-item]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); toggleItemStar(button.dataset.starItem); }));
  list.querySelectorAll('[data-quick-intent]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); openIntentDialog(button.dataset.quickIntent); }));
  list.querySelectorAll('[data-select-item]').forEach(input => input.addEventListener('change', () => { input.checked ? selectedItemIds.add(input.dataset.selectItem) : selectedItemIds.delete(input.dataset.selectItem); updateManageBar(); }));
  if (manageMode && !sortingDisabled) bindProductDragging(list);
  const hint = document.getElementById('manageHint'); if (hint) hint.textContent = sortingDisabled ? '当前有搜索或筛选；清除后才能调整完整清单顺序。' : '拖动右侧手柄调整顺序，或勾选后删除。';
  updateFloatingViewButton();
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
function openIntentDialog(id) {
  const item = state.items.find(row => row.id === id); if (!item) return;
  editingIntentItemId = id;
  document.getElementById('intentDialogName').textContent = item.name;
  document.getElementById('intentDialogChoices').innerHTML = Object.entries(INTENTS).map(([value,label]) => `<button class="intent-choice ${value} ${item.intentReviewed && item.intent === value ? 'active' : ''}" type="button" data-dialog-intent="${value}">${label}</button>`).join('');
  document.querySelectorAll('[data-dialog-intent]').forEach(button => button.addEventListener('click', () => {
    const target = state.items.find(row => row.id === editingIntentItemId); if (!target) return;
    target.intent = button.dataset.dialogIntent; target.intentReviewed = true; saveState(); renderList(); renderOrganizer(); renderRoute(); document.getElementById('intentDialog').close(); toast(`已设为${INTENTS[target.intent]}`);
  }));
  document.getElementById('intentDialog').showModal();
}
function cycleStatus(id) { const item = state.items.find(row => row.id === id); if (!item) return; item.status = item.status === 'pending' ? 'purchased' : item.status === 'purchased' ? 'soldout' : item.status === 'soldout' ? 'abandoned' : 'pending'; saveState(); renderRoute(); renderList(); }
function bindProductDragging(list) { let draggedId = '', touchTarget = ''; const clear=()=>list.querySelectorAll('.product-card').forEach(card=>card.classList.remove('dragging','drag-over')); list.querySelectorAll('.product-card').forEach(card => { card.addEventListener('dragstart', event => { draggedId = card.dataset.openId; card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; }); card.addEventListener('dragend', clear); card.addEventListener('dragover', event => { event.preventDefault(); card.classList.add('drag-over'); }); card.addEventListener('dragleave', () => card.classList.remove('drag-over')); card.addEventListener('drop', event => { event.preventDefault(); clear(); moveItemBefore(draggedId, card.dataset.openId); }); }); list.querySelectorAll('[data-drag-id]').forEach(handle=>{handle.addEventListener('pointerdown',event=>{draggedId=handle.dataset.dragId;touchTarget='';handle.setPointerCapture(event.pointerId);handle.closest('.product-card').classList.add('dragging');});handle.addEventListener('pointermove',event=>{if(!draggedId)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.product-card');list.querySelectorAll('.drag-over').forEach(row=>row.classList.remove('drag-over'));if(target&&target.dataset.openId!==draggedId){target.classList.add('drag-over');touchTarget=target.dataset.openId;}});const finish=()=>{const source=draggedId,target=touchTarget;draggedId='';touchTarget='';clear();if(source&&target)moveItemBefore(source,target);};handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);}); }
function moveItemBefore(sourceId, targetId) { if (!sourceId || sourceId === targetId) return; const ordered = [...state.items].sort((a,b) => a.order - b.order); const from = ordered.findIndex(item => item.id === sourceId), to = ordered.findIndex(item => item.id === targetId); if (from < 0 || to < 0) return; const [moved] = ordered.splice(from,1); ordered.splice(to,0,moved); ordered.forEach((item,index) => item.order = index); document.getElementById('sortSelect').value = 'custom'; saveState(); renderList(); toast('顺序已更新'); }
function moveItemBy(id, direction) { const ordered = [...state.items].sort((a,b) => a.order - b.order), from = ordered.findIndex(item => item.id === id), to = from + direction; if (from < 0 || to < 0 || to >= ordered.length) return; [ordered[from], ordered[to]] = [ordered[to], ordered[from]]; ordered.forEach((item,index) => item.order = index); document.getElementById('sortSelect').value = 'custom'; saveState(); renderList(); }
function updateManageBar() { const button=document.getElementById('deleteSelected'); if(!button)return; button.disabled=!selectedItemIds.size; button.textContent=selectedItemIds.size ? `删除所选（${selectedItemIds.size}）` : '删除所选'; const visible=filteredItems(),allSelected=visible.length&&visible.every(item=>selectedItemIds.has(item.id));document.getElementById('selectAllItems').textContent=allSelected?'取消全选':'全选'; }
function setManageMode(enabled) { if(enabled){previousManageSort=document.getElementById('sortSelect').value;document.getElementById('sortSelect').value='custom';}else{document.getElementById('sortSelect').value=previousManageSort;selectedItemIds.clear();}manageMode=enabled;document.getElementById('manageBar').hidden=!enabled;document.getElementById('toggleManage').hidden=enabled;updateFilterUi();renderList();updateManageBar(); }
function updateFloatingViewButton() { const button=document.getElementById('viewFab'); if(!button)return; const grid=(state.listView||'list')==='grid'; button.textContent=grid?'☰':'▦'; button.setAttribute('aria-label',grid?'切换为列表视图':'切换为双列视图'); button.hidden=manageMode || !document.getElementById('listView').classList.contains('active') || !state.items.length; }
function updateFilterUi(){const count=['statusFilter','intentFilter','typeFilter'].filter(id=>document.getElementById(id).value!=='all').length+(document.getElementById('sortSelect').value!=='custom'?1:0);document.getElementById('activeFilterCount').textContent=count?`· ${count}`:'';document.getElementById('resetFilters').hidden=!count;}
function openItem(id) {
  const item = state.items.find(row => row.id === id); if (!item) return;
  const cppLink = item.cppId ? `https://www.allcpp.cn/d/${encodeURIComponent(item.cppId)}.do` : '';
  const profile=boothProfile(item.boothRaw), socialLinks=profile.links.filter(link=>safeUrl(link.url));
  document.getElementById('dialogContent').innerHTML = `<div class="dialog-image-wrap">${item.coverUrl ? `<img class="dialog-cover" src="${esc(item.coverUrl)}" alt="${esc(item.name)}封面" referrerpolicy="no-referrer">` : '<div class="dialog-cover dialog-cover-empty">还没有图片</div>'}</div><div class="dialog-image-actions"><label class="image-upload-button">${item.coverUrl ? '更换图片' : '添加图片'}<input id="itemImageInput" type="file" accept="image/*" hidden></label>${item.coverUrl ? '<button id="removeImageButton" type="button">移除图片</button>' : ''}</div><p class="eyebrow">${esc(item.boothRaw)} · ${esc(item.type || '展品')}</p><h2>${esc(item.name)}</h2><div class="dialog-meta-grid"><div><small>社团</small><strong>${esc(item.circle || '未填写')}</strong></div><div><small>作者</small><strong>${esc(item.author || '未填写')}</strong></div><div><small>原作</small><strong>${esc(item.source || '未填写')}</strong></div><div><small>热度 / 筹备</small><strong>${item.heat ? esc(item.heat) : '—'} · ${esc(item.prepStatus || '未知')}</strong></div></div>${socialLinks.length?`<div class="social-links"><strong>老师 / 社团主页</strong>${socialLinks.map(link=>`<a href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${esc(link.platform||'主页')}${link.label?` · ${esc(link.label)}`:''} ↗</a>`).join('')}</div>`:''}${item.description ? `<p>${esc(item.description)}</p>` : ''}${cppLink ? `<a class="external-link" href="${cppLink}" target="_blank" rel="noopener noreferrer">在 CPP 查看原展品 ↗</a>` : ''}<div class="dialog-controls three"><select id="dialogStatus"><option value="pending">待购买</option><option value="purchased">已购买</option><option value="soldout">已完售</option><option value="abandoned">已放弃</option></select><input id="dialogPrice" type="number" min="0" placeholder="价格" value="${item.price ?? ''}"><input id="dialogQty" type="number" min="1" placeholder="数量" value="${item.qty || 1}"></div><div class="planning-controls one"><label><span>购买意向</span><select id="dialogIntent"><option value="must">必买</option><option value="want">想买</option><option value="maybe">纠结</option><option value="browse">只逛逛</option></select></label></div><button class="open-booth-link" id="dialogOpenBooth" type="button">查看 ${esc(item.boothRaw)} 摊位全部信息</button><div class="dialog-item-actions"><button id="dialogStar" class="star-action ${isItemStarred(item.id) ? 'active' : ''}" type="button">${isItemStarred(item.id) ? '★ 重点制品' : '☆ 标记重点制品'}</button><button id="deleteItemButton" class="delete-item-button" type="button">删除这个制品</button></div>`;
  const dialog = document.getElementById('itemDialog'); if (!dialog.open) dialog.showModal();
  const status = document.getElementById('dialogStatus'); status.value = item.status; status.onchange = () => { item.status = status.value; saveState(); renderRoute(); renderList(); };
  const price = document.getElementById('dialogPrice'); price.onchange = () => { item.price = price.value === '' ? null : Number(price.value); saveState(); renderList(); };
  const qty = document.getElementById('dialogQty'); qty.onchange = () => { item.qty=Math.max(1,Number(qty.value)||1);saveState();renderList(); };
  const intent = document.getElementById('dialogIntent'); if (!intent.querySelector('[value="freebie"]')) intent.querySelector('[value="browse"]').insertAdjacentHTML('beforebegin','<option value="freebie">无料</option>'); intent.value = item.intent; intent.onchange = () => { item.intent = intent.value; item.intentReviewed = true; saveState(); renderList(); renderRoute(); renderOrganizer(); };
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
  content.innerHTML = `<div class="booth-mode-head"><p class="eyebrow">BOOTH</p><h2>${isStarred(booth) ? '★ ' : ''}${esc(booth)} · ${esc(circle)}</h2><div class="booth-mode-summary">到这个摊位：买 ${items.filter(item=>item.status==='pending').length} 件 · 无料 ${memos.filter(memo=>memo.type==='freebie'&&!memo.done).length} 项 · 盖章 ${memos.filter(memo=>memo.type==='stamp'&&!memo.done).length} 项 · 其他待办 ${memos.filter(memo=>!['freebie','stamp'].includes(memo.type)&&!memo.done).length} 项</div><div class="booth-head-actions"><select id="boothVisitState">${Object.entries(BOOTH_STATES).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select><button class="booth-star-action ${isStarred(booth) ? 'active' : ''}" data-booth-star="${esc(booth)}" type="button">${isStarred(booth) ? '★ 重点摊位' : '☆ 加星重点'}</button><button class="booth-add-memo" id="boothAddMemo" type="button">＋ 添加备忘</button></div></div><section class="booth-profile"><label><span>摊位备注</span><textarea id="boothNote" placeholder="老师公告、领取提醒、返场原因……">${esc(profile.note)}</textarea></label><div class="booth-social"><h3>老师 / 社团主页</h3><div class="social-links-list">${profile.links.length?profile.links.map(link=>`<div><a href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${esc(link.platform||'其他')}${link.label?` · ${esc(link.label)}`:''} ↗</a><span><button type="button" data-copy-social="${esc(link.id)}">复制</button><button type="button" data-edit-social="${esc(link.id)}">编辑</button><button type="button" data-delete-social="${esc(link.id)}">删除</button></span></div>`).join(''):'<p>还没有保存社媒主页。</p>'}</div><div class="social-add"><select id="socialPlatform"><option>小红书</option><option>微博</option><option>B站</option><option>LOFTER</option><option>其他</option></select><input id="socialLabel" placeholder="老师名称或备注"><input id="socialUrl" type="url" placeholder="https://…"><button id="addSocialLink" type="button">添加链接</button><button id="cancelSocialEdit" type="button" hidden>取消编辑</button></div></div></section><div class="booth-task-list"><h3>关联制品</h3>${items.length?items.map(item => `<div class="booth-task">${coverMarkup(item)}<div class="booth-task-copy"><h4><span class="intent-mini ${item.intentReviewed?item.intent:'undecided'}">${item.intentReviewed?esc(INTENTS[item.intent]):'待决定'}</span>${esc(item.name)}</h4><p>${esc(item.circle)} · ${esc(item.prepStatus || '')}</p></div><div class="booth-task-controls"><input type="number" min="0" placeholder="价格" value="${item.price ?? ''}" data-booth-price="${item.id}"><select class="status-select" data-booth-status="${item.id}"><option value="pending">待购买</option><option value="purchased">已购买</option><option value="soldout">已完售</option><option value="abandoned">已放弃</option></select></div></div>`).join(''):'<div class="booth-empty">这个摊位暂时没有心愿制品。</div>'}<h3>关联备忘</h3>${memos.length?memos.map(memo => { const link = safeUrl(memo.link); return `<div class="booth-memo">${memo.image ? `<img class="memo-image" src="${esc(memo.image)}" alt="">` : ''}<b><span class="memo-type ${memo.type}">${esc(memoTypeLabel(memo.type))}</span>${esc(memo.title)}</b><p>${esc(memo.note || memo.circle || '')}</p><div class="memo-actions"><button class="memo-done" type="button" data-booth-memo="${memo.id}">${memo.done ? '恢复待办' : '标记完成'}</button>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">打开链接 ↗</a>` : ''}</div></div>`; }).join(''):'<div class="booth-empty">还没有关联备忘。</div>'}</div>`;
  const pendingFreebies=items.filter(item=>item.status==='pending'&&item.intentReviewed&&item.intent==='freebie').length+memos.filter(memo=>memo.type==='freebie'&&!memo.done).length,pendingBuys=items.filter(item=>item.status==='pending'&&item.intent!=='freebie').length,pendingStamps=memos.filter(memo=>memo.type==='stamp'&&!memo.done).length,pendingOther=memos.filter(memo=>!['freebie','stamp'].includes(memo.type)&&!memo.done).length;
  content.querySelector('.booth-mode-summary').textContent=`到这个摊位：买 ${pendingBuys} 件 · 领 ${pendingFreebies} 个无料 · 盖章 ${pendingStamps} 项 · 其他待办 ${pendingOther} 项`;
  content.querySelectorAll('[data-booth-status]').forEach(select => { const item=state.items.find(row=>row.id===select.dataset.boothStatus);select.value=item?.status||'pending';select.addEventListener('change',()=>{item.status=select.value;saveState();renderList();renderRoute();openBooth(booth);}); });
  content.querySelectorAll('[data-booth-price]').forEach(input => input.addEventListener('change', () => { const item = state.items.find(row => row.id === input.dataset.boothPrice); item.price = input.value === '' ? null : Number(input.value); saveState(); renderList(); }));
  content.querySelectorAll('[data-booth-memo]').forEach(button => button.addEventListener('click', () => { toggleMemo(button.dataset.boothMemo); openBooth(booth); }));
  content.querySelector('[data-booth-star]').addEventListener('click', () => { toggleStar(booth); openBooth(booth); });
  content.querySelector('#boothNote').addEventListener('change',event=>{profile.note=event.target.value.trim();saveState();});
  const socialForm={platform:content.querySelector('#socialPlatform'),label:content.querySelector('#socialLabel'),url:content.querySelector('#socialUrl'),save:content.querySelector('#addSocialLink'),cancel:content.querySelector('#cancelSocialEdit')};let editingSocialId='';
  content.querySelector('#addSocialLink').addEventListener('click',()=>{const url=safeUrl(socialForm.url.value);if(!url){toast('请输入安全的 HTTP/HTTPS 链接');return;}const values={platform:socialForm.platform.value,label:socialForm.label.value.trim(),url};if(editingSocialId)Object.assign(profile.links.find(row=>row.id===editingSocialId),values);else profile.links.push({id:uid(),...values});saveState();openBooth(booth);toast(editingSocialId?'社媒主页已更新':'社媒主页已保存');});
  content.querySelectorAll('[data-edit-social]').forEach(button=>button.addEventListener('click',()=>{const link=profile.links.find(row=>row.id===button.dataset.editSocial);if(!link)return;editingSocialId=link.id;socialForm.platform.value=link.platform||'其他';socialForm.label.value=link.label||'';socialForm.url.value=link.url||'';socialForm.save.textContent='保存修改';socialForm.cancel.hidden=false;socialForm.url.focus();}));
  content.querySelector('#cancelSocialEdit').addEventListener('click',()=>openBooth(booth));
  content.querySelectorAll('[data-copy-social]').forEach(button=>button.addEventListener('click',async()=>{const link=profile.links.find(row=>row.id===button.dataset.copySocial);try{await navigator.clipboard.writeText(link.url);toast('链接已复制');}catch(_){toast('浏览器不允许复制，请长按链接');}}));
  content.querySelectorAll('[data-delete-social]').forEach(button=>button.addEventListener('click',()=>{if(!confirm('删除这条社媒链接吗？'))return;profile.links=profile.links.filter(link=>link.id!==button.dataset.deleteSocial);saveState();openBooth(booth);}));
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

function randomTransferCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(16));return [...bytes].map(value=>alphabet[value%alphabet.length]).join('');}
function normalizeTransferCode(value){return String(value||'').toUpperCase().replace(/[^A-Z2-9]/g,'');}
function formatTransferCode(value){return normalizeTransferCode(value).match(/.{1,4}/g)?.join('-')||'';}
function bytesToBase64Url(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function base64UrlToBytes(value){const normalized=String(value).replace(/-/g,'+').replace(/_/g,'/'),binary=atob(normalized+'='.repeat((4-normalized.length%4)%4)),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
function base32(bytes){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
async function transferId(code){return base32(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))).slice(0,12);}
async function transferKey(code,salt,usage){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,[usage]);}
function transferSummary(){return{items:state.items.length,booths:new Set([...state.items.map(item=>item.boothRaw),...state.memos.map(memo=>memo.booth).filter(Boolean),...state.manualBooths]).size,memos:state.memos.length,images:state.items.filter(item=>item.customCover).length+state.memos.filter(memo=>memo.image).length};}
function dataSummary(data){const rows=Array.isArray(data.items)?data.items:[],memos=Array.isArray(data.memos)?data.memos:[],manual=Array.isArray(data.manualBooths)?data.manualBooths:[];return{items:rows.length,booths:new Set([...rows.map(item=>item.boothRaw).filter(Boolean),...memos.map(memo=>memo.booth).filter(Boolean),...manual]).size,memos:memos.length,images:rows.filter(item=>item.customCover).length+memos.filter(memo=>memo.image).length,purchases:rows.filter(item=>item.manualPurchase).length};}
function renderAfterRestore(){document.getElementById('budgetLimit').value=state.budgetLimit??'';document.getElementById('visitDate').value=state.visitDate||'2026-11-07';refreshTypeFilter();renderCountdown();renderRoute();renderList();renderOrganizer();renderMemos();}
function showRestoreUndo(){if(IS_DEMO)return;document.getElementById('restoreUndoBar').hidden=false;}
function applyRestoredState(data,source){if(IS_DEMO||!Array.isArray(data?.items))throw new Error('invalid');const candidate=normalizeState(data),previous=JSON.stringify(state),snapshot=JSON.stringify({createdAt:Date.now(),source,data:JSON.parse(previous)});localStorage.setItem(RESTORE_SNAPSHOT_KEY,snapshot);try{localStorage.setItem(ACTIVE_STORAGE_KEY,JSON.stringify(candidate));}catch(error){localStorage.removeItem(RESTORE_SNAPSHOT_KEY);throw error;}state=candidate;renderAfterRestore();showRestoreUndo();}
function setTransferBusy(busy,message=''){document.getElementById('createTransferButton').disabled=busy;document.getElementById('restoreTransferButton').disabled=busy;document.getElementById('transferStatus').textContent=message;}
async function createTransfer(){if(IS_DEMO){toast('演示模式不能上传迁移存档');return;}const code=randomTransferCode(),plain=new TextEncoder().encode(JSON.stringify({...state,event:EVENT,exportedAt:new Date().toISOString()}));if(plain.byteLength>17*1024*1024){toast('存档图片太多，请先使用 JSON 文件迁移');return;}setTransferBusy(true,'正在本机加密并上传…');try{const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await transferKey(code,salt,'encrypt'),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain)),payload=JSON.stringify({v:1,s:bytesToBase64Url(salt),i:bytesToBase64Url(iv),c:bytesToBase64Url(cipher)}),id=await transferId(code),response=await fetch(`${TRANSFER_API}/v1/transfers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,payload,summary:transferSummary()})});if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||`HTTP ${response.status}`);const formatted=formatTransferCode(code);document.getElementById('transferCode').textContent=formatted;document.getElementById('transferCodeBox').hidden=false;document.getElementById('transferCodeInput').value=formatted;setTransferBusy(false,'迁移码已生成，72 小时内有效。');toast('加密迁移码已生成');}catch(error){console.error(error);setTransferBusy(false,'生成失败，请检查网络或稍后重试。');toast('迁移码生成失败');}}
async function restoreTransfer(){if(IS_DEMO){toast('演示模式不能恢复正式存档');return;}const code=normalizeTransferCode(document.getElementById('transferCodeInput').value);if(code.length!==16){toast('请输入完整的 16 位迁移码');return;}setTransferBusy(true,'正在下载并解密存档…');try{const id=await transferId(code),response=await fetch(`${TRANSFER_API}/v1/transfers/${id}`);if(response.status===404)throw new Error('not-found');if(!response.ok)throw new Error(`HTTP ${response.status}`);const record=await response.json(),pack=JSON.parse(record.payload),salt=base64UrlToBytes(pack.s),iv=base64UrlToBytes(pack.i),cipher=base64UrlToBytes(pack.c),key=await transferKey(code,salt,'decrypt'),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher),data=JSON.parse(new TextDecoder().decode(plain));if(!Array.isArray(data.items))throw new Error('invalid');const summary=record.summary||dataSummary(data);if(!confirm(`找到存档：${summary.items??data.items.length} 件制品、${summary.booths??'—'} 个摊位、${summary.memos??data.memos?.length??0} 条备忘。\n\n恢复会覆盖当前设备上的清单，但会先保留一份可撤销快照。确定继续吗？`)){setTransferBusy(false,'已取消恢复，云端存档仍然保留。');return;}applyRestoredState(data,'迁移码');let deleted=false;try{const deletion=await fetch(`${TRANSFER_API}/v1/transfers/${id}`,{method:'DELETE'});deleted=deletion.ok;}catch(_){}document.getElementById('settingsDialog').close();setTransferBusy(false,deleted?'恢复成功，临时副本已删除。':'数据已恢复，但临时副本删除失败。它仍会在到期后失效。');toast('存档已恢复，可撤销');}catch(error){console.error(error);setTransferBusy(false,error.message==='not-found'?'没有找到这个迁移码，可能已恢复或过期。':'恢复失败，原有本地数据未改变。请检查迁移码或网络。');toast('迁移码恢复失败');}}

function activateView(name,scroll=true){document.querySelectorAll('[data-view]').forEach(tab=>tab.classList.toggle('active',tab.dataset.view===name));document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===`${name}View`));document.body.dataset.activeView=name;document.querySelector('.field-dock').hidden=name==='list'||name==='organize';if(name!=='list'&&manageMode)setManageMode(false);if(name==='list')renderList();if(name==='route')renderRoute();if(name==='organize')renderOrganizer();if(name==='memo')renderMemos();updateFloatingViewButton();if(scroll)window.scrollTo({top:document.querySelector('.view-tabs').offsetTop-12,behavior:'smooth'});}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)));
['organizeSearch','organizeFilter'].forEach(id => document.getElementById(id).addEventListener(id === 'organizeSearch' ? 'input' : 'change', renderOrganizer));
['searchInput','statusFilter','intentFilter','typeFilter','sortSelect'].forEach(id => document.getElementById(id).addEventListener(id === 'searchInput' ? 'input' : 'change', () => { updateFilterUi(); renderList(); }));
document.getElementById('filterToggle').addEventListener('click',()=>{const panel=document.getElementById('filterOptions');panel.hidden=!panel.hidden;document.getElementById('filterToggle').classList.toggle('active',!panel.hidden);});
document.getElementById('resetFilters').addEventListener('click', () => { document.getElementById('searchInput').value = ''; document.getElementById('statusFilter').value = 'all'; document.getElementById('intentFilter').value = 'all'; document.getElementById('typeFilter').value = 'all'; document.getElementById('sortSelect').value = 'custom'; updateFilterUi(); renderList(); });
document.getElementById('organizePrompt').addEventListener('click',()=>activateView('organize'));document.getElementById('openOrganizer').addEventListener('click',()=>activateView('organize'));document.getElementById('closeOrganizer').addEventListener('click',()=>activateView('list'));
document.getElementById('toggleManage').addEventListener('click',()=>setManageMode(true));document.getElementById('finishManage').addEventListener('click',()=>setManageMode(false));
document.getElementById('deleteSelected').addEventListener('click',()=>{if(!selectedItemIds.size||!confirm(`删除选中的 ${selectedItemIds.size} 件制品吗？这项操作无法撤销。`))return;state.items=state.items.filter(item=>!selectedItemIds.has(item.id));state.starredItems=state.starredItems.filter(id=>!selectedItemIds.has(id));selectedItemIds.clear();saveState();renderList();renderRoute();updateManageBar();toast('已删除所选制品');});
document.getElementById('selectAllItems').addEventListener('click',()=>{const visible=filteredItems();const allSelected=visible.length&&visible.every(item=>selectedItemIds.has(item.id));visible.forEach(item=>allSelected?selectedItemIds.delete(item.id):selectedItemIds.add(item.id));renderList();updateManageBar();});
document.getElementById('viewFab').addEventListener('click',()=>{state.listView=(state.listView||'list')==='grid'?'list':'grid';saveState();renderList();});
document.getElementById('emptyImportExcel').addEventListener('click',()=>document.getElementById('excelInput').click());document.getElementById('emptyRestoreBackup').addEventListener('click',()=>document.getElementById('backupInput').click());document.getElementById('emptyFollowBooth').addEventListener('click',()=>{activateView('route');document.getElementById('addManualBooth').click();});
document.getElementById('openMemoForm').addEventListener('click',()=>{const form=document.getElementById('memoForm');form.classList.toggle('is-collapsed');if(!form.classList.contains('is-collapsed'))form.scrollIntoView({behavior:'smooth',block:'start'});});
document.getElementById('addManualBooth').addEventListener('click',()=>{const booth=prompt('输入想关注的摊位号，例如：肆C03')?.trim();if(!booth)return;if(!state.manualBooths.includes(booth))state.manualBooths.push(booth);if(!state.starredBooths.includes(booth))state.starredBooths.push(booth);saveState();activeHall=hallOf(booth);renderRoute();openBooth(booth);});
document.getElementById('excelInput').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const result = mergeImported(await readWishlistWorkbook(file)); renderRoute(); renderList(); toast(`导入完成：新增 ${result.added}，更新 ${result.updated}`); try { await enrichFromPublicCatalog(true); } catch (catalogError) { console.error(catalogError); toast('清单已导入，但公共图片资料库暂时无法连接'); } } catch (error) { console.error(error); toast(error.message === 'legacy-xls' ? '暂不支持旧式 .xls，请另存为 .xlsx' : 'Excel 读取失败，请检查文件格式'); } event.target.value = ''; });
document.getElementById('enrichmentInput').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const data = JSON.parse(await file.text()), rows = Array.isArray(data) ? data : data.items; if (!Array.isArray(rows)) throw new Error('format'); const report = mergeEnrichment(rows); renderList(); showSyncReport(report); toast(`已补全 ${report.matched} 条展品`); } catch (_) { toast('无法读取补全 JSON'); } event.target.value = ''; });
document.getElementById('backupInput').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const data = JSON.parse(await file.text()); if (!Array.isArray(data.items)) throw new Error('format'); const current=dataSummary(state),incoming=dataSummary(data); if(!confirm(`当前设备：${current.items} 件制品、${current.booths} 个摊位、${current.memos} 条备忘。\n备份文件：${incoming.items} 件制品、${incoming.booths} 个摊位、${incoming.memos} 条备忘。\n\n恢复会覆盖当前数据，但会先保留一份可撤销快照。确定继续吗？`))return; applyRestoredState(data,'JSON 备份'); toast('备份已恢复，可撤销'); } catch (_) { toast('无法读取该备份，原有数据未改变'); } event.target.value = ''; });
document.getElementById('exportButton').addEventListener('click', downloadJson);
document.getElementById('createTransferButton').addEventListener('click',createTransfer);
document.getElementById('restoreTransferButton').addEventListener('click',restoreTransfer);
document.getElementById('transferCodeInput').addEventListener('input',event=>{const code=normalizeTransferCode(event.target.value).slice(0,16);event.target.value=formatTransferCode(code);});
document.getElementById('copyTransferCode').addEventListener('click',async()=>{const code=document.getElementById('transferCode').textContent;try{await navigator.clipboard.writeText(code);toast('迁移码已复制');}catch(_){document.getElementById('transferCodeInput').value=code;document.getElementById('transferCodeInput').select();toast('请长按复制迁移码');}});
document.getElementById('undoRestore').addEventListener('click',()=>{try{const snapshot=JSON.parse(localStorage.getItem(RESTORE_SNAPSHOT_KEY));if(!snapshot?.data)throw new Error('missing');const candidate=normalizeState(snapshot.data);localStorage.setItem(ACTIVE_STORAGE_KEY,JSON.stringify(candidate));state=candidate;localStorage.removeItem(RESTORE_SNAPSHOT_KEY);document.getElementById('restoreUndoBar').hidden=true;renderAfterRestore();toast('已撤销刚才的恢复');}catch(error){console.error(error);toast('恢复前快照不可用');}});
document.getElementById('dismissRestoreUndo').addEventListener('click',()=>{document.getElementById('restoreUndoBar').hidden=true;localStorage.removeItem(RESTORE_SNAPSHOT_KEY);});
document.querySelectorAll('[data-list-view]').forEach(button => button.addEventListener('click', () => { state.listView = button.dataset.listView; document.querySelectorAll('[data-list-view]').forEach(row => row.classList.toggle('active', row === button)); saveState(); renderList(); }));
document.querySelectorAll('[data-organize-view]').forEach(button => button.addEventListener('click', () => { state.organizerView = button.dataset.organizeView; document.querySelectorAll('[data-organize-view]').forEach(row => row.classList.toggle('active', row === button)); saveState(); renderOrganizer(); }));
document.getElementById('settingsButton').addEventListener('click', () => document.getElementById('settingsDialog').showModal());
document.getElementById('openChangelog').addEventListener('click', () => { document.getElementById('settingsDialog').close(); openChangelog(); });
document.getElementById('changelogDialog').addEventListener('close', markChangelogSeen);
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

refreshMemoTypes(); updateFilterUi(); document.querySelectorAll('[data-list-view]').forEach(button => button.classList.toggle('active', button.dataset.listView === (state.listView || 'list'))); document.querySelectorAll('[data-organize-view]').forEach(button => button.classList.toggle('active', button.dataset.organizeView === (state.organizerView || 'list'))); renderCountdown(); renderStats(); renderRoute(); renderList(); renderOrganizer(); renderMemos();activateView('list',false);
if(!IS_DEMO){try{const snapshot=JSON.parse(localStorage.getItem(RESTORE_SNAPSHOT_KEY));if(snapshot?.data&&Date.now()-Number(snapshot.createdAt)<86400000)showRestoreUndo();else localStorage.removeItem(RESTORE_SNAPSHOT_KEY);}catch(_){localStorage.removeItem(RESTORE_SNAPSHOT_KEY);}}
if(!IS_DEMO){try{if(localStorage.getItem(CHANGELOG_SEEN_KEY)!==APP_RELEASE)setTimeout(()=>{if(!document.querySelector('dialog[open]'))openChangelog();},650);}catch(_){}}
if (state.items.length && state.catalogVersion !== CATALOG_VERSION) setTimeout(() => enrichFromPublicCatalog(false).catch(error => console.warn('公共资料库自动补全失败', error)), 500);

