// ─────────────────────────────────────────────
// Spendr - Universal CSV Expense Tracker
// ─────────────────────────────────────────────

const STORAGE_KEY = 'spendr_expenses';

// Keep all past transactions, but analyze new CSV only
let expenses = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

// ── INIT ─────────────────────────────────────
document.getElementById('btn-analyse').addEventListener('click', () => {
  const text = document.getElementById('csv-paste').value.trim();
  if (!text || text.length < 10) {
    setStatus('❌ Paste valid CSV data', 'error');
    return;
  }

  try {
    const rows = parseCSVUniversal(text);
    processTransactionsUniversal(rows);
  } catch (e) {
    console.error(e);
    setStatus('❌ Error: ' + e.message, 'error');
  }
});

// Clear all transactions
document.getElementById('btn-clear').addEventListener('click', () => {
  if(confirm('Are you sure you want to clear all transactions?')) {
    expenses = [];
    localStorage.removeItem(STORAGE_KEY);
    render();
    renderBars();
    document.getElementById('ai-summary').classList.add('hidden');
    setStatus('✅ All transactions cleared');
  }
});

// ─────────────────────────────────────────────
// UNIVERSAL CSV PARSER
// ─────────────────────────────────────────────
function parseCSVUniversal(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const firstRow = splitCSVLine(lines[0]);
  const hasHeader = firstRow.some(c =>
    c.toLowerCase().includes('date') ||
    c.toLowerCase().includes('description')
  );
  const dataStart = hasHeader ? 1 : 0;

  return lines.slice(dataStart).map(line => {
    const cols = splitCSVLine(line);

    let date = cols.find(c => /\d{2}\/\d{2}\/\d{4}/.test(c)) || '';
    const amounts = cols.filter(c => !isNaN(parseFloat(c)) && c.includes('.'));
    const amount = parseFloat(amounts[0]) || 0;
    const desc = cols.find(c => typeof c === 'string' && c.length > 10 && c.toLowerCase().includes('purchase')) || cols[2] || '';
    const type = cols.find(c => c && c.toLowerCase().includes('payment')) || '';

    return { date, desc, amount, type };
  });
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current=''; }
    else current += char;
  }
  result.push(current.trim());
  return result;
}

// ─────────────────────────────────────────────
// PROCESS TRANSACTIONS
// ─────────────────────────────────────────────
function processTransactionsUniversal(rows) {
  const now = new Date().toISOString();

  const newTxns = rows
    .filter(isExpense)
    .map(r => ({
      id: Date.now() + Math.random(),
      amount: Math.abs(r.amount),
      cat: categorize(cleanDesc(r.desc)),
      note: cleanDesc(r.desc),
      date: now
    }));

  // Add to history
  expenses = [...newTxns, ...expenses];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));

  render();
  renderBars();

  generateAIInsights(newTxns);

  setStatus(`✅ Added ${newTxns.length} transactions`);
}

// ── EXPENSE DETECTION
function isExpense(r) {
  const t = (r.type || '').toLowerCase();
  const d = (r.desc || '').toLowerCase();
  return r.amount < 0 || t.includes('debit') || t.includes('payment') || d.includes('purchase') || d.includes('debit');
}

// ── CATEGORY LOGIC
function categorize(desc) {
  const d = desc.toLowerCase();
  if (d.includes('transfer') || d.includes('osko') || d.includes('payid')) return 'Transfers';
  if (d.includes('electricity') || d.includes('water') || d.includes('energy') || d.includes('telstra') || d.includes('optus')) return 'Bills & utilities';
  if (d.includes('coles') || d.includes('woolworths') || d.includes('aldi')) return 'Groceries';
  if (d.includes('bunnings')) return 'Home';
  if (d.includes('uber') || d.includes('taxi') || d.includes('fuel')) return 'Transport';
  if (d.includes('cafe') || d.includes('restaurant') || d.includes('takeaway')) return 'Food & dining';
  return 'Shopping';
}

// ── CLEAN DESCRIPTION
function cleanDesc(desc) {
  return desc.toUpperCase()
    .replace(/EFT DEBIT/g, '')
    .replace(/\d{6,}/g, '')
    .replace(/\d{2}\/\d{2}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── EXTRACT MERCHANT
function extractMerchant(desc) {
  desc = cleanDesc(desc)
    .replace(/PAYMENT|TRANSFER|AUSTRALIA|AUS/g,'')
    .trim();
  const words = desc.split(' ').filter(w => w.length>2);
  return words.slice(0,3).join(' ');
}

// ── RENDER TRANSACTIONS
function render() {
  const list = document.getElementById('expense-list');
  if (!expenses.length) { list.innerHTML = '<div>No transactions yet</div>'; return; }

  list.innerHTML = expenses.map(e => `
    <div class="txn">
      <strong>${e.cat}</strong> - $${e.amount.toFixed(2)} <br/>
      <small>${e.note}</small>
    </div>
  `).join('');
}

// ── RENDER BAR CHART
let chartInstance;
function renderBars() {
  const ctx = document.getElementById('categoryChart').getContext('2d');
  const categoryMap = {};
  expenses.forEach(e => { categoryMap[e.cat]=(categoryMap[e.cat]||0)+e.amount; });

  const labels = Object.keys(categoryMap);
  const data = Object.values(categoryMap);

  if(chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Spend $', data, backgroundColor:'rgba(75,192,192,0.5)' }] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

// ── STATUS MESSAGE
function setStatus(msg) { document.getElementById('upload-status').innerText=msg; }

// ── AI INSIGHTS
async function generateAIInsights(newTxns) {
  const aiDiv = document.getElementById('ai-summary');
  aiDiv.textContent='Analyzing...';
  aiDiv.classList.remove('hidden');

  if (!newTxns || !newTxns.length) { aiDiv.textContent='No new transactions for AI analysis'; return; }

  try {
    const response = await fetch('http://localhost:3000/ai-insights', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ newTransactions: newTxns, historyTransactions: expenses })
    });
    const data = await response.json();
    aiDiv.textContent = data.insights || 'No insights';
  } catch(e) {
    aiDiv.textContent='❌ AI request failed';
    console.error(e);
  }
}

// ── INITIAL RENDER
render();
renderBars();