import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type {
  AuthRequest,
  AuthRequestPromptOptions,
  AuthSessionResult,
} from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = '346580e071a3460da5a50ec2b7e57390';

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
};

async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ access_token: string }> {
  const body = new URLSearchParams({
    client_id:     CLIENT_ID,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

export function useSpotifyAuth(): [
  AuthRequest | null,
  AuthSessionResult | null,
  (options?: AuthRequestPromptOptions) => Promise<AuthSessionResult | null>,
  () => Promise<{ access_token: string } | null>,
] {
  const redirectUri = AuthSession.makeRedirectUri({ native: 'commubu-login://callback' });
  console.log('Spotify redirect URI:', redirectUri);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: [
        'user-top-read',
        'user-read-private',
        'user-read-email',
        'user-modify-playback-state',  // needed for queue
        'user-read-playback-state',    // needed to check active device
      ],
      redirectUri,
      responseType: 'code',
      usePKCE:      true,
      extraParams:  { show_dialog: 'true' },
    },
    discovery,
  );

  return [
    request,
    response,
    promptAsync,
    async () => {
      if (response?.type === 'success' && response.params.code && request?.codeVerifier) {
        return await exchangeCodeForToken(
          response.params.code,
          request.codeVerifier,
          redirectUri,
        );
      }
      return null;
    },
  ];
}