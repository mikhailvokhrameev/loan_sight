import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  useEffect(() => {
    if (location.state?.message) {
      setSuccess(location.state.message);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await authAPI.login(email, password);
      localStorage.setItem('access_token', res.data.access);
      const userRes = await authAPI.getCurrentUser();
      login(userRes.data, res.data.access, res.data.refresh);
      navigate('/dashboard');
    } catch (err) {
      setError('Login failed. Please check your credentials.');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md w-full mx-auto mt-16">
      <div className="bg-card border border-border rounded-md p-8 shadow-sm">
        <h2 className="text-2xl font-bold mb-8 text-main text-center">Log in</h2>
        {error && <div className="p-4 rounded-sm text-sm mb-6 bg-error-bg text-error border border-red-200">{error}</div>}
        {success && <div className="p-4 rounded-sm text-sm mb-6 bg-success-bg text-success border border-emerald-200">{success}</div>}
        <form onSubmit={submit}>
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2 text-main">Email address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" required />
          </div>
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2 text-main">Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" required />
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-sm hover:bg-primary-hover transition-all disabled:opacity-60">
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-sm text-muted mt-8">
          New here? <Link to="/register" className="text-primary font-bold hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}