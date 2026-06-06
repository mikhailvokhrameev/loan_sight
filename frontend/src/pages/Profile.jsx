import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api';

export default function Profile() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    authAPI.getCurrentUser().then(res => {
      setFirstName(res.data.first_name || '');
      setLastName(res.data.last_name || '');
      setEmail(res.data.email);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(''); setSuccess('');
    try {
      await authAPI.updateProfile({ first_name: firstName, last_name: lastName });
      setSuccess('Profile updated successfully');
    } catch (err) {
      setError('Failed to update profile');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="text-center mt-20 text-muted">Loading profile...</div>;

  return (
    <div className="max-w-md w-full mx-auto mt-10">
      <div className="bg-card border border-border rounded-md p-8 shadow-sm">
        <h2 className="text-2xl font-bold mb-8 text-main">Profile Settings</h2>

        {error && <div className="p-4 rounded-sm text-sm mb-4 bg-error-bg text-error border border-red-200">{error}</div>}
        {success && <div className="p-4 rounded-sm text-sm mb-4 bg-success-bg text-success border border-emerald-200">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2 text-main">Email</label>
            <input
              type="email"
              className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-hover-bg text-muted cursor-not-allowed outline-none transition-colors"
              value={email}
              disabled
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium mb-2 text-main">First Name</label>
            <input type="text" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none transition-all" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={saving} />
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium mb-2 text-main">Last Name</label>
            <input type="text" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none transition-all" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={saving} />
          </div>

          <div className="flex gap-4">
            <button type="submit" className="flex-1 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-sm hover:bg-primary-hover transition-all disabled:opacity-50" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" className="flex-1 py-2 text-sm font-bold border border-border text-main bg-transparent hover:bg-hover-bg rounded-sm transition-all" onClick={() => navigate('/dashboard')}>
              Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}