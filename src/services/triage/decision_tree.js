/**
 * Dynamic Decision-Tree Engine
 * Tailored sequence of 3-5 tap questions in English, Hindi, and Hinglish.
 * Also generates exception queries for pile mode when visual ambiguity exists.
 */
export class DecisionTreeEngine {
  static getQuestionTree(category, language = 'en') {
    const lang = ['en', 'hi', 'hinglish'].includes(language.toLowerCase())
      ? language.toLowerCase()
      : 'en';

    const trees = {
      electronics: {
        flow_id: 'electronics_core_v1',
        title: {
          en: 'Mobile & Electronics Quick Triage',
          hi: 'मोबाइल और इलेक्ट्रॉनिक्स त्वरित जाँच',
          hinglish: 'Mobile aur Electronics Quick Check'
        }[lang],
        steps: [
          {
            step_id: 'q1_power',
            question: {
              en: 'Does the device turn on and display a screen?',
              hi: 'क्या डिवाइस चालू होता है और स्क्रीन दिखती है?',
              hinglish: 'Kya device switch on hota hai aur display dikhta hai?'
            }[lang],
            options: [
              { id: 'power_ok', label: { en: 'Yes, works normally', hi: 'हाँ, ठीक से काम करता है', hinglish: 'Haan, normal chal raha hai' }[lang], score_impact: 10 },
              { id: 'power_flicker', label: { en: 'Turns on but screen flickers/cracked', hi: 'चालू होता है पर स्क्रीन टूट/कांप रही है', hinglish: 'On hota hai par display crack/flicker hai' }[lang], score_impact: 5 },
              { id: 'power_dead', label: { en: 'Completely dead / No response', hi: 'बिल्कुल चालू नहीं होता / डेड', hinglish: 'Dead hai / koi response nahi' }[lang], score_impact: 0 }
            ]
          },
          {
            step_id: 'q2_charging',
            question: {
              en: 'How does it behave when plugged into a charger?',
              hi: 'चार्जर लगाने पर क्या होता है?',
              hinglish: 'Charger lagane pe kya hota hai?'
            }[lang],
            options: [
              { id: 'charge_normal', label: { en: 'Charges smoothly', hi: 'आसानी से चार्ज होता है', hinglish: 'Smoothly charge hota hai' }[lang], score_impact: 10 },
              { id: 'charge_loose', label: { en: 'Only charges at certain cable angles', hi: 'तार हिलाने पर ही चार्ज होता है', hinglish: 'Cable hilane pe hi charge hota hai (Loose port)' }[lang], score_impact: 4 },
              { id: 'charge_heating', label: { en: 'Gets extremely hot / Won\'t charge', hi: 'बहुत गरम हो जाता है / चार्ज नहीं होता', hinglish: 'Bahut heat hota hai / charging nahi hoti' }[lang], score_impact: 1 }
            ]
          },
          {
            step_id: 'q3_battery_health',
            question: {
              en: 'How long does the battery last on full charge?',
              hi: 'फुल चार्ज होने पर बैटरी कितने समय चलती है?',
              hinglish: 'Full charge hone par battery kitni der chalti hai?'
            }[lang],
            options: [
              { id: 'bat_full_day', label: { en: 'Full day (8+ hours)', hi: 'पूरा दिन (8+ घंटे)', hinglish: 'Poora din (8+ ghante)' }[lang], score_impact: 10 },
              { id: 'bat_few_hours', label: { en: 'Drains in 2-3 hours', hi: '2-3 घंटे में खत्म', hinglish: '2-3 ghante mein drop ho jati hai' }[lang], score_impact: 4 },
              { id: 'bat_swollen', label: { en: 'Swollen / back cover popping off', hi: 'बैटरी फूल गई है / ढक्कन उठ गया है', hinglish: 'Battery phool gayi hai / back cover nikal raha hai' }[lang], score_impact: -10, safety_hazard: 'SWOLLEN_BATTERY' }
            ]
          },
          {
            step_id: 'q4_touch_and_audio',
            question: {
              en: 'Are the touch and speakers working?',
              hi: 'क्या टचस्क्रीन और स्पीकर काम कर रहे हैं?',
              hinglish: 'Kya touch aur speaker theek se chal rahe hain?'
            }[lang],
            options: [
              { id: 'touch_all_good', label: { en: 'Both touch & audio work fine', hi: 'दोनों सही काम करते हैं', hinglish: 'Dono mast chalte hain' }[lang], score_impact: 10 },
              { id: 'touch_ghost_clicks', label: { en: 'Touch is erratic or has dead zones', hi: 'टच में खराबी या रुक रहा है', hinglish: 'Touch freeze ya phantom clicks ho rahe hain' }[lang], score_impact: 4 },
              { id: 'audio_muffled', label: { en: 'Speakers crackle / mic not working', hi: 'आवाज़ फटती है / माइक खराब है', hinglish: 'Speaker phat raha hai / mic me issue hai' }[lang], score_impact: 5 }
            ]
          }
        ]
      },
      apparel: {
        flow_id: 'apparel_core_v1',
        title: {
          en: 'Garment & Fabric Usability Triage',
          hi: 'कपड़ों की उपयोगिता जाँच',
          hinglish: 'Kapdo ki Condition & Usability Check'
        }[lang],
        steps: [
          {
            step_id: 'q1_tears',
            question: {
              en: 'Are there any visible tears, holes, or unstitched seams?',
              hi: 'क्या कहीं फटा, छेद या सिलाई खुली हुई है?',
              hinglish: 'Kya kahi se phata, hole ya silai khuli hui hai?'
            }[lang],
            options: [
              { id: 'intact', label: { en: 'Completely intact', hi: 'बिल्कुल सही', hinglish: 'Ekdum intact hai' }[lang], score_impact: 10 },
              { id: 'minor_seam', label: { en: 'Minor stitch open (easily repairable)', hi: 'हल्की सिलाई खुली है (सुई-धागे से ठीक हो सकती है)', hinglish: 'Chhoti si silai khuli hai' }[lang], score_impact: 6 },
              { id: 'major_tear', label: { en: 'Large tears or worn out fabric', hi: 'बड़ा कट या घिसा हुआ कपड़ा', hinglish: 'Bada cut / kapda ghisa hua hai' }[lang], score_impact: 0 }
            ]
          },
          {
            step_id: 'q2_stains',
            question: {
              en: 'Are there any stubborn stains (oil, dye, rust)?',
              hi: 'क्या कोई जिद्दी दाग है (तेल, रंग, जंग)?',
              hinglish: 'Kya koi ziddi daag hai (oil, rang, rust)?'
            }[lang],
            options: [
              { id: 'no_stains', label: { en: 'No stains, fresh cloth', hi: 'कोई दाग नहीं, साफ कपड़ा', hinglish: 'Koi daag nahi, clean hai' }[lang], score_impact: 10 },
              { id: 'faded_only', label: { en: 'No stains, just color faded', hi: 'दाग नहीं है, केवल रंग हल्का पड़ा है', hinglish: 'Daag nahi bas color thoda fade hai' }[lang], score_impact: 7 },
              { id: 'permanent_stain', label: { en: 'Noticeable permanent stains', hi: 'साफ न होने वाले दाग', hinglish: 'Permanent visible stains hain' }[lang], score_impact: 2 }
            ]
          },
          {
            step_id: 'q3_closures',
            question: {
              en: 'Are all buttons, zippers, and elastics functioning?',
              hi: 'क्या सभी बटन, चेन और इलास्टिक सही हैं?',
              hinglish: 'Kya sabhi buttons, chain aur elastic theek kaam kar rahe hain?'
            }[lang],
            options: [
              { id: 'closures_ok', label: { en: 'All buttons and zippers work', hi: 'सब कुछ सही काम करता है', hinglish: 'Sab buttons aur zipper chal rahe hain' }[lang], score_impact: 10 },
              { id: 'missing_button', label: { en: 'One missing button only', hi: 'सिर्फ एक बटन गायब है', hinglish: 'Sirf ek button missing hai' }[lang], score_impact: 7 },
              { id: 'broken_zipper', label: { en: 'Broken zipper or lost elastic', hi: 'चेन टूटी है या इलास्टिक ढीला है', hinglish: 'Zipper toot gaya / elastic loose hai' }[lang], score_impact: 3 }
            ]
          }
        ]
      }
    };

    return trees[category] || trees.electronics;
  }

  /**
   * Generates dynamic exception queries when pile mode detects visual ambiguity
   */
  static generatePileExceptionQueries(itemMetadata, language = 'en') {
    const lang = ['en', 'hi', 'hinglish'].includes(language.toLowerCase()) ? language.toLowerCase() : 'en';
    const exceptions = [];

    if (itemMetadata.requires_exception_closeup) {
      exceptions.push({
        exception_id: 'exc_closeup_cuff',
        reason: itemMetadata.exception_reason,
        prompt: {
          en: 'Please upload a 5-second close-up photo of the sleeve cuff/collar to verify fabric density.',
          hi: 'कृपया आस्तीन या कॉलर की एक स्पष्ट क्लोज़-अप फोटो लें ताकि कपड़े की जांच हो सके।',
          hinglish: 'Kripya sleeve cuff ya collar ki ek clear close-up photo click karein.'
        }[lang],
        action_required: 'CAPTURE_MEDIA',
        target_zone: 'collar_or_cuff'
      });
    }

    return exceptions;
  }
}
