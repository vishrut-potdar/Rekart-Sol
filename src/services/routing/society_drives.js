import { db } from '../../db/connection.js';
import { NAGPUR_GEO_ANCHOR } from '../../config/constants.js';

export class SocietyDrivesService {
  static async getUpcomingDrives({
    latitude = NAGPUR_GEO_ANCHOR.latitude,
    longitude = NAGPUR_GEO_ANCHOR.longitude,
    radiusMeters = 15000
  }) {
    const drives = await db.listSocietyDrives(latitude, longitude, radiusMeters);
    return {
      user_location: { latitude, longitude },
      radius_km: radiusMeters / 1000,
      active_drives: drives
    };
  }

  static async registerSocietyDrive(driveData) {
    const drive = await db.addSocietyDrive(driveData);
    return drive;
  }
}
