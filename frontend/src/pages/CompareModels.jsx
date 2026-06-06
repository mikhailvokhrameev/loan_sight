import { useState, useEffect } from 'react';
import { modelsAPI } from '../api';
import ShapWaterfallChart from '../components/ShapWaterfallChart';

const getRiskColor = (risk) => {
  if (!risk) return 'text-muted';
  switch (risk.toLowerCase()) {
    case 'low': return 'bg-success-bg text-success';
    case 'medium': return 'bg-warning-bg text-warning';
    case 'high': return 'bg-error-bg text-error';
    default: return 'text-muted';
  }
};

export default function CompareModels() {
  const [models, setModels] = useState([]);
  const [modelIdA, setModelIdA] = useState('');
  const [modelIdB, setModelIdB] = useState('');
  const [skIdCurr, setSkIdCurr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    modelsAPI.getAll().then(res => {
      setModels(res.data);
      if (res.data.length >= 1) setModelIdA(String(res.data[0].id));
      if (res.data.length >= 2) setModelIdB(String(res.data[1].id));
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await modelsAPI.compare({
        sk_id_curr: Number(skIdCurr),
        overrides: {},
        categorical_overrides: {},
        model_id_a: Number(modelIdA),
        model_id_b: Number(modelIdB),
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Comparison failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (models.length < 2) {
    return (
      <div className="w-full">
        <h1 className="mb-4 text-2xl font-semibold text-main">Compare Models</h1>
        <p className="text-sm text-muted text-center py-12">
          At least 2 active models are required for comparison.<br />
          Register another model via Django admin or management command.
        </p>
      </div>
    );
  }

  const sameModel = modelIdA && modelIdB && modelIdA === modelIdB;

  return (
    <div className="w-full">
      <h1 className="mb-8 text-2xl font-semibold text-main">Compare Models</h1>

      <div className="flex justify-center">
        <div className="bg-card border border-border rounded-md p-8 w-full max-w-md">
          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <label className="block text-sm font-medium mb-2 text-main">Client ID</label>
              <input
                type="number"
                className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
                value={skIdCurr}
                onChange={e => setSkIdCurr(e.target.value)}
                required
                placeholder="e.g. 100002"
                disabled={loading}
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium mb-2 text-main">Model A</label>
              <select
                className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
                value={modelIdA}
                onChange={e => setModelIdA(e.target.value)}
                disabled={loading}
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.model_type})</option>
                ))}
              </select>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium mb-2 text-main">Model B</label>
              <select
                className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
                value={modelIdB}
                onChange={e => setModelIdB(e.target.value)}
                disabled={loading}
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.model_type})</option>
                ))}
              </select>
            </div>

            {sameModel && (
              <p className="text-sm text-error mb-4">Please select two different models.</p>
            )}

            {error && (
              <div className="p-3 rounded-sm text-sm mb-4 border border-red-300 bg-error-bg text-error">{error}</div>
            )}

            <button
              type="submit"
              className="w-full py-3 text-base font-medium rounded-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-all disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </form>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            {[result.model_a, result.model_b].map((model, idx) => (
              <div key={idx} className="bg-card border border-border rounded-md p-6">
                <p className="text-base font-semibold text-main">{model.name}</p>
                <span className="inline-block mt-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {model.model_type}
                </span>
                <p className="text-3xl font-bold text-main mt-3">
                  {(model.probability * 100).toFixed(1)}%
                </p>
                <span className={`inline-block mt-2 px-2 py-1 rounded-full text-[10px] font-bold tracking-wider ${getRiskColor(model.risk_label)}`}>
                  {model.risk_label}
                </span>
                <p className="text-xs text-muted mt-2">{model.latency_ms} ms</p>
                <ShapWaterfallChart shapValues={model.shap_values} loading={false} />
              </div>
            ))}
          </div>

          <div className="text-center mt-4">
            <p className="text-sm text-muted">Score difference</p>
            <p className={`text-2xl font-bold mt-1 ${
              result.score_diff_pp < 5 ? 'text-success' :
              result.score_diff_pp < 15 ? 'text-warning' : 'text-error'
            }`}>
              {result.score_diff_pp} pp
            </p>
            <p className="text-xs text-muted mt-1">
              {result.score_diff_pp < 5
                ? 'Models agree'
                : result.score_diff_pp < 15
                ? 'Moderate disagreement'
                : 'Models significantly disagree'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
