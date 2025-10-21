import {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import axios from 'axios';

const BOT_VERSION = '2.3.0';

// Verificación básica de entorno
if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error('❌ Faltan variables de entorno. Necesitas TOKEN y CLIENT_ID.');
  process.exit(1);
}

// Inicializar cliente
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ==== Definición de slash commands ====
const commands = [
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Obtiene información de un anime o manga.')
    .addStringOption(o =>
      o.setName('tipo')
        .setDescription('Selecciona si es anime o manga')
        .setRequired(true)
        .addChoices(
          { name: 'Anime', value: 'anime' },
          { name: 'Manga', value: 'manga' }
        ))
    .addStringOption(o =>
      o.setName('nombre')
        .setDescription('Nombre del anime o manga')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('noticias')
    .setDescription('Últimas noticias de anime o manga.')
    .addStringOption(o =>
      o.setName('tipo')
        .setDescription('Selecciona tipo de noticias')
        .setRequired(true)
        .addChoices(
          { name: 'Anime', value: 'anime' },
          { name: 'Manga', value: 'manga' }
        )),

  new SlashCommandBuilder()
    .setName('recomendacion')
    .setDescription('Recomienda un anime por género.')
    .addStringOption(o =>
      o.setName('genero')
        .setDescription('Género del anime')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('waifu')
    .setDescription('Muestra una waifu aleatoria.'),

  new SlashCommandBuilder()
    .setName('trend')
    .setDescription('Muestra los animes o mangas más populares.')
    .addStringOption(o =>
      o.setName('tipo')
        .setDescription('Selecciona si es anime o manga')
        .setRequired(true)
        .addChoices(
          { name: 'Anime', value: 'anime' },
          { name: 'Manga', value: 'manga' }
        )),

  new SlashCommandBuilder()
    .setName('opinion')
    .setDescription('El bot te da su opinión de algo.')
    .addStringOption(o =>
      o.setName('tema')
        .setDescription('Tema u obra a opinar')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('version')
    .setDescription('Muestra la versión actual del bot.'),

  new SlashCommandBuilder()
    .setName('estado')
    .setDescription('Verifica si el bot está activo.')
];

// ==== Registro de comandos globales ====
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🌍 Registrando comandos globales...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Comandos slash globales registrados correctamente.');
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }
})();

// ==== Manejador de interacciones ====
client.on('ready', () => {
  console.log(`✅ Bot iniciado como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  try {
    if (commandName === 'info') {
      const tipo = interaction.options.getString('tipo');
      const nombre = interaction.options.getString('nombre');
      await interaction.deferReply();

      const { data } = await axios.get(`https://api.jikan.moe/v4/${tipo}?q=${encodeURIComponent(nombre)}&limit=1`);
      const item = data.data[0];
      if (!item) return interaction.editReply(`❌ No encontré resultados para **${nombre}** (${tipo}).`);

      const embed = new EmbedBuilder()
        .setTitle(item.title)
        .setDescription(item.synopsis ? item.synopsis.substring(0, 400) + '…' : 'Sin descripción.')
        .setThumbnail(item.images?.jpg?.image_url)
        .addFields(
          { name: '📺 Tipo', value: item.type || 'Desconocido', inline: true },
          { name: '⭐ Puntuación', value: item.score ? `${item.score}/10` : 'N/A', inline: true },
          { name: '🗓️ Estado', value: item.status || 'Desconocido', inline: true }
        )
        .setColor(0xf47fff)
        .setFooter({ text: `Fuente: MyAnimeList (${tipo})` });
      await interaction.editReply({ embeds: [embed] });
    }

    else if (commandName === 'noticias') {
      const tipo = interaction.options.getString('tipo');
      await interaction.deferReply();

      const { data } = await axios.get(`https://api.jikan.moe/v4/news?type=${tipo}`);
      const noticias = data.data.slice(0, 3);
      const embed = new EmbedBuilder()
        .setTitle(`📰 Últimas noticias de ${tipo}`)
        .setColor(0xf47fff);

      noticias.forEach(n => embed.addFields({ name: n.title, value: `[Leer más](${n.url})` }));
      await interaction.editReply({ embeds: [embed] });
    }

    else if (commandName === 'recomendacion') {
      const genero = interaction.options.getString('genero');
      await interaction.deferReply();
      const { data } = await axios.get(`https://api.jikan.moe/v4/anime?q=${genero}&limit=5&order_by=score`);
      const random = data.data[Math.floor(Math.random() * data.data.length)];
      const embed = new EmbedBuilder()
        .setTitle(`🎯 Recomendación (${genero})`)
        .setDescription(random.synopsis?.substring(0, 400) + '…')
        .setThumbnail(random.images?.jpg?.image_url)
        .setURL(random.url)
        .setColor(0x00cc99);
      await interaction.editReply({ embeds: [embed] });
    }

    else if (commandName === 'waifu') {
      await interaction.deferReply();
      const { data } = await axios.get('https://api.waifu.pics/sfw/waifu');
      const embed = new EmbedBuilder()
        .setTitle('💖 Tu waifu de hoy')
        .setImage(data.url)
        .setColor(0xff6699);
      await interaction.editReply({ embeds: [embed] });
    }

    else if (commandName === 'trend') {
      const tipo = interaction.options.getString('tipo');
      await interaction.deferReply();
      const { data } = await axios.get(`https://api.jikan.moe/v4/top/${tipo}?limit=5`);
      const embed = new EmbedBuilder()
        .setTitle(`🔥 Tendencias actuales (${tipo})`)
        .setColor(0xf47fff);
      data.data.forEach((t, i) => {
        embed.addFields({
          name: `${i + 1}. ${t.title}`,
          value: `[Ver más](${t.url}) - ⭐ ${t.score || 'N/A'}`
        });
      });
      await interaction.editReply({ embeds: [embed] });
    }

    else if (commandName === 'opinion') {
      const tema = interaction.options.getString('tema');
      const frases = [
        `Hmm... ${tema} está sobrevalorado 😏`,
        `Bro, ${tema} es una joya que pocos entienden 💎`,
        `Solo los verdaderos fans saben apreciar ${tema} 🔥`,
        `${tema}? lo dejo en un sólido 7/10 😎`
      ];
      await interaction.reply(frases[Math.floor(Math.random() * frases.length)]);
    }

    else if (commandName === 'version') {
      const embed = new EmbedBuilder()
        .setTitle('📦 Versión del bot')
        .addFields(
          { name: 'Versión', value: BOT_VERSION, inline: true },
          { name: 'Estado', value: '🟢 En línea', inline: true },
          { name: 'Actualizado', value: new Date().toLocaleString('es-ES'), inline: false }
        )
        .setColor(0x7289da);
      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'estado') {
      await interaction.reply('✅ El bot está activo y respondiendo correctamente.');
    }

  } catch (err) {
    console.error('Error ejecutando comando:', err);
    if (interaction.deferred || interaction.replied)
      await interaction.editReply('⚠️ Ocurrió un error ejecutando el comando.');
    else
      await interaction.reply('⚠️ Error inesperado.');
  }
});

client.login(process.env.TOKEN);