import React from 'react';
import ReactDOM from 'react-dom/client';
import Manager from './Manager';

import '../styles/tokens.css';
import '../styles/components.css';
import '../styles/base.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Manager />
  </React.StrictMode>
);