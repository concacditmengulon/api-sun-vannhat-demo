const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// --- START OF PREDICTION MODELS ---
// Các mô hình con đã được mô phỏng.
class DeepSequencePredictor {
    async analyze(data) {
        const history = data.historical.map(item => item.ket_qua);
        const lastSequence = history.slice(-5).join('');
        const totals = data.historical.map(item => item.tong);
        const avgTotal = totals.slice(-10).reduce((sum, val) => sum + val, 0) / 10;

        let prediction = 'Tài';
        let confidence = 85;
        let explanation = "Phân tích chuỗi: Mô hình phát hiện xu hướng bệt hoặc đảo dựa trên 5 phiên gần nhất.";

        const taiCount = history.slice(-10).filter(x => x === 'Tài').length;
        const xiuCount = 10 - taiCount;
        const isBetTai = lastSequence.includes('TTT');
        const isBetXiu = lastSequence.includes('XXX');
        const isDao = lastSequence.includes('TX') || lastSequence.includes('XT');
        const isComplex = !isBetTai && !isBetXiu && !isDao && lastSequence.length >= 5;

        if (isBetTai) {
            prediction = 'Tài';
            confidence = 92 - (xiuCount * 0.5);
            explanation = "Cầu bệt Tài (TTT) đang mạnh, dự đoán tiếp tục Tài.";
        } else if (isBetXiu) {
            prediction = 'Xỉu';
            confidence = 92 - (taiCount * 0.5);
            explanation = "Cầu bệt Xỉu (XXX) đang mạnh, dự đoán tiếp tục Xỉu.";
        } else if (isDao) {
            prediction = lastSequence.slice(-1) === 'T' ? 'Xỉu' : 'Tài';
            confidence = 88 - Math.abs(taiCount - xiuCount) * 0.3;
            explanation = `Cầu đảo chiều (${lastSequence.slice(-2)}), dự đoán ${prediction}.`;
        } else if (isComplex) {
            prediction = avgTotal > 10.5 ? 'Tài' : 'Xỉu';
            confidence = 80 - Math.abs(taiCount - xiuCount) * 0.2;
            explanation = `Cầu phức tạp, dự đoán dựa trên tổng điểm trung bình: ${prediction}.`;
        } else if (lastSequence.slice(-2) === 'TT') {
            prediction = 'Xỉu';
            confidence = 75 + (xiuCount * 0.5);
            explanation = "Cầu bệt Tài kết thúc, dự đoán đảo sang Xỉu.";
        } else if (lastSequence.slice(-2) === 'XX') {
            prediction = 'Tài';
            confidence = 75 + (taiCount * 0.5);
            explanation = "Cầu bệt Xỉu kết thúc, dự đoán đảo sang Tài.";
        }

        return { prediction, confidence, explanation, modelType: 'deepSequence' };
    }
}

class HybridAttentionPredictor {
    async analyze(data) {
        const history = data.historical.map(item => item.ket_qua);
        const totals = data.historical.map(item => item.tong);
        const variance = totals.slice(-10).reduce((sum, val) => sum + Math.pow(val - 10.5, 2), 0) / 10;

        let prediction = variance > 5 ? 'Tài' : 'Xỉu';
        let confidence = 80 + (10 - Math.abs(variance - 5)) * 0.5;
        let explanation = `Phân tích độ biến động tổng điểm: ${prediction} do độ dao động ${variance.toFixed(2)}`;

        return { prediction, confidence, explanation, modelType: 'hybridAttention' };
    }
}

class QuantumInspiredNetwork {
    async analyze(data) {
        const history = data.historical.map(item => item.ket_qua);
        const streak = history.reduce((acc, val, i) => {
            if (i === 0 || val !== history[i - 1]) return acc + 1;
            return acc;
        }, 0);

        let prediction = streak % 2 === 0 ? 'Tài' : 'Xỉu';
        let confidence = 90 - (streak * 0.3);
        let explanation = `Phân tích chu kỳ chuyển đổi: ${prediction} dựa trên ${streak} lần đổi cầu.`;

        return { prediction, confidence, explanation, modelType: 'quantumInspired' };
    }
}

class AdvancedProbabilisticModel {
    async analyze(data) {
        const history = data.historical.map(item => item.ket_qua);
        const taiProb = history.slice(-20).filter(x => x === 'Tài').length / 20;
        const xiuProb = 1 - taiProb;

        let prediction = taiProb > xiuProb ? 'Tài' : 'Xỉu';
        let confidence = Math.max(taiProb, xiuProb) * 100;
        let explanation = `Xác suất Tài: ${(taiProb * 100).toFixed(1)}%, dự đoán ${prediction}.`;

        return { prediction, confidence, explanation, modelType: 'probabilisticGraphical' };
    }
}

class TemporalFusionPredictor {
    async analyze(data) {
        const totals = data.historical.map(item => item.tong);
        const trend = totals.slice(-5).reduce((sum, val, i, arr) => {
            if (i === 0) return 0;
            return sum + (val - arr[i - 1]);
        }, 0) / 4;

        let prediction = trend > 0 ? 'Tài' : 'Xỉu';
        let confidence = 88 - Math.abs(trend) * 0.5;
        let explanation = `Xu hướng tổng điểm ${trend > 0 ? 'tăng' : 'giảm'}, dự đoán ${prediction}.`;

        return { prediction, confidence, explanation, modelType: 'temporalFusion' };
    }
}

class AdvancedTaiXiuPredictor {
    constructor() {
        this.models = {
            deepSequenceModel: new DeepSequencePredictor(),
            hybridAttentionModel: new HybridAttentionPredictor(),
            quantumInspiredNetwork: new QuantumInspiredNetwork(),
            temporalFusionModel: new TemporalFusionPredictor(),
            probabilisticGraphicalModel: new AdvancedProbabilisticModel()
        };
        this.config = {
            ensembleWeights: {
                deepSequenceModel: 0.3,
                hybridAttentionModel: 0.25,
                quantumInspiredNetwork: 0.2,
                temporalFusionModel: 0.15,
                probabilisticGraphicalModel: 0.1
            },
            predictionThreshold: 0.7
        };
        this.historicalData = [];
        this.predictionHistory = [];
        this.tong_so_phien_du_doan = 0;
    }

    async updateData(newData) {
        this.historicalData = newData;
        console.log(`Updated historical data with ${newData.length} records.`);
    }

    async predict(minRecords = 50) {
        if (this.historicalData.length < minRecords && minRecords !== 0) {
            throw new Error(`Insufficient data. At least ${minRecords} records required.`);
        }

        const analysisPromises = Object.entries(this.models).map(async ([name, model]) => {
            return { name, result: await model.analyze({ historical: this.historicalData }) };
        });
        const analysisResults = await Promise.all(analysisPromises);

        const { finalPrediction, confidence, explanation, risk } = this.smartEnsemblePrediction(analysisResults);

        this.tong_so_phien_du_doan++;
        this.predictionHistory.push({
            phien: this.historicalData[0].phien + 1,
            du_doan: finalPrediction,
            do_tin_cay: confidence,
            actual: null
        });

        return {
            du_doan: finalPrediction,
            do_tin_cay: confidence,
            giai_thich: explanation,
            rui_ro: risk,
            tong_so_phien_du_doan: this.tong_so_phien_du_doan,
            id: 'Tele@Adm_VanNhat'
        };
    }

    smartEnsemblePrediction(analysisResults) {
        let taiConfidence = 0;
        let xiuConfidence = 0;
        let explanationDetails = {};
        const totalWeight = Object.values(this.config.ensembleWeights).reduce((a, b) => a + b, 0);

        for (const analysis of analysisResults) {
            const weight = this.config.ensembleWeights[analysis.name];
            if (analysis.result.prediction === 'Tài') {
                taiConfidence += (analysis.result.confidence / 100) * weight;
            } else {
                xiuConfidence += (analysis.result.confidence / 100) * weight;
            }
            explanationDetails[analysis.name] = analysis.result.explanation;
        }

        const taiProb = taiConfidence / totalWeight;
        const xiuProb = xiuConfidence / totalWeight;
        const finalPrediction = taiProb > xiuProb ? 'Tài' : 'Xỉu';
        const confidence = (Math.max(taiProb, xiuProb) * 100).toFixed(2);

        let explanation = `Dự đoán: ${finalPrediction}\n`;
        for (const model in explanationDetails) {
            explanation += `- ${model.replace('Model', '')}: ${explanationDetails[model]}\n`;
        }
        explanation += `Tóm tắt: Hệ thống tổng hợp các mô hình AI, dự đoán ${finalPrediction} với độ tin cậy ${confidence}%.`;

        let risk = 'Trung bình';
        if (confidence >= 90) {
            risk = 'Thấp';
            explanation += ` Cầu ổn định, rủi ro thấp.`;
        } else if (confidence < 80) {
            risk = 'Cao';
            explanation += ` Cầu phức tạp, khuyến nghị cẩn thận.`;
        }

        return { finalPrediction, confidence, explanation, risk };
    }

    async updatePredictionHistory(actualResult) {
        const lastPrediction = this.predictionHistory[this.predictionHistory.length - 1];
        if (lastPrediction && lastPrediction.actual === null) {
            lastPrediction.actual = actualResult;
        }
    }

    getPredictionHistory(limit = 20) {
        return this.predictionHistory.slice(-limit).map(item => ({
            phien: item.phien,
            du_doan: item.du_doan,
            actual: item.actual,
            dung: item.actual ? item.du_doan === item.actual : null,
            do_tin_cay: item.do_tin_cay
        }));
    }
}

const advancedPredictor = new AdvancedTaiXiuPredictor();

// Process data from the external API
const processApiData = (data) => {
    // API gốc trả về mảng các đối tượng, mỗi đối tượng có thuộc tính "ket_qua" và "tong"
    return data.map(item => ({
        phien: item.session,
        tong: item.total,
        ket_qua: item.result,
        xuc_xac: item.dice
    }));
};

// API Routes
app.get('/api/taixiu/predict', async (req, res) => {
    try {
        const response = await axios.get('https://fullsrc-daynesun.onrender.com/api/taixiu/history');
        const historyData = response.data;
        
        if (!historyData || historyData.length === 0) {
            return res.status(500).json({ error: "Không thể lấy dữ liệu lịch sử từ API gốc." });
        }

        const processedData = processApiData(historyData);
        await advancedPredictor.updateData(processedData);

        const lastSession = processedData[0];
        const phien = lastSession.phien;
        const xuc_xac = lastSession.xuc_xac;
        const tong = lastSession.tong;
        const ket_qua = lastSession.ket_qua;
        const phien_sau = phien + 1;

        const predictionResult = await advancedPredictor.predict(100); // Yêu cầu ít nhất 100 bản ghi cho dự đoán

        const finalResult = {
            phien,
            xuc_xac,
            tong,
            ket_qua,
            phien_sau,
            ...predictionResult
        };

        res.json(finalResult);
    } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: error.message || "Lỗi xử lý dự đoán." });
    }
});

app.get('/api/taixiu/history', async (req, res) => {
    try {
        const history = advancedPredictor.getPredictionHistory(20);
        res.json({
            history,
            tong_so_phien_du_doan: advancedPredictor.tong_so_phien_du_doan,
            id: 'Tele@Adm_VanNhat'
        });
    } catch (error) {
        res.status(500).json({ error: "Lỗi khi lấy lịch sử dự đoán." });
    }
});

app.get('/api/taixiu/premium', async (req, res) => {
    try {
        const response = await axios.get('https://fullsrc-daynesun.onrender.com/api/taixiu/history');
        const historyData = response.data;

        if (!historyData || historyData.length < 50) {
            return res.status(500).json({ error: "Không đủ dữ liệu cho phân tích premium. Cần ít nhất 50 bản ghi." });
        }
        
        const processedData = processApiData(historyData);
        await advancedPredictor.updateData(processedData);

        const lastSession = processedData[0];
        const phien = lastSession.phien;
        const xuc_xac = lastSession.xuc_xac;
        const tong = lastSession.tong;
        const ket_qua = lastSession.ket_qua;
        const phien_sau = phien + 1;

        const predictionResult = await advancedPredictor.predict(50); // Require at least 50 records

        const finalResult = {
            phien,
            xuc_xac,
            tong,
            ket_qua,
            phien_sau,
            ...predictionResult
        };

        res.json(finalResult);
    } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: error.message || "Lỗi xử lý dự đoán premium." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
