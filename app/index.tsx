import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {
  Circle,
  Marker,
  Polygon,
} from 'react-native-maps';

import {
  calculateDistanceMeters,
  findNearbyUndiscoveredPois,
} from '../src/lib/geo';
import { readMapFile } from '../src/lib/kmz';
import {
  clearGameState,
  loadGameState,
  saveGameState,
} from '../src/lib/storage';
import type {
  Coordinates,
  ParsedMap,
  TrackedCoordinates,
} from '../src/types/map';

type MeasurementStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'finished';

const MAX_ACCEPTABLE_ACCURACY_METERS = 20;
const MIN_MOVEMENT_METERS = 4;
const MAX_REASONABLE_JUMP_METERS = 30;
const DISCOVERY_RADIUS_METERS = 25;
const LAST_DISCOVERY_STORAGE_KEY =
  'machitan.latest-discovery.v1';

export default function HomeScreen() {
  useKeepAwake();

  const [status, setStatus] =
    useState<MeasurementStatus>('idle');

  const [elapsedMilliseconds, setElapsedMilliseconds] =
    useState(0);

  const [distanceMeters, setDistanceMeters] =
    useState(0);

  const [currentCoordinates, setCurrentCoordinates] =
    useState<TrackedCoordinates | null>(null);

  const [gpsMessage, setGpsMessage] =
    useState('GPS待機中');

  const [loadedMap, setLoadedMap] =
    useState<ParsedMap | null>(null);

  const [discoveredPoiIds, setDiscoveredPoiIds] =
    useState<string[]>([]);

  const [latestDiscovery, setLatestDiscovery] =
    useState<string | null>(null);

  const [isLoadingMap, setIsLoadingMap] =
    useState(false);

  const [isMapReady, setIsMapReady] =
    useState(false);

  const startedAtRef = useRef<number | null>(null);
  const accumulatedMillisecondsRef = useRef(0);
  const distanceMetersRef = useRef(0);

  const previousCoordinatesRef =
    useRef<TrackedCoordinates | null>(null);

  const locationSubscriptionRef =
    useRef<Location.LocationSubscription | null>(null);

  const mapRef = useRef<MapView | null>(null);
  const loadedMapRef = useRef<ParsedMap | null>(null);
  const discoveredPoiIdsRef = useRef<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    loadedMapRef.current = loadedMap;
  }, [loadedMap]);

  useEffect(() => {
    discoveredPoiIdsRef.current = new Set(
      discoveredPoiIds,
    );
  }, [discoveredPoiIds]);

  useEffect(() => {
    void restoreAppState();
    void restoreInitialLocation();

    return () => {
      locationSubscriptionRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (status !== 'running') {
      return;
    }

    const updateElapsedTime = () => {
      if (startedAtRef.current === null) {
        return;
      }

      const currentElapsed =
        accumulatedMillisecondsRef.current +
        (Date.now() - startedAtRef.current);

      setElapsedMilliseconds(currentElapsed);
    };

    updateElapsedTime();

    const intervalId = setInterval(updateElapsedTime, 250);

    return () => {
      clearInterval(intervalId);
    };
  }, [status]);

  useEffect(() => {
    if (!isMapReady || !loadedMap) {
      return;
    }

    fitMapToLoadedData(loadedMap);
  }, [isMapReady, loadedMap]);

  const discoveredPoiIdSet = useMemo(
    () => new Set(discoveredPoiIds),
    [discoveredPoiIds],
  );

  const discoveredCount = discoveredPoiIds.length;
  const totalPoiCount = loadedMap?.pois.length ?? 0;

  const completionPercentage =
    totalPoiCount === 0
      ? 0
      : Math.round(
          (discoveredCount / totalPoiCount) * 100,
        );

  const mapInitialRegion = useMemo(() => {
    const firstPoi = loadedMap?.pois[0];

    if (firstPoi) {
      return {
        latitude: firstPoi.latitude,
        longitude: firstPoi.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    if (currentCoordinates) {
      return {
        latitude: currentCoordinates.latitude,
        longitude: currentCoordinates.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      };
    }

    return null;
  }, [currentCoordinates, loadedMap]);

  async function restoreAppState() {
    try {
      const savedState = await loadGameState();

      if (savedState) {
        loadedMapRef.current = savedState.map;
        discoveredPoiIdsRef.current = new Set(
          savedState.discoveredPoiIds,
        );

        setLoadedMap(savedState.map);
        setDiscoveredPoiIds(
          savedState.discoveredPoiIds,
        );
      }

      const savedLatestDiscovery =
        await AsyncStorage.getItem(
          LAST_DISCOVERY_STORAGE_KEY,
        );

      setLatestDiscovery(savedLatestDiscovery);
    } catch (error) {
      console.warn('保存データを復元できませんでした。', error);
    }
  }

  async function restoreInitialLocation() {
    try {
      const permission =
        await Location.getForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        return;
      }

      const lastKnownPosition =
        await Location.getLastKnownPositionAsync({
          maxAge: 10 * 60 * 1000,
          requiredAccuracy: 500,
        });

      if (!lastKnownPosition) {
        return;
      }

      setCurrentCoordinates({
        latitude: lastKnownPosition.coords.latitude,
        longitude: lastKnownPosition.coords.longitude,
        accuracy: lastKnownPosition.coords.accuracy,
      });
    } catch (error) {
      console.warn('初期位置を取得できませんでした。', error);
    }
  }

  const startLocationTracking = async () => {
    try {
      setGpsMessage('位置情報の許可を確認中');

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        setGpsMessage('位置情報が許可されていません');

        Alert.alert(
          '位置情報が必要です',
          'まちたん！で歩行距離とポイポイ攻略を記録するには、位置情報の利用を許可してください。',
        );

        return false;
      }

      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;

      setGpsMessage('GPSを取得中');

      const subscription =
        await Location.watchPositionAsync(
          {
            accuracy:
              Location.Accuracy.BestForNavigation,
            distanceInterval: 1,
            timeInterval: 2000,
          },
          handleLocationUpdate,
        );

      locationSubscriptionRef.current = subscription;

      return true;
    } catch (error) {
      console.error(error);
      setGpsMessage('GPSを開始できませんでした');

      Alert.alert(
        'GPSエラー',
        '位置情報を取得できませんでした。',
      );

      return false;
    }
  };

  const handleLocationUpdate = (
    location: Location.LocationObject,
  ) => {
    const nextCoordinates: TrackedCoordinates = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };

    setCurrentCoordinates(nextCoordinates);

    const accuracy = nextCoordinates.accuracy ?? 9999;

    if (accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
      setGpsMessage(
        `GPS精度を調整中（約${Math.round(
          accuracy,
        )}m）`,
      );
      return;
    }

    setGpsMessage(
      `GPS受信中（精度 約${Math.round(
        accuracy,
      )}m）`,
    );

    addWalkingDistance(nextCoordinates);
    discoverNearbyPois(nextCoordinates);
  };

  const addWalkingDistance = (
    nextCoordinates: TrackedCoordinates,
  ) => {
    const previousCoordinates =
      previousCoordinatesRef.current;

    if (!previousCoordinates) {
      previousCoordinatesRef.current = nextCoordinates;
      return;
    }

    const addedDistance = calculateDistanceMeters(
      previousCoordinates,
      nextCoordinates,
    );

    if (
      addedDistance >= MIN_MOVEMENT_METERS &&
      addedDistance <= MAX_REASONABLE_JUMP_METERS
    ) {
      distanceMetersRef.current += addedDistance;
      setDistanceMeters(distanceMetersRef.current);
      previousCoordinatesRef.current = nextCoordinates;
    } else if (
      addedDistance > MAX_REASONABLE_JUMP_METERS
    ) {
      previousCoordinatesRef.current = nextCoordinates;
    }
  };

  const discoverNearbyPois = (
    nextCoordinates: TrackedCoordinates,
  ) => {
    const currentMap = loadedMapRef.current;

    if (!currentMap) {
      return;
    }

    const newlyDiscovered = findNearbyUndiscoveredPois(
      nextCoordinates,
      currentMap.pois,
      discoveredPoiIdsRef.current,
      DISCOVERY_RADIUS_METERS,
    );

    if (newlyDiscovered.length === 0) {
      return;
    }

    const nextDiscoveredSet = new Set<string>(
      discoveredPoiIdsRef.current,
    );

    newlyDiscovered.forEach((poi) =>
      nextDiscoveredSet.add(poi.id),
    );

    const nextDiscoveredIds: string[] = Array.from(
      nextDiscoveredSet,
    );

    discoveredPoiIdsRef.current = nextDiscoveredSet;
    setDiscoveredPoiIds(nextDiscoveredIds);

    const discoveryMessage =
      newlyDiscovered.length === 1
        ? `ポイポイ発見！ ${newlyDiscovered[0].name}`
        : `ポイポイを${newlyDiscovered.length}件発見！`;

    setLatestDiscovery(discoveryMessage);

    void AsyncStorage.setItem(
      LAST_DISCOVERY_STORAGE_KEY,
      discoveryMessage,
    );

    void saveGameState(currentMap, nextDiscoveredIds);
  };

  const stopLocationTracking = () => {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    previousCoordinatesRef.current = null;
  };

  const handleStart = async () => {
    accumulatedMillisecondsRef.current = 0;
    startedAtRef.current = null;
    distanceMetersRef.current = 0;
    previousCoordinatesRef.current = null;

    setElapsedMilliseconds(0);
    setDistanceMeters(0);

    const trackingStarted =
      await startLocationTracking();

    if (!trackingStarted) {
      return;
    }

    startedAtRef.current = Date.now();
    setStatus('running');
  };

  const handlePause = () => {
    if (startedAtRef.current !== null) {
      accumulatedMillisecondsRef.current +=
        Date.now() - startedAtRef.current;
    }

    startedAtRef.current = null;

    setElapsedMilliseconds(
      accumulatedMillisecondsRef.current,
    );

    stopLocationTracking();
    setGpsMessage('GPS一時停止中');
    setStatus('paused');
  };

  const handleResume = async () => {
    previousCoordinatesRef.current = null;

    const trackingStarted =
      await startLocationTracking();

    if (!trackingStarted) {
      return;
    }

    startedAtRef.current = Date.now();
    setStatus('running');
  };

  const handleFinish = () => {
    if (
      status === 'running' &&
      startedAtRef.current !== null
    ) {
      accumulatedMillisecondsRef.current +=
        Date.now() - startedAtRef.current;

      setElapsedMilliseconds(
        accumulatedMillisecondsRef.current,
      );
    }

    startedAtRef.current = null;

    stopLocationTracking();
    setGpsMessage('計測終了');
    setStatus('finished');
  };

  const handleResetMeasurement = () => {
    stopLocationTracking();

    startedAtRef.current = null;
    accumulatedMillisecondsRef.current = 0;
    distanceMetersRef.current = 0;

    setElapsedMilliseconds(0);
    setDistanceMeters(0);
    setGpsMessage('GPS待機中');
    setStatus('idle');
  };

  const handlePickMapFile = async () => {
    if (status === 'running' || status === 'paused') {
      Alert.alert(
        '計測中です',
        'KMZを入れ替える前に計測を終了してください。',
      );
      return;
    }

    try {
      setIsLoadingMap(true);

      const result =
        await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: false,
        });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      const parsedMap = await readMapFile(
        asset.uri,
        asset.name,
      );

      loadedMapRef.current = parsedMap;
      discoveredPoiIdsRef.current = new Set();

      setLoadedMap(parsedMap);
      setDiscoveredPoiIds([]);
      setLatestDiscovery(null);

      await AsyncStorage.removeItem(
        LAST_DISCOVERY_STORAGE_KEY,
      );

      await saveGameState(parsedMap, []);

      Alert.alert(
        'KMZを読み込みました',
        `${parsedMap.pois.length}件のポイポイを地図に表示します。`,
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        'KMZを読み込めませんでした',
        error instanceof Error
          ? error.message
          : 'ファイルを確認してください。',
      );
    } finally {
      setIsLoadingMap(false);
    }
  };

  const handleResetProgress = () => {
    if (!loadedMap) {
      return;
    }

    Alert.alert(
      '攻略状況をリセット',
      '発見済みのポイポイをすべて未発見に戻しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'リセット',
          style: 'destructive',
          onPress: () => {
            discoveredPoiIdsRef.current = new Set();
            setDiscoveredPoiIds([]);
            setLatestDiscovery(null);

            void AsyncStorage.removeItem(
              LAST_DISCOVERY_STORAGE_KEY,
            );

            void saveGameState(loadedMap, []);
          },
        },
      ],
    );
  };

  const handleRemoveMap = () => {
    if (status === 'running' || status === 'paused') {
      return;
    }

    Alert.alert(
      'KMZを外す',
      '読み込んだ地図と攻略状況を端末から削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            loadedMapRef.current = null;
            discoveredPoiIdsRef.current = new Set();

            setLoadedMap(null);
            setDiscoveredPoiIds([]);
            setLatestDiscovery(null);

            void clearGameState();
            void AsyncStorage.removeItem(
              LAST_DISCOVERY_STORAGE_KEY,
            );
          },
        },
      ],
    );
  };

  const fitMapToLoadedData = (map: ParsedMap) => {
    const coordinates: Coordinates[] = [
      ...map.pois.map((poi) => ({
        latitude: poi.latitude,
        longitude: poi.longitude,
      })),
      ...map.areas.flatMap((area) => area.coordinates),
    ];

    if (coordinates.length === 0) {
      return;
    }

    if (coordinates.length === 1) {
      mapRef.current?.animateToRegion(
        {
          ...coordinates[0],
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        },
        600,
      );
      return;
    }

    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 60,
        right: 40,
        bottom: 60,
        left: 40,
      },
      animated: true,
    });
  };

  const centerOnCurrentLocation = () => {
    if (!currentCoordinates) {
      Alert.alert(
        '現在地を取得できていません',
        '計測を開始してGPSを受信してください。',
      );
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: currentCoordinates.latitude,
        longitude: currentCoordinates.longitude,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      },
      500,
    );
  };

  const totalSeconds = Math.floor(
    elapsedMilliseconds / 1000,
  );

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );
  const seconds = totalSeconds % 60;

  const formattedElapsedTime = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');

  const formattedDistance =
    distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(2)} km`
      : `${Math.round(distanceMeters)} m`;

  const statusText = {
    idle: '計測前',
    running: '計測中',
    paused: '一時停止中',
    finished: '計測終了',
  }[status];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.logo}>まちたん！</Text>

      <Text style={styles.subtitle}>
        歩いて見つける、まち探索アプリ
      </Text>

      <View style={styles.mapToolbar}>
        <ActionButton
          label={
            isLoadingMap
              ? 'KMZを読み込み中…'
              : loadedMap
                ? '別のKMZを読み込む'
                : 'KMZを読み込む'
          }
          onPress={handlePickMapFile}
          disabled={isLoadingMap}
          compact
        />

        {loadedMap && (
          <ActionButton
            label="地図全体"
            onPress={() => fitMapToLoadedData(loadedMap)}
            secondary
            compact
          />
        )}
      </View>

      {loadedMap && (
        <View style={styles.eventCard}>
          <Text style={styles.eventName}>
            {loadedMap.sourceName}
          </Text>

          <Text style={styles.progressText}>
            {discoveredCount} / {totalPoiCount} 発見
            {'  '}({completionPercentage}%)
          </Text>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${completionPercentage}%`,
                },
              ]}
            />
          </View>

          <Text style={styles.discoveryRule}>
            ポイポイから約{DISCOVERY_RADIUS_METERS}m以内で塗りつぶします
          </Text>
        </View>
      )}

      {latestDiscovery && (
        <View style={styles.discoveryBanner}>
          <Text style={styles.discoveryBannerText}>
            {latestDiscovery}
          </Text>
        </View>
      )}

      <View style={styles.mapCard}>
        <View style={styles.mapHeader}>
          <Text style={styles.mapTitle}>
            {loadedMap ? '攻略マップ' : '現在地マップ'}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={centerOnCurrentLocation}
            style={({ pressed }) => [
              styles.smallMapButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.smallMapButtonText}>
              現在地
            </Text>
          </Pressable>
        </View>

        {mapInitialRegion ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={mapInitialRegion}
            showsCompass
            showsScale
            onMapReady={() => setIsMapReady(true)}
          >
            {loadedMap?.areas.map((area) => (
              <Polygon
                key={area.id}
                coordinates={area.coordinates}
                strokeColor="rgba(55, 95, 58, 0.45)"
                fillColor="rgba(55, 95, 58, 0.08)"
                strokeWidth={1}
              />
            ))}

            {loadedMap?.pois.map((poi) => {
              const isDiscovered =
                discoveredPoiIdSet.has(poi.id);

              return (
                <Circle
                  key={`circle-${poi.id}`}
                  center={{
                    latitude: poi.latitude,
                    longitude: poi.longitude,
                  }}
                  radius={DISCOVERY_RADIUS_METERS}
                  strokeWidth={2}
                  strokeColor={
                    isDiscovered
                      ? 'rgba(55, 95, 58, 0.95)'
                      : 'rgba(102, 110, 103, 0.65)'
                  }
                  fillColor={
                    isDiscovered
                      ? 'rgba(87, 166, 91, 0.52)'
                      : 'rgba(120, 128, 121, 0.13)'
                  }
                />
              );
            })}

            {loadedMap?.pois.map((poi) => {
              const isDiscovered =
                discoveredPoiIdSet.has(poi.id);

              return (
                <Marker
                  key={`marker-${poi.id}`}
                  coordinate={{
                    latitude: poi.latitude,
                    longitude: poi.longitude,
                  }}
                  title={poi.name}
                  description={
                    isDiscovered
                      ? '発見済みのポイポイ'
                      : '未発見のポイポイ'
                  }
                  pinColor={
                    isDiscovered ? '#375F3A' : '#7B827C'
                  }
                />
              );
            })}

            {currentCoordinates && (
              <Marker
                coordinate={{
                  latitude: currentCoordinates.latitude,
                  longitude: currentCoordinates.longitude,
                }}
                title="現在地"
                description={
                  currentCoordinates.accuracy === null
                    ? undefined
                    : `GPS精度 約${Math.round(
                        currentCoordinates.accuracy,
                      )}m`
                }
                pinColor="#208AEF"
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderTitle}>
              地図を準備しています
            </Text>

            <Text style={styles.mapPlaceholderText}>
              KMZを読み込むか、計測を開始すると地図を表示します
            </Text>
          </View>
        )}
      </View>

      <View style={styles.statusBadge}>
        <Text style={styles.statusBadgeText}>
          {statusText}
        </Text>
      </View>

      <View style={styles.timerCard}>
        <Text style={styles.label}>経過時間</Text>

        <Text style={styles.timer}>
          {formattedElapsedTime}
        </Text>
      </View>

      <View style={styles.resultRow}>
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>
            歩行距離
          </Text>

          <Text style={styles.resultValue}>
            {formattedDistance}
          </Text>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>
            ポイポイ発見数
          </Text>

          <Text style={styles.resultValue}>
            {discoveredCount}
          </Text>
        </View>
      </View>

      <View style={styles.gpsCard}>
        <Text style={styles.gpsStatus}>
          {gpsMessage}
        </Text>

        {currentCoordinates && (
          <Text style={styles.coordinates}>
            緯度：
            {currentCoordinates.latitude.toFixed(6)}
            {'\n'}
            経度：
            {currentCoordinates.longitude.toFixed(6)}
          </Text>
        )}
      </View>

      {status === 'idle' && (
        <ActionButton
          label="計測を開始"
          onPress={handleStart}
        />
      )}

      {status === 'running' && (
        <>
          <ActionButton
            label="一時停止"
            onPress={handlePause}
          />

          <ActionButton
            label="計測を終了"
            onPress={handleFinish}
            secondary
          />
        </>
      )}

      {status === 'paused' && (
        <>
          <ActionButton
            label="計測を再開"
            onPress={handleResume}
          />

          <ActionButton
            label="計測を終了"
            onPress={handleFinish}
            secondary
          />
        </>
      )}

      {status === 'finished' && (
        <ActionButton
          label="新しい計測を始める"
          onPress={handleResetMeasurement}
        />
      )}

      {loadedMap && (
        <View style={styles.dangerActions}>
          <ActionButton
            label="攻略状況をリセット"
            onPress={handleResetProgress}
            secondary
            compact
          />

          <ActionButton
            label="KMZを外す"
            onPress={handleRemoveMap}
            secondary
            compact
          />
        </View>
      )}

      <Text style={styles.notice}>
        Expo Goでのテスト中は画面を閉じないでください
      </Text>
    </ScrollView>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  compact?: boolean;
  disabled?: boolean;
};

function ActionButton({
  label,
  onPress,
  secondary = false,
  compact = false,
  disabled = false,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compactButton,
        secondary
          ? styles.secondaryButton
          : styles.primaryButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          compact && styles.compactButtonText,
          secondary && styles.secondaryButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F8F2',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 40,
    backgroundColor: '#F7F8F2',
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    color: '#243325',
  },
  subtitle: {
    marginTop: 5,
    fontSize: 14,
    textAlign: 'center',
    color: '#5B675C',
  },
  mapToolbar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  eventCard: {
    marginTop: 12,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  eventName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#243325',
  },
  progressText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#375F3A',
  },
  progressTrack: {
    height: 10,
    marginTop: 10,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#E3E7E0',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#57A65B',
  },
  discoveryRule: {
    marginTop: 8,
    fontSize: 12,
    color: '#697169',
  },
  discoveryBanner: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#DFF1D8',
  },
  discoveryBannerText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2F6334',
  },
  mapCard: {
    marginTop: 12,
    padding: 11,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  mapTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#375F3A',
  },
  smallMapButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#E6EEF7',
  },
  smallMapButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#246399',
  },
  map: {
    width: '100%',
    height: 360,
    borderRadius: 14,
  },
  mapPlaceholder: {
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    borderRadius: 14,
    backgroundColor: '#EEF1EC',
  },
  mapPlaceholderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#375F3A',
  },
  mapPlaceholderText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: '#697169',
  },
  statusBadge: {
    alignSelf: 'center',
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#E2EBDD',
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#375F3A',
  },
  timerCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 22,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  label: {
    fontSize: 14,
    color: '#5B675C',
  },
  timer: {
    marginTop: 5,
    fontSize: 40,
    fontWeight: '800',
    color: '#243325',
    fontVariant: ['tabular-nums'],
  },
  resultRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  resultCard: {
    flex: 1,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  resultLabel: {
    fontSize: 13,
    color: '#5B675C',
  },
  resultValue: {
    marginTop: 7,
    fontSize: 21,
    fontWeight: '700',
    color: '#243325',
  },
  gpsCard: {
    marginTop: 12,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  gpsStatus: {
    fontSize: 14,
    fontWeight: '700',
    color: '#375F3A',
  },
  coordinates: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    color: '#697169',
  },
  button: {
    flex: 1,
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  compactButton: {
    minHeight: 44,
    marginTop: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  primaryButton: {
    borderColor: '#375F3A',
    backgroundColor: '#375F3A',
  },
  secondaryButton: {
    borderColor: '#375F3A',
    backgroundColor: 'transparent',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  compactButtonText: {
    fontSize: 14,
  },
  secondaryButtonText: {
    color: '#375F3A',
  },
  dangerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  notice: {
    marginTop: 16,
    fontSize: 12,
    textAlign: 'center',
    color: '#7B827C',
  },
});
