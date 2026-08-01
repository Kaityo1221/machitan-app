import type {
  Coordinates,
  MapArea,
  Poi,
  TrackedCoordinates,
} from '../types/map';

const EARTH_RADIUS_METERS = 6371000;
const DEFAULT_AREA_MATCH_DISTANCE_METERS = 150;
const MAX_DISCOVERY_AREA_RADIUS_METERS = 100;

export type AreaPoiAssociation = {
  area: MapArea;
  poiId: string;
};

export function calculateDistanceMeters(
  from: Coordinates,
  to: Coordinates,
) {
  const latitudeDifference = degreesToRadians(
    to.latitude - from.latitude,
  );

  const longitudeDifference = degreesToRadians(
    to.longitude - from.longitude,
  );

  const fromLatitude = degreesToRadians(
    from.latitude,
  );

  const toLatitude = degreesToRadians(to.latitude);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  const centralAngle =
    2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * centralAngle;
}

export function findNearbyUndiscoveredPois(
  current: TrackedCoordinates,
  pois: Poi[],
  discoveredPoiIds: ReadonlySet<string>,
  radiusMeters: number,
) {
  return pois.filter((poi) => {
    if (discoveredPoiIds.has(poi.id)) {
      return false;
    }

    return (
      calculateDistanceMeters(current, poi) <= radiusMeters
    );
  });
}

/**
 * KMZ/KML内のPolygonを、中心または内包関係が最も近いポイポイへ関連付けます。
 * 未発見時はPolygonを描かず、関連ポイポイを発見した時だけ塗りつぶすために使います。
 */
export function associateAreasWithPois(
  areas: MapArea[],
  pois: Poi[],
  maxDistanceMeters = DEFAULT_AREA_MATCH_DISTANCE_METERS,
): AreaPoiAssociation[] {
  if (areas.length === 0 || pois.length === 0) {
    return [];
  }

  return areas.flatMap((area) => {
    if (area.coordinates.length < 3) {
      return [];
    }

    const center = calculateAreaCenter(area.coordinates);
    const areaRadius = Math.max(
      ...area.coordinates.map((coordinate) =>
        calculateDistanceMeters(center, coordinate),
      ),
    );

    // 広域境界などは塗りつぶし対象にせず、
    // ポイポイ周辺の小さな円・Polygonだけを扱います。
    if (areaRadius > MAX_DISCOVERY_AREA_RADIUS_METERS) {
      return [];
    }

    const containedPois = pois.filter((poi) =>
      isPointInsidePolygon(poi, area.coordinates),
    );

    const candidates =
      containedPois.length > 0 ? containedPois : pois;

    let nearestPoi: Poi | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const poi of candidates) {
      const distance = calculateDistanceMeters(center, poi);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPoi = poi;
      }
    }

    if (
      !nearestPoi ||
      (containedPois.length === 0 &&
        nearestDistance > maxDistanceMeters)
    ) {
      return [];
    }

    return [
      {
        area,
        poiId: nearestPoi.id,
      },
    ];
  });
}

function calculateAreaCenter(
  coordinates: Coordinates[],
): Coordinates {
  const usableCoordinates =
    coordinates.length > 1 &&
    coordinates[0].latitude ===
      coordinates[coordinates.length - 1].latitude &&
    coordinates[0].longitude ===
      coordinates[coordinates.length - 1].longitude
      ? coordinates.slice(0, -1)
      : coordinates;

  const totals = usableCoordinates.reduce(
    (result, coordinate) => ({
      latitude: result.latitude + coordinate.latitude,
      longitude: result.longitude + coordinate.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: totals.latitude / usableCoordinates.length,
    longitude: totals.longitude / usableCoordinates.length,
  };
}

function isPointInsidePolygon(
  point: Coordinates,
  polygon: Coordinates[],
) {
  let isInside = false;

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];

    const crossesLatitude =
      current.latitude > point.latitude !==
      previous.latitude > point.latitude;

    if (!crossesLatitude) {
      continue;
    }

    const intersectionLongitude =
      ((previous.longitude - current.longitude) *
        (point.latitude - current.latitude)) /
        (previous.latitude - current.latitude) +
      current.longitude;

    if (point.longitude < intersectionLongitude) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function degreesToRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
