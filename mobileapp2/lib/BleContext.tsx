import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { NativeModules } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

// ─── UUIDs (match ESP32 firmware exactly) ────────────────────────────────────
const SERVICE_UUID    = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHAR_UUID    = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // Phone → ESP32
const TX_CHAR_UUID    = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // ESP32 → Phone (steps, battery strings)
const NAME_CHAR_UUID  = '6E400004-B5A3-F393-E0A9-E50E24DCCA9E';
const HR_CHAR_UUID    = '6E400008-B5A3-F393-E0A9-E50E24DCCA9E'; // Dedicated HR notify (1-byte uint8)

// Write-only characteristics (Phone → ESP32)
export const SONG_CHAR_UUID         = '6E400005-B5A3-F393-E0A9-E50E24DCCA9E';
export const ARTIST_CHAR_UUID       = '6E400006-B5A3-F393-E0A9-E50E24DCCA9E';
export const TIME_CHAR_UUID         = '6E400007-B5A3-F393-E0A9-E50E24DCCA9E';
export const TRANSIT_LINE_CHAR_UUID = '6E40000A-B5A3-F393-E0A9-E50E24DCCA9E';
export const TRANSIT_TIME_CHAR_UUID = '6E40000B-B5A3-F393-E0A9-E50E24DCCA9E';

const DEVICE_NAME  = 'Commubu';
const SCAN_TIMEOUT = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────
export type BleData = {
  heartRate:      number | null;
  steps:          number | null;
  batteryPercent: number | null;
  batteryVoltage: number | null;
};

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';

type BleContextType = {
  status:          ConnectionStatus;
  deviceName:      string | null;
  deviceCustomName:string | null;
  error:           string | null;
  data:            BleData;
  connect:         () => Promise<void>;
  disconnect:      () => Promise<void>;
  sendMood:        (mood: string) => Promise<void>;
  writeChar:       (charUuid: string, value: string) => Promise<void>;
  clearError:      () => void;
};

// ─── Parsers for ESP32 plain-text frames ─────────────────────────────────────

/**
 * TX char sends several message formats. We handle:
 *
 *   "Step! count=123"
 *      → steps = 123
 *
 *   "BPM=72 Batt=85% V=3.94"
 *      → batteryPercent = 85, batteryVoltage = 3.94
 *      (BPM here is redundant — we use the dedicated HR char instead)
 *
 *   "echo: ..."  /  "Wake: ..."  /  "UI: ..."  → informational, ignored
 */
function parseTxFrame(raw: string): Partial<BleData> {
  const update: Partial<BleData> = {};

  // "Step! count=123"
  const stepMatch = raw.match(/count=(\d+)/i);
  if (stepMatch) {
    update.steps = parseInt(stepMatch[1], 10);
  }

  // "BPM=72 Batt=85% V=3.94"
  const battPctMatch = raw.match(/Batt=(\d+)%/i);
  if (battPctMatch) {
    update.batteryPercent = parseInt(battPctMatch[1], 10);
  }

  const battVMatch = raw.match(/V=([\d.]+)/i);
  if (battVMatch) {
    update.batteryVoltage = parseFloat(battVMatch[1]);
  }

  return update;
}

/**
 * HR char sends a single raw uint8 byte (BPM).
 * base64 → Buffer → byte[0]
 */
function parseHrFrame(base64Value: string): number | null {
  try {
    const byte = Buffer.from(base64Value, 'base64')[0];
    return byte > 0 ? byte : null;
  } catch {
    return null;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────
const BleContext = createContext<BleContextType>({
  status:          'disconnected',
  deviceName:      null,
  deviceCustomName:null,
  error:           null,
  data:            { heartRate: null, steps: null, batteryPercent: null, batteryVoltage: null },
  connect:         async () => {},
  disconnect:      async () => {},
  sendMood:        async () => {},
  writeChar:       async () => {},
  clearError:      () => {},
});

export function useBle() {
  return useContext(BleContext);
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function BleProvider({ children }: { children: React.ReactNode }) {
  const managerRef      = useRef<BleManager | null>(null);
  const deviceRef       = useRef<Device | null>(null);
  const txSubRef        = useRef<Subscription | null>(null);
  const hrSubRef        = useRef<Subscription | null>(null);
  const disconnectSub   = useRef<Subscription | null>(null);

  const [status,          setStatus]          = useState<ConnectionStatus>('disconnected');
  const [deviceName,      setDeviceName]      = useState<string | null>(null);
  const [deviceCustomName,setDeviceCustomName]= useState<string | null>(null);
  const [error,           setError]           = useState<string | null>(null);
  const [data,            setData]            = useState<BleData>({
    heartRate: null, steps: null, batteryPercent: null, batteryVoltage: null,
  });

  // Init BleManager once
  useEffect(() => {
    if (!NativeModules.BleClientManager) {
      console.log('[BLE] Native module not available (Expo Go / web)');
      return;
    }
    managerRef.current = new BleManager();
    return () => {
      cleanupSubs();
      managerRef.current?.destroy();
    };
  }, []);

  function cleanupSubs() {
    txSubRef.current?.remove();      txSubRef.current = null;
    hrSubRef.current?.remove();      hrSubRef.current = null;
    disconnectSub.current?.remove(); disconnectSub.current = null;
    deviceRef.current = null;
  }

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager || status === 'connected' || status === 'scanning') return;

    setError(null);
    setStatus('scanning');

    try {
      // 1. Scan for device by service UUID
      const found = await new Promise<Device>((resolve, reject) => {
        const timer = setTimeout(() => {
          manager.stopDeviceScan();
          reject(new Error(`"${DEVICE_NAME}" not found — is it powered on and nearby?`));
        }, SCAN_TIMEOUT);

        manager.startDeviceScan(
          [SERVICE_UUID],
          { allowDuplicates: false },
          (err, dev) => {
            if (err) {
              clearTimeout(timer);
              manager.stopDeviceScan();
              reject(err);
              return;
            }
            if (dev?.name === DEVICE_NAME || dev?.localName === DEVICE_NAME) {
              clearTimeout(timer);
              manager.stopDeviceScan();
              resolve(dev);
            }
          }
        );
      });

      setStatus('connecting');

      // 2. Connect + discover services/characteristics
      const connected = await found.connect({ autoConnect: false });
      await connected.discoverAllServicesAndCharacteristics();
      deviceRef.current = connected;

      // 3. Subscribe to TX characteristic — parses step counts + battery strings
      txSubRef.current = connected.monitorCharacteristicForService(
        SERVICE_UUID,
        TX_CHAR_UUID,
        (err, char) => {
          if (err || !char?.value) return;
          const raw = Buffer.from(char.value, 'base64').toString('utf8').trim();
          console.log('[BLE TX]', raw);
          const update = parseTxFrame(raw);
          if (Object.keys(update).length > 0) {
            setData(prev => ({ ...prev, ...update }));
          }
        }
      );

      // 4. Subscribe to HR characteristic — 1-byte uint8 BPM, notified every ~1s
      hrSubRef.current = connected.monitorCharacteristicForService(
        SERVICE_UUID,
        HR_CHAR_UUID,
        (err, char) => {
          if (err || !char?.value) return;
          const bpm = parseHrFrame(char.value);
          if (bpm !== null) {
            setData(prev => ({ ...prev, heartRate: bpm }));
          }
        }
      );

      // 5. Watch for unexpected disconnect
      disconnectSub.current = connected.onDisconnected(() => {
        console.log('[BLE] Disconnected unexpectedly');
        cleanupSubs();
        setStatus('disconnected');
        setDeviceName(null);
        setDeviceCustomName(null);
        setData({ heartRate: null, steps: null, batteryPercent: null, batteryVoltage: null });
      });

      // 6. Read custom display name from device
      try {
        const char = await connected.readCharacteristicForService(
          SERVICE_UUID,
          NAME_CHAR_UUID
        );
        if (char?.value) {
          setDeviceCustomName(Buffer.from(char.value, 'base64').toString('utf8').trim());
        }
      } catch {
        // Non-critical — device name falls back to DEVICE_NAME
      }

      setStatus('connected');
      setDeviceName(connected.name ?? DEVICE_NAME);
    } catch (e: any) {
      cleanupSubs();
      setStatus('disconnected');
      setError(e.message ?? String(e));
    }
  }, [status]);

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    txSubRef.current?.remove();      txSubRef.current = null;
    hrSubRef.current?.remove();      hrSubRef.current = null;
    disconnectSub.current?.remove(); disconnectSub.current = null;

    if (deviceRef.current) {
      await deviceRef.current.cancelConnection().catch(() => {});
      deviceRef.current = null;
    }

    setStatus('disconnected');
    setDeviceName(null);
    setDeviceCustomName(null);
    setData({ heartRate: null, steps: null, batteryPercent: null, batteryVoltage: null });
  }, []);

  // ── Generic write helper ───────────────────────────────────────────────────
  // Use this to push song, artist, time, transit line/time to the device.
  // e.g. writeChar(SONG_CHAR_UUID, 'Let It Happen')
  const writeChar = useCallback(async (charUuid: string, value: string) => {
    const device = deviceRef.current;
    if (!device) {
      setError('Not connected — tap the BLE button to connect first.');
      return;
    }
    try {
      const encoded = Buffer.from(value, 'utf8').toString('base64');
      await device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        charUuid,
        encoded
      );
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);

  // ── Send Mood (writes to RX char as plain text) ────────────────────────────
  const sendMood = useCallback(async (mood: string) => {
    await writeChar(RX_CHAR_UUID, mood + '\n');
  }, [writeChar]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <BleContext.Provider
      value={{
        status,
        deviceName,
        deviceCustomName,
        error,
        data,
        connect,
        disconnect,
        sendMood,
        writeChar,
        clearError,
      }}
    >
      {children}
    </BleContext.Provider>
  );
}