import React from 'react';
import { StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useGridData } from '@/hooks/useGridData';

export default function DashboardScreen() {
  const { data, prediction, healing, activeAlert } = useGridData();

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={{ marginTop: 10 }}>Connecting to Smart Grid...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activeAlert && (
        <View style={[styles.alertBanner, { backgroundColor: activeAlert.priority === 'critical' ? '#ef4444' : '#f59e0b' }]}>
          <Text style={styles.alertText}>{activeAlert.message}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Live Grid Status</Text>
        <View style={styles.separator} />

        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Voltage</Text>
            <Text style={styles.cardValue}>{data.voltage.toFixed(1)}V</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Current</Text>
            <Text style={styles.cardValue}>{(data.current || 0).toFixed(2)}A</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Temp</Text>
            <Text style={styles.cardValue}>{(data.temperature || 0).toFixed(1)}°C</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Power</Text>
            <Text style={styles.cardValue}>{(data.power || 0).toFixed(1)}W</Text>
          </View>
        </View>

        {prediction && (
          <View style={styles.aiPanel}>
            <Text style={styles.aiTitle}>🤖 LSTM Forecast (T+30s)</Text>
            <Text style={{color:'white'}}>Risk: {(prediction.anomalyScore * 100).toFixed(0)}%</Text>
            <Text style={{color:'white'}}>Predict: {prediction.predictedV.toFixed(1)}V | {prediction.predictedI.toFixed(1)}A | {prediction.predictedT.toFixed(1)}°C</Text>
          </View>
        )}

        {healing && (
          <View style={styles.aiPanel}>
            <Text style={styles.aiTitle}>🩺 DQN Self-Healing</Text>
            <Text style={{color:'white'}}>Action: {healing.action || 'Hold'}</Text>
            <Text style={{color:'white'}}>Exploration (ε): {healing.epsilon.toFixed(2)}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1 },
  scroll: { padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 15, height: 1, width: '80%', alignSelf: 'center', backgroundColor: '#333' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48%', backgroundColor: '#1e293b', padding: 15, borderRadius: 10, marginBottom: 15, alignItems: 'center' },
  cardLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 5 },
  cardValue: { color: '#10b981', fontSize: 24, fontWeight: 'bold' },
  aiPanel: { backgroundColor: '#334155', padding: 15, borderRadius: 10, marginTop: 15 },
  aiTitle: { color: '#38bdf8', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  alertBanner: { padding: 15, alignItems: 'center' },
  alertText: { color: 'white', fontWeight: 'bold', textAlign: 'center' }
});
