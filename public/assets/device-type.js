const laptopModel = /\b(?:galaxy[\s-]*book|samsung[\s-]+book|book[\s-]*[2-9]\b|mac[\s-]*book|think[\s-]*pad|idea[\s-]*pad|chromebook|inspiron|vivobook|zenbook|laptop|notebook)\b/i;
const tabletModel = /\b(?:galaxy[\s-]*tab|ipad|pixel[\s-]*tablet|oneplus[\s-]*pad|redmi[\s-]*pad|tablet)\b/i;
const phoneModel = /\b(?:iphone|smartphone|cellphone|nokia|phone|pixel\s*\d+[a-z]?|galaxy\s*[asmz]\s*\d+|galaxy\s*z\s*(?:fold|flip)|redmi\s+note|oneplus\s+\d+[a-z]?|nord|poco|reno\s*\d+|realme\s*\d+|(?:vivo\s+)?t2x|(?:motorola\s+)?edge\s+\d+)\b/i;

export function electronicsSubtype({ modelName = '', subCategory = '' } = {}) {
  const model = String(modelName || '');
  const subtype = String(subCategory || '').trim();
  if (laptopModel.test(model) || /\b(?:laptop|notebook|chromebook)\b/i.test(subtype)) return 'laptop';
  if (tabletModel.test(model) || /\b(?:tablet|ipad)\b/i.test(subtype)) return 'tablet';
  if (phoneModel.test(model) || /^(?:smart[\s-]*)?phone$|^(?:mobile(?: phone)?|cell phone)$/i.test(subtype)) return 'smartphone';
  return subtype || null;
}
