import React, { useState } from 'react';
import { StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useGridData } from '@/hooks/useGridData';

// Using local network or hardcoded API for development
const BACKEND_API = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.29.140:3000';

export default function SettingsScreen() {
  const [powerLimit, setPowerLimit] = useState('500');

  const updatePowerLimit = async () => {
    try {
      const res = await fetch(`${BACKEND_API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ powerLimit })
      });
      if (res.ok) {
        Alert.alert('Success', `Power limit updated to ${powerLimit}W`);
      } else {
        Alert.alert('Error', 'Failed to update threshold on backend');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not reach backend API');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Grid Settings</Text>
      <View style={styles.separator} />

      <View style={styles.card}>
        <Text style={styles.label}>AI Power Limit (Watts)</Text>
        <TextInput 
          style={styles.input}
          value={powerLimit}
          onChangeText={setPowerLimit}
          keyboardType="numeric"
        />
        <Pressable style={styles.button} onPress={updatePowerLimit}>
          <Text style={styles.buttonText}>Save Limit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 15, height: 1, width: '100%', backgroundColor: '#333' },
  card: { backgroundColor: '#1e293b', padding: 20, borderRadius: 10 },
  label: { color: 'white', marginBottom: 10, fontWeight: 'bold' },
  input: { 
    backgroundColor: '#334155', 
    color: 'white', 
    padding: 10, 
    borderRadius: 5,
    marginBottom: 15
  },
  button: {
    backgroundColor: '#10b981',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center'
  },
  buttonText: { color: 'white', fontWeight: 'bold' }
});
