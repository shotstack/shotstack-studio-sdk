import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import { ShotstackProvider } from './lib/shotstack/ShotstackContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ShotstackProvider>
    <App />
  </ShotstackProvider>
);
