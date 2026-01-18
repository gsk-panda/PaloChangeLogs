import React from 'react';
import ReactDOM from 'react-dom/client';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import App from './App';
import './index.css';
import { msalConfig, isOidcEnabled } from './authConfig';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'white', backgroundColor: '#1e293b' }}>
          <h1>Something went wrong</h1>
          <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

if (isOidcEnabled()) {
  console.log('[Auth Init] OIDC is enabled, initializing MSAL...');
  console.log('[Auth Init] MSAL Config:', {
    clientId: msalConfig.auth.clientId.substring(0, 8) + '...',
    authority: msalConfig.auth.authority,
    redirectUri: msalConfig.auth.redirectUri,
    cacheLocation: msalConfig.cache?.cacheLocation || 'sessionStorage'
  });
  
  const msalInstance = new PublicClientApplication(msalConfig);
  
  msalInstance.initialize().then(() => {
    console.log('[Auth Init] MSAL initialized successfully');
    
    msalInstance.addEventCallback((event) => {
      const payload = event.payload as any;
      console.log('[Auth Event]', event.eventType, {
        interactionType: event.interactionType,
        payload: payload ? {
          account: payload.account ? {
            name: payload.account.name,
            username: payload.account.username,
            homeAccountId: payload.account.homeAccountId,
            localAccountId: payload.account.localAccountId
          } : null,
          error: payload.error,
          errorDescription: payload.errorDescription
        } : null
      });
    });
    
    const accounts = msalInstance.getAllAccounts();
    console.log('[Auth Init] Found', accounts.length, 'cached account(s)');
    if (accounts.length > 0) {
      accounts.forEach((acc, idx) => {
        console.log(`[Auth Init] Cached account ${idx + 1}:`, {
          name: acc.name,
          username: acc.username,
          homeAccountId: acc.homeAccountId,
          idTokenClaims: acc.idTokenClaims ? Object.keys(acc.idTokenClaims) : null
        });
      });
      const activeAccount = msalInstance.getActiveAccount();
      console.log('[Auth Init] Active account:', activeAccount ? {
        name: activeAccount.name,
        username: activeAccount.username
      } : 'None');
    }
    
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <MsalProvider instance={msalInstance}>
            <App />
          </MsalProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  }).catch((error) => {
    console.error('[Auth Init] MSAL initialization failed:', error);
    console.error('[Auth Init] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <div style={{ padding: '20px', color: 'white', backgroundColor: '#1e293b' }}>
            <h1>Authentication Configuration Error</h1>
            <p>Failed to initialize authentication. Please check your configuration.</p>
            <button onClick={() => window.location.reload()}>Reload Page</button>
          </div>
        </ErrorBoundary>
      </React.StrictMode>
    );
  });
} else {
  const msalInstance = new PublicClientApplication(msalConfig);
  msalInstance.initialize().then(() => {
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <MsalProvider instance={msalInstance}>
            <App />
          </MsalProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  }).catch(() => {
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  });
}