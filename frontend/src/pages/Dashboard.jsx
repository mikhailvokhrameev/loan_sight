import { useState, useEffect } from 'react';
import { applicationsAPI, clientsAPI } from '../api';
import { PlusCircleIcon, HistoryIcon, TrashIcon, UserIcon } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import ShapWaterfallChart from '../components/ShapWaterfallChart';
import ClientSelector from './ClientSelector';
import FeatureOverridePanel from '../components/FeatureOverridePanel';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('new-assessment');
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({ sk_id_curr: '' });
  const [currency, setCurrency] = useState('RUB');
  const [result, setResult] = useState(null);

  const [clientFeatures, setClientFeatures] = useState(null);
  const [numericOverrides, setNumericOverrides] = useState({});
  const [categoricalOverrides, setCategoricalOverrides] = useState({});
  const [assessmentMode, setAssessmentMode] = useState('auto');
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError] = useState('');

  useEffect(() => {
    if (activeTab === 'history') loadApplications();
  }, [activeTab]);

  const loadApplications = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await applicationsAPI.getAll();
      const data = response.data.results ? response.data.results : response.data;
      setApplications(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'sk_id_curr') {
      setClientFeatures(null);
      setNumericOverrides({});
      setCategoricalOverrides({});
      setAssessmentMode('auto');
    }
  };

  const handleSubmitAssessment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        sk_id_curr: Number(formData.sk_id_curr),
        currency: assessmentMode === 'manual' ? currency : 'RUB',
        overrides: assessmentMode === 'manual' ? numericOverrides : {},
        categorical_overrides: assessmentMode === 'manual' ? categoricalOverrides : {},
      };
      const response = await applicationsAPI.create(payload);
      setResult(response.data);
      setShowModal(true);
      setFormData({ sk_id_curr: '' });
      setCurrency('RUB');
      setClientFeatures(null);
      setNumericOverrides({});
      setCategoricalOverrides({});
      setAssessmentMode('auto');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create assessment');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteApplication = async () => {
    try {
      await applicationsAPI.delete(deleteTargetId);
      setApplications(applications.filter(app => app.id !== deleteTargetId));
      setShowDeleteModal(false);
    } catch (err) {
      setError('Failed to delete application');
    }
  };

  useEffect(() => {
    if (!formData.sk_id_curr) {
      setClientFeatures(null);
      setFeaturesError('');
      return;
    }
    const timer = setTimeout(async () => {
      setFeaturesLoading(true);
      setFeaturesError('');
      try {
        const res = await clientsAPI.getFeatures(Number(formData.sk_id_curr), currency);
        setClientFeatures(res.data);
      } catch {
        setFeaturesError('Client not found or could not load features.');
        setClientFeatures(null);
      } finally {
        setFeaturesLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [formData.sk_id_curr]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClientSelected = (sk_id_curr) => {
    setFormData({ sk_id_curr: String(sk_id_curr) });
    setNumericOverrides({});
    setCategoricalOverrides({});
    setAssessmentMode('auto');
    setCurrency('RUB');
    setClientFeatures(null);
    setActiveTab('new-assessment');
  };

  const handleCurrencyChange = async (newCurrency) => {
    setCurrency(newCurrency);
    setNumericOverrides({});
    setCategoricalOverrides({});
    if (!formData.sk_id_curr) return;
    setFeaturesLoading(true);
    setFeaturesError('');
    try {
      const res = await clientsAPI.getFeatures(Number(formData.sk_id_curr), newCurrency);
      setClientFeatures(res.data);
    } catch {
      setFeaturesError('Could not reload client features for the selected currency.');
    } finally {
      setFeaturesLoading(false);
    }
  };

  const getRiskColor = (risk) => {
    if (!risk) return 'text-muted';
    switch (risk.toLowerCase()) {
      case 'low': return 'bg-success-bg text-success';
      case 'medium': return 'bg-warning-bg text-warning';
      case 'high': return 'bg-error-bg text-error';
      default: return 'text-muted';
    }
  };

  return (
    <div className="w-full">
      <h1 className="mb-4 text-2xl font-semibold text-main">Dashboard</h1>

      {error && <div className="p-4 rounded-sm text-sm mb-4 border border-red-300 bg-error-bg text-error">{error}</div>}

      <div className="flex gap-6 border-b border-border mb-8">
        {[
          { id: 'new-assessment', label: 'New Assessment', icon: <PlusCircleIcon /> },
           { id: 'select-client', label: 'Select Client', icon: <UserIcon /> },
          { id: 'history', label: 'Request History', icon: <HistoryIcon /> },
        ].map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`pb-4 px-1 flex items-center gap-2 text-sm font-medium transition-all border-b-2 ${
              activeTab === id ? 'border-primary text-main' : 'border-transparent text-muted hover:text-main'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {activeTab === 'new-assessment' && (
        <div className="flex justify-center mt-4">
          <div className={`bg-card border border-border rounded-md p-8 shadow-md w-full transition-all ${assessmentMode === 'manual' && clientFeatures ? 'max-w-2xl' : 'max-w-md'}`}>
            <h2 className="text-xl mb-8 font-semibold text-center text-main">New Credit Risk Assessment</h2>
            <form onSubmit={handleSubmitAssessment}>
              <div className="mb-5">
                <label className="block text-sm font-medium mb-2 text-main">Client ID</label>
                <input type="number" name="sk_id_curr" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" value={formData.sk_id_curr} onChange={handleFormChange} required placeholder="e.g. 100002" disabled={loading} />
              </div>

              {formData.sk_id_curr && (
                <>
                  {featuresLoading && (
                    <div className="mb-5 text-xs text-muted text-center py-2">
                      Loading client data...
                    </div>
                  )}

                  {featuresError && (
                    <div className="mb-5 text-xs text-error">{featuresError}</div>
                  )}

                  {clientFeatures && !featuresLoading && (
                    <div className="mb-6">
                      <div className="flex gap-3 mb-5">
                        {[
                          { id: 'auto', label: 'Auto' },
                          { id: 'manual', label: 'Manual Override' },
                        ].map(({ id, icon, label }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setAssessmentMode(id)}
                            className={`flex-1 py-2 px-3 rounded-sm text-sm font-medium border transition-all ${
                              assessmentMode === id
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border text-muted hover:text-main'
                            }`}
                          >
                            {icon} {label}
                          </button>
                        ))}
                      </div>

                      {assessmentMode === 'auto' && (
                        <p className="text-xs text-muted text-center py-2">
                          All client data will be used as stored in the database.
                        </p>
                      )}

                      {assessmentMode === 'manual' && (
                        <>
                          <div className="mb-5">
                            <label className="block text-sm font-medium mb-2 text-main">Currency</label>
                            <select
                              className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
                              value={currency}
                              onChange={e => handleCurrencyChange(e.target.value)}
                              disabled={featuresLoading || loading}
                            >
                              {['RUB', 'USD', 'EUR', 'GBP', 'KZT', 'BYN'].map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <FeatureOverridePanel
                            features={clientFeatures}
                            currency={currency}
                            onChange={(numDelta, catDelta) => {
                              setNumericOverrides(numDelta);
                              setCategoricalOverrides(catDelta);
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}

                </>
              )}

              <button type="submit" className="w-full py-3 text-base font-medium rounded-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-all disabled:opacity-60" disabled={loading}>
                {loading ? 'Processing...' : 'Get Assessment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {applications.map((app, index) => (
            <div key={app.id} className="bg-card border border-border rounded-md p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-medium text-muted">Request #{applications.length - index}</span>
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wider ${getRiskColor(app.risk_label)}`}>
                  {app.risk_label}
                </span>
              </div>
              <div className="mb-6">
                <p className="font-bold text-xl text-main mb-1">{Number(app.amt_credit).toLocaleString()} {app.currency}</p>
                <p className="text-xs text-muted">Income: {Number(app.amt_income).toLocaleString()} {app.currency}</p>
                <p className="text-xs text-muted mt-1">Client ID: {app.sk_id_curr}</p>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-border">
                <span className="text-[10px] text-muted">{new Date(app.created_at).toLocaleDateString('ru-RU')}</span>
                <button
                  onClick={() => { setDeleteTargetId(app.id); setShowDeleteModal(true); }}
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-error hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                  <TrashIcon /> delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'select-client' && (
        <ClientSelector onClientSelected={handleClientSelected} />
      )}

      {/* Result Modal */}
      {showModal && result && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`bg-card border border-border rounded-md p-8 shadow-2xl w-full max-h-[90vh] overflow-y-auto text-center ${result.shap_values ? 'max-w-2xl' : 'max-w-sm'}`}>
            <h2 className="text-xl font-bold mb-2 text-main">Assessment Result</h2>
            <p className="text-sm text-muted mb-6">For <strong>{user?.first_name || 'User'}</strong></p>
            <div className="mb-6">
              <span className={`px-4 py-2 rounded-full text-lg font-bold ${getRiskColor(result.risk_label)}`}>
                {result.risk_label} Risk
              </span>
            </div>
            <p className="text-sm text-muted mb-4 leading-relaxed">
              Probability Score: <span className="text-main font-medium">{(Number(result.probability) * 100).toFixed(1)}%</span><br/>
              Loan: <span className="text-main font-medium">{Number(result.amt_credit).toLocaleString()} {result.currency}</span>
            </p>
            <ShapWaterfallChart shapValues={result.shap_values} loading={false} />
            <button className="w-full mt-6 py-2 bg-primary text-primary-foreground font-medium rounded-sm hover:bg-primary-hover transition-all" onClick={() => setShowModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-md p-6 shadow-xl w-full max-w-[340px] text-center">
            <h2 className="text-lg font-semibold text-main mb-2">Are you sure?</h2>
            <p className="text-sm text-muted mb-6">This assessment history will be permanently removed.</p>
            <div className="flex gap-3">
              <button className="flex-1 py-2 text-sm font-medium border border-border text-main hover:bg-hover-bg rounded-sm transition-all" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="flex-1 py-2 text-sm font-medium bg-error text-white hover:opacity-90 rounded-sm transition-all" onClick={confirmDeleteApplication}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}