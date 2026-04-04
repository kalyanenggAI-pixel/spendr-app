// ─────────────────────────────────────────────────────────────
// Spendr — app.js (Enhanced)
// ─────────────────────────────────────────────────────────────

const API_BASE = 'https://spendr-app.onrender.com';

// ── STATE ────────────────────────────────────────────────────
let currentUser   = null;   // { name, email, plan: 'free'|'pro' }
let expenses      = [];
let budgets       = {};     // { cat: limit }
let accounts      = ['Everyday', 'Savings', 'Credit Card'];
let selectedAcct  = 'Everyday';
let categoryChart = null;
let momChart      = null;
let pieChart      = null;
let chatHistory   = [];
let currentTxns   = [];

const CAT_COLORS = {
  'Groceries':          '#4ade80',
  'Food & Dining':      '#fb923c',
  'Transport & Fuel':   '#60a5fa',
  'Bills & Utilities':  '#a78bfa',
  'Entertainment':      '#f472b6',
  'Health & Pharmacy':  '#34d399',
  'Shopping':           '#fbbf24',
  'Home & Hardware':    '#94a3b8',
  'Insurance':          '#c084fc',
  'Government & Rego':  '#64748b',
  'Transfers':          '#334155',
};
const ALL_CATS = Object.keys(CAT_COLORS);
function catColor(cat) { return CAT_COLORS[cat] || '#6b7280'; }

// ── AUTH STORAGE KEY ─────────────────────────────────────────
function userKey(k) { return `spendr_${currentUser?.email}_${k}`; }

function saveState() {
  if (!currentUser) return;
  localStorage.setItem(userKey('expenses'), JSON.stringify(expenses));
  localStorage.setItem(userKey('budgets'),  JSON.stringify(budgets));
  localStorage.setItem(userKey('accounts'), JSON.stringify(accounts));
}

function loadState() {
  expenses = JSON.parse(localStorage.getItem(userKey('expenses')) || '[]');
  budgets  = JSON.parse(localStorage.getItem(userKey('budgets'))  || '{}');
  accounts = JSON.parse(localStorage.getItem(userKey('accounts')) || '["Everyday","Savings","Credit Card"]');
}

// ── AUTH ─────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', (tab==='login'&&i===0)||(tab==='register'&&i===1)));
  document.getElementById('login-form').style.display    = tab==='login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab==='register' ? '' : 'none';
  document.getElementById('auth-error').style.display = 'none';
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.style.display = 'block';
}

function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value.trim();
  if (!email || !pass) return showAuthError('Please enter email and password.');
  const stored = localStorage.getItem('spendr_user_' + email);
  if (!stored) return showAuthError('No account found. Please register first.');
  const user = JSON.parse(stored);
  if (user.password !== btoa(pass)) return showAuthError('Incorrect password.');
  loginSuccess({ name: user.name, email: user.email, plan: user.plan });
}

function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value.trim();
  const plan  = document.querySelector('input[name="plan"]:checked')?.value || 'free';
  if (!name || !email || !pass) return showAuthError('Please fill in all fields.');
  if (!email.includes('@'))     return showAuthError('Enter a valid email address.');
  if (pass.length < 6)          return showAuthError('Password must be at least 6 characters.');
  if (localStorage.getItem('spendr_user_' + email)) return showAuthError('Account already exists. Sign in instead.');
  localStorage.setItem('spendr_user_' + email, JSON.stringify({ name, email, password: btoa(pass), plan }));
  loginSuccess({ name, email, plan });
}

function loginSuccess(user) {
  currentUser = user;
  localStorage.setItem('spendr_session', JSON.stringify(user));
  loadState();
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'none';
  const appEl = document.getElementById('app');
  if (appEl) appEl.style.display = 'block';
  const headerUser = document.getElementById('header-user');
  if (headerUser) headerUser.textContent = user.name.split(' ')[0];
  const planEl = document.getElementById('header-plan');
  if (planEl) { planEl.textContent = user.plan.toUpperCase(); planEl.className = 'header-plan' + (user.plan === 'pro' ? ' pro' : ''); }
  renderAll();
  applyProLocks();
}

function doLogout() {
  if (!confirm('Sign out?')) return;
  localStorage.removeItem('spendr_session');
  localStorage.removeItem('spendr_current_user');
  currentUser = null; expenses = []; budgets = {}; chatHistory = []; currentTxns = [];
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) {
    document.getElementById('app').style.display = 'none';
    authScreen.style.display = 'flex';
  } else {
    window.location.href = 'landing.html';
  }
}

// Check existing session
const savedSession = localStorage.getItem('spendr_session');
if (savedSession) {
  try { loginSuccess(JSON.parse(savedSession)); } catch(e) { localStorage.removeItem('spendr_session'); }
}

// ── NAV ──────────────────────────────────────────────────────
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.getElementById('tab-' + name)?.classList.add('active');
  if (name === 'transactions') renderAllTransactions();
  if (name === 'budgets')      renderBudgets();
  if (name === 'recurring')    renderRecurring();
  if (name === 'analytics')    renderAnalytics();
  if (name === 'data')         renderDataView();
}

// ── PRO LOCKS ────────────────────────────────────────────────
function applyProLocks() {
  if (!currentUser) return;
  const isPro = currentUser.plan === 'pro';
  ['rec-pro-lock','analytics-pro-lock'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const existing = el.querySelector('.pro-lock-overlay');
    if (isPro && existing) existing.remove();
    if (!isPro && !existing) {
      const overlay = document.createElement('div');
      overlay.className = 'pro-lock-overlay';
      overlay.innerHTML = `<div class="lock-icon">🔒</div><p>This feature requires Pro</p><button class="btn-sm btn-sm-primary" onclick="openUpgradeModal()">Upgrade</button>`;
      el.appendChild(overlay);
    }
  });
}

// ── UPGRADE MODAL ────────────────────────────────────────────
function openUpgradeModal()  { document.getElementById('upgrade-modal').classList.add('open'); }
function closeUpgradeModal() { document.getElementById('upgrade-modal').classList.remove('open'); }
function selectPro() {
  document.getElementById('plan-free-card').classList.remove('selected');
  document.getElementById('plan-pro-card').classList.add('selected');
}
function activatePro() {
  if (!currentUser) return;
  currentUser.plan = 'pro';
  localStorage.setItem('spendr_session', JSON.stringify(currentUser));
  const stored = localStorage.getItem('spendr_user_' + currentUser.email);
  if (stored) {
    const u = JSON.parse(stored); u.plan = 'pro';
    localStorage.setItem('spendr_user_' + currentUser.email, JSON.stringify(u));
  }
  const planEl = document.getElementById('header-plan');
  planEl.textContent = 'PRO'; planEl.className = 'header-plan pro';
  closeUpgradeModal();
  applyProLocks();
  renderBudgets(); renderRecurring(); renderAnalytics();
  alert('🎉 You\'re now on Pro! All features unlocked.');
}
// ── DOM READY: attach all event listeners once the DOM is available ──
document.addEventListener('DOMContentLoaded', () => {
  // Close upgrade modal on backdrop click
  document.getElementById('upgrade-modal')?.addEventListener('click', function(e) { if (e.target === this) closeUpgradeModal(); });

  // File drop / upload
  const fileDrop  = document.getElementById('file-drop');
  const fileInput = document.getElementById('file-input');
  fileDrop?.addEventListener('dragover',  e => { e.preventDefault(); fileDrop.classList.add('drag'); });
  fileDrop?.addEventListener('dragleave', () => fileDrop.classList.remove('drag'));
  fileDrop?.addEventListener('drop', e => {
    e.preventDefault(); fileDrop.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
  fileInput?.addEventListener('change', () => { if (fileInput.files[0]) readFile(fileInput.files[0]); });

  // Analyse / clear buttons
  document.getElementById('btn-analyse')?.addEventListener('click', async () => {
    const text = document.getElementById('csv-paste').value.trim();
    if (!text || text.length < 10) return setStatus('Paste your CSV data first.', 'error');
    setStatus('Reading transactions...', 'info');
    try {
      const rows = parseCSV(text);
      if (!rows.length) return setStatus('No transactions found. Check your CSV.', 'error');
      await importTransactions(rows);
    } catch(e) { setStatus('Error: ' + e.message, 'error'); }
  });

  document.getElementById('btn-clear')?.addEventListener('click', () => {
    if (!expenses.length) return;
    if (!confirm('Clear all transactions?')) return;
    expenses = []; currentTxns = []; chatHistory = [];
    saveState(); renderAll(); clearChat(); setStatus('Cleared.', '');
  });

  // Chat
  document.getElementById('btn-send')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // Search & filter
  document.getElementById('txn-search')?.addEventListener('input', renderAllTransactions);
  document.getElementById('txn-cat-filter')?.addEventListener('change', renderAllTransactions);
  document.getElementById('txn-acct-filter')?.addEventListener('change', renderAllTransactions);
});

// ── ACCOUNTS ─────────────────────────────────────────────────
function addAccount() {
  const name = prompt('Account name (e.g. "Joint Account"):');
  if (!name?.trim()) return;
  if (accounts.includes(name.trim())) return alert('Account already exists.');
  accounts.push(name.trim());
  saveState();
  renderAccountSelector();
}

function renderAccountSelector() {
  const row = document.getElementById('account-selector');
  if (!row) return;
  row.innerHTML = accounts.map(a => 
    `<span class="acct-chip${a===selectedAcct?' active':''}" data-acct="${escHtml(a)}" onclick="selectAccount('${escHtml(a)}')">${a==='Everyday'?'💳':a==='Savings'?'🏦':a==='Credit Card'?'💰':'🏛️'} ${escHtml(a)}</span>`
  ).join('') + `<span class="acct-chip" onclick="addAccount()">+ Add</span>`;
  document.getElementById('total-accounts').textContent = accounts.length;
}

function selectAccount(name) { selectedAcct = name; renderAccountSelector(); }

function readFile(file) {
  const reader = new FileReader();
  reader.onload = e => { document.getElementById('csv-paste').value = e.target.result; setStatus('File loaded. Click Analyse.', 'info'); };
  reader.readAsText(file);
}

// ── CSV PARSER ────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const first = splitLine(lines[0]);
  const hasHeader = first.some(c => /date|description|amount|balance|type/i.test(c));
  const dataLines = lines.slice(hasHeader ? 1 : 0);
  return dataLines.map(line => {
    const cols = splitLine(line);
    const dateIdx = cols.findIndex(c => /\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(c));
    const date = dateIdx >= 0 ? cols[dateIdx] : '';
    let descIdx = -1, longest = 0;
    cols.forEach((c,i) => { if (i===dateIdx) return; if (/^\d[\d.,\-]*$/.test(c)) return; if (c.length>longest){longest=c.length;descIdx=i;} });
    const desc = descIdx >= 0 ? cols[descIdx] : '';
    const nums = cols.map((c,i) => ({i, v:parseFloat(c.replace(/,/g,''))})).filter(({i,v}) => i!==dateIdx && !isNaN(v) && v>0);
    nums.sort((a,b) => a.v-b.v);
    const amount = nums.length > 0 ? nums[0].v : 0;
    return { date, desc, amount };
  }).filter(r => r.amount > 0 && r.desc.trim());
}

function splitLine(line) {
  const result=[]; let cur=''; let inQ=false;
  for (const ch of line) {
    if (ch==='"') inQ=!inQ;
    else if (ch===',' && !inQ) { result.push(cur.trim()); cur=''; }
    else cur+=ch;
  }
  result.push(cur.trim()); return result;
}

// ── CATEGORISE ────────────────────────────────────────────────
function cleanDesc(desc) {
  return desc.toUpperCase()
    .replace(/DEBIT CARD PURCHASE|EFT DEBIT|PAYMENT BY AUTHORITY|CREDIT CARD PURCHASE/g,'')
    .replace(/\b[A-Z]{3}\b$/,'').replace(/\d{6,}/g,'').replace(/\d{2}\/\d{2}/g,'')
    .replace(/\s+/g,' ').trim();
}

function categorise(desc) {
  const d = desc.toLowerCase();
  if (d.includes('transfer')||d.includes('osko')||d.includes('payid')||d.includes('bpay')) return 'Transfers';
  if (d.includes('aami')||d.includes('nrma')||d.includes('allianz')||d.includes('insurance')||d.includes('iselect')) return 'Insurance';
  if (d.includes('electricity')||d.includes('energy')||d.includes('agl')||d.includes('origin')||
      d.includes('water')||d.includes('telstra')||d.includes('optus')||d.includes('vodafone')||
      d.includes('boost')||d.includes('tpg')||d.includes('aussie broadband')||d.includes('internet')||
      d.includes('gas')||d.includes('nbn')) return 'Bills & Utilities';
  if (d.includes('vicroads')||d.includes('service nsw')||d.includes('rego')||d.includes('registration')||d.includes('department of transport')) return 'Government & Rego';
  if (d.includes('coles')||d.includes('woolworths')||d.includes('aldi')||d.includes('iga')||
      d.includes('harris farm')||d.includes('costco')||d.includes('big fresh')||d.includes('foodworks')) return 'Groceries';
  if (d.includes('chemist')||d.includes('pharmacy')||d.includes('priceline')||d.includes('amcal')||
      d.includes('terry white')||d.includes('medical')||d.includes('doctor')||d.includes('dental')||
      d.includes('hospital')||d.includes('pathology')||d.includes('health')) return 'Health & Pharmacy';
  if (d.includes('bunnings')||d.includes('ikea')||d.includes('harvey norman')||
      d.includes('the good guys')||d.includes('jb hi')||d.includes('hardware')) return 'Home & Hardware';
  if (d.includes('uber')||d.includes('taxi')||d.includes('didi')||d.includes('ola')||
      d.includes('fuel')||d.includes('7-eleven')||d.includes('bp ')||d.includes('shell')||
      d.includes('ampol')||d.includes('caltex')||d.includes('puma energy')||
      d.includes('metro trains')||d.includes('myki')||d.includes('transurban')||
      d.includes('citylink')||d.includes('eastlink')||d.includes('linkt')) return 'Transport & Fuel';
  if (d.includes('cafe')||d.includes('restaurant')||d.includes('takeaway')||
      d.includes('mcdonald')||d.includes('kfc')||d.includes('hungry jacks')||
      d.includes('domino')||d.includes('pizza')||d.includes('subway')||
      d.includes('grill')||d.includes('bakery')||d.includes('sushi')||
      d.includes('thai')||d.includes('indian')||d.includes('chinese')||
      d.includes('noodle')||d.includes('eatery')||d.includes('diner')||
      d.includes('burrito')||d.includes('kebab')||d.includes('fish & chips')||
      d.includes('coffee')||d.includes('starbucks')||d.includes('mccafe')) return 'Food & Dining';
  if (d.includes('netflix')||d.includes('spotify')||d.includes('disney')||d.includes('stan')||
      d.includes('binge')||d.includes('foxtel')||d.includes('apple')||d.includes('google play')||
      d.includes('youtube')||d.includes('amazon prime')||d.includes('cinema')||
      d.includes('event cinemas')||d.includes('hoyts')||d.includes('adobe')||d.includes('microsoft 365')) return 'Entertainment';
  return 'Shopping';
}

// ── IMPORT ───────────────────────────────────────────────────
async function importTransactions(rows) {
  const now = new Date().toISOString();
  // Duplicate detection: check note + amount + account
  const existing = new Set(expenses.map(e => `${e.note}|${e.amount}|${e.account}`));

  let dupes = 0;
  const newTxns = rows.map(r => {
    const note = cleanDesc(r.desc);
    const key  = `${note}|${r.amount}|${selectedAcct}`;
    if (existing.has(key)) { dupes++; return null; }
    return { id: Date.now()+Math.random(), amount: r.amount, cat: categorise(note), note, date: r.date||now, account: selectedAcct, fresh: true };
  }).filter(Boolean);

  currentTxns = newTxns;
  expenses = [...newTxns, ...expenses.map(e => ({...e, fresh:false}))];
  saveState();
  renderAll();
  const dupeMsg = dupes > 0 ? ` (${dupes} duplicates skipped)` : '';
  setStatus(`✓ ${newTxns.length} transactions imported${dupeMsg}`, 'success');
  document.getElementById('csv-paste').value = '';

  if (newTxns.length > 0) await getInitialInsights(newTxns);
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  renderTotals();
  renderAccountSelector();
  renderChart();
  renderCategoryFilters();
  renderBudgets();
  renderRecurring();
}

function renderTotals() {
  const now = new Date();
  const monthTotal = expenses.filter(e => {
    if (!e.date) return false;
    const d = new Date(e.date.includes('/') ? e.date.split('/').reverse().join('-') : e.date);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  }).reduce((s,e) => s+e.amount, 0);
  document.getElementById('total-month').textContent = '$' + monthTotal.toFixed(2);
  document.getElementById('total-all').textContent   = '$' + expenses.reduce((s,e)=>s+e.amount,0).toFixed(2);
  document.getElementById('total-count').textContent = expenses.length;
  document.getElementById('total-accounts').textContent = accounts.length;
}

// ── RENDER CHART ──────────────────────────────────────────────
function renderChart() {
  const canvas = document.getElementById('categoryChart');
  if (!canvas) return;
  if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
  const current = expenses.filter(e => e.fresh !== false);
  const totals = {};
  current.forEach(e => { totals[e.cat] = (totals[e.cat]||0) + e.amount; });
  const sorted = Object.entries(totals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if (!sorted.length) return;
  const labels = sorted.map(([k])=>k);
  const values = sorted.map(([,v])=>v);
  const colors = labels.map(l => catColor(l));
  const total  = values.reduce((s,v)=>s+v,0);
  categoryChart = new Chart(canvas, {
    type:'bar', data:{labels, datasets:[{data:values, backgroundColor:colors.map(c=>c+'cc'), borderColor:colors, borderWidth:1, borderRadius:6, borderSkipped:false}]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const pct=Math.round(ctx.parsed.x/total*100);return '  $'+ctx.parsed.x.toFixed(2)+'  ('+pct+'%)';}},backgroundColor:'#fff',borderColor:'rgba(0,0,0,0.1)',borderWidth:1,titleColor:'#111',bodyColor:'#666',padding:10}},
      scales:{x:{beginAtZero:true,ticks:{color:'#6b6b80',callback:v=>'$'+v,font:{family:"'JetBrains Mono',monospace",size:10}},grid:{color:'rgba(0,0,0,0.05)'}},y:{ticks:{color:'#666',font:{family:"'Outfit',sans-serif",size:11,weight:'500'}},grid:{display:false}}},
      animation:{duration:500,easing:'easeOutQuart'}
    }
  });
  canvas.parentElement.style.height = Math.max(180, sorted.length*42+40) + 'px';
}

// ── RENDER TRANSACTIONS ───────────────────────────────────────
function renderCategoryFilters() {
  const sel = document.getElementById('txn-cat-filter');
  const acctSel = document.getElementById('txn-acct-filter');
  if (!sel || !acctSel) return;
  const cats = [...new Set(expenses.map(e=>e.cat))].sort();
  sel.innerHTML = '<option value="">All categories</option>' + cats.map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  acctSel.innerHTML = '<option value="">All accounts</option>' + accounts.map(a=>`<option value="${escHtml(a)}">${escHtml(a)}</option>`).join('');
}

function renderAllTransactions() {
  const list = document.getElementById('all-txn-list');
  if (!list) return;
  const search  = (document.getElementById('txn-search')?.value||'').toLowerCase();
  const catFilt = document.getElementById('txn-cat-filter')?.value||'';
  const acctFilt= document.getElementById('txn-acct-filter')?.value||'';

  let filtered = expenses.filter(e => {
    if (catFilt  && e.cat !== catFilt) return false;
    if (acctFilt && e.account !== acctFilt) return false;
    if (search && !e.note.toLowerCase().includes(search) && !e.cat.toLowerCase().includes(search)) return false;
    return true;
  });

  const label = document.getElementById('txn-count-label');
  if (label) label.textContent = filtered.length + ' / ' + expenses.length + ' txns';

  if (!filtered.length) { list.innerHTML = '<div class="txn-empty">No transactions match your filter.</div>'; return; }

  list.innerHTML = filtered.slice(0,200).map((e,i) => {
    const color = catColor(e.cat);
    const acctBadge = e.account ? `<span class="txn-acct-badge">${escHtml(e.account)}</span>` : '';
    const catOpts = ALL_CATS.map(c => `<option value="${c}"${c===e.cat?' selected':''}>${c}</option>`).join('');
    return `<div class="txn-item" style="animation-delay:${Math.min(i*0.01,0.3)}s">
      <div class="txn-left">
        <div class="txn-dot" style="background:${color}"></div>
        <div class="txn-info">
          <div class="txn-cat">${escHtml(e.cat)} ${acctBadge}</div>
          <div class="txn-note">${escHtml(e.note)}</div>
          <div class="txn-meta">${escHtml(e.date||'')}</div>
        </div>
      </div>
      <div class="txn-right">
        <select class="txn-cat-select" onchange="overrideCategory('${e.id}',this.value)">${catOpts}</select>
        <div class="txn-amount">$${e.amount.toFixed(2)}</div>
      </div>
    </div>`;
  }).join('');
}

function overrideCategory(id, newCat) {
  const txn = expenses.find(e => String(e.id) === String(id));
  if (!txn) return;
  txn.cat = newCat;
  saveState();
  renderAll();
  renderAllTransactions();
}

// ── BUDGETS ───────────────────────────────────────────────────
function renderBudgets() {
  const list = document.getElementById('budget-list');
  if (!list) return;
  const catSel = document.getElementById('budget-cat-select');
  if (catSel) {
    catSel.innerHTML = '<option value="">Category...</option>' + ALL_CATS.map(c=>`<option value="${c}">${c}</option>`).join('');
  }
  const now = new Date();
  const monthLabel = document.getElementById('budget-month-label');
  if (monthLabel) monthLabel.textContent = now.toLocaleString('default',{month:'long',year:'numeric'});

  const monthSpend = {};
  expenses.forEach(e => {
    const d = new Date(e.date?.includes('/') ? e.date.split('/').reverse().join('-') : e.date||'');
    if (d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear()) {
      monthSpend[e.cat] = (monthSpend[e.cat]||0) + e.amount;
    }
  });

  if (!Object.keys(budgets).length) {
    list.innerHTML = '<div class="txn-empty">No budgets set. Add one below.</div>';
    renderMOMChart();
    return;
  }

  const html = Object.entries(budgets).map(([cat, limit]) => {
    const spent = monthSpend[cat]||0;
    const pct   = Math.min(Math.round(spent/limit*100), 100);
    const color = spent > limit ? 'var(--red)' : spent > limit*0.8 ? 'var(--amber)' : 'var(--green)';
    const statusCls = spent > limit ? 'budget-over' : spent > limit*0.8 ? 'budget-warn' : 'budget-ok';
    const statusTxt = spent > limit ? 'Over budget!' : spent > limit*0.8 ? 'Near limit' : 'On track';
    return `<div class="budget-item">
      <div class="budget-header">
        <div class="budget-cat" style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${catColor(cat)};display:inline-block"></span>${escHtml(cat)}</div>
        <div class="budget-amounts">$${spent.toFixed(0)} / $${limit.toFixed(0)}</div>
      </div>
      <div class="budget-bar-wrap"><div class="budget-bar" style="width:${pct}%;background:${color}"></div></div>
      <div class="budget-footer">
        <div class="budget-pct" style="color:${color}">${pct}%</div>
        <div class="budget-status ${statusCls}">${statusTxt}</div>
        <button class="btn-sm btn-sm-ghost" onclick="removeBudget('${cat}')" style="padding:3px 8px;font-size:11px">✕</button>
      </div>
    </div>`;
  }).join('');

  list.innerHTML = `<div class="budget-grid">${html}</div>`;
  renderMOMChart();
}

function addBudget() {
  const cat    = document.getElementById('budget-cat-select')?.value;
  const amount = parseFloat(document.getElementById('budget-amount-input')?.value);
  if (!cat)         return alert('Select a category.');
  if (!amount || amount < 1) return alert('Enter a valid budget amount.');
  budgets[cat] = amount;
  saveState(); renderBudgets();
}

function removeBudget(cat) {
  delete budgets[cat];
  saveState(); renderBudgets();
}

function renderMOMChart() {
  const canvas = document.getElementById('momChart');
  if (!canvas) return;
  if (momChart) { momChart.destroy(); momChart = null; }
  // Build last 6 months of data
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months.push({ label: d.toLocaleString('default',{month:'short'}), year: d.getFullYear(), month: d.getMonth() });
  }
  const data = months.map(m => {
    return expenses.filter(e => {
      const d = new Date(e.date?.includes('/') ? e.date.split('/').reverse().join('-') : e.date||'');
      return d.getMonth()===m.month && d.getFullYear()===m.year;
    }).reduce((s,e)=>s+e.amount,0);
  });
  momChart = new Chart(canvas, {
    type: 'bar',
    data: { labels: months.map(m=>m.label), datasets:[{data, backgroundColor:'rgba(232,32,32,0.15)', borderColor:'#e82020', borderWidth:1.5, borderRadius:6}] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true, ticks:{callback:v=>'$'+v, font:{size:10}}, grid:{color:'rgba(0,0,0,0.04)'}}, x:{ticks:{font:{size:11}},grid:{display:false}} } }
  });
}

// ── RECURRING DETECTION ───────────────────────────────────────
function detectRecurring() {
  if (!expenses.length) return [];
  // Group by similar note
  const groups = {};
  expenses.forEach(e => {
    const key = e.note.replace(/\s*\d+\s*/g,' ').trim().substring(0,30);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  const recurring = [];
  Object.entries(groups).forEach(([key, txns]) => {
    if (txns.length < 2) return;
    const amounts = txns.map(t=>t.amount);
    const mainAmount = amounts.sort((a,b)=>amounts.filter(v=>v===a).length-amounts.filter(v=>v===b).length).pop();
    const matching = txns.filter(t=>Math.abs(t.amount-mainAmount)<mainAmount*0.05);
    if (matching.length < 2) return;
    // Detect frequency
    const dates = matching.map(t => new Date(t.date?.includes('/')? t.date.split('/').reverse().join('-'):t.date||''));
    dates.sort((a,b)=>a-b);
    const gaps = [];
    for (let i=1;i<dates.length;i++) gaps.push((dates[i]-dates[i-1])/(1000*60*60*24));
    const avgGap = gaps.reduce((s,g)=>s+g,0)/gaps.length;
    let freq=''; let monthlyEst=0;
    if (avgGap <= 10) { freq='Weekly'; monthlyEst=mainAmount*4.33; }
    else if (avgGap <= 40) { freq='Monthly'; monthlyEst=mainAmount; }
    else if (avgGap <= 100) { freq='Quarterly'; monthlyEst=mainAmount/3; }
    else if (avgGap <= 380) { freq='Annual'; monthlyEst=mainAmount/12; }
    else return;

    // Detect price change
    const firstAmt = matching[0].amount;
    const lastAmt  = matching[matching.length-1].amount;
    const changed  = Math.abs(lastAmt-firstAmt) > firstAmt*0.03;
    // Detect cancelled (last seen > 2 months ago)
    const lastDate = dates[dates.length-1];
    const daysSinceLast = (new Date()-lastDate)/(1000*60*60*24);
    const cancelled = daysSinceLast > 60 && freq==='Monthly';

    recurring.push({ name: key, freq, amount: lastAmt, monthlyEst, changed, cancelled, count: matching.length });
  });
  return recurring.sort((a,b)=>b.monthlyEst-a.monthlyEst).slice(0,20);
}

function renderRecurring() {
  const list = document.getElementById('recurring-list');
  const totalEl = document.getElementById('rec-monthly-total');
  if (!list) return;
  const recs = detectRecurring();
  if (!recs.length) { list.innerHTML = '<div class="txn-empty">No recurring expenses detected. Import 2+ months of data to see patterns.</div>'; return; }
  const totalMonthly = recs.filter(r=>!r.cancelled).reduce((s,r)=>s+r.monthlyEst,0);
  if (totalEl) totalEl.textContent = '$'+totalMonthly.toFixed(2)+'/mo';
  const icons = {'Netflix':'📺','Spotify':'🎵','Disney':'🎬','Insurance':'🛡️','default':'🔁'};
  list.innerHTML = recs.map(r => {
    const icon = Object.entries(icons).find(([k])=>r.name.toLowerCase().includes(k.toLowerCase()))?.[1] || icons.default;
    const badge = r.cancelled ? '<span class="rec-badge" style="background:var(--gray-100);color:var(--gray-400)">Cancelled?</span>' :
                  r.changed   ? '<span class="rec-badge rec-changed">Price changed</span>' : '';
    return `<div class="rec-item${r.cancelled?' rec-cancelled':''}">
      <div class="rec-left">
        <div class="rec-icon">${icon}</div>
        <div>
          <div class="rec-name">${escHtml(r.name)}</div>
          <div class="rec-freq">${r.freq} · ${r.count}× detected ${badge}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div class="rec-amount">$${r.amount.toFixed(2)}</div>
        <div class="rec-monthly">$${r.monthlyEst.toFixed(2)}/mo</div>
      </div>
    </div>`;
  }).join('');
}

// ── ANALYTICS ────────────────────────────────────────────────
function renderAnalytics() {
  renderTrends();
  renderPieChart();
  renderPerceivedVsActual();
  renderTopCats();
}

function renderTrends() {
  const list = document.getElementById('trends-list');
  if (!list || !expenses.length) return;
  const now = new Date();
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.date?.includes('/')? e.date.split('/').reverse().join('-'):e.date||'');
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  });
  const prevMonth = expenses.filter(e => {
    const d = new Date(e.date?.includes('/')? e.date.split('/').reverse().join('-'):e.date||'');
    const prev = new Date(now.getFullYear(), now.getMonth()-1, 1);
    return d.getMonth()===prev.getMonth() && d.getFullYear()===prev.getFullYear();
  });
  if (!thisMonth.length && !prevMonth.length) { list.innerHTML = '<div class="txn-empty">Import 2 months of data for trends.</div>'; return; }
  const thisTotal = {}, prevTotal = {};
  thisMonth.forEach(e => { thisTotal[e.cat]=(thisTotal[e.cat]||0)+e.amount; });
  prevMonth.forEach(e => { prevTotal[e.cat]=(prevTotal[e.cat]||0)+e.amount; });
  const cats = [...new Set([...Object.keys(thisTotal),...Object.keys(prevTotal)])];
  list.innerHTML = cats.map(cat => {
    const curr = thisTotal[cat]||0; const prev = prevTotal[cat]||0;
    const diff  = curr - prev;
    const diffStr = diff > 0 ? `<span class="trend-up">↑ $${diff.toFixed(0)} more</span>` : diff < 0 ? `<span class="trend-down">↓ $${Math.abs(diff).toFixed(0)} less</span>` : '<span>—</span>';
    return `<div class="trend-row">
      <div class="trend-cat"><span style="width:8px;height:8px;border-radius:50%;background:${catColor(cat)};display:inline-block"></span>${escHtml(cat)}</div>
      <div class="trend-vals"><span>$${curr.toFixed(0)}</span>${diffStr}</div>
    </div>`;
  }).join('');
}

function renderPieChart() {
  const canvas = document.getElementById('pieChart');
  if (!canvas || !expenses.length) return;
  if (pieChart) { pieChart.destroy(); pieChart = null; }
  const totals = {};
  expenses.forEach(e => { totals[e.cat]=(totals[e.cat]||0)+e.amount; });
  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,8);
  pieChart = new Chart(canvas, {
    type:'doughnut',
    data:{ labels:sorted.map(([k])=>k), datasets:[{data:sorted.map(([,v])=>v), backgroundColor:sorted.map(([k])=>catColor(k)+'dd'), borderWidth:2, borderColor:'#fff'}] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ font:{size:11}, boxWidth:12 } } } }
  });
}

function renderPerceivedVsActual() {
  const form = document.getElementById('perceived-form');
  if (!form) return;
  const totals = {};
  expenses.forEach(e => { totals[e.cat]=(totals[e.cat]||0)+e.amount; });
  const top = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,6);
  form.innerHTML = top.map(([cat, actual]) => {
    const storedPerc = parseFloat(localStorage.getItem(`perc_${currentUser?.email}_${cat}`)||'0');
    const diff = storedPerc ? actual - storedPerc : null;
    const diffHtml = diff !== null ? `<div class="perceived-diff" style="color:${diff>0?'var(--red)':diff<0?'var(--green)':'var(--gray-600)'}">${diff>0?'+'+'$'+diff.toFixed(0):diff<0?'-$'+Math.abs(diff).toFixed(0):'='}</div>` : '<div class="perceived-diff" style="color:var(--gray-400)">—</div>';
    return `<div class="perceived-row">
      <div class="perceived-label" style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${catColor(cat)};display:inline-block"></span>${escHtml(cat)}</div>
      <input type="number" class="perceived-input" placeholder="Think..." value="${storedPerc||''}" onchange="savePerceived('${cat}',this.value)" style="width:90px;padding:5px 8px;font-size:12px">
      <div class="perceived-actual">$${actual.toFixed(0)}</div>
      ${diffHtml}
    </div>`;
  }).join('');
}

function savePerceived(cat, val) {
  localStorage.setItem(`perc_${currentUser?.email}_${cat}`, val);
  renderPerceivedVsActual();
}

function renderTopCats() {
  const list = document.getElementById('top-cats-list');
  if (!list) return;
  const totals = {};
  expenses.forEach(e => { totals[e.cat]=(totals[e.cat]||0)+e.amount; });
  const total = Object.values(totals).reduce((s,v)=>s+v,0);
  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if (!sorted.length) { list.innerHTML = '<div class="txn-empty">Import data first.</div>'; return; }
  list.innerHTML = sorted.map(([cat,amt],i) => {
    const pct = Math.round(amt/total*100);
    return `<div class="trend-row">
      <div class="trend-cat">${i+1}. <span style="width:8px;height:8px;border-radius:50%;background:${catColor(cat)};display:inline-block;margin-left:4px"></span>&nbsp;${escHtml(cat)}</div>
      <div class="trend-vals"><span style="font-weight:700">$${amt.toFixed(0)}</span><span style="color:var(--gray-400)">${pct}%</span></div>
    </div>`;
  }).join('');
}

// ── DATA VIEW ────────────────────────────────────────────────
function renderDataView() {
  const list = document.getElementById('accounts-list');
  if (!list) return;
  if (!accounts.length) { list.innerHTML = '<div class="txn-empty">No accounts.</div>'; return; }
  list.innerHTML = accounts.map(a => {
    const count = expenses.filter(e=>e.account===a).length;
    const total = expenses.filter(e=>e.account===a).reduce((s,e)=>s+e.amount,0);
    return `<div class="trend-row">
      <div class="trend-cat">${a==='Everyday'?'💳':a==='Savings'?'🏦':a==='Credit Card'?'💰':'🏛️'} ${escHtml(a)}</div>
      <div class="trend-vals"><span>${count} txns</span><span style="font-weight:700">$${total.toFixed(0)}</span></div>
    </div>`;
  }).join('');
}

function exportCSV() {
  const rows = ['Date,Account,Category,Note,Amount'];
  expenses.forEach(e => rows.push(`"${e.date||''}","${e.account||''}","${e.cat}","${e.note}",${e.amount.toFixed(2)}`));
  download('spendr-export.csv', rows.join('\n'), 'text/csv');
}

function exportJSON() {
  download('spendr-export.json', JSON.stringify({expenses, budgets, accounts}, null, 2), 'application/json');
}

function download(filename, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type}));
  a.download = filename; a.click();
}

function deleteAllData() {
  if (!confirm('This will permanently delete ALL your data. Are you absolutely sure?')) return;
  if (!confirm('Last chance — this cannot be undone!')) return;
  expenses = []; budgets = {}; currentTxns = []; chatHistory = [];
  saveState(); renderAll(); clearChat();
  alert('All data deleted.');
}

// ── AI CHAT ──────────────────────────────────────────────────
function buildContext(txns) {
  const totals = {};
  txns.forEach(t => { totals[t.cat]=(totals[t.cat]||0)+t.amount; });
  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  const grand  = txns.reduce((s,t)=>s+t.amount,0);
  let ctx = `Total: $${grand.toFixed(2)} | ${txns.length} transactions\n\nBy category:\n`;
  sorted.forEach(([cat,amt]) => { const pct=Math.round(amt/grand*100); ctx+=`  ${cat}: $${amt.toFixed(2)} (${pct}%)\n`; });
  ctx += '\nTop transactions:\n';
  txns.slice(0,20).forEach(t => { ctx += `  ${t.cat} | $${t.amount.toFixed(2)} | ${t.note}${t.account?' ['+t.account+']':''}\n`; });
  return ctx;
}

async function callAI(messages) {
  const sysPrompt = 'You are a friendly, practical personal finance assistant for an Australian user. Analyse bank transactions and give clear, actionable insights. Keep responses concise. Format dollar amounts as $X.XX. Avoid filler phrases.';
  const response = await fetch(API_BASE + '/ai-insights', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ newTransactions: currentTxns, historyTransactions: expenses.filter(e=>!e.fresh), chatHistory: messages })
  });
  const data = await response.json();
  if (!data.insights) throw new Error('No response from AI');
  return data.insights;
}

async function getInitialInsights(txns) {
  showTyping();
  const contextMsg = { role:'user', content:`Here is my spending data:\n\n${buildContext(txns)}\n\nPlease give a concise summary:\n1. Total and top categories\n2. Any patterns worth flagging\n3. One or two saving tips` };
  chatHistory = [contextMsg];
  try {
    const reply = await callAI(chatHistory);
    chatHistory.push({ role:'assistant', content:reply });
    removeTyping(); appendAIMessage(reply);
  } catch(e) {
    removeTyping(); appendAIMessage('⚠️ AI unavailable right now. You can still ask questions below.');
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value='';
  hideEmpty(); appendUserMessage(text);
  const userMsg = { role:'user', content: expenses.length ? `Context: ${buildContext(expenses.slice(0,30))}\n\nUser question: ${text}` : text };
  chatHistory.push(userMsg);
  showTyping();
  try {
    const reply = await callAI(chatHistory);
    chatHistory.push({ role:'assistant', content:reply });
    removeTyping(); appendAIMessage(reply);
  } catch(e) {
    removeTyping(); appendAIMessage('⚠️ Could not reach AI: ' + e.message);
  }
}

function hideEmpty() {
  const el = document.getElementById('chat-empty');
  if (el) el.style.display = 'none';
}

function clearChat() {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  msgs.innerHTML = `<div class="chat-empty" id="chat-empty"><img src="logo.png" alt="logo" class="chat-empty-logo" onerror="this.style.display='none'"><div class="chat-empty-title">Your AI finance assistant</div><p>Import your bank statement to get started.</p></div>`;
}

function appendUserMessage(text) {
  hideEmpty();
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className='msg user';
  div.innerHTML=`<div class="msg-avatar">you</div><div class="msg-bubble">${escHtml(text)}</div>`;
  msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight;
}

function appendAIMessage(text) {
  hideEmpty();
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className='msg ai';
  div.innerHTML=`<div class="msg-avatar">AI</div><div class="msg-bubble">${formatInsight(text)}</div>`;
  msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight;
}

function showTyping() {
  hideEmpty();
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className='msg ai'; div.id='typing-indicator';
  div.innerHTML=`<div class="msg-avatar">AI</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight;
}

function removeTyping() { document.getElementById('typing-indicator')?.remove(); }

function formatInsight(text) {
  let html = escHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  html = html.replace(/^#{1,3}\s+(.+)$/gm,'<h4>$1</h4>');
  html = html.replace(/^\d+\.\s+\*\*(.+?)\*\*/gm,'<h4>$1</h4>');
  const hasBullets = /^[-•]\s+/m.test(html);
  if (hasBullets) { html=html.replace(/^[-•]\s+(.+)$/gm,'<li>$1</li>'); html=html.replace(/(<li>.*<\/li>\n?)+/gs,m=>'<ul>'+m+'</ul>'); }
  html = html.replace(/\$[\d,]+(\.\d{1,2})?/g, m => { const v=parseFloat(m.replace(/[$,]/g,'')); return `<span class="insight-stat ${v>500?'':'good'}">${m}</span>`; });
  html = html.replace(/(\d+)%/g,'<span class="insight-chip">$1%</span>');
  html = html.split(/\n{2,}/).map(p=>{p=p.trim();if(!p)return'';if(p.startsWith('<h4>')||p.startsWith('<ul>')||p.startsWith('<li>'))return p;return'<p>'+p.replace(/\n/g,'<br>')+'</p>';}).join('');
  return html;
}

// ── STATUS ────────────────────────────────────────────────────
function setStatus(msg, type) {
  const el = document.getElementById('upload-status');
  if (!el) return;
  el.textContent = msg;
  el.className = type ? 'status-'+type : '';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
