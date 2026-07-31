import { verifyKey, InteractionType, InteractionResponseType, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import DatabaseService from '../database.js';
import OsuApiService from '../osuApi.js';
import WidgetSyncService from '../syncService.js';

const {
  DISCORD_PUBLIC_KEY,
  BOT_TOKEN,
  OSU_CLIENT_ID,
  OSU_CLIENT_SECRET,
  CLIENT_ID
} = process.env;

const db = new DatabaseService();
const osuApi = new OsuApiService(OSU_CLIENT_ID, OSU_CLIENT_SECRET);
const syncService = new WidgetSyncService(CLIENT_ID, osuApi, BOT_TOKEN);

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const rawBody = await getRawBody(req);

  if (!signature || !timestamp || !DISCORD_PUBLIC_KEY) {
    return res.status(401).send('Missing signature or environment variables.');
  }

  const isValidRequest = await verifyKey(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY);
  if (!isValidRequest) {
    return res.status(401).send('Bad request signature');
  }

  const interaction = JSON.parse(rawBody);

  // 1. Handle Ping
  if (interaction.type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // 2. Handle Application Commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    const userId = interaction.member?.user?.id || interaction.user?.id;

    if (name === 'widget_setup') {
      return await handleSetup(options, userId, res, interaction.token);
    } else if (name === 'widget_refresh') {
      // Return a deferred message immediately to not exceed the 3 second timeout
      // Vercel Serverless Function might be killed if we do work in background,
      // so we use 'waitUntil' if available, otherwise we just await it and hope it's fast enough.
      return await handleRefresh(userId, res, interaction.token);
    }
  }

  // 3. Handle Buttons
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = interaction.data;
    const userId = interaction.member?.user?.id || interaction.user?.id;

    if (custom_id.startsWith('v_layout:')) {
      return await handleVerifyButton(custom_id, userId, res, interaction.token);
    }
  }

  return res.status(400).send('Unknown interaction');
}

async function handleSetup(options, userId, res, token) {
  // Acknowledge immediately to avoid 3s timeout
  res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

  let username = 'Bukalapak';
  let mode = 'osu';

  if (options) {
    for (const opt of options) {
      if (opt.name === 'username') username = opt.value;
      if (opt.name === 'mode') mode = opt.value;
    }
  }

  try {
    const root = await osuApi.getOsuProfileByUsername(username, mode);
    if (!root) {
      await updateInteractionResponse(token, '❌ Could not find an osu! profile with that username.');
      return;
    }

    const osuUserId = String(root.id);
    const verificationString = `osu-widget-${Math.random().toString(36).slice(2, 10)}`;
    
    // Store verification string in Vercel KV for 30 minutes
    await db.setPendingVerification(userId, verificationString);

    const row = {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          style: ButtonStyleTypes.LINK,
          label: 'Authorize Discord',
          url: `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=token&scope=openid+sdk.social_layer`
        },
        {
          type: MessageComponentTypes.BUTTON,
          style: ButtonStyleTypes.LINK,
          label: 'osu! Profile',
          url: `https://osu.ppy.sh/users/${osuUserId}`
        },
        {
          type: MessageComponentTypes.BUTTON,
          style: ButtonStyleTypes.PRIMARY,
          label: 'Verify Layout',
          custom_id: `v_layout:${osuUserId}:${mode}`
        }
      ]
    };

    await updateInteractionResponse(
      token, 
      `To continue, click **Authorize Discord** and close the website window that pops up.\nNext, go to your [osu! Profile Account Settings](https://osu.ppy.sh/home/account/edit) and add this string code into your **Interests** or **Occupation** input box: \`${verificationString}\`\nOnce both tasks are completed, click **Verify Layout** below!`,
      [row]
    );
  } catch (e) {
    console.error(e);
    await updateInteractionResponse(token, `⚠️ Setup failed: ${e.message}`);
  }
}

async function handleVerifyButton(custom_id, userId, res, token) {
  // Acknowledge immediately to avoid 3s timeout
  res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

  const parts = custom_id.split(':');
  const osuUserId = parts[1];
  const mode = parts[2];

  const expectedCode = await db.getPendingVerification(userId);
  if (!expectedCode) {
    await updateInteractionResponse(token, 'No active verification found. Please run `/widget_setup` again.');
    return;
  }

  const root = await osuApi.getOsuProfileById(osuUserId, mode);
  if (!root) {
    await updateInteractionResponse(token, 'Failed to query profile updates from osu!');
    return;
  }

  const interests = root.interests || '';
  const occupation = root.occupation || '';
  const location = root.location || '';
  const combinedFields = `${interests} ${occupation} ${location}`;

  if (!combinedFields.includes(expectedCode)) {
    await updateInteractionResponse(token, `Verification failed! I could not detect code \`${expectedCode}\` in your profile's account settings text fields yet.`);
    return;
  }

  try {
    await syncService.syncUserDiscordWidget(userId, osuUserId, mode);
    await db.addOrUpdateUser(userId, osuUserId, mode);
    await db.deletePendingVerification(userId);

    const codeSnippet = `(async ()=>{let _mods=webpackChunkdiscord_app.push([[Symbol()],{},e=>e.c]);webpackChunkdiscord_app.pop(); let findByProps=(...e)=>{for(let t of Object.values(_mods))try{if(!t.exports||t.exports===window)continue;if(e.every(e=>t.exports?.[e]))return t.exports;for(let r in t.exports)if(e.every(e=>t.exports?.[r]?.[e])&&"IntlMessagesProxy"!==t.exports[r][Symbol.toStringTag])return t.exports[r]}}catch{}}}; let api = Object.values(_mods).find(x => x?.exports?.Bo?.get).exports.Bo; let id = findByProps("getCurrentUser").getCurrentUser().id; let current_widgets = (await api.get("/users/" + id + "/profile")).body.widgets; if (current_widgets.map(x=>x.data?.application_id).includes("${CLIENT_ID}")) {return console.log("Already in your widgets — remove it via Discord client to re-add");} current_widgets.unshift({"data":{"type":"application","application_id":"${CLIENT_ID}"}}); await api.put({url:"/users/@me/widgets",body:{widgets:current_widgets}});})()`;

    await updateInteractionResponse(token, `Verification Successful! You can now add the widget to your profile:\n1\\. Open Discord in your browser.\n2\\. Open your browsers developer tools (CTRL + Shift + I).\n3\\. Open the Console tab.\n4\\. Type \`allow pasting\` into the console.\n5\\. Paste in the following code:\n\`\`\`js\n${codeSnippet}\n\`\`\`\n6\\. Reload your Discord client using CTRL + R. You can also safely remove the code snippet from your osu! profile description now.`);
  } catch (e) {
    console.error(e);
    await updateInteractionResponse(token, `⚠️ Account confirmed with osu!, but Discord rejected the layout synchronization. Did you open and complete the 'Authorize Discord' button link first?\n\nError: ${e.message}`);
  }
}

async function handleRefresh(userId, res, token) {
  // Defer response
  res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

  const user = await db.getUser(userId);
  if (!user) {
    await updateInteractionResponse(token, '❌ You haven\'t linked an account yet! Please run `/widget_setup` first.');
    return;
  }

  try {
    await syncService.syncUserDiscordWidget(userId, user.osu_user_id, user.mode);
    await updateInteractionResponse(token, '🔄 Widget successfully refreshed with your latest live stats!');
  } catch (e) {
    console.error(e);
    await updateInteractionResponse(token, `⚠️ Update sync failed: ${e.message}`);
  }
}

async function updateInteractionResponse(token, content, components) {
  const url = `https://discord.com/api/v10/webhooks/${CLIENT_ID}/${token}/messages/@original`;
  const body = { content };
  if (components) body.components = components;

  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
