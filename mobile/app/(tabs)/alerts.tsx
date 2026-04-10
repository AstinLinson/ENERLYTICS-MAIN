import React from 'react';
import { StyleSheet, FlatList } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useGridData } from '@/hooks/useGridData';

export default function AlertsScreen() {
  const { alertsHistory } = useGridData();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alerts History ({alertsHistory.length})</Text>
      <View style={styles.separator} />

      {alertsHistory.length === 0 ? (
        <Text style={styles.empty}>No alerts since app launch.</Text>
      ) : (
        <FlatList
          data={alertsHistory}
          keyExtractor={(item, idx) => idx.toString()}
          renderItem={({ item }) => (
            <View style={[styles.alertCard, { borderLeftColor: item.priority === 'critical' ? '#ef4444' : '#f59e0b' }]}>
              <Text style={styles.alertText}>{item.message}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 15, height: 1, width: '100%', backgroundColor: '#333' },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 20 },
  alertCard: {
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4
  },
  alertText: { color: 'white', fontWeight: '500' }
});
