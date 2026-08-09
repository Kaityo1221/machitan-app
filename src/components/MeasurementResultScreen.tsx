import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Polygon } from 'react-native-maps';

import { fetchFlyawayBoundary } from '../lib/flyawayBoundary';
import { getFlyawayBonus } from '../lib/flyawayBonus';
import { createTownGrowthPetalCoordinates } from '../lib/townGrowthShape';
import type { ParsedMap } from '../types/map';

type ResultOverlayPhase = 'mystery' | 'bonus' | null;

type MeasurementResultScreenProps = {
  elapsedTime: string;
  distance: string;
  discoveredCount: number;
  totalPoiCount: number;
  completionPercentage: number;
  expandedAreaSquareMeters: number;
  stageName: string;
  stageDescription: string;
  loadedMap: ParsedMap | null;
  discoveredPoiIds: string[];
  eventSeed: string;
  onStartNewMeasurement: () => void;
};

const OWN_COUNTER_DURATION_MS = 2100;
const MYSTERY_DELAY_MS = 1500;
const MYSTERY_DISPLAY_END_MS = 2800;
const BONUS_DISPLAY_START_MS = 3050;
const BONUS_DISPLAY_END_MS = 4400;
const FINAL_COUNTER_DURATION_MS = 2100;

function formatSquareKilometers(value: number) {
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function MeasurementResultScreen({
  elapsedTime,
  distance,
  discoveredCount,
  totalPoiCount,
  completionPercentage,
  expandedAreaSquareMeters,
  stageName,
  stageDescription,
  loadedMap,
  discoveredPoiIds,
  eventSeed,
  onStartNewMeasurement,
}: MeasurementResultScreenProps) {
  const discoveredPoiIdSet = useMemo(
    () => new Set(discoveredPoiIds),
    [discoveredPoiIds],
  );

  const discoveredPois = useMemo(
    () =>
      loadedMap?.pois.filter((poi) =>
        discoveredPoiIdSet.has(poi.id),
      ) ?? [],
    [discoveredPoiIdSet, loadedMap],
  );

  const flyawayBonus = useMemo(
    () => getFlyawayBonus(eventSeed),
    [eventSeed],
  );

  const ownAreaSquareKilometers =
    expandedAreaSquareMeters / 1_000_000;

  const finalAreaSquareKilometers =
    ownAreaSquareKilometers +
    flyawayBonus.place.areaSquareKilometers;

  const [hasStartedReveal, setHasStartedReveal] =
    useState(false);
  const [bonusRevealed, setBonusRevealed] =
    useState(false);
  const [isFinalComplete, setIsFinalComplete] =
    useState(false);
  const [overlayPhase, setOverlayPhase] =
    useState<ResultOverlayPhase>(null);
  const [counterValue, setCounterValue] = useState(0);
  const [boundaryPolygons, setBoundaryPolygons] = useState<
    Array<Array<{ latitude: number; longitude: number }>>
  >([]);
  const [isBoundaryLoading, setIsBoundaryLoading] =
    useState(false);

  const timersRef = useRef<
    Array<ReturnType<typeof setTimeout>>
  >([]);
  const animationFrameRef = useRef<number | null>(null);

  const clearScheduledWork = () => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const schedule = (callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay);
    timersRef.current.push(timer);
  };

  const animateCounter = (
    fromValue: number,
    toValue: number,
    duration: number,
    onComplete?: () => void,
  ) => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startedAt = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextValue =
        fromValue + (toValue - fromValue) * eased;

      setCounterValue(nextValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      setCounterValue(toValue);
      animationFrameRef.current = null;
      onComplete?.();
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  };

  const scheduleFlyawaySequence = () => {
    schedule(() => {
      setOverlayPhase('mystery');
    }, MYSTERY_DELAY_MS);

    schedule(() => {
      setOverlayPhase(null);
    }, MYSTERY_DISPLAY_END_MS);

    schedule(() => {
      setOverlayPhase('bonus');
    }, BONUS_DISPLAY_START_MS);

    schedule(() => {
      setOverlayPhase(null);
      setBonusRevealed(true);

      animateCounter(
        ownAreaSquareKilometers,
        finalAreaSquareKilometers,
        FINAL_COUNTER_DURATION_MS,
        () => setIsFinalComplete(true),
      );
    }, BONUS_DISPLAY_END_MS);
  };

  const startRevealFlow = () => {
    clearScheduledWork();
    setHasStartedReveal(true);
    setBonusRevealed(false);
    setIsFinalComplete(false);
    setOverlayPhase(null);
    setCounterValue(0);

    animateCounter(
      0,
      ownAreaSquareKilometers,
      OWN_COUNTER_DURATION_MS,
      scheduleFlyawaySequence,
    );
  };

  useEffect(() => {
    return () => {
      clearScheduledWork();
    };
  }, []);

  useEffect(() => {
    if (!bonusRevealed) {
      setBoundaryPolygons([]);
      return;
    }

    let isCancelled = false;
    setIsBoundaryLoading(true);

    void fetchFlyawayBoundary(flyawayBonus.place)
      .then((polygons) => {
        if (!isCancelled) {
          setBoundaryPolygons(polygons);
        }
      })
      .catch((error) => {
        console.warn(
          '飛び地の境界データを取得できませんでした。',
          error,
        );

        if (!isCancelled) {
          setBoundaryPolygons([]);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsBoundaryLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [bonusRevealed, flyawayBonus.place]);

  const resultMapRegion = useMemo(() => {
    const sourcePois =
      discoveredPois.length > 0
        ? discoveredPois
        : loadedMap?.pois ?? [];

    if (sourcePois.length === 0) {
      return null;
    }

    const latitudes = sourcePois.map((poi) => poi.latitude);
    const longitudes = sourcePois.map((poi) => poi.longitude);
    const minimumLatitude = Math.min(...latitudes);
    const maximumLatitude = Math.max(...latitudes);
    const minimumLongitude = Math.min(...longitudes);
    const maximumLongitude = Math.max(...longitudes);

    return {
      latitude: (minimumLatitude + maximumLatitude) / 2,
      longitude: (minimumLongitude + maximumLongitude) / 2,
      latitudeDelta: Math.max(
        (maximumLatitude - minimumLatitude) * 1.5,
        0.006,
      ),
      longitudeDelta: Math.max(
        (maximumLongitude - minimumLongitude) * 1.5,
        0.006,
      ),
    };
  }, [discoveredPois, loadedMap]);

  const flyawayMapRegion = useMemo(() => {
    const latitudeDelta =
      flyawayBonus.place.category === 'prefecture'
        ? 4
        : flyawayBonus.place.category === 'small-country'
          ? 6
          : flyawayBonus.place.category === 'country'
            ? 34
            : 52;

    return {
      latitude: flyawayBonus.place.latitude,
      longitude: flyawayBonus.place.longitude,
      latitudeDelta,
      longitudeDelta: latitudeDelta,
    };
  }, [flyawayBonus.place]);

  const fallbackRadiusMeters = useMemo(() => {
    const equivalentRadius =
      Math.sqrt(
        flyawayBonus.place.areaSquareKilometers / Math.PI,
      ) * 1000;

    return Math.min(
      Math.max(equivalentRadius, 15_000),
      450_000,
    );
  }, [flyawayBonus.place.areaSquareKilometers]);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>EVENT RESULT</Text>
          <Text style={styles.title}>おつかれさまでした</Text>
          <Text style={styles.subtitle}>
            今日歩いたぶんだけ、まちに新しい緑が咲きました。
          </Text>

          <View style={styles.flowerMark}>
            <View style={[styles.petal, styles.petalTop]} />
            <View style={[styles.petal, styles.petalRight]} />
            <View style={[styles.petal, styles.petalBottomRight]} />
            <View style={[styles.petal, styles.petalBottomLeft]} />
            <View style={[styles.petal, styles.petalLeft]} />
            <View style={styles.flowerCenter} />
          </View>

          <Text style={styles.stageName}>{stageName}</Text>
          <Text style={styles.stageDescription}>
            {stageDescription}
          </Text>

          {loadedMap && (
            <Text style={styles.eventName}>
              {loadedMap.sourceName}
            </Text>
          )}
        </View>

        <View style={styles.statsGrid}>
          <ResultCard label="経過時間" value={elapsedTime} />
          <ResultCard label="歩行距離" value={distance} />
          <ResultCard
            label="ポイポイ発見"
            value={`${discoveredCount} / ${totalPoiCount}`}
          />
          <ResultCard
            label="攻略率"
            value={`${completionPercentage}%`}
          />
        </View>

        <View style={styles.areaCard}>
          <Text style={styles.areaLabel}>
            あなたが歩いて育てた範囲
          </Text>
          <Text style={styles.areaValue}>
            {formatSquareKilometers(ownAreaSquareKilometers)} km²
          </Text>
          <Text style={styles.areaNote}>
            発見したポイポイ周辺の、重なりを除いた範囲です。
          </Text>
        </View>

        {resultMapRegion && (
          <View style={styles.mapCard}>
            <View style={styles.mapHeader}>
              <Text style={styles.mapTitle}>今日育てたまち</Text>
              <Text style={styles.mapCaption}>五弁花表示</Text>
            </View>

            <MapView
              style={styles.map}
              initialRegion={resultMapRegion}
              scrollEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              zoomEnabled={false}
              showsCompass={false}
              showsScale={false}
              showsUserLocation={false}
            >
              {discoveredPois.map((poi) => (
                <Polygon
                  key={`result-petal-${poi.id}`}
                  coordinates={createTownGrowthPetalCoordinates(
                    poi,
                    poi.id,
                  )}
                  strokeColor="rgba(55, 95, 58, 0.86)"
                  fillColor="rgba(116, 190, 113, 0.52)"
                  strokeWidth={1.5}
                />
              ))}
            </MapView>
          </View>
        )}

        <View style={styles.finaleCard}>
          <Text style={styles.finaleEyebrow}>TOTAL AREA</Text>
          <Text style={styles.finaleTitle}>
            あなたが広げた範囲
          </Text>

          {!hasStartedReveal ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="広げた範囲を見る"
              onPress={startRevealFlow}
              style={({ pressed }) => [
                styles.revealButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.revealButtonText}>
                タップして広げた範囲を見る
              </Text>
            </Pressable>
          ) : (
            <View style={styles.counterBlock}>
              {bonusRevealed && (
                <View style={styles.breakdown}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>
                      自分が塗りつぶした範囲
                    </Text>
                    <Text style={styles.breakdownValue}>
                      {formatSquareKilometers(
                        ownAreaSquareKilometers,
                      )}{' '}
                      km²
                    </Text>
                  </View>

                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>
                      飛び地ボーナスの範囲
                    </Text>
                    <Text style={styles.breakdownValue}>
                      {formatSquareKilometers(
                        flyawayBonus.place.areaSquareKilometers,
                      )}{' '}
                      km²
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.counterLabel}>
                {bonusRevealed
                  ? 'あなたが広げた範囲'
                  : 'あなたが歩いて広げた範囲'}
              </Text>
              <Text style={styles.counterValue}>
                {formatSquareKilometers(counterValue)}
                <Text style={styles.counterUnit}> km²</Text>
              </Text>

              {bonusRevealed && (
                <Text style={styles.finaleNote}>
                  あなたが歩いて育てた範囲と、賛同した土地の範囲を合わせています。
                </Text>
              )}

              {isFinalComplete && (
                <Pressable
                  accessibilityRole="button"
                  onPress={startRevealFlow}
                  style={({ pressed }) => [
                    styles.replayButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.replayButtonText}>
                    もう一度見る
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {bonusRevealed && (
          <View style={styles.bonusCard}>
            <Text style={styles.bonusEyebrow}>
              飛び地ボーナス
            </Text>
            <Text style={styles.bonusPlace}>
              {flyawayBonus.place.name}
            </Text>
            <Text style={styles.bonusComment}>
              {flyawayBonus.comment}
            </Text>

            <View style={styles.bonusAreaPanel}>
              <Text style={styles.bonusAreaLabel}>
                {flyawayBonus.place.name}の公式面積
              </Text>
              <Text style={styles.bonusAreaValue}>
                {formatSquareKilometers(
                  flyawayBonus.place.areaSquareKilometers,
                )}{' '}
                km²
              </Text>
              <Text style={styles.bonusAreaSource}>
                出典：{flyawayBonus.place.areaSource}（
                {flyawayBonus.place.areaAsOf}）
              </Text>
            </View>

            <View style={styles.flyawayMapCard}>
              <View style={styles.mapHeader}>
                <Text style={styles.flyawayMapTitle}>
                  当たった土地はここ
                </Text>
                {isBoundaryLoading && (
                  <ActivityIndicator
                    size="small"
                    color="#8A5B00"
                  />
                )}
              </View>

              <MapView
                key={`flyaway-${flyawayBonus.place.name}`}
                style={styles.flyawayMap}
                initialRegion={flyawayMapRegion}
                scrollEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                zoomEnabled={false}
                showsCompass={false}
                showsScale={false}
                showsUserLocation={false}
              >
                {boundaryPolygons.length > 0 ? (
                  boundaryPolygons.map((coordinates, index) => (
                    <Polygon
                      key={`flyaway-boundary-${index}`}
                      coordinates={coordinates}
                      strokeColor="rgba(138, 91, 0, 0.95)"
                      fillColor="rgba(240, 184, 63, 0.58)"
                      strokeWidth={2}
                    />
                  ))
                ) : (
                  <Circle
                    center={{
                      latitude: flyawayBonus.place.latitude,
                      longitude: flyawayBonus.place.longitude,
                    }}
                    radius={fallbackRadiusMeters}
                    strokeColor="rgba(138, 91, 0, 0.9)"
                    fillColor="rgba(240, 184, 63, 0.35)"
                    strokeWidth={2}
                  />
                )}

                <Marker
                  coordinate={{
                    latitude: flyawayBonus.place.latitude,
                    longitude: flyawayBonus.place.longitude,
                  }}
                  title={flyawayBonus.place.name}
                />
              </MapView>

              <Text style={styles.flyawayMapNote}>
                境界を取得できた場合は、県・国の輪郭を塗って表示します。
              </Text>
            </View>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={onStartNewMeasurement}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            新しい計測を始める
          </Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={overlayPhase !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.overlayBackdrop}>
          <View style={styles.overlayCard}>
            {overlayPhase === 'mystery' ? (
              <>
                <Text style={styles.overlayEyebrow}>
                  EVENT RESULT
                </Text>
                <Text style={styles.mysteryText}>おや？</Text>
              </>
            ) : (
              <>
                <Text style={styles.bonusOverlayEyebrow}>
                  飛び地ボーナス
                </Text>
                <Text style={styles.bonusOverlayTitle}>
                  賛同した土地が見つかりました
                </Text>
                <Text style={styles.bonusOverlayPlace}>
                  {flyawayBonus.place.name}
                </Text>
                <Text style={styles.bonusOverlayComment}>
                  {flyawayBonus.comment}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

type ResultCardProps = {
  label: string;
  value: string;
};

function ResultCard({ label, value }: ResultCardProps) {
  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F8F2',
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 42,
  },
  heroCard: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#375F3A',
  },
  title: {
    marginTop: 8,
    fontSize: 29,
    fontWeight: '800',
    color: '#243325',
  },
  subtitle: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    color: '#6B756D',
  },
  flowerMark: {
    width: 112,
    height: 112,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petal: {
    position: 'absolute',
    width: 34,
    height: 52,
    borderRadius: 24,
    backgroundColor: '#9ED29A',
    borderWidth: 1.5,
    borderColor: '#4F7E53',
  },
  petalTop: {
    top: 4,
  },
  petalRight: {
    top: 29,
    right: 8,
    transform: [{ rotate: '72deg' }],
  },
  petalBottomRight: {
    right: 21,
    bottom: 5,
    transform: [{ rotate: '144deg' }],
  },
  petalBottomLeft: {
    left: 21,
    bottom: 5,
    transform: [{ rotate: '216deg' }],
  },
  petalLeft: {
    top: 29,
    left: 8,
    transform: [{ rotate: '288deg' }],
  },
  flowerCenter: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#79B875',
    borderWidth: 1.5,
    borderColor: '#4F7E53',
  },
  stageName: {
    marginTop: 7,
    fontSize: 28,
    fontWeight: '800',
    color: '#375F3A',
  },
  stageDescription: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: '#667068',
  },
  eventName: {
    marginTop: 9,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    color: '#6B756D',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  resultCard: {
    width: '48%',
    minHeight: 108,
    justifyContent: 'center',
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  resultLabel: {
    fontSize: 13,
    color: '#6B756D',
  },
  resultValue: {
    marginTop: 7,
    fontSize: 24,
    fontWeight: '800',
    color: '#243325',
  },
  areaCard: {
    marginTop: 12,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  areaLabel: {
    fontSize: 13,
    color: '#6B756D',
  },
  areaValue: {
    marginTop: 7,
    fontSize: 27,
    fontWeight: '800',
    color: '#243325',
  },
  areaNote: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 17,
    color: '#788078',
  },
  mapCard: {
    marginTop: 12,
    padding: 11,
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  mapTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#375F3A',
  },
  mapCaption: {
    fontSize: 11,
    color: '#778078',
  },
  map: {
    width: '100%',
    height: 360,
    borderRadius: 15,
  },
  finaleCard: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 22,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#245E39',
  },
  finaleEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.75)',
  },
  finaleTitle: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  revealButton: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 8,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  revealButtonText: {
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  counterBlock: {
    marginTop: 20,
  },
  breakdown: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    gap: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.76)',
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  counterLabel: {
    marginTop: 18,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.82)',
  },
  counterValue: {
    minHeight: 72,
    marginTop: 5,
    fontSize: 50,
    lineHeight: 60,
    fontWeight: '900',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  counterUnit: {
    fontSize: 19,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },
  finaleNote: {
    marginTop: 12,
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.68)',
  },
  replayButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 17,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  replayButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bonusCard: {
    marginTop: 12,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFAF0',
  },
  bonusEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#9A6810',
  },
  bonusPlace: {
    marginTop: 9,
    fontSize: 29,
    fontWeight: '900',
    color: '#6E4B0D',
  },
  bonusComment: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 22,
    color: '#665B49',
  },
  bonusAreaPanel: {
    marginTop: 14,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#FFF1C9',
  },
  bonusAreaLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#79520E',
  },
  bonusAreaValue: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '900',
    color: '#6E4B0D',
  },
  bonusAreaSource: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    color: '#8A7B63',
  },
  flyawayMapCard: {
    marginTop: 14,
    padding: 10,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  flyawayMapTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#6E4B0D',
  },
  flyawayMap: {
    width: '100%',
    height: 230,
    borderRadius: 13,
  },
  flyawayMapNote: {
    marginTop: 7,
    fontSize: 10,
    lineHeight: 15,
    color: '#81725A',
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: '#375F3A',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  buttonPressed: {
    opacity: 0.72,
  },
  overlayBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(247,248,242,0.88)',
  },
  overlayCard: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 30,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    shadowColor: '#243325',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  overlayEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#7B827C',
  },
  mysteryText: {
    marginTop: 9,
    fontSize: 42,
    fontWeight: '900',
    color: '#243325',
  },
  bonusOverlayEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    color: '#9A6810',
  },
  bonusOverlayTitle: {
    marginTop: 9,
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
    color: '#6E4B0D',
  },
  bonusOverlayPlace: {
    marginTop: 12,
    fontSize: 40,
    fontWeight: '900',
    textAlign: 'center',
    color: '#9A6810',
  },
  bonusOverlayComment: {
    marginTop: 11,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: '#6B756D',
  },
});
