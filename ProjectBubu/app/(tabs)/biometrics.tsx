import { StyleSheet, ScrollView } from 'react-native';
import { Text, View } from '@/components/Themed';

export default function BiometricsScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Biometrics</Text>
        <Text style={styles.subtitle}>Your Health Stats</Text>
      </View>

      <View style={styles.mainMetricsContainer}>
        <View style={[styles.metricCard, styles.heartRateCard]}>
          <Text style={styles.metricEmoji}>❤️</Text>
          <Text style={styles.metricValue}>-- bpm</Text>
          <Text style={styles.metricLabel}>Heart Rate</Text>
          <Text style={styles.metricStatus}>Waiting for data...</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.compactCard]}>
            <Text style={styles.metricEmoji}>👣</Text>
            <Text style={styles.metricValue}>--</Text>
            <Text style={styles.metricLabel}>Steps</Text>
          </View>
          <View style={[styles.metricCard, styles.compactCard]}>
            <Text style={styles.metricEmoji}>🔥</Text>
            <Text style={styles.metricValue}>--</Text>
            <Text style={styles.metricLabel}>Calories</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.compactCard]}>
            <Text style={styles.metricEmoji}>💧</Text>
            <Text style={styles.metricValue}>--</Text>
            <Text style={styles.metricLabel}>Water</Text>
          </View>
          <View style={[styles.metricCard, styles.compactCard]}>
            <Text style={styles.metricEmoji}>😴</Text>
            <Text style={styles.metricValue}>--</Text>
            <Text style={styles.metricLabel}>Sleep</Text>
          </View>
        </View>
      </View>

      <View style={styles.detailsContainer}>
        <Text style={styles.sectionTitle}>Daily Summary</Text>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Goal Progress:</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '0%' }]} />
          </View>
          <Text style={styles.progressText}>0 / 10000 steps</Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Active Time:</Text>
          <Text style={styles.summaryValue}>-- minutes</Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Distance:</Text>
          <Text style={styles.summaryValue}>-- km</Text>
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
  mainMetricsContainer: {
    paddingHorizontal: 15,
    marginVertical: 20,
  },
  metricCard: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartRateCard: {
    paddingVertical: 30,
    marginBottom: 15,
  },
  compactCard: {
    flex: 1,
    paddingVertical: 15,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  metricEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  metricLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  metricStatus: {
    fontSize: 11,
    opacity: 0.5,
    marginTop: 4,
    fontStyle: 'italic',
  },
  detailsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  summaryItem: {
    marginBottom: 15,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  summaryLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4D96FF',
  },
  progressText: {
    fontSize: 12,
    opacity: 0.6,
  },
});