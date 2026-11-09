import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './Popup';

import '../styles/tokens.css';
import '../styles/components.css';
import '../styles/base.css';

document.body.classList.add('popup-body');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);