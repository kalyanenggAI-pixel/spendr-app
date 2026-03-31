import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // For calling OpenRouter / AI API

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// AI Insights endpoint
app.post('/ai-insights', async (req, res) => {
  try {
    const { newTransactions, historyTransactions } = req.body;

    // Combine for AI advice
    const prompt = `
Analyze these transactions and give insights. 
New Transactions: ${JSON.stringify(newTransactions)}
Historical Transactions: ${JSON.stringify(historyTransactions)}
Provide:
1. Key patterns in new transactions.
2. Advice based on historical spend.
`;

    // Call OpenRouter / free LLM here
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistral-instruct-v0.1',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const insights = data.choices?.[0]?.message?.content || 'No insights generated';

    res.json({ insights });
  } catch (err) {
    console.error('AI Insights error:', err);
    res.json({ insights: '⚠️ Unable to fetch AI insights right now.' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));