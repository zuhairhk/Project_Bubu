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

  if (!res.ok) throw new Error('Failed to exchange code for token');
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
      clientId:     CLIENT_ID,
      // Expanded scopes — needed for playlist creation and reading top content
      scopes: [
        'user-top-read',
        'playlist-modify-public',
        'playlist-modify-private',
        'user-read-private',
        'user-read-email',
      ],
      redirectUri,
      responseType: 'code',
      usePKCE:      true,
    },
    discovery,
  );

  return [
    request,
    response,
    promptAsync,
    async () => {
      if (response?.type === 'success' && response.params.code && request?.codeVerifier) {
        return await exchangeCodeForToken(response.params.code, request.codeVerifier, redirectUri);
      }
      return null;
    },
  ];
}