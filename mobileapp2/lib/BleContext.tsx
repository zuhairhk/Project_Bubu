import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, Subscription, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

// ─── UUIDs — must match ESP32 firmware exactly ────────────────────────────────
const SERVICE_UUID    = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHAR_UUID    = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // ESP32 → Phone (notify)
const HR_CHAR_UUID    = '6E400008-B5A3-F393-E0A9-E50E24DCCA9E'; // HR byte (notify)
const NAME_CHAR_UUID  = '6E400004-B5A3-F393-E0A9-E50E24DCCA9E'; // Custom device name
const RX_CHAR_UUID    = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // Phone → ESP32

// Write-only characteristics exported for use by other screens
export const SONG_CHAR_UUID         = '6E400005-B5A3-F393-E0A9-E50E24DCCA9E';
export const ARTIST_CHAR_UUID       = '6E400006-B5A3-F393-E0A9-E50E24DCCA9E';
export const TIME_CHAR_UUID         = '6E400007-B5A3-F393-E0A9-E50E24DCCA9E';
export const TRANSIT_LINE_CHAR_UUID = '6E40000A-B5A3-F393-E0A9-E50E24DCCA9E';
export const TRANSIT_TIME_CHAR_UUID = '6E40000B-B5A3-F393-E0A9-E50E24DCCA9E';

const DEVICE_NAME  = 'Commubu';
const SCAN_TIMEOUT = 12_000;

// ─── Types ────────────────────────────────────────────────────────────────────
export type BleData = {
  heartRate:      number | null;
  steps:          number | null;
  batteryPercent: number | null;
  batteryVoltage: number | null;
};

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';

type BleContextType = {
  status:             ConnectionStatus;
  deviceName:         string | null;
  deviceCustomName:   string | null;
  error:              string | null;
  data:               BleData;
  nativeBleAvailable: boolean;
  connect:            () => Promise<void>;
  disconnect:         () => Promise<void>;
  sendMood:           (mood: string) => Promise<void>;
  writeChar:          (charUuid: string, value: string) => Promise<void>;
  clearError:         () => void;
};

const EMPTY_DATA: BleData = {
  heartRate: null, steps: null, batteryPercent: null, batteryVoltage: null,
};

// ─── TX frame parsers ─────────────────────────────────────────────────────────
// ESP32 sends plain-text frames on the TX characteristic — NOT JSON.
//
//   "Step! count=47"           → steps
//   "BPM=72 Batt=85% V=3.94"  → batteryPercent, batteryVoltage
//   "echo:..." / "Wake:..." / "UI:..."  → informational, ignored
//
function parseTxFrame(raw: string): Partial<BleData> {
  const update: Partial<BleData> = {};

  const stepMatch = raw.match(/count=(\d+)/i);
  if (stepMatch) update.steps = parseInt(stepMatch[1], 10);

  const battPctMatch = raw.match(/Batt=(\d+)%/i);
  if (battPctMatch) update.batteryPercent = parseInt(battPctMatch[1], 10);

  const battVMatch = raw.match(/V=([\d.]+)/i);
  if (battVMatch) update.batteryVoltage = parseFloat(battVMatch[1]);

  return update;
}

// HR char sends a single uint8 byte (BPM value 0–190)
function parseHrFrame(base64Value: string): number | null {
  try {
    const byte = Buffer.from(base64Value, 'base64')[0];
    return byte > 0 ? byte : null;
  } catch {
    return null;
  }
}

// ─── Detect whether we are running in a real native build ────────────────────
// react-native-ble-plx v3 no longer registers under NativeModules.BleClientManager.
// The only reliable way to detect it is to try constructing BleManager and
// catch the error Expo Go throws ("Native module cannot be null").
function detectNativeBle(): boolean {
  try {
    // BleManager constructor throws synchronously in Expo Go
    const m = new BleManager();
    m.destroy();
    return true;
  } catch (e: any) {
    const msg: string = e?.message ?? '';
    // Expo Go throws "Native module cannot be null" or similar
    if (msg.includes('null') || msg.includes('native') || msg.includes('Native')) {
      return false;
    }
    // Any other error still means the module loaded (e.g. BT off)
    return true;
  }
}

// ─── Android BLE permissions (required on Android 12+) ───────────────────────
async function requestAndroidBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    const allGranted = Object.values(results).every(
      r => r === PermissionsAndroid.RESULTS.GRANTED
    );
    if (!allGranted) console.warn('[BLE] Android 12+ permissions denied:', results);
    return allGranted;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const BleContext = createContext<BleContextType>({
  status:             'disconnected',
  deviceName:         null,
  deviceCustomName:   null,
  error:              null,
  data:               EMPTY_DATA,
  nativeBleAvailable: false,
  connect:            async () => {},
  disconnect:         async () => {},
  sendMood:           async () => {},
  writeChar:          async () => {},
  clearError:         () => {},
});

export function useBle() {
  return useContext(BleContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function BleProvider({ children }: { children: React.ReactNode }) {
  const managerRef       = useRef<BleManager | null>(null);
  const deviceRef        = useRef<Device | null>(null);
  const txSubRef         = useRef<Subscription | null>(null);
  const hrSubRef         = useRef<Subscription | null>(null);
  const disconnectSubRef = useRef<Subscription | null>(null);

  const [status,             setStatus]            = useState<ConnectionStatus>('disconnected');
  const [deviceName,         setDeviceName]        = useState<string | null>(null);
  const [deviceCustomName,   setDeviceCustomName]  = useState<string | null>(null);
  const [error,              setError]             = useState<string | null>(null);
  const [data,               setData]              = useState<BleData>(EMPTY_DATA);
  const [nativeBleAvailable, setNativeBleAvailable] = useState(false);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const available = detectNativeBle();
    setNativeBleAvailable(available);
    console.log('[BLE] Native available:', available);

    if (!available) {
      console.log('[BLE] Not in a dev build — BLE disabled');
      return;
    }

    const manager = new BleManager();
    managerRef.current = manager;

    const stateSub = manager.onStateChange((state) => {
      console.log('[BLE] Adapter state:', state);
      if (state === State.PoweredOff) {
        setError('Bluetooth is turned off. Please enable it and try again.');
      }
    }, true);

    return () => {
      stateSub.remove();
      cleanupSubs();
      manager.destroy();
    };
  }, []);

  function cleanupSubs() {
    txSubRef.current?.remove();         txSubRef.current = null;
    hrSubRef.current?.remove();         hrSubRef.current = null;
    disconnectSubRef.current?.remove(); disconnectSubRef.current = null;
    deviceRef.current = null;
  }

  // ── Connect ─────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    const manager = managerRef.current;

    if (!manager) {
      setError('BLE not available. Run: npx expo run:android');
      return;
    }
    if (status === 'connected' || status === 'scanning' || status === 'connecting') return;

    setError(null);

    // Request Android permissions
    const permOk = await requestAndroidBlePermissions();
    if (!permOk) {
      setError('Bluetooth permissions denied. Please grant them in Settings → Apps → Commubu → Permissions.');
      return;
    }

    // Check BT adapter is on
    const bleState = await manager.state();
    if (bleState !== State.PoweredOn) {
      setError('Please turn on Bluetooth and try again.');
      return;
    }

    setStatus('scanning');
    console.log('[BLE] Scanning for', DEVICE_NAME, '...');

    try {
      // Scan for device by service UUID
      const found = await new Promise<Device>((resolve, reject) => {
        const timer = setTimeout(() => {
          manager.stopDeviceScan();
          reject(new Error(
            `"${DEVICE_NAME}" not found after ${SCAN_TIMEOUT / 1000}s.\n` +
            `• Is the ESP32 powered on?\n` +
            `• Is it within ~5 metres?\n` +
            `• Is another phone already connected to it?`
          ));
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
              console.log('[BLE] Found device:', dev.name, dev.id);
              resolve(dev);
            }
          }
        );
      });

      setStatus('connecting');

      // Connect with MTU negotiation
      const connected = await found.connect({ autoConnect: false, requestMTU: 512 });
      console.log('[BLE] Connected, discovering services...');
      await connected.discoverAllServicesAndCharacteristics();
      deviceRef.current = connected;
      console.log('[BLE] Services discovered ✓');

      // Subscribe to TX characteristic (plain-text: steps + battery)
      txSubRef.current = connected.monitorCharacteristicForService(
        SERVICE_UUID, TX_CHAR_UUID,
        (err, char) => {
          if (err) { console.warn('[BLE TX error]', err.message); return; }
          if (!char?.value) return;
          const raw = Buffer.from(char.value, 'base64').toString('utf8').trim();
          console.log('[BLE TX]', raw);
          const update = parseTxFrame(raw);
          if (Object.keys(update).length > 0) {
            setData(prev => ({ ...prev, ...update }));
          }
        }
      );

      // Subscribe to HR characteristic (1 uint8 byte, every ~1s)
      hrSubRef.current = connected.monitorCharacteristicForService(
        SERVICE_UUID, HR_CHAR_UUID,
        (err, char) => {
          if (err) { console.warn('[BLE HR error]', err.message); return; }
          if (!char?.value) return;
          const bpm = parseHrFrame(char.value);
          console.log('[BLE HR]', bpm, 'bpm');
          setData(prev => ({ ...prev, heartRate: bpm }));
        }
      );

      // Watch for unexpected disconnect
      disconnectSubRef.current = connected.onDisconnected((err) => {
        console.log('[BLE] Disconnected', err?.message ?? '');
        cleanupSubs();
        setStatus('disconnected');
        setDeviceName(null);
        setDeviceCustomName(null);
        setData(EMPTY_DATA);
      });

      // Read custom display name (non-critical)
      try {
        const char = await connected.readCharacteristicForService(SERVICE_UUID, NAME_CHAR_UUID);
        if (char?.value) {
          const name = Buffer.from(char.value, 'base64').toString('utf8').trim();
          setDeviceCustomName(name);
          console.log('[BLE] Device name:', name);
        }
      } catch { /* optional */ }

      setStatus('connected');
      setDeviceName(connected.name ?? DEVICE_NAME);
      console.log('[BLE] Fully connected and subscribed ✓');

    } catch (e: any) {
      console.error('[BLE] Connection failed:', e.message);
      cleanupSubs();
      setStatus('disconnected');
      setError(e.message ?? String(e));
    }
  }, [status]);

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    txSubRef.current?.remove();         txSubRef.current = null;
    hrSubRef.current?.remove();         hrSubRef.current = null;
    disconnectSubRef.current?.remove(); disconnectSubRef.current = null;

    if (deviceRef.current) {
      await deviceRef.current.cancelConnection().catch(() => {});
      deviceRef.current = null;
    }

    setStatus('disconnected');
    setDeviceName(null);
    setDeviceCustomName(null);
    setData(EMPTY_DATA);
    console.log('[BLE] Disconnected by user');
  }, []);

  // ── Generic write (push data TO the ESP32) ──────────────────────────────────
  const writeChar = useCallback(async (charUuid: string, value: string) => {
    const device = deviceRef.current;
    if (!device) { setError('Not connected.'); return; }
    try {
      const encoded = Buffer.from(value, 'utf8').toString('base64');
      await device.writeCharacteristicWithResponseForService(SERVICE_UUID, charUuid, encoded);
      console.log('[BLE] Wrote to', charUuid, ':', value);
    } catch (e: any) {
      console.error('[BLE] Write failed:', e.message);
      setError(e.message ?? String(e));
    }
  }, []);

  const sendMood = useCallback(async (mood: string) => {
    await writeChar(RX_CHAR_UUID, mood + '\n');
  }, [writeChar]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <BleContext.Provider value={{
      status, deviceName, deviceCustomName, error, data,
      nativeBleAvailable, connect, disconnect, sendMood, writeChar, clearError,
    }}>
      {children}
    </BleContext.Provider>
  );
}