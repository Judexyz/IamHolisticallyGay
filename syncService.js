export default class WidgetSyncService {
  constructor(clientId, osuApi, botToken) {
    this.clientId = clientId;
    this.osuApi = osuApi;
    this.botToken = botToken;
  }

  async syncUserDiscordWidget(discordId, osuUserId, mode) {
    const root = await this.osuApi.getOsuProfileById(osuUserId, mode);
    if (!root) {
      throw new Error('Could not fetch user statistics from osu! database.');
    }

    const stats = root.statistics;
    if (!stats) {
      throw new Error('osu! response format is missing expected user statistics block.');
    }

    const osuUsername = root.username || 'osu! Player';

    const globalRank = stats.global_rank || 0;
    const countryRank = stats.country_rank || 0;
    const pp = stats.pp || 0.0;
    const accuracy = stats.hit_accuracy || 0.0;
    const playCount = stats.play_count || 0;
    const level = stats.level?.current || 0;

    const dynamicData = [
      { type: 1, name: 'global_rank', value: `#${globalRank.toLocaleString()}` },
      { type: 1, name: 'pp', value: `${Math.round(pp).toLocaleString()}pp` },
      { type: 1, name: 'accuracy', value: `${accuracy.toFixed(2)}%` },
      { type: 1, name: 'play_count', value: playCount.toLocaleString() },
      { type: 1, name: 'country_rank', value: `#${countryRank.toLocaleString()}` },
      { type: 1, name: 'level', value: `${level}` },
    ];

    const payload = {
      username: osuUsername,
      data: {
        dynamic: dynamicData,
      },
    };

    const url = `https://discord.com/api/v9/applications/${this.clientId}/users/${discordId}/identities/0/profile`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.status >= 400) {
      const resText = await response.text();
      throw new Error(`HTTP ${response.status}: ${resText}`);
    }
  }
}
