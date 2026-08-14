/** 官方市集数据接口的通用类型定义（POE1 国际服）。 */

export interface TradeLeague {
  id: string;
  realm: string;
  text: string;
}

export interface StatEntry {
  id: string; // 如 explicit.stat_1050105434
  text: string; // 如 +# to maximum Mana
  type: string; // explicit / implicit / craft / pseudo ...
}

export interface StatGroup {
  id: string; // explicit / implicit / craft / pseudo ...
  label: string;
  entries: StatEntry[];
}

export interface ItemTypeEntry {
  type: string; // 基底类型名，如 Two-Stone Ring
  name?: string;
  text?: string;
}

export interface ItemGroup {
  id: string; // 类别，如 accessory
  label: string;
  entries: ItemTypeEntry[];
}

export interface SearchResponse {
  id: string;
  total: number;
  result: string[];
  complexity?: number;
}

export interface ListingPrice {
  type: string; // ~price
  amount: number;
  currency: string; // chaos / divine ...
}

export interface ListingAccount {
  name: string;
  online?: { league?: string; status?: string } | boolean;
  lastCharacterName?: string;
  language?: string;
  realm?: string;
}

export interface Listing {
  id: string;
  listing: {
    method: string;
    indexed: string;
    stash?: { name?: string; x?: number; y?: number };
    price?: ListingPrice;
    account: ListingAccount;
    whisper: string;
  };
  item: {
    id: string;
    name: string;
    typeLine: string;
    baseType?: string;
    rarity?: string;
    ilvl?: number;
    identified?: boolean;
    frameType?: number;
    explicitMods?: string[];
    implicitMods?: string[];
    corrupted?: boolean;
    [key: string]: unknown;
  };
}
