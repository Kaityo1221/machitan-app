import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type MeasurementStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'finished';

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

const MAX_ACCEPTABLE_ACCURACY_METERS = 20;
const MIN_MOVEMENT_METERS = 4;
const MAX_REASONABLE_JUMP_METERS = 30;

export default function HomeScreen() {
  useKeepAwake();

  const [status, setStatus] =
    useState<MeasurementStatus>('idle');

  const [elapsedMilliseconds, setElapsedMilliseconds] =
    useState(0);

  const [distanceMeters, setDistanceMeters] =
    useState(0);

  const [currentCoordinates, setCurrentCoordinates] =
    useState<Coordinates | null>(null);

  const [gpsMessage, setGpsMessage] =
    useState('GPS待機中');

  const startedAtRef = useRef<number | null>(null);
  const accumulatedMillisecondsRef = useRef(0);
  const distanceMetersRef = useRef(0);

  const previousCoordinatesRef =
    useRef<Coordinates | null>(null);

  const locationSubscriptionRef =
    useRef<Location.LocationSubscription | null>(null);

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
    return () => {
      locationSubscriptionRef.current?.remove();
    };
  }, []);

  const startLocationTracking = async () => {
    try {
      setGpsMessage('位置情報の許可を確認中');

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        setGpsMessage('位置情報が許可されていません');

        Alert.alert(
          '位置情報が必要です',
          'まちたん！で歩行距離を計測するには、位置情報の利用を許可してください。',
        );

        return false;
      }

      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;

      setGpsMessage('GPSを取得中');

      const subscription =
        await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 1,
            timeInterval: 2000,
          },
          (location) => {
            const nextCoordinates: Coordinates = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
            };

            setCurrentCoordinates(nextCoordinates);

            const accuracy =
              nextCoordinates.accuracy ?? 9999;

            if (
              accuracy >
              MAX_ACCEPTABLE_ACCURACY_METERS
            ) {
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

            const previousCoordinates =
  previousCoordinatesRef.current;

// 最初の有効なGPS座標を基準位置として保存
if (!previousCoordinates) {
  previousCoordinatesRef.current =
    nextCoordinates;
  return;
}

const addedDistance =
  calculateDistanceMeters(
    previousCoordinates,
    nextCoordinates,
  );

if (
  addedDistance >= MIN_MOVEMENT_METERS &&
  addedDistance <= MAX_REASONABLE_JUMP_METERS
) {
  distanceMetersRef.current += addedDistance;

  setDistanceMeters(
    distanceMetersRef.current,
  );

  previousCoordinatesRef.current =
    nextCoordinates;
} else if (
  addedDistance > MAX_REASONABLE_JUMP_METERS
) {
  // 大きなGPS飛びは距離へ加算せず、
  // 次回計測用の基準位置だけ更新する
  previousCoordinatesRef.current =
    nextCoordinates;
}
          },
        );

      locationSubscriptionRef.current =
        subscription;

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
    const trackingStarted =
      await startLocationTracking();

    if (!trackingStarted) {
      return;
    }

    previousCoordinatesRef.current = null;
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

  const handleReset = () => {
    stopLocationTracking();

    startedAtRef.current = null;
    accumulatedMillisecondsRef.current = 0;
    distanceMetersRef.current = 0;

    setElapsedMilliseconds(0);
    setDistanceMeters(0);
    setCurrentCoordinates(null);
    setGpsMessage('GPS待機中');
    setStatus('idle');
  };

  const totalSeconds = Math.floor(
    elapsedMilliseconds / 1000,
  );

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );
  const seconds = totalSeconds % 60;

  const formattedElapsedTime = [
    hours,
    minutes,
    seconds,
  ]
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
    <View style={styles.container}>
      <Text style={styles.logo}>まちたん！</Text>

      <Text style={styles.subtitle}>
        歩いて見つける、まち探索アプリ
      </Text>

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

          <Text style={styles.resultValue}>0</Text>
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
          onPress={handleReset}
        />
      )}

      <Text style={styles.notice}>
        テスト中は画面を閉じないでください
      </Text>
    </View>
  );
}

function calculateDistanceMeters(
  from: Coordinates,
  to: Coordinates,
) {
  const earthRadiusMeters = 6371000;

  const latitudeDifference =
    degreesToRadians(to.latitude - from.latitude);

  const longitudeDifference =
    degreesToRadians(
      to.longitude - from.longitude,
    );

  const fromLatitude =
    degreesToRadians(from.latitude);

  const toLatitude =
    degreesToRadians(to.latitude);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  const centralAngle =
    2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * centralAngle;
}

function degreesToRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  secondary?: boolean;
};

function ActionButton({
  label,
  onPress,
  secondary = false,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary
          ? styles.secondaryButton
          : styles.primaryButton,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.secondaryButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    backgroundColor: '#F7F8F2',
  },
  logo: {
    fontSize: 38,
    fontWeight: '800',
    textAlign: 'center',
    color: '#243325',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    textAlign: 'center',
    color: '#5B675C',
  },
  statusBadge: {
    alignSelf: 'center',
    marginTop: 20,
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
    marginTop: 14,
    padding: 18,
    borderRadius: 22,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  label: {
    fontSize: 14,
    color: '#5B675C',
  },
  timer: {
    marginTop: 6,
    fontSize: 43,
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
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 17,
    alignItems: 'center',
    borderWidth: 2,
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
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#375F3A',
  },
  notice: {
    marginTop: 14,
    fontSize: 12,
    textAlign: 'center',
    color: '#7B827C',
  },
});