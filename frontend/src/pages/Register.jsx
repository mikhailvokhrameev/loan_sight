import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api';

export default function Register() {
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', password2: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.password2) return setError('Passwords do not match');
    setError(''); setLoading(true);
    try {
      await authAPI.register(formData.email, formData.password, formData.firstName, formData.lastName);
      setSuccess('Account created!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) { setError('Registration failed.'); setLoading(false); }
  };

  return (
    <div className="max-w-md w-full mx-auto mt-10">
      <div className="bg-card border border-border rounded-md p-8 shadow-sm">
        <h2 className="text-2xl font-bold mb-8 text-main text-center">Register</h2>
        {error && <div className="p-4 rounded-sm text-sm mb-6 bg-error-bg text-error border border-red-200">{error}</div>}
        <form onSubmit={submit}>
          <div className="flex gap-4 mb-5">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2 text-main">First Name</label>
              <input type="text" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" onChange={e => setFormData({...formData, firstName: e.target.value})} required />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2 text-main">Last Name</label>
              <input type="text" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" onChange={e => setFormData({...formData, lastName: e.target.value})} required />
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2 text-main">Email</label>
            <input type="email" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" onChange={e => setFormData({...formData, email: e.target.value})} required />
          </div>
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2 text-main">Password</label>
            <input type="password" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" onChange={e => setFormData({...formData, password: e.target.value})} required />
          </div>
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2 text-main">Confirm Password</label>
            <input type="password" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" onChange={e => setFormData({...formData, password2: e.target.value})} required />
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 bg-primary text-white dark:text-[#05070b] font-bold rounded-sm hover:bg-primary-hover transition-all">
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
}