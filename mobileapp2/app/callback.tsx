/**
 * This screen exists solely to catch the Spotify OAuth redirect:
 *   commubu-login://callback
 *
 * WebBrowser.maybeCompleteAuthSession() in _layout.tsx intercepts the
 * deep link and closes the in-app browser, handing the auth code back
 * to useSpotifyAuth. This component never actually renders visibly.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export default function CallbackScreen() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  // Render nothing — the auth session completion happens automatically
  return <View style={{ flex: 1, backgroundColor: '#F2F2F7' }} />;
}