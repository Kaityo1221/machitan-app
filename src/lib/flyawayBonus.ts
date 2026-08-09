export type FlyawayBonusCategory =
  | 'prefecture'
  | 'small-country'
  | 'country'
  | 'jackpot';

export type FlyawayBonusPlace = {
  name: string;
  category: FlyawayBonusCategory;
  latitude: number;
  longitude: number;
  areaSquareKilometers: number;
  areaSource: string;
  areaAsOf: string;
};

export type FlyawayBonusResult = {
  place: FlyawayBonusPlace;
  comment: string;
};

const PREFECTURES: FlyawayBonusPlace[] = [
  {
    name: '佐賀県',
    category: 'prefecture',
    latitude: 33.2494,
    longitude: 130.2988,
    areaSquareKilometers: 2440.64,
    areaSource: '国土地理院',
    areaAsOf: '2026年4月1日時点',
  },
  {
    name: '福井県',
    category: 'prefecture',
    latitude: 36.0652,
    longitude: 136.2216,
    areaSquareKilometers: 4190.56,
    areaSource: '国土地理院',
    areaAsOf: '2026年4月1日時点',
  },
  {
    name: '鳥取県',
    category: 'prefecture',
    latitude: 35.5039,
    longitude: 134.2377,
    areaSquareKilometers: 3507,
    areaSource: '国土地理院',
    areaAsOf: '2026年4月1日時点',
  },
  {
    name: '徳島県',
    category: 'prefecture',
    latitude: 34.0658,
    longitude: 134.5593,
    areaSquareKilometers: 4146.96,
    areaSource: '国土地理院',
    areaAsOf: '2026年4月1日時点',
  },
  {
    name: '秋田県',
    category: 'prefecture',
    latitude: 39.7186,
    longitude: 140.1024,
    areaSquareKilometers: 11637.69,
    areaSource: '国土地理院',
    areaAsOf: '2026年4月1日時点',
  },
  {
    name: '山梨県',
    category: 'prefecture',
    latitude: 35.6642,
    longitude: 138.5684,
    areaSquareKilometers: 4465.27,
    areaSource: '国土地理院',
    areaAsOf: '2026年4月1日時点',
  },
];

const SMALL_COUNTRIES: FlyawayBonusPlace[] = [
  {
    name: 'サンマリノ',
    category: 'small-country',
    latitude: 43.9424,
    longitude: 12.4578,
    areaSquareKilometers: 61,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'リヒテンシュタイン',
    category: 'small-country',
    latitude: 47.166,
    longitude: 9.5554,
    areaSquareKilometers: 160,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'アンドラ',
    category: 'small-country',
    latitude: 42.5063,
    longitude: 1.5218,
    areaSquareKilometers: 468,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'ツバル',
    category: 'small-country',
    latitude: -7.1095,
    longitude: 177.6493,
    areaSquareKilometers: 26,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'ナウル',
    category: 'small-country',
    latitude: -0.5228,
    longitude: 166.9315,
    areaSquareKilometers: 21,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'パラオ',
    category: 'small-country',
    latitude: 7.515,
    longitude: 134.5825,
    areaSquareKilometers: 459,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
];

const COUNTRIES: FlyawayBonusPlace[] = [
  {
    name: 'アイスランド',
    category: 'country',
    latitude: 64.9631,
    longitude: -19.0208,
    areaSquareKilometers: 103000,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'ポルトガル',
    category: 'country',
    latitude: 39.3999,
    longitude: -8.2245,
    areaSquareKilometers: 91982,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'ニュージーランド',
    category: 'country',
    latitude: -40.9006,
    longitude: 174.886,
    areaSquareKilometers: 270534,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'モロッコ',
    category: 'country',
    latitude: 31.7917,
    longitude: -7.0926,
    areaSquareKilometers: 446550,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'フィンランド',
    category: 'country',
    latitude: 61.9241,
    longitude: 25.7482,
    areaSquareKilometers: 338145,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'チリ',
    category: 'country',
    latitude: -35.6751,
    longitude: -71.543,
    areaSquareKilometers: 756096,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
];

const JACKPOTS: FlyawayBonusPlace[] = [
  {
    name: 'アメリカ合衆国',
    category: 'jackpot',
    latitude: 39.8283,
    longitude: -98.5795,
    areaSquareKilometers: 9629091,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
  {
    name: 'カナダ',
    category: 'jackpot',
    latitude: 56.1304,
    longitude: -106.3468,
    areaSquareKilometers: 9970610,
    areaSource: '国連統計部',
    areaAsOf: '総面積データ',
  },
];

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickFrom<T>(items: T[], seed: number) {
  return items[seed % items.length];
}

export function getFlyawayBonus(eventSeed: string): FlyawayBonusResult {
  const normalizedSeed = eventSeed.trim().toUpperCase();

  // Web確認版と結果を揃え、葛西テストでは佐賀県を固定します。
  if (
    normalizedSeed === 'KASAI' ||
    normalizedSeed === 'KASAI-RINKAI-PROTOTYPE'
  ) {
    const place = PREFECTURES[0];
    return {
      place,
      comment: `あなたの想いに${place.name}の住民が賛同しました。`,
    };
  }

  const hash = hashString(normalizedSeed || 'MACHITAN');
  const categoryRoll = hash % 100;

  let places: FlyawayBonusPlace[];

  if (categoryRoll < 45) {
    places = PREFECTURES;
  } else if (categoryRoll < 73) {
    places = SMALL_COUNTRIES;
  } else if (categoryRoll < 98) {
    places = COUNTRIES;
  } else {
    places = JACKPOTS;
  }

  const place = pickFrom(places, hash >>> 8);

  return {
    place,
    comment: `あなたの想いに${place.name}の住民が賛同しました。`,
  };
}
