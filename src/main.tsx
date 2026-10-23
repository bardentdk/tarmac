import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { auth } from '~/auth/session'
import App from './App'
import './styles.css'

void auth.restore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
