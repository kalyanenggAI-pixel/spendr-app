// ─────────────────────────────────────────────────────────────
// Spendr — app.js
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY   = 'spendr_expenses';
const API_BASE      = 'https://spendr-app.onrender.com';

// ── STATE ────────────────────────────────────────────────────
let expenses      = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let categoryChart = null;
let chatHistory   = [];   // [{role:'user'|'assistant', content:'...'}]
let currentTxns   = [];   // most recently imported batch

// Category colours — consistent across chart + dots
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

function catColor(cat) {
  return CAT_COLORS[cat] || '#6b7280';
}

// ── ON LOAD ──────────────────────────────────────────────────
render();
renderChart();

// ── BUTTONS ──────────────────────────────────────────────────
document.getElementById('btn-analyse').addEventListener('click', async () => {
  const text = document.getElementById('csv-paste').value.trim();
  if (!text || text.length < 10) {
    setStatus('Paste your CSV data first.', 'error');
    return;
  }
  setStatus('Reading transactions...', 'info');
  try {
    const rows = parseCSV(text);
    if (!rows.length) { setStatus('No transactions found. Check your CSV.', 'error'); return; }
    await importTransactions(rows);
  } catch (e) {
    console.error(e);
    setStatus('Error: ' + e.message, 'error');
  }
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!expenses.length) return;
  if (!confirm('Clear all transactions?')) return;
  expenses = []; currentTxns = []; chatHistory = [];
  localStorage.removeItem(STORAGE_KEY);
  render(); renderChart();
  clearChat();
  setStatus('Cleared.', '');
});

document.getElementById('btn-send').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});

// ── CSV PARSER ───────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const first = splitLine(lines[0]);
  const hasHeader = first.some(c => /date|description|amount|balance|type/i.test(c));
  const dataLines = lines.slice(hasHeader ? 1 : 0);

  return dataLines.map(line => {
    const cols = splitLine(line);

    const dateIdx = cols.findIndex(c => /\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(c));
    const date    = dateIdx >= 0 ? cols[dateIdx] : '';

    let descIdx = -1, longest = 0;
    cols.forEach((c, i) => {
      if (i === dateIdx) return;
      if (/^\d[\d.,\-]*$/.test(c)) return;
      if (c.length > longest) { longest = c.length; descIdx = i; }
    });
    const desc = descIdx >= 0 ? cols[descIdx] : '';

    const nums = cols
      .map((c, i) => ({ i, v: parseFloat(c.replace(/,/g, '')) }))
      .filter(({ i, v }) => i !== dateIdx && !isNaN(v) && v > 0);
    nums.sort((a, b) => a.v - b.v);
    const amount = nums.length > 0 ? nums[0].v : 0;

    return { date, desc, amount };
  }).filter(r => r.amount > 0 && r.desc.trim());
}

function splitLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

// ── CATEGORISE ───────────────────────────────────────────────
function cleanDesc(desc) {
  return desc.toUpperCase()
    .replace(/DEBIT CARD PURCHASE|EFT DEBIT|PAYMENT BY AUTHORITY|CREDIT CARD PURCHASE/g, '')
    .replace(/\b[A-Z]{3}\b$/, '').replace(/\d{6,}/g, '').replace(/\d{2}\/\d{2}/g, '')
    .replace(/\s+/g, ' ').trim();
}

function categorise(desc) {
  const d = desc.toLowerCase();
  if (d.includes('transfer')||d.includes('osko')||d.includes('payid')||d.includes('bpay')) return 'Transfers';
  if (d.includes('aami')||d.includes('nrma')||d.includes('allianz')||d.includes('insurance')||d.includes('iselect')) return 'Insurance';
  if (d.includes('electricity')||d.includes('energy')||d.includes('agl')||d.includes('origin')||
      d.includes('water')||d.includes('telstra')||d.includes('optus')||d.includes('vodafone')||
      d.includes('boost')||d.includes('tpg')||d.includes('aussie broadband')||d.includes('internet')) return 'Bills & Utilities';
  if (d.includes('vicroads')||d.includes('service nsw')||d.includes('rego')||d.includes('registration')||
      d.includes('department of transport')) return 'Government & Rego';
  if (d.includes('coles')||d.includes('woolworths')||d.includes('aldi')||d.includes('iga')||
      d.includes('harris farm')||d.includes('costco')||d.includes('big fresh')) return 'Groceries';
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
      d.includes('burrito')||d.includes('kebab')||d.includes('fish & chips')) return 'Food & Dining';
  if (d.includes('netflix')||d.includes('spotify')||d.includes('disney')||d.includes('stan')||
      d.includes('binge')||d.includes('foxtel')||d.includes('apple')||d.includes('google play')||
      d.includes('youtube')||d.includes('amazon prime')||d.includes('cinema')||
      d.includes('event cinemas')||d.includes('hoyts')) return 'Entertainment';
  return 'Shopping';
}

// ── IMPORT TRANSACTIONS ──────────────────────────────────────
async function importTransactions(rows) {
  const now = new Date().toISOString();

  const newTxns = rows.map(r => ({
    id:     Date.now() + Math.random(),
    amount: r.amount,
    cat:    categorise(cleanDesc(r.desc)),
    note:   cleanDesc(r.desc),
    date:   r.date || now,
    fresh:  true,
  }));

  currentTxns = newTxns;
  expenses    = [...newTxns, ...expenses.map(e => ({ ...e, fresh: false }))];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));

  render();
  renderChart();
  setStatus('✓ ' + newTxns.length + ' transactions loaded', 'success');
  document.getElementById('csv-paste').value = '';

  // Kick off AI insights automatically
  await getInitialInsights(newTxns);
}

// ── AI: INITIAL INSIGHTS ──────────────────────────────────────
async function getInitialInsights(txns) {
  showTyping();

  // Build a system context string
  const context = buildContext(txns);

  const systemMsg = {
    role: 'user',
    content: 'Here is my spending data:\n\n' + context +
      '\n\nPlease give me a clear, readable summary with:\n' +
      '1. Total spend and top categories\n' +
      '2. Any patterns or items worth flagging\n' +
      '3. One or two practical money-saving tips\n\n' +
      'Format using short sections with clear headings. Be concise and friendly.'
  };

  chatHistory = [msgToOpenRouter(systemMsg)];

  try {
    const reply = await callAI(chatHistory);
    chatHistory.push({ role: 'assistant', content: reply });
    removeTyping();
    appendAIMessage(reply);
  } catch (e) {
    removeTyping();
    appendAIMessage('⚠️ Could not reach the AI right now. You can still ask questions below — just describe what you want to know.');
  }
}

// ── AI: FOLLOW-UP CHAT ────────────────────────────────────────
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  hideEmpty();
  appendUserMessage(text);

  // Add fresh context if we have data
  let userContent = text;
  if (currentTxns.length && chatHistory.length === 0) {
    userContent = 'My spending data:\n\n' + buildContext(currentTxns) + '\n\nQuestion: ' + text;
  }

  chatHistory.push({ role: 'user', content: userContent });
  showTyping();

  try {
    const reply = await callAI(chatHistory);
    chatHistory.push({ role: 'assistant', content: reply });
    removeTyping();
    appendAIMessage(reply);
  } catch (e) {
    removeTyping();
    appendAIMessage('⚠️ AI unavailable right now. Check your server is running.');
  }
}

// ── AI API CALL ───────────────────────────────────────────────
// Routes through your server.js backend at /ai-insights
async function callAI(history) {
  const res = await fetch(API_BASE + '/ai-insights', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      newTransactions:     currentTxns,
      historyTransactions: expenses.filter(e => !e.fresh),
      chatHistory:         history,
    }),
  });

  if (!res.ok) throw new Error('Server error ' + res.status);
  const data = await res.json();
  return data.insights || 'No response from AI.';
}

function msgToOpenRouter(msg) {
  return { role: msg.role, content: msg.content };
}

// ── CONTEXT BUILDER ───────────────────────────────────────────
function buildContext(txns) {
  const totals = {};
  txns.forEach(t => { totals[t.cat] = (totals[t.cat] || 0) + t.amount; });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total  = txns.reduce((s, t) => s + t.amount, 0);

  let ctx = 'Total spend: $' + total.toFixed(2) + '\n';
  ctx += 'Transactions: ' + txns.length + '\n\n';
  ctx += 'By category:\n';
  sorted.forEach(([cat, amt]) => {
    ctx += '  ' + cat + ': $' + amt.toFixed(2) + ' (' + Math.round(amt / total * 100) + '%)\n';
  });
  ctx += '\nTop transactions:\n';
  txns.slice(0, 15).forEach(t => {
    ctx += '  ' + t.cat + ' | $' + t.amount.toFixed(2) + ' | ' + t.note + '\n';
  });
  return ctx;
}

// ── CHAT UI HELPERS ───────────────────────────────────────────
function hideEmpty() {
  const el = document.getElementById('chat-empty');
  if (el) el.style.display = 'none';
}

function clearChat() {
  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = `
    <div class="chat-empty" id="chat-empty">
      <div class="chat-empty-icon">✦</div>
      <div class="chat-empty-title">Your AI finance assistant</div>
      <p>Paste your bank statement and I'll analyse your spending, spot patterns, and answer any questions.</p>
    </div>`;
  chatHistory = [];
}

function appendUserMessage(text) {
  hideEmpty();
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `
    <div class="msg-avatar">you</div>
    <div class="msg-bubble">${escHtml(text)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendAIMessage(text) {
  hideEmpty();
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className = 'msg ai';
  div.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-bubble">${formatInsight(text)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  hideEmpty();
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className = 'msg ai'; div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// ── FORMAT AI RESPONSE ────────────────────────────────────────
// Converts markdown-ish text to styled HTML
function formatInsight(text) {
  let html = escHtml(text);

  // **bold** → strong
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // ## Heading or numbered section like "1. Heading"
  html = html.replace(/^#{1,3}\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^\d+\.\s+\*\*(.+?)\*\*/gm, '<h4>$1</h4>');
  html = html.replace(/^\d+\.\s+([A-Z][^a-z\n]{0,30})\n/gm, '<h4>$1</h4>\n');

  // - bullet → list
  const hasBullets = /^[-•]\s+/m.test(html);
  if (hasBullets) {
    html = html.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/gs, match => '<ul>' + match + '</ul>');
  }

  // Dollar amounts → styled badge
  html = html.replace(/\$[\d,]+(\.\d{1,2})?/g, match => {
    const val = parseFloat(match.replace(/[$,]/g, ''));
    const cls = val > 500 ? 'warn' : 'good';
    return '<span class="insight-stat ' + cls + '">' + match + '</span>';
  });

  // Percentages
  html = html.replace(/(\d+)%/g, '<span class="insight-stat">$1%</span>');

  // Line breaks → paragraphs
  html = html.split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h4>')||p.startsWith('<ul>')||p.startsWith('<li>')) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  return html;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── RENDER TRANSACTIONS ───────────────────────────────────────
function render() {
  const fresh = expenses.filter(e => e.fresh !== false);
  const list  = document.getElementById('expense-list');

  // Update totals
  const now = new Date();
  const monthTotal = expenses.filter(e => {
    if (!e.date) return false;
    const d = new Date(e.date.includes('/') ? e.date.split('/').reverse().join('-') : e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, e) => s + e.amount, 0);

  document.getElementById('total-month').textContent = '$' + monthTotal.toFixed(2);
  document.getElementById('total-all').textContent   = '$' + expenses.reduce((s,e)=>s+e.amount,0).toFixed(2);
  document.getElementById('total-count').textContent = expenses.length;

  const display = expenses.slice(0, 80);
  if (!display.length) {
    list.innerHTML = '<div class="txn-empty">No transactions yet</div>';
    return;
  }

  list.innerHTML = display.map((e, i) => {
    const color = catColor(e.cat);
    return `<div class="txn-item" style="animation-delay:${Math.min(i*0.02,0.4)}s">
      <div class="txn-left">
        <div class="txn-dot" style="background:${color}"></div>
        <div class="txn-info">
          <div class="txn-cat">${escHtml(e.cat)}</div>
          <div class="txn-note">${escHtml(e.note || '')}</div>
        </div>
      </div>
      <div class="txn-amount">$${e.amount.toFixed(2)}</div>
    </div>`;
  }).join('');
}

// ── RENDER CHART ──────────────────────────────────────────────
function renderChart() {
  const canvas = document.getElementById('categoryChart');
  if (!canvas) return;

  const current = expenses.filter(e => e.fresh !== false);
  if (categoryChart) { categoryChart.destroy(); categoryChart = null; }

  const totals = {};
  current.forEach(e => { totals[e.cat] = (totals[e.cat] || 0) + e.amount; });

  const sorted = Object.entries(totals)
    .filter(([,v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!sorted.length) return;

  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => v);
  const colors = labels.map(l => catColor(l));
  const total  = values.reduce((s, v) => s + v, 0);

  categoryChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor:     colors,
        borderWidth:     1,
        borderRadius:    6,
        borderSkipped:   false,
      }]
    },
    options: {
      indexAxis:           'y',
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = Math.round(ctx.parsed.x / total * 100);
              return '  $' + ctx.parsed.x.toFixed(2) + '  (' + pct + '%)';
            }
          },
          backgroundColor: '#1a1a24',
          borderColor:     'rgba(255,255,255,0.1)',
          borderWidth:     1,
          titleColor:      '#e8e8f0',
          bodyColor:       '#a0a0b0',
          padding:         10,
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color:    '#6b6b80',
            callback: v => '$' + v,
            font:     { family: "'JetBrains Mono', monospace", size: 10 }
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          ticks: {
            color: '#a0a0b0',
            font:  { family: "'Syne', sans-serif", size: 11, weight: '500' }
          },
          grid: { display: false },
        }
      },
      animation: { duration: 500, easing: 'easeOutQuart' },
    }
  });

  // Set chart height based on number of bars
  canvas.parentElement.style.height = Math.max(180, sorted.length * 42 + 40) + 'px';
}

// ── STATUS ────────────────────────────────────────────────────
function setStatus(msg, type) {
  const el = document.getElementById('upload-status');
  el.textContent = msg;
  el.className = type ? 'status-' + type : '';
}
