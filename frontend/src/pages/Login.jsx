import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  // State Declarations
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Router and Context Hooks
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Checks if the user was redirected here with a message in the navigation state 
  useEffect(() => {
    if (location.state?.message) {
      setSuccess(location.state.message);
      
      // Clear the history state to prevent the success alert from popping up again 
      // if the user decides to manually refresh the page.
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Form Submission Handler
  const submit = async (e) => {
    e.preventDefault(); // Prevent full page reload on submit
    setError('');
    setSuccess('');

    // Basic client-side validation fallback
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      // Request JWT authentication tokens from the backend
      const res = await authAPI.login(email, password);
      
      // Temporarily store the access token in localStorage.
      // This allows the Axios interceptor to pick it up immediately for the next request.
      localStorage.setItem('access_token', res.data.access);
      
      // Fetch full user profile details
      const userRes = await authAPI.getCurrentUser();
      
      // Commit user data and tokens to the Auth Context to update the global app state
      login(userRes.data, res.data.access, res.data.refresh);
      
      // Redirect the authenticated user to their main interactive workspace
      navigate('/dashboard');
    } catch (err) {
      // Extract specific error details from backend response or use a generic fallback message
      const errorMsg = err.response?.data?.detail || err.response?.data?.error || 'Login failed. Please verify your credentials.';
      setError(errorMsg);
    } finally {
      setLoading(false); // Enable the submit button and inputs regardless of the outcome
    }
  };

  return (
    <div className="max-w-md mt-4">
      <div className="card">
        <h2 className="mb-4">Log in to LoanSight</h2>

        {/* Dynamic Alerts for Status Feedback */}
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={submit}>
          {/* Email Input Field */}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input 
              type="email" 
              placeholder="you@example.com" 
              value={email}
              onChange={e => setEmail(e.target.value)} 
              className="form-input" 
              required 
            />
          </div>

          {/* Password Input Field */}
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={e => setPassword(e.target.value)} 
              className="form-input" 
              required 
            />
          </div>

          {/* Submit Action Button */}
          {/* Disabled during API requests to prevent double-submissions */}
          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary w-full justify-center"
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        
        {/* Navigation Link to Registration */}
        <p className="text-center text-sm text-muted mt-4">
          Don't have an account? <Link to="/register" style={{color: 'var(--primary)', fontWeight: 500}}>Register now</Link>
        </p>
      </div>
    </div>
  );
}