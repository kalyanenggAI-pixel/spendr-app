// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // large CSV support

app.post('/ai-insights', async (req, res) => {
  const { newTransactions, historyTransactions } = req.body;
  if (!newTransactions || !newTransactions.length)
    return res.status(400).json({ error: 'No new transactions' });

  const newDataText = newTransactions
    .map(t => `${t.date} | ${t.cat} | $${t.amount.toFixed(2)} | ${t.note}`)
    .join("\n");

  const historyText = historyTransactions
    .map(t => `${t.date} | ${t.cat} | $${t.amount.toFixed(2)} | ${t.note}`)
    .join("\n");

  const prompt = `
You are a smart personal finance assistant.

Analyze the following transactions from the current CSV and provide actionable insights:

Current Transactions:
${newDataText}

Then provide advice based on historical spending patterns from all previous transactions:

Historical Transactions:
${historyText}

Format your response clearly: first current analysis, then historical advice.
`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:"POST",
      headers:{
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages:[{ role:"user", content: prompt }]
      })
    });

    const data = await response.json();
    if(!data.choices) return res.status(500).json({ error:"AI error" });
    res.json({ insights: data.choices[0].message.content });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error:"AI request failed" });
  }
});

app.listen(3000, () => console.log('✅ Server running on http://localhost:3000'));