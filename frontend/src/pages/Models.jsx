import { useState, useEffect, useRef } from 'react';
import { modelsAPI } from '../api';
import { TrashIcon } from '../components/Icons';
import ModelTypeBadge from '../components/ModelTypeBadge';

const METRIC_LABELS = {
  roc_auc:   'ROC AUC',
  auc:       'AUC',
  gini:      'Gini',
  ks:        'KS',
  f1:        'F1',
  precision: 'Precision',
  recall:    'Recall',
  accuracy:  'Accuracy',
  log_loss:  'Log Loss',
  brier:     'Brier Score',
};

const formatMetricValue = (key, value) => {
  if (typeof value !== 'number') return String(value);
  return key.toLowerCase().includes('loss') || key.toLowerCase().includes('brier')
    ? value.toFixed(4)
    : value.toFixed(3);
};

const MetricBar = ({ value }) => {
  if (typeof value !== 'number' || value < 0 || value > 1) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-success' : pct >= 65 ? 'bg-warning' : 'bg-error';
  return (
    <div className="mt-1.5 h-1 w-full bg-border rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const ModelCard = ({ model, onDelete }) => {
  const metrics = model.metrics || {};
  const metricEntries = Object.entries(metrics);

  return (
    <div className="bg-card border border-border rounded-md p-6 shadow-sm flex flex-col">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-base font-semibold text-main pr-2 break-words min-w-0">{model.name}</h3>
        <ModelTypeBadge type={model.model_type} />
      </div>

      <p className="text-xs text-muted mb-3">
        Added {new Date(model.created_at).toLocaleDateString('ru-RU')}
      </p>

      {model.description && (
        <p className="text-sm text-muted mb-4 leading-relaxed break-words">{model.description}</p>
      )}

      {metricEntries.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t border-border">
          {metricEntries.map(([key, value]) => (
            <div key={key}>
              <p className="text-[11px] text-muted uppercase tracking-wide">
                {METRIC_LABELS[key.toLowerCase()] ?? key}
              </p>
              <p className="text-base font-bold text-main leading-tight">
                {formatMetricValue(key, value)}
              </p>
              <MetricBar value={value} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted pt-4 border-t border-border">No metrics available.</p>
      )}

      <div className="flex justify-end pt-4 mt-auto border-t border-border">
        <button
          onClick={() => onDelete(model.id)}
          className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-error hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
        >
          <TrashIcon /> delete
        </button>
      </div>
    </div>
  );
};

const inputCls = 'w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none';

export default function Models() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [joblibFile, setJoblibFile] = useState(null);
  const [metadataFile, setMetadataFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const joblibRef = useRef(null);
  const metadataRef = useRef(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [showClearModal, setShowClearModal] = useState(false);

  useEffect(() => {
    modelsAPI.getAll()
      .then(res => setModels(res.data))
      .catch(() => setError('Failed to load models.'))
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError('');
    if (!joblibFile || !metadataFile) {
      setUploadError('Both .joblib and metadata.json files are required.');
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('description', form.description.trim());
    fd.append('joblib_file', joblibFile);
    fd.append('metadata_file', metadataFile);

    try {
      const res = await modelsAPI.upload(fd);
      setModels(prev => {
        const exists = prev.find(m => m.id === res.data.id);
        return exists ? prev.map(m => m.id === res.data.id ? res.data : m) : [...prev, res.data];
      });
      setShowUploadModal(false);
      setForm({ name: '', description: '' });
      setJoblibFile(null);
      setMetadataFile(null);
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await modelsAPI.delete(deleteTargetId);
      setModels(prev => prev.filter(m => m.id !== deleteTargetId));
    } catch {
      setError('Failed to delete model.');
    } finally {
      setShowDeleteModal(false);
      setDeleteTargetId(null);
    }
  };

  const confirmClearAll = async () => {
    try {
      await modelsAPI.clearAll();
      setModels([]);
    } catch {
      setError('Failed to delete all models.');
    } finally {
      setShowClearModal(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-main">Models</h1>
          <p className="text-sm text-muted mt-1">Active scoring models and their evaluation metrics.</p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => { setUploadError(''); setShowUploadModal(true); }}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-sm transition-all"
          >
            + Add Model
          </button>
          {models.length > 0 && (
            <button
              onClick={() => setShowClearModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-error border border-error rounded-sm hover:bg-error-bg transition-colors"
            >
              <TrashIcon /> delete all
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-sm text-sm mb-6 border border-red-300 bg-error-bg text-error">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted text-center py-16">Loading...</p>
      ) : models.length === 0 ? (
        <p className="text-sm text-muted text-center py-16">
          No active models found. Use the <strong>Add Model</strong> button to register one.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {models.map(model => (
            <ModelCard
              key={model.id}
              model={model}
              onDelete={(id) => { setDeleteTargetId(id); setShowDeleteModal(true); }}
            />
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowUploadModal(false)}>
          <div className="bg-card border border-border rounded-md p-8 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 text-main">Add Model</h2>
            <form onSubmit={handleUpload}>
              <div className="mb-5">
                <label className="block text-sm font-medium mb-2 text-main">Name</label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  disabled={uploading}
                />
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium mb-2 text-main">Description <span className="text-muted font-normal">(optional)</span></label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  maxLength={300}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Short description of this model"
                  disabled={uploading}
                />
                <p className="text-right text-[11px] text-muted mt-1">{form.description.length}/300</p>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium mb-2 text-main">Model File <span className="text-xs text-muted">.joblib</span></label>
                <input
                  ref={joblibRef}
                  type="file"
                  accept=".joblib"
                  className="hidden"
                  onChange={e => setJoblibFile(e.target.files[0] || null)}
                  disabled={uploading}
                />
                <button
                  type="button"
                  onClick={() => joblibRef.current?.click()}
                  className="w-full py-2 px-3 border border-dashed border-border rounded-sm text-sm text-muted hover:border-primary hover:text-main transition-colors text-left"
                  disabled={uploading}
                >
                  {joblibFile ? joblibFile.name : 'Click to select model.joblib'}
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2 text-main">Metadata File <span className="text-xs text-muted">.json</span></label>
                <input
                  ref={metadataRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={e => setMetadataFile(e.target.files[0] || null)}
                  disabled={uploading}
                />
                <button
                  type="button"
                  onClick={() => metadataRef.current?.click()}
                  className="w-full py-2 px-3 border border-dashed border-border rounded-sm text-sm text-muted hover:border-primary hover:text-main transition-colors text-left"
                  disabled={uploading}
                >
                  {metadataFile ? metadataFile.name : 'Click to select metadata.json'}
                </button>
              </div>

              {uploadError && (
                <div className="p-3 rounded-sm text-sm mb-4 border border-red-300 bg-error-bg text-error">{uploadError}</div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex-1 py-2 text-sm font-medium border border-border text-main hover:bg-hover-bg rounded-sm transition-all"
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-sm transition-all disabled:opacity-60"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete single model modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-md p-6 shadow-xl w-full max-w-[340px] text-center">
            <h2 className="text-lg font-semibold text-main mb-2">Are you sure?</h2>
            <p className="text-sm text-muted mb-6">This model will be permanently removed.</p>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2 text-sm font-medium border border-border text-main hover:bg-hover-bg rounded-sm transition-all"
                onClick={() => { setShowDeleteModal(false); setDeleteTargetId(null); }}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-2 text-sm font-medium bg-error text-white hover:opacity-90 rounded-sm transition-all"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete all models modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-md p-6 shadow-xl w-full max-w-[340px] text-center">
            <h2 className="text-lg font-semibold text-main mb-2">Are you sure?</h2>
            <p className="text-sm text-muted mb-6">All models will be permanently removed.</p>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2 text-sm font-medium border border-border text-main hover:bg-hover-bg rounded-sm transition-all"
                onClick={() => setShowClearModal(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-2 text-sm font-medium bg-error text-white hover:opacity-90 rounded-sm transition-all"
                onClick={confirmClearAll}
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
