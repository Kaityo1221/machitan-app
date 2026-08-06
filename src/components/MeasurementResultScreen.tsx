import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Polygon } from 'react-native-maps';

import { createTownGrowthPetalCoordinates } from '../lib/townGrowthShape';
import type { ParsedMap } from '../types/map';

type MeasurementResultScreenProps = {
  elapsedTime: string;
  distance: string;
  discoveredCount: number;
  totalPoiCount: number;
  completionPercentage: number;
  expandedArea: string;
  stageName: string;
  stageDescription: string;
  loadedMap: ParsedMap | null;
  discoveredPoiIds: string[];
  onStartNewMeasurement: () => void;
};

export function MeasurementResultScreen({
  elapsedTime,
  distance,
  discoveredCount,
  totalPoiCount,
  completionPercentage,
  expandedArea,
  stageName,
  stageDescription,
  loadedMap,
  discoveredPoiIds,
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

  return (
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
          あなたが歩いて育てた面積
        </Text>
        <Text style={styles.areaValue}>{expandedArea}</Text>
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

      <Text style={styles.notice}>
        飛び地ボーナスは次の段階で、この結果画面へ追加します。
      </Text>
    </ScrollView>
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
  notice: {
    marginTop: 16,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: '#788078',
  },
});
