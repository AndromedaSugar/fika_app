import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initializeAnalytics } from './analytics';
import AnalyticsNotice from './AnalyticsNotice';

initializeAnalytics();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <>
      <App />
      <AnalyticsNotice />
    </>
  </React.StrictMode>
);

if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((error) => {
      console.error('Offline app shell registration failed:', error);
    });
  });
}
