import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isCompleteAccessCode, rawScanToAccessCode } from '../utils/accessCode';

/** Ignore duplicate camera frames for the same payload (avoids repeated alerts / duplicate work). */
const SAME_RAW_DEDUP_MS = 650;

export type ScanQrModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Raw payload from QR or paste; parent applies `rawScanToAccessCode` and verify pipeline. */
  onValidCode: (normalizedSixDigit: string) => void;
  /** When true, pause camera barcode scanning (verify in flight or outcome visible on parent). */
  pauseScanning?: boolean;
  /** Respect system reduce motion (modal transition). */
  reduceMotion?: boolean;
};

/**
 * Live QR scan using `expo-camera` `CameraView` (Workstream 5).
 * Throttles duplicate frame callbacks; manual paste fallback for JSON or raw digits.
 */
export default function ScanQrModal({
  visible,
  onClose,
  onValidCode,
  pauseScanning = false,
  reduceMotion = false,
}: ScanQrModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [pasteText, setPasteText] = useState('');
  const lastRawRef = useRef<string | null>(null);
  const lastRawAtRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setPasteText('');
      lastRawRef.current = null;
      void requestPermission();
    }
  }, [visible, requestPermission]);

  const tryAcceptRaw = useCallback(
    (raw: string) => {
      const normalized = rawScanToAccessCode(raw);
      if (isCompleteAccessCode(normalized)) {
        onValidCode(normalized);
        return;
      }
      Alert.alert(
        'Invalid QR',
        'Could not read a 6-digit access code from this QR code. Try another code or enter digits manually.',
        [{ text: 'OK' }],
        { cancelable: true },
      );
    },
    [onValidCode],
  );

  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (pauseScanning) {
        return;
      }
      const raw = result.data;
      if (!raw?.trim()) {
        return;
      }
      const now = Date.now();
      if (raw === lastRawRef.current && now - lastRawAtRef.current < SAME_RAW_DEDUP_MS) {
        return;
      }
      lastRawRef.current = raw;
      lastRawAtRef.current = now;
      tryAcceptRaw(raw);
    },
    [pauseScanning, tryAcceptRaw],
  );

  const handlePasteApply = () => {
    tryAcceptRaw(pasteText);
  };

  const openSettings = () => {
    void Linking.openSettings();
  };

  const showPermissionDenied = permission && !permission.granted && permission.canAskAgain === false;

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Scan QR</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Close scan"
          >
            <Ionicons name="close" size={28} color="#f0f6fc" />
          </Pressable>
        </View>

        {!permission?.granted ? (
          <View style={styles.centerBox}>
            <Text style={styles.explain}>
              Camera access is needed to scan visitor gate pass QR codes at the gate.
            </Text>
            {showPermissionDenied ? (
              <>
                <Text style={styles.deniedHint}>
                  Permission was denied. You can enable the camera in system settings, or paste a code below.
                </Text>
                <Pressable style={styles.primaryBtn} onPress={openSettings} accessibilityRole="button">
                  <Text style={styles.primaryBtnText}>Open settings</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void requestPermission()}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Allow camera</Text>
              </Pressable>
            )}
          </View>
        ) : visible ? (
          <View
            style={styles.cameraWrap}
            accessibilityLabel="Camera viewfinder"
            accessibilityHint="Point the camera at a gate pass QR code"
          >
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={pauseScanning ? undefined : onBarcodeScanned}
            />
            <View style={styles.scanOverlay} pointerEvents="none" importantForAccessibility="no">
              <View style={styles.scanFrame} />
              <Text style={styles.scanHint}>Point at the resident gate pass QR</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.pasteSection}>
          <Text style={styles.pasteLabel}>Or paste code / JSON</Text>
          <TextInput
            value={pasteText}
            onChangeText={setPasteText}
            placeholder='e.g. 123456 or {"access_code":"123456"}'
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.pasteInput}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Paste QR text or JSON"
          />
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            onPress={handlePasteApply}
            accessibilityRole="button"
            accessibilityLabel="Apply pasted code"
          >
            <Text style={styles.secondaryBtnText}>Apply pasted text</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f0f6fc',
  },
  closeBtn: {
    padding: 8,
    marginRight: -4,
  },
  closeBtnPressed: {
    opacity: 0.7,
  },
  centerBox: {
    padding: 20,
    gap: 16,
  },
  explain: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 22,
  },
  deniedHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#238636',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraWrap: {
    flex: 1,
    minHeight: 220,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 220,
    height: 220,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(88, 166, 255, 0.85)',
    backgroundColor: 'transparent',
  },
  scanHint: {
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  pasteSection: {
    padding: 16,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  pasteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
  pasteInput: {
    minHeight: 56,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    padding: 12,
    color: '#f0f6fc',
    fontSize: 15,
  },
  secondaryBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  secondaryBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  secondaryBtnText: {
    color: '#58a6ff',
    fontSize: 15,
    fontWeight: '600',
  },
});
