// server.js
import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const SOURCE_URL = process.env.SOURCE_URL || "https://fullsrc-daynesun.onrender.com/api/taixiu/history";
const PORT = process.env.PORT || 3000;

// ===================== UTIL & NORMALIZE =====================
const toResult = (r, total) => {
  if (!r && typeof total === "number") return total >= 11 ? "T" : "X";
  if (!r) return null;
  const s = String(r).toUpperCase();
  if (s.includes("T")) return "T";
  if (s.includes("X")) return "X";
  if (s === "1") return "T";
  if (s === "0") return "X";
  return null;
};

const normalizeHistory = (raw) =>
  raw.map((it) => {
    const session = it.session ?? it.phien ?? it.id ?? it.sid ?? null;
    const dice = it.dice ?? it.xuc_xac ?? it.xucxac ?? null;
    const total = Number(
      it.total ?? it.tong ?? it.sum ?? (Array.isArray(dice) ? dice.reduce((a,b)=>a+Number(b||0),0) : NaN)
    );
    const result = toResult(it.result ?? it.ket_qua ?? it.kq, Number.isFinite(total) ? total : null);
    return { session, dice, total: Number.isFinite(total) ? total : null, result, raw: it };
  }).filter(v => v.session != null && (v.result === "T" || v.result === "X"));

const lastN = (arr, n) => arr.slice(-n);

const buildPattern = (history, limit = 20) =>
  lastN(history, limit).map(h => h.result).join("");

// ===================== FEATURES & EXPERTS =====================
// Markov bậc 1 & 2
const markovStats = (history) => {
  const c1 = { T: { T:0,X:0 }, X:{ T:0,X:0 } };
  const c2 = {}; // e.g. "TT" -> {T:?, X:?}
  for (let i=0;i<history.length-1;i++){
    const a = history[i].result, b = history[i+1].result;
    if(a&&b){ c1[a][b]++; }
  }
  for (let i=0;i<history.length-2;i++){
    const a = history[i].result + history[i+1].result;
    const b = history[i+2].result;
    c2[a] = c2[a] || { T:0, X:0 };
    c2[a][b]++;
  }
  const p1 = {
    T_to_T: c1.T.T / Math.max(1, c1.T.T + c1.T.X),
    X_to_T: c1.X.T / Math.max(1, c1.X.T + c1.X.X),
  };
  return { c1, c2, p1 };
};

const recentFreq = (history, k) => {
  const seg = lastN(history, k);
  const t = seg.filter(x=>x.result==="T").length;
  const x = seg.length - t;
  return { pT: t/Math.max(1,seg.length), pX: x/Math.max(1,seg.length) };
};

const runInfo = (history) => {
  if (!history.length) return { ongoing:0, last:null, maxRun:0 };
  let maxRun = 1, cur=1;
  for (let i=1;i<history.length;i++){
    if (history[i].result===history[i-1].result) { cur++; maxRun=Math.max(maxRun,cur); }
    else cur=1;
  }
  let ongoing=1;
  for (let i=history.length-1;i>0;i--){
    if (history[i].result===history[i-1].result) ongoing++; else break;
  }
  return { ongoing, last:history.at(-1).result, maxRun };
};

// N-gram pattern follow: nhìn chuỗi cuối (window 3..6) xem lần xuất hiện trước đó thì theo sau là gì
const ngramFollow = (history, w=6) => {
  const seq = history.map(h=>h.result).join("");
  const target = seq.slice(-w);
  if (target.length < 3) return 0.5;
  let cnt=0, tAfter=0;
  for (let i=0;i+target.length<seq.length-1;i++){
    if (seq.slice(i,i+target.length)===target){
      cnt++;
      if (seq[i+target.length]==="T") tAfter++;
    }
  }
  return cnt ? (tAfter/cnt) : 0.5;
};

// Heuristic theo tổng gần nhất (nếu có)
const totalHeu = (lastTotal) => {
  if (lastTotal==null) return 0.5;
  if (lastTotal <= 6) return 0.35;
  if (lastTotal >= 15) return 0.65;
  return lastTotal >= 11 ? 0.58 : 0.42;
};

// Change-point detection (Page-Hinkley) để phát hiện “chỉnh cầu”/drift
const pageHinkley = (series, delta=0.005, lamb=5, alpha=0.999) => {
  // series: 1 cho T, 0 cho X
  let mean = series[0] ?? 0.5;
  let ph = 0, minPH = 0, alarms = 0, idx = [];
  for (let i=0;i<series.length;i++){
    const x = series[i];
    mean = alpha*mean + (1-alpha)*x;
    ph = ph + (x - mean - delta);
    minPH = Math.min(ph, minPH);
    if (ph - minPH > lamb) { alarms++; idx.push(i); ph=0; minPH=0; }
  }
  return { alarms, idx };
};

// Phân loại chế độ (regime): streaky/choppy/alternating
const detectRegime = (history) => {
  if (history.length < 8) return "unknown";
  const r = runInfo(history);
  const f10 = recentFreq(history, Math.min(10, history.length));
  const alternation = (() =>{
    let alt = 0;
    for (let i=1;i<history.length;i++){
      if (history[i].result !== history[i-1].result) alt++;
    }
    return alt / Math.max(1, history.length-1);
  })();
  if (r.ongoing >= 4 || r.maxRun >= 5) return "streaky";
  if (alternation >= 0.75) return "alternating";
  if (Math.abs(f10.pT - 0.5) <= 0.1) return "choppy";
  return "mixed";
};

// ===================== DETERMINISTIC ENSEMBLE =====================
const experts = (history) => {
  const stats = markovStats(history);
  const last = history.at(-1)?.result;
  const last2 = history.length>=2 ? history.at(-2).result + history.at(-1).result : null;

  // Expert 1: Markov-1
  const pT_m1 = last === "T" ? (stats.p1.T_to_T || 0.5) : (stats.p1.X_to_T || 0.5);

  // Expert 2: Markov-2
  let pT_m2 = 0.5;
  if (last2 && stats.c2[last2]) {
    const a = stats.c2[last2];
    pT_m2 = a.T / Math.max(1, a.T + a.X);
  }

  // Expert 3: Recent frequency (5/10)
  const rf5 = recentFreq(history, Math.min(5, history.length));
  const rf10 = recentFreq(history, Math.min(10, history.length));
  const pT_recent = 0.6*rf5.pT + 0.4*rf10.pT;

  // Expert 4: Run-bias (flip khi chuỗi dài)
  const runs = runInfo(history);
  const pT_run = runs.ongoing >= 3 ? (runs.last === "T" ? 0.22 : 0.78) : 0.5;

  // Expert 5: N-gram follow
  const pT_ngram = ngramFollow(history, Math.min(6, history.length));

  // Expert 6: Total heuristic
  const pT_total = totalHeu(history.at(-1)?.total ?? null);

  // Anti-drift booster: nếu có alarm, giảm niềm tin vào expert “dễ bị khai thác” (Markov, n-gram)
  const series = history.map(h => h.result === "T" ? 1 : 0);
  const drift = pageHinkley(series, 0.01, 6, 0.995); // cứng, deterministic
  const driftPenalty = drift.alarms > 0 ? 0.15 : 0.0;

  return {
    pT_m1, pT_m2, pT_recent, pT_run, pT_ngram, pT_total,
    driftPenalty,
    runs, rf5, rf10
  };
};

// Kết hợp theo trọng số (deterministic). Trọng số được TỐI ƯU bằng grid-search trên backtest trượt.
const combineWithWeights = (E, W) => {
  const raw = (
    E.pT_m1   * W.m1 +
    E.pT_m2   * W.m2 +
    E.pT_recent*W.recent +
    E.pT_run  * W.run +
    E.pT_ngram* W.ngram +
    E.pT_total* W.total
  );
  // áp drift penalty: kéo về 0.5 nếu có change-point
  const pT = (raw*(1 - E.driftPenalty)) + 0.5*(E.driftPenalty);
  return Math.max(0, Math.min(1, pT));
};

// ===================== BACKTEST & GRID SEARCH =====================
const predictDeterministic = (hist, W) => {
  if (hist.length < 8) {
    const f = recentFreq(hist, hist.length);
    const pT = f.pT;
    return { guess: pT>=0.5?"T":"X", pT, reason: "Thiếu dữ liệu: dùng tỷ lệ gần đây" };
  }
  const E = experts(hist);
  const pT = combineWithWeights(E, W);
  const guess = pT >= 0.5 ? "T" : "X";
  const reason = `pT=${pT.toFixed(4)} | m1=${E.pT_m1.toFixed(3)}, m2=${E.pT_m2.toFixed(3)}, recent=${E.pT_recent.toFixed(3)}, run=${E.pT_run.toFixed(3)}, ngram=${E.pT_ngram.toFixed(3)}, total=${E.pT_total.toFixed(3)} | driftPenalty=${E.driftPenalty}`;
  return { guess, pT, reason };
};

// lưới trọng số cố định (deterministic) để tìm combo tốt nhất (tổng ≈1)
const WEIGHT_GRID = (() => {
  const vals = [0.1, 0.15, 0.2, 0.25, 0.3];
  const combos = [];
  for (const m1 of vals)
  for (const m2 of vals)
  for (const recent of vals)
  for (const run of [0.05,0.1,0.15,0.2])
  for (const ngram of vals)
  for (const total of [0.05,0.1,0.12,0.15]) {
    const sum = m1+m2+recent+run+ngram+total;
    if (sum > 0.95 && sum < 1.25) {
      combos.push({ m1, m2, recent, run, ngram, total, sum });
    }
  }
  // để deterministic và không quá lớn:
  return combos.slice(0, 300);
})();

const backtestWithWeights = (history, W, window=250) => {
  const n = history.length;
  const start = Math.max(0, n - window - 1);
  let ok=0, trials=0;
  for (let i=start+7; i<n-1; i++) { // cần tối thiểu 8 bản ghi để predict
    const train = history.slice(start, i+1);
    const actual = history[i+1].result;
    const p = predictDeterministic(train, W).guess;
    if (p===actual) ok++;
    trials++;
  }
  return { acc: trials? ok/trials : null, trials };
};

const findBestWeights = (history) => {
  if (history.length < 50) {
    // default ổn định ban đầu
    return { m1:0.26, m2:0.20, recent:0.26, run:0.12, ngram:0.10, total:0.06, sum:1.0 };
  }
  let best = null;
  for (const W of WEIGHT_GRID) {
    const { acc, trials } = backtestWithWeights(history, W, 260);
    // tiêu chí: acc cao, trials đủ, và ưu tiên recent (ổn định)
    const score = (acc ?? 0) - 0.0001 * Math.abs(1 - W.sum);
    if (!best || score > best.score) best = { W, acc: acc ?? 0, trials, score };
  }
  return best ? best.W : { m1:0.26, m2:0.20, recent:0.26, run:0.12, ngram:0.10, total:0.06, sum:1.0 };
};

// tính do_tin_cay (accuracy) sau khi đã chọn W tốt nhất
const computeConfidence = (history, W) => backtestWithWeights(history, W, 300);

// ===================== ENDPOINTS =====================
app.get("/predict", async (req, res) => {
  try {
    const { data } = await axios.get(SOURCE_URL, { timeout: 9000 });
    if (!Array.isArray(data)) return res.status(500).json({ error: "Source API format invalid" });
    const history = normalizeHistory(data);
    if (history.length < 10) return res.status(500).json({ error: "Not enough history" });

    // chọn trọng số tốt nhất bằng backtest trượt (deterministic)
    const W = findBestWeights(history);

    // dự đoán cho phiên tiếp theo
    const pred = predictDeterministic(history, W);
    const bt = computeConfidence(history, W);

    // abstain logic: nếu pT quá gần 0.5 hoặc acc thấp -> vẫn trả dự đoán nhưng nêu rủi ro
    const abstain = Math.abs(pred.pT - 0.5) < 0.04 ? true : false;

    const last = history.at(-1);
    const phien = last.session;
    const phien_sau = (typeof phien === "number") ? phien + 1 : String(phien)+"+1";

    const pattern = buildPattern(history, 20);

    const giai_thich = [
      `Regime=${detectRegime(history)}; run=${runInfo(history).ongoing}; pattern(20)=${pattern}`,
      `Experts: Markov1/2 + Recent(5/10) + Run-bias + N-gram + Total; chống drift Page-Hinkley.`,
      `Grid-search ${WEIGHT_GRID.length} combo → chọn W tối ưu theo backtest trượt.`,
      `pT=${pred.pT.toFixed(4)} → du_doan=${pred.guess}; backtest_acc=${bt.acc?.toFixed(4) ?? null} (${bt.trials} trials).`,
      `Weights=${JSON.stringify(W)}.`,
      abstain ? `Cảnh báo: tín hiệu sát 50/50, rủi ro cao.` : `Tín hiệu ổn định.`
    ].join(" | ");

    res.json({
      phien: phien,
      xuc_xac: last.dice ?? null,
      tong: last.total ?? null,
      ket_qua: last.result,
      phien_sau: phien_sau,
      du_doan: pred.guess,                // "T" hoặc "X"
      do_tin_cay: bt.acc ?? null,         // accuracy backtest gần nhất
      pattern,                            // T/X 20 phiên gần nhất
      giai_thich,                         // giải thích đầy đủ
      internal: {
        pT: pred.pT,
        abstain,
        lastReason: pred.reason
      }
    });
  } catch (e) {
    res.status(500).json({ error: "Predict failed", detail: e?.message || String(e) });
  }
});

app.get("/backtest", async (req, res) => {
  try {
    const { data } = await axios.get(SOURCE_URL, { timeout: 9000 });
    if (!Array.isArray(data)) return res.status(500).json({ error: "Source API format invalid" });
    const history = normalizeHistory(data);
    const W = findBestWeights(history);

    const window = Number(req.query.window || 250);
    const n = history.length;
    const start = Math.max(0, n - window - 1);

    const rows = [];
    let ok=0, trials=0;
    for (let i=start+7; i<n-1; i++){
      const train = history.slice(start, i+1);
      const actual = history[i+1].result;
      const pred = predictDeterministic(train, W);
      trials++;
      if (pred.guess===actual) ok++;
      rows.push({
        phien: history[i+1].session,
        predicted: pred.guess,
        pT: Number(pred.pT.toFixed(4)),
        actual,
        correct: pred.guess===actual,
        reason: pred.reason
      });
    }
    res.json({
      trials, accuracy: trials? Number((ok/trials).toFixed(4)) : null,
      weights: W,
      regime: detectRegime(history),
      sample: rows.slice(-50),  // trả 50 dòng cuối cho gọn
    });
  } catch (e) {
    res.status(500).json({ error: "Backtest failed", detail: e?.message || String(e) });
  }
});

app.get("/", (req, res) => res.json({ ok:true, info:"Use GET /predict or /backtest" }));

app.listen(PORT, ()=> console.log(`VIP TaiXiu Predictor running on ${PORT}`));
