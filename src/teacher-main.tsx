import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherAccessApp from './TeacherAccessApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TeacherAccessApp />
  </StrictMode>
);
