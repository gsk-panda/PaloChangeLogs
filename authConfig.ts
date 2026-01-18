import { Configuration, PopupRequest } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || "";
const authority = import.meta.env.VITE_AZURE_AUTHORITY || "";
const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin + window.location.pathname;
const oidcEnabled = import.meta.env.VITE_OIDC_ENABLED !== "false" && import.meta.env.VITE_OIDC_ENABLED !== "0";

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId || "00000000-0000-0000-0000-000000000000",
    authority: authority || "https://login.microsoftonline.com/common",
    redirectUri: redirectUri,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest: PopupRequest = {
  scopes: ["User.Read", "profile", "email"],
};

export const isOidcEnabled = (): boolean => {
  const enabled = oidcEnabled && !!clientId && !!authority;
  console.log('[Auth Config] OIDC Configuration:', {
    oidcEnabled: oidcEnabled,
    hasClientId: !!clientId,
    hasAuthority: !!authority,
    clientId: clientId ? clientId.substring(0, 8) + '...' : 'MISSING',
    authority: authority || 'MISSING',
    redirectUri: redirectUri,
    scopes: loginRequest.scopes,
    finalEnabled: enabled
  });
  return enabled;
};
