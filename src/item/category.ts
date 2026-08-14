import type { ParsedItem } from "./types.js";

// 基底类型关键字启发式（POE1），用于 POB 导出格式（无 Item Class 行）时的分类
const WEAPON_RE = /axe|sword|dagger|claw|mace|staff|wand|bow|sceptre|hammer|rapier|foil|talon|sickle|spear|trident|warhammer|maul|warstaff|sai|hook|harpoon|bayonet|jade hatchet|sharktooth/i;
const ARMOUR_RE = /garb|regalia|armou?r|plate|mail|jacket|coat|gown|robe|vest|mantle|cuirass|breastplate|boots|greaves|sabatons|gloves|gauntlets|mitts|helmet|hood|mask|circlet|crown|cap|hat|wreath|shield|ward|buckler|tower|aegis/i;
const ACCESSORY_RE = /ring|amulet|belt|quiver|talisman/i;

/** 物品分类（用于批量报告聚合）。 */
export function categorizeItem(p: ParsedItem): string {
  const rar = p.rarity;
  if (rar === "Gem") return "宝石";
  if (rar === "Currency") return "通货";
  if (rar === "Divination Card") return "命运卡";
  if (rar === "Relic") return "遗物";
  const base = (p.baseType ?? "").toLowerCase();
  if (base.includes("flask")) return "药剂";
  if (base.includes("jewel")) return "珠宝";
  if (base.includes("map")) return "地图";
  if (base.includes("cluster")) return "珠宝"; // cluster jewel 无 jewel 字样但属于珠宝
  const c = p.itemClass ?? "";
  if (/weapon/i.test(c)) return "武器";
  if (/armour|body|helmet|gloves|boots|shield/i.test(c)) return "防具";
  if (/ring|amulet|belt|quiver/i.test(c)) return "饰品";
  if (WEAPON_RE.test(base)) return "武器";
  if (ARMOUR_RE.test(base)) return "防具";
  if (ACCESSORY_RE.test(base)) return "饰品";
  return "装备";
}
