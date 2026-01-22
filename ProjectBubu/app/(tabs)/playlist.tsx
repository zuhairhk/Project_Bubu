import { StyleSheet, ScrollView, FlatList } from 'react-native';
import { Text, View } from '@/components/Themed';

const MOOD_PLAYLISTS = [
  { id: '1', mood: '😊 Happy', songs: 32, color: '#FFD93D' },
  { id: '2', mood: '😴 Chill', songs: 28, color: '#6BCB77' },
  { id: '3', mood: '💪 Energetic', songs: 45, color: '#FF6B6B' },
  { id: '4', mood: '😌 Relaxed', songs: 25, color: '#4D96FF' },
  { id: '5', mood: '🎵 Focus', songs: 38, color: '#A78BFA' },
  { id: '6', mood: '🌙 Night Drive', songs: 42, color: '#667BC6' },
];

export default function PlaylistScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Playlist</Text>
        <Text style={styles.subtitle}>Music Based on Your Mood</Text>
      </View>

      <View style={styles.moodSelectorContainer}>
        <Text style={styles.moodLabel}>Select Your Mood:</Text>
        <FlatList
          data={MOOD_PLAYLISTS}
          renderItem={({ item }) => (
            <View style={[styles.moodCard, { backgroundColor: item.color }]}>
              <Text style={styles.moodEmoji}>{item.mood.split(' ')[0]}</Text>
              <Text style={styles.moodName}>{item.mood.split(' ').slice(1).join(' ')}</Text>
              <Text style={styles.songCount}>{item.songs} songs</Text>
            </View>
          )}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.moodGrid}
          scrollEnabled={false}
        />
      </View>

      <View style={styles.currentPlayingContainer}>
        <Text style={styles.sectionTitle}>Now Playing</Text>
        <View style={styles.nowPlayingCard}>
          <Text style={styles.placeholderEmoji}>🎵</Text>
          <Text style={styles.songTitle}>No song playing</Text>
          <Text style={styles.artistName}>Select a mood to get started</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
  moodSelectorContainer: {
    paddingHorizontal: 15,
    marginVertical: 20,
  },
  moodLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
  },
  moodGrid: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  moodCard: {
    width: '48%',
    paddingVertical: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodEmoji: {
    fontSize: 32,
    marginBottom: 5,
  },
  moodName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  songCount: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
    marginTop: 4,
  },
  currentPlayingContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  nowPlayingCard: {
    padding: 20,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    alignItems: 'center',
  },
  placeholderEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  artistName: {
    fontSize: 14,
    opacity: 0.6,
  },
});