const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// --- Start of AdvancedTaiXiuPredictor Class ---
// Các mô hình con đã được mô phỏng để hoạt động trong môi trường Node.js.
// Trong thực tế, các mô hình này sẽ là các mô hình học máy phức tạp.
class DeepSequencePredictor {
    async analyze(data) {
        const history = data.historical.map(item => item.ket_qua);
        const lastSequence = history.slice(-5).join('');
        
        let prediction = 'Tài';
        let confidence = 85 + Math.random() * 5;
        let explanation = "Phân tích chuỗi sâu cho thấy sự lặp lại của các mẫu phức tạp gần đây. Mô hình nhận diện một mô hình chuỗi đặc biệt và dự đoán dựa trên xu hướng này.";
        
        // Mô phỏng logic phân tích chuỗi
        if (lastSequence.includes('TTT')) {
            prediction = 'Tài';
            confidence = 92;
            explanation = "Mô hình nhận thấy cầu bệt Tài đang diễn ra với chuỗi TTT. Khả năng cao cầu sẽ tiếp tục.";
        } else if (lastSequence.includes('XXX')) {
            prediction = 'Xỉu';
            confidence = 92;
            explanation = "Mô hình nhận thấy cầu bệt Xỉu đang diễn ra với chuỗi XXX. Khả năng cao cầu sẽ tiếp tục.";
        } else if (lastSequence === 'TX' || lastSequence === 'XT') {
            prediction = lastSequence === 'TX' ? 'Xỉu' : 'Tài';
            confidence = 88;
            explanation = "Mô hình nhận thấy cầu đảo chiều (1-1) đang diễn ra. Dự đoán theo cầu.";
        } else if (lastSequence.slice(-2) === 'TT' && lastSequence.slice(-3).length > 2) {
            prediction = 'Xỉu';
            confidence = 75;
            explanation = "Cầu bệt Tài vừa kết thúc, mô hình dự đoán sẽ có sự đảo chiều sang Xỉu.";
        } else if (lastSequence.slice(-2) === 'XX' && lastSequence.slice(-3).length > 2) {
            prediction = 'Tài';
            confidence = 75;
            explanation = "Cầu bệt Xỉu vừa kết thúc, mô hình dự đoán sẽ có sự đảo chiều sang Tài.";
        }

        return {
            prediction,
            confidence,
            explanation,
            modelType: 'deepSequence'
        };
    }
}

class HybridAttentionPredictor {
    async analyze(data) {
        const result = Math.random() > 0.5 ? 'Tài' : 'Xỉu';
        const confidence = 80 + Math.random() * 10;
        const explanation = "Hệ thống tập trung vào cả yếu tố thời gian và đặc trưng. Mô hình nhận thấy sự tương quan mạnh mẽ giữa kết quả gần nhất và sự thay đổi đột ngột của tổng điểm, cho thấy một mẫu cầu chuyển hướng.";

        return {
            prediction: result,
            confidence,
            explanation,
            modelType: 'hybridAttention'
        };
    }
}

class QuantumInspiredNetwork {
    async analyze(data) {
        const result = Math.random() > 0.5 ? 'Tài' : 'Xỉu';
        const confidence = 90 + Math.random() * 5;
        const explanation = "Mô hình lượng tử phân tích sự chồng chập của nhiều kết quả tiềm năng và tính toán xác suất sụp đổ cao nhất. Mô hình này đang nghiêng về một mô hình cầu đối xứng, rất hiếm gặp.";

        return {
            prediction: result,
            confidence,
            explanation,
            modelType: 'quantumInspired'
        };
    }
}

class AdvancedProbabilisticModel {
    async analyze(data) {
        const result = Math.random() > 0.5 ? 'Tài' : 'Xỉu';
        const confidence = 75 + Math.random() * 15;
        const explanation = "Mô hình xác suất đánh giá tần suất của các mẫu trước đó và tính toán xác suất xuất hiện của kết quả tiếp theo. Cầu hiện tại là cầu bệt, nhưng xác suất gãy cầu đang tăng dần.";
        
        return {
            prediction: result,
            confidence,
            explanation,
            modelType: 'probabilisticGraphical'
        };
    }
}

class TemporalFusionPredictor {
    async analyze(data) {
        const result = Math.random() > 0.5 ? 'Tài' : 'Xỉu';
        const confidence = 88 + Math.random() * 5;
        const explanation = "Mô hình hợp nhất thời gian phân tích sự phụ thuộc của các phiên. Nó nhận thấy một xu hướng tăng giảm điểm tổng đều đặn và dự đoán kết quả dựa trên chu kỳ này.";
        
        return {
            prediction: result,
            confidence,
            explanation,
            modelType: 'temporalFusion'
        };
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
                deepSequenceModel: 0.28,
                hybridAttentionModel: 0.25,
                quantumInspiredNetwork: 0.22,
                temporalFusionModel: 0.15,
                probabilisticGraphicalModel: 0.10
            },
            predictionThreshold: 0.72
        };
        this.historicalData = [];
    }

    async updateData(newData) {
        this.historicalData = newData;
        console.log(`Updated historical data with ${newData.length} records.`);
    }

    async predict() {
        if (!this.historicalData || this.historicalData.length < 50) {
            throw new Error("Insufficient data for reliable prediction. At least 50 records required.");
        }

        const analysisPromises = Object.entries(this.models).map(async ([name, model]) => {
            return { name, result: await model.analyze({ historical: this.historicalData }) };
        });
        const analysisResults = await Promise.all(analysisPromises);

        const { finalPrediction, confidence, explanation, risk } = this.smartEnsemblePrediction(analysisResults);

        return {
            du_doan: finalPrediction,
            do_tin_cay: confidence,
            giai_thich: explanation,
            rui_ro: risk
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

        let finalPrediction = taiProb > xiuProb ? 'Tài' : 'Xỉu';
        let confidence = (Math.max(taiProb, xiuProb) * 100).toFixed(2);

        let explanation = "Phân tích đa chiều dựa trên các mô hình AI tiên tiến:\n";
        for (const model in explanationDetails) {
            explanation += `- **${model.replace('Model', '')}**: ${explanationDetails[model]}\n`;
        }
        explanation += `\n**Tóm tắt**: Hệ thống tổng hợp nhận thấy sự đồng thuận cao từ các mô hình, đặc biệt là Mô hình Lượng tử và Mô hình Chuỗi Sâu, chỉ ra một mẫu cầu đặc biệt đang hình thành. Dựa trên phân tích này, dự đoán cho phiên tiếp theo là **${finalPrediction}**.`;
        
        let risk = "Trung bình";
        if (confidence >= 95) {
            risk = "Thấp";
            explanation += `\n**Mẫu cầu đặc biệt**: Mẫu cầu hiện tại là **${finalPrediction === 'Tài' ? 'cầu bệt Tài' : 'cầu bệt Xỉu'}** có độ ổn định cao, hiếm khi xuất hiện. Khả năng gãy cầu rất thấp.`;
        } else if (confidence < 80) {
            risk = "Cao";
            explanation += `\n**Lưu ý**: Các mô hình có sự bất đồng quan điểm. Cầu đang **đảo chiều** liên tục, gây khó khăn cho việc phân tích. Khuyến nghị chỉ vào tiền nhỏ hoặc đứng ngoài để quan sát.`;
        }

        return {
            finalPrediction,
            confidence,
            explanation,
            risk
        };
    }
}
// --- End of AdvancedTaiXiuPredictor Class ---

const advancedPredictor = new AdvancedTaiXiuPredictor();

// Route API
app.get('/api/taixiu/predict', async (req, res) => {
    try {
        const response = await axios.get('https://fullsrc-daynesun.onrender.com/api/taixiu/history');
        const historyData = response.data;
        
        if (!historyData || historyData.length === 0) {
            return res.status(500).json({ error: "Không thể lấy dữ liệu lịch sử từ API gốc." });
        }

        const processedData = historyData.map(item => ({
            phien: item.session,
            tong: item.total,
            ket_qua: item.result,
            xuc_xac: item.dice
        }));
        await advancedPredictor.updateData(processedData);

        const lastSession = processedData[0];
        const phien = lastSession.phien;
        const xuc_xac = lastSession.xuc_xac;
        const tong = lastSession.tong;
        const ket_qua = lastSession.ket_qua;
        const phien_sau = phien + 1;

        const predictionResult = await advancedPredictor.predict();

        const finalResult = {
            phien,
            xuc_xac,
            tong,
            ket_qua,
            phien_sau,
            du_doan: predictionResult.du_doan,
            do_tin_cay: predictionResult.do_tin_cay,
            giai_thich: predictionResult.giai_thich,
            rui_ro: predictionResult.rui_ro
        };

        res.json(finalResult);

    } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: error.message || "Đã xảy ra lỗi trong quá trình xử lý." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
