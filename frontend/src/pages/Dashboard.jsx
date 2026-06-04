import { useState, useEffect } from 'react';
import { applicationsAPI } from '../api';
import { PlusCircleIcon, HistoryIcon, TrashIcon } from '../components/Icons';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  // UI Layout and Navigation States
  const [activeTab, setActiveTab] = useState('new-assessment');
  const [applications, setApplications] = useState([]);
  
  // Network Pipeline Semaphores
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Modal Overlay Controls
  const [showModal, setShowModal] = useState(false);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  
  // Auth Session Lifecycle Global Hooks
  const { user } = useAuth();

  // Controlled Form State Schema
  const [formData, setFormData] = useState({
    amt_income: '',
    amt_credit: '',
    currency: 'RUB', // Defaults to RUB
  });

  // ML Model Output Payload Tracking State
  const [result, setResult] = useState(null);

  // Lazy Loading Data Lifecycle Trigger
  // Fetches history records only when the user explicitly shifts focus to the "History" panel
  useEffect(() => {
    if (activeTab === 'history') {
      loadApplications();
    }
  }, [activeTab]);

  // Historical Records Ingestion Handler
  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await applicationsAPI.getAll();
      // Gracefully handle both paginated structures (Django DRF default) and clean arrays
      const data = response.data.results ? response.data.results : response.data;
      setApplications(data);
    } catch (err) {
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic Universal Input State Synchronizer
  // Leverages computed property names to bind multiple inputs to a single state object
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Scoring Submission Dispatcher
  const handleSubmitAssessment = async (e) => {
    e.preventDefault(); // Guard against page reloads
    setLoading(true);
    setError('');
    setSuccess('');
    setResult(null); // Evict past data structures to clear state

    try {
      // Parse semantic strings back into high-precision floating point configurations
      const response = await applicationsAPI.create({
        amt_income: Number(formData.amt_income),
        amt_credit: Number(formData.amt_credit),
        currency: formData.currency,
      });
      
      // Store LightGBM inference metrics and open the notification dialogue
      setResult(response.data);
      setShowModal(true);
      
      // Reset form variables back to baseline defaults post successful validation
      setFormData({
        amt_income: '',
        amt_credit: '',
        currency: 'RUB',
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create assessment');
    } finally {
      setLoading(false);
    }
  };

  // // Transactional Purge Handler
  // const handleDeleteApplication = async (id) => {
  //   if (window.confirm('Are you sure you want to delete this application?')) {
  //     try {
  //       await applicationsAPI.delete(id);
  //       // Instantly filter state array to omit deleted row without full reload
  //       setApplications(applications.filter(app => app.id !== id));
  //     } catch (err) {
  //       setError('Failed to delete application');
  //     }
  //   }
  // };


  // DELETE FLOW (MODAL VERSION)
  // Open custom confirmation modal instead of window.confirm
  const openDeleteModal = (id) => {
    setDeleteTargetId(id);
    setShowDeleteModal(true);
  };

  // Confirm deletion after user clicks "Delete"
  const confirmDeleteApplication = async () => {
    try {
      await applicationsAPI.delete(deleteTargetId);

      // Remove deleted item from UI state instantly
      setApplications(applications.filter(app => app.id !== deleteTargetId));

      setShowDeleteModal(false);
      setDeleteTargetId(null);
    } catch (err) {
      setError('Failed to delete application');
    }
  };

  // Maps API classification strings into semantic theme CSS badge classes
  const getRiskColor = (risk) => {
    if (!risk) return 'text-muted';
    switch (risk.toLowerCase()) {
      case 'low': return 'badge-success';
      case 'medium': return 'badge-warning';
      case 'high': return 'badge-error';
      default: return 'text-muted';
    }
  };

  // Dynamic Fallback Evaluation
  const getDisplayName = () => {
    return user?.first_name || 'User';
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl" style={{ fontWeight: 600, fontSize: '1.5rem' }}>Dashboard</h1>

      {/* Global Status Alerts */}
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Tab Switcher Headers Layout */}
      <div className="tabs-header">
        <button
          className={`tab-button flex items-center gap-2 ${activeTab === 'new-assessment' ? 'active' : ''}`}
          onClick={() => setActiveTab('new-assessment')}
        >
          <PlusCircleIcon /> New Assessment
        </button>
        <button
          className={`tab-button flex items-center gap-2 ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <HistoryIcon /> Request History
        </button>
      </div>

      {/* Main Reactive Tab Panel Engine */}
      <div>
        {/* VIEW A: Assessment Capture Panel */}
        {activeTab === 'new-assessment' && (
          <div className="card max-w-md" style={{ margin: 0 }}>
            <form onSubmit={handleSubmitAssessment}>
              
              {/* Operational Currency Selector */}
              <div className="form-group">
                <label className="form-label">Currency for Income & Loan</label>
                <select
                  name="currency"
                  className="form-select"
                  value={formData.currency}
                  onChange={handleFormChange}
                  disabled={loading}
                >
                  <option value="RUB">RUB</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="KZT">KZT</option>
                  <option value="BYN">BYN</option>
                </select>
              </div>

              {/* Monthly Income Field */}
              <div className="form-group">
                <label className="form-label">Monthly Income (in {formData.currency})</label>
                <input
                  type="number"
                  name="amt_income"
                  className="form-input"
                  value={formData.amt_income}
                  onChange={handleFormChange}
                  required min="0" step="0.01" disabled={loading}
                />
              </div>

              {/* Credit Principal Requirement Field */}
              <div className="form-group">
                <label className="form-label">Desired Loan Amount (in {formData.currency})</label>
                <input
                  type="number"
                  name="amt_credit"
                  className="form-input"
                  value={formData.amt_credit}
                  onChange={handleFormChange}
                  required min="0" step="0.01" disabled={loading}
                />
              </div>

              {/* Submission Execution Control */}
              <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading}>
                {loading ? 'Processing...' : 'Get Assessment'}
              </button>
            </form>
          </div>
        )}

        {/* VIEW B: Request Historical Footprint Grid */}
        {activeTab === 'history' && (
          <div>
            {loading ? (
              <p className="text-center text-muted mt-4">Loading history...</p>
            ) : applications.length === 0 ? (
              <p className="text-center text-muted mt-4">No applications found.</p>
            ) : (
              <div className="grid">
                {applications.map((app, index) => (
                  <div key={app.id} className="card">
                    {/* Header Row: Tracking Context and Score Badging */}
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-muted">
                        Request #{applications.length - index}
                      </span>
                      <span className={`badge ${getRiskColor(app.risk_label)}`}>
                        {app.risk_label || 'Unknown'}
                      </span>
                    </div>
                    {/* Core Parameters Breakdown */}
                    <div className="mb-4">
                      <p className="font-medium text-lg">{app.amt_credit} {app.currency}</p>
                      <p className="text-sm text-muted">Income: {app.amt_income} {app.currency}</p>
                    </div>
                    {/* Footer Row: Timestamp Logs and Action Buttons */}
                    <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                      <span className="text-xs text-muted">
                        {new Date(app.created_at).toLocaleDateString()}
                      </span>
                      <button
                        className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--error)' }}
                        onClick={() => openDeleteModal(app.id)}
                        title="Delete"
                      >
                        <TrashIcon /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Overlay Container: Machine Learning Results Output */}
      {showModal && result && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '90%', textAlign: 'center', margin: '0 auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h2 className="mb-4" style={{ fontSize: '1.25rem' }}>Assessment Complete</h2>
            
            <p className="mb-4" style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
              <strong>{getDisplayName()}</strong>, your estimated credit risk is:
            </p>
            
            {/* Dynamic Model Output Badge */}
            <div className="mb-4 flex justify-center">
              <span className={`badge ${getRiskColor(result.risk_label)}`} style={{ fontSize: '1.1rem', padding: '0.5rem 1rem' }}>
                {result.risk_label ? `${result.risk_label} Risk` : 'Prediction Unavailable'}
              </span>
            </div>
            
            {/* Analytical Metadata Diagnostics Block */}
            <p className="text-sm text-muted mb-4">
              Probability Score: {
                result.probability !== undefined && result.probability !== null 
                  ? `${(Number(result.probability) * 100).toFixed(1)}%` 
                  : 'N/A'
              } <br/>
              Requested: {result.amt_credit} {result.currency}
            </p>

            {/* Modal Closer Control */}
            <button className="btn btn-primary w-full justify-center" onClick={() => setShowModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
       {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div className="card" style={{ maxWidth: '380px', width: '90%', textAlign: 'center' }}>
            <h2 className="mb-2">Delete application?</h2>

            <p className="text-sm text-muted mb-4">
              This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-secondary w-full"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTargetId(null);
                }}
              >
                Cancel
              </button>

              <button
                className="btn w-full"
                style={{ backgroundColor: 'var(--error)', color: 'white' }}
                onClick={confirmDeleteApplication}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}