export class DataWipeChecklistService {
  static getChecklist({ platform = 'android' }) {
    const isApple = platform.toLowerCase().includes('ios') || platform.toLowerCase().includes('apple') || platform.toLowerCase().includes('iphone');

    if (isApple) {
      return {
        platform: 'iOS (Apple iPhone / iPad)',
        steps: [
          {
            step_number: 1,
            title: 'Full iCloud or Computer Backup',
            instructions: 'Go to Settings > [Your Name] > iCloud > iCloud Backup > "Back Up Now", or plug into Mac/PC and make an encrypted backup.',
            critical: true
          },
          {
            step_number: 2,
            title: 'Turn Off "Find My" & Sign Out of Apple ID',
            instructions: 'Go to Settings > [Your Name] > Sign Out. Enter your Apple ID password when prompted to disable Activation Lock. Failure to do this prevents future buyers from using the phone.',
            critical: true
          },
          {
            step_number: 3,
            title: 'Unpair Apple Watch & Bluetooth Accessories',
            instructions: 'Open the Watch app > All Watches > Unpair Apple Watch to back up your watch data and release pairing.',
            critical: false
          },
          {
            step_number: 4,
            title: 'Erase All Content and Settings',
            instructions: 'Settings > General > Transfer or Reset iPhone > Erase All Content and Settings. Enter your device passcode to confirm.',
            critical: true
          },
          {
            step_number: 5,
            title: 'Eject Physical SIM Tray',
            instructions: 'Use a SIM ejector tool to remove your physical nano-SIM card. If using eSIM, select "Erase All and Delete eSIMs" during step 4.',
            critical: true
          }
        ]
      };
    }

    // Default Android Checklist
    return {
      platform: 'Android (Samsung, Xiaomi, OnePlus, Realme, Vivo)',
      steps: [
        {
          step_number: 1,
          title: 'Backup WhatsApp Chats & Media',
          instructions: 'Open WhatsApp > Settings > Chats > Chat backup > Back up to Google Drive. Ensure "Include videos" is checked if you want video history.',
          critical: true
        },
        {
          step_number: 2,
          title: 'Google Cloud Sync for Contacts & Photos',
          instructions: 'Go to Settings > Google > Backup > Back up now. Open Google Photos to ensure camera roll sync status shows "Backup complete".',
          critical: true
        },
        {
          step_number: 3,
          title: 'Remove Google Account & OEM Accounts (Prevents FRP Lock)',
          instructions: 'Settings > Passwords & Accounts > tap your Google Account > "Remove account". Repeat for Samsung Account or Mi Account. (Removing accounts before reset prevents Factory Reset Protection FRP lock).',
          critical: true
        },
        {
          step_number: 4,
          title: 'Eject Physical SIM & Micro-SD Cards',
          instructions: 'Remove all SIM cards and external memory cards containing private photos or documents.',
          critical: true
        },
        {
          step_number: 5,
          title: 'Perform Factory Data Reset',
          instructions: 'Settings > System / General Management > Reset options > Erase all data (Factory reset). The phone will reboot to the initial "Welcome" setup screen.',
          critical: true
        }
      ]
    };
  }
}
