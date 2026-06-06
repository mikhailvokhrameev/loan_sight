import { useState, useEffect, useRef } from 'react';

const CATEGORICAL_FIELDS = [
  {
    key: 'FLAG_OWN_CAR',
    label: 'Owns a Car',
    description: 'Whether the client owns a vehicle.',
    options: ['No', 'Yes'],
  },
  {
    key: 'FLAG_OWN_REALTY',
    label: 'Owns Real Estate',
    description: 'Whether the client owns property or an apartment.',
    options: ['No', 'Yes'],
  },
  {
    key: 'NAME_FAMILY_STATUS',
    label: 'Marital Status',
    description: 'Civil status of the applicant.',
    options: ['Civil marriage', 'Married', 'Separated', 'Single / not married', 'Widow'],
  },
  {
    key: 'NAME_EDUCATION_TYPE',
    label: 'Education Level',
    description: 'Highest level of education completed.',
    options: [
      'Academic degree', 'Higher education', 'Incomplete higher',
      'Lower secondary', 'Secondary / secondary special',
    ],
  },
  {
    key: 'NAME_INCOME_TYPE',
    label: 'Employment Type',
    description: 'Primary source of income or type of employment.',
    options: [
      'Businessman', 'Commercial associate', 'Maternity leave', 'Pensioner',
      'State servant', 'Student', 'Unemployed', 'Working',
    ],
  },
];

const MONETARY_KEYS = new Set(['AMT_INCOME_TOTAL', 'AMT_CREDIT', 'AMT_ANNUITY', 'AMT_GOODS_PRICE']);

const NUMERIC_FIELDS = [
  {
    key: 'AMT_INCOME_TOTAL',
    label: 'Annual Income',
    descriptionTemplate: (c) => `Total annual income of the applicant (in ${c})`,
    step: 1000, min: 0,
  },
  {
    key: 'AMT_CREDIT',
    label: 'Loan Amount',
    descriptionTemplate: (c) => `Total loan amount requested (in ${c})`,
    step: 1000, min: 0,
  },
  {
    key: 'AMT_ANNUITY',
    label: 'Monthly Annuity',
    descriptionTemplate: (c) => `Monthly loan payment in ${c}. Affects debt burden ratios.`,
    step: 100, min: 0,
  },
  {
    key: 'DAYS_BIRTH',
    label: 'Age (years)',
    description: 'Client age. Stored internally as days, converted for display.',
    step: 1, min: 18, max: 100, isYears: true,
  },
  {
    key: 'DAYS_EMPLOYED',
    label: 'Years Employed',
    description: 'Duration at current job. Negative days converted to years.',
    step: 1, min: 0, max: 60, isYears: true,
  },
  {
    key: 'CNT_FAM_MEMBERS',
    label: 'Family Members',
    description: 'Total number of family members including the applicant.',
    step: 1, min: 1, max: 20,
  },
  {
    key: 'AMT_GOODS_PRICE',
    label: 'Goods Price',
    descriptionTemplate: (c) => `Price of the goods for which the loan is taken (in ${c}).`,
    step: 1000, min: 0,
  },
  {
    key: 'EXT_SOURCE_1',
    label: 'External Score 1',
    description: 'Normalized external credit rating from bureau #1 (0–1).',
    step: 0.001, min: 0, max: 1,
  },
  {
    key: 'EXT_SOURCE_2',
    label: 'External Score 2',
    description: 'Normalized external credit rating from bureau #2 (0–1).',
    step: 0.001, min: 0, max: 1,
  },
  {
    key: 'EXT_SOURCE_3',
    label: 'External Score 3',
    description: 'Normalized external credit rating from bureau #3 (0–1).',
    step: 0.001, min: 0, max: 1,
  },
];

const INPUT_CLASS =
  'w-full p-[0.625rem] border border-border rounded-sm text-sm bg-bg text-main focus:border-primary focus:outline-none';

export default function FeatureOverridePanel({ features, onChange, currency = 'RUB' }) {
  const [editedNumeric, setEditedNumeric] = useState({});
  const [editedCategorical, setEditedCategorical] = useState({});
  // Keep a ref so the delta effect always sees current features without stale closure.
  const featuresRef = useRef(features);
  featuresRef.current = features;

  useEffect(() => {
    if (!features) return;
    setEditedNumeric({ ...features.numeric_features });
    setEditedCategorical({ ...features.categorical_features });
  }, [features]);

  useEffect(() => {
    const feat = featuresRef.current;
    if (!feat) return;

    const numericDelta = {};
    for (const key of Object.keys(feat.numeric_features || {})) {
      const orig = feat.numeric_features[key];
      const edited = editedNumeric[key];
      if (orig === null || orig === undefined) {
        if (edited !== null && edited !== undefined) {
          numericDelta[key] = edited;
        }
      } else if (edited !== null && edited !== undefined && Math.abs(edited - orig) > 0.001) {
        numericDelta[key] = edited;
      }
    }

    const categoricalDelta = {};
    for (const key of Object.keys(feat.categorical_features || {})) {
      const orig = feat.categorical_features[key];
      const edited = editedCategorical[key];
      if (orig === null || orig === undefined) {
        if (edited !== null && edited !== undefined && edited !== '') {
          categoricalDelta[key] = edited;
        }
      } else if (edited !== orig) {
        categoricalDelta[key] = edited;
      }
    }

    onChange(numericDelta, categoricalDelta);
  }, [editedNumeric, editedCategorical]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNumericChange = (key, rawValue, isYears) => {
    const parsed = parseFloat(rawValue);
    if (isNaN(parsed)) {
      setEditedNumeric(prev => ({ ...prev, [key]: null }));
      return;
    }
    const stored = isYears ? -(parsed * 365) : parsed;
    setEditedNumeric(prev => ({ ...prev, [key]: stored }));
  };

  const handleCategoricalChange = (key, value) => {
    setEditedCategorical(prev => ({ ...prev, [key]: value || null }));
  };

  const handleReset = () => {
    if (!features) return;
    setEditedNumeric({ ...features.numeric_features });
    setEditedCategorical({ ...features.categorical_features });
    onChange({}, {});
  };

  const isNumericChanged = (key) => {
    const orig = features?.numeric_features?.[key];
    const edited = editedNumeric[key];
    if (orig === null || orig === undefined) {
      return edited !== null && edited !== undefined;
    }
    if (edited === null || edited === undefined) return false;
    return Math.abs(edited - orig) > 0.001;
  };

  const isCategoricalChanged = (key) => {
    const orig = features?.categorical_features?.[key];
    const edited = editedCategorical[key];
    if (orig === null || orig === undefined) {
      return edited !== null && edited !== undefined && edited !== '';
    }
    return edited !== orig;
  };

  const getNumericDisplayValue = (key, isYears) => {
    const val = editedNumeric[key];
    if (val === null || val === undefined) return '';
    return isYears ? Math.round(Math.abs(val) / 365) : val;
  };

  const getNumericOriginalDisplay = (key, isYears) => {
    const orig = features?.numeric_features?.[key];
    if (orig === null || orig === undefined) return 'No data';
    return isYears ? Math.round(Math.abs(orig) / 365) : orig;
  };

  const getCategoricalOriginalDisplay = (key) => {
    const orig = features?.categorical_features?.[key];
    return orig ?? 'No data';
  };

  const hasAnyChange =
    NUMERIC_FIELDS.some(f => isNumericChanged(f.key)) ||
    CATEGORICAL_FIELDS.some(f => isCategoricalChanged(f.key));

  return (
    <div>
      {hasAnyChange && (
        <button
          onClick={handleReset}
          className="text-xs text-muted underline cursor-pointer hover:text-main transition-colors mb-4"
        >
          ↺ Reset all changes
        </button>
      )}

      <p className="text-sm font-semibold text-main mb-3">Client Profile</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CATEGORICAL_FIELDS.map(({ key, label, description, options }) => {
          const changed = isCategoricalChanged(key);
          const origIsNull = features?.categorical_features?.[key] == null;
          const currentVal = editedCategorical[key] ?? '';
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-main flex items-center gap-1">
                {label}
                {changed && <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />}
              </label>
              <p className="text-xs text-muted">{description}</p>
              <select
                className={INPUT_CLASS}
                value={currentVal}
                onChange={e => handleCategoricalChange(key, e.target.value)}
              >
                {origIsNull && (
                  <option value="" disabled>No data</option>
                )}
                {options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {changed && (
                <p className="text-xs text-muted">Original: {getCategoricalOriginalDisplay(key)}</p>
              )}
            </div>
          );
        })}
      </div>

      <hr className="border-border my-5" />

      <p className="text-sm font-semibold text-main mb-3">Financial & Personal Data</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NUMERIC_FIELDS.map(({ key, label, description, descriptionTemplate, step, min, max, isYears }) => {
          const changed = isNumericChanged(key);
          const displayVal = getNumericDisplayValue(key, isYears);
          const desc = descriptionTemplate ? descriptionTemplate(currency) : description;
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-main flex items-center gap-1">
                {label}
                {changed && <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />}
              </label>
              <p className="text-xs text-muted">{desc}</p>
              <input
                type="number"
                className={INPUT_CLASS}
                value={displayVal}
                placeholder={displayVal === '' ? 'No data' : undefined}
                step="any"
                min={min}
                max={max}
                onChange={e => handleNumericChange(key, e.target.value, isYears)}
              />
              {changed && (
                <p className="text-xs text-muted">Original: {getNumericOriginalDisplay(key, isYears)}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
