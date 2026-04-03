// server.js — Spendr backend
import express    from 'express';
import cors       from 'cors';
import bodyParser from 'body-parser';
import path       from 'path';
import { fileURLToPath } from 'url';
import fetch      from 'node-fetch';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

// ── AI INSIGHTS ENDPOINT ─────────────────────────────────────
// Accepts:
//   newTransactions     — current batch
//   historyTransactions — previous batches
//   chatHistory         — [{role, content}] for conversational follow-ups

app.post('/ai-insights', async (req, res) => {
  try {
    const { newTransactions = [], historyTransactions = [], chatHistory = [] } = req.body;

    // Build the system prompt that describes the AI's role
    const systemPrompt =
      'You are a friendly, practical personal finance assistant for an Australian user. ' +
      'You analyse bank transactions and give clear, actionable insights. ' +
      'Keep responses concise and well-structured. Use short paragraphs. ' +
      'When mentioning dollar amounts, format them as $X.XX. ' +
      'Do not repeat yourself. Avoid filler phrases like "Great question!".';

    // Build context about the data (injected only on first message)
    let messages = [];

    if (chatHistory.length > 0) {
      // Follow-up conversation — use the existing history directly
      messages = chatHistory;
    } else {
      // First call — build context from transaction data
      const totals = {};
      newTransactions.forEach(t => {
        totals[t.cat] = (totals[t.cat] || 0) + t.amount;
      });

      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      const grandTotal = newTransactions.reduce((s, t) => s + t.amount, 0);

      let contextBlock = `Total spend: $${grandTotal.toFixed(2)}\nTransactions: ${newTransactions.length}\n\nBy category:\n`;
      sorted.forEach(([cat, amt]) => {
        const pct = Math.round(amt / grandTotal * 100);
        contextBlock += `  ${cat}: $${amt.toFixed(2)} (${pct}%)\n`;
      });

      contextBlock += '\nTop transactions:\n';
      newTransactions.slice(0, 20).forEach(t => {
        contextBlock += `  ${t.cat} | $${t.amount.toFixed(2)} | ${t.note}\n`;
      });

      if (historyTransactions.length > 0) {
        const histTotal = historyTransactions.reduce((s, t) => s + t.amount, 0);
        contextBlock += `\nPrevious spending total on record: $${histTotal.toFixed(2)} across ${historyTransactions.length} transactions.`;
      }

      messages = [{
        role:    'user',
        content: `Here is my spending data:\n\n${contextBlock}\n\nPlease give me a clear summary with:\n1. Total and top categories\n2. Any patterns or flagged items\n3. One or two practical saving tips\n\nKeep it concise and readable.`
      }];
    }

    // Call OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer':  'https://spendr-app.onrender.com',
        'X-Title':       'Spendr Expense Tracker',
      },
      body: JSON.stringify({
        model:    'openrouter/auto',   // auto picks best available free model
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 1024,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('OpenRouter error:', data.error);
      return res.json({ insights: `⚠️ AI error: ${data.error.message}` });
    }

    const message  = data.choices?.[0]?.message;
    const insights =
      message?.content ||
      message?.reasoning ||
      message?.reasoning_details?.[0]?.text ||
      null;

    if (!insights) {
      console.error('No content in OpenRouter response:', JSON.stringify(data, null, 2));
      return res.json({ insights: '⚠️ The AI did not return a response. Try again in a moment.' });
    }

    console.log(`[AI] model=${data.model} | finish=${data.choices?.[0]?.finish_reason} | chars=${insights.length}`);
    res.json({ insights });

  } catch (err) {
    console.error('AI Insights error:', err);
    res.json({ insights: `⚠️ Server error: ${err.message}` });
  }
});

// ── SPA FALLBACK ─────────────────────────────────────────────
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Spendr running on http://localhost:${PORT}`));
