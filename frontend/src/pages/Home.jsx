import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const features = [
  {
    title: "Instant Risk Scoring",
    desc: "Get a default probability score in milliseconds — powered by Classic ML models trained on 300,000+ real loan applications.",
  },
  {
    title: "SHAP Explainability",
    desc: "Every score comes with a waterfall chart showing exactly which features drove the result up or down.",
  },
  {
    title: "Manual Feature Overrides",
    desc: "Adjust income, credit amount, and other features to run what-if scenarios before making a decision.",
  },
  {
    title: "Multi-Currency Support",
    desc: "View and override monetary features in RUB, USD, EUR, GBP, KZT, or BYN with automatic conversion.",
  },
  {
    title: "Model Comparison",
    desc: "Run two models side-by-side on the same client and measure how much their scores diverge.",
  },
  {
    title: "Experiment History",
    desc: "Every assessment is saved. Browse past results, compare outcomes, or delete records you no longer need.",
  },
];

const steps = [
  { step: "01", title: "Pick a Client", desc: "Select a borrower profile from the presets or use the Smart Search." },
  { step: "02", title: "Configure the Assessment", desc: "Choose Auto mode to use stored data as-is, or switch to Manual to override specific features and currency." },
  { step: "03", title: "Select a Model", desc: "Score with a single ML model variant or enable Compare mode to pit two models against each other." },
  { step: "04", title: "Review the Result", desc: "Get a risk label, default probability, and a SHAP waterfall chart — all in one view." },
];

export default function Home() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex flex-col items-center py-16 px-4">

      {/* Hero */}
      <div className="text-center max-w-2xl mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-5 tracking-tight text-main leading-tight">
          Credit Risk Scoring,<br />Explained.
        </h1>
        <p className="text-muted text-lg leading-relaxed mb-8">
          LoanSight runs classic ML models trained on the Kaggle Home Credit dataset to produce instant, interpretable default-probability scores — with SHAP explanations for every prediction.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/register" className="px-8 py-3 text-base font-semibold rounded-sm bg-primary text-primary-foreground hover:bg-primary-hover shadow-md transition-all">
            Get Started
          </Link>
          <Link to="/login" className="px-8 py-3 text-base font-semibold rounded-sm border border-border text-main bg-transparent hover:bg-hover-bg transition-all">
            Log In
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div className="w-full max-w-4xl mb-20">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted text-center mb-8">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(({ step, title, desc }) => (
            <div key={step} className="bg-card border border-border rounded-md p-6 shadow-sm">
              <p className="text-3xl font-black text-primary opacity-30 mb-3 leading-none">{step}</p>
              <h3 className="text-sm font-bold text-main mb-2">{title}</h3>
              <p className="text-xs text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted text-center mb-8">What you get</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ title, desc }) => (
            <div key={title} className="bg-card border border-border rounded-md p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-sm font-bold mb-2 text-main">{title}</h3>
              <p className="text-sm text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}