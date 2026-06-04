import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  // Extracting the authentication status from global auth context to handle route security
  const { isAuthenticated } = useAuth();

  // If a user is already authenticated smoothly redirect them straight to the main dashboard
  if (isAuthenticated) {
    // The 'replace' attribute overrides the current entry in the history stack,
    // ensuring that clicking the browser's "Back" button won't lock the user in a redirect loop.
    return <Navigate to="/dashboard" replace />;
  }

  return (
    // Public Landing Layout Container
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
      
      {/* Hero Section Headers */}
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '1rem', letterSpacing: '-0.02em' }}>
        Assess credit risk instantly
      </h1>
      <p className="text-muted" style={{ fontSize: '1.125rem', maxWidth: '500px', marginBottom: '2rem' }}>
        LoanSight uses advanced machine learning to provide fast, reliable credit scoring. Built for modern financial teams.
      </p>
      
      {/* Primary Call-to-Action Navigation Controls */}
      <div className="flex gap-4 justify-center">
        <Link to="/register" className="btn btn-primary btn-large">
          Get Started
        </Link>
        <Link to="/login" className="btn btn-secondary btn-large">
          Log In
        </Link>
      </div>
      
      {/* Feature Showcase Grid - Details the internal processing flow for end users */}
      <div className="grid mt-4 pt-4" style={{ marginTop: '4rem', textAlign: 'left', width: '100%' }}>
        
        {/* Input Collection Card */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>1. Simple Input</h3>
          <p className="text-sm text-muted">Enter basic applicant data including income and desired loan amount</p>
        </div>
        
        {/* Machine Learning Evaluation Framework Card */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>2. ML Analysis</h3>
          <p className="text-sm text-muted">Our ML model evaluates the profile against historical performance data.</p>
        </div>
        
        {/* Automated Resolution Card */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>3. Instant Decision</h3>
          <p className="text-sm text-muted">Receive a probability score and automated risk classification instantly.</p>
        </div>
        
      </div>
    </div>
  );
}