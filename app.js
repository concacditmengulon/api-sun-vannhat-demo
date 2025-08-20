const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const redis = require('redis');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// MongoDB Setup
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/taixiu', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const sessionSchema = new mongoose.Schema({
  sid: Number,
  d1: Number,
  d2: Number,
  d3: Number,
  total: Number,
  result: String,
  pattern: String,
  timestamp: Number,
});
const Session = mongoose.model('Session', sessionSchema);

// Redis Setup
const redisClient = redis.createClient({
  url: process.env.REDIS_URI || 'redis://localhost:6379',
});
redisClient.connect().catch(console.error);

// Helper Functions
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

// Pattern Data
const PATTERN_DATA = {
  "ttxttx": { tai: 80, xiu: 20 }, "xxttxx": { tai: 25, xiu: 75 },
  // ... (as provided)
};

// Prediction Logics
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

// Assume predictLogic2 to predictLogic24 are included...

// Enhanced predictLogic20
async function predictLogic20(history, logicPerformance, cauLogData) {
  if (history.length < 30) return { prediction: null, confidence: 0, votes: {} };
  let taiVotes = 0;
  let xiuVotes = 0;
  const voteDetails = {};
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
    // ... (include all logic functions)
    logic24: predictLogic24(history),
  };
  let totalWeightedVotes = 0;
  signals.forEach(signal => {
    const prediction = childPredictions[signal.logic];
    if (prediction !== null) {
      const acc = logicPerformance[signal.logic]?.accuracy || 0.5;
      const consistency = logicPerformance[signal.logic]?.consistency || 0.5;
      // Dynamic weighting based on recent performance
      const performanceFactor = Math.max(0.5, Math.min(1.5, (acc + consistency) / 2));
      const effectiveWeight = signal.baseWeight * performanceFactor;
      voteDetails[signal.logic] = { prediction, weight: effectiveWeight };
      if (prediction === "Tài") {
        taiVotes += effectiveWeight;
      } else {
        xiuVotes += effectiveWeight;
      }
      totalWeightedVotes += effectiveWeight;
    }
  });
  // Pattern-based boosting
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
  let prediction = null;
  let confidence = 0;
  if (totalWeightedVotes >= 2.0) {
    if (taiVotes > xiuVotes * 1.1) {
      prediction = "Tài";
      confidence = Math.min(95, Math.round((taiVotes / totalWeightedVotes) * 100));
    } else if (xiuVotes > taiVotes * 1.1) {
      prediction = "Xỉu";
      confidence = Math.min(95, Math.round((xiuVotes / totalWeightedVotes) * 100));
    }
  }
  return { prediction, confidence, votes: voteDetails };
}

// Pattern Analysis
function analyzeAndExtractPatterns(history) {
  const patterns = {};
  if (history.length >= 2) {
    patterns.sum_sequence_patterns = [
      { key: `${history[0].total}-${history[0].result === 'Tài' ? 'T' : 'X'}_${history[1]?.total}-${history[1]?.result === 'Tài' ? 'T' : 'X'}` }
    ];
  }
  if (history.length >= 1) {
    let currentStreakLength = 0;
    const currentResult = history[0].result;
    for (let i = 0; i < history.length; i++) {
      if (history[i].result === currentResult) {
        currentStreakLength++;
      } else {
        break;
      }
    }
    if (currentStreakLength > 0) {
      patterns.last_streak = { result: currentResult === 'Tài' ? 'T' : 'X', length: currentStreakLength };
    }
  }
  if (history.length >= 3) {
    const resultsShort = history.slice(0, 3).map(s => s.result === 'Tài' ? 'T' : 'X').join('');
    if (resultsShort === 'TXT' || resultsShort === 'XTX') {
      patterns.alternating_pattern = resultsShort;
    }
  }
  return patterns;
}

// Fetch and Store Historical Data
async function fetchAndStoreSession() {
  try {
    const response = await axios.get('https://fullsrc-daynesun.onrender.com/api/taixiu/sunwin', {
      timeout: 5000,
    });
    const data = response.data;
    if (!data || !data.Phien || !data.Xuc_xac_1 || !data.Xuc_xac_2 || !data.Xuc_xac_3 || !data.Tong || !data.Ket_qua || !data.Pattern) {
      throw new Error('Invalid data from source API');
    }
    const session = {
      sid: data.Phien,
      d1: data.Xuc_xac_1,
      d2: data.Xuc_xac_2,
      d3: data.Xuc_xac_3,
      total: data.Tong,
      result: data.Ket_qua,
      pattern: data.Pattern,
      timestamp: new Date().getTime(),
    };
    await Session.findOneAndUpdate(
      { sid: session.sid },
      session,
      { upsert: true, new: true }
    );
    return session;
  } catch (error) {
    console.error('Fetch Error:', error.message);
    return null;
  }
}

// API Endpoint
app.get('/api/taixiu/predict', async (req, res) => {
  try {
    // Check Redis cache
    const cacheKey = `taixiu_predict_${Date.now() - (Date.now() % (5 * 60 * 1000))}`; // Cache for 5 minutes
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Fetch latest session
    const latestSession = await fetchAndStoreSession();
    if (!latestSession) {
      return res.status(503).json({ error: 'Unable to fetch latest session' });
    }

    // Fetch historical data (last 100 sessions)
    const history = await Session.find()
      .sort({ sid: -1 })
      .limit(100)
      .lean();
    if (history.length === 0) {
      return res.status(400).json({ error: 'No historical data available' });
    }

    // Simulate logicPerformance (in production, calculate from actual data)
    const logicPerformance = {
      logic1: { accuracy: 0.6, consistency: 0.5, total: 10 },
      logic2: { accuracy: 0.65, consistency: 0.55, total: 10 },
      // ... (add for all logics)
      logic24: { accuracy: 0.7, consistency: 0.6, total: 10 },
    };

    // Predict using enhanced logic20
    const { prediction, confidence, votes } = await predictLogic20(history, logicPerformance, []);

    // Calculate history summary
    const recentResults = history.slice(0, 10).map(s => s.result === 'Tài' ? 'T' : 'X');
    const taiCount = recentResults.filter(r => r === 'T').length;
    const xiuCount = recentResults.filter(r => r === 'X').length;
    const totalCount = taiCount + xiuCount;

    const responseData = {
      Phien_truoc: latestSession.sid,
      Xuc_xac: `${latestSession.d1} - ${latestSession.d2} - ${latestSession.d3}`,
      Tong: latestSession.total,
      Ket_qua: latestSession.result,
      Phien_sau: latestSession.sid + 1,
      Du_doan: prediction || "Không đủ dữ liệu",
      Do_tin_cay: confidence > 0 ? `${confidence}%` : "0%",
      Pattern: latestSession.pattern,
      History_Summary: {
        Recent_Pattern: recentResults.join(''),
        Tai_Ratio: totalCount > 0 ? Number((taiCount / totalCount).toFixed(2)) : 0,
        Xiu_Ratio: totalCount > 0 ? Number((xiuCount / totalCount).toFixed(2)) : 0,
      },
    };

    // Cache response
    await redisClient.setEx(cacheKey, 5 * 60, JSON.stringify(responseData));

    // Log prediction for performance tracking
    console.log(`Prediction for Phien ${latestSession.sid}: ${prediction} (${confidence}%)`);

    res.json(responseData);
  } catch (error) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Periodic Data Fetch (every 1 minute)
setInterval(fetchAndStoreSession, 60 * 1000);

// Start Server
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
