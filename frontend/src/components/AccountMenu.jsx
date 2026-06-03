import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export default function AccountMenu({ theme, setTheme }) {
  // UI Visibility and Profile Anchoring States
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const menuRef = useRef(null);

  // Optimizes networking overhead by fetching user session profiles 
  // exclusively when the dropdown drawer is expanded.
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const res = await axios.get('/api/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(res.data);
        }
      } catch (error) {}
    };
    
    if (isOpen) {
      fetchUser();
    }
  }, [isOpen]);

  // Detects window interaction layouts and automatically dismisses 
  // the contextual overlay menu if an external target node is selected.
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Primary Trigger Switch */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-500 dark:bg-gray-700 px-3 py-1 rounded hover:bg-blue-600 dark:hover:bg-gray-600 transition text-white"
      >
        Account
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
          
          {/* Identity Context Panel */}
          {user ? (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">Your Account</p>
              <p className="font-semibold text-gray-900 dark:text-white break-words">{user.email}</p>
            </div>
          ) : (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
            </div>
          )}

          {/* Application Layout Theme Switcher */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <button 
              onClick={() => {
                setTheme(theme === 'light' ? 'dark' : 'light');
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <span className="text-gray-700 dark:text-gray-300">
                {theme === 'light' ? 'Dark Theme' : 'Light Theme'}
              </span>
              <span className="text-lg">{theme === 'light' ? '🌙' : '☀️'}</span>
            </button>
          </div>

          {/* Session Destruction Command (Log Out) */}
          {user && (
            <div className="p-4">
              <button 
                onClick={() => {
                  localStorage.removeItem('token');
                  window.location.href = '/login';
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}