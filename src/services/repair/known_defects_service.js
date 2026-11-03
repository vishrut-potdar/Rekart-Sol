export class KnownDefectsService {
  static defectDatabase = [
    {
      brand: 'OnePlus',
      models: ['OnePlus 8', 'OnePlus 8 Pro', 'OnePlus 9', 'OnePlus 9 Pro', 'OnePlus 11R'],
      symptom_trigger: 'green line display vertical ota update',
      defect_name: 'AMOLED Ribbon Heat Delamination (Green Line Issue)',
      description: 'Vertical green or pink line appearing across the display following an OTA software update or device heating.',
      free_replacement_program_active: true,
      manufacturer_policy_details: 'OnePlus India provides lifetime free screen replacement or upgrade vouchers for eligible devices with no physical/water damage.',
      consumer_rights_action: 'Do not pay independent repair shops. Visit an authorized OnePlus Service Center (e.g. Sitabuldi/Dharampeth Nagpur) for free screen replacement under the official extended policy.'
    },
    {
      brand: 'Samsung',
      models: ['Galaxy S20', 'Galaxy S20+', 'Galaxy S21', 'Galaxy S21 Ultra', 'Galaxy Note 20'],
      symptom_trigger: 'green line white screen vertical line display',
      defect_name: 'Super AMOLED Display Connector Degradation',
      description: 'Single or multiple permanent green/white lines appearing spontaneously without drops or glass cracks.',
      free_replacement_program_active: true,
      manufacturer_policy_details: 'Samsung India offers one-time free screen replacement within designated policy windows (even out of warranty) if device has no physical dents or liquid ingress.',
      consumer_rights_action: 'Take device to an authorized Samsung Smart Care Plaza for physical inspection. Mention the official one-time FOC (Free of Cost) screen replacement bulletin.'
    },
    {
      brand: 'Xiaomi',
      models: ['POCO X3', 'POCO X3 Pro'],
      symptom_trigger: 'dead phone bootloop camera not working sound dead',
      defect_name: 'PMIC / CPU Underfill Micro-Fracture',
      description: 'Device abruptly freezes, loses sound/camera, and enters permanent bootloop or dead state due to thermal cycling.',
      free_replacement_program_active: true,
      manufacturer_policy_details: 'POCO India officially extended warranty by 6 months for POCO X3 Pro motherboard failures.',
      consumer_rights_action: 'Contact Xiaomi/POCO India support with your original invoice. If rejected, cite National Consumer Helpline Rule on latent manufacturing defects.'
    },
    {
      brand: 'Apple',
      models: ['iPhone 12', 'iPhone 12 Pro'],
      symptom_trigger: 'no sound receiver earpiece call speaker muted',
      defect_name: 'Earpiece Receiver Module Failure',
      description: 'No sound from receiver speaker during telephone calls.',
      free_replacement_program_active: true,
      manufacturer_policy_details: 'Apple Service Program for iPhone 12 and iPhone 12 Pro for "No Sound" issues (within 3 years of first retail sale).',
      consumer_rights_action: 'Eligible for 100% free repair at Apple Authorized Service Providers (Imagine / Unicorn Stores Nagpur).'
    }
  ];

  static checkDefectsAndWarranty({ brand = '', modelName = '', symptoms = '' }) {
    const brandLower = brand.toLowerCase();
    const modelLower = modelName.toLowerCase();
    const symptomsLower = symptoms.toLowerCase();

    const matchedDefects = this.defectDatabase.filter(d => {
      const brandMatch = d.brand.toLowerCase() === brandLower || modelLower.includes(d.brand.toLowerCase());
      const modelMatch = d.models.some(m => modelLower.includes(m.toLowerCase()));
      const symptomMatch = d.symptom_trigger.split(' ').some(token => symptomsLower.includes(token));
      return (brandMatch && modelMatch) || (modelMatch && symptomMatch);
    });

    if (matchedDefects.length > 0) {
      const defect = matchedDefects[0];
      return {
        has_known_defect: true,
        defect_name: defect.defect_name,
        description: defect.description,
        is_free_replacement_program_active: defect.free_replacement_program_active,
        manufacturer_policy_details: defect.manufacturer_policy_details,
        consumer_rights_action: defect.consumer_rights_action,
        consumer_protection_act_note: 'Under Section 84 of the Indian Consumer Protection Act 2019, manufacturers are liable for latent manufacturing defects even if the standard 1-year warranty has lapsed.'
      };
    }

    return {
      has_known_defect: false,
      message: 'No active manufacturer recall or widespread class defect identified for this specific model.',
      standard_warranty_guidance: 'If device is within 1 year of original purchase invoice, seek warranty repair through brand authorized center before attempting third-party repair.'
    };
  }
}
