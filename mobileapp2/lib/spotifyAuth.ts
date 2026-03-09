import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = '69435b84f9e447138dc2c45323c42c4c';

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
};

export function useSpotifyAuth() {
  return AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['user-top-read'],
      redirectUri: AuthSession.makeRedirectUri({ useProxy: true }),
      responseType: AuthSession.ResponseType.Token,
    },
    discovery
  );
}
