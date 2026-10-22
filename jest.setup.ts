/**
 * jest.setup.ts — le « plateau de tournage » des tests.
 *
 * Les tests tournent sur Node, pas sur un téléphone : les modules natifs
 * (Bluetooth, MMKV, notifications, GPS) n'existent pas. On les remplace donc
 * par des doublures qui ne font rien, exactement comme on remplace une voiture
 * par une maquette dans un plan de cinéma.
 */
// (Les matchers de @testing-library/react-native v13 sont inclus d'office.)

// MMKV v4 repose sur Nitro (code natif). En test, on garde tout en mémoire.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, boolean | string | number>();
  return {
    createMMKV: () => ({
      set: (k: string, v: boolean | string | number) => void store.set(k, v),
      getString: (k: string) => store.get(k) as string | undefined,
      getNumber: (k: string) => store.get(k) as number | undefined,
      getBoolean: (k: string) => store.get(k) as boolean | undefined,
      delete: (k: string) => void store.delete(k),
      contains: (k: string) => store.has(k),
      getAllKeys: () => [...store.keys()],
      clearAll: () => store.clear(),
      addOnValueChangedListener: () => ({ remove() {} }),
    }),
  };
});

// react-native-ble-plx : on ne teste jamais le vrai BLE en unitaire.
jest.mock('react-native-ble-plx', () => ({
  BleManager: class {
    state = async () => 'PoweredOn';
    onStateChange = () => ({ remove() {} });
    startDeviceScan = () => {};
    stopDeviceScan = () => {};
    destroy = () => {};
  },
  State: { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff' },
  BleErrorCode: {},
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => 'tarmac'),
    displayNotification: jest.fn(async () => 'id'),
    stopForegroundService: jest.fn(async () => {}),
    registerForegroundService: jest.fn(),
    requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
    cancelNotification: jest.fn(async () => {}),
  },
  AndroidImportance: { LOW: 2, DEFAULT: 3, HIGH: 4 },
  AndroidForegroundServiceType: { FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE: 16 },
  AuthorizationStatus: { AUTHORIZED: 1 },
}));

jest.mock('react-native-tcp-socket', () => ({ __esModule: true, default: { createConnection: jest.fn() } }));
jest.mock('react-native-bluetooth-classic', () => ({ __esModule: true, default: {} }));

// Le GPS : on fournit une position fixe, les tests de chrono injectent leurs points.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  watchPositionAsync: jest.fn(async () => ({ remove() {} })),
  Accuracy: { BestForNavigation: 6 },
}));

jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(), deactivateKeepAwake: jest.fn() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
