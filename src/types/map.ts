export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type TrackedCoordinates = Coordinates & {
  accuracy: number | null;
};

export type Poi = Coordinates & {
  id: string;
  name: string;
  description: string;
  layer: string;
};

export type MapArea = {
  id: string;
  name: string;
  layer: string;
  coordinates: Coordinates[];
};

export type ParsedMap = {
  sourceName: string;
  pois: Poi[];
  areas: MapArea[];
};

export type StoredGameState = {
  version: 1;
  map: ParsedMap;
  discoveredPoiIds: string[];
};
