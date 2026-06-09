import { useState, useEffect } from 'react';
import { experimentsAPI, clientsAPI, modelsAPI } from '../api';
import { PlusCircleIcon, HistoryIcon, TrashIcon, UserIcon } from '../components/Icons';
import ShapWaterfallChart from '../components/ShapWaterfallChart';
import ModelTypeBadge from '../components/ModelTypeBadge';
import ClientSelector from './ClientSelector';
import FeatureOverridePanel from '../components/FeatureOverridePanel';

const getRiskColor = (risk) => {
  if (!risk) return 'text-muted';
  switch (risk.toLowerCase()) {
    case 'low': return 'bg-success-bg text-success';
    case 'medium': return 'bg-warning-bg text-warning';
    case 'high': return 'bg-error-bg text-error';
    default: return 'text-muted';
  }
};

// Returns display-ready data regardless of experiment type or record age
const getExperimentDisplay = (exp) => {
  const probs = exp.probability;
  const risks = exp.risk_label;
  const meta = exp.results || [];

  if (exp.experiment_type === 'compare') {
    if (Array.isArray(probs) && probs.length >= 2) {
      const diff = Math.round(Math.abs(probs[0] - probs[1]) * 10000) / 100;
      return {
        type: 'compare',
        a: { probability: probs[0], risk_label: Array.isArray(risks) ? risks[0] : null, model_name: meta[0]?.name || meta[0]?.model_name || null, model_type: meta[0]?.model_type || null, latency_ms: meta[0]?.latency_ms || null },
        b: { probability: probs[1], risk_label: Array.isArray(risks) ? risks[1] : null, model_name: meta[1]?.name || meta[1]?.model_name || null, model_type: meta[1]?.model_type || null, latency_ms: meta[1]?.latency_ms || null },
        score_diff_pp: diff,
      };
    }
    if (meta.length >= 2 && meta[0].probability != null) {
      const diff = Math.round(Math.abs((meta[0].probability || 0) - (meta[1].probability || 0)) * 10000) / 100;
      return {
        type: 'compare',
        a: { probability: meta[0].probability, risk_label: meta[0].risk_label, model_name: meta[0].model_name || meta[0].name || null, model_type: meta[0].model_type || null, latency_ms: meta[0].latency_ms || null },
        b: { probability: meta[1].probability, risk_label: meta[1].risk_label, model_name: meta[1].model_name || meta[1].name || null, model_type: meta[1].model_type || null, latency_ms: meta[1].latency_ms || null },
        score_diff_pp: diff,
      };
    }
  }

  if (Array.isArray(probs) && probs.length > 0) {
    return {
      type: 'single',
      probability: probs[0],
      risk_label: Array.isArray(risks) ? risks[0] : (risks ?? null),
      model_name: meta[0]?.name || meta[0]?.model_name || exp.ml_model_name || null,
    };
  }
};

const ScoreDiffBlock = ({ scoreDiffPp }) => (
  <div className="text-center mt-4">
    <p className="text-sm text-muted">Score difference</p>
    <p className={`text-2xl font-bold mt-1 ${
      scoreDiffPp < 5 ? 'text-success' :
      scoreDiffPp < 15 ? 'text-warning' : 'text-error'
    }`}>
      {scoreDiffPp} %
    </p>
    <p className="text-xs text-muted mt-1">
      {scoreDiffPp < 5 ? 'Models agree' : scoreDiffPp < 15 ? 'Moderate disagreement' : 'Models significantly disagree'}
    </p>
  </div>
);

const ModalCloseButton = ({ onClick }) => (
  <button className="w-full mt-6 py-2 bg-primary text-primary-foreground font-medium rounded-sm hover:bg-primary-hover transition-all" onClick={onClick}>
    Close
  </button>
);

const ModelBadge = ({ name }) => (
  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
    {name}
  </span>
);

const ModelOptions = ({ models }) => models.map(m => (
  <option key={m.id} value={m.id}>{m.name} ({m.model_type})</option>
));

const ExperimentResultModal = ({ exp, onClose }) => {
  const display = getExperimentDisplay(exp);
  if (!display) return null;

  const subtitle = (
    <p className="text-sm text-muted mb-6 text-center">
      Client ID: <strong>{exp.sk_id_curr}</strong>
      {' · '}
      {new Date(exp.created_at).toLocaleDateString('ru-RU')}
    </p>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      {display.type === 'compare' ? (
        <div className="bg-card border border-border rounded-md p-8 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <h2 className="text-xl font-bold mb-2 text-main text-center">Model Comparison</h2>
          {subtitle}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[display.a, display.b].map((model, idx) => {
              const shapData = (Array.isArray(exp.shap_values) ? exp.shap_values[idx] : null) ?? null;
              return (
                <div key={idx} className="bg-card border border-border rounded-md p-6">
                  <p className="text-base font-semibold text-main">{model.model_name}</p>
                  {model.model_type && (
                    <div className="mt-1"><ModelTypeBadge type={model.model_type} /></div>
                  )}
                  <p className="text-3xl font-bold text-main mt-3">
                    {(model.probability * 100).toFixed(1)}%
                  </p>
                  <span className={`inline-block mt-2 px-2 py-1 rounded-full text-[10px] font-bold tracking-wider ${getRiskColor(model.risk_label)}`}>
                    {model.risk_label}
                  </span>
                  {model.latency_ms && (
                    <p className="text-xs text-muted mt-2">{model.latency_ms} ms</p>
                  )}
                  <div className="mt-4">
                    <ShapWaterfallChart shapValues={shapData} loading={false} />
                  </div>
                </div>
              );
            })}
          </div>
          <ScoreDiffBlock scoreDiffPp={display.score_diff_pp} />
          <ModalCloseButton onClick={onClose} />
        </div>
      ) : (
        (() => {
          const shapData = exp.results?.[0]?.shap_values
            ?? (Array.isArray(exp.shap_values) ? exp.shap_values[0] : exp.shap_values)
            ?? null;
          return (
            <div className={`bg-card border border-border rounded-md p-8 shadow-2xl w-full max-h-[90vh] overflow-y-auto text-center ${shapData ? 'max-w-2xl' : 'max-w-sm'}`} onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-2 text-main">Assessment Result</h2>
              {subtitle}
              <div className="mb-6">
                <span className={`px-4 py-2 rounded-full text-lg font-bold ${getRiskColor(display.risk_label)}`}>
                  {display.risk_label} Risk
                </span>
              </div>
              <p className="text-sm text-muted mb-4 leading-relaxed">
                Probability Score:{' '}
                <span className="text-main font-medium">
                  {display.probability != null ? `${(display.probability * 100).toFixed(1)}%` : '—'}
                </span>
              </p>
              {display.model_name && (
                <p className="text-xs text-muted mb-4">
                  Model: <ModelBadge name={display.model_name} />
                </p>
              )}
              <ShapWaterfallChart shapValues={shapData} loading={false} />
              <ModalCloseButton onClick={onClose} />
            </div>
          );
        })()
      )}
    </div>
  );
};

// Converts live compare API response to the same shape as stored experiments
const normalizeCompareResult = (result, skIdCurr) => ({
  sk_id_curr: skIdCurr,
  created_at: new Date().toISOString(),
  experiment_type: 'compare',
  probability: [result.model_a.probability, result.model_b.probability],
  risk_label: [result.model_a.risk_label, result.model_b.risk_label],
  results: [
    { name: result.model_a.name, model_type: result.model_a.model_type, probability: result.model_a.probability, risk_label: result.model_a.risk_label, latency_ms: result.model_a.latency_ms },
    { name: result.model_b.name, model_type: result.model_b.model_type, probability: result.model_b.probability, risk_label: result.model_b.risk_label, latency_ms: result.model_b.latency_ms },
  ],
  shap_values: [result.model_a.shap_values, result.model_b.shap_values],
});

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('new-assessment');
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedModelIdB, setSelectedModelIdB] = useState(null);

  const [formData, setFormData] = useState({ sk_id_curr: '' });
  const [currency, setCurrency] = useState('RUB');

  const [clientFeatures, setClientFeatures] = useState(null);
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  const [numericOverrides, setNumericOverrides] = useState({});
  const [categoricalOverrides, setCategoricalOverrides] = useState({});
  const [assessmentMode, setAssessmentMode] = useState('auto');
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError] = useState('');

  const resetOverrides = () => {
    setNumericOverrides({});
    setCategoricalOverrides({});
    setAssessmentMode('auto');
  };

  useEffect(() => {
    modelsAPI.getAll().then(res => {
      setModels(res.data);
      if (res.data.length > 0) setSelectedModelId(res.data[0].id);
      if (res.data.length > 1) setSelectedModelIdB(res.data[1].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadExperiments();
  }, [activeTab]);

  const loadExperiments = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await experimentsAPI.getAll();
      const data = response.data.results ? response.data.results : response.data;
      setExperiments(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load experiments');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'sk_id_curr') {
      setClientFeatures(null);
      resetOverrides();
    }
  };

  const handleSubmitAssessment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      let response;
      if (compareMode) {
        response = await modelsAPI.compare({
          sk_id_curr: Number(formData.sk_id_curr),
          overrides: assessmentMode === 'manual' ? numericOverrides : {},
          categorical_overrides: assessmentMode === 'manual' ? categoricalOverrides : {},
          model_id_a: selectedModelId,
          model_id_b: selectedModelIdB,
        });
        setSelectedExperiment(normalizeCompareResult(response.data, formData.sk_id_curr));
      } else {
        response = await experimentsAPI.create({
          sk_id_curr: Number(formData.sk_id_curr),
          currency: assessmentMode === 'manual' ? currency : 'RUB',
          overrides: assessmentMode === 'manual' ? numericOverrides : {},
          categorical_overrides: assessmentMode === 'manual' ? categoricalOverrides : {},
          model_id: selectedModelId,
        });
        setSelectedExperiment(response.data);
      }
      setFormData({ sk_id_curr: '' });
      setCurrency('RUB');
      setClientFeatures(null);
      resetOverrides();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create assessment');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteExperiment = async () => {
    try {
      await experimentsAPI.delete(deleteTargetId);
      setExperiments(experiments.filter(exp => exp.id !== deleteTargetId));
      setShowDeleteModal(false);
    } catch (err) {
      setError('Failed to delete experiment');
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
    resetOverrides();
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

  return (
    <div className="w-full">
      <h1 className="mb-4 text-2xl font-semibold text-main">Dashboard</h1>

      {error && <div className="p-4 rounded-sm text-sm mb-4 border border-red-300 bg-error-bg text-error">{error}</div>}

      <div className="flex gap-6 border-b border-border mb-8">
        {[
          { id: 'new-assessment', label: 'New Assessment', icon: <PlusCircleIcon /> },
           { id: 'select-client', label: 'Select Client', icon: <UserIcon /> },
          { id: 'history', label: 'Experiments Log', icon: <HistoryIcon /> },
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
                <input type="number" name="sk_id_curr" className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none" value={formData.sk_id_curr} onChange={handleFormChange} required placeholder="e.g. 100042" disabled={loading} />
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

              {models.length > 1 && (
                <div className="mb-5">
                  <label className="block text-sm font-medium mb-2 text-main">
                    Scoring Model
                  </label>
                  <select
                    className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
                    value={selectedModelId ?? ''}
                    onChange={e => setSelectedModelId(Number(e.target.value))}
                    disabled={loading}
                  >
                    <ModelOptions models={models} />
                  </select>
                  {selectedModelId && (() => {
                    const m = models.find(x => x.id === selectedModelId);
                    if (!m?.metrics) return null;
                    return (
                      <p className="text-xs text-muted mt-1">
                        {Object.entries(m.metrics)
                          .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(3) : v}`)
                          .join(' · ')}
                      </p>
                    );
                  })()}
                </div>
              )}

              {models.length >= 2 && (
                <div className="mb-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={compareMode}
                      onChange={e => setCompareMode(e.target.checked)}
                      disabled={loading}
                      className="accent-primary"
                    />
                    <span className="text-sm text-main">model comparison mode</span>
                  </label>
                  {compareMode && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium mb-2 text-main">Model B</label>
                      <select
                        className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
                        value={selectedModelIdB ?? ''}
                        onChange={e => setSelectedModelIdB(Number(e.target.value))}
                        disabled={loading}
                      >
                        <ModelOptions models={models} />
                      </select>
                    </div>
                  )}
                </div>
              )}

              <button type="submit" className="w-full py-3 text-base font-medium rounded-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-all disabled:opacity-60" disabled={loading}>
                {loading ? 'Processing...' : compareMode ? 'Compare Models' : 'Get Assessment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          {experiments.length > 0 && (
            <div className="flex justify-end mb-4">
              <button
                onClick={async () => {
                  if (!window.confirm('Delete all experiments?')) return;
                  try { await experimentsAPI.clearAll(); setExperiments([]); }
                  catch { setError('Failed to clear history'); }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-error border border-error rounded-sm hover:bg-error-bg transition-colors"
              >
                <TrashIcon /> delete all
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {experiments.map((exp, index) => {
              const display = getExperimentDisplay(exp);
              return (
                <div key={exp.id} className="bg-card border border-border rounded-md p-6 shadow-sm flex flex-col cursor-pointer hover:border-primary transition-colors" onClick={() => setSelectedExperiment(exp)}>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-medium text-muted">
                      #{experiments.length - index}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {display.type === 'compare' ? 'COMPARE' : 'SINGLE'}
                      </span>
                    </div>
                  </div>

                  {display.type === 'compare' ? (
                    <div className="mb-4 space-y-2">
                      {[display.a, display.b].map((m, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <span className="text-muted truncate max-w-[120px]">{m.model_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-main font-medium">{(m.probability * 100).toFixed(1)}%</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${getRiskColor(m.risk_label)}`}>{m.risk_label}</span>
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-muted pt-1">
                        Diff: <span className={`font-semibold ${display.score_diff_pp < 5 ? 'text-success' : display.score_diff_pp < 15 ? 'text-warning' : 'text-error'}`}>
                          {display.score_diff_pp} %
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4">
                      {display.model_name && (
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs text-muted">{display.model_name}</p>
                          {display.risk_label && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${getRiskColor(display.risk_label)}`}>
                              {display.risk_label}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-lg font-bold text-main">
                        {display.probability != null
                          ? `${(display.probability * 100).toFixed(1)}%`
                          : '—'}
                      </p>
                    </div>
                  )}

                  <div className="mb-4">
                    <p className="text-xs text-muted">Client ID: {exp.sk_id_curr}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {Number(exp.amt_credit).toLocaleString()} {exp.currency}
                    </p>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-border mt-auto">
                    <span className="text-[10px] text-muted">{new Date(exp.created_at).toLocaleDateString('ru-RU')}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTargetId(exp.id); setShowDeleteModal(true); }}
                      className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-error hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <TrashIcon /> delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'select-client' && (
        <ClientSelector onClientSelected={handleClientSelected} />
      )}

      {selectedExperiment && (
        <ExperimentResultModal exp={selectedExperiment} onClose={() => setSelectedExperiment(null)} />
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-md p-6 shadow-xl w-full max-w-[340px] text-center">
            <h2 className="text-lg font-semibold text-main mb-2">Are you sure?</h2>
            <p className="text-sm text-muted mb-6">This assessment history will be permanently removed.</p>
            <div className="flex gap-3">
              <button className="flex-1 py-2 text-sm font-medium border border-border text-main hover:bg-hover-bg rounded-sm transition-all" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="flex-1 py-2 text-sm font-medium bg-error text-white hover:opacity-90 rounded-sm transition-all" onClick={confirmDeleteExperiment}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
