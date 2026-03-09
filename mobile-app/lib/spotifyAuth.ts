import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession(); // Required for iOS redirect to complete

// Replace with your Spotify Client ID
const CLIENT_ID = '69435b84f9e447138dc2c45323c42c4c';

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
};

console.log('Spotify redirect URI:', AuthSession.makeRedirectUri({ useProxy: true }));

// Custom hook to use in your screens
export function useSpotifyAuth() {
  return AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['user-top-read'], // Needed for top artists & tracks
      redirectUri: AuthSession.makeRedirectUri({ useProxy: true }), // Proxy avoids username
      responseType: AuthSession.ResponseType.Token,
    },
    discovery
  );
}
