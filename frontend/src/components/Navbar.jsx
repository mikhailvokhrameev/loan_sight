import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserIcon, LogOutIcon, SunIcon, MoonIcon } from './Icons';

export default function Navbar({ theme, toggleTheme }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="bg-header border-b border-border px-8 h-16 flex items-center justify-between sticky top-0 z-[100] transition-colors duration-300">
      <Link to="/" className="font-bold text-lg tracking-tight text-main">
        LoanSight
      </Link>

      <div className="flex items-center gap-6">
        {isAuthenticated ? (
          <>
            <Link to="/dashboard" className="text-sm text-muted font-medium transition-colors duration-200 hover:text-main">
              Dashboard
            </Link>
            <Link to="/models" className="text-sm text-muted font-medium transition-colors duration-200 hover:text-main">
              Models
            </Link>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="w-9 h-9 rounded-full bg-hover-bg border border-border text-main text-lg font-semibold flex items-center justify-center cursor-pointer transition-colors duration-300"
                title={user?.email}
              >
                🗿
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-md shadow-lg py-1 z-[110]">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-xs text-muted">Signed in as</p>
                    <p className="text-sm font-medium text-main truncate">{user?.email}</p>
                  </div>
                  
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-main hover:bg-hover-bg transition-colors"
                    onClick={() => setShowDropdown(false)}
                  >
                    <UserIcon /> Profile
                  </Link>

                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-main hover:bg-hover-bg transition-colors"
                  >
                    {theme === 'light' ? <><MoonIcon /> Dark Mode</> : <><SunIcon /> Light Mode</>}
                  </button>

                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-error hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOutIcon /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex gap-3">
            <Link to="/login" className="px-4 py-2 text-sm font-medium border border-border rounded-sm text-main bg-transparent hover:bg-hover-bg transition-all">
              Log in
            </Link>
            <Link to="/register" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-sm transition-all">
              Register
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}