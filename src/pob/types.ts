export interface RawItemSlot {
  id: string;
  /** 清理后的物品文本（已去除 <ModRange/> 等 XML 标签） */
  rawText: string;
  attrs: Record<string, string>;
}

export interface ParsedGem {
  /** Metadata 路径，如 Metadata/Items/Gems/SkillGemPurity */
  gemId: string;
  /** 显示名（来自 nameSpec 属性） */
  name?: string;
  skillId?: string;
  level: number;
  quality: number;
  qualityId?: string;
  enabled: boolean;
}

export interface RawSkill {
  slot?: string;
  label?: string;
  mainActiveSkill: boolean;
  gems: ParsedGem[];
}

export interface RawJewel {
  /** 天赋树节点 id */
  nodeId: string;
  rawText: string;
}

export interface TreeSocket {
  nodeId: string;
  itemId: string;
}

export interface TreeSpec {
  /** 已点天赋节点 id 列表 */
  nodes: string[];
  /** 老格式无 nodes 属性时，节点列表仅为插槽节点（不完整） */
  nodesComplete: boolean;
  url?: string;
  /** 天赋树珠宝插槽 → 物品 id 映射（<Sockets><Socket nodeId itemId/></Sockets>） */
  sockets: TreeSocket[];
  attrs: Record<string, string>;
}

export interface BuildInfo {
  level?: number;
  className?: string;
  ascendClassName?: string;
  targetVersion?: string;
  bandit?: string;
  pantheonMajorGod?: string;
  pantheonMinorGod?: string;
  mainSocketGroup?: string;
  viewMode?: string;
  [key: string]: string | number | boolean | undefined;
}

/** 从 POB XML 解析出的原始构建数据 */
export interface RawBuild {
  xml: string;
  info: BuildInfo;
  items: RawItemSlot[];
  jewels: RawJewel[];
  skills: RawSkill[];
  tree?: TreeSpec;
}