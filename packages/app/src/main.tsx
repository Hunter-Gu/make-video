import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {Workbench} from './Workbench';
import {httpTransport} from './http-transport';
import './astryx.css';
import './styles.css';
import './editor-overrides.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={neutralTheme}>
    <Workbench transport={httpTransport} />
    </Theme>
  </StrictMode>,
);
