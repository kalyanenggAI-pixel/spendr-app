// server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

// ── AI Insights endpoint — MUST be before the SPA catch-all
app.post('/ai-insights', async (req, res) => {
  try {
    const { newTransactions, historyTransactions } = req.body;

    const prompt = `You are a personal finance assistant. Analyse these Australian bank transactions and give practical insights.

New Transactions:
${JSON.stringify(newTransactions, null, 2)}

Historical Transactions (previous uploads):
${JSON.stringify(historyTransactions?.slice(0, 50), null, 2)}

Please provide:
1. A brief summary of this week's spending by category.
2. Any patterns or notable items worth flagging.
3. One or two practical tips to reduce spend based on what you see.

Keep your response concise and friendly.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://spendr-app.onrender.com',
        'X-Title': 'Spendr Expense Tracker'
      },
      body: JSON.stringify({
        // use a reliable free model on OpenRouter
        model: 'openrouter/free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      })
    });

    const data = await response.json();

    // Surface OpenRouter errors clearly in logs
    if (data.error) {
      console.error('OpenRouter error:', data.error);
      return res.json({ insights: `⚠️ AI error: ${data.error.message}` });
    }

    const insights = data.choices?.[0]?.message?.content || 'No insights generated.';
    res.json({ insights });
  } catch (err) {
    console.error('AI Insights error:', err);
    res.json({ insights: '⚠️ Unable to fetch AI insights right now.' });
  }
});

// ── SPA fallback — MUST be last
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
