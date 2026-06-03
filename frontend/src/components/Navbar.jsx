import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserIcon, LogOutIcon, SunIcon, MoonIcon } from './Icons';

export default function Navbar({ theme, toggleTheme }) {
  // Dropdown state and navigation controls
  const [showDropdown, setShowDropdown] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  // Clears active session credentials and reroutes to the home screen
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Closes dropdown menu if user clicks anywhere outside of it
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
    <nav className="navbar">
      <Link to="/" className="navbar-logo text-main">
        LoanSight
      </Link>

      <div className="navbar-menu">
        {isAuthenticated ? (
          <>
            <Link to="/dashboard" className="navbar-link">Dashboard</Link>
            
            {/* Interactive User Dropdown Area */}
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="avatar-button"
                title={user?.email}
                style={{ fontSize: '1.25rem' }}
              >
                🗿
              </button>

              {showDropdown && (
                <div className="dropdown-menu">
                  {/* Active Account Header Context */}
                  <div className="dropdown-header">
                    <p className="text-sm text-muted">Signed in as</p>
                    <p className="text-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</p>
                  </div>
                  <div className="dropdown-divider"></div>
                  
                  {/* Account Settings and Core Navigation */}
                  <Link
                    to="/profile"
                    className="dropdown-item"
                    onClick={() => setShowDropdown(false)}
                  >
                    <UserIcon /> Profile
                  </Link>

                  {/* UI Theme Controller Toggle */}
                  <button
                    onClick={() => {
                      toggleTheme();
                    }}
                    className="dropdown-item"
                  >
                    {theme === 'light' ? (
                      <><MoonIcon /> Dark Mode</>
                    ) : (
                      <><SunIcon /> Light Mode</>
                    )}
                  </button>

                  <div className="dropdown-divider"></div>
                  
                  {/* Session Sign Out Action */}
                  <button
                    onClick={handleLogout}
                    className="dropdown-item text-error"
                  >
                    <LogOutIcon /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Public Guest Gate Controls */
          <div className="flex gap-2">
            <Link to="/login" className="btn btn-secondary">Log in</Link>
            <Link to="/register" className="btn btn-primary">Register</Link>
          </div>
        )}
      </div>
    </nav>
  );
}