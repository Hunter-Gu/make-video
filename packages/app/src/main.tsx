import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {App} from './App';
import {httpTransport} from './http-transport';
import './astryx.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={neutralTheme}>
    <App transport={httpTransport} />
    </Theme>
  </StrictMode>,
);
