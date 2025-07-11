const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// Constants adapted from PHP class
const API_URL = 'https://app.orderkuota.com:443/api/v2';
const HOST = 'app.orderkuota.com';
const USER_AGENT = 'okhttp/4.10.0';
const APP_VERSION_NAME = '25.03.27';
const APP_VERSION_CODE = '250314';
// Pastikan ini adalah APP_REG_ID yang valid dan sama dengan yang digunakan di aplikasi Android/PHP Anda
const APP_REG_ID = 'di309HvATsaiCppl5eDpoc:APA91bFUcTOH8h2XHdPRz2qQ5Bezn-3_TaycFcJ5pNLGWpmaxheQP9Ri0E56wLHz0_b1vcss55jbRQXZgc5loSfBdNa5nZJZVMlk7GS1JDMGyFUVvpcwXbMDg8tjKGZAurCGR4kDMDRJ'; // Example placeholder, replace with actual if needed

class OrderKuotaAPI {
    constructor(username = false, authToken = false) {
        this.username = username;
        this.authToken = authToken;
    }

    buildHeaders() {
        return {
            'Host': HOST,
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
        };
    }

    async request(type = 'GET', url, payload = false) {
        const options = {
            method: type,
            headers: this.buildHeaders(),
        };

        if (payload) {
            options.body = payload;
        }

        try {
            const response = await fetch(url, options);
            const data = await response.json(); // Always try to parse as JSON first
            if (!response.ok) {
                // If response is not OK, it's an error. Include message from API if available.
                const errorMessage = data.message || `HTTP error! status: ${response.status}`;
                throw new Error(errorMessage);
            }
            return data;
        } catch (error) {
            console.error(`Error during API request to ${url}:`, error);
            // Re-throw the error to be caught by the route handler
            throw error;
        }
    }

    async loginRequest(username, password) {
        const payload = new URLSearchParams({
            username: username,
            password: password,
            app_reg_id: APP_REG_ID,
            app_version_code: APP_VERSION_CODE,
            app_version_name: APP_VERSION_NAME,
        }).toString();
        return this.request('POST', `${API_URL}/login`, payload);
    }

    async getAuthToken(username, otp) {
        const payload = new URLSearchParams({
            username: username,
            password: otp, // OTP is sent as password in this specific API
            app_reg_id: APP_REG_ID,
            app_version_code: APP_VERSION_CODE,
            app_version_name: APP_VERSION_NAME,
        }).toString();
        return this.request('POST', `${API_URL}/login`, payload);
    }

    // This method handles all getTransactionQris calls (All, Kredit, Debet)
    // The PHP code uses 'get' endpoint for transaction history
    async getTransactionQris(type = '') {
        if (!this.authToken || !this.username) {
            throw new Error('Authentication token and username are required for this action.');
        }
        const payload = new URLSearchParams({
            auth_token: this.authToken,
            auth_username: this.username,
            'requests[qris_history][jumlah]': '',
            'requests[qris_history][jenis]': type, // 'kredit', 'debet', or '' for all
            'requests[qris_history][page]': '1',
            'requests[qris_history][dari_tanggal]': '',
            'requests[qris_history][ke_tanggal]': '',
            'requests[qris_history][keterangan]': '',
            'requests[0]': 'account', // This seems to be a common request type for account details
            app_version_name: APP_VERSION_NAME,
            app_version_code: APP_VERSION_CODE,
            app_reg_id: APP_REG_ID,
        }).toString();
        return this.request('POST', `${API_URL}/get`, payload);
    }

    // The PHP code uses 'get' endpoint for snapqral
    async withdrawalQris(amount) {
        if (!this.authToken || !this.username) {
            throw new Error('Authentication token and username are required for this action.');
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            throw new Error('Valid amount is required for withdrawal.');
        }
        const payload = new URLSearchParams({
            app_reg_id: APP_REG_ID,
            app_version_code: APP_VERSION_CODE,
            auth_username: this.username,
            'requests[qris_withdraw][amount]': amount,
            auth_token: this.authToken,
            app_version_name: APP_VERSION_NAME,
        }).toString();
        return this.request('POST', `${API_URL}/get`, payload);
    }
}

// API Endpoints
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const orderKuotaApi = new OrderKuotaAPI();

    try {
        const result = await orderKuotaApi.loginRequest(username, password);
        res.json(result);
    } catch (error) {
        console.error("Error in /api/login:", error.message);
        res.status(500).json({ error: error.message });
    }
});

router.post('/otp', async (req, res) => {
    const { username, otpCode } = req.body;
    const orderKuotaApi = new OrderKuotaAPI();

    try {
        const result = await orderKuotaApi.getAuthToken(username, otpCode);
        res.json(result);
    } catch (error) {
        console.error("Error in /api/otp:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// New API endpoint for Mutasi (Transaction History)
router.post('/mutasi', async (req, res) => {
    const { username, token, type } = req.body; // 'type' can be 'kredit', 'debet', or undefined/empty for all
    if (!username || !token) {
        return res.status(401).json({ error: 'Unauthorized: Username and Token are required.' });
    }
    const orderKuotaApi = new OrderKuotaAPI(username, token);

    try {
        // The PHP code directly uses getTransactionQris() without explicit type
        // Let's allow `type` to be passed for 'kredit'/'debet' filtering
        const result = await orderKuotaApi.getTransactionQris(type || '');
        res.json(result);
    } catch (error) {
        console.error("Error in /api/mutasi:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// New API endpoint for QRIS snapqral
router.post('/withdraw', async (req, res) => {
    const { username, token, amount } = req.body;
    if (!username || !token || !amount) {
        return res.status(400).json({ error: 'Username, Token, and Amount are required.' });
    }
    const orderKuotaApi = new OrderKuotaAPI(username, token);

    try {
        const result = await orderKuotaApi.withdrawalQris(amount);
        res.json(result);
    } catch (error) {
        console.error("Error in /api/withdraw:", error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;