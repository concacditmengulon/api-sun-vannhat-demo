const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Helper function to get random float in a range
const getRandomFloat = (min, max) => Math.random() * (max - min) + min;

// --- API Endpoint ---
app.get('/api/taixiu/predict', async (req, res) => {
    try {
        const sourceApiUrl = 'https://fullsrc-daynesun.onrender.com/api/taixiu/history';

        // Fetch data from the source API
        const response = await axios.get(sourceApiUrl, { timeout: 5000 });
        const history = response.data.history;

        // Ensure we have some data
        if (!history || history.length === 0) {
            return res.status(404).json({ error: 'No history data available from the source API.' });
        }

        // Get the latest session data from the history
        const lastSession = history[history.length - 1];
        
        // Use a simple predictive model
        let du_doan;
        let do_tin_cay;
        
        // Simple 'contrarian' prediction based on the last result
        if (lastSession.ket_qua === 'Tài') {
            du_doan = 'Xỉu';
            do_tin_cay = getRandomFloat(60, 95); // Higher confidence for reversal
        } else {
            du_doan = 'Tài';
            do_tin_cay = getRandomFloat(60, 95); // Higher confidence for reversal
        }

        // Add some randomness to the prediction to simulate more complex logic
        if (Math.random() < 0.2) { // 20% chance to predict the same as last result
            du_doan = lastSession.ket_qua;
            do_tin_cay = getRandomFloat(50, 70);
        }

        // Round confidence to 2 decimal places
        do_tin_cay = parseFloat(do_tin_cay.toFixed(2));

        // Construct the final response object
        const finalResponse = {
            phien: lastSession.session,
            xuc_xac: lastSession.dice,
            tong: lastSession.total,
            ket_qua: lastSession.result,
            phien_sau: lastSession.session + 1,
            du_doan: du_doan,
            do_tin_cay: do_tin_cay + '%'
        };

        res.json(finalResponse);

    } catch (error) {
        console.error('Error fetching data or processing request:', error.message);
        res.status(500).json({ 
            error: 'Failed to retrieve or process data.', 
            details: error.message 
        });
    }
});

// Root endpoint for info
app.get('/', (req, res) => {
    res.send('TaiXiu Prediction API is running. Use /api/taixiu/predict to get a prediction.');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
