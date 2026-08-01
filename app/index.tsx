import { useEffect, useRef, useState } from 'react';
import {
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

export default function HomeScreen() {
  const [status, setStatus] =
    useState<MeasurementStatus>('idle');

  const [elapsedMilliseconds, setElapsedMilliseconds] =
    useState(0);

  const startedAtRef = useRef<number | null>(null);
  const accumulatedMillisecondsRef = useRef(0);

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

  const handleStart = () => {
    accumulatedMillisecondsRef.current = 0;
    startedAtRef.current = Date.now();

    setElapsedMilliseconds(0);
    setStatus('running');
  };

  const handlePause = () => {
    if (startedAtRef.current === null) {
      return;
    }

    accumulatedMillisecondsRef.current +=
      Date.now() - startedAtRef.current;

    startedAtRef.current = null;

    setElapsedMilliseconds(
      accumulatedMillisecondsRef.current,
    );
    setStatus('paused');
  };

  const handleResume = () => {
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

      startedAtRef.current = null;

      setElapsedMilliseconds(
        accumulatedMillisecondsRef.current,
      );
    }

    setStatus('finished');
  };

  const handleReset = () => {
    startedAtRef.current = null;
    accumulatedMillisecondsRef.current = 0;

    setElapsedMilliseconds(0);
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
            0.00 km
          </Text>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>
            ポイポイ発見数
          </Text>
          <Text style={styles.resultValue}>0</Text>
        </View>
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
        現在は開発版です
      </Text>
    </View>
  );
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
    padding: 24,
    backgroundColor: '#F7F8F2',
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
    textAlign: 'center',
    color: '#243325',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    textAlign: 'center',
    color: '#5B675C',
  },
  statusBadge: {
    alignSelf: 'center',
    marginTop: 28,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E2EBDD',
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#375F3A',
  },
  timerCard: {
    marginTop: 18,
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  label: {
    fontSize: 15,
    color: '#5B675C',
  },
  timer: {
    marginTop: 8,
    fontSize: 48,
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
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  resultLabel: {
    fontSize: 13,
    color: '#5B675C',
  },
  resultValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '700',
    color: '#243325',
  },
  button: {
    marginTop: 16,
    paddingVertical: 17,
    borderRadius: 18,
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
    marginTop: 18,
    fontSize: 13,
    textAlign: 'center',
    color: '#7B827C',
  },
});