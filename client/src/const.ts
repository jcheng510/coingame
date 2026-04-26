export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const OAUTH_STATE_STORAGE_KEY = "oauth_state";

function generateOAuthState(): string {
  // 16 random bytes encoded as URL-safe base64. Unpredictable per attempt
  // and fits in a query parameter without escaping.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Generate login URL at runtime so redirect URI reflects the current origin.
// `state` is random per-attempt and stashed in sessionStorage so the callback
// flow can verify it (mitigates OAuth CSRF / session fixation).
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = generateOAuthState();
  try {
    sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);
  } catch {
    // sessionStorage can throw in private mode; without it we lose CSRF
    // verification but still send a fresh random state to the IdP.
  }

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
