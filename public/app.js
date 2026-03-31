const STORAGE_KEY = 'spendr_expenses';
let expenses = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

document.getElementById('btn-analyse').addEventListener('click', async () => {
  const text = document.getElementById('csv-paste').value.trim();
  if (!text || text.length < 10) { setStatus('❌ Paste valid CSV data'); return; }

  try {
    const rows = parseCSVUniversal(text);
    await processTransactionsUniversal(rows);
  } catch (e) {
    console.error(e);
    setStatus('❌ Error: ' + e.message);
  }
});

// ── CSV Parser ─────────────────────────
function parseCSVUniversal(text) {
  const lines = text.split('\n').filter(l => l.trim());
  let dataStart = 0;
  return lines.slice(dataStart).map(line => {
    const cols = splitCSVLine(line);
    const date = cols.find(c => /\d{2}\/\d{2}\/\d{4}/.test(c)) || '';
    const amounts = cols.filter(c => !isNaN(parseFloat(c)) && c.includes('.'));
    const amount = parseFloat(amounts[0]) || 0;
    const desc = cols.find(c => typeof c==='string' && c.length>5) || cols[0] || '';
    const type = cols.find(c => c && c.toLowerCase().includes('payment')) || '';
    return { date, desc, amount, type };
  });
}

function splitCSVLine(line) {
  const result=[]; let cur=''; let inQuotes=false;
  for(let c of line){
    if(c=='"') inQuotes=!inQuotes;
    else if(c==',' && !inQuotes){ result.push(cur.trim()); cur=''; }
    else cur+=c;
  }
  result.push(cur.trim());
  return result;
}

function cleanDesc(desc){ return desc.toUpperCase().replace(/EFT DEBIT/g,'').replace(/\d{6,}/g,'').replace(/\d{2}\/\d{2}/g,'').replace(/\s+/g,' ').trim(); }

function isExpense(r){ return r.amount<0 || (r.type||'').toLowerCase().includes('debit') || (r.desc||'').toLowerCase().includes('purchase'); }

function extractMerchant(desc){ const words=cleanDesc(desc).split(' ').filter(w=>w.length>2); return words.slice(0,3).join(' '); }

function categorize(desc){
  const d=desc.toLowerCase();
  if(d.includes('transfer')||d.includes('osko')||d.includes('payid')) return 'Transfers';
  if(d.includes('electricity')||d.includes('water')||d.includes('energy')||d.includes('telstra')||d.includes('optus')) return 'Bills & utilities';
  if(d.includes('coles')||d.includes('woolworths')||d.includes('aldi')) return 'Groceries';
  if(d.includes('bunnings')) return 'Home';
  if(d.includes('uber')||d.includes('taxi')||d.includes('fuel')) return 'Transport';
  if(d.includes('cafe')||d.includes('restaurant')||d.includes('takeaway')) return 'Food & dining';
  return 'Shopping';
}

function setStatus(msg){ document.getElementById('upload-status').innerText=msg; }

// ── PROCESS TRANSACTIONS ─────────────────────────
async function processTransactionsUniversal(rows){
  const now = new Date().toISOString();
  const newTxns = rows.filter(isExpense).map(r=>({
    id: Date.now()+Math.random(),
    amount: Math.abs(r.amount),
    cat: categorize(cleanDesc(r.desc)),
    note: cleanDesc(r.desc),
    date: now
  }));

  // Save all expenses
  expenses = [...newTxns, ...expenses];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));

  render(); 
  setStatus(`✅ Added ${newTxns.length} transactions`);

  // Fetch AI Insights
  const historyTxns = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const insights = await fetchInsights(newTxns, historyTxns);
  const aiDiv = document.getElementById('ai-summary');
  aiDiv.textContent = insights;
  aiDiv.style.display='block';
}

// ── FETCH AI INSIGHTS ─────────────────────────
async function fetchInsights(newTxns, historyTxns){
  try{
    const res = await fetch('/ai-insights', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ newTransactions:newTxns, historyTransactions:historyTxns })
    });
    const data = await res.json();
    return data.insights;
  } catch(e){
    console.error(e);
    return '⚠️ Unable to fetch AI insights';
  }
}

// ── RENDER ─────────────────────────
function render(){
  const list=document.getElementById('expense-list');
  if(!expenses.length){ list.innerHTML='<div>No transactions yet</div>'; return; }
  list.innerHTML=expenses.map(e=>`
    <div class="txn"><strong>${e.cat}</strong> - $${e.amount.toFixed(2)} <br/><small>${e.note}</small></div>
  `).join('');
}

render();