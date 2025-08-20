const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const SOURCE_API_URL = 'https://fullsrc-daynesun.onrender.com/api/taixiu/sunwin';

// =========================================================================
// Phần 1: Các hàm thuật toán dự đoán (Do người dùng cung cấp)
// =========================================================================

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

function predictLogic2(nextSessionId, history) {
  if (history.length < 15) return null;
  let thuanScore = 0;
  let nghichScore = 0;
  const analysisWindow = Math.min(history.length, 60);
  for (let i = 0; i < analysisWindow; i++) {
    const session = history[i];
    const isEvenSID = session.sid % 2 === 0;
    const weight = 1.0 - (i / analysisWindow) * 0.6;
    if ((isEvenSID && session.result === "Xỉu") || (!isEvenSID && session.result === "Tài")) {
      thuanScore += weight;
    }
    if ((isEvenSID && session.result === "Tài") || (!isEvenSID && session.result === "Xỉu")) {
      nghichScore += weight;
    }
  }
  const currentSessionIsEven = nextSessionId % 2 === 0;
  const totalScore = thuanScore + nghichScore;
  if (totalScore < 10) return null;
  const thuanRatio = thuanScore / totalScore;
  const nghichRatio = nghichScore / totalScore;
  if (thuanRatio > nghichRatio + 0.15) {
    return currentSessionIsEven ? "Xỉu" : "Tài";
  } else if (nghichRatio > thuanRatio + 0.15) {
    return currentSessionIsEven ? "Tài" : "Xỉu";
  }
  return null;
}

function predictLogic3(history) {
  if (history.length < 15) return null;
  const analysisWindow = Math.min(history.length, 50);
  const lastXTotals = history.slice(0, analysisWindow).map(s => s.total);
  const sumOfTotals = lastXTotals.reduce((a, b) => a + b, 0);
  const average = sumOfTotals / analysisWindow;
  const stdDev = calculateStdDev(lastXTotals);
  const deviationFactor = 0.8;
  const recentTrendLength = Math.min(5, history.length);
  const recentTrend = history.slice(0, recentTrendLength).map(s => s.total);
  let isRising = false;
  let isFalling = false;
  if (recentTrendLength >= 3) {
    isRising = true;
    isFalling = true;
    for (let i = 0; i < recentTrendLength - 1; i++) {
      if (recentTrend[i] <= recentTrend[i + 1]) isRising = false;
      if (recentTrend[i] >= recentTrend[i + 1]) isFalling = false;
    }
  }
  if (average < 10.5 - (deviationFactor * stdDev) && isFalling) {
    return "Xỉu";
  } else if (average > 10.5 + (deviationFactor * stdDev) && isRising) {
    return "Tài";
  }
  return null;
}

function predictLogic4(history) {
  if (history.length < 30) return null;
  let bestPrediction = null;
  let maxConfidence = 0;
  const volatility = calculateStdDev(history.slice(0, Math.min(30, history.length)).map(s => s.total));
  const patternLengths = (volatility < 1.7) ? [6, 5, 4] : [5, 4, 3];
  for (const len of patternLengths) {
    if (history.length < len + 2) continue;
    const recentPattern = history.slice(0, len).map(s => s.result).reverse().join('');
    let taiFollows = 0;
    let xiuFollows = 0;
    let totalMatches = 0;
    for (let i = len; i < Math.min(history.length - 1, 200); i++) {
      const patternToMatch = history.slice(i, i + len).map(s => s.result).reverse().join('');
      if (patternToMatch === recentPattern) {
        totalMatches++;
        const nextResult = history[i - 1].result;
        if (nextResult === 'Tài') {
          taiFollows++;
        } else {
          xiuFollows++;
        }
      }
    }
    if (totalMatches < 3) continue;
    const taiConfidence = taiFollows / totalMatches;
    const xiuConfidence = xiuFollows / totalMatches;
    const MIN_PATTERN_CONFIDENCE = 0.70;
    if (taiConfidence >= MIN_PATTERN_CONFIDENCE && taiConfidence > maxConfidence) {
      maxConfidence = taiConfidence;
      bestPrediction = "Tài";
    } else if (xiuConfidence >= MIN_PATTERN_CONFIDENCE && xiuConfidence > maxConfidence) {
      maxConfidence = xiuConfidence;
      bestPrediction = "Xỉu";
    }
  }
  return bestPrediction;
}

function predictLogic5(history) {
  if (history.length < 40) return null;
  const sumCounts = {};
  const analysisWindow = Math.min(history.length, 400);
  for (let i = 0; i < analysisWindow; i++) {
    const total = history[i].total;
    const weight = 1.0 - (i / analysisWindow) * 0.8;
    sumCounts[total] = (sumCounts[total] || 0) + weight;
  }
  let mostFrequentSum = -1;
  let maxWeightedCount = 0;
  for (const sum in sumCounts) {
    if (sumCounts[sum] > maxWeightedCount) {
      maxWeightedCount = sumCounts[sum];
      mostFrequentSum = parseInt(sum);
    }
  }
  if (mostFrequentSum !== -1) {
    const minWeightedCountRatio = 0.08;
    const totalWeightedSum = Object.values(sumCounts).reduce((a, b) => a + b, 0);
    if (totalWeightedSum > 0 && (maxWeightedCount / totalWeightedSum) > minWeightedCountRatio) {
      const neighbors = [];
      if (sumCounts[mostFrequentSum - 1]) neighbors.push(sumCounts[mostFrequentSum - 1]);
      if (sumCounts[mostFrequentSum + 1]) neighbors.push(sumCounts[mostFrequentSum + 1]);
      const isPeak = neighbors.every(n => maxWeightedCount > n * 1.05);
      if (isPeak) {
        if (mostFrequentSum <= 10) return "Xỉu";
        if (mostFrequentSum >= 11) return "Tài";
      }
    }
  }
  return null;
}

function predictLogic6(lastSession, history) {
  if (!lastSession || history.length < 40) return null;
  const nextSessionLastDigit = (lastSession.sid + 1) % 10;
  const lastSessionTotalParity = lastSession.total % 2;
  let taiVotes = 0;
  let xiuVotes = 0;
  const analysisWindow = Math.min(history.length, 250);
  if (analysisWindow < 2) return null;
  for (let i = 0; i < analysisWindow - 1; i++) {
    const currentHistSessionResult = history[i].result;
    const prevHistSession = history[i + 1];
    const prevSessionLastDigit = prevHistSession.sid % 10;
    const prevSessionTotalParity = prevHistSession.total % 2;
    const featureSetHistory = `${prevSessionLastDigit % 2}-${prevSessionTotalParity}-${(prevHistSession.total > 10.5 ? 'T' : 'X')}`;
    const featureSetCurrent = `${nextSessionLastDigit % 2}-${lastSessionTotalParity}-${(lastSession.total > 10.5 ? 'T' : 'X')}`;
    if (featureSetHistory === featureSetCurrent) {
      if (currentHistSessionResult === "Tài") {
        taiVotes++;
      } else {
        xiuVotes++;
      }
    }
  }
  const totalVotes = taiVotes + xiuVotes;
  if (totalVotes < 5) return null;
  const voteDifferenceRatio = Math.abs(taiVotes - xiuVotes) / totalVotes;
  if (voteDifferenceRatio > 0.25) {
    if (taiVotes > xiuVotes) return "Tài";
    if (xiuVotes > taiVotes) return "Xỉu";
  }
  return null;
}

function predictLogic7(history) {
  const TREND_STREAK_LENGTH_MIN = 4;
  const TREND_STREAK_LENGTH_MAX = 7;
  if (history.length < TREND_STREAK_LENGTH_MIN) return null;
  const volatility = calculateStdDev(history.slice(0, Math.min(25, history.length)).map(s => s.total));
  const effectiveStreakLength = (volatility < 1.6) ? TREND_STREAK_LENGTH_MAX : TREND_STREAK_LENGTH_MIN + 1;
  const recentResults = history.slice(0, effectiveStreakLength).map(s => s.result);
  if (recentResults.length < effectiveStreakLength) return null;
  if (recentResults.every(r => r === "Tài")) {
    const nextFew = history.slice(effectiveStreakLength, effectiveStreakLength + 2);
    if (nextFew.length === 2 && nextFew.filter(s => s.result === "Tài").length >= 1) {
      return "Tài";
    }
  }
  if (recentResults.every(r => r === "Xỉu")) {
    const nextFew = history.slice(effectiveStreakLength, effectiveStreakLength + 2);
    if (nextFew.length === 2 && nextFew.filter(s => s.result === "Xỉu").length >= 1) {
      return "Xỉu";
    }
  }
  return null;
}

function predictLogic8(history) {
  const LONG_PERIOD = 30;
  if (history.length < LONG_PERIOD + 1) return null;
  const calculateAverage = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const longTermTotals = history.slice(1, LONG_PERIOD + 1).map(s => s.total);
  const longTermAverage = calculateAverage(longTermTotals);
  const longTermStdDev = calculateStdDev(longTermTotals);
  const lastSessionTotal = history[0].total;
  const dynamicDeviationThreshold = Math.max(1.5, 0.8 * longTermStdDev);
  const last5Totals = history.slice(0, Math.min(5, history.length)).map(s => s.total);
  let isLast5Rising = false;
  let isLast5Falling = false;
  if (last5Totals.length >= 2) {
    isLast5Rising = true;
    isLast5Falling = true;
    for (let i = 0; i < last5Totals.length - 1; i++) {
      if (last5Totals[i] <= last5Totals[i + 1]) isLast5Rising = false;
      if (last5Totals[i] >= last5Totals[i + 1]) isLast5Falling = false;
    }
  }
  if (lastSessionTotal > longTermAverage + dynamicDeviationThreshold && isLast5Rising) {
    return "Xỉu";
  } else if (lastSessionTotal < longTermAverage - dynamicDeviationThreshold && isLast5Falling) {
    return "Tài";
  }
  return null;
}

function predictLogic9(history) {
  if (history.length < 20) return null;
  let maxTaiStreak = 0;
  let maxXiuStreak = 0;
  let currentTaiStreakForHistory = 0;
  let currentXiuStreakForHistory = 0;
  const historyForMaxStreak = history.slice(0, Math.min(history.length, 120));
  for (const session of historyForMaxStreak) {
    if (session.result === "Tài") {
      currentTaiStreakForHistory++;
      currentXiuStreakForHistory = 0;
    } else {
      currentXiuStreakForHistory++;
      currentTaiStreakForHistory = 0;
    }
    maxTaiStreak = Math.max(maxTaiStreak, currentTaiStreakForHistory);
    maxXiuStreak = Math.max(maxXiuStreak, currentXiuStreakForHistory);
  }
  const dynamicThreshold = Math.max(4, Math.floor(Math.max(maxTaiStreak, maxXiuStreak) * 0.5));
  const mostRecentResult = history[0].result;
  let currentConsecutiveCount = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].result === mostRecentResult) {
      currentConsecutiveCount++;
    } else {
      break;
    }
  }
  if (currentConsecutiveCount >= dynamicThreshold) {
    if (currentConsecutiveCount >= 3) {
      let totalReversals = 0;
      let totalContinuations = 0;
      for (let i = currentConsecutiveCount; i < history.length - currentConsecutiveCount; i++) {
        const potentialStreak = history.slice(i, i + currentConsecutiveCount);
        if (potentialStreak.every(s => s.result === mostRecentResult)) {
          if (history[i - 1] && history[i - 1].result !== mostRecentResult) {
            totalReversals++;
          } else if (history[i - 1] && history[i - 1].result === mostRecentResult) {
            totalContinuations++;
          }
        }
      }
      if (totalReversals + totalContinuations > 3 && totalReversals > totalContinuations * 1.3) {
        return mostRecentResult === "Tài" ? "Xỉu" : "Tài";
      }
    }
  }
  return null;
}

function predictLogic10(history) {
  const MOMENTUM_STREAK_LENGTH = 3;
  const STABILITY_CHECK_LENGTH = 7;
  if (history.length < STABILITY_CHECK_LENGTH + 1) return null;
  const recentResults = history.slice(0, MOMENTUM_STREAK_LENGTH).map(s => s.result);
  const widerHistory = history.slice(0, STABILITY_CHECK_LENGTH).map(s => s.result);
  if (recentResults.every(r => r === "Tài")) {
    const taiCountInWider = widerHistory.filter(r => r === "Tài").length;
    if (taiCountInWider / STABILITY_CHECK_LENGTH >= 0.75) {
      if (predictLogic9(history) !== "Xỉu") {
        return "Tài";
      }
    }
  }
  if (recentResults.every(r => r === "Xỉu")) {
    const xiuCountInWider = widerHistory.filter(r => r === "Xỉu").length;
    if (xiuCountInWider / STABILITY_CHECK_LENGTH >= 0.75) {
      if (predictLogic9(history) !== "Tài") {
        return "Xỉu";
      }
    }
  }
  return null;
}

function predictLogic11(history) {
  if (history.length < 15) return null;
  const reversalPatterns = [
    { pattern: "TàiXỉuTài", predict: "Xỉu", minOccurrences: 3, weight: 1.5 },
    { pattern: "XỉuTàiXỉu", predict: "Tài", minOccurrences: 3, weight: 1.5 },
    { pattern: "TàiTàiXỉu", predict: "Tài", minOccurrences: 4, weight: 1.3 },
    { pattern: "XỉuXỉuTài", predict: "Xỉu", minOccurrences: 4, weight: 1.3 },
    { pattern: "TàiXỉuXỉu", predict: "Tài", minOccurrences: 3, weight: 1.4 },
    { pattern: "XỉuTàiTài", predict: "Xỉu", minOccurrences: 3, weight: 1.4 },
    { pattern: "XỉuTàiTàiXỉu", predict: "Xỉu", minOccurrences: 2, weight: 1.6 },
    { pattern: "TàiXỉuXỉuTài", predict: "Tài", minOccurrences: 2, weight: 1.6 },
    { pattern: "TàiXỉuTàiXỉu", predict: "Tài", minOccurrences: 2, weight: 1.4 },
    { pattern: "XỉuTàiXỉuTài", predict: "Xỉu", minOccurrences: 2, weight: 1.4 },
    { pattern: "TàiXỉuXỉuXỉu", predict: "Tài", minOccurrences: 1, weight: 1.7 },
    { pattern: "XỉuTàiTàiTài", predict: "Xỉu", minOccurrences: 1, weight: 1.7 },
  ];
  let bestPatternMatch = null;
  let maxWeightedConfidence = 0;
  for (const patternDef of reversalPatterns) {
    const patternDefShort = patternDef.pattern.replace(/Tài/g, 'T').replace(/Xỉu/g, 'X');
    const patternLength = patternDefShort.length;
    if (history.length < patternLength + 1) continue;
    const currentWindowShort = history.slice(0, patternLength).map(s => s.result === 'Tài' ? 'T' : 'X').reverse().join('');
    if (currentWindowShort === patternDefShort) {
      let matchCount = 0;
      let totalPatternOccurrences = 0;
      for (let i = patternLength; i < Math.min(history.length - 1, 350); i++) {
        const historicalPatternShort = history.slice(i, i + patternLength).map(s => s.result === 'Tài' ? 'T' : 'X').reverse().join('');
        if (historicalPatternShort === patternDefShort) {
          totalPatternOccurrences++;
          if (history[i - 1].result === patternDef.predict) {
            matchCount++;
          }
        }
      }
      if (totalPatternOccurrences < patternDef.minOccurrences) continue;
      const patternAccuracy = matchCount / totalPatternOccurrences;
      if (patternAccuracy >= 0.68) {
        const weightedConfidence = patternAccuracy * patternDef.weight;
        if (weightedConfidence > maxWeightedConfidence) {
          maxWeightedConfidence = weightedConfidence;
          bestPatternMatch = patternDef.predict;
        }
      }
    }
  }
  return bestPatternMatch;
}

function predictLogic12(lastSession, history) {
  if (!lastSession || history.length < 20) return null;
  const nextSessionParity = (lastSession.sid + 1) % 2;
  const mostRecentResult = history[0].result;
  let currentConsecutiveCount = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].result === mostRecentResult) {
      currentConsecutiveCount++;
    } else {
      break;
    }
  }
  let taiVotes = 0;
  let xiuVotes = 0;
  const analysisWindow = Math.min(history.length, 250);
  for (let i = 0; i < analysisWindow - 1; i++) {
    const currentHistSession = history[i];
    const prevHistSession = history[i + 1];
    const prevHistSessionParity = prevHistSession.sid % 2;
    let histConsecutiveCount = 0;
    for (let j = i + 1; j < analysisWindow; j++) {
      if (history[j].result === prevHistSession.result) {
        histConsecutiveCount++;
      } else {
        break;
      }
    }
    if (prevHistSessionParity === nextSessionParity && histConsecutiveCount === currentConsecutiveCount) {
      if (currentHistSession.result === "Tài") {
        taiVotes++;
      } else {
        xiuVotes++;
      }
    }
  }
  const totalVotes = taiVotes + xiuVotes;
  if (totalVotes < 6) return null;
  if (taiVotes / totalVotes >= 0.68) return "Tài";
  if (xiuVotes / totalVotes >= 0.68) return "Xỉu";
  return null;
}

function predictLogic13(history) {
  if (history.length < 80) return null;
  const mostRecentResult = history[0].result;
  let currentStreakLength = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].result === mostRecentResult) {
      currentStreakLength++;
    } else {
      break;
    }
  }
  if (currentStreakLength < 1) return null;
  const streakStats = {};
  const analysisWindow = Math.min(history.length, 500);
  for (let i = 0; i < analysisWindow - 1; i++) {
    const sessionResult = history[i].result;
    const prevSessionResult = history[i + 1].result;
    let tempStreakLength = 1;
    for (let j = i + 2; j < analysisWindow; j++) {
      if (history[j].result === prevSessionResult) {
        tempStreakLength++;
      } else {
        break;
      }
    }
    if (tempStreakLength > 0) {
      const streakKey = `${prevSessionResult}_${tempStreakLength}`;
      if (!streakStats[streakKey]) {
        streakStats[streakKey] = { 'Tài': 0, 'Xỉu': 0 };
      }
      streakStats[streakKey][sessionResult]++;
    }
  }
  const currentStreakKey = `${mostRecentResult}_${currentStreakLength}`;
  if (streakStats[currentStreakKey]) {
    const stats = streakStats[currentStreakKey];
    const totalFollowUps = stats['Tài'] + stats['Xỉu'];
    if (totalFollowUps < 5) return null;
    const taiProb = stats['Tài'] / totalFollowUps;
    const xiuProb = stats['Xỉu'] / totalFollowUps;
    const CONFIDENCE_THRESHOLD = 0.65;
    if (taiProb >= CONFIDENCE_THRESHOLD) {
      return "Tài";
    } else if (xiuProb >= CONFIDENCE_THRESHOLD) {
      return "Xỉu";
    }
  }
  return null;
}

function predictLogic14(history) {
  if (history.length < 50) return null;
  const shortPeriod = 8;
  const longPeriod = 30;
  if (history.length < longPeriod) return null;
  const shortTermTotals = history.slice(0, shortPeriod).map(s => s.total);
  const longTermTotals = history.slice(0, longPeriod).map(s => s.total);
  const shortAvg = shortTermTotals.reduce((a, b) => a + b, 0) / shortPeriod;
  const longAvg = longTermTotals.reduce((a, b) => a + b, 0) / longPeriod;
  const longStdDev = calculateStdDev(longTermTotals);
  if (shortAvg > longAvg + (longStdDev * 0.8)) {
    const last2Results = history.slice(0, 2).map(s => s.result);
    if (last2Results.length === 2 && last2Results.every(r => r === "Tài")) {
      return "Xỉu";
    }
  } else if (shortAvg < longAvg - (longStdDev * 0.8)) {
    const last2Results = history.slice(0, 2).map(s => s.result);
    if (last2Results.length === 2 && last2Results.every(r => r === "Xỉu")) {
      return "Tài";
    }
  }
  return null;
}

function predictLogic15(history) {
  if (history.length < 80) return null;
  const analysisWindow = Math.min(history.length, 400);
  const evenCounts = { "Tài": 0, "Xỉu": 0 };
  const oddCounts = { "Tài": 0, "Xỉu": 0 };
  let totalEven = 0;
  let totalOdd = 0;
  for (let i = 0; i < analysisWindow; i++) {
    const session = history[i];
    const isTotalEven = session.total % 2 === 0;
    if (isTotalEven) {
      evenCounts[session.result]++;
      totalEven++;
    } else {
      oddCounts[session.result]++;
      totalOdd++;
    }
  }
  if (totalEven < 20 || totalOdd < 20) return null;
  const lastSessionTotal = history[0].total;
  const isLastTotalEven = lastSessionTotal % 2 === 0;
  const minDominance = 0.65;
  if (isLastTotalEven) {
    if (evenCounts["Tài"] / totalEven >= minDominance) return "Tài";
    if (evenCounts["Xỉu"] / totalEven >= minDominance) return "Xỉu";
  } else {
    if (oddCounts["Tài"] / totalOdd >= minDominance) return "Tài";
    if (oddCounts["Xỉu"] / totalOdd >= minDominance) return "Xỉu";
  }
  return null;
}

function predictLogic16(history) {
  if (history.length < 60) return null;
  const MODULO_N = 5;
  const analysisWindow = Math.min(history.length, 500);
  const moduloPatterns = {};
  for (let i = 0; i < analysisWindow - 1; i++) {
    const prevSession = history[i + 1];
    const currentSessionResult = history[i].result;
    const moduloValue = prevSession.total % MODULO_N;
    if (!moduloPatterns[moduloValue]) {
      moduloPatterns[moduloValue] = { 'Tài': 0, 'Xỉu': 0 };
    }
    moduloPatterns[moduloValue][currentSessionResult]++;
  }
  const lastSessionTotal = history[0].total;
  const currentModuloValue = lastSessionTotal % MODULO_N;
  if (moduloPatterns[currentModuloValue]) {
    const stats = moduloPatterns[currentModuloValue];
    const totalCount = stats['Tài'] + stats['Xỉu'];
    if (totalCount < 7) return null;
    const taiProb = stats['Tài'] / totalCount;
    const xiuProb = stats['Xỉu'] / totalCount;
    const CONFIDENCE_THRESHOLD = 0.65;
    if (taiProb >= CONFIDENCE_THRESHOLD) {
      return "Tài";
    } else if (xiuProb >= CONFIDENCE_THRESHOLD) {
      return "Xỉu";
    }
  }
  return null;
}

function predictLogic17(history) {
  if (history.length < 100) return null;
  const analysisWindow = Math.min(history.length, 600);
  const totals = history.slice(0, analysisWindow).map(s => s.total);
  const meanTotal = totals.reduce((a, b) => a + b, 0) / totals.length;
  const stdDevTotal = calculateStdDev(totals);
  const lastSessionTotal = history[0].total;
  const deviation = Math.abs(lastSessionTotal - meanTotal);
  const zScore = stdDevTotal > 0 ? deviation / stdDevTotal : 0;
  const Z_SCORE_THRESHOLD = 1.5;
  if (zScore >= Z_SCORE_THRESHOLD) {
    if (lastSessionTotal > meanTotal) {
      return "Xỉu";
    } else {
      return "Tài";
    }
  }
  return null;
}

function predictLogic18(history) {
  if (history.length < 50) return null;
  const analysisWindow = Math.min(history.length, 300);
  const patternStats = {};
  for (let i = 0; i < analysisWindow - 1; i++) {
    const prevSession = history[i + 1];
    const currentSessionResult = history[i].result;
    const p1 = prevSession.d1 % 2;
    const p2 = prevSession.d2 % 2;
    const p3 = prevSession.d3 % 2;
    const patternKey = `${p1}-${p2}-${p3}`;
    if (!patternStats[patternKey]) {
      patternStats[patternKey] = { 'Tài': 0, 'Xỉu': 0 };
    }
    patternStats[patternKey][currentSessionResult]++;
  }
  const lastSession = history[0];
  const currentP1 = lastSession.d1 % 2;
  const currentP2 = lastSession.d2 % 2;
  const currentP3 = lastSession.d3 % 2;
  const currentPatternKey = `${currentP1}-${currentP2}-${currentP3}`;
  if (patternStats[currentPatternKey]) {
    const stats = patternStats[currentPatternKey];
    const totalCount = stats['Tài'] + stats['Xỉu'];
    if (totalCount < 8) return null;
    const taiProb = stats['Tài'] / totalCount;
    const xiuProb = stats['Xỉu'] / totalCount;
    const CONFIDENCE_THRESHOLD = 0.65;
    if (taiProb >= CONFIDENCE_THRESHOLD) {
      return "Tài";
    } else if (xiuProb >= CONFIDENCE_THRESHOLD) {
      return "Xỉu";
    }
  }
  return null;
}

function predictLogic19(history) {
  if (history.length < 50) return null;
  let taiScore = 0;
  let xiuScore = 0;
  const now = new Date().getTime();
  const analysisWindowMs = 2 * 60 * 60 * 1000;
  for (const session of history) {
    if (now - session.timestamp > analysisWindowMs) break;
    const ageFactor = 1 - ((now - session.timestamp) / analysisWindowMs);
    const weight = ageFactor * ageFactor * ageFactor;
    if (session.result === "Tài") {
      taiScore += weight;
    } else {
      xiuScore += weight;
    }
  }
  const totalScore = taiScore + xiuScore;
  if (totalScore < 10) return null;
  const taiRatio = taiScore / totalScore;
  const xiuRatio = xiuScore / totalScore;
  const BIAS_THRESHOLD = 0.10;
  if (taiRatio > xiuRatio + BIAS_THRESHOLD) {
    return "Tài";
  } else if (xiuRatio > taiRatio + BIAS_THRESHOLD) {
    return "Xỉu";
  }
  return null;
}

function markovWeightedV3(patternArr) {
  if (patternArr.length < 3) return null;
  const transitions = {};
  const lastResult = patternArr[patternArr.length - 1];
  const secondLastResult = patternArr.length > 1 ? patternArr[patternArr.length - 2] : null;
  for (let i = 0; i < patternArr.length - 1; i++) {
    const current = patternArr[i];
    const next = patternArr[i + 1];
    const key = current + next;
    if (!transitions[key]) {
      transitions[key] = { 'T': 0, 'X': 0 };
    }
    if (i + 2 < patternArr.length) {
      transitions[key][patternArr[i + 2]]++;
    }
  }
  if (secondLastResult && lastResult) {
    const currentTransitionKey = secondLastResult + lastResult;
    if (transitions[currentTransitionKey]) {
      const stats = transitions[currentTransitionKey];
      const total = stats['T'] + stats['X'];
      if (total > 3) {
        if (stats['T'] / total > 0.60) return "Tài";
        if (stats['X'] / total > 0.60) return "Xỉu";
      }
    }
  }
  return null;
}

function repeatingPatternV3(patternArr) {
  if (patternArr.length < 4) return null;
  const lastThree = patternArr.slice(-3).join('');
  const lastFour = patternArr.slice(-4).join('');
  let taiFollows = 0;
  let xiuFollows = 0;
  let totalMatches = 0;
  for (let i = 0; i < patternArr.length - 4; i++) {
    const sliceThree = patternArr.slice(i, i + 3).join('');
    const sliceFour = patternArr.slice(i, i + 4).join('');
    let isMatch = false;
    if (lastThree === sliceThree) {
      isMatch = true;
    } else if (lastFour === sliceFour) {
      isMatch = true;
    }
    if (isMatch && i + 4 < patternArr.length) {
      totalMatches++;
      if (patternArr[i + 4] === 'T') {
        taiFollows++;
      } else {
        xiuFollows++;
      }
    }
  }
  if (totalMatches < 3) return null;
  if (taiFollows / totalMatches > 0.65) return "Tài";
  if (xiuFollows / totalMatches > 0.65) return "Xỉu";
  return null;
}

function detectBiasV3(patternArr) {
  if (patternArr.length < 5) return null;
  let taiCount = 0;
  let xiuCount = 0;
  patternArr.forEach(result => {
    if (result === 'T') taiCount++;
    else xiuCount++;
  });
  const total = taiCount + xiuCount;
  if (total === 0) return null;
  const taiRatio = taiCount / total;
  const xiuRatio = xiuCount / total;
  if (taiRatio > 0.60) return "Tài";
  if (xiuRatio > 0.60) return "Xỉu";
  return null;
}

function predictLogic21(history) {
  if (history.length < 20) return null;
  const patternArr = history.map(s => s.result === 'Tài' ? 'T' : 'X');
  const voteCounts = { Tài: 0, Xỉu: 0 };
  let totalWeightSum = 0;
  const windows = [3, 5, 8, 12, 20, 30, 40, 60, 80];
  for (const win of windows) {
    if (patternArr.length < win) continue;
    const subPattern = patternArr.slice(0, win);
    const weight = win / 10;
    const markovRes = markovWeightedV3(subPattern.slice().reverse());
    if (markovRes) {
      voteCounts[markovRes] += weight * 0.7;
      totalWeightSum += weight * 0.7;
    }
    const repeatRes = repeatingPatternV3(subPattern.slice().reverse());
    if (repeatRes) {
      voteCounts[repeatRes] += weight * 0.15;
      totalWeightSum += weight * 0.15;
    }
    const biasRes = detectBiasV3(subPattern);
    if (biasRes) {
      voteCounts[biasRes] += weight * 0.15;
      totalWeightSum += weight * 0.15;
    }
  }
  if (totalWeightSum === 0) return null;
  if (voteCounts.Tài > voteCounts.Xỉu * 1.08) {
    return "Tài";
  } else if (voteCounts.Xỉu > voteCounts.Tài * 1.08) {
    return "Xỉu";
  } else {
    return null;
  }
}

function predictLogic22(history, cauLogData) {
  if (history.length < 15) return null;
  const resultsOnly = history.map(s => s.result === 'Tài' ? 'T' : 'X');
  const totalsOnly = history.map(s => s.total);
  let taiVotes = 0;
  let xiuVotes = 0;
  let totalContributionWeight = 0;
  // Sub-logic 22.1: Dynamic Streak Prediction
  const currentStreakResult = resultsOnly[0];
  let currentStreakLength = 0;
  for (let i = 0; i < resultsOnly.length; i++) {
    if (resultsOnly[i] === currentStreakResult) {
      currentStreakLength++;
    } else {
      break;
    }
  }
  if (currentStreakLength >= 3) {
    let streakBreakCount = 0;
    let streakContinueCount = 0;
    const streakSearchWindow = Math.min(resultsOnly.length, 200);
    for (let i = currentStreakLength; i < streakSearchWindow; i++) {
      const potentialStreak = resultsOnly.slice(i, i + currentStreakLength);
      if (potentialStreak.every(r => r === currentStreakResult)) {
        if (resultsOnly[i - 1]) {
          if (resultsOnly[i - 1] === currentStreakResult) {
            streakContinueCount++;
          } else {
            streakBreakCount++;
          }
        }
      }
    }
    const totalStreakOccurrences = streakBreakCount + streakContinueCount;
    if (totalStreakOccurrences > 5) {
      if (streakBreakCount / totalStreakOccurrences > 0.65) {
        if (currentStreakResult === 'T') xiuVotes += 1.5; else taiVotes += 1.5;
        totalContributionWeight += 1.5;
      } else if (streakContinueCount / totalStreakOccurrences > 0.65) {
        if (currentStreakResult === 'T') taiVotes += 1.5; else xiuVotes += 1.5;
        totalContributionWeight += 1.5;
      }
    }
  }
  // Sub-logic 22.2: Alternating Pattern Recognition
  if (history.length >= 4) {
    const lastFour = resultsOnly.slice(0, 4).join('');
    let patternMatches = 0;
    let taiFollows = 0;
    let xiuFollows = 0;
    const patternToMatch = lastFour.substring(0, 3);
    const searchLength = Math.min(resultsOnly.length, 150);
    for (let i = 0; i < searchLength - 3; i++) {
      const historicalPattern = resultsOnly.slice(i, i + 3).join('');
      if (historicalPattern === patternToMatch) {
        if (resultsOnly[i + 3] === 'T') taiFollows++;
        else xiuFollows++;
        patternMatches++;
      }
    }
    if (patternMatches > 4) {
      if (taiFollows / patternMatches > 0.70) {
        taiVotes += 1.2; totalContributionWeight += 1.2;
      } else if (xiuFollows / patternMatches > 0.70) {
        xiuVotes += 1.2; totalContributionWeight += 1.2;
      }
    }
  }
  // Sub-logic 22.3: Total Sum Sequence Analysis
  if (history.length >= 2) {
    const lastTwoTotals = totalsOnly.slice(0, 2);
    const lastTwoResults = resultsOnly.slice(0, 2);
    if (lastTwoTotals.length === 2) {
      const targetPatternKey = `${lastTwoTotals[1]}-${lastTwoResults[1]}_${lastTwoTotals[0]}-${lastTwoResults[0]}`;
      let taiFollows = 0;
      let xiuFollows = 0;
      let totalPatternMatches = 0;
      const relevantLogs = cauLogData.filter(log => log.patterns && log.patterns.sum_sequence_patterns);
      for (const log of relevantLogs) {
        for (const pattern of log.patterns.sum_sequence_patterns) {
          if (pattern.key === targetPatternKey) {
            totalPatternMatches++;
            if (log.actual_result === "Tài") taiFollows++;
            else xiuFollows++;
          }
        }
      }
      if (totalPatternMatches > 3) {
        if (taiFollows / totalPatternMatches > 0.70) { taiVotes += 1.0; totalContributionWeight += 1.0; }
        else if (xiuFollows / totalPatternMatches > 0.70) { xiuVotes += 1.0; totalContributionWeight += 1.0; }
      }
    }
  }
  if (totalContributionWeight === 0) return null;
  if (taiVotes > xiuVotes * 1.1) {
    return "Tài";
  } else if (xiuVotes > taiVotes * 1.1) {
    return "Xỉu";
  }
  return null;
}

function predictLogic23(history) {
  if (history.length < 5) return null;
  const totals = history.map(s => s.total);
  const lastResults = history.map(s => s.result);
  const allDice = history.slice(0, Math.min(history.length, 10)).flatMap(s => [s.d1, s.d2, s.d3]);
  const diceFreq = getDiceFrequencies(history, 10);
  const avg_total = totals.slice(0, Math.min(history.length, 10)).reduce((a, b) => a + b, 0) / Math.min(history.length, 10);
  const simplePredictions = [];
  if (history.length >= 2) {
    if ((totals[0] + totals[1]) % 2 === 0) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (avg_total > 10.5) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  if (diceFreq[4] + diceFreq[5] > diceFreq[1] + diceFreq[2]) {
    simplePredictions.push("Tài");
  } else {
    simplePredictions.push("Xỉu");
  }
  if (history.filter(s => s.total > 10).length > history.length / 2) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  if (history.length >= 3) {
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) > 33) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (history.length >= 5) {
    if (Math.max(...totals.slice(0, 5)) > 15) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (history.length >= 5) {
    if (totals.slice(0, 5).filter(t => t > 10).length >= 3) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (history.length >= 3) {
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) > 34) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (history.length >= 2) {
    if (totals[0] > 10 && totals[1] > 10) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
    if (totals[0] < 10 && totals[1] < 10) simplePredictions.push("Xỉu"); else simplePredictions.push("Tài");
  }
  if (history.length >= 1) {
    if ((totals[0] + diceFreq[3]) % 2 === 0) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
    if (diceFreq[2] > 3) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
    if ([11, 12, 13].includes(totals[0])) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (history.length >= 2) {
    if (totals[0] + totals[1] > 30) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (allDice.filter(d => d > 3).length > 7) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  if (history.length >= 1) {
    if (totals[0] % 2 === 0) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (allDice.filter(d => d > 3).length > 8) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  if (history.length >= 3) {
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) % 4 === 0) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) % 3 === 0) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (history.length >= 1) {
    if (totals[0] % 3 === 0) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
    if (totals[0] % 5 === 0) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
    if (totals[0] % 4 === 0) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  }
  if (diceFreq[4] > 2) simplePredictions.push("Tài"); else simplePredictions.push("Xỉu");
  let taiVotes =  simplePredictions.filter(v => v === "Tài").length;
  let xiuVotes = simplePredictions.filter(v => v === "Xỉu").length;
  if (taiVotes > xiuVotes * 1.5) {
    return "Tài";
  } else if (xiuVotes > taiVotes * 1.5) {
    return "Xỉu";
  }
  return null;
}

function analyzePatterns(lastResults) {
  if (!lastResults || lastResults.length === 0) return [null, "Không có dữ liệu"];
  const resultsShort = lastResults.map(r => r === "Tài" ? "T" : "X");
  const displayLength = Math.min(resultsShort.length, 10);
  const recentSequence = resultsShort.slice(0, displayLength).join('');
  return [null, `: ${recentSequence}`];
}

function predictLogic24(history) {
  if (!history || history.length < 5) return null;
  const lastResults = history.map(s => s.result);
  const totals = history.map(s => s.total);
  const allDice = history.flatMap(s => [s.d1, s.d2, s.d3]);
  const diceFreq = new Array(7).fill(0);
  allDice.forEach(d => { if (d >= 1 && d <= 6) diceFreq[d]++; });
  const avg_total = totals.slice(0, Math.min(history.length, 10)).reduce((a, b) => a + b, 0) / Math.min(history.length, 10);
  const votes = [];
  if (history.length >= 2) {
    if ((totals[0] + totals[1]) % 2 === 0) votes.push("Tài"); else votes.push("Xỉu");
  }
  if (avg_total > 10.5) votes.push("Tài"); else votes.push("Xỉu");
  if (diceFreq[4] + diceFreq[5] > diceFreq[1] + diceFreq[2]) {
    votes.push("Tài");
  } else {
    votes.push("Xỉu");
  }
  if (history.filter(s => s.total > 10).length > history.length / 2) votes.push("Tài"); else votes.push("Xỉu");
  if (history.length >= 3) {
    if (totals.slice(0, 3).reduce((a, b) => a + b, 0) > 33) votes.push("Tài"); else votes.push("Xỉu");
  }
  if (history.length >= 5) {
    if (Math.max(...totals.slice(0, 5)) > 15) votes.push("Tài"); else votes.push("Xỉu");
  }
  const patternSeq = lastResults.slice(0, 3).reverse().map(r => r === "Tài" ? "t" : "x").join("");
  if (PATTERN_DATA[patternSeq]) {
    const prob = PATTERN_DATA[patternSeq];
    if (prob.tai > prob.xiu + 15) votes.push("Tài");
    else if (prob.xiu > prob.tai + 15) votes.push("Xỉu");
  }
  const [patternPred, patternDesc] = analyzePatterns(lastResults);
  if (patternPred) votes.push(patternPred);
  const taiCount = votes.filter(v => v === "Tài").length;
  const xiuCount = votes.filter(v => v === "Xỉu").length;
  if (taiCount + xiuCount < 4) return null;
  if (taiCount >= xiuCount + 3) return "Tài";
  if (xiuCount >= taiCount + 3) return "Xỉu";
  return null;
}

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

async function predictLogic20(history, logicPerformance, cauLogData) {
  if (history.length < 30) return null;
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
  signals.forEach(signal => {
    const prediction = childPredictions[signal.logic];
    if (prediction !== null && logicPerformance[signal.logic]) {
      const acc = logicPerformance[signal.logic].accuracy;
      const consistency = logicPerformance[signal.logic].consistency;
      if (logicPerformance[signal.logic].total > 3 && acc > 0.35 && consistency > 0.25) {
        const effectiveWeight = signal.baseWeight * ((acc + consistency) / 2);
        if (prediction === "Tài") {
          taiVotes += effectiveWeight;
        } else {
          xiuVotes += effectiveWeight;
        }
      }
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
  const totalWeightedVotes = taiVotes + xiuVotes;
  if (totalWeightedVotes < 1.5) return null;
  if (taiVotes > xiuVotes * 1.08) {
    return "Tài";
  } else if (xiuVotes > taiVotes * 1.08) {
    return "Xỉu";
  }
  return null;
}

// Example Usage Function
function predictAll(history, logicPerformance = {}, cauLogData = []) {
  const lastSession = history[0] || { sid: 0, total: 0 };
  const nextSessionId = lastSession.sid + 1;
  const predictions = {};
  predictions.logic1 = predictLogic1(lastSession, history);
  predictions.logic2 = predictLogic2(nextSessionId, history);
  predictions.logic3 = predictLogic3(history);
  predictions.logic4 = predictLogic4(history);
  predictions.logic5 = predictLogic5(history);
  predictions.logic6 = predictLogic6(lastSession, history);
  predictions.logic7 = predictLogic7(history);
  predictions.logic8 = predictLogic8(history);
  predictions.logic9 = predictLogic9(history);
  predictions.logic10 = predictLogic10(history);
  predictions.logic11 = predictLogic11(history);
  predictions.logic12 = predictLogic12(lastSession, history);
  predictions.logic13 = predictLogic13(history);
  predictions.logic14 = predictLogic14(history);
  predictions.logic15 = predictLogic15(history);
  predictions.logic16 = predictLogic16(history);
  predictions.logic17 = predictLogic17(history);
  predictions.logic18 = predictLogic18(history);
  predictions.logic19 = predictLogic19(history);
  predictions.logic20 = predictLogic20(history, logicPerformance, cauLogData);
  predictions.logic21 = predictLogic21(history);
  predictions.logic22 = predictLogic22(history, cauLogData);
  predictions.logic23 = predictLogic23(history);
  predictions.logic24 = predictLogic24(history);
  return predictions;
}

// =========================================================================
// Phần 2: Logic tổng hợp và API Endpoint
// =========================================================================

// Hàm tổng hợp các dự đoán và tính toán độ tin cậy
const getFinalPredictionAndConfidence = (predictions) => {
    let taiVotes = 0;
    let xiuVotes = 0;
    let totalVotes = 0;

    const voteWeights = {
        'Tài': 1,
        'Xỉu': 1
    };

    // Vòng lặp qua tất cả các dự đoán
    for (const key in predictions) {
        const prediction = predictions[key];
        if (prediction === 'Tài') {
            taiVotes += voteWeights[prediction];
            totalVotes += voteWeights[prediction];
        } else if (prediction === 'Xỉu') {
            xiuVotes += voteWeights[prediction];
            totalVotes += voteWeights[prediction];
        }
    }

    if (totalVotes === 0) {
        return { Du_doan: "Không xác định", Do_tin_cay: "Thấp" };
    }

    const taiRatio = taiVotes / totalVotes;
    const xiuRatio = xiuVotes / totalVotes;

    let finalPrediction = "Không rõ";
    let confidence = "Thấp";

    if (taiRatio > xiuRatio + 0.1) {
        finalPrediction = "Tài";
    } else if (xiuRatio > taiRatio + 0.1) {
        finalPrediction = "Xỉu";
    }

    const maxRatio = Math.max(taiRatio, xiuRatio);
    if (maxRatio >= 0.8) {
        confidence = "Rất cao";
    } else if (maxRatio >= 0.7) {
        confidence = "Cao";
    } else if (maxRatio >= 0.6) {
        confidence = "Trung bình";
    }

    return { Du_doan: finalPrediction, Do_tin_cay: confidence };
};

// API Endpoint
app.get('/api/taixiu-pro', async (req, res) => {
    try {
        const response = await axios.get(SOURCE_API_URL);
        const historyData = response.data;

        if (!historyData || historyData.length === 0) {
            return res.status(500).json({ error: "Không thể lấy dữ liệu từ nguồn." });
        }

        const lastSession = historyData[0];
        const { sid, d1, d2, d3, total, result } = lastSession;

        // Tính toán các giá trị cơ bản
        const Phien_truoc = sid;
        const Xuc_xac = `${d1}-${d2}-${d3}`;
        const Tong = total;
        const Ket_qua = result;
        const Phien_sau = sid + 1;

        // Chạy tất cả các thuật toán
        const allPredictions = predictAll(historyData);

        // Tổng hợp dự đoán và tính độ tin cậy
        const { Du_doan, Do_tin_cay } = getFinalPredictionAndConfidence(allPredictions);

        // Phân tích Pattern
        const last10Results = historyData.slice(0, 10).map(s => s.result === "Tài" ? "T" : "X").join('');
        const Pattern = last10Results;

        const apiResponse = {
            Phien_truoc,
            Xuc_xac,
            Tong,
            Ket_qua,
            Phien_sau,
            Du_doan,
            Do_tin_cay,
            Pattern
        };

        res.json(apiResponse);

    } catch (error) {
        console.error("Lỗi khi xử lý yêu cầu:", error);
        res.status(500).json({ error: "Lỗi nội bộ server." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
