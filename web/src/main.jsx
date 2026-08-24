import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/misc'
import { I18nProvider } from '@/i18n'
import { SessionProvider } from '@/lib/session'
import { ToastProvider } from '@/components/Toaster'
import { ConfirmProvider } from '@/components/ConfirmDialog'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <TooltipProvider delayDuration={300} skipDelayDuration={200}>
          <ToastProvider>
            <ConfirmProvider>
              <SessionProvider>
                <App />
              </SessionProvider>
            </ConfirmProvider>
          </ToastProvider>
        </TooltipProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
)
