export default class OsuApiService {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
  }

  async authenticate() {
    const url = 'https://osu.ppy.sh/oauth/token';
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
      scope: 'public',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (response.ok) {
      const json = await response.json();
      this.accessToken = json.access_token;
    } else {
      console.log('Failed to update access token authentication block with osu!');
    }
  }

  async getOsuProfileByUsername(username, mode) {
    if (!this.accessToken) await this.authenticate();
    const url = `https://osu.ppy.sh/api/v2/users/${encodeURIComponent(username)}/${mode}?key=username`;
    return this._executeProfileQuery(url);
  }

  async getOsuProfileById(userId, mode) {
    if (!this.accessToken) await this.authenticate();
    const url = `https://osu.ppy.sh/api/v2/users/${userId}/${mode}?key=id`;
    return this._executeProfileQuery(url);
  }

  async _executeProfileQuery(url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) return null;
    return response.json();
  }
}
