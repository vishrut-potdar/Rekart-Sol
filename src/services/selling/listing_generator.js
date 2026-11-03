export class ListingGeneratorService {
  static generateListing({
    brand = 'Apple',
    modelName = 'iPhone 13',
    storage = '128GB',
    color = 'Midnight Blue',
    conditionGrade = 'B',
    testedFunctions = ['Touch Screen', 'Face ID', 'Cameras', 'Speakers', 'Charging'],
    knownFlaws = ['Minor pocket scuffs on aluminum edge', 'Battery health 85%'],
    accessoriesIncluded = ['Original Box', 'USB-C to Lightning Cable'],
    suggestedPrice = 36000
  }) {
    const optimisticPrice = Math.round(suggestedPrice * 1.08);
    const quickSalePrice = Math.round(suggestedPrice * 0.92);

    const title = `${brand} ${modelName} (${storage}) - ${color} [Tested & 100% Functional]`;

    const description = `
# ${brand} ${modelName} (${storage}, ${color})

✅ **Condition**: Grade ${conditionGrade} (Well-maintained, clean device)
🔋 **Battery & Performance**: Tested operational, smooth performance
📦 **Included in Box**: ${accessoriesIncluded.join(', ')}

### 🛠️ Thoroughly Tested & Working:
${testedFunctions.map(f => `- [x] ${f}`).join('\n')}

### 🔍 Transparent Condition Notes:
${knownFlaws.length > 0 ? knownFlaws.map(flaw => `- ${flaw}`).join('\n') : '- No noticeable scratches or defects'}

---
📍 **Pickup Location**: In-person inspection and pickup available in Nagpur (Sitabuldi / Dharampeth).
⚡ **Payment**: Direct UPI or Cash upon physical inspection.
🚫 **Note**: Fixed fair price. Low-ballers and fake payment QR scammers will be blocked immediately.
    `.trim();

    const searchTags = [
      brand.toLowerCase(),
      modelName.toLowerCase().replace(/\s+/g, ''),
      `${modelName.toLowerCase()} nagpur`,
      'used phone nagpur',
      'genuine phone second hand'
    ];

    return {
      title,
      suggested_pricing: {
        listing_price_inr: optimisticPrice,
        fair_median_inr: suggestedPrice,
        quick_sale_price_inr: quickSalePrice
      },
      markdown_description: description,
      plain_text_copy: description.replace(/[#*`_]/g, ''),
      search_tags: searchTags
    };
  }
}
