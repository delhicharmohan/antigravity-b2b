import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/v1';
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || '/admin';

export const api = axios.create({
    baseURL: API_URL,
});

export const adminApiInstance = axios.create({
    baseURL: ADMIN_URL,
});

adminApiInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const adminApi = {
    login: (password: string) => adminApiInstance.post('/login', { password }),
    createMerchant: (name: string) => adminApiInstance.post('/merchants', { name }),
    listMerchants: () => adminApiInstance.get('/merchants'),
    updateMerchant: (id: string, config: any) => adminApiInstance.put(`/merchants/${id}`, { config }),
    deleteMerchant: (id: string) => adminApiInstance.delete(`/merchants/${id}`),

    createMarket: (data: { title: string; durationSeconds: number; initYes: number; initNo: number, category?: string }) =>
        adminApiInstance.post('/markets', data),
    listMarkets: () => adminApiInstance.get('/markets'),
    updateMarket: (id: string, data: any) => adminApiInstance.put(`/markets/${id}`, data),
    deleteMarket: (id: string) => adminApiInstance.delete(`/markets/${id}`),

    runScout: (query?: string) => adminApiInstance.post('/scout', { query }),
    getMeta: () => adminApiInstance.get('/meta'),
    listWagers: () => adminApiInstance.get('/wagers'),
    getLogs: () => adminApiInstance.get('/logs'),
    getStats: (date?: string) => adminApiInstance.get('/stats', { params: { date } }),
    settleMarket: (id: string, outcome: 'yes' | 'no') => adminApiInstance.post(`/markets/${id}/settle`, { outcome }),
    voidMarket: (id: string) => adminApiInstance.post(`/markets/${id}/void`),
    resolveMarket: (id: string) => adminApiInstance.post(`/markets/${id}/resolve`),
    getWebhookLogs: () => adminApiInstance.get('/webhooks/logs'),
    getMarketPayouts: (id: string) => adminApiInstance.get(`/markets/${id}/payouts`),
};
