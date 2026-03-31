// ─────────────────────────────────────────────
// Spendr - Universal CSV Expense Tracker
// ─────────────────────────────────────────────

const STORAGE_KEY = 'spendr_expenses';
let expenses = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let categoryChart = null;

// ── INIT
document.getElementById('btn-analyse').addEventListener('click', async () => {
  const text = document.getElementById('csv-paste').value.trim();
  if (!text || text.length < 10) {
    setStatus('❌ Paste valid CSV data', 'error');
    return;
  }
  try {
    const rows = parseCSVUniversal(text);
    await processTransactionsUniversal(rows);
  } catch (e) {
    console.error(e);
    setStatus('❌ Error: ' + e.message, 'error');
  }
});

document.getElementById('btn-clear').addEventListener('click', () => {
  expenses = [];
  localStorage.removeItem(STORAGE_KEY);
  render();
  renderChart();
  document.getElementById('ai-summary').style.display = 'none';
  setStatus('🗑️ All transactions cleared', '');
});

// ── UNIVERSAL CSV PARSER
function parseCSVUniversal(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const firstRow = splitCSVLine(lines[0]);

  const hasHeader = firstRow.some(c =>
    /date|description|amount|balance|type/i.test(c)
  );
  const dataStart = hasHeader ? 1 : 0;

  return lines.slice(dataStart).map(line => {
    const cols = splitCSVLine(line);

    // Date: find col matching dd/mm/yyyy or yyyy-mm-dd
    const dateIdx = cols.findIndex(c => /\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(c));
    const date = dateIdx >= 0 ? cols[dateIdx] : '';

    // Description: longest text-heavy column (not date, not pure number)
    let descIdx = -1;
    let longestLen = 0;
    cols.forEach((c, i) => {
      if (i === dateIdx) return;
      if (/^\d[\d.,]*$/.test(c)) return;
      if (c.length > longestLen) { longestLen = c.length; descIdx = i; }
    });
    const desc = descIdx >= 0 ? cols[descIdx] : '';

    // Amount: smallest positive number (balance is usually the larger number)
    const numericCols = cols
      .map((c, i) => ({ i, v: parseFloat(c.replace(/,/g, '')) }))
      .filter(({ i, v }) => i !== dateIdx && !isNaN(v) && v > 0);
    numericCols.sort((a, b) => a.v - b.v);
    const amount = numericCols.length > 0 ? numericCols[0].v : 0;

    return { date, desc, amount, old: false };
  }).filter(r => r.amount > 0 && r.desc);
}

// ── CSV LINE SPLITTING
function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += char;
  }
  result.push(current.trim());
  return result;
}

// ── CLEAN DESCRIPTION
function cleanDesc(desc) {
  return desc
    .toUpperCase()
    .replace(/DEBIT CARD PURCHASE|EFT DEBIT|PAYMENT BY AUTHORITY|CREDIT CARD PURCHASE/g, '')
    .replace(/\b[A-Z]{3}\b$/g, '')   // trailing country codes like AUS
    .replace(/\d{6,}/g, '')
    .replace(/\d{2}\/\d{2}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── CATEGORY LOGIC
function categorize(desc) {
  const d = desc.toLowerCase();

  if (d.includes('transfer') || d.includes('osko') || d.includes('payid') || d.includes('bpay')) return 'Transfers';

  if (d.includes('aami') || d.includes('nrma') || d.includes('allianz') || d.includes('insurance') || d.includes('iselect')) return 'Insurance';

  if (d.includes('electricity') || d.includes('energy') || d.includes('agl') ||
      d.includes('origin') || d.includes('water') || d.includes('telstra') ||
      d.includes('optus') || d.includes('vodafone') || d.includes('boost') ||
      d.includes('prepaid') || d.includes('recharge') || d.includes('tpg') ||
      d.includes('aussie broadband') || d.includes('internet')) return 'Bills & Utilities';

  if (d.includes('department of transport') || d.includes('vicroads') || d.includes('service nsw') ||
      d.includes('rego') || d.includes('registration')) return 'Government & Rego';

  if (d.includes('coles') || d.includes('woolworths') || d.includes('aldi') ||
      d.includes('iga') || d.includes('harris farm') || d.includes('costco') ||
      d.includes('fresh produce') || d.includes('big fresh') || d.includes('big daddy')) return 'Groceries';

  if (d.includes('chemist') || d.includes('pharmacy') || d.includes('priceline') ||
      d.includes('amcal') || d.includes('terry white') || d.includes('medical') ||
      d.includes('doctor') || d.includes('dental') || d.includes('hospital') ||
      d.includes('pathology') || d.includes('health')) return 'Health & Pharmacy';

  if (d.includes('bunnings') || d.includes('ikea') || d.includes('harvey norman') ||
      d.includes('the good guys') || d.includes('jb hi') || d.includes('hardware')) return 'Home & Hardware';

  if (d.includes('uber') || d.includes('taxi') || d.includes('didi') || d.includes('ola') ||
      d.includes('fuel') || d.includes('7-eleven') || d.includes('bp ') || d.includes('shell') ||
      d.includes('ampol') || d.includes('caltex') || d.includes('puma energy') ||
      d.includes('metro trains') || d.includes('myki') || d.includes('transurban') ||
      d.includes('citylink') || d.includes('eastlink') || d.includes('linkt')) return 'Transport & Fuel';

  if (d.includes('cafe') || d.includes('restaurant') || d.includes('takeaway') ||
      d.includes('mcdonald') || d.includes('kfc') || d.includes('hungry jacks') ||
      d.includes('domino') || d.includes('pizza') || d.includes('subway') ||
      d.includes('grill') || d.includes('bakery') || d.includes('sushi') ||
      d.includes('thai') || d.includes('indian') || d.includes('chinese') ||
      d.includes('noodle') || d.includes('eatery') || d.includes('diner') ||
      d.includes('burrito') || d.includes('kebab') || d.includes('fish & chips')) return 'Food & Dining';

  if (d.includes('netflix') || d.includes('spotify') || d.includes('disney') ||
      d.includes('stan') || d.includes('binge') || d.includes('foxtel') ||
      d.includes('apple') || d.includes('google play') || d.includes('youtube') ||
      d.includes('amazon prime') || d.includes('cinema') || d.includes('event cinemas') ||
      d.includes('hoyts')) return 'Entertainment';

  return 'Shopping';
}

// ── PROCESS TRANSACTIONS
async function processTransactionsUniversal(rows) {
  const now = new Date().toISOString();

  const newTxns = rows.map(r => {
    const cleaned = cleanDesc(r.desc);
    return {
      id: Date.now() + Math.random(),
      amount: r.amount,
      cat: categorize(cleaned),
      note: cleaned,
      date: r.date || now,
      old: false
    };
  });

  if (newTxns.length === 0) {
    setStatus('⚠️ No valid expense rows found in CSV', 'error');
    return;
  }

  expenses = expenses.map(e => ({ ...e, old: true }));
  expenses = [...newTxns, ...expenses];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));

  render();
  renderChart();

  setStatus(`✅ Added ${newTxns.length} transactions — fetching AI insights...`, 'success');

  const insights = await fetchInsights(newTxns, expenses.filter(e => e.old));
  const summaryEl = document.getElementById('ai-summary');
  summaryEl.textContent = insights;
  summaryEl.style.display = 'block';

  setStatus(`✅ Added ${newTxns.length} transactions`, 'success');
}

// ── FETCH AI INSIGHTS
async function fetchInsights(newTxns, historyTxns) {
  try {
    const res = await fetch('https://spendr-app.onrender.com/ai-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newTransactions: newTxns, historyTransactions: historyTxns })
    });
    const data = await res.json();
    return data.insights || '⚠️ No insights returned.';
  } catch (err) {
    console.error('AI fetch error:', err);
    return '⚠️ Unable to fetch AI insights right now.';
  }
}

// ── UI RENDERING
function render() {
  const list = document.getElementById('expense-list');
  const current = expenses.filter(e => !e.old);
  if (!current.length) { list.innerHTML = '<div>No transactions yet</div>'; return; }

  list.innerHTML = current.map(e => `
    <div class="txn">
      <strong>${e.cat}</strong> — $${e.amount.toFixed(2)}<br/>
      <small>${e.note}</small>
    </div>
  `).join('');
}

// ── CATEGORY CHART (Chart.js)
function renderChart() {
  const canvas = document.getElementById('categoryChart');
  if (!canvas) return;

  const categoryMap = {};
  expenses.filter(e => !e.old).forEach(e => {
    categoryMap[e.cat] = (categoryMap[e.cat] || 0) + e.amount;
  });

  const labels = Object.keys(categoryMap);
  const values = Object.values(categoryMap);

  if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
  if (!labels.length) return;

  categoryChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spend ($)',
        data: values,
        backgroundColor: [
          '#4caf50','#2196f3','#ff9800','#e91e63',
          '#9c27b0','#00bcd4','#ff5722','#607d8b','#795548'
        ],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `$${ctx.parsed.y.toFixed(2)}` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => `$${v}` } }
      }
    }
  });
}

// ── STATUS MESSAGE
function setStatus(msg, type = '') {
  const el = document.getElementById('upload-status');
  el.innerText = msg;
  el.className = type;
}

// ── INITIAL RENDER
render();
renderChart();
