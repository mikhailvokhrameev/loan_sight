import axios from 'axios';

// Determine the API base URL using Vite environment variables, falling back to local Django development server
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Tokens are stored in httpOnly cookies - the browser sends them automatically.
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor: on 401, try to refresh tokens via cookie, then retry.
// Uses axios to avoid triggering this interceptor recursively.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axios.post(`${API_BASE_URL}/auth/refresh/`, {}, { withCredentials: true });
        return api(originalRequest);
      } catch {
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Authentication Service Wrapper:
 * Bundles all API requests relative to user registration, credentials validation, and profile management.
 */
export const authAPI = {
  // Registers a new user. Appends 'password2' to satisfy Django REST serializers validation 
  // and parses 'skIdCurr' into a numeric format to map against the credit scoring datasets.
  register: (email, password, firstName, lastName, skIdCurr) =>
    api.post('/auth/register/', { 
      email, 
      password,
      password2: password, 
      first_name: firstName,
      last_name: lastName,
      sk_id_curr: skIdCurr ? Number(skIdCurr) : null
    }),
  
  // Submits login credentials to obtain JWT token pairings
  login: (email, password) =>
    api.post('/auth/login/', { email, password }),
  
  // Fetches account details for the currently logged-in user session
  getCurrentUser: () =>
    api.get('/auth/me/'),
  
  // Performs a partial update on the current user's profile attributes
  updateProfile: (data) =>
    api.patch('/auth/me/', data),

  // Blacklists the refresh token cookie on the backend
  logout: () =>
    api.post('/auth/logout/', {}),
};

export const experimentsAPI = {
  getAll: () =>
    api.get('/experiments/'),

  create: (data) =>
    api.post('/experiments/', data),

  delete: (id) =>
    api.delete(`/experiments/${id}/`),

  clearAll: () =>
    api.delete('/experiments/clear/'),
};

export const modelsAPI = {
  getAll: () => api.get('/models/'),
  upload: (formData) => api.post('/models/', formData, {
    headers: { 'Content-Type': undefined },
  }),
  delete: (id) => api.delete(`/models/${id}/`),
  clearAll: () => api.delete('/models/clear/'),
  compare: (data) => api.post('/compare/', data),
};

export const clientsAPI = {
  getPresets: () =>
    api.get('/clients/presets/'),

  search: (params) =>
    api.get('/clients/search/', { params }),

  getFeatures: (skIdCurr, currency = 'RUB') =>
    api.get(`/clients/features/${skIdCurr}/`, { params: { currency } }),
};

export default api;