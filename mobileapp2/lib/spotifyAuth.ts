import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = '346580e071a3460da5a50ec2b7e57390';

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
};


// Helper to exchange code for access token
async function exchangeCodeForToken(code, codeVerifier, redirectUri) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error('Failed to exchange code for token');
  return res.json();
}

// Custom hook to handle Spotify Auth and token exchange
export function useSpotifyAuth() {
  const redirectUri = AuthSession.makeRedirectUri({ native: 'commubu-login://callback' });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['user-top-read'],
      redirectUri,
      responseType: 'code',
      usePKCE: true,
    },
    discovery
  );

  // Attach codeVerifier to request for later use
  return [request, response, promptAsync, async () => {
    if (response?.type === 'success' && response.params.code && request?.codeVerifier) {
      // Exchange code for access token
      return await exchangeCodeForToken(response.params.code, request.codeVerifier, redirectUri);
    }
    return null;
  }];
}
