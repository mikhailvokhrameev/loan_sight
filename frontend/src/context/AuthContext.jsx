import { createContext, useState, useEffect, useContext } from 'react';
import api from '../api';

// Create a React Context for authentication. 
// This acts as a global data store for user session data, accessible by any component in the tree.
const AuthContext = createContext();

/**
 * AuthProvider Component:
 * A high-order provider component that encapsulates authentication state and logic.
 * It wraps the application root (or specific subtrees) to distribute session telemetry downward.
 */
export function AuthProvider({ children }) {
  // State to hold parsed user profile details (e.g., id, email, names).
  const [user, setUser] = useState(null);
  
  // State to block protected route rendering until localStorage has been audited on initial boot.
  const [loading, setLoading] = useState(true);
  
  // Quick-access flag indicating if an authorized user session is actively mounted.
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Fires exactly once when the application mounts. It inspects local storage to restore 
   * a previously active session, avoiding abrupt sign-outs when the browser page refreshes.
   */
  useEffect(() => {
    // Verify the httpOnly cookie is still valid by calling /auth/me/
    api.get('/auth/me/')
      .then(res => {
        setUser(res.data);
        localStorage.setItem('user', JSON.stringify(res.data));
        setIsAuthenticated(true);
      })
      .catch(() => {
        localStorage.removeItem('user');
        setUser(null);
        setIsAuthenticated(false);
      })
      .finally(() => setLoading(false));
  }, []);

  /**
   * login action:
   * Coordinates local session storage with active React state bindings upon successful credentials validation
   * @param {Object} userData - Serialized profile object returned from the backend
   * @param {string} accessToken - JWT short-lived authorization token
   * @param {string} refreshToken - JWT long-lived renewal token
   */
  const login = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
  };

  /**
   * logout action:
   * Purges all cryptographic credentials and metadata elements, revoking client-side session rights
   */
  const logout = async () => {
    try {
      await api.post('/auth/logout/', {});
    } catch {
      // Token already expired or server unreachable - proceed with local cleanup
    }
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
  };

  // Expose state and mutations via Context.Provider, making them available to all child tree subscribers
  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth (Custom Hook):
 * A convenient consumer hook that simplifies accessing the AuthContext payload.
 * Eliminates boilerplates of manually invoking useContext(AuthContext) inside individual components.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  // Throws an explicit error if a developer attempts to call 
  // useAuth() inside a component that is not positioned as a descendant of <AuthProvider>.
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider instance');
  }
  return context;
}