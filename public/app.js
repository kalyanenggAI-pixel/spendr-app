// ─────────────────────────────────────────────
// Spendr - Universal CSV Expense Tracker
// ─────────────────────────────────────────────

const STORAGE_KEY = 'spendr_expenses';
let expenses = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let categoryChart = null; // Chart.js instance

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
  const hasHeader = firstRow.some(c => c.toLowerCase().includes('date') || c.toLowerCase().includes('description'));
  const dataStart = hasHeader ? 1 : 0;

  return lines.slice(dataStart).map(line => {
    const cols = splitCSVLine(line);

    const date = cols.find(c => /\d{2}\/\d{2}\/\d{4}/.test(c)) || '';
    const desc = cols[2] || '';

    let amount = 0;
    for (let i = 3; i < cols.length; i++) {
      const n = parseFloat(cols[i].replace(',', '.'));
      if (!isNaN(n)) { amount = n; break; }
    }

    const type = cols.find(c => c && c.toLowerCase().includes('payment')) || '';
    return { date, desc, amount, type, old: false };
  });
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

// ── EXPENSE DETECTION
function isExpense(r) { return r.amount > 0; }

// ── CLEAN DESCRIPTION
function cleanDesc(desc) {
  return desc
    .toUpperCase()
    .replace(/EFT DEBIT|DEBIT CARD PURCHASE|PAYMENT BY AUTHORITY|PAYMENT/g, '')
    .replace(/\d{6,}/g, '')
    .replace(/\d{2}\/\d{2}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── CATEGORY LOGIC
function categorize(desc) {
  const d = desc.toLowerCase();
  if (d.includes('transfer') || d.includes('osko') || d.includes('payid')) return 'Transfers';
  if (d.includes('electricity') || d.includes('water') || d.includes('energy') || d.includes('telstra') || d.includes('optus')) return 'Bills & Utilities';
  if (d.includes('coles') || d.includes('woolworths') || d.includes('aldi')) return 'Groceries';
  if (d.includes('bunnings')) return 'Home';
  if (d.includes('uber') || d.includes('taxi') || d.includes('fuel')) return 'Transport';
  if (d.includes('cafe') || d.includes('restaurant') || d.includes('takeaway')) return 'Food & Dining';
  return 'Shopping';
}

// ── PROCESS TRANSACTIONS
async function processTransactionsUniversal(rows) {
  const now = new Date().toISOString();

  const newTxns = rows
    .filter(r => isExpense(r))
    .map(r => {
      const cleaned = cleanDesc(r.desc);
      return {
        id: Date.now() + Math.random(),
        amount: r.amount,
        cat: categorize(cleaned),
        note: cleaned,
        date: now,
        old: false
      };
    });

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
    return data.insights;
  } catch {
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

// ── CATEGORY CHART (Chart.js) — uses canvas id="categoryChart"
function renderChart() {
  const canvas = document.getElementById('categoryChart');
  if (!canvas) return;

  const categoryMap = {};
  expenses.filter(e => !e.old).forEach(e => {
    categoryMap[e.cat] = (categoryMap[e.cat] || 0) + e.amount;
  });

  const labels = Object.keys(categoryMap);
  const values = Object.values(categoryMap);

  // Destroy old chart instance before creating a new one
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
          '#4caf50','#2196f3','#ff9800','#e91e63','#9c27b0','#00bcd4','#ff5722'
        ],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `$${ctx.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => `$${v}` }
        }
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
