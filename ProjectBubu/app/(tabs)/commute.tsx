import { StyleSheet, ScrollView } from 'react-native';
import { Text, View } from '@/components/Themed';

export default function CommuteScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Commute</Text>
        <Text style={styles.subtitle}>Real-time Transit Map</Text>
      </View>

      <View style={styles.mapContainer}>
        <Text style={styles.placeholderText}>🗺️ Map will display here</Text>
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.sectionTitle}>Transit Information</Text>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Next Departure:</Text>
          <Text style={styles.infoValue}>-- Loading --</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Time to Station:</Text>
          <Text style={styles.infoValue}>-- min</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Current Location:</Text>
          <Text style={styles.infoValue}>-- Loading --</Text>
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
  mapContainer: {
    height: 300,
    marginHorizontal: 15,
    marginVertical: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    opacity: 0.5,
  },
  infoContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  infoItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  infoLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
  },
});