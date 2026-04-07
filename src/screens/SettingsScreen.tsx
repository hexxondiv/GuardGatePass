import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function SettingsScreen() {
  const { logout, activeEstateId, availableEstates, selectEstate, roles } = useAuth();

  const activeName =
    availableEstates.find((e) => e.id === activeEstateId)?.name ?? activeEstateId ?? '—';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionLabel}>Signed in as</Text>
      <Text style={styles.body}>{roles.filter(Boolean).join(', ') || '—'}</Text>

      <Text style={styles.sectionLabel}>Active estate</Text>
      <Text style={styles.body}>{activeName}</Text>
      <Text style={styles.hint}>
        Requests use header X-Estate-Id for the active estate (same as admin web). Single-estate accounts default to
        the estate from your session.
      </Text>

      {availableEstates.length > 1 ? (
        <View style={styles.estateList}>
          <Text style={styles.sectionLabel}>Switch estate</Text>
          {availableEstates.map((e) => {
            const selected = e.id === activeEstateId;
            return (
              <TouchableOpacity
                key={e.id}
                style={[styles.estateChip, selected && styles.estateChipSelected]}
                onPress={() => void selectEstate(e.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Select estate ${e.name}`}
              >
                <Text style={[styles.estateChipText, selected && styles.estateChipTextSelected]}>{e.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <TouchableOpacity style={styles.outline} onPress={() => void logout()} accessibilityRole="button">
        <Text style={styles.outlineText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, backgroundColor: '#0d1117' },
  title: { fontSize: 20, fontWeight: '600', color: '#f0f6fc', marginBottom: 16 },
  sectionLabel: { fontSize: 13, color: '#8b949e', marginTop: 12, marginBottom: 6 },
  body: { fontSize: 15, color: '#c9d1d9', lineHeight: 22 },
  hint: { fontSize: 13, color: '#6e7681', marginTop: 8, lineHeight: 18 },
  estateList: { marginTop: 8, marginBottom: 24 },
  estateChip: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  estateChipSelected: { borderColor: '#58a6ff', backgroundColor: '#1c2128' },
  estateChipText: { color: '#c9d1d9', fontSize: 15 },
  estateChipTextSelected: { color: '#f0f6fc', fontWeight: '600' },
  outline: {
    alignSelf: 'flex-start',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  outlineText: { color: '#f0f6fc', fontSize: 15 },
});
