import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] py-12">
      <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-main text-center">
        Credit Risk Machine Learning
      </h1>
      <p className="text-muted text-lg max-w-xl text-center mb-10 leading-relaxed">
        LoanSight utilizes advanced LightGBM models to provide instant credit scoring based on the Kaggle Home Credit dataset.
      </p>

      <div className="flex gap-4 justify-center mb-20">
        <Link to="/register" className="px-8 py-3 text-base font-semibold rounded-sm bg-primary text-primary-foreground hover:bg-primary-hover shadow-md transition-all">
          Get Started
        </Link>
        <Link to="/login" className="px-8 py-3 text-base font-semibold rounded-sm border border-border text-main bg-transparent hover:bg-gray-100 dark:hover:bg-[#161a20] transition-all">
          Log In
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
        {[
          { title: "Client Profile", desc: "Select a profile based on Home Credit database ID." },
          { title: "Smart Inputs", desc: "Define income and requested credit amounts easily." },
          { title: "ML Processing", desc: "The model analyzes 200+ features in milliseconds." },
          { title: "Instant Score", desc: "Get a transparent risk classification and probability." }
        ].map((item, idx) => (
          <div key={idx} className="bg-card border border-border rounded-md p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-sm font-bold mb-2 text-main uppercase tracking-wider">{item.title}</h3>
            <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}