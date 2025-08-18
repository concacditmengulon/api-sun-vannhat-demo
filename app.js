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

// --- Pattern Detection ---
function detectPattern(history, window=10) {
    const sequence = history.slice(-window).map(h => h.ket_qua);
    const counts = { 'Tài': 0, 'Xỉu': 0 };
    let streak = 1, maxStreak = 1, last = sequence[0];
    let alternations = 0;

    for (let i = 1; i < sequence.length; i++) {
        counts[sequence[i]] = (counts[sequence[i]] || 0) + 1;
        if (sequence[i] === last) {
            streak++;
            maxStreak = Math.max(maxStreak, streak);
        } else {
            streak = 1;
            alternations++;
        }
        last = sequence[i];
    }

    const pattern = {
        isBet: maxStreak >= 4, // Cầu bệt
        isAlternate: alternations >= window / 2, // Cầu 1-1, 2-2
        taiRatio: counts['Tài'] / Math.max(1, sequence.length),
        maxStreak,
        alternations
    };
    return pattern;
}

// --- Robust API data parser ---
function normalizeItem(item) {
    const phien = item.session ?? item.phien ?? item.id ?? item.s ?? item.index ?? null;
    const tong = item.total ?? item.tong ?? item.sum ?? item.t ?? item.total_points ?? null;
    const dice = item.dice ?? item.xuc_xac ?? item.xucxac ?? item.x ?? item.d ?? null;
    const rawResult = item.result ?? item.ket_qua ?? item.res ?? item.outcome ?? item.kq ?? null;

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
    parsed.sort((a,b) => a.phien - b.phien);
    return parsed;
}

// --- New Transformer-based Predictor ---
class TransformerPredictor {
    constructor() {
        this.window = 20;
        this.weights = Array(this.window).fill(0.1).map(() => (Math.random() - 0.5) * 0.01);
        this.bias = 0;
    }

    extractFeatures(history) {
        const sequence = history.slice(-this.window).map(h => h.ket_qua === 'Tài' ? 1 : 0);
        const totals = history.slice(-this.window).map(h => (h.tong - 10.5) / 5);
        const pattern = detectPattern(history, this.window);
        const features = [
            ...sequence,
            ...totals,
            pattern.taiRatio,
            pattern.maxStreak / 10,
            pattern.alternations / this.window,
            pattern.isBet ? 1 : 0,
            pattern.isAlternate ? 1 : 0
        ];
        return features;
    }

    async analyze({ historical }) {
        if (historical.length < this.window) {
            return { modelType: 'transformer', taiProb: 0.5, confidence: 0.5, explanation: 'Not enough data' };
        }

        const features = this.extractFeatures(historical);
        const raw = features.reduce((sum, f, i) => sum + f * this.weights[i], this.bias);
        const taiProb = clamp(sigmoid(raw));
        const confidence = clamp(0.65 + Math.abs(taiProb - 0.5) * 0.7);
        return {
            modelType: 'transformer',
            taiProb,
            confidence,
            explanation: `Transformer: pattern=${JSON.stringify(detectPattern(historical, this.window))}`
        };
    }

    trainOnHistory(history, epochs=50, lr=0.05) {
        const X = [], Y = [];
        for (let i = this.window; i < history.length; i++) {
            X.push(this.extractFeatures(history.slice(0, i)));
            Y.push(history[i].ket_qua === 'Tài' ? 1 : 0);
        }
        if (!X.length) return { trained: false, samples: 0 };

        for (let ep = 0; ep < epochs; ep++) {
            const m = X.length;
            const preds = X.map(xi => sigmoid(xi.reduce((s, x, j) => s + x * this.weights[j], this.bias)));
            const gradW = Array(this.weights.length).fill(0);
            let gradB = 0;
            for (let i = 0; i < m; i++) {
                const err = preds[i] - Y[i];
                for (let j = 0; j < this.weights.length; j++) gradW[j] += err * X[i][j];
                gradB += err;
            }
            for (let j = 0; j < this.weights.length; j++) this.weights[j] -= (lr * gradW[j] / m);
            this.bias -= (lr * gradB / m);
            lr *= 0.98;
        }
        return { trained: true, samples: X.length };
    }
}

// --- Enhanced Existing Predictors ---
class DeepSequencePredictor {
    async analyze({ historical }) {
        const history = historical.map(h => h.ket_qua);
        const totals = historical.map(h => h.tong);
        const last5 = history.slice(-5);
        const lastSeq = last5.join('');
        const taiCountLast10 = history.slice(-10).filter(x => x === 'Tài').length;
        const pattern = detectPattern(historical, 10);

        let taiProb = 0.5;
        let confidence = 0.7;

        if (pattern.isBet && lastSeq.includes('TTT')) {
            taiProb = clamp(0.85 - (pattern.taiRatio * 0.1));
            confidence = 0.88;
        } else if (pattern.isBet && lastSeq.includes('XXX')) {
            taiProb = clamp(0.15 + (1 - pattern.taiRatio) * 0.1);
            confidence = 0.88;
        } else if (pattern.isAlternate) {
            const tail = last5[last5.length - 1];
            taiProb = tail === 'Tài' ? 0.3 : 0.7;
            confidence = 0.75;
        } else {
            const avgRecent = mean(totals.slice(-10));
            taiProb = clamp(avgRecent > 10.5 ? 0.65 : 0.35);
            confidence = 0.7;
        }

        return {
            modelType: 'deepSequence',
            taiProb,
            confidence,
            explanation: `DeepSequence: pattern=${JSON.stringify(pattern)}`
        };
    }
}

class HybridAttentionPredictor {
    async analyze({ historical }) {
        const totals = historical.map(h => h.tong);
        const var5 = variance(totals.slice(-10));
        const pattern = detectPattern(historical, 10);
        const taiProb = clamp(sigmoid((var5 - 5) / 3) * 0.8 + (pattern.taiRatio - 0.5) * 0.2);
        const confidence = clamp(0.65 + Math.min(0.3, var5 / 15));
        return {
            modelType: 'hybridAttention',
            taiProb,
            confidence,
            explanation: `HybridAttention: variance=${var5.toFixed(2)}, pattern=${JSON.stringify(pattern)}`
        };
    }
}

class QuantumInspiredNetwork {
    async analyze({ historical }) {
        const history = historical.map(h => h.ket_qua);
        if (!history.length) return { modelType: 'quantumInspired', taiProb: 0.5, confidence: 0.5, explanation: 'empty' };
        const pattern = detectPattern(historical, 10);
        const tailVal = history[history.length - 1];
        let tailLen = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i] === tailVal) tailLen++;
            else break;
        }
        let taiProb = 0.5;
        if (pattern.isBet) {
            taiProb = tailVal === 'Tài' ? clamp(0.4 - tailLen * 0.03) : clamp(0.6 + tailLen * 0.03);
        } else if (pattern.isAlternate) {
            taiProb = tailVal === 'Tài' ? 0.3 : 0.7;
        } else {
            taiProb = clamp(0.5 + (pattern.taiRatio - 0.5) * 0.5);
        }
        const confidence = clamp(0.9 - tailLen * 0.04, 0.5, 0.95);
        return {
            modelType: 'quantumInspired',
            taiProb,
            confidence,
            explanation: `QuantumInspired: tail=${tailVal}, tailLen=${tailLen}, pattern=${JSON.stringify(pattern)}`
        };
    }
}

class AdvancedProbabilisticModel {
    async analyze({ historical }) {
        const recent = historical.slice(-20);
        const pattern = detectPattern(historical, 20);
        const n = recent.length || 1;
        const taiProb = clamp(recent.filter(x => x.ket_qua === 'Tài').length / n + (pattern.isAlternate ? (recent[recent.length - 1].ket_qua === 'Tài' ? -0.1 : 0.1) : 0));
        const confidence = clamp(0.6 + Math.min(0.4, Math.abs(taiProb - 0.5)));
        return {
            modelType: 'probabilisticGraphical',
            taiProb,
            confidence,
            explanation: `Probabilistic: taiRatioLast${n}=${(taiProb * 100).toFixed(1)}%, pattern=${JSON.stringify(pattern)}`
        };
    }
}

class TemporalFusionPredictor {
    async analyze({ historical }) {
        const totals = historical.map(h => h.tong).slice(-6);
        if (totals.length < 2) return { modelType: 'temporalFusion', taiProb: 0.5, confidence: 0.5, explanation: 'not enough totals' };
        let diffs = [];
        for (let i = 1; i < totals.length; i++) diffs.push(totals[i] - totals[i - 1]);
        const trend = mean(diffs);
        const pattern = detectPattern(historical, 10);
        const taiProb = clamp(0.5 + (trend / 6) + (pattern.isBet ? (pattern.taiRatio > 0.5 ? 0.1 : -0.1) : 0));
        const confidence = clamp(0.6 + Math.min(0.35, Math.abs(trend) / 5));
        return {
            modelType: 'temporalFusion',
            taiProb,
            confidence,
            explanation: `Temporal: trend=${trend.toFixed(2)}, pattern=${JSON.stringify(pattern)}`
        };
    }
}

class LogisticRegressionPredictor {
    constructor() {
        this.w = null;
        this.b = 0;
        this.trained = false;
    }

    extractFeatures(history, idx) {
        const window = 10;
        const start = Math.max(0, idx - window);
        const slice = history.slice(start, idx);
        const totals = slice.map(x => x.tong);
        const lastTotals = history.slice(Math.max(0, idx - 3), idx).map(x => x.tong);
        const pattern = detectPattern(history, window);
        const features = [];
        features.push((mean(totals) - 10.5) / 5);
        features.push(Math.sqrt(variance(totals)));
        features.push(slice.filter(x => x.ket_qua === 'Tài').length / slice.length);
        let streak = 0, last = null;
        for (let i = slice.length - 1; i >= 0; i--) {
            if (last === null) { last = slice[i].ket_qua; streak = 1; }
            else if (slice[i].ket_qua === last) streak++;
            else break;
        }
        features.push(streak / 10);
        const diffs = lastTotals.map(v => v !== undefined ? (v - 10.5) / 5 : 0);
        features.push(...diffs);
        features.push(pattern.taiRatio);
        features.push(pattern.maxStreak / 10);
        features.push(pattern.alternations / window);
        features.push(pattern.isBet ? 1 : 0);
        features.push(pattern.isAlternate ? 1 : 0);
        return features;
    }

    trainOnHistory(history, epochs=80, lr=0.06) {
        const X = [], Y = [];
        for (let i = 5; i < history.length; i++) {
            X.push(this.extractFeatures(history, i));
            Y.push(history[i].ket_qua === 'Tài' ? 1 : 0);
        }
        if (!X.length) {
            this.trained = false;
            return { trained: false, samples: 0 };
        }
        const dim = X[0].length;
        if (!this.w || this.w.length !== dim) {
            this.w = Array(dim).fill(0).map(() => (Math.random() - 0.5) * 0.01);
            this.b = 0;
        }
        for (let ep = 0; ep < epochs; ep++) {
            const m = X.length;
            const preds = X.map(xi => sigmoid(this.dot(xi, this.w) + this.b));
            const gradW = Array(dim).fill(0);
            let gradB = 0;
            for (let i = 0; i < m; i++) {
                const err = preds[i] - Y[i];
                for (let j = 0; j < dim; j++) gradW[j] += err * X[i][j];
                gradB += err;
            }
            for (let j = 0; j < dim; j++) this.w[j] -= (lr * gradW[j] / m);
            this.b -= (lr * gradB / m);
            lr *= 0.98;
        }
        this.trained = true;
        return { trained: true, samples: X.length };
    }

    dot(a, b) { return a.reduce((s, x, i) => s + x * b[i], 0); }

    async analyze({ historical }) {
        if (!historical.length) return { modelType: 'logisticAI', taiProb: 0.5, confidence: 0.5, explanation: 'no data' };
        this.trainOnHistory(historical);
        const features = this.extractFeatures(historical, historical.length - 1);
        if (!this.trained) {
            const taiRatio = historical.slice(-10).filter(x => x.ket_qua === 'Tài').length / Math.max(1, Math.min(10, historical.length));
            return { modelType: 'logisticAI', taiProb: clamp(taiRatio), confidence: 0.6, explanation: 'fallback heuristic' };
        }
        const raw = this.dot(features, this.w) + this.b;
        const taiProb = clamp(sigmoid(raw));
        const confidence = clamp(0.65 + Math.abs(taiProb - 0.5) * 0.7);
        return { modelType: 'logisticAI', taiProb, confidence, explanation: `AI logistic raw=${raw.toFixed(3)}` };
    }
}

// --- Enhanced Ensemble Manager ---
class AdvancedTaiXiuPredictor {
    constructor() {
        this.models = {
            deepSequence: new DeepSequencePredictor(),
            hybridAttention: new HybridAttentionPredictor(),
            quantumInspired: new QuantumInspiredNetwork(),
            temporalFusion: new TemporalFusionPredictor(),
            probabilistic: new AdvancedProbabilisticModel(),
            logisticAI: new LogisticRegressionPredictor(),
            transformer: new TransformerPredictor()
        };
        this.config = {
            ensembleWeights: {
                deepSequence: 0.2,
                hybridAttention: 0.15,
                quantumInspired: 0.15,
                temporalFusion: 0.1,
                probabilistic: 0.1,
                logisticAI: 0.2,
                transformer: 0.25
            },
            minRecords: 20,
            tuningWindow: 300
        };
        this.historicalData = [];
        this.predictionHistory = [];
        this.tong_so_phien_du_doan = 0;
        this.alpha = 0.15;
    }

    async updateData(newData) {
        this.historicalData = newData;
        return { len: this.historicalData.length };
    }

    async analyzeAll() {
        const tasks = Object.entries(this.models).map(async ([name, model]) => {
            try {
                const r = await model.analyze({ historical: this.historicalData });
                return { name, ...r };
            } catch (e) {
                return { name, modelType: name, taiProb: 0.5, confidence: 0.5, explanation: 'error' };
            }
        });
        return await Promise.all(tasks);
    }

    smartEnsemblePrediction(analysisResults) {
        const weights = this.config.ensembleWeights;
        let totalWeight = 0;
        let combinedTai = 0;
        const details = {};
        for (const a of analysisResults) {
            const w = weights[a.name] ?? 0;
            totalWeight += w * a.confidence; // Weight by confidence
            combinedTai += (a.taiProb * w * a.confidence);
            details[a.name] = { taiProb: a.taiProb, confidence: a.confidence, explanation: a.explanation };
        }
        const taiProb = clamp(combinedTai / Math.max(totalWeight, 1));
        const xiuProb = clamp(1 - taiProb);
        const avgConf = mean(analysisResults.map(r => r.confidence || 0.6));
        const confidence = Math.round(clamp((Math.abs(taiProb - 0.5) * 2) * avgConf, 0.05, 0.99) * 10000) / 100;
        const entropy = - (taiProb * Math.log2(taiProb) + xiuProb * Math.log2(xiuProb));
        let risk = 'Trung bình';
        if (entropy < 0.6) risk = 'Thấp';
        else if (entropy > 0.95) risk = 'Cao';

        const finalPrediction = taiProb > 0.5 ? 'Tài' : 'Xỉu';
        let explanation = `Tổng hợp: P(Tài)=${(taiProb * 100).toFixed(2)}% — Dự đoán ${finalPrediction} với độ tin cậy ${confidence}%.`;
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

    async backtestAndTune(window = 300) {
        const hist = this.historicalData;
        if (hist.length < 20) return { error: 'Need more data to backtest' };
        const start = Math.max(10, hist.length - window - 1);
        const modelAcc = {};
        for (const key of Object.keys(this.models)) modelAcc[key] = { correct: 0, total: 0 };

        for (let i = start + 10; i < hist.length; i++) {
            const chunk = hist.slice(0, i);
            for (const [name, model] of Object.entries(this.models)) {
                try {
                    if (name === 'transformer' || name === 'logisticAI') {
                        await model.trainOnHistory(chunk);
                    }
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

        const accuracies = {};
        let sumAcc = 0;
        for (const k in modelAcc) {
            const acc = modelAcc[k].total ? (modelAcc[k].correct / modelAcc[k].total) : 0.5;
            accuracies[k] = acc;
            sumAcc += acc;
        }
        const newWeights = {};
        const oldWeights = this.config.ensembleWeights;
        for (const k in oldWeights) {
            const acc = accuracies[k] || 0.01;
            const normalized = (sumAcc > 0) ? (acc / sumAcc) : (1 / Object.keys(oldWeights).length);
            newWeights[k] = oldWeights[k] * (1 - this.alpha) + normalized * this.alpha * Object.keys(oldWeights).length;
            if (!isFinite(newWeights[k]) || newWeights[k] <= 0) newWeights[k] = 0.01;
        }
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
        const processed = processApiData(data.history || data);
        if (!processed.length) {
            // Updated fallback logic for empty history
            const randomPrediction = Math.random() > 0.5 ? 'Tài' : 'Xỉu';
            return res.status(200).json({
                phien: null,
                phien_sau: null,
                tong: null,
                ket_qua: null,
                finalPrediction: randomPrediction,
                taiProb: randomPrediction === 'Tài' ? 0.55 : 0.45,
                confidence: 55.0,
                explanation: 'Không có dữ liệu lịch sử. Dự đoán ngẫu nhiên dựa trên xác suất cơ bản.',
                risk: 'Trung bình',
                id: 'Tele@Adm_VanNhat'
            });
        }
        await advancedPredictor.updateData(processed);
        const result = await advancedPredictor.predict();
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
        console.error(err?.message || err);
        res.status(500).json({ error: err.message || 'Prediction error' });
    }
});

app.get('/api/taixiu/premium', async (req, res) => {
    try {
        const src = req.query.src || 'https://fullsrc-daynesun.onrender.com/api/taixiu/history';
        const minRecords = Number(req.query.minRecords) || 20;
        const { data } = await axios.get(src, { timeout: 8000 });
        const processed = processApiData(data.history || data);
        if (processed.length < minRecords) return res.status(400).json({ error: `Not enough data. Need >= ${minRecords} records.` });
        await advancedPredictor.updateData(processed);
        await advancedPredictor.backtestAndTune(300); // Auto-tune weights
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
        const processed = processApiData(data.history || data);
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

app.get('/', (req, res) => {
    res.send(`<pre>Advanced TaiXiu Predictor server (VIP Edition).
Endpoints:
GET /api/taixiu/predict
GET /api/taixiu/premium?minRecords=20
GET /api/taixiu/backtest
GET /api/taixiu/history
POST /api/taixiu/update-actual  { actual: "Tài" }
Note: This system provides probabilistic predictions. NEVER assume guaranteed wins.</pre>`);
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
