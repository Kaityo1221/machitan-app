import type {
  Coordinates,
  Poi,
  TrackedCoordinates,
} from '../types/map';

const EARTH_RADIUS_METERS = 6371000;

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

function degreesToRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
