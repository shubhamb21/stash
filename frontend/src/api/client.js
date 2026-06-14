import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE_URL });

// Attach JWT to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('stash_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  r => r,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('stash_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email, password) =>
  api.post('/api/auth/login', { email, password }).then(r => r.data);
export const register = (email, password) =>
  api.post('/api/auth/register', { email, password }).then(r => r.data);
export const getMe = () => api.get('/api/auth/me').then(r => r.data);

// Games
export const getGames = (params) => api.get('/api/games', { params }).then(r => r.data);
export const getStats = () => api.get('/api/games/stats').then(r => r.data);
export const updateGame = (id, data) => api.patch(`/api/games/${id}`, data).then(r => r.data);
export const addGame = (data) => api.post('/api/games', data).then(r => r.data);
export const deleteGame = (id) => api.delete(`/api/games/${id}`).then(r => r.data);

// Sync
export const connectSteam = (steamApiKey, steamId) =>
  api.post('/api/sync/steam/connect', { steamApiKey, steamId }).then(r => r.data);
export const syncSteam = () => api.post('/api/sync/steam/sync').then(r => r.data);
export const connectPsn = (npsso) =>
  api.post('/api/sync/psn/connect', { npsso }).then(r => r.data);
export const syncPsn = () => api.post('/api/sync/psn/sync').then(r => r.data);