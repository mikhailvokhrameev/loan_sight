import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute Component:
 * Acts as a secure route guard that restricts access to private layout components based on the user's authentication state.
 * @param {ReactNode} children - The private component/page to render if authenticated.
 */
export default function ProtectedRoute({ children }) {
  // Consume the current authentication state and the boot-up loading flag from the global context.
  const { isAuthenticated, loading } = useAuth();

  /**
   * When the application or page refreshes, the AuthContext asynchronously audits localStorage 
   * to verify if a valid session exists. During this short window, 'loading' is true.
   * * We must halt evaluation and render a fallback UI here. Otherwise, 'isAuthenticated' 
   * defaults to false, which would trigger an unwanted and aggressive premature redirect to /login.
   */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  /**
   * If the synchronization with localStorage is complete and the client
   * does not possess an active validated session, block access entirely.
   * * We intercept the render tree and redirect the user back to the sign-in form.
   * The 'replace' attribute overwrites the current history entry to prevent infinite 
   * redirect loops when the user utilizes the browser's native navigation back-button.
   */
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  /**
   * If the authentication constraints pass successfully, transparently render the nested 
   * target component (e.g., Dashboard, Profile, Analytics dashboards).
   */
  return children;
}