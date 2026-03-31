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

Keep your response concise and friendly. Do not show working or calculations — just write the final summary.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://spendr-app.onrender.com',
        'X-Title': 'Spendr Expense Tracker'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024  // increased so reasoning models don't run out before writing output
      })
    });

    const data = await response.json();
    console.log('OpenRouter response model:', data.model, '| finish_reason:', data.choices?.[0]?.finish_reason);

    if (data.error) {
      console.error('OpenRouter error:', data.error);
      return res.json({ insights: `⚠️ AI error: ${data.error.message}` });
    }

    const message = data.choices?.[0]?.message;

    // Some free models (e.g. reasoning models) put output in `reasoning` instead of `content`
    const insights =
      message?.content ||
      message?.reasoning ||
      message?.reasoning_details?.[0]?.text ||
      null;

    if (!insights) {
      console.error('No content in response:', JSON.stringify(data, null, 2));
      return res.json({ insights: '⚠️ The AI did not return a response. Try again in a moment.' });
    }

    res.json({ insights });
  } catch (err) {
    console.error('AI Insights error:', err);
    res.json({ insights: `⚠️ Server error: ${err.message}` });
  }
});

// ── SPA fallback — MUST be last
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
