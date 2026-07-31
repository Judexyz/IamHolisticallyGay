import DatabaseService from '../database.js';
import OsuApiService from '../osuApi.js';
import WidgetSyncService from '../syncService.js';

const {
  BOT_TOKEN,
  OSU_CLIENT_ID,
  OSU_CLIENT_SECRET,
  CLIENT_ID,
  CRON_SECRET
} = process.env;

const db = new DatabaseService();
const osuApi = new OsuApiService(OSU_CLIENT_ID, OSU_CLIENT_SECRET);
const syncService = new WidgetSyncService(CLIENT_ID, osuApi, BOT_TOKEN);

export default async function handler(req, res) {
  // Basic security check: if CRON_SECRET is set, ensure it matches the Authorization header.
  // (Vercel automatically sends the CRON_SECRET if configured properly in dashboard)
  if (CRON_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log(`[${new Date().toISOString()}] Starting background auto-refresh for all users...`);
  
  try {
    const users = await db.getAllUsers();
    console.log(`Found ${users.length} users to refresh.`);
    
    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        await syncService.syncUserDiscordWidget(user.discord_id, user.osu_user_id, user.mode);
        console.log(`Successfully auto-refreshed user ${user.discord_id}`);
        successCount++;
      } catch (e) {
        console.log(`Failed to auto-refresh user ${user.discord_id}: ${e.message}`);
        failCount++;
      }
    }

    console.log(`[${new Date().toISOString()}] Finished background auto-refresh cycle. Success: ${successCount}, Fail: ${failCount}`);
    return res.status(200).json({ success: true, refreshed: successCount, failed: failCount });
  } catch (error) {
    console.error('Cron job error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
