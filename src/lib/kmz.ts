import { File } from 'expo-file-system';
import { XMLParser } from 'fast-xml-parser';
import JSZip, { type JSZipObject } from 'jszip';

import type {
  Coordinates,
  MapArea,
  ParsedMap,
  Poi,
} from '../types/map';

type UnknownRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

export async function readMapFile(
  uri: string,
  fileName: string,
): Promise<ParsedMap> {
  const normalizedName = fileName.toLowerCase();
  const file = new File(uri);

  let kmlTexts: string[] = [];

  if (
    normalizedName.endsWith('.kmz') ||
    normalizedName.endsWith('.zip')
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const kmlEntries = (
      Object.values(zip.files) as JSZipObject[]
    )
      .filter(
        (entry) =>
          !entry.dir &&
          entry.name.toLowerCase().endsWith('.kml'),
      )
      .sort((a, b) => {
        const aIsDoc = a.name.toLowerCase().endsWith('doc.kml');
        const bIsDoc = b.name.toLowerCase().endsWith('doc.kml');

        if (aIsDoc === bIsDoc) {
          return a.name.localeCompare(b.name);
        }

        return aIsDoc ? -1 : 1;
      });

    if (kmlEntries.length === 0) {
      throw new Error(
        'KMZの中にKMLファイルが見つかりませんでした。',
      );
    }

    kmlTexts = await Promise.all(
      kmlEntries.map((entry) => entry.async('text')),
    );
  } else if (normalizedName.endsWith('.kml')) {
    kmlTexts = [await file.text()];
  } else {
    throw new Error(
      '読み込めるファイルはKMZまたはKMLです。',
    );
  }

  const parsedMaps = kmlTexts.map(parseKmlText);

  const pois = deduplicatePois(
    parsedMaps.flatMap((map) => map.pois),
  );

  const areas = deduplicateAreas(
    parsedMaps.flatMap((map) => map.areas),
  );

  if (pois.length === 0) {
    throw new Error(
      '攻略対象にできるポイポイ座標が見つかりませんでした。',
    );
  }

  return {
    sourceName: stripExtension(fileName),
    pois,
    areas,
  };
}

function parseKmlText(kmlText: string) {
  const parsed = parser.parse(kmlText) as UnknownRecord;
  const root = isRecord(parsed.kml)
    ? parsed.kml
    : parsed;

  const pois: Poi[] = [];
  const areas: MapArea[] = [];

  walkContainer(root, [], pois, areas);

  return { pois, areas };
}

function walkContainer(
  container: UnknownRecord,
  parentLayers: string[],
  pois: Poi[],
  areas: MapArea[],
) {
  for (const document of asRecords(container.Document)) {
    walkContainer(document, parentLayers, pois, areas);
  }

  for (const folder of asRecords(container.Folder)) {
    const folderName = readText(folder.name);
    const nextLayers = folderName
      ? [...parentLayers, folderName]
      : parentLayers;

    walkContainer(folder, nextLayers, pois, areas);
  }

  for (const placemark of asRecords(container.Placemark)) {
    parsePlacemark(
      placemark,
      parentLayers.join(' / '),
      pois,
      areas,
    );
  }
}

function parsePlacemark(
  placemark: UnknownRecord,
  layer: string,
  pois: Poi[],
  areas: MapArea[],
) {
  const name = getBestPlacemarkName(placemark);
  const description = readText(placemark.description);
  const searchableText = `${name} ${description} ${layer}`;

  if (isDummyPlacemark(searchableText)) {
    return;
  }

  const pointCoordinates = findPointCoordinates(placemark);

  if (
    pointCoordinates &&
    !isCircleOnlyLayer(searchableText)
  ) {
    pois.push({
      id: createStableId(
        'poi',
        `${pointCoordinates.latitude.toFixed(7)},${pointCoordinates.longitude.toFixed(7)}`,
      ),
      name: name || '名称未設定のポイポイ',
      description,
      layer,
      ...pointCoordinates,
    });
  }

  const polygons = findPolygonCoordinates(placemark);

  polygons.forEach((coordinates, index) => {
    if (coordinates.length < 3) {
      return;
    }

    areas.push({
      id: createStableId(
        'area',
        `${name}|${layer}|${index}|${coordinates[0].latitude.toFixed(7)},${coordinates[0].longitude.toFixed(7)}`,
      ),
      name: name || 'エリア',
      layer,
      coordinates,
    });
  });
}

function findPointCoordinates(
  node: unknown,
): Coordinates | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const result = findPointCoordinates(item);
      if (result) {
        return result;
      }
    }

    return null;
  }

  if (!isRecord(node)) {
    return null;
  }

  for (const point of asRecords(node.Point)) {
    const coordinate = parseFirstCoordinate(
      point.coordinates,
    );

    if (coordinate) {
      return coordinate;
    }
  }

  for (const value of Object.values(node)) {
    const result = findPointCoordinates(value);
    if (result) {
      return result;
    }
  }

  return null;
}

function findPolygonCoordinates(node: unknown) {
  const polygons: Coordinates[][] = [];

  collectPolygonCoordinates(node, polygons);

  return polygons;
}

function collectPolygonCoordinates(
  node: unknown,
  polygons: Coordinates[][],
) {
  if (Array.isArray(node)) {
    node.forEach((item) =>
      collectPolygonCoordinates(item, polygons),
    );
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  for (const polygon of asRecords(node.Polygon)) {
    const coordinateValues: unknown[] = [];
    collectValuesByKey(
      polygon,
      'coordinates',
      coordinateValues,
    );

    for (const value of coordinateValues) {
      const parsedCoordinates = parseCoordinateList(value);

      if (parsedCoordinates.length >= 3) {
        polygons.push(parsedCoordinates);
        break;
      }
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'Polygon') {
      continue;
    }

    collectPolygonCoordinates(value, polygons);
  }
}

function collectValuesByKey(
  node: unknown,
  targetKey: string,
  results: unknown[],
) {
  if (Array.isArray(node)) {
    node.forEach((item) =>
      collectValuesByKey(item, targetKey, results),
    );
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === targetKey) {
      results.push(value);
    } else {
      collectValuesByKey(value, targetKey, results);
    }
  }
}

function getBestPlacemarkName(placemark: UnknownRecord) {
  const extendedDataNames = new Set([
    '名前',
    'name',
    'Name',
    'title',
    'Title',
  ]);

  const values: string[] = [];
  collectExtendedDataValues(
    placemark.ExtendedData,
    extendedDataNames,
    values,
  );

  return values[0] || readText(placemark.name);
}

function collectExtendedDataValues(
  node: unknown,
  acceptedNames: ReadonlySet<string>,
  results: string[],
) {
  if (Array.isArray(node)) {
    node.forEach((item) =>
      collectExtendedDataValues(
        item,
        acceptedNames,
        results,
      ),
    );
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  const fieldName = readText(node['@_name']);

  if (fieldName && acceptedNames.has(fieldName)) {
    const value = readText(
      node.value ?? node.SimpleData ?? node['#text'],
    );

    if (value) {
      results.push(value);
    }
  }

  for (const value of Object.values(node)) {
    collectExtendedDataValues(
      value,
      acceptedNames,
      results,
    );
  }
}

function parseFirstCoordinate(
  value: unknown,
): Coordinates | null {
  return parseCoordinateList(value)[0] ?? null;
}

function parseCoordinateList(value: unknown) {
  const text = readText(value);

  if (!text) {
    return [];
  }

  return text
    .split(/\s+/)
    .map((token) => token.split(','))
    .map(([longitudeText, latitudeText]) => ({
      latitude: Number(latitudeText),
      longitude: Number(longitudeText),
    }))
    .filter(
      (coordinate) =>
        Number.isFinite(coordinate.latitude) &&
        Number.isFinite(coordinate.longitude) &&
        Math.abs(coordinate.latitude) <= 90 &&
        Math.abs(coordinate.longitude) <= 180,
    );
}

function readText(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = readText(item);
      if (text) {
        return text;
      }
    }

    return '';
  }

  if (isRecord(value)) {
    return readText(value['#text']);
  }

  return '';
}

function asRecords(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  return isRecord(value) ? [value] : [];
}

function isRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isDummyPlacemark(text: string) {
  return (
    text.includes('ダミー') ||
    text.includes('レイヤー保持用') ||
    text.includes('ここに追加')
  );
}

function isCircleOnlyLayer(text: string) {
  return (
    text.includes('30m円') ||
    text.includes('40m円') ||
    text.includes('円（') ||
    text.includes('円だけ')
  );
}

function deduplicatePois(pois: Poi[]) {
  const seen = new Set<string>();

  return pois.filter((poi) => {
    const key = `${poi.latitude.toFixed(7)},${poi.longitude.toFixed(7)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function deduplicateAreas(areas: MapArea[]) {
  const seen = new Set<string>();

  return areas.filter((area) => {
    const first = area.coordinates[0];
    const key = `${area.name}|${first.latitude.toFixed(7)},${first.longitude.toFixed(7)}|${area.coordinates.length}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createStableId(prefix: string, value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.(kmz|kml|zip)$/i, '');
}
