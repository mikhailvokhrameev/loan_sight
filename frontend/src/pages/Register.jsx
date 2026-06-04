import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api';

export default function Register() {
  // Form State Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  
  // Maps to the Home Credit dataset client tracking ID
  const [skIdCurr, setSkIdCurr] = useState('');

  // UI Feedback and Async Control States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Router Navigation Hook
  const navigate = useNavigate();

  // Form Submission Handler
  const submit = async (e) => {
    e.preventDefault(); // Intercept default browser page refresh behavior
    setError('');
    setSuccess('');
    
    // Preliminary client-side sanity check for password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    // Verify passwords match
    if (password !== password2) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);

    try {
      // Deliver registration payload including personal details and custom tracking ID to the API
      await authAPI.register(email, password, firstName, lastName, skIdCurr);
      setSuccess('Account created successfully! Redirecting...');
      
      // Set a timeout block to display the success message before automating the view swap
      setTimeout(() => {
        // Forward user to the login screen, attaching a flash notification payload within the navigation state
        navigate('/login', { state: { message: 'Registration successful! Please log in.' } });
      }, 2000);
    } catch (err) {
      // Robust error extraction. Accounts for targeted validation arrays sent by backend frameworks like DRF field errors
      const errorMsg = 
        err.response?.data?.error?.email?.[0] ||
        err.response?.data?.error?.password?.[0] ||
        err.response?.data?.error?.email ||
        err.response?.data?.error?.non_field_errors?.[0] ||
        err.response?.data?.error ||
        err.response?.data?.detail || 
        'Registration failed. Please check your data.';
      
      console.error('Registration error:', err.response?.data);
      setError(errorMsg);
      setLoading(false); // Restore UI controls so the user can amend their inputs
    }
  };

  return (
    <div className="max-w-md mt-4">
      <div className="card">
        <h2 className="mb-4">Create an account</h2>

        {/* Status Messaging Alerts */}
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={submit}>
          {/* Grouped Personal Info Fields */}
          <div className="flex gap-4 mb-4">
            <div className="w-full">
              <label className="form-label">First Name</label>
              <input
                type="text"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="form-input"
                required
                disabled={loading || success} // Prevent edits during API operations or post-success redirections
              />
            </div>
            <div className="w-full">
              <label className="form-label">Last Name</label>
              <input
                type="text"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="form-input"
                required
                disabled={loading || success}
              />
            </div>
          </div>

          {/* Email Registration Input */}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              required
              disabled={loading || success}
            />
          </div>

          {/* Optional Business-Domain Input Profile */}
          <div className="form-group">
            <label className="form-label">Home Credit Client ID (SK_ID_CURR)</label>
            <input
              type="number"
              placeholder="100002"
              value={skIdCurr}
              onChange={(e) => setSkIdCurr(e.target.value)}
              className="form-input"
              disabled={loading || success}
            />
          </div>

          {/* Password Security Input */}
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              required
              disabled={loading || success}
            />
          </div>

          {/* Confirm Password Input */}
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="form-input"
              required
              disabled={loading || success}
            />
          </div>

          {/* Action Trigger button - locks up immediately when submission pipeline triggers */}
          <button
            type="submit"
            disabled={loading || success}
            className="btn btn-primary w-full justify-center"
          >
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>
        
        {/* Navigation fallback for existing accounts */}
        <p className="text-center text-sm text-muted mt-4">
          Already have an account? <Link to="/login" style={{color: 'var(--primary)', fontWeight: 500}}>Log in</Link>
        </p>
      </div>
    </div>
  );
}