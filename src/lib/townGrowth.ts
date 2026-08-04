import type { Poi } from '../types/map';

export const DEFAULT_EFFECT_RADIUS_METERS = 30;
const DEFAULT_GRID_SIZE_METERS = 2;
const METERS_PER_LATITUDE_DEGREE = 111320;

/**
 * 発見済みポイポイの効果円をメッシュへ投影し、
 * 重なった領域を一度だけ数えた面積を返します。
 */
export function calculateUniqueEffectAreaSquareMeters(
  pois: Poi[],
  discoveredPoiIds: ReadonlySet<string>,
  effectRadiusMeters = DEFAULT_EFFECT_RADIUS_METERS,
  gridSizeMeters = DEFAULT_GRID_SIZE_METERS,
) {
  const discoveredPois = pois.filter((poi) =>
    discoveredPoiIds.has(poi.id),
  );

  if (discoveredPois.length === 0) {
    return 0;
  }

  const referenceLatitudeRadians =
    (discoveredPois[0].latitude * Math.PI) / 180;
  const metersPerLongitudeDegree =
    METERS_PER_LATITUDE_DEGREE *
    Math.cos(referenceLatitudeRadians);

  const originLatitude = discoveredPois[0].latitude;
  const originLongitude = discoveredPois[0].longitude;
  const occupiedCells = new Set<string>();
  const radiusInCells = Math.ceil(
    effectRadiusMeters / gridSizeMeters,
  );

  for (const poi of discoveredPois) {
    const centerX =
      (poi.longitude - originLongitude) *
      metersPerLongitudeDegree;
    const centerY =
      (poi.latitude - originLatitude) *
      METERS_PER_LATITUDE_DEGREE;

    const centerCellX = Math.round(
      centerX / gridSizeMeters,
    );
    const centerCellY = Math.round(
      centerY / gridSizeMeters,
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
        const cellX = centerCellX + offsetX;
        const cellY = centerCellY + offsetY;
        const cellCenterX = cellX * gridSizeMeters;
        const cellCenterY = cellY * gridSizeMeters;

        const distanceFromPoi = Math.hypot(
          cellCenterX - centerX,
          cellCenterY - centerY,
        );

        if (distanceFromPoi <= effectRadiusMeters) {
          occupiedCells.add(`${cellX}:${cellY}`);
        }
      }
    }
  }

  return (
    occupiedCells.size *
    gridSizeMeters *
    gridSizeMeters
  );
}

export function formatAreaSquareMeters(
  areaSquareMeters: number,
) {
  if (areaSquareMeters >= 1000) {
    return `${(areaSquareMeters / 10000).toFixed(2)} ha`;
  }

  return `${Math.round(areaSquareMeters)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')} m²`;
}
