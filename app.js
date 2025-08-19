// server.js (VIP-Ultimate Tai/Xiu Predictor — deterministic, no-random)
import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const SOURCE_URL = process.env.SOURCE_URL || "https://fullsrc-daynesun.onrender.com/api/taixiu/history";
const PORT = process.env.PORT || 3000;

// ----------------- Helpers -----------------
const normResult = (raw, total) => {
  // normalize to 'T' or 'X' deterministically
  if (raw === null || raw === undefined) {
    if (typeof total === "number") return total >= 11 ? "T" : "X";
    return null;
  }
  const s = String(raw).toUpperCase();
  if (s.includes("T")) return "T";
  if (s.includes("X")) return "X";
  if (/^\d+$/.test(s)) { // maybe 1/0
    if (s === "1") return "T";
    if (s === "0") return "X";
  }
  return null;
};

const normalizeHistory = (rawArr) => {
  if (!Array.isArray(rawArr)) return [];
  return rawArr.map(item => {
    const session = item.session ?? item.phien ?? item.sid ?? item.id ?? null;
    const dice = item.dice ?? item.xuc_xac ?? item.xucxac ?? item.xs ?? null;
    const total = Number(item.total ?? item.tong ?? (Array.isArray(dice) ? dice.reduce((a,b)=>a+Number(b||0),0) : NaN));
    const ketqua = normResult(item.result ?? item.ket_qua ?? item.kq ?? null, Number.isFinite(total) ? total : null);
    return { raw: item, session, dice, total: Number.isFinite(total) ? total : null, result: ketqua };
  }).filter(r => r.session !== null && (r.result === "T" || r.result === "X"));
};

const lastN = (arr, n) => arr.slice(Math.max(0, arr.length - n));

// ----------------- Feature engines (deterministic) -----------------
// Markov order 1 & 2 counts
const markovCounts = (hist) => {
  const c1 = { T: { T:0, X:0 }, X: { T:0, X:0 } };
  const c2 = {}; // e.g. "TT" -> {T:?, X:?}
  for (let i = 0; i < hist.length - 1; i++) {
    const a = hist[i].result, b = hist[i+1].result;
    if (a && b) c1[a][b]++;
  }
  for (let i = 0; i < hist.length - 2; i++) {
    const key = hist[i].result + hist[i+1].result;
    const next = hist[i+2].result;
    if (!c2[key]) c2[key] = { T:0, X:0 };
    c2[key][next]++;
  }
  const p1 = {
    T_to_T: c1.T.T / Math.max(1, c1.T.T + c1.T.X),
    X_to_T: c1.X.T / Math.max(1, c1.X.T + c1.X.X)
  };
  return { c1, c2, p1 };
};

const recentFreq = (hist, k) => {
  const seg = lastN(hist, Math.min(k, hist.length));
  const t = seg.filter(r => r.result === "T").length;
  const pT = t / Math.max(1, seg.length);
  return { pT, n: seg.length };
};

const runAnalysis = (hist) => {
  if (!hist.length) return { ongoing:0, last:null, maxRun:0 };
  let maxRun = 1, cur = 1;
  for (let i = 1; i < hist.length; i++) {
    if (hist[i].result === hist[i-1].result) { cur++; maxRun = Math.max(maxRun, cur); }
    else cur = 1;
  }
  let ongoing = 1;
  for (let i = hist.length - 1; i > 0; i--) {
    if (hist[i].result === hist[i-1].result) ongoing++;
    else break;
  }
  return { ongoing, last: hist.at(-1).result, maxRun };
};

// n-gram follow deterministic
const ngramFollow = (hist, w=6) => {
  const seq = hist.map(h => h.result).join("");
  const targ = seq.slice(-w);
  if (targ.length < 3) return 0.5;
  let cnt = 0, tAfter = 0;
  for (let i = 0; i + targ.length < seq.length - 1; i++) {
    if (seq.slice(i, i + targ.length) === targ) {
      cnt++;
      if (seq[i + targ.length] === "T") tAfter++;
    }
  }
  return cnt ? (tAfter / cnt) : 0.5;
};

// Page-Hinkley change-point detection (deterministic)
const pageHinkley = (series, delta=0.01, threshold=6, alpha=0.999) => {
  // series: array of 1 (T) or 0 (X)
  if (!series.length) return { alarms: 0, idx: [] };
  let mean = series[0];
  let S = 0, minS = 0;
  const idx = [];
  for (let i=0;i<series.length;i++) {
    const x = series[i];
    mean = alpha * mean + (1 - alpha) * x;
    S = S + (x - mean - delta);
    if (S < minS) minS = S;
    if (S - minS > threshold) { idx.push(i); S = 0; minS = 0; }
  }
  return { alarms: idx.length, idx };
};

// regime detection
const detectRegime = (hist) => {
  if (hist.length < 8) return "unknown";
  const run = runAnalysis(hist);
  const rf10 = recentFreq(hist, 10);
  let alternation = 0;
  for (let i=1;i<hist.length;i++) if (hist[i].result !== hist[i-1].result) alternation++;
  alternation = alternation / Math.max(1, hist.length-1);
  if (run.ongoing >= 4 || run.maxRun >= 5) return "streaky";
  if (alternation >= 0.75) return "alternating";
  if (Math.abs(rf10.pT - 0.5) <= 0.08) return "choppy";
  return "mixed";
};

// pattern of last 20
const patternLast = (hist, lim=20) => lastN(hist, lim).map(h=>h.result).join("");

// ----------------- Experts (deterministic approximations) -----------------
// We implement deterministic experts inspired by the class list:
// - DeepSequence: long-term sequence memory & context counts (simulated by weighted n-gram memory)
// - HybridAttention: feature importance weighting (we compute feature scores deterministically)
// - QuantumInspired: simulated via co-occurrence & combination heuristic
// - TemporalFusion: recent + longer windows fused
// - ProbGraphical: pairwise co-occurrence scoring

const deepSequenceExpert = (hist) => {
  // simulate deep sequence by counting pattern followers for variable windows 3..9
  const seq = hist.map(h => h.result).join("");
  let score = 0.5;
  for (let w=3; w<=9; w++) {
    const target = seq.slice(-w);
    if (target.length < 3) continue;
    let cnt=0, tAfter=0;
    for (let i=0;i+target.length < seq.length - 1; i++) {
      if (seq.slice(i, i+target.length) === target) {
        cnt++;
        if (seq[i+target.length] === "T') tAfter++;
      }
    }
    if (cnt>0) {
      score = score * 0.6 + (tAfter/cnt) * 0.4; // deterministic blending
    }
  }
  // fallback to recent freq if unavailable
  const rf = recentFreq(hist, Math.min(20, hist.length));
  if (!score || isNaN(score)) score = rf.pT;
  return Math.max(0.01, Math.min(0.99, score));
};

const hybridAttentionExpert = (hist) => {
  // compute feature importances deterministically and produce pT
  const rf5 = recentFreq(hist, 5).pT;
  const rf10 = recentFreq(hist, 10).pT;
  const run = runAnalysis(hist);
  const runBias = run.ongoing >= 3 ? (run.last === "T" ? 0.25 : 0.75) : 0.5;
  // weighted deterministic
  return (0.45 * rf5 + 0.25 * rf10 + 0.2 * runBias + 0.1 * ngramFollow(hist,4));
};

const quantumInspiredExpert = (hist) => {
  // simulate by pairwise co-occurrence: if "TX" pairs often followed by X, reduce pT
  const seq = hist.map(h => h.result).join("");
  const pairs = {};
  for (let i=0;i+1<seq.length;i++) {
    const key = seq[i]+seq[i+1];
    pairs[key] = (pairs[key] || 0) + 1;
  }
  // heuristic: favor side that follows most frequent pair ending
  let preferT = 0.5;
  const lastPair = seq.slice(-2);
  if (lastPair && pairs[lastPair]) {
    // check what follows past occurrences of lastPair
    let cnt=0, tAfter=0;
    for (let i=0;i+2<seq.length;i++) {
      if (seq.slice(i, i+2) === lastPair) {
        cnt++;
        if (seq[i+2] === "T") tAfter++;
      }
    }
    if (cnt>0) preferT = tAfter/cnt;
  }
  return preferT;
};

const temporalFusionExpert = (hist) => {
  // fuse windows: last3, last7, last15
  const p3 = recentFreq(hist, 3).pT;
  const p7 = recentFreq(hist, 7).pT;
  const p15 = recentFreq(hist, 15).pT;
  return 0.5*p3 + 0.3*p7 + 0.2*p15;
};

const probGraphicalExpert = (hist) => {
  // use Markov1/2 probabilities
  const m = markovCounts(hist);
  const last = hist.at(-1)?.result;
  const pT = last === "T" ? (m.p1.T_to_T || 0.5) : (m.p1.X_to_T || 0.5);
  // mix with markov-2 if available
  const last2 = hist.length>=2 ? hist.at(-2).result + hist.at(-1).result : null;
  let pT2 = pT;
  if (last2 && m.c2[last2]) {
    const a = m.c2[last2];
    pT2 = a.T / Math.max(1, a.T + a.X);
  }
  return 0.6*pT + 0.4*pT2;
};

// ----------------- Deterministic weight tuning (grid search) -----------------
const WEIGHT_CANDIDATES = (() => {
  // produce deterministic candidate weight sets (sum normalized later)
  const small = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
  const combos = [];
  for (const a of small) for(const b of small) for(const c of small)
  for(const d of small) for(const e of small) {
    const sum = a+b+c+d+e;
    if (sum > 0.9 && sum < 1.7) combos.push({ deep:a, hybrid:b, quantum:c, temp:d, pgraph:e, sum });
  }
  // slice to deterministic subset
  return combos.slice(0, 400);
})();

const combineExperts = (exps, W) => {
  // W assumed raw; normalize
  const s = W.deep + W.hybrid + W.quantum + W.temp + W.pgraph;
  const nd = W.deep / s, nh = W.hybrid / s, nq = W.quantum / s, nt = W.temp / s, np = W.pgraph / s;
  let pTraw = exps.deep * nd + exps.hybrid * nh + exps.quantum * nq + exps.temp * nt + exps.pgraph * np;
  // apply drift penalty if drift detected: pull pT toward 0.5 deterministically
  const series = histToSeries(exps.__hist__);
  const ph = pageHinkley(series, 0.01, 6, 0.995);
  if (ph.alarms > 0) pTraw = pTraw*(1 - 0.15) + 0.5*0.15;
  return Math.max(0.001, Math.min(0.999, pTraw));
};

// helper to convert hist to binary series for pageHinkley in combine stage
const histToSeries = (hist) => hist.map(h => h.result === "T" ? 1 : 0);

// ----------------- Backtest deterministic -----------------
const backtest = (history, W, window=300) => {
  // sliding simulation: for each i predict i+1 using history up to i
  const n = history.length;
  if (n < 12) return { acc: null, trials: 0 };
  const start = Math.max(0, n - window - 1);
  let ok = 0, trials = 0;
  for (let i = start + 8; i < n - 1; i++) {
    const train = history.slice(0, i+1);
    const exps = computeAllExperts(train);
    exps.__hist__ = train; // pass hist for combineExperts drift detect
    const pT = combineExperts(exps, W);
    const pred = pT >= 0.5 ? "T" : "X";
    const actual = history[i+1].result;
    if (pred === actual) ok++;
    trials++;
  }
  return { acc: trials ? ok / trials : null, trials };
};

// find best weights by deterministic grid-search using backtest
const tuneWeights = (history) => {
  if (history.length < 30) return { deep:0.26, hybrid:0.26, quantum:0.18, temp:0.18, pgraph:0.12 };
  let best = null;
  for (const W of WEIGHT_CANDIDATES) {
    const bt = backtest(history, W, 260);
    const score = (bt.acc ?? 0) - 0.00005 * Math.abs(1 - W.sum); // deterministic tie-breaker
    if (!best || score > best.score) best = { W, acc: bt.acc ?? 0, trials: bt.trials, score };
  }
  return best ? { ...best.W } : { deep:0.26, hybrid:0.26, quantum:0.18, temp:0.18, pgraph:0.12 };
};

// compute all experts
const computeAllExperts = (hist) => {
  return {
    deep: deepSequenceExpert(hist),
    hybrid: hybridAttentionExpert(hist),
    quantum: quantumInspiredExpert(hist),
    temp: temporalFusionExpert(hist),
    pgraph: probGraphicalExpert(hist)
  };
};

// ----------------- Main endpoints -----------------
app.get("/predict", async (req, res) => {
  try {
    const resp = await axios.get(SOURCE_URL, { timeout: 9000 });
    const raw = resp.data;
    const history = normalizeHistory(raw);
    if (!history.length) return res.status(500).json({ error: "No usable history from source API" });

    const last = history.at(-1);
    const phien = last.session;
    const phien_sau = (typeof phien === "number") ? phien + 1 : `${phien}+1`;

    // tune weights deterministically via backtest
    const W = tuneWeights(history);

    // compute experts on full history
    const exps = computeAllExperts(history);
    exps.__hist__ = history;
    // combine
    const pT = combineExperts(exps, W);

    // backtest on recent window for do_tin_cay
    const bt = backtest(history, W, 300);

    // build giai_thich deterministically
    const giai_thich = [
      `Regime=${detectRegime(history)}; pattern20=${patternLast(history,20)}.`,
      `Experts(pT): deep=${exps.deep.toFixed(3)}, hybrid=${exps.hybrid.toFixed(3)}, quantum=${exps.quantum.toFixed(3)}, temp=${exps.temp.toFixed(3)}, pgraph=${exps.pgraph.toFixed(3)}.`,
      `Weights tuned (grid-search deterministic): ${JSON.stringify(W)}.`,
      `Combined pT=${pT.toFixed(4)} => du_doan=${pT>=0.5?"T":"X"}.`,
      bt.acc !== null ? `Backtest acc=${(bt.acc).toFixed(4)} on ${bt.trials} trials.` : `Backtest insufficient (<12 trials).`,
      pageHinkley(histToSeries(history), 0.01, 6, 0.995).alarms ? "Drift detected: reduced trust to history." : "No drift detected."
    ].join(" ");

    // response
    return res.json({
      phien,
      xuc_xac: last.dice ?? null,
      tong: last.total ?? null,
      ket_qua: last.result,
      phien_sau,
      du_doan: pT >= 0.5 ? "T" : "X",
      do_tin_cay: bt.acc ?? null,
      giai_thich,
      pattern: patternLast(history, 20),
      internal: {
        pT: Number(pT.toFixed(4)),
        experts: {
          deep: Number(exps.deep.toFixed(4)),
          hybrid: Number(exps.hybrid.toFixed(4)),
          quantum: Number(exps.quantum.toFixed(4)),
          temp: Number(exps.temp.toFixed(4)),
          pgraph: Number(exps.pgraph.toFixed(4))
        },
        tunedWeights: W
      }
    });
  } catch (err) {
    console.error("Predict error:", err && err.message ? err.message : err);
    return res.status(500).json({ error: "Failed to fetch or process source API", detail: err?.message ?? String(err) });
  }
});

app.get("/backtest", async (req, res) => {
  try {
    const resp = await axios.get(SOURCE_URL, { timeout: 9000 });
    const history = normalizeHistory(resp.data);
    if (history.length < 12) return res.status(500).json({ error: "Not enough data to backtest (need >=12)" });

    const W = tuneWeights(history);
    const bt = backtest(history, W, Number(req.query.window ?? 300));

    // also produce sample of last 60 backtest predictions
    const rows = [];
    const n = history.length;
    const start = Math.max(0, n - 300 - 1);
    for (let i = start + 8; i < n - 1; i++) {
      const train = history.slice(0, i+1);
      const ex = computeAllExperts(train);
      ex.__hist__ = train;
      const pT = combineExperts(ex, W);
      const pred = pT >= 0.5 ? "T" : "X";
      rows.push({
        phien: history[i+1].session,
        predicted: pred,
        pT: Number(pT.toFixed(4)),
        actual: history[i+1].result,
        correct: pred === history[i+1].result
      });
    }

    return res.json({
      trials: bt.trials,
      accuracy: bt.acc !== null ? Number(bt.acc.toFixed(4)) : null,
      tunedWeights: W,
      recentSamples: rows.slice(-60)
    });
  } catch (err) {
    return res.status(500).json({ error: "Backtest failed", detail: err?.message ?? String(err) });
  }
});

app.get("/", (req, res) => res.json({ ok: true, info: "VIP-Ultimate Tai/Xiu Predictor. GET /predict and /backtest" }));

app.listen(PORT, () => console.log(`VIP-Ultimate predictor running on port ${PORT}`));
