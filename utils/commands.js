import 'dotenv/config';

const {
  BOT_TOKEN,
  CLIENT_ID
} = process.env;

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error("Missing BOT_TOKEN or CLIENT_ID in .env file");
  process.exit(1);
}

const commands = [
  {
    name: 'widget_setup',
    description: 'Link your osu! account and initialize your profile widget layout',
    options: [
      {
        name: 'username',
        description: 'Your osu! username',
        type: 3, // STRING
        required: false
      },
      {
        name: 'mode',
        description: 'Game mode (osu, taiko, catch, mania)',
        type: 3, // STRING
        required: false
      }
    ]
  },
  {
    name: 'widget_refresh',
    description: 'Pull fresh metrics from osu! and update your active layout profile card'
  }
];

async function registerCommands() {
  console.log('Registering global slash commands...');
  
  const response = await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/commands`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bot ${BOT_TOKEN}`
    },
    body: JSON.stringify(commands)
  });

  if (response.ok) {
    console.log('Successfully registered commands globally.');
  } else {
    const errorText = await response.text();
    console.error('Failed to register commands:', errorText);
  }
}

registerCommands();
