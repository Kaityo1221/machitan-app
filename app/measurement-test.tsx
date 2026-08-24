import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { calculateDistanceMeters } from '../src/lib/geo';
import { readMapFile } from '../src/lib/kmz';
import type { ParsedMap, TrackedCoordinates } from '../src/types/map';

const MAX_ACCEPTABLE_ACCURACY_METERS = 20;
const MAX_WALKING_SPEED_METERS_PER_SECOND = 4.5;
const MAX_REASONABLE_JUMP_METERS = 30;

type SampleDecision =
  | 'accepted'
  | 'rejected_accuracy'
  | 'rejected_jump';

type TestSample = {
  sequence: number;
  receivedAt: string;
  sourceTimestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  reportedSpeed: number | null;
  calculatedSpeed: number | null;
  distanceFromPreviousAcceptedMeters: number | null;
  decision: SampleDecision;
  reason: string;
};

type SessionTiming = {
  startPressedAt: number | null;
  permissionResolvedAt: number | null;
  firstRawFixAt: number | null;
  firstAcceptedFixAt: number | null;
};

function formatSeconds(milliseconds: number | null) {
  if (milliseconds === null) {
    return '---';
  }

  return `${(milliseconds / 1000).toFixed(1)}秒`;
}

export default function MeasurementTestScreen() {
  const [loadedMap, setLoadedMap] = useState<ParsedMap | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('GPS待機中');
  const [currentCoordinates, setCurrentCoordinates] =
    useState<TrackedCoordinates | null>(null);
  const [samples, setSamples] = useState<TestSample[]>([]);
  const [acceptedPath, setAcceptedPath] = useState<TrackedCoordinates[]>([]);
  const [sessionTiming, setSessionTiming] = useState<SessionTiming>({
    startPressedAt: null,
    permissionResolvedAt: null,
    firstRawFixAt: null,
    firstAcceptedFixAt: null,
  });

  const mapRef = useRef<MapView | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const previousAcceptedRef = useRef<TrackedCoordinates | null>(null);
  const previousAcceptedTimestampRef = useRef<number | null>(null);
  const sampleSequenceRef = useRef(0);
  const sessionTimingRef = useRef<SessionTiming>({
    startPressedAt: null,
    permissionResolvedAt: null,
    firstRawFixAt: null,
    firstAcceptedFixAt: null,
  });

  const acceptedSamples = useMemo(
    () => samples.filter((sample) => sample.decision === 'accepted'),
    [samples],
  );

  const rejectedAccuracyCount = useMemo(
    () =>
      samples.filter((sample) => sample.decision === 'rejected_accuracy')
        .length,
    [samples],
  );

  const rejectedJumpCount = useMemo(
    () => samples.filter((sample) => sample.decision === 'rejected_jump').length,
    [samples],
  );

  const validAccuracies = useMemo(
    () =>
      samples
        .map((sample) => sample.accuracy)
        .filter((accuracy): accuracy is number => accuracy !== null),
    [samples],
  );

  const averageAccuracy =
    validAccuracies.length > 0
      ? validAccuracies.reduce((sum, value) => sum + value, 0) /
        validAccuracies.length
      : null;

  const acceptedDistanceMeters = useMemo(() => {
    let total = 0;

    for (let index = 1; index < acceptedPath.length; index += 1) {
      total += calculateDistanceMeters(acceptedPath[index - 1], acceptedPath[index]);
    }

    return total;
  }, [acceptedPath]);

  const startToRawFixMs =
    sessionTiming.startPressedAt !== null && sessionTiming.firstRawFixAt !== null
      ? sessionTiming.firstRawFixAt - sessionTiming.startPressedAt
      : null;

  const startToAcceptedFixMs =
    sessionTiming.startPressedAt !== null &&
    sessionTiming.firstAcceptedFixAt !== null
      ? sessionTiming.firstAcceptedFixAt - sessionTiming.startPressedAt
      : null;

  const permissionToAcceptedFixMs =
    sessionTiming.permissionResolvedAt !== null &&
    sessionTiming.firstAcceptedFixAt !== null
      ? sessionTiming.firstAcceptedFixAt - sessionTiming.permissionResolvedAt
      : null;

  const updateSessionTiming = (next: Partial<SessionTiming>) => {
    const merged = {
      ...sessionTimingRef.current,
      ...next,
    };

    sessionTimingRef.current = merged;
    setSessionTiming(merged);
  };

  const handlePickMap = async () => {
    if (isRunning) {
      Alert.alert('計測中です', 'KMZを入れ替える前に計測を停止してください。');
      return;
    }

    try {
      setIsLoadingMap(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      const parsedMap = await readMapFile(asset.uri, asset.name);
      setLoadedMap(parsedMap);

      setTimeout(() => {
        if (parsedMap.pois.length > 1) {
          mapRef.current?.fitToCoordinates(
            parsedMap.pois.map((poi) => ({
              latitude: poi.latitude,
              longitude: poi.longitude,
            })),
            {
              edgePadding: { top: 80, right: 50, bottom: 80, left: 50 },
              animated: true,
            },
          );
        }
      }, 300);

      Alert.alert(
        'KMZ読み込み完了',
        `${parsedMap.pois.length}件のポイポイを読み込みました。`,
      );
    } catch (error) {
      Alert.alert(
        'KMZを読み込めませんでした',
        error instanceof Error ? error.message : 'ファイルを確認してください。',
      );
    } finally {
      setIsLoadingMap(false);
    }
  };

  const handleLocationUpdate = (location: Location.LocationObject) => {
    const receivedAtMs = Date.now();
    const coordinates: TrackedCoordinates = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };

    setCurrentCoordinates(coordinates);

    if (sessionTimingRef.current.firstRawFixAt === null) {
      updateSessionTiming({ firstRawFixAt: receivedAtMs });
    }

    const accuracy = location.coords.accuracy;
    let decision: SampleDecision = 'accepted';
    let reason = '採用';
    let calculatedSpeed: number | null = null;
    let distanceFromPreviousAcceptedMeters: number | null = null;

    if (accuracy === null || accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
      decision = 'rejected_accuracy';
      reason =
        accuracy === null
          ? '精度情報なし'
          : `精度${Math.round(accuracy)}m > ${MAX_ACCEPTABLE_ACCURACY_METERS}m`;
    } else if (
      previousAcceptedRef.current &&
      previousAcceptedTimestampRef.current !== null
    ) {
      distanceFromPreviousAcceptedMeters = calculateDistanceMeters(
        previousAcceptedRef.current,
        coordinates,
      );

      const elapsedSeconds = Math.max(
        (location.timestamp - previousAcceptedTimestampRef.current) / 1000,
        0.5,
      );
      calculatedSpeed = distanceFromPreviousAcceptedMeters / elapsedSeconds;

      const reportedSpeed = location.coords.speed;
      const hasUsableReportedSpeed =
        reportedSpeed !== null && reportedSpeed >= 0;
      const maxReasonableDistance = Math.max(
        MAX_REASONABLE_JUMP_METERS,
        elapsedSeconds * MAX_WALKING_SPEED_METERS_PER_SECOND + 5,
      );
      const isUnreasonableSpeed =
        calculatedSpeed > MAX_WALKING_SPEED_METERS_PER_SECOND ||
        (hasUsableReportedSpeed &&
          reportedSpeed > MAX_WALKING_SPEED_METERS_PER_SECOND);

      if (
        distanceFromPreviousAcceptedMeters > maxReasonableDistance ||
        isUnreasonableSpeed
      ) {
        decision = 'rejected_jump';
        reason = `GPS飛び候補 ${distanceFromPreviousAcceptedMeters.toFixed(1)}m / ${elapsedSeconds.toFixed(1)}秒`;
      }
    }

    sampleSequenceRef.current += 1;
    const sample: TestSample = {
      sequence: sampleSequenceRef.current,
      receivedAt: new Date(receivedAtMs).toISOString(),
      sourceTimestamp: location.timestamp,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy,
      altitude: location.coords.altitude,
      heading: location.coords.heading,
      reportedSpeed: location.coords.speed,
      calculatedSpeed,
      distanceFromPreviousAcceptedMeters,
      decision,
      reason,
    };

    setSamples((current) => [...current, sample]);

    if (decision === 'accepted') {
      if (sessionTimingRef.current.firstAcceptedFixAt === null) {
        updateSessionTiming({ firstAcceptedFixAt: receivedAtMs });
      }

      previousAcceptedRef.current = coordinates;
      previousAcceptedTimestampRef.current = location.timestamp;
      setAcceptedPath((current) => [...current, coordinates]);
      setGpsMessage(`GPS受信中（精度 約${Math.round(accuracy ?? 0)}m）`);
    } else if (decision === 'rejected_accuracy') {
      setGpsMessage(
        accuracy === null
          ? 'GPS精度情報を待っています'
          : `GPS精度を調整中（約${Math.round(accuracy)}m）`,
      );
    } else {
      setGpsMessage('GPS飛び候補を除外しました');
    }
  };

  const handleStart = async () => {
    if (!loadedMap) {
      Alert.alert('先にKMZを読み込んでください');
      return;
    }

    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    previousAcceptedRef.current = null;
    previousAcceptedTimestampRef.current = null;
    sampleSequenceRef.current = 0;
    setSamples([]);
    setAcceptedPath([]);

    const startedAt = Date.now();
    const initialTiming: SessionTiming = {
      startPressedAt: startedAt,
      permissionResolvedAt: null,
      firstRawFixAt: null,
      firstAcceptedFixAt: null,
    };
    sessionTimingRef.current = initialTiming;
    setSessionTiming(initialTiming);
    setGpsMessage('位置情報の許可を確認中');

    const permission = await Location.requestForegroundPermissionsAsync();
    updateSessionTiming({ permissionResolvedAt: Date.now() });

    if (permission.status !== 'granted') {
      setGpsMessage('位置情報が許可されていません');
      Alert.alert('位置情報が必要です');
      return;
    }

    try {
      setGpsMessage('現在地を確認しています…');
      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 1,
          timeInterval: 2000,
        },
        handleLocationUpdate,
      );
      setIsRunning(true);
    } catch (error) {
      console.error(error);
      setGpsMessage('GPSを開始できませんでした');
      Alert.alert('GPSエラー', '位置情報を取得できませんでした。');
    }
  };

  const handleStop = () => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    setIsRunning(false);
    setGpsMessage('計測停止');
  };

  const buildExportPayload = () => ({
    format: 'machitan-measurement-test-v1',
    exportedAt: new Date().toISOString(),
    map: loadedMap
      ? {
          sourceName: loadedMap.sourceName,
          poiCount: loadedMap.pois.length,
          areaCount: loadedMap.areas.length,
        }
      : null,
    config: {
      requestedAccuracy: 'BestForNavigation',
      distanceIntervalMeters: 1,
      timeIntervalMilliseconds: 2000,
      maxAcceptableAccuracyMeters: MAX_ACCEPTABLE_ACCURACY_METERS,
      maxWalkingSpeedMetersPerSecond: MAX_WALKING_SPEED_METERS_PER_SECOND,
      maxReasonableJumpMeters: MAX_REASONABLE_JUMP_METERS,
    },
    timing: {
      ...sessionTiming,
      startToFirstRawFixMilliseconds: startToRawFixMs,
      startToFirstAcceptedFixMilliseconds: startToAcceptedFixMs,
      permissionToFirstAcceptedFixMilliseconds: permissionToAcceptedFixMs,
    },
    summary: {
      rawSampleCount: samples.length,
      acceptedSampleCount: acceptedSamples.length,
      rejectedAccuracyCount,
      rejectedJumpCount,
      acceptedDistanceMeters,
      averageAccuracyMeters: averageAccuracy,
      bestAccuracyMeters:
        validAccuracies.length > 0 ? Math.min(...validAccuracies) : null,
      worstAccuracyMeters:
        validAccuracies.length > 0 ? Math.max(...validAccuracies) : null,
    },
    samples,
  });

  const handleShareJson = async () => {
    if (samples.length === 0) {
      Alert.alert('計測データがありません');
      return;
    }

    try {
      const payload = buildExportPayload();
      await Share.share({
        title: 'まちたん！計測テストJSON',
        message: JSON.stringify(payload, null, 2),
      });
    } catch (error) {
      console.error(error);
      Alert.alert('共有できませんでした');
    }
  };

  const initialRegion = loadedMap?.pois[0]
    ? {
        latitude: loadedMap.pois[0].latitude,
        longitude: loadedMap.pois[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : {
        latitude: 35.681236,
        longitude: 139.767125,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ 戻る</Text>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.eyebrow}>FIELD TEST</Text>
          <Text style={styles.title}>まちたん！計測テスト</Text>
        </View>
      </View>

      <Text style={styles.description}>
        KMZと実際のGPSを使って、測位開始の遅延・精度・GPS飛びを記録します。
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. テスト用KMZ</Text>
        <Pressable
          onPress={handlePickMap}
          disabled={isLoadingMap || isRunning}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || isLoadingMap) && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isLoadingMap
              ? '読み込み中…'
              : loadedMap
                ? 'KMZを入れ替える'
                : 'KMZを読み込む'}
          </Text>
        </Pressable>

        {loadedMap && (
          <View style={styles.loadedInfo}>
            <Text style={styles.loadedName}>{loadedMap.sourceName}</Text>
            <Text style={styles.mutedText}>
              ポイポイ {loadedMap.pois.length}件 / 活動範囲 {loadedMap.areas.length}件
            </Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>2. GPS計測</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isRunning && styles.statusDotActive]} />
          <Text style={styles.statusText}>{gpsMessage}</Text>
        </View>

        {!isRunning ? (
          <Pressable
            onPress={handleStart}
            style={({ pressed }) => [
              styles.startButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.startButtonText}>計測開始</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [
              styles.stopButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.stopButtonText}>計測停止</Text>
          </Pressable>
        )}

        <View style={styles.metricGrid}>
          <Metric label="最初のGPS" value={formatSeconds(startToRawFixMs)} />
          <Metric label="最初の有効測位" value={formatSeconds(startToAcceptedFixMs)} />
          <Metric
            label="許可後→有効測位"
            value={formatSeconds(permissionToAcceptedFixMs)}
          />
          <Metric
            label="現在精度"
            value={
              currentCoordinates?.accuracy !== null &&
              currentCoordinates?.accuracy !== undefined
                ? `${Math.round(currentCoordinates.accuracy)}m`
                : '---'
            }
          />
          <Metric label="生データ" value={`${samples.length}件`} />
          <Metric label="採用" value={`${acceptedSamples.length}件`} />
          <Metric label="精度除外" value={`${rejectedAccuracyCount}件`} />
          <Metric label="GPS飛び除外" value={`${rejectedJumpCount}件`} />
          <Metric
            label="採用距離"
            value={`${acceptedDistanceMeters.toFixed(1)}m`}
          />
          <Metric
            label="平均精度"
            value={averageAccuracy === null ? '---' : `${averageAccuracy.toFixed(1)}m`}
          />
        </View>
      </View>

      <View style={styles.mapCard}>
        <Text style={styles.cardTitle}>3. 現地確認</Text>
        <MapView ref={mapRef} style={styles.map} initialRegion={initialRegion} showsUserLocation>
          {loadedMap?.pois.map((poi) => (
            <Marker
              key={poi.id}
              coordinate={{ latitude: poi.latitude, longitude: poi.longitude }}
              title={poi.name}
            />
          ))}
          {acceptedPath.length >= 2 && (
            <Polyline coordinates={acceptedPath} strokeWidth={4} />
          )}
        </MapView>
        {currentCoordinates && (
          <Text style={styles.coordinateText}>
            {currentCoordinates.latitude.toFixed(6)}, {currentCoordinates.longitude.toFixed(6)}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>4. 直近の測位</Text>
        {samples.length === 0 ? (
          <Text style={styles.mutedText}>まだ測位データはありません。</Text>
        ) : (
          samples
            .slice(-8)
            .reverse()
            .map((sample) => (
              <View key={sample.sequence} style={styles.sampleRow}>
                <Text style={styles.sampleSequence}>#{sample.sequence}</Text>
                <View style={styles.sampleBody}>
                  <Text
                    style={[
                      styles.sampleDecision,
                      sample.decision === 'accepted'
                        ? styles.sampleAccepted
                        : styles.sampleRejected,
                    ]}
                  >
                    {sample.decision === 'accepted' ? '採用' : '除外'} ・ {sample.reason}
                  </Text>
                  <Text style={styles.sampleMeta}>
                    精度 {sample.accuracy === null ? '---' : `${sample.accuracy.toFixed(1)}m`}
                    {'  '}速度 {sample.reportedSpeed === null ? '---' : `${sample.reportedSpeed.toFixed(2)}m/s`}
                  </Text>
                </View>
              </View>
            ))
        )}
      </View>

      <Pressable
        onPress={handleShareJson}
        disabled={samples.length === 0}
        style={({ pressed }) => [
          styles.exportButton,
          samples.length === 0 && styles.disabledButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.exportButtonText}>計測結果をJSONで共有</Text>
      </Pressable>

      <Text style={styles.footerNote}>
        テスト終了後、このJSONをそのまま解析に使えます。KMZ本体はJSONには含めません。
      </Text>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F0E8',
  },
  container: {
    paddingTop: 64,
    paddingHorizontal: 18,
    paddingBottom: 48,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 6,
  },
  backButtonText: {
    color: '#4F5F4A',
    fontWeight: '700',
    fontSize: 16,
  },
  headerTitleWrap: {
    flex: 1,
  },
  eyebrow: {
    color: '#A05E33',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    color: '#243021',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  description: {
    color: '#697063',
    lineHeight: 21,
    fontSize: 14,
    marginBottom: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    gap: 10,
    overflow: 'hidden',
  },
  cardTitle: {
    color: '#2C3828',
    fontSize: 17,
    fontWeight: '900',
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#516D4D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  loadedInfo: {
    paddingTop: 2,
  },
  loadedName: {
    color: '#2F3D2B',
    fontSize: 15,
    fontWeight: '800',
  },
  mutedText: {
    color: '#7B8177',
    fontSize: 13,
    marginTop: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#A8ADA3',
  },
  statusDotActive: {
    backgroundColor: '#4E8D55',
  },
  statusText: {
    color: '#455042',
    fontSize: 14,
    fontWeight: '700',
  },
  startButton: {
    minHeight: 58,
    borderRadius: 17,
    backgroundColor: '#CB713E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  stopButton: {
    minHeight: 58,
    borderRadius: 17,
    backgroundColor: '#653C35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    width: '48.5%',
    backgroundColor: '#F5F6F2',
    borderRadius: 13,
    padding: 11,
  },
  metricLabel: {
    color: '#7A8175',
    fontSize: 11,
    fontWeight: '700',
  },
  metricValue: {
    color: '#283326',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  map: {
    width: '100%',
    height: 380,
    borderRadius: 14,
  },
  coordinateText: {
    color: '#6A7166',
    textAlign: 'center',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  sampleRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7E1',
  },
  sampleSequence: {
    color: '#8A8F86',
    fontWeight: '800',
    width: 38,
  },
  sampleBody: {
    flex: 1,
  },
  sampleDecision: {
    fontWeight: '800',
    fontSize: 13,
  },
  sampleAccepted: {
    color: '#487D4C',
  },
  sampleRejected: {
    color: '#A85A3C',
  },
  sampleMeta: {
    color: '#7A8176',
    fontSize: 12,
    marginTop: 3,
  },
  exportButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#2F3A2C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.35,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  footerNote: {
    color: '#7B8177',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
