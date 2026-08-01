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

  if (normalizedName.endsWith('.csv')) {
    const csvText = await file.text();
    const pois = deduplicatePois(parseCsvText(csvText));

    if (pois.length === 0) {
      throw new Error(
        'CSVに有効なポイポイ座標が見つかりませんでした。',
      );
    }

    return {
      sourceName: stripExtension(fileName),
      pois,
      areas: [],
    };
  }

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
      '読み込めるファイルはKMZ、KML、CSVです。',
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


const LATITUDE_HEADER_ALIASES = new Set([
  'latitude',
  'lat',
  '緯度',
  'y',
]);

const LONGITUDE_HEADER_ALIASES = new Set([
  'longitude',
  'lng',
  'lon',
  'long',
  '経度',
  'x',
]);

const NAME_HEADER_ALIASES = new Set([
  'name',
  'title',
  '名称',
  '名前',
  'スポット名',
  '地点名',
  'ポイポイ名',
  'wayspotname',
  'waypointname',
]);

const DESCRIPTION_HEADER_ALIASES = new Set([
  'description',
  'desc',
  '説明',
  '詳細',
  'メモ',
  'note',
  'notes',
]);

const LAYER_HEADER_ALIASES = new Set([
  'layer',
  'folder',
  'group',
  'category',
  'type',
  'レイヤー',
  'フォルダ',
  'グループ',
  'カテゴリ',
  '種別',
]);

function parseCsvText(csvText: string): Poi[] {
  const normalizedText = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');

  if (!normalizedText.trim()) {
    throw new Error('CSVが空です。');
  }

  const delimiter = detectCsvDelimiter(normalizedText);
  const rows = parseDelimitedRows(normalizedText, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  if (rows.length === 0) {
    throw new Error('CSVにデータがありません。');
  }

  const headerInfo = findCsvColumns(rows[0]);
  const hasHeader =
    headerInfo.latitudeIndex !== -1 &&
    headerInfo.longitudeIndex !== -1;

  const inferredInfo = hasHeader
    ? headerInfo
    : inferCsvColumns(rows);

  if (
    inferredInfo.latitudeIndex === -1 ||
    inferredInfo.longitudeIndex === -1
  ) {
    throw new Error(
      'CSVの緯度・経度列を判別できませんでした。列名を「latitude / longitude」または「緯度 / 経度」にしてください。',
    );
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows.flatMap((row, rowIndex) => {
    const latitude = parseCsvCoordinate(
      row[inferredInfo.latitudeIndex],
    );
    const longitude = parseCsvCoordinate(
      row[inferredInfo.longitudeIndex],
    );

    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return [];
    }

    const name = readCsvCell(
      row,
      inferredInfo.nameIndex,
    );
    const description = readCsvCell(
      row,
      inferredInfo.descriptionIndex,
    );
    const layer = readCsvCell(
      row,
      inferredInfo.layerIndex,
    );

    return [
      {
        id: createStableId(
          'poi',
          `${latitude.toFixed(7)},${longitude.toFixed(7)}`,
        ),
        name: name || `ポイポイ ${rowIndex + 1}`,
        description,
        layer,
        latitude,
        longitude,
      },
    ];
  });
}

type CsvColumnInfo = {
  latitudeIndex: number;
  longitudeIndex: number;
  nameIndex: number;
  descriptionIndex: number;
  layerIndex: number;
};

function findCsvColumns(headerRow: string[]): CsvColumnInfo {
  const normalizedHeaders = headerRow.map(normalizeCsvHeader);

  return {
    latitudeIndex: findHeaderIndex(
      normalizedHeaders,
      LATITUDE_HEADER_ALIASES,
    ),
    longitudeIndex: findHeaderIndex(
      normalizedHeaders,
      LONGITUDE_HEADER_ALIASES,
    ),
    nameIndex: findHeaderIndex(
      normalizedHeaders,
      NAME_HEADER_ALIASES,
    ),
    descriptionIndex: findHeaderIndex(
      normalizedHeaders,
      DESCRIPTION_HEADER_ALIASES,
    ),
    layerIndex: findHeaderIndex(
      normalizedHeaders,
      LAYER_HEADER_ALIASES,
    ),
  };
}

function inferCsvColumns(rows: string[][]): CsvColumnInfo {
  const sampleRows = rows.slice(0, 20);
  const columnCount = Math.max(
    ...sampleRows.map((row) => row.length),
  );

  const valuesByColumn = Array.from(
    { length: columnCount },
    (_, columnIndex) =>
      sampleRows
        .map((row) => parseCsvCoordinate(row[columnIndex]))
        .filter((value): value is number => value !== null),
  );

  const numericColumnIndexes = valuesByColumn
    .map((values, index) => ({ values, index }))
    .filter(({ values }) => values.length > 0)
    .map(({ index }) => index);

  const obviousLongitudeIndex =
    numericColumnIndexes.find((index) =>
      valuesByColumn[index].some(
        (value) => Math.abs(value) > 90,
      ),
    ) ?? -1;

  const latitudeIndex =
    obviousLongitudeIndex !== -1
      ? selectBestCoordinateColumn(
          valuesByColumn,
          'latitude',
          new Set<number>([obviousLongitudeIndex]),
        )
      : numericColumnIndexes[0] ?? -1;

  const longitudeIndex =
    obviousLongitudeIndex !== -1
      ? obviousLongitudeIndex
      : numericColumnIndexes.find(
          (index) => index !== latitudeIndex,
        ) ?? -1;

  const excluded = new Set([
    latitudeIndex,
    longitudeIndex,
  ]);

  const nameIndex = Array.from(
    { length: columnCount },
    (_, index) => index,
  ).find(
    (index) =>
      !excluded.has(index) &&
      sampleRows.some((row) => {
        const value = row[index]?.trim();
        return Boolean(value) && parseCsvCoordinate(value) === null;
      }),
  ) ?? -1;

  return {
    latitudeIndex,
    longitudeIndex,
    nameIndex,
    descriptionIndex: -1,
    layerIndex: -1,
  };
}

function selectBestCoordinateColumn(
  valuesByColumn: number[][],
  kind: 'latitude' | 'longitude',
  excludedIndexes: ReadonlySet<number>,
) {
  let bestIndex = -1;
  let bestScore = -1;

  valuesByColumn.forEach((values, index) => {
    if (excludedIndexes.has(index) || values.length === 0) {
      return;
    }

    const validCount = values.filter((value) =>
      kind === 'latitude'
        ? Math.abs(value) <= 90
        : Math.abs(value) <= 180,
    ).length;

    const longitudeBonus =
      kind === 'longitude'
        ? values.filter((value) => Math.abs(value) > 90).length * 3
        : 0;

    const score = validCount + longitudeBonus;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function detectCsvDelimiter(text: string) {
  const sample = text.split('\n').slice(0, 8).join('\n');
  const candidates = [',', '\t', ';'];

  return candidates.reduce(
    (best, candidate) => {
      const count = countDelimiterOutsideQuotes(
        sample,
        candidate,
      );

      return count > best.count
        ? { delimiter: candidate, count }
        : best;
    },
    { delimiter: ',', count: -1 },
  ).delimiter;
}

function countDelimiterOutsideQuotes(
  text: string,
  delimiter: string,
) {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && character === delimiter) {
      count += 1;
    }
  }

  return count;
}

function parseDelimitedRows(
  text: string,
  delimiter: string,
) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const finishCell = () => {
    row.push(cell);
    cell = '';
  };

  const finishRow = () => {
    finishCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && character === delimiter) {
      finishCell();
    } else if (!inQuotes && character === '\n') {
      finishRow();
    } else {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    finishRow();
  }

  return rows;
}

function normalizeCsvHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()\[\]{}]/g, '');
}

function findHeaderIndex(
  normalizedHeaders: string[],
  aliases: ReadonlySet<string>,
) {
  return normalizedHeaders.findIndex((header) =>
    aliases.has(header),
  );
}

function parseCsvCoordinate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/[°度]/g, '');

  if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function readCsvCell(
  row: string[],
  index: number,
) {
  return index >= 0 ? row[index]?.trim() ?? '' : '';
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
  return fileName.replace(/\.(kmz|kml|csv|zip)$/i, '');
}
