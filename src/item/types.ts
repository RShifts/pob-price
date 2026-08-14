export type Rarity =
  | "Normal"
  | "Magic"
  | "Rare"
  | "Unique"
  | "Gem"
  | "Currency"
  | "Divination Card"
  | "Relic"
  | "Unknown";

export interface ParsedItem {
  rawText: string;
  itemClass?: string;
  rarity: Rarity;
  /** 唯一装/魔法装显示名；稀有与普通装无名字段 */
  name?: string;
  baseType?: string;
  itemLevel?: number;
  levelReq?: number;
  quality?: number;
  sockets?: string;
  socketCount?: number;
  /** 最大相连组孔数（6 连 = 6）；POB 用空格分隔不相连的组 */
  linkCount?: number;
  uniqueId?: string;
  corrupted: boolean;
  mirrored: boolean;
  unidentified: boolean;
  fractured: boolean;
  synthesised: boolean;
  influence?: string;
  /** POB 导出的 "Implicits: N" 计数（用于区分前后缀） */
  implicitsCount?: number;
  implicitMods: string[];
  explicitMods: string[];
  craftMods: string[];
  fracturedMods: string[];
  synthesizedMods: string[];
  enchantMods: string[];
  /** 无法归类的行（如属性需求、词缀文本等） */
  otherMods: string[];
}

/** 展示名：name ?? baseType ?? "(未命名物品)" */
export function displayName(item: Pick<ParsedItem, "name" | "baseType">): string {
  return item.name ?? item.baseType ?? "(未命名物品)";
}
