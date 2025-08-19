// server.js
import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const SOURCE_URL = process.env.SOURCE_URL || "https://fullsrc-daynesun.onrender.com/api/taixiu/history";
const PORT = process.env.PORT || 3000;

// ---------- Utils ----------
const toResult = (r, total) => {
  // Chuẩn hoá: trả 'T' cho Tài, 'X' cho Xỉu
  // Quy ước: nếu API có field result (T/TAI/X/XIU) thì dùng; nếu không dùng tổng:
  // Tổng >= 11 => T, else X. (Quy chuẩn Tài/Xỉu cơ bản)
  if (!r && typeof total === "number") {
    return total >= 11 ? "T" : "X";
  }
  if (!r) return null;
  const s = String(r).toUpperCase();
  if (s.includes("T")) return "T";
  if (s.includes("X")) return "X";
  // nếu có số 1/0
  if (s === "1") return "T";
  if (s === "0") return "X";
  return null;
};

const normalizeHistory = (raw) => {
  // Thử map nhiều dạng trả về
  return raw
    .map((item) => {
      // support various keys: session/phien/id ; xuc_xac/dice ; tong/total ; ket_qua/result
      const session = item.session ?? item.phien ?? item.id ?? item.sid ?? item.phien_truoc ?? null;
      const dice = item.dice ?? item.xuc_xac ?? item.xucxac ?? item.xs ?? null;
      const total = Number(item.total ?? item.tong ?? item.sum ?? item.tong_diem ?? item.tong ?? item.tong_diem) || (Array.isArray(dice) ? dice.reduce((a,b) => a + Number(b||0),0) : null);
      const rawResult = item.result ?? item.ket_qua ?? item.kq ?? item.ketqua ?? null;
      const result = toResult(rawResult, total);
      return {
        raw: item,
        session,
        dice,
        total,
        result
      };
    })
    .filter(x => x.session !== null && (x.result === "T" || x.result === "X"));
};

// ---------- Pattern extraction ----------
const buildPattern = (history, limit = 20) => {
  const last = history.slice(-limit);
  return last.map(h => h.result).join("");
};

// ---------- Transition matrix ----------
const buildTransition = (history) => {
  // Count transitions prev -> next
  const counts = { T: { T: 0, X: 0 }, X: { T: 0, X: 0 } };
  for (let i = 0; i < history.length - 1; i++) {
    const a = history[i].result;
    const b = history[i+1].result;
    if ((a === "T" || a === "X") && (b === "T" || b === "X")) counts[a][b]++;
  }
  const probs = {
    T_to_T: counts.T.T / Math.max(1, (counts.T.T + counts.T.X)),
    T_to_X: counts.T.X / Math.max(1, (counts.T.T + counts.T.X)),
    X_to_T: counts.X.T / Math.max(1, (counts.X.T + counts.X.X)),
    X_to_X: counts.X.X / Math.max(1, (counts.X.T + counts.X.X)),
  };
  return { counts, probs };
};

// ---------- Simple feature extraction ----------
const extractFeatures = (history) => {
  const n = history.length;
  const last = history.slice(-1)[0];
  const last5 = history.slice(-5);
  const last10 = history.slice(-10);
  const freq = (arr) => {
    const t = arr.filter(x => x.result === "T").length;
    const x = arr.filter(x => x.result === "X").length;
    return { T: t, X: x, pT: t/Math.max(1, arr.length), pX: x/Math.max(1, arr.length) };
  };
  const runs = (() => {
    let maxRun = 0, currRun = 1, currVal = null;
    for (let i = 0; i < history.length; i++) {
      if (i === 0) { currVal = history[i].result; currRun = 1; }
      else {
        if (history[i].result === currVal) { currRun++; }
        else { maxRun = Math.max(maxRun, currRun); currVal = history[i].result; currRun = 1; }
      }
    }
    maxRun = Math.max(maxRun, currRun);
    // current ongoing run length:
    let ongoing = 1;
    for (let i = history.length - 1; i > 0; i--) {
      if (history[i].result === history[i-1].result) ongoing++;
      else break;
    }
    return { maxRun, ongoing, last: history.length>0?history[history.length-1].result:null };
  })();

  return {
    n,
    lastResult: last ? last.result : null,
    freq5: freq(last5),
    freq10: freq(last10),
    freqAll: freq(history),
    runs
  };
};

// ---------- Deterministic ensemble predictor ----------
const deterministicPredict = (history) => {
  // Require some minimum history
  if (history.length < 8) {
    // fallback deterministic: use recent majority
    const f = extractFeatures(history);
    const guess = f.freqAll.pT >= 0.5 ? "T" : "X";
    return { guess, score: Math.max(f.freqAll.pT, f.freqAll.pX), explanation: "Thiếu dữ liệu: dùng tỷ lệ toàn bộ lịch sử." };
  }

  const trans = buildTransition(history);
  const feat = extractFeatures(history);
  const pattern = buildPattern(history, 20);

  // Heuristics (deterministic):
  // 1) Markov: P(next = T | last) from trans.probs
  const last = feat.lastResult;
  const p_markov_T = last === "T" ? trans.probs.T_to_T : trans.probs.X_to_T;
  const p_markov_X = 1 - p_markov_T;

  // 2) Recent frequency: proportion in last 5 and last 10
  const p_recent_T = 0.6 * feat.freq5.pT + 0.4 * feat.freq10.pT;
  const p_recent_X = 1 - p_recent_T;

  // 3) Run bias: if ongoing run length >=3, bias to flip (simple contrarian heuristic)
  let p_run_T = 0.5;
  if (feat.runs.ongoing >= 3) {
    // If current run is TTT -> bias towards X (flip)
    p_run_T = feat.runs.last === "T" ? 0.22 : 0.78;
  }

  // 4) Pattern match: if we find specific repeating pattern that historically preceded flips, boost accordingly
  // Deterministic: search last 6 pattern occurrences and check next-result frequency
  const patternBoost = (() => {
    const seq = history.map(h => h.result).join("");
    const window = 6;
    const target = seq.slice(-window);
    if (target.length < 3) return 0.5;
    // count occurrences of target in seq (excluding last occurrence), and of what followed them
    let count = 0, followedT = 0;
    for (let i = 0; i + target.length < seq.length - target.length; i++) {
      if (seq.slice(i, i + target.length) === target) {
        count++;
        const nextChar = seq[i + target.length];
        if (nextChar === "T") followedT++;
      }
    }
    if (count === 0) return 0.5;
    return followedT / count;
  })();

  // 5) Parity/total heuristic if totals provided — if last total exists and is extreme pushes to certain side
  const lastTotal = history.slice(-1)[0]?.total ?? null;
  let p_total_T = 0.5;
  if (typeof lastTotal === "number") {
    // deterministic mapping: totals 4-6/15-17 more extreme -> slightly push
    if (lastTotal <= 6) p_total_T = 0.35;
    else if (lastTotal >= 15) p_total_T = 0.65;
    else p_total_T = lastTotal >= 11 ? 0.6 : 0.4;
  }

  // Combine with fixed deterministic weights (can be adapted by backtest)
  const weights = {
    markov: 0.30,
    recent: 0.28,
    run: 0.12,
    pattern: 0.18,
    total: 0.12
  };

  const scoreT = p_markov_T * weights.markov
               + p_recent_T * weights.recent
               + p_run_T * weights.run
               + patternBoost * weights.pattern
               + p_total_T * weights.total;

  const scoreX = 1 - scoreT;
  const guess = scoreT >= scoreX ? "T" : "X";
  const score = Math.max(scoreT, scoreX); // confidence-like internal score (0.5..1)

  // Build explanation deterministically
  const explanationParts = [];
  explanationParts.push(`Markov P(T|last="${last}")=${(p_markov_T).toFixed(3)}`);
  explanationParts.push(`Recent5 pT=${(feat.freq5.pT).toFixed(3)}, Recent10 pT=${(feat.freq10.pT).toFixed(3)}`);
  explanationParts.push(`Ongoing run=${feat.runs.ongoing} (last=${feat.runs.last}) => run-bias pT=${p_run_T.toFixed(3)}`);
  explanationParts.push(`Pattern match score=${patternBoost.toFixed(3)}`);
  if (lastTotal !== null) explanationParts.push(`Last total=${lastTotal} => total-heuristic pT=${p_total_T.toFixed(3)}`);

  return {
    guess,
    score: Number(score.toFixed(4)),
    breakdown: { p_markov_T: Number(p_markov_T.toFixed(4)), p_recent_T: Number(p_recent_T.toFixed(4)), p_run_T: Number(p_run_T.toFixed(4)), patternBoost: Number(patternBoost.toFixed(4)), p_total_T: Number(p_total_T.toFixed(4)) },
    explanation: explanationParts.join("; ")
  };
};

// ---------- Backtest (deterministic simulation) ----------
const backtestPredictor = (history, maxWindow = 200) => {
  // We'll do an incremental simulation using only past data up to i to predict i+1
  const n = history.length;
  const limit = Math.min(n, maxWindow);
  if (limit < 12) return { accuracy: null, trials: 0, details: [] };

  const start = n - limit;
  let correct = 0, trials = 0;
  const details = [];
  // For each index i from start .. n-2 predict next using history[0..i]
  for (let i = start; i < n - 1; i++) {
    const train = history.slice(0, i + 1); // include i
    const actualNext = history[i + 1].result;
    const predObj = deterministicPredict(train);
    const pred = predObj.guess;
    trials++;
    if (pred === actualNext) correct++;
    details.push({ session: history[i+1].session, predicted: pred, actual: actualNext, score: predObj.score, explanation: predObj.explanation });
  }
  const accuracy = trials > 0 ? (correct / trials) : null;
  return { accuracy: accuracy !== null ? Number(accuracy.toFixed(4)) : null, trials, details };
};

// ---------- Main endpoint ----------
app.get("/predict", async (req, res) => {
  try {
    const resp = await axios.get(SOURCE_URL, { timeout: 9000 });
    const raw = resp.data;
    if (!Array.isArray(raw)) {
      return res.status(500).json({ error: "Unexpected data format from source API", rawSample: raw?.slice?.(0,3) ?? null });
    }

    const history = normalizeHistory(raw);
    if (history.length === 0) return res.status(500).json({ error: "No usable history entries found (result normalization failed)." });

    // compute basic last entry
    const lastEntry = history[history.length - 1];
    const phien = lastEntry.session;
    const xuc_xac = lastEntry.dice ?? null;
    const tong = typeof lastEntry.total === "number" ? lastEntry.total : null;
    const ket_qua = lastEntry.result; // T or X
    const phien_sau = (typeof phien === "number") ? phien + 1 : String(phien) + "+1";

    // pattern (last 20)
    const pattern = buildPattern(history, 20);

    // Deterministic prediction
    const pred = deterministicPredict(history);

    // Backtest to compute do_tin_cay
    const bt = backtestPredictor(history, 300);
    const do_tin_cay = bt.accuracy !== null ? Number(bt.accuracy.toFixed(4)) : null;

    // Compose giai_thich (explain)
    const giai_thich = [
      `Dự đoán dựa trên ensemble: markov + recent freq + run-bias + pattern-matching + total-heuristic.`,
      `Breakdown nội bộ: ${JSON.stringify(pred.breakdown)}`,
      `Backtest trên ${bt.trials} phiên gần nhất => accuracy=${do_tin_cay}`,
      `Pattern(20): ${pattern}`
    ].join(" | ");

    const response = {
      phien,
      xuc_xac,
      tong,
      ket_qua,
      phien_sau,
      du_doan: pred.guess,
      do_tin_cay,
      pattern,
      giai_thich,
      internal: {
        score: pred.score,
        explanation: pred.explanation,
        backtestDetailsCount: bt.details.length
      }
    };

    return res.json(response);
  } catch (err) {
    console.error("Predict error:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch or process source API", detail: err?.message || String(err) });
  }
});

app.get("/", (req, res) => {
  res.json({ ok: true, info: "ĐẦU BUỒI TOOL API IB @ADM_VANNHAT" });
});

app.listen(PORT, () => console.log(`TaiXiu predictor running on port ${PORT}`));
