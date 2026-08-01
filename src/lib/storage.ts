import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ParsedMap,
  StoredGameState,
} from '../types/map';

const STORAGE_KEY = 'machitan.game-state.v1';

export async function loadGameState() {
  const storedValue = await AsyncStorage.getItem(
    STORAGE_KEY,
  );

  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      storedValue,
    ) as StoredGameState;

    if (
      parsed.version !== 1 ||
      !parsed.map ||
      !Array.isArray(parsed.map.pois) ||
      !Array.isArray(parsed.map.areas) ||
      !Array.isArray(parsed.discoveredPoiIds)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function saveGameState(
  map: ParsedMap,
  discoveredPoiIds: string[],
) {
  const state: StoredGameState = {
    version: 1,
    map,
    discoveredPoiIds,
  };

  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state),
  );
}

export async function clearGameState() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
