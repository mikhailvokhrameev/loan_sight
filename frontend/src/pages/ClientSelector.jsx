import { useState, useEffect } from 'react';
import { clientsAPI } from '../api';

export default function ClientSelector({ onClientSelected }) {
  const [presets, setPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState('');

  const [filters, setFilters] = useState({
    age_min: '', age_max: '',
    income_min: '', income_max: '',
    had_late_payments: false,
  });
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    clientsAPI.getPresets()
      .then(res => setPresets(res.data))
      .catch(() => setPresetsError('Failed to load preset profiles. Make sure the backend is running.'))
      .finally(() => setPresetsLoading(false));
  }, []);

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSearch = async () => {
    setSearchLoading(true);
    setSearchError('');
    setSearched(false);
    try {
      const params = {};
      if (filters.age_min) params.age_min = filters.age_min;
      if (filters.age_max) params.age_max = filters.age_max;
      if (filters.income_min) params.income_min = filters.income_min;
      if (filters.income_max) params.income_max = filters.income_max;
      if (filters.had_late_payments) params.had_late_payments = 'true';
      const res = await clientsAPI.search(params);
      setSearchResults(res.data);
      setSearched(true);
    } catch (err) {
      setSearchError(err.response?.data?.detail || 'Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-main mb-1">Preset Profiles</h2>
        <p className="text-sm text-muted mb-5">
          Click a profile to instantly fill in the Client ID and go to the assessment form.
        </p>
        {presetsError && (
          <div className="p-3 rounded-sm text-sm mb-4 border border-red-300 bg-error-bg text-error">
            {presetsError}
          </div>
        )}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {presetsLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-44 h-28 bg-card border border-border rounded-md animate-pulse" />
              ))
            : presets.map(profile => (
                <button
                  key={profile.id}
                  onClick={() => onClientSelected(profile.sk_id_curr, profile.features)}
                  className="w-44 shrink-0 text-left bg-card border border-border rounded-md px-3 py-2.5 hover:border-primary transition-colors"
                >
                  <div className="text-sm font-semibold text-main leading-tight">{profile.label}</div>
                  <div className="text-[11px] text-muted leading-snug mt-0.5">{profile.description}</div>
                </button>
              ))
          }
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-main mb-1">Smart Search</h2>
        <p className="text-sm text-muted mb-5">
          Filter clients by parameters and pick one from the results.
        </p>
        <div className="bg-card border border-border rounded-md p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Age: from</label>
              <input
                type="number" name="age_min" value={filters.age_min}
                onChange={handleFilterChange} min="0" max="100"
                className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Age: to</label>
              <input
                type="number" name="age_max" value={filters.age_max}
                onChange={handleFilterChange} min="0" max="100"
                className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Income: from (RUB)</label>
              <input
                type="number" name="income_min" value={filters.income_min}
                onChange={handleFilterChange} min="0"
                className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Income: to (RUB)</label>
              <input
                type="number" name="income_max" value={filters.income_max}
                onChange={handleFilterChange} min="0"
                className="w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-5">
            <input
              type="checkbox" id="had_late_payments" name="had_late_payments"
              checked={filters.had_late_payments} onChange={handleFilterChange}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            <label htmlFor="had_late_payments" className="text-sm text-main cursor-pointer select-none">
              Had late payments
            </label>
          </div>

          <button
            onClick={handleSearch}
            disabled={searchLoading}
            className="w-full py-3 text-base font-medium rounded-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-all disabled:opacity-60"
          >
            {searchLoading ? 'Searching...' : 'Find Clients'}
          </button>
          {searchError && (
            <p className="text-sm text-error mt-3">{searchError}</p>
          )}
        </div>

        {searched && (
          searchResults.length === 0
            ? (
              <p className="text-sm text-muted">No clients match the selected filters. Try broader criteria.</p>
            )
            : (
              <div className="grid grid-cols-2 gap-3">
                {searchResults.map(client => (
                  <button
                    key={client.sk_id_curr}
                    onClick={() => onClientSelected(client.sk_id_curr, null)}
                    className="text-left bg-card border border-border rounded-md p-4 hover:border-primary transition-colors"
                  >
                    <div className="text-sm font-semibold text-main mb-2">
                      ID: {client.sk_id_curr}
                    </div>
                    <div className="text-xs text-muted space-y-0.5">
                      <div>Age: {client.age ?? 'N/A'}</div>
                      <div>
                        Income:{' '}
                        {client.amt_income_total != null
                          ? Number(client.amt_income_total).toLocaleString() + ' RUB'
                          : 'N/A'}
                      </div>
                      <div>
                        Ext score:{' '}
                        {client.ext_source_2 != null
                          ? client.ext_source_2.toFixed(3)
                          : 'N/A'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
        )}
      </section>
    </div>
  );
}