import type { Coordinates } from '../types/map';

const METERS_PER_LATITUDE_DEGREE = 111320;
const PETAL_COUNT = 5;
const POINTS_PER_PETAL = 8;
const INNER_RADIUS_METERS = 17;
const OUTER_RADIUS_METERS = 30;

function getStableRotationRadians(seed: string) {
  let hash = 0;

  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  const onePetalTurn = (Math.PI * 2) / PETAL_COUNT;

  return ((hash % 1000) / 1000) * onePetalTurn;
}

/**
 * ポイポイを中心に、5枚の花びらを持つ滑らかな輪郭を作ります。
 * 表示だけを花形にし、面積計算は従来どおり半径30mの円を使います。
 */
export function createTownGrowthPetalCoordinates(
  center: Coordinates,
  seed: string,
): Coordinates[] {
  const pointCount = PETAL_COUNT * POINTS_PER_PETAL;
  const rotation = getStableRotationRadians(seed);
  const latitudeRadians = (center.latitude * Math.PI) / 180;
  const metersPerLongitudeDegree = Math.max(
    1,
    METERS_PER_LATITUDE_DEGREE * Math.cos(latitudeRadians),
  );

  return Array.from({ length: pointCount }, (_, index) => {
    const angle =
      rotation + (index / pointCount) * Math.PI * 2;
    const petalWave =
      (1 + Math.cos(PETAL_COUNT * (angle - rotation))) / 2;
    const radiusMeters =
      INNER_RADIUS_METERS +
      (OUTER_RADIUS_METERS - INNER_RADIUS_METERS) *
        Math.pow(petalWave, 0.72);

    const northMeters = Math.cos(angle) * radiusMeters;
    const eastMeters = Math.sin(angle) * radiusMeters;

    return {
      latitude:
        center.latitude +
        northMeters / METERS_PER_LATITUDE_DEGREE,
      longitude:
        center.longitude +
        eastMeters / metersPerLongitudeDegree,
    };
  });
}
