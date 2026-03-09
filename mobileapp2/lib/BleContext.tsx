import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

// ─── NUS (Nordic UART Service) UUIDs ─────────────────────────────────────────
const SERVICE_UUID  = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHAR_UUID  = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // Phone → ESP32
const TX_CHAR_UUID  = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // ESP32 → Phone

const DEVICE_NAME   = 'Commubu';
const SCAN_TIMEOUT  = 10_000; // ms

// ─── Types ───────────────────────────────────────────────────────────────────
export type BleData = {
  heartRate: number | null;
  steps:     number | null;
  calories:  number | null;
  distance:  number | null;
};

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';

type BleContextType = {
  status:     ConnectionStatus;
  deviceName: string | null;
  error:      string | null;
  data:       BleData;
  connect:    () => Promise<void>;
  disconnect: () => Promise<void>;
  sendMood:   (mood: string) => Promise<void>;
  clearError: () => void;
};

// ─── Context ─────────────────────────────────────────────────────────────────
const BleContext = createContext<BleContextType>({
  status:     'disconnected',
  deviceName: null,
  error:      null,
  data:       { heartRate: null, steps: null, calories: null, distance: null },
  connect:    async () => {},
  disconnect: async () => {},
  sendMood:   async () => {},
  clearError: () => {},
});

export function useBle() {
  return useContext(BleContext);
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function BleProvider({ children }: { children: React.ReactNode }) {
  const managerRef     = useRef<BleManager | null>(null);
  const deviceRef      = useRef<Device | null>(null);
  const notifSubRef    = useRef<Subscription | null>(null);
  const disconnectSub  = useRef<Subscription | null>(null);

  const [status,     setStatus]     = useState<ConnectionStatus>('disconnected');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [data,       setData]       = useState<BleData>({
    heartRate: null, steps: null, calories: null, distance: null,
  });

  // Init BleManager once
  useEffect(() => {
    managerRef.current = new BleManager();
    return () => {
      cleanupRefs();
      managerRef.current?.destroy();
    };
  }, []);

  function cleanupRefs() {
    notifSubRef.current?.remove();
    notifSubRef.current = null;
    disconnectSub.current?.remove();
    disconnectSub.current = null;
    deviceRef.current = null;
  }

  // ── Connect ──────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager || status === 'connected' || status === 'scanning') return;

    setError(null);
    setStatus('scanning');

    try {
      // 1. Scan for device
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

      // 2. Connect + discover
      const connected = await found.connect({ autoConnect: false });
      await connected.discoverAllServicesAndCharacteristics();
      deviceRef.current = connected;

      // 3. Subscribe to TX characteristic for incoming sensor data
      notifSubRef.current = connected.monitorCharacteristicForService(
        SERVICE_UUID,
        TX_CHAR_UUID,
        (err, char) => {
          if (err || !char?.value) return;
          try {
            const raw = Buffer.from(char.value, 'base64').toString('utf8').trim();
            const parsed = JSON.parse(raw);
            setData(prev => ({
              heartRate: parsed.hr    ?? prev.heartRate,
              steps:     parsed.steps ?? prev.steps,
              calories:  parsed.cal   ?? prev.calories,
              distance:  parsed.dist  ?? prev.distance,
            }));
          } catch {
            // Non-JSON frames (plain strings etc.) — ignore silently
          }
        }
      );

      // 4. Watch for unexpected disconnect
      disconnectSub.current = connected.onDisconnected(() => {
        cleanupRefs();
        setStatus('disconnected');
        setDeviceName(null);
      });

      setStatus('connected');
      setDeviceName(connected.name ?? DEVICE_NAME);
    } catch (e: any) {
      cleanupRefs();
      setStatus('disconnected');
      setError(e.message ?? String(e));
    }
  }, [status]);

  // ── Disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    notifSubRef.current?.remove();
    notifSubRef.current = null;
    disconnectSub.current?.remove();
    disconnectSub.current = null;

    if (deviceRef.current) {
      await deviceRef.current.cancelConnection().catch(() => {});
      deviceRef.current = null;
    }
    setStatus('disconnected');
    setDeviceName(null);
  }, []);

  // ── Send Mood ────────────────────────────────────────────────────────────
  const sendMood = useCallback(async (mood: string) => {
    const device = deviceRef.current;
    if (!device) {
      setError('Not connected — tap the BLE button to connect first.');
      return;
    }
    try {
      const encoded = Buffer.from(mood + '\n', 'utf8').toString('base64');
      await device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        RX_CHAR_UUID,
        encoded
      );
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <BleContext.Provider
      value={{ status, deviceName, error, data, connect, disconnect, sendMood, clearError }}
    >
      {children}
    </BleContext.Provider>
  );
}
