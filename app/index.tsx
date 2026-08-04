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
import type { Region } from 'react-native-maps';
import MapView, {
  Circle,
  Marker,
  Polygon,
} from 'react-native-maps';

import {
  associateAreasWithPois,
  calculateDistanceMeters,
  findUndiscoveredPoisNearPath,
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
const MAX_WALKING_SPEED_METERS_PER_SECOND = 4.5;
const DISCOVERY_RADIUS_METERS = 25;
const DEFAULT_EFFECT_RADIUS_METERS = 30;
const MAX_DISCOVERY_ACCURACY_BONUS_METERS = 5;

// 地図を縮小したときは、Apple Mapsに間引かれやすいピンではなく、
// 全ポイポイを軽量な点として表示します。
const OVERVIEW_MODE_LATITUDE_DELTA = 0.0015;
const OVERVIEW_POI_RADIUS_METERS = 9;

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

  const [isLoadingMap, setIsLoadingMap] =
    useState(false);

  const [isMapReady, setIsMapReady] =
    useState(false);

  const [isMapOverview, setIsMapOverview] =
    useState(false);

  const [isTownGrowthMode, setIsTownGrowthMode] =
    useState(false);

  const startedAtRef = useRef<number | null>(null);
  const accumulatedMillisecondsRef = useRef(0);
  const distanceMetersRef = useRef(0);

  const previousCoordinatesRef =
    useRef<TrackedCoordinates | null>(null);

  const previousLocationTimestampRef =
    useRef<number | null>(null);

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

  const areaPoiAssociations = useMemo(
    () =>
      loadedMap
        ? associateAreasWithPois(
            loadedMap.areas,
            loadedMap.pois,
          )
        : [],
    [loadedMap],
  );


  const discoveredCount = discoveredPoiIds.length;
  const totalPoiCount = loadedMap?.pois.length ?? 0;

  const completionPercentage =
    totalPoiCount === 0
      ? 0
      : Math.round(
          (discoveredCount / totalPoiCount) * 100,
        );

  const expandedAreaSquareMeters = useMemo(() => {
    if (!loadedMap || discoveredPoiIds.length === 0) {
      return 0;
    }

    const discoveredPois = loadedMap.pois.filter((poi) =>
      discoveredPoiIdSet.has(poi.id),
    );

    if (discoveredPois.length === 0) {
      return 0;
    }

    const GRID_SIZE_METERS = 2;
    const referenceLatitudeRadians =
      (discoveredPois[0].latitude * Math.PI) / 180;
    const metersPerLatitudeDegree = 111320;
    const metersPerLongitudeDegree =
      111320 * Math.cos(referenceLatitudeRadians);

    const originLatitude = discoveredPois[0].latitude;
    const originLongitude = discoveredPois[0].longitude;

    const occupiedCells = new Set<string>();
    const radiusInCells = Math.ceil(
      DEFAULT_EFFECT_RADIUS_METERS /
        GRID_SIZE_METERS,
    );

    for (const poi of discoveredPois) {
      const centerX =
        (poi.longitude - originLongitude) *
        metersPerLongitudeDegree;
      const centerY =
        (poi.latitude - originLatitude) *
        metersPerLatitudeDegree;

      const centerCellX = Math.round(
        centerX / GRID_SIZE_METERS,
      );
      const centerCellY = Math.round(
        centerY / GRID_SIZE_METERS,
      );

      for (
        let offsetX = -radiusInCells;
        offsetX <= radiusInCells;
        offsetX += 1
      ) {
        for (
          let offsetY = -radiusInCells;
          offsetY <= radiusInCells;
          offsetY += 1
        ) {
          const cellCenterX =
            (centerCellX + offsetX) *
            GRID_SIZE_METERS;
          const cellCenterY =
            (centerCellY + offsetY) *
            GRID_SIZE_METERS;

          const distanceFromPoi = Math.hypot(
            cellCenterX - centerX,
            cellCenterY - centerY,
          );

          if (
            distanceFromPoi <=
            DEFAULT_EFFECT_RADIUS_METERS
          ) {
            occupiedCells.add(
              `${centerCellX + offsetX}:${
                centerCellY + offsetY
              }`,
            );
          }
        }
      }
    }

    return (
      occupiedCells.size *
      GRID_SIZE_METERS *
      GRID_SIZE_METERS
    );
  }, [
    discoveredPoiIdSet,
    discoveredPoiIds.length,
    loadedMap,
  ]);

  const formattedExpandedArea =
    expandedAreaSquareMeters >= 1000
      ? `${(expandedAreaSquareMeters / 10000).toFixed(2)} ha`
      : `${Math.round(expandedAreaSquareMeters)
          .toString()
          .replace(/\B(?=(\d{3})+(?!\d))/g, ',')} m²`;

  const nearestPoiInfo = useMemo(() => {
    if (!currentCoordinates || !loadedMap) {
      return null;
    }

    let nearestPoi: ParsedMap['pois'][number] | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const poi of loadedMap.pois) {
      if (discoveredPoiIdSet.has(poi.id)) {
        continue;
      }

      const distance = calculateDistanceMeters(
        currentCoordinates,
        poi,
      );

      if (distance < nearestDistance) {
        nearestPoi = poi;
        nearestDistance = distance;
      }
    }

    if (!nearestPoi) {
      return null;
    }

    return {
      poi: nearestPoi,
      distanceMeters: nearestDistance,
    };
  }, [
    currentCoordinates,
    discoveredPoiIdSet,
    loadedMap,
  ]);

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

    // 現在地表示は、距離計算に採用しない測位でも更新します。
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

    const movement = evaluateMovement(
      nextCoordinates,
      location.timestamp,
      location.coords.speed,
    );

    if (movement.shouldAddDistance) {
      distanceMetersRef.current += movement.distanceMeters;
      setDistanceMeters(distanceMetersRef.current);
    }

    if (movement.shouldDiscover) {
      discoverPoisAlongMovement(
        movement.discoveryStart,
        nextCoordinates,
      );
    }

    // 不自然なGPS飛びでも、次回の基準地点には更新します。
    // ただし、その長い線分は攻略判定に使いません。
    if (
      movement.shouldUpdateBaseline ||
      movement.isInvalidJump
    ) {
      previousCoordinatesRef.current = nextCoordinates;
      previousLocationTimestampRef.current =
        location.timestamp;
    }
  };

  const evaluateMovement = (
    nextCoordinates: TrackedCoordinates,
    timestamp: number,
    reportedSpeed: number | null,
  ) => {
    const previousCoordinates =
      previousCoordinatesRef.current;
    const previousTimestamp =
      previousLocationTimestampRef.current;

    if (
      !previousCoordinates ||
      previousTimestamp === null
    ) {
      return {
        distanceMeters: 0,
        shouldAddDistance: false,
        shouldUpdateBaseline: true,
        isInvalidJump: false,
        shouldDiscover: true,
        discoveryStart: nextCoordinates,
      };
    }

    const addedDistance = calculateDistanceMeters(
      previousCoordinates,
      nextCoordinates,
    );

    const elapsedSeconds = Math.max(
      (timestamp - previousTimestamp) / 1000,
      0.5,
    );

    const calculatedSpeed = addedDistance / elapsedSeconds;

    const hasUsableReportedSpeed =
      reportedSpeed !== null && reportedSpeed >= 0;

    const isUnreasonableSpeed =
      calculatedSpeed >
        MAX_WALKING_SPEED_METERS_PER_SECOND ||
      (hasUsableReportedSpeed &&
        reportedSpeed >
          MAX_WALKING_SPEED_METERS_PER_SECOND);

    const maxReasonableDistance = Math.max(
      MAX_REASONABLE_JUMP_METERS,
      elapsedSeconds *
        MAX_WALKING_SPEED_METERS_PER_SECOND +
        5,
    );

    const isInvalidJump =
      addedDistance > maxReasonableDistance ||
      isUnreasonableSpeed;

    if (isInvalidJump) {
      return {
        distanceMeters: 0,
        shouldAddDistance: false,
        shouldUpdateBaseline: false,
        isInvalidJump: true,
        shouldDiscover: false,
        // GPSジャンプの線上や飛び先では攻略しません。
        // 次の正常な測位で改めて判定します。
        discoveryStart: nextCoordinates,
      };
    }

    return {
      distanceMeters: addedDistance,
      shouldAddDistance:
        addedDistance >= MIN_MOVEMENT_METERS,
      // 4m未満は基準を保持し、小さな揺れをまとめます。
      shouldUpdateBaseline:
        addedDistance >= MIN_MOVEMENT_METERS,
      isInvalidJump: false,
      shouldDiscover: true,
      discoveryStart: previousCoordinates,
    };
  };

  const discoverPoisAlongMovement = (
    from: TrackedCoordinates,
    to: TrackedCoordinates,
  ) => {
    const currentMap = loadedMapRef.current;

    if (!currentMap) {
      return;
    }

    const accuracyBonus = Math.min(
      (to.accuracy ?? 0) / 2,
      MAX_DISCOVERY_ACCURACY_BONUS_METERS,
    );

    const effectiveDiscoveryRadius =
      DISCOVERY_RADIUS_METERS + accuracyBonus;

    const newlyDiscovered =
      findUndiscoveredPoisNearPath(
        from,
        to,
        currentMap.pois,
        discoveredPoiIdsRef.current,
        effectiveDiscoveryRadius,
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

    const nextDiscoveredIds = Array.from(
      nextDiscoveredSet,
    );

    discoveredPoiIdsRef.current = nextDiscoveredSet;
    setDiscoveredPoiIds(nextDiscoveredIds);

    // 発見時の音・振動・カットインは入れず、
    // 数字と地図の色だけを静かに更新します。
    void saveGameState(currentMap, nextDiscoveredIds);
  };

  const stopLocationTracking = () => {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    previousCoordinatesRef.current = null;
    previousLocationTimestampRef.current = null;
  };

  const handleStart = async () => {
    accumulatedMillisecondsRef.current = 0;
    startedAtRef.current = null;
    distanceMetersRef.current = 0;
    previousCoordinatesRef.current = null;
    previousLocationTimestampRef.current = null;

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
    previousLocationTimestampRef.current = null;

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
        '地図データを入れ替える前に計測を終了してください。',
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
      await saveGameState(parsedMap, []);

      Alert.alert(
        '地図データを読み込みました',
        `${parsedMap.pois.length}件のポイポイを地図に表示します。`,
      );
    } catch (error) {
      console.error(error);

      Alert.alert(
        '地図データを読み込めませんでした',
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
      '地図データを外す',
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
            void clearGameState();
          },
        },
      ],
    );
  };

  const fitMapToLoadedData = (map: ParsedMap) => {
    const coordinates: Coordinates[] = map.pois.map(
      (poi) => ({
        latitude: poi.latitude,
        longitude: poi.longitude,
      }),
    );

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

  const handleMapRegionChangeComplete = (
    region: Region,
  ) => {
    setIsMapOverview(
      region.latitudeDelta >=
        OVERVIEW_MODE_LATITUDE_DELTA,
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
              ? 'ファイルを読み込み中…'
              : loadedMap
                ? '別のファイルを読み込む'
                : 'KMZ・KML・CSVを読み込む'
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
            ポイポイから約{DISCOVERY_RADIUS_METERS}m以内で発見します
          </Text>

          {nearestPoiInfo ? (
            <Text style={styles.nearestPoiText}>
              最寄りの未発見：{nearestPoiInfo.poi.name}
              {'\n'}
              あと約
              {Math.max(
                0,
                Math.round(nearestPoiInfo.distanceMeters),
              )}
              m
            </Text>
          ) : totalPoiCount > 0 && discoveredCount === totalPoiCount ? (
            <Text style={styles.nearestPoiText}>
              すべてのポイポイを発見しました
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.mapCard}>
        <View style={styles.mapHeader}>
          <Text style={styles.mapTitle}>
            {isTownGrowthMode
              ? 'まち育てマップ'
              : loadedMap
                ? '攻略マップ'
                : '現在地マップ'}
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
            showsUserLocation
            showsMyLocationButton={false}
            onMapReady={() => setIsMapReady(true)}
            onRegionChangeComplete={
              handleMapRegionChangeComplete
            }
          >

            {isTownGrowthMode &&
              areaPoiAssociations.map(
                ({ area, poiId }) =>
                  discoveredPoiIdSet.has(poiId) ? (
                    <Polygon
                      key={area.id}
                      coordinates={area.coordinates}
                      strokeColor="rgba(55, 95, 58, 0.95)"
                      fillColor="rgba(87, 166, 91, 0.52)"
                      strokeWidth={2}
                    />
                  ) : null,
              )}

            {isTownGrowthMode &&
              loadedMap?.pois.map((poi) => {
                const isDiscovered =
                  discoveredPoiIdSet.has(poi.id);

                if (!isDiscovered) {
                  return null;
                }

                return (
                  <Circle
                    key={`fill-${poi.id}`}
                    center={{
                      latitude: poi.latitude,
                      longitude: poi.longitude,
                    }}
                    radius={DEFAULT_EFFECT_RADIUS_METERS}
                    strokeWidth={2}
                    strokeColor="rgba(55, 95, 58, 0.95)"
                    fillColor="rgba(87, 166, 91, 0.52)"
                  />
                );
              })}

            {!isTownGrowthMode &&
              isMapOverview &&
              loadedMap?.pois.map((poi) => {
                const isDiscovered =
                  discoveredPoiIdSet.has(poi.id);

                return (
                  <Circle
                    key={`overview-poi-${poi.id}`}
                    center={{
                      latitude: poi.latitude,
                      longitude: poi.longitude,
                    }}
                    radius={OVERVIEW_POI_RADIUS_METERS}
                    strokeWidth={1}
                    strokeColor={
                      isDiscovered
                        ? 'rgba(55, 95, 58, 0.95)'
                        : 'rgba(92, 101, 94, 0.95)'
                    }
                    fillColor={
                      isDiscovered
                        ? 'rgba(87, 166, 91, 0.92)'
                        : 'rgba(123, 130, 124, 0.88)'
                    }
                  />
                );
              })}

            {!isTownGrowthMode &&
              !isMapOverview &&
              loadedMap?.pois.map((poi) => {
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
                    tracksViewChanges={false}
                    zIndex={isDiscovered ? 2 : 1}
                    description={
                      isDiscovered
                        ? '発見済みのポイポイ'
                        : '未発見のポイポイ'
                    }
                    pinColor={
                      isDiscovered
                        ? '#375F3A'
                        : '#7B827C'
                    }
                  />
                );
              })}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderTitle}>
              地図を準備しています
            </Text>

            <Text style={styles.mapPlaceholderText}>
              KMZ・KML・CSVを読み込むか、計測を開始すると地図を表示します
            </Text>
          </View>
        )}
      </View>

      {loadedMap && (
        <View style={styles.modeAction}>
          <ActionButton
            label={
              isTownGrowthMode
                ? '通常マップへ戻る'
                : 'まち育てモード'
            }
            onPress={() =>
              setIsTownGrowthMode(
                (currentMode) => !currentMode,
              )
            }
            secondary={!isTownGrowthMode}
            compact
          />
        </View>
      )}

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

      {isTownGrowthMode && (
        <View style={styles.areaCard}>
          <Text style={styles.resultLabel}>
            育てた緑
          </Text>

          <Text style={styles.areaValue}>
            {formattedExpandedArea}
          </Text>

          <Text style={styles.areaNote}>
            2m四方のマスで、重なった領域を一度だけ数えています。
          </Text>
        </View>
      )}

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
            label="地図データを外す"
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
  nearestPoiText: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DCE3D9',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#375F3A',
  },
  modeAction: {
    width: '68%',
    alignSelf: 'center',
    marginTop: 14,
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
  areaCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  areaValue: {
    marginTop: 7,
    fontSize: 28,
    fontWeight: '800',
    color: '#375F3A',
  },
  areaNote: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 17,
    color: '#697169',
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
