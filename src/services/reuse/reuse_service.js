import { v4 as uuidv4 } from 'uuid';

export class ReuseService {
  /**
   * Item-Matched Repurposing Suggestions & Curated Idea Library
   */
  static getRepurposingIdeas({ category = 'electronics', subType = 'smartphone', condition = 'working_slow' }) {
    const lowerCategory = category.toLowerCase();
    const lowerType = subType.toLowerCase();

    // "headphones" contains "phone"; only real phones get the phone ideas
    if (lowerCategory === 'electronics' && lowerType.includes('phone') && !lowerType.includes('headphone')) {
      return {
        item: 'Old Smartphone',
        repurposing_cards: [
          {
            title: 'Convert into Home Security CCTV / Baby Monitor',
            difficulty: 'Beginner (10 mins)',
            tools_needed: ['Phone charger', 'Wi-Fi connection', 'Free app (AlfredCamera or Haven)'],
            estimated_savings_inr: 2500,
            instructions: 'Install an open-source or free camera stream app like Haven or Alfred. Plug into a wall socket facing your front door or balcony. Get real-time motion alerts on your primary phone without buying a dedicated CCTV.'
          },
          {
            title: 'Dedicated Car Dashcam / Navigation HUD',
            difficulty: 'Easy (15 mins)',
            tools_needed: ['Windshield suction mount', 'Car 12V USB charger', 'Dashcam App (Droid Dashcam)'],
            estimated_savings_inr: 3500,
            instructions: 'Mount the phone to your dashboard or windshield. Use looping video recording apps that automatically overwrite old footage and auto-start when the car ignition supplies power.'
          },
          {
            title: 'Distraction-Free Audio / Spotify & White Noise Station',
            difficulty: 'Very Easy (5 mins)',
            tools_needed: ['Bluetooth speaker or 3.5mm aux', 'Charging dock'],
            estimated_savings_inr: 1200,
            instructions: 'Wipe all social media apps. Leave only music, audiobooks, and meditation apps. Place near bed or work desk as a dedicated distraction-free media player.'
          },
          {
            title: 'Always-On Desktop Clock & Live Weather Hub',
            difficulty: 'Very Easy (5 mins)',
            tools_needed: ['Cheap phone stand', 'Clock screensaver app'],
            estimated_savings_inr: 800,
            instructions: 'Set display to "Never sleep while charging" in developer options. Run a retro flip clock or weather dashboard widget.'
          }
        ]
      };
    }

    if (lowerCategory === 'electronics' && (lowerType.includes('tablet') || lowerType.includes('ipad'))) {
      return {
        item: 'Old Tablet',
        repurposing_cards: [
          {
            title: 'Kitchen Hands-Free Recipe & YouTube Screen',
            difficulty: 'Easy',
            tools_needed: ['Magnetic fridge mount or stand'],
            estimated_savings_inr: 4000,
            instructions: 'Keep mounted in the kitchen dedicated to recipe videos, timers, and grocery lists.'
          },
          {
            title: 'Smart Home Automation Wall Dashboard',
            difficulty: 'Intermediate',
            tools_needed: ['Wall mount bracket', 'Home Assistant or Google Home app'],
            estimated_savings_inr: 6000,
            instructions: 'Mount on living room wall as a master touch controller for lights, fans, and doorbells.'
          }
        ]
      };
    }

    if (lowerCategory === 'apparel') {
      return {
        item: 'Worn Denim & Heavy Textiles',
        repurposing_cards: [
          {
            title: 'Upcycled Denim Heavy-Duty Tote Bag',
            difficulty: 'Intermediate (Sewing)',
            tools_needed: ['Scissors', 'Sewing needle / machine', 'Old jeans legs'],
            estimated_savings_inr: 450,
            instructions: 'Cut pant legs into rectangular panels, stitch reinforced handles from waistbands. Collaborating tailors in Sitabuldi / Mahal Nagpur can stitch this for ₹80-120.'
          },
          {
            title: 'Cushion Filling & Acoustic Insulation',
            difficulty: 'Beginner',
            tools_needed: ['Fabric shears'],
            estimated_savings_inr: 300,
            instructions: 'Shred unwearable cotton and wool into batting to refill sagging sofa cushions or floor seaters.'
          }
        ]
      };
    }

    return {
      item: 'Household Item',
      repurposing_cards: [
        {
          title: 'Community Garden Planter / Storage Bin',
          difficulty: 'Beginner',
          instructions: 'Clean surfaces, drill drainage holes, and use as herb planter or garage tool organizer.'
        }
      ]
    };
  }

  /**
   * Memory Vault: Keep emotional connection while decluttering physical item
   */
  static saveToMemoryVault({ userId, title, emotionalStory, photoUrls = [], reviewReminderMonths = 6 }) {
    const reminderDate = new Date();
    reminderDate.setMonth(reminderDate.getMonth() + reviewReminderMonths);

    const vaultEntry = {
      id: `vault_${uuidv4().substring(0, 8)}`,
      user_id: userId,
      title,
      emotional_story: emotionalStory,
      photo_urls: photoUrls,
      archived_at: new Date().toISOString(),
      review_reminder_date: reminderDate.toISOString(),
      status: 'cherished_memory',
      message: 'Your memories are permanently preserved. You can now let go of the physical item without losing its meaning.'
    };

    return vaultEntry;
  }

  /**
   * Festive Clean-Out Campaigns (e.g. Diwali Safai, New Year, Spring Declutter)
   */
  static getFestiveCleanOutWorkflow({ campaignName = 'Diwali Safai' }) {
    return {
      campaign_name: `${campaignName} Guided Circular Sweep`,
      purpose: 'Systematic room-by-room decluttering sorting household goods into the 5 exit outcomes: Keep, Pass-on, Donate, Sell, and Recycle.',
      stages: [
        {
          stage_number: 1,
          zone_name: 'The Junk Drawer & Wire Graveyard',
          target_items: ['Tangled charging cables', 'Old button phones', 'Dead power banks', 'Outdated remotes'],
          action_prompt: 'Test chargers. Working ones go to society swap; swollen or dead batteries go to CPCB e-waste dropbox.'
        },
        {
          stage_number: 2,
          zone_name: 'Wardrobe & Seasonal Woolens',
          target_items: ['Sweaters not worn in 2 seasons', 'Clean blankets', 'Outgrown children shoes'],
          action_prompt: 'Run Pile-Mode photo. Grade A/B apparel routed to Goonj Nagpur winter relief; frayed textiles sent to shredder.'
        },
        {
          stage_number: 3,
          zone_name: 'Kitchen & Metal Utensils',
          target_items: ['Extra brass/steel plates', 'Defective mixer grinders', 'Old water filters'],
          action_prompt: 'Working appliances evaluated for Fair Price repair; heavy brass/copper routed to Itwari scrap trade by weight.'
        },
        {
          stage_number: 4,
          zone_name: 'Study Desk & Books',
          target_items: ['Board exam guides', 'Novels', 'Notebooks'],
          action_prompt: 'Map to Rotary Nagpur school drive backlog.'
        }
      ]
    };
  }
}
