import type { Coordinates } from '../types/map';
import type { FlyawayBonusPlace } from './flyawayBonus';

const boundaryCache = new Map<string, Coordinates[][]>();

function toCoordinates(
  rawCoordinates: unknown,
): Coordinates[] {
  if (!Array.isArray(rawCoordinates)) {
    return [];
  }

  return rawCoordinates.flatMap((position) => {
    if (
      !Array.isArray(position) ||
      position.length < 2 ||
      typeof position[0] !== 'number' ||
      typeof position[1] !== 'number'
    ) {
      return [];
    }

    return [
      {
        latitude: position[1],
        longitude: position[0],
      },
    ];
  });
}

function extractBoundaryPolygons(geometry: unknown) {
  if (
    !geometry ||
    typeof geometry !== 'object' ||
    !('type' in geometry) ||
    !('coordinates' in geometry)
  ) {
    return [];
  }

  const typedGeometry = geometry as {
    type: string;
    coordinates: unknown;
  };

  if (
    typedGeometry.type === 'Polygon' &&
    Array.isArray(typedGeometry.coordinates)
  ) {
    const outerRing = typedGeometry.coordinates[0];
    const coordinates = toCoordinates(outerRing);
    return coordinates.length >= 3 ? [coordinates] : [];
  }

  if (
    typedGeometry.type === 'MultiPolygon' &&
    Array.isArray(typedGeometry.coordinates)
  ) {
    return typedGeometry.coordinates.flatMap((polygon) => {
      if (!Array.isArray(polygon)) {
        return [];
      }

      const outerRing = polygon[0];
      const coordinates = toCoordinates(outerRing);
      return coordinates.length >= 3 ? [coordinates] : [];
    });
  }

  return [];
}

export async function fetchFlyawayBoundary(
  place: FlyawayBonusPlace,
): Promise<Coordinates[][]> {
  const cached = boundaryCache.get(place.name);

  if (cached) {
    return cached;
  }

  const query =
    place.category === 'prefecture'
      ? `${place.name}, 日本`
      : place.name;

  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?q=${encodeURIComponent(query)}` +
    '&format=jsonv2' +
    '&polygon_geojson=1' +
    '&polygon_threshold=0.01' +
    '&limit=1' +
    '&accept-language=ja';

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'ja',
      'User-Agent': 'MACHITAN/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(
      `飛び地境界データを取得できませんでした (${response.status})`,
    );
  }

  const results = (await response.json()) as Array<{
    geojson?: unknown;
  }>;

  const polygons = extractBoundaryPolygons(
    results[0]?.geojson,
  );

  boundaryCache.set(place.name, polygons);
  return polygons;
}
