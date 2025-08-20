const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Helper Functions (from provided code)
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

// Pattern Data for Logic 24 (from provided code)
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

// Prediction Logics (from provided code, abbreviated for brevity)
function predictLogic1(lastSession, history) {
  if (!lastSession || history.length < 10) return null;
  const lastDigitOfSession = lastSession.sid % 10;
  const totalPreviousSession = lastSession.total;
  let indicatorSum = lastDigitOfSession + totalPreviousSession;
  const currentPrediction = indicatorSum % 2 === 0 ? "Xỉu" : "Tài";
  let correctCount = 0;
  let totalCount = 0;
  const consistencyWindow = Math.min(history.length - 1, 25);
  for (let i = 0; i < consistencyWindow; i++) {
    const session = history[i];
    const prevSession = history[i + 1];
    if (prevSession) {
      const prevIndicatorSum = (prevSession.sid % 10) + prevSession.total;
      const prevPredicted = prevIndicatorSum % 2 === 0 ? "Xỉu" : "Tài";
      if (prevPredicted === session.result) {
        correctCount++;
      }
      totalCount++;
    }
  }
  if (totalCount > 5 && (correctCount / totalCount) >= 0.65) {
    return currentPrediction;
  }
  return null;
}

// Include other predictLogic functions (2-24) here as provided...

// Modified predictLogic20 for confidence scoring
async function predictLogic20(history, logicPerformance, cauLogData) {
  if (history.length < 30) return { prediction: null, confidence: 0 };
  let taiVotes = 0;
  let xiuVotes = 0;
  const signals = [
    { logic: 'logic1', baseWeight: 0.8 },
    { logic: 'logic2', baseWeight: 0.7 },
    { logic: 'logic3', baseWeight: 0.9 },
    { logic: 'logic4', baseWeight: 1.2 },
    { logic: 'logic5', baseWeight: 0.6 },
    { logic: 'logic6', baseWeight: 0.8 },
    { logic: 'logic7', baseWeight: 1.0 },
    { logic: 'logic8', baseWeight: 0.7 },
    { logic: 'logic9', baseWeight: 1.1 },
    { logic: 'logic10', baseWeight: 0.9 },
    { logic: 'logic11', baseWeight: 1.3 },
    { logic: 'logic12', baseWeight: 0.7 },
    { logic: 'logic13', baseWeight: 1.2 },
    { logic: 'logic14', baseWeight: 0.8 },
    { logic: 'logic15', baseWeight: 0.6 },
    { logic: 'logic16', baseWeight: 0.7 },
    { logic: 'logic17', baseWeight: 0.9 },
    { logic: 'logic18', baseWeight: 1.3 },
    { logic: 'logic19', baseWeight: 0.9 },
    { logic: 'logic21', baseWeight: 1.5 },
    { logic: 'logic22', baseWeight: 1.8 },
    { logic: 'logic23', baseWeight: 1.0 },
    { logic: 'logic24', baseWeight: 1.1 }
  ];
  const lastSession = history[0];
  const nextSessionId = lastSession.sid + 1;
  const childPredictions = {
    logic1: predictLogic1(lastSession, history),
    logic2: predictLogic2(nextSessionId, history),
    logic3: predictLogic3(history),
    logic4: predictLogic4(history),
    logic5: predictLogic5(history),
    logic6: predictLogic6(lastSession, history),
    logic7: predictLogic7(history),
    logic8: predictLogic8(history),
    logic9: predictLogic9(history),
    logic10: predictLogic10(history),
    logic11: predictLogic11(history),
    logic12: predictLogic12(lastSession, history),
    logic13: predictLogic13(history),
    logic14: predictLogic14(history),
    logic15: predictLogic15(history),
    logic16: predictLogic16(history),
    logic17: predictLogic17(history),
    logic18: predictLogic18(history),
    logic19: predictLogic19(history),
    logic21: predictLogic21(history),
    logic22: predictLogic22(history, cauLogData),
    logic23: predictLogic23(history),
    logic24: predictLogic24(history),
  };
  let totalWeightedVotes = 0;
  signals.forEach(signal => {
    const prediction = childPredictions[signal.logic];
    if (prediction !== null) {
      const acc = logicPerformance[signal.logic]?.accuracy || 0.5;
      const consistency = logicPerformance[signal.logic]?.consistency || 0.5;
      const effectiveWeight = signal.baseWeight * ((acc + consistency) / 2);
      if (prediction === "Tài") {
        taiVotes += effectiveWeight;
      } else {
        xiuVotes += effectiveWeight;
      }
      totalWeightedVotes += effectiveWeight;
    }
  });
  const currentPatterns = analyzeAndExtractPatterns(history.slice(0, Math.min(history.length, 50)));
  let cauTaiBoost = 0;
  let cauXiuBoost = 0;
  if (cauLogData.length > 0) {
    const recentCauLogs = cauLogData.slice(Math.max(0, cauLogData.length - 200));
    const patternMatchScores = {};
    for (const patternType in currentPatterns) {
      const currentPatternValue = currentPatterns[patternType];
      if (patternType === 'sum_sequence_patterns' && Array.isArray(currentPatternValue)) {
        currentPatternValue.forEach(cp => {
          const patternKey = cp.key;
          if (patternKey) {
            recentCauLogs.forEach(logEntry => {
              if (logEntry.patterns && logEntry.patterns.sum_sequence_patterns) {
                const foundMatch = logEntry.patterns.sum_sequence_patterns.some(lp => lp.key === patternKey);
                if (foundMatch) {
                  if (!patternMatchScores[patternKey]) {
                    patternMatchScores[patternKey] = { tai: 0, xiu: 0 };
                  }
                  if (logEntry.actual_result === "Tài") patternMatchScores[patternKey].tai++;
                  else patternMatchScores[patternKey].xiu++;
                }
              }
            });
          }
        });
      } else if (currentPatternValue && typeof currentPatternValue === 'object' && currentPatternValue.result && currentPatternValue.length) {
        const patternKey = `last_streak_${currentPatternValue.result}_${currentPatternValue.length}`;
        recentCauLogs.forEach(logEntry => {
          if (logEntry.patterns && logEntry.patterns.last_streak) {
            const logStreak = logEntry.patterns.last_streak;
            if (logStreak.result === currentPatternValue.result && logStreak.length === currentPatternValue.length) {
              if (!patternMatchScores[patternKey]) {
                patternMatchScores[patternKey] = { tai: 0, xiu: 0 };
              }
              if (logEntry.actual_result === "Tài") patternMatchScores[patternKey].tai++;
              else patternMatchScores[patternKey].xiu++;
            }
          }
        });
      } else if (currentPatternValue) {
        const patternKey = `${patternType}_${currentPatternValue}`;
        recentCauLogs.forEach(logEntry => {
          if (logEntry.patterns && logEntry.patterns[patternType] === currentPatternValue) {
            if (!patternMatchScores[patternKey]) {
              patternMatchScores[patternKey] = { tai: 0, xiu: 0 };
            }
            if (logEntry.actual_result === "Tài") patternMatchScores[patternKey].tai++;
            else patternMatchScores[patternKey].xiu++;
          }
        });
      }
    }
    for (const key in patternMatchScores) {
      const stats = patternMatchScores[key];
      const totalMatches = stats.tai + stats.xiu;
      if (totalMatches > 3) {
        const taiRatio = stats.tai / totalMatches;
        const xiuRatio = stats.xiu / totalMatches;
        const CAU_LEARNING_THRESHOLD = 0.70;
        if (taiRatio >= CAU_LEARNING_THRESHOLD) {
          cauTaiBoost += (taiRatio - 0.5) * 2;
        } else if (xiuRatio >= CAU_LEARNING_THRESHOLD) {
          cauXiuBoost += (xiuRatio - 0.5) * 2;
        }
      }
    }
  }
  taiVotes += cauTaiBoost * 2;
  xiuVotes += cauXiuBoost * 2;
  totalWeightedVotes += (cauTaiBoost + cauXiuBoost) * 2;
  if (totalWeightedVotes < 1.5) return { prediction: null, confidence: 0 };
  let prediction = null;
  let confidence = 0;
  if (taiVotes > xiuVotes * 1.08) {
    prediction = "Tài";
    confidence = Math.min(100, Math.round((taiVotes / totalWeightedVotes) * 100));
  } else if (xiuVotes > taiVotes * 1.08) {
    prediction = "Xỉu";
    confidence = Math.min(100, Math.round((xiuVotes / totalWeightedVotes) * 100));
  }
  return { prediction, confidence };
}

// API Endpoint
app.get('/api/taixiu/predict', async (req, res) => {
  try {
    // Fetch data from the source API
    const response = await axios.get('https://fullsrc-daynesun.onrender.com/api/taixiu/sunwin');
    const data = response.data;

    // Validate and transform data
    if (!data || !data.Phien || !data.Xuc_xac_1 || !data.Xuc_xac_2 || !data.Xuc_xac_3 || !data.Tong || !data.Ket_qua || !data.Pattern) {
      return res.status(400).json({ error: 'Invalid data from source API' });
    }

    // Prepare history for prediction (single session for now, extendable to multiple)
    const history = [{
      sid: data.Phien,
      d1: data.Xuc_xac_1,
      d2: data.Xuc_xac_2,
      d3: data.Xuc_xac_3,
      total: data.Tong,
      result: data.Ket_qua,
      timestamp: new Date().getTime()
    }];

    // Since we only have one session, we'll use the provided document as the last session
    const lastSession = {
      sid: data.Phien,
      d1: data.Xuc_xac_1,
      d2: data.Xuc_xac_2,
      d3: data.Xuc_xac_3,
      total: data.Tong,
      result: data.Ket_qua
    };

    // Predict using logic20 (ensemble of all logics)
    const { prediction, confidence } = await predictLogic20(history, {}, []); // Empty logicPerformance and cauLogData for simplicity

    // Construct response
    const responseData = {
      Phien_truoc: data.Phien,
      Xuc_xac: `${data.Xuc_xac_1} - ${data.Xuc_xac_2} - ${data.Xuc_xac_3}`,
      Tong: data.Tong,
      Ket_qua: data.Ket_qua,
      Phien_sau: data.Phien + 1,
      Du_doan: prediction || "Không đủ dữ liệu",
      Do_tin_cay: confidence > 0 ? `${confidence}%` : "0%",
      Pattern: data.Pattern
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
