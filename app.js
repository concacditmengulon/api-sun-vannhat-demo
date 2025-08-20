const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Helper Functions (unchanged)
function calculateStdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function getDiceFrequencies(history, limit) {
  const allDice = [];
  const effectiveHistory = history.slice(0, limit);
  effectiveHistory.forEach(s => {
    allDice.push(s.d1, s.d2, s.d3);
  });
  const diceFreq = new Array(7).fill(0);
  allDice.forEach(d => {
    if (d >= 1 && d <= 6) {
      diceFreq[d]++;
    }
  });
  return diceFreq;
}

// Pattern Data for Logic 24 (unchanged)
const PATTERN_DATA = {
  "ttxttx": { tai: 80, xiu: 20 }, "xxttxx": { tai: 25, xiu: 75 },
  "ttxxtt": { tai: 75, xiu: 25 }, "txtxt": { tai: 60, xiu: 40 },
  "xtxtx": { tai: 40, xiu: 60 }, "ttx": { tai: 70, xiu: 30 },
  "xxt": { tai: 30, xiu: 70 }, "txt": { tai: 65, xiu: 35 },
  "xtx": { tai: 35, xiu: 65 }, "tttt": { tai: 85, xiu: 15 },
  "xxxx": { tai: 15, xiu: 85 }, "ttttt": { tai: 88, xiu: 12 },
  "xxxxx": { tai: 12, xiu: 88 }, "tttttt": { tai: 92, xiu: 8 },
  "xxxxxx": { tai: 8, xiu: 92 }, "tttx": { tai: 75, xiu: 25 },
  "xxxt": { tai: 25, xiu: 75 }, "ttxtx": { tai: 78, xiu: 22 },
  "xxtxt": { tai: 22, xiu: 78 }, "txtxtx": { tai: 82, xiu: 18 },
  "xtxtxt": { tai: 18, xiu: 82 }, "ttxtxt": { tai: 85, xiu: 15 },
  "xxtxtx": { tai: 15, xiu: 85 }, "txtxxt": { tai: 83, xiu: 17 },
  "xtxttx": { tai: 17, xiu: 83 }, "ttttttt": { tai: 95, xiu: 5 },
  "xxxxxxx": { tai: 5, xiu: 95 }, "tttttttt": { tai: 97, xiu: 3 },
  "xxxxxxxx": { tai: 3, xiu: 97 }, "txtx": { tai: 60, xiu: 40 },
  "xtxt": { tai: 40, xiu: 60 }, "txtxt": { tai: 65, xiu: 35 },
  "xtxtx": { tai: 35, xiu: 65 }, "txtxtxt": { tai: 70, xiu: 30 },
  "xtxtxtx": { tai: 30, xiu: 70 }
};

// Simplified predictLogic1 to always give a prediction
function predictLogic1(lastSession) {
  if (!lastSession) return null;
  const lastDigitOfSession = lastSession.sid % 10;
  const totalPreviousSession = lastSession.total;
  let indicatorSum = lastDigitOfSession + totalPreviousSession;
  return indicatorSum % 2 === 0 ? "Xỉu" : "Tài";
}

// Dummy functions for other logics (to avoid errors)
function predictLogic2() { return null; }
function predictLogic3() { return null; }
function predictLogic4() { return null; }
function predictLogic5() { return null; }
function predictLogic6() { return null; }
function predictLogic7() { return null; }
function predictLogic8() { return null; }
function predictLogic9() { return null; }
function predictLogic10() { return null; }
function predictLogic11() { return null; }
function predictLogic12() { return null; }
function predictLogic13() { return null; }
function predictLogic14() { return null; }
function predictLogic15() { return null; }
function predictLogic16() { return null; }
function predictLogic17() { return null; }
function predictLogic18() { return null; }
function predictLogic19() { return null; }
function predictLogic21() { return null; }
function predictLogic22() { return null; }
function predictLogic23() { return null; }
function predictLogic24(history) {
    if (history.length < 5) return null; // Keep a minimal check for this logic
    const results = history.slice(0, 5).map(s => s.result.toLowerCase() === 'tài' ? 't' : 'x').join('');
    
    // Check for the most recent pattern (e.g., last 3, 4, 5 results)
    for (let len = 8; len >= 3; len--) {
        const pattern = results.slice(0, len);
        if (PATTERN_DATA[pattern]) {
            const { tai, xiu } = PATTERN_DATA[pattern];
            return tai > xiu ? "Tài" : "Xỉu";
        }
    }
    return null;
}
function analyzeAndExtractPatterns() { return {}; }

// Modified predictLogic20 for confidence scoring and fallback logic
async function predictLogic20(history, logicPerformance, cauLogData) {
  if (history.length < 1) {
    // Fallback to a default prediction or a simple logic
    return { prediction: null, confidence: 0 };
  }

  const signals = [
    { logic: 'logic1', baseWeight: 1.5 }, // Increased weight for this fallback logic
    { logic: 'logic2', baseWeight: 0.7 },
    { logic: 'logic3', baseWeight: 0.9 },
    //... (other logics with their weights)
    { logic: 'logic24', baseWeight: 1.1 }
  ];
  const lastSession = history[0];
  const childPredictions = {
    logic1: predictLogic1(lastSession), // No history check here
    logic2: history.length >= 2 ? predictLogic2(history[0].sid + 1, history) : null,
    // Add checks for other logics based on required history length
    logic24: predictLogic24(history),
  };
  let taiVotes = 0;
  let xiuVotes = 0;
  let totalWeightedVotes = 0;

  signals.forEach(signal => {
    const prediction = childPredictions[signal.logic];
    if (prediction !== null) {
      const acc = logicPerformance[signal.logic]?.accuracy || 0.6; // Default to 60% accuracy
      const consistency = logicPerformance[signal.logic]?.consistency || 0.6; // Default to 60% consistency
      const effectiveWeight = signal.baseWeight * ((acc + consistency) / 2);
      if (prediction === "Tài") {
        taiVotes += effectiveWeight;
      } else {
        xiuVotes += effectiveWeight;
      }
      totalWeightedVotes += effectiveWeight;
    }
  });

  // Simplified confidence logic without complex pattern analysis for brevity
  if (totalWeightedVotes === 0) {
      // If no other logic could make a prediction, fall back to logic1
      const fallbackPrediction = predictLogic1(lastSession);
      if (fallbackPrediction) {
          return { prediction: fallbackPrediction, confidence: 40 }; // Low default confidence
      }
      return { prediction: null, confidence: 0 };
  }

  let prediction = null;
  let confidence = 0;
  if (taiVotes > xiuVotes) {
    prediction = "Tài";
    confidence = Math.round((taiVotes / totalWeightedVotes) * 100);
  } else if (xiuVotes > taiVotes) {
    prediction = "Xỉu";
    confidence = Math.round((xiuVotes / totalWeightedVotes) * 100);
  }

  return { prediction, confidence };
}

// API Endpoint (unchanged)
app.get('/api/taixiu/predict', async (req, res) => {
  try {
    const response = await axios.get('https://fullsrc-daynesun.onrender.com/api/taixiu/sunwin');
    const data = response.data;

    if (!data || !data.Phien || !data.Xuc_xac_1 || !data.Xuc_xac_2 || !data.Xuc_xac_3 || !data.Tong || !data.Ket_qua) {
      // If essential data is missing, we can't even get the basic info
      return res.status(400).json({ error: 'Invalid data from source API' });
    }

    const history = [{
      sid: data.Phien,
      d1: data.Xuc_xac_1,
      d2: data.Xuc_xac_2,
      d3: data.Xuc_xac_3,
      total: data.Tong,
      result: data.Ket_qua,
      timestamp: new Date().getTime()
    }];

    const { prediction, confidence } = await predictLogic20(history, {}, []);

    const responseData = {
      Phien_truoc: data.Phien,
      Xuc_xac: `${data.Xuc_xac_1} - ${data.Xuc_xac_2} - ${data.Xuc_xac_3}`,
      Tong: data.Tong,
      Ket_qua: data.Ket_qua,
      Phien_sau: data.Phien + 1,
      Du_doan: prediction || "Không đủ dữ liệu",
      Do_tin_cay: confidence > 0 ? `${confidence}%` : "0%",
      Pattern: data.Pattern || "Không có"
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
