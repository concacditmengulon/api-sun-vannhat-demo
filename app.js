// server.js
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// --- Helpers ---
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clamp = (v, a=0.0001, b=0.9999) => Math.max(a, Math.min(b, v));
const mean = (arr) => arr.length ? arr.reduce((s,x)=>s+x,0)/arr.length : 0;
const variance = (arr) => {
    if (!arr.length) return 0;
    const m = mean(arr);
    return arr.reduce((s,x)=>s + Math.pow(x - m, 2), 0) / arr.length;
};

// --- Robust API data parser (maps many shapes) ---
function normalizeItem(item) {
    const phien = item.session ?? item.phien ?? item.id ?? item.s ?? item.index ?? null;
    const tong = item.total ?? item.tong ?? item.sum ?? item.t ?? item.total_points ?? null;
    const dice = item.dice ?? item.xuc_xac ?? item.xucxac ?? item.x ?? item.d ?? null;
    const rawResult = item.result ?? item.ket_qua ?? item.res ?? item.outcome ?? item.kq ?? null;

    // Determine ket_qua (Tài/Xỉu) robustly
    let ket_qua = null;
    if (typeof rawResult === 'string') {
        const s = rawResult.toLowerCase();
        if (s.includes('t') && s.includes('ài') || s.includes('tai') || s === 't' || s.includes('big')) ket_qua = 'Tài';
        else if (s.includes('x') && s.includes('ỉu') || s.includes('xiu') || s === 'x' || s.includes('small')) ket_qua = 'Xỉu';
        else if (!isNaN(Number(rawResult))) ket_qua = Number(rawResult) > 10.5 ? 'Tài' : 'Xỉu';
    } else if (typeof rawResult === 'number') {
        ket_qua = rawResult > 10.5 ? 'Tài' : 'Xỉu';
    } else if (typeof tong === 'number') {
        ket_qua = Number(tong) > 10.5 ? 'Tài' : 'Xỉu';
    }

    return {
        phien: phien !== null ? Number(phien) : null,
        tong: tong !== null ? Number(tong) : (rawResult && !isNaN(Number(rawResult)) ? Number(rawResult) : null),
        ket_qua,
        xuc_xac: dice
    };
}

function processApiData(rawArray) {
    const parsed = (rawArray || [])
        .map(normalizeItem)
        .filter(x => x.phien !== null && x.tong !== null && x.ket_qua !== null);

    // sort ascending by phien (oldest -> newest)
    parsed.sort((a,b) => a.phien - b.phien);
    return parsed;
}

// --- Predictive model base (returns taiProb in 0..1) ---
class DeepSequencePredictor {
    async analyze({historical}) {
        const history = historical.map(h => h.ket_qua);
        const totals = historical.map(h => h.tong);
        const last5 = history.slice(-5);
        const lastSeq = last5.join('');
        const taiCountLast10 = history.slice(-10).filter(x => x === 'Tài').length;
        const xiuCountLast10 = history.slice(-10).filter(x => x === 'Xỉu').length;

        let taiProb = 0.5;
        let confidence = 0.7;

        if (lastSeq.includes('TTT')) {
            taiProb = clamp(0.9 - (xiuCountLast10 * 0.005));
            confidence = 0.86;
        } else if (lastSeq.includes('XXX')) {
            taiProb = clamp(0.1 + (taiCountLast10 * 0.005));
            confidence = 0.86;
        } else if (lastSeq.includes('TX') || lastSeq.includes('XT')) {
            // simple reversal tendency
            const tail = last5[last5.length-1];
            taiProb = tail === 'Tài' ? 0.35 : 0.65;
            confidence = 0.72;
        } else {
            const avgRecent = mean(totals.slice(-10));
            taiProb = clamp(avgRecent > 10.5 ? 0.62 : 0.38);
            confidence = 0.68;
        }

        return {
            modelType: 'deepSequence',
            taiProb,
            confidence,
            explanation: `DeepSequence: lastSeq=${lastSeq}, taiLast10=${taiCountLast10}`
        };
    }
}

class HybridAttentionPredictor {
    async analyze({historical}) {
        const totals = historical.map(h => h.tong);
        const var5 = variance(totals.slice(-10));
        // map variance to taiProb in a smooth way
        const taiProb = clamp( sigmoid((var5 - 5) / 3) * 0.9 + 0.05 );
        const confidence = 0.65 + Math.min(0.25, var5 / 20);
        return {
            modelType: 'hybridAttention',
            taiProb,
            confidence,
            explanation: `HybridAttention: variance=${var5.toFixed(2)}`
        };
    }
}

class QuantumInspiredNetwork {
    async analyze({historical}) {
        const history = historical.map(h => h.ket_qua);
        if (!history.length) return {modelType:'quantumInspired', taiProb:0.5, confidence:0.5, explanation:'empty'};
        // compute consecutive tail length
        const tailVal = history[history.length - 1];
        let tailLen = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i] === tailVal) tailLen++;
            else break;
        }
        // heuristics: if long tail, more chance to flip (contrarian)
        let taiProb = 0.5;
        if (tailVal === 'Tài') {
            taiProb = clamp(0.45 - tailLen * 0.02);
        } else {
            taiProb = clamp(0.55 + tailLen * 0.02);
        }
        const confidence = clamp(0.9 - tailLen * 0.05, 0.4, 0.92);
        return {
            modelType: 'quantumInspired',
            taiProb,
            confidence,
            explanation: `QuantumInspired: tail=${tailVal}, tailLen=${tailLen}`
        };
    }
}

class AdvancedProbabilisticModel {
    async analyze({historical}) {
        const recent = historical.slice(-20);
        const n = recent.length || 1;
        const taiProb = clamp(recent.filter(x => x.ket_qua === 'Tài').length / n);
        const confidence = 0.6 + Math.min(0.35, 0.4 * Math.abs(taiProb - 0.5));
        return {
            modelType: 'probabilisticGraphical',
            taiProb,
            confidence,
            explanation: `Probabilistic: taiRatioLast${n}=${(taiProb*100).toFixed(1)}%`
        };
    }
}

class TemporalFusionPredictor {
    async analyze({historical}) {
        const totals = historical.map(h => h.tong).slice(-6);
        if (totals.length < 2) return {modelType:'temporalFusion', taiProb:0.5, confidence:0.5, explanation:'not enough totals'};
        let diffs = [];
        for (let i=1;i<totals.length;i++) diffs.push(totals[i]-totals[i-1]);
        const trend = mean(diffs);
        const taiProb = clamp(0.5 + (trend / 6)); // small mapping
        const confidence = clamp(0.6 + Math.min(0.3, Math.abs(trend) / 6));
        return {
            modelType: 'temporalFusion',
            taiProb,
            confidence,
            explanation: `Temporal: trend=${trend.toFixed(2)}`
        };
    }
}

// --- Simple Logistic Regression predictor (AI) implemented in pure JS ---
// Feature design: last 3 totals diffs, avg total last10, taiRatio last10, streak length
class LogisticRegressionPredictor {
    constructor() {
        this.w = null; // weight vector
        this.b = 0;
        this.trained = false;
    }

    extractFeatures(history, idx) {
        // create features to predict outcome at index idx using previous frames
        const window = 10;
        const start = Math.max(0, idx - window);
        const slice = history.slice(start, idx);
        const totals = slice.map(x => x.tong);
        const lastTotals = history.slice(Math.max(0, idx-3), idx).map(x => x.tong);
        const features = [];
        // normalized avg total last10
        const avg10 = mean(totals.length ? totals : [10.5]);
        features.push((avg10 - 10.5) / 5); // centered
        // variance
        features.push(Math.sqrt(variance(totals)));
        // tai ratio last10
        const taiRatio = slice.length ? (slice.filter(x => x.ket_qua === 'Tài').length / slice.length) : 0.5;
        features.push(taiRatio);
        // streak length at end of slice
        let streak = 0; let last = null;
        for (let i = slice.length - 1; i >= 0; i--) {
            if (last === null) { last = slice[i] ? slice[i].ket_qua : null; streak = last ? 1 : 0; }
            else if (slice[i].ket_qua === last) streak++;
            else break;
        }
        features.push(streak / 10);
        // last1, last2, last3 diffs
        const diffs = [];
        for (let i = 0; i < 3; i++) {
            const v = lastTotals[lastTotals.length - 1 - i];
            diffs.push(v !== undefined ? (v - 10.5) / 5 : 0);
        }
        features.push(...diffs);
        // bias will be added in model
        return features;
    }

    trainOnHistory(history, epochs=60, lr=0.08) {
        // Build dataset
        const X = [], Y = [];
        for (let i = 5; i < history.length; i++) {
            const f = this.extractFeatures(history, i);
            X.push(f);
            Y.push(history[i].ket_qua === 'Tài' ? 1 : 0);
        }
        if (!X.length) {
            this.trained = false;
            return {trained:false, samples:0};
        }
        const dim = X[0].length;
        if (!this.w || this.w.length !== dim) {
            this.w = new Array(dim).fill(0).map(()=> (Math.random()-0.5)*0.01 );
            this.b = 0;
        }
        // simple gradient descent
        for (let ep=0; ep<epochs; ep++) {
            const m = X.length;
            const preds = X.map((xi) => sigmoid(this.dot(xi, this.w) + this.b));
            // gradients
            const gradW = new Array(dim).fill(0);
            let gradB = 0;
            for (let i=0;i<m;i++) {
                const err = preds[i] - Y[i];
                for (let j=0;j<dim;j++) gradW[j] += err * X[i][j];
                gradB += err;
            }
            // update
            for (let j=0;j<dim;j++) this.w[j] -= (lr * gradW[j] / m);
            this.b -= (lr * gradB / m);
            // small lr decay
            if (ep % 20 === 0) lr *= 0.98;
        }
        this.trained = true;
        return {trained:true, samples:X.length};
    }

    dot(a,b) { let s=0; for (let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; }

    async analyze({historical}) {
        if (!historical.length) return { modelType:'logisticAI', taiProb:0.5, confidence:0.5, explanation: 'no data' };
        // ensure we have trained weights - train quickly on current history
        this.trainOnHistory(historical, 80, 0.06);
        const latestIdx = historical.length - 1;
        const features = this.extractFeatures(historical, latestIdx);
        if (!this.trained) {
            // fallback to simple heuristic
            const taiRatio = historical.slice(-10).filter(x=>x.ket_qua==='Tài').length / Math.max(1, Math.min(10, historical.length));
            return { modelType:'logisticAI', taiProb: clamp(taiRatio), confidence: 0.6, explanation: 'fallback heuristic' };
        }
        const raw = this.dot(features, this.w) + this.b;
        const taiProb = clamp(sigmoid(raw));
        const confidence = clamp(0.6 + Math.abs(taiProb - 0.5));
        return { modelType:'logisticAI', taiProb, confidence, explanation: `AI logistic raw=${raw.toFixed(3)}` };
    }
}

// --- Ensemble manager ---
class AdvancedTaiXiuPredictor {
    constructor() {
        this.models = {
            deepSequence: new DeepSequencePredictor(),
            hybridAttention: new HybridAttentionPredictor(),
            quantumInspired: new QuantumInspiredNetwork(),
            temporalFusion: new TemporalFusionPredictor(),
            probabilistic: new AdvancedProbabilisticModel(),
            logisticAI: new LogisticRegressionPredictor()
        };
        // default weights (sum not necessarily 1)
        this.config = {
            ensembleWeights: {
                deepSequence: 0.25,
                hybridAttention: 0.18,
                quantumInspired: 0.15,
                temporalFusion: 0.12,
                probabilistic: 0.10,
                logisticAI: 0.20
            },
            minRecords: 30,
            tuningWindow: 200
        };
        this.historicalData = [];
        this.predictionHistory = [];
        this.tong_so_phien_du_doan = 0;
        // For smoothing weights update
        this.alpha = 0.2;
    }

    async updateData(newData) {
        this.historicalData = newData;
        return {len: this.historicalData.length};
    }

    async analyzeAll() {
        const tasks = Object.entries(this.models).map(async ([name, model]) => {
            try {
                const r = await model.analyze({ historical: this.historicalData });
                return { name, ...r };
            } catch (e) {
                return { name, modelType: name, taiProb:0.5, confidence:0.5, explanation: 'error' };
            }
        });
        const results = await Promise.all(tasks);
        return results;
    }

    smartEnsemblePrediction(analysisResults) {
        const weights = this.config.ensembleWeights;
        let totalWeight = 0;
        let combinedTai = 0;
        const details = {};
        for (const a of analysisResults) {
            const w = weights[a.name] ?? 0;
            totalWeight += w;
            combinedTai += (a.taiProb * w);
            details[a.name] = { taiProb: a.taiProb, confidence: a.confidence, explanation: a.explanation };
        }
        const taiProb = clamp(combinedTai / Math.max(totalWeight, 1));
        const xiuProb = clamp(1 - taiProb);
        // confidence estimate: distance from 0.5 scaled by average confidences
        const avgConf = mean(analysisResults.map(r => r.confidence || 0.6));
        const confidence = Math.round(clamp((Math.abs(taiProb - 0.5) * 2) * avgConf, 0.05, 0.99) * 10000) / 100; // percent with 2 decimals
        // risk: entropy-like
        const entropy = - (taiProb * Math.log2(taiProb) + xiuProb * Math.log2(xiuProb));
        let risk = 'Trung bình';
        if (entropy < 0.6) risk = 'Thấp';
        else if (entropy > 0.95) risk = 'Cao';

        const finalPrediction = taiProb > 0.5 ? 'Tài' : 'Xỉu';
        let explanation = `Tổng hợp: P(Tài)=${(taiProb*100).toFixed(2)}% — Dự đoán ${finalPrediction} với độ tin cậy ${confidence}%.`;
        explanation += '\nChi tiết mô hình:\n';
        for (const k in details) explanation += `- ${k}: ${details[k].explanation}\n`;

        return { finalPrediction, taiProb, confidence, explanation, risk, details };
    }

    async predict(minRecords = null) {
        minRecords = minRecords ?? this.config.minRecords;
        if (this.historicalData.length < minRecords) {
            throw new Error(`Insufficient data. Need at least ${minRecords} records.`);
        }
        const analysisResults = await this.analyzeAll();
        const ens = this.smartEnsemblePrediction(analysisResults);

        // save history
        const lastPhien = this.historicalData[this.historicalData.length - 1].phien;
        this.tong_so_phien_du_doan++;
        this.predictionHistory.push({
            phien: lastPhien + 1,
            du_doan: ens.finalPrediction,
            do_tin_cay: ens.confidence,
            taiProb: ens.taiProb,
            actual: null,
            details: ens.details,
            timestamp: Date.now()
        });

        return {
            phien: lastPhien,
            phien_sau: lastPhien + 1,
            ...ens,
            tong_so_phien_du_doan: this.tong_so_phien_du_doan,
            id: 'Tele@Adm_VanNhat'
        };
    }

    async updatePredictionHistory(actualResult) {
        const last = this.predictionHistory[this.predictionHistory.length - 1];
        if (last && last.actual === null) {
            last.actual = actualResult;
        }
    }

    getPredictionHistory(limit=20) {
        return this.predictionHistory.slice(-limit);
    }

    // backtest last N records and compute model-wise accuracy, then adjust weights
    async backtestAndTune(window = 200) {
        const hist = this.historicalData;
        if (hist.length < 20) return { error: 'Need more data to backtest' };
        const start = Math.max(10, hist.length - window - 1);
        const modelAcc = {};
        for (const key of Object.keys(this.models)) modelAcc[key] = { correct: 0, total: 0 };

        // rolling simulate: for i from start+10 .. hist.length-1, predict using history[0..i-1]
        for (let i = start + 10; i < hist.length; i++) {
            const chunk = hist.slice(0, i); // training history available up to i-1
            // compute each model's prediction probability using chunk
            for (const [name, model] of Object.entries(this.models)) {
                try {
                    // For logisticAI, train on chunk inside analyze
                    const res = await model.analyze({ historical: chunk });
                    const pred = res.taiProb > 0.5 ? 'Tài' : 'Xỉu';
                    const actual = hist[i].ket_qua;
                    modelAcc[name].total++;
                    if (pred === actual) modelAcc[name].correct++;
                } catch (e) {
                    modelAcc[name].total++;
                }
            }
        }

        // compute accuracies and update weights proportionally (with smoothing)
        const accuracies = {};
        let sumAcc = 0;
        for (const k in modelAcc) {
            const acc = modelAcc[k].total ? (modelAcc[k].correct / modelAcc[k].total) : 0.5;
            accuracies[k] = acc;
            sumAcc += acc;
        }
        // update weights: new = (1-alpha)*old + alpha*(acc / sumAcc)
        const newWeights = {};
        const oldWeights = this.config.ensembleWeights;
        for (const k in oldWeights) {
            const acc = accuracies[k] || 0.01;
            const normalized = (sumAcc > 0) ? (acc / sumAcc) : (1 / Object.keys(oldWeights).length);
            newWeights[k] = oldWeights[k] * (1 - this.alpha) + normalized * this.alpha * Object.keys(oldWeights).length;
            // ensure positive
            if (!isFinite(newWeights[k]) || newWeights[k] <= 0) newWeights[k] = 0.01;
        }
        // normalize scale (optional)
        this.config.ensembleWeights = newWeights;

        return { accuracies, newWeights, modelAcc };
    }
}

const advancedPredictor = new AdvancedTaiXiuPredictor();

// --- API Endpoints ---
app.get('/api/taixiu/predict', async (req, res) => {
    try {
        const src = req.query.src || 'https://fullsrc-daynesun.onrender.com/api/taixiu/history';
        const { data } = await axios.get(src, { timeout: 8000 });
        const processed = processApiData(data);
        if (!processed.length) return res.status(500).json({ error: 'No usable historical records from source.' });
        await advancedPredictor.updateData(processed);
        // use minRecords default (config)
        const result = await advancedPredictor.predict();
        // attach last session info
        const last = processed[processed.length-1];
        res.json({
            phien: last.phien,
            xuc_xac: last.xuc_xac,
            tong: last.tong,
            ket_qua: last.ket_qua,
            phien_sau: last.phien + 1,
            ...result
        });
    } catch (err) {
        console.error(err?.message || err);
        res.status(500).json({ error: err.message || 'Prediction error' });
    }
});

app.get('/api/taixiu/premium', async (req, res) => {
    // same as predict but allow smaller minRecords if premium param set
    try {
        const src = req.query.src || 'https://fullsrc-daynesun.onrender.com/api/taixiu/history';
        const minRecords = Number(req.query.minRecords) || 40;
        const { data } = await axios.get(src, { timeout: 8000 });
        const processed = processApiData(data);
        if (processed.length < minRecords) return res.status(400).json({ error: `Not enough data. Need >= ${minRecords} records.` });
        await advancedPredictor.updateData(processed);
        const result = await advancedPredictor.predict(minRecords);
        const last = processed[processed.length - 1];
        res.json({
            phien: last.phien,
            xuc_xac: last.xuc_xac,
            tong: last.tong,
            ket_qua: last.ket_qua,
            phien_sau: last.phien + 1,
            ...result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Premium prediction error' });
    }
});

app.get('/api/taixiu/backtest', async (req, res) => {
    try {
        const src = req.query.src || 'https://fullsrc-daynesun.onrender.com/api/taixiu/history';
        const { data } = await axios.get(src, { timeout: 10000 });
        const processed = processApiData(data);
        await advancedPredictor.updateData(processed);
        const window = Number(req.query.window) || advancedPredictor.config.tuningWindow;
        const r = await advancedPredictor.backtestAndTune(window);
        res.json(r);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Backtest error' });
    }
});

app.get('/api/taixiu/history', (req, res) => {
    try {
        res.json({
            history: advancedPredictor.getPredictionHistory(50),
            weights: advancedPredictor.config.ensembleWeights
        });
    } catch (e) {
        res.status(500).json({ error: 'history error' });
    }
});

// small helper to mark latest prediction actual (POST {actual: "Tài" or "Xỉu"})
app.post('/api/taixiu/update-actual', (req, res) => {
    try {
        const { actual } = req.body;
        if (!actual || (actual !== 'Tài' && actual !== 'Xỉu')) return res.status(400).json({ error: 'actual must be "Tài" or "Xỉu"' });
        advancedPredictor.updatePredictionHistory(actual);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Root - info
app.get('/', (req, res) => {
    res.send(`<pre>Advanced TaiXiu Predictor server.
Endpoints:
GET /api/taixiu/predict
GET /api/taixiu/premium?minRecords=40
GET /api/taixiu/backtest
GET /api/taixiu/history
POST /api/taixiu/update-actual  { actual: "Tài" }
Note: This system provides probabilistic predictions. NEVER assume guaranteed wins.</pre>`);
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
