import axios from 'axios';

// Determine the API base URL using Vite environment variables, falling back to local Django development server
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Create a pre-configured Axios instance to eliminate repeating the base URL and default headers across requests
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor:
 * Automatically intercepts every outgoing HTTP request before it hits the server.
 * It checks localStorage for an access token and injects it into the HTTP Authorization header.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response Interceptor:
 * Intercepts all incoming responses from the server. It refreshes expired short-lived access tokens.
 */
api.interceptors.response.use(
  (response) => response, // If the response is successful (status 2xx), simply forward it.
  async (error) => {
    const originalRequest = error.config;

    // Check if the server rejected the request due to token expiration (401 Unauthorized)
    // The '_retry' flag for preventing an infinite looping if the refresh process itself fails.
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          // Request a new access token using the long-lived refresh token
          const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
            refresh: refreshToken,
          });
          
          // Save the newly acquired access token back to localStorage
          localStorage.setItem('access_token', response.data.access);
          
          // Update the authorization defaults for any upcoming API requests
          api.defaults.headers.common['Authorization'] = `Bearer ${response.data.access}`;
          
          // Re-assign the new token to the original stalled request's header
          originalRequest.headers.Authorization = `Bearer ${response.data.access}`;
          
          // Resend the original request to the server and return its promise chain transparently
          return api(originalRequest);
        }
      } catch (err) {
        // If the refresh token has also expired or is invalid, destroy the local session 
        // and force the client to redirect to the login view.
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
      }
    }
    
    // Pass along any other API errors (e.g., 400 Bad Request, 500 Internal Error) to the component layer.
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
};

/**
 * Applications Service Wrapper:
 * Handles CRUD operations and analytical operations for credit scoring application workflows.
 */
export const applicationsAPI = {
  // Retrieves a listing of all past credit assessments submitted by the active user
  getAll: () =>
    api.get('/applications/'),
  
  // Creates and saves a new standalone credit application entry
  create: (data) =>
    api.post('/applications/', data),
  
  // Hard deletes a selected credit application record from the database
  delete: (id) =>
    api.delete(`/applications/${id}/`),
};

export const clientsAPI = {
  getPresets: () =>
    api.get('/clients/presets/'),

  search: (params) =>
    api.get('/clients/search/', { params }),

  getFeatures: (skIdCurr) =>
    api.get(`/clients/features/${skIdCurr}/`),
};

export default api;