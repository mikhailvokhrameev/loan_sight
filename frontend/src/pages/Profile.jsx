import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api';

export default function Profile() {
  // Profile Identity Fields State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  // Mapping to the specific Home Credit operational dataset identifier
  const [skIdCurr, setSkIdCurr] = useState('');

  // Pipeline Feedback and Load-state Semaphores
  const [loading, setLoading] = useState(true); // Locks the entire view during initial mount hydration
  const [saving, setSaving] = useState(false);   // Disables inputs to prevent race-conditions during updates
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Router Hooks
  const navigate = useNavigate();

  // Component Initialization Lifecycle
  // Fires strictly once upon initial component mounting to populate the profile data from the server
  useEffect(() => {
    loadUserData();
  }, []);

  // Remote Ingestion Handler
  const loadUserData = async () => {
    try {
      // Fetch full authenticated session footprint from the server backend
      const response = await authAPI.getCurrentUser();
      
      // Populate state hooks. Using fallback logical OR operators ('') ensures 
      // form input text nodes remain controlled even if database fields are null.
      setFirstName(response.data.first_name || '');
      setLastName(response.data.last_name || '');
      setEmail(response.data.email);
      setSkIdCurr(response.data.sk_id_curr || '');
    } catch (err) {
      setError('Failed to load user data');
    } finally {
      setLoading(false); // Relinquish mount lock to render the profile canvas
    }
  };

  // Profile Patch Transaction Submission
  const handleSubmit = async (e) => {
    e.preventDefault(); // Intercept browser submission pipeline
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Discard stringified representations and cast the domain ID to a clean integer before payload dispatch
      await authAPI.updateProfile({
        first_name: firstName,
        last_name: lastName,
        sk_id_curr: skIdCurr ? Number(skIdCurr) : null,
      });
      
      // Fetch the freshly updated profile snapshot to synchronize local storage
      const userResponse = await authAPI.getCurrentUser();
      
      // Cache the updated user object in local persistence for persistent sync across app tabs
      localStorage.setItem('user', JSON.stringify(userResponse.data));
      
      setSuccess('Profile updated successfully');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false); // Re-enable text inputs and operational controls
    }
  };

  // Prevents the flickering of empty inputs or flash of layout variables before the API request resolves.
  if (loading) {
    return <p className="text-center text-muted mt-4">Loading profile...</p>;
  }

  return (
    <div className="max-w-md mt-4" style={{ margin: '0 auto' }}>
      <div className="card">
        <h2 className="mb-4">Edit Profile</h2>

        {/* Dynamic Context Feedback Components */}
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          {/* Read-Only Account Email Anchor (Security Best Practice) */}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              disabled // Accounts cannot mutate their core email key via this configuration panel
              style={{ backgroundColor: '#f3f4f6', color: '#9ca3af' }}
            />
          </div>

          {/* First Name Field */}
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input
              type="text"
              className="form-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={saving} // Lock input elements during active submission pipelines
            />
          </div>

          {/* Last Name Field */}
          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input
              type="text"
              className="form-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Domain Specific Tracking Profile ID */}
          <div className="form-group">
            <label className="form-label">Home Credit Client ID (SK_ID_CURR)</label>
            <input
              type="number"
              className="form-input"
              value={skIdCurr}
              onChange={(e) => setSkIdCurr(e.target.value)}
              disabled={saving}
              placeholder="e.g. 100002"
            />
          </div>

          {/* Form Command Controls Footer */}
          <div className="flex gap-2 mt-4">
            {/* Submit Control Trigger */}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            
            {/* Context Dismissal Navigation Trigger */}
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}