import { kv } from '@vercel/kv';

export default class DatabaseService {
  /**
   * Adds or updates an osu! user mapping for a Discord user in Vercel KV.
   * We store each user as a hash with key `user:{discordId}`
   */
  async addOrUpdateUser(discordId, osuUserId, mode) {
    await kv.hset(`user:${discordId}`, {
      discord_id: String(discordId),
      osu_user_id: String(osuUserId),
      mode: mode,
    });
    
    // Maintain a set of all discordIds for easy iteration during cron
    await kv.sadd('all_users', String(discordId));
  }

  /**
   * Retrieves user info by Discord ID.
   */
  async getUser(discordId) {
    const user = await kv.hgetall(`user:${discordId}`);
    if (user && Object.keys(user).length > 0) {
      return { 
        osu_user_id: user.osu_user_id, 
        mode: user.mode 
      };
    }
    return null;
  }

  /**
   * Retrieves all registered users (useful for cron jobs).
   */
  async getAllUsers() {
    const discordIds = await kv.smembers('all_users');
    if (!discordIds || discordIds.length === 0) return [];

    const users = [];
    for (const id of discordIds) {
      const user = await kv.hgetall(`user:${id}`);
      if (user && Object.keys(user).length > 0) {
        users.push({
          discord_id: String(id),
          osu_user_id: user.osu_user_id,
          mode: user.mode
        });
      }
    }
    return users;
  }

  /**
   * Temporarily stores verification codes for users.
   * Codes expire after 30 minutes (1800 seconds).
   */
  async setPendingVerification(discordId, code) {
    await kv.set(`verify:${discordId}`, code, { ex: 1800 });
  }

  /**
   * Retrieves the pending verification code for a user.
   */
  async getPendingVerification(discordId) {
    return await kv.get(`verify:${discordId}`);
  }
  
  /**
   * Deletes the pending verification code.
   */
  async deletePendingVerification(discordId) {
    await kv.del(`verify:${discordId}`);
  }
}
