// index.js - Single file bot (ESM) with slash commands
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, Collection, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { REST } from '@discordjs/rest';
import pkg from './package.json' assert { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIG persistence (simple JSON)
const CONFIG_FILE = path.join(__dirname, 'config.json');
let CONFIG = { canalNoticias: null, rolMencion: null, seriesSeguidas: { anime: [], manga: [] }, ultimasNoticias: [] };
try {
  if (fs.existsSync(CONFIG_FILE)) CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
} catch (e) { console.error('No se pudo leer config.json:', e); }

// helper to save config
function saveConfig() {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 2), 'utf-8'); } catch (e) { console.error('Error guardando config:', e); }
}

// env
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Faltan variables de entorno. Necesitas TOKEN, CLIENT_ID y GUILD_ID.');
  process.exit(1);
}

const BOT_VERSION = pkg.version || '0.0.0';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// ---------- COMMAND DEFINITIONS (SlashCommandBuilder objects + execute) ----------
const commands = [];

// /version
commands.push({
  data: new SlashCommandBuilder().setName('version').setDescription('Muestra la versión actual del bot.'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('📦 Versión del Bot')
      .setColor(0x7289da)
      .addFields(
        { name: 'Versión', value: BOT_VERSION, inline: true },
        { name: 'Estado', value: '✅ En línea', inline: true },
        { name: 'Última actualización', value: new Date().toLocaleString('es-ES'), inline: false }
      );
    await interaction.reply({ embeds: [embed] });
  }
});

// /info tipo nombre
commands.push({
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Obtiene información de un anime o manga.')
    .addStringOption(o => o.setName('tipo').setDescription('anime o manga').setRequired(true).addChoices({ name: 'Anime', value: 'anime' }, { name: 'Manga', value: 'manga' }))
    .addStringOption(o => o.setName('nombre').setDescription('Nombre de la serie').setRequired(true)),
  async execute(interaction) {
    const tipo = interaction.options.getString('tipo');
    const nombre = interaction.options.getString('nombre');
    await interaction.deferReply();
    try {
      const url = `https://api.jikan.moe/v4/${tipo}?q=${encodeURIComponent(nombre)}&limit=1`;
      const res = await axios.get(url);
      const item = res.data.data?.[0];
      if (!item) return interaction.editReply(`❌ No encontré resultados para **${nombre}** (${tipo}).`);
      const title = item.title || item.title_english || item.title_japanese || item.name || nombre;
      const synopsis = item.synopsis || item.description || 'Sin descripción disponible.';
      const embed = new EmbedBuilder()
        .setTitle(`${title}`)
        .setURL(item.url || item.link || '')
        .setDescription(synopsis.length > 500 ? synopsis.substring(0, 500) + '...' : synopsis)
        .setColor(0xf47fff);

      // thumbnail/banner
      const thumb = item.images?.jpg?.image_url || item.image_url || item.images?.webp?.large_image_url;
      if (thumb) embed.setThumbnail(thumb);

      // fields
      if (tipo === 'anime') {
        embed.addFields(
          { name: '📺 Tipo', value: item.type || 'Desconocido', inline: true },
          { name: '⭐ Puntuación', value: item.score ? `${item.score}/10` : 'N/A', inline: true },
          { name: '🗓️ Emisión', value: item.aired?.string || item.published?.string || (item.status || 'Desconocido'), inline: false }
        );
        if (item.episodes) embed.addFields({ name: '🎞️ Episodios', value: String(item.episodes), inline: true });
        if (item.duration) embed.addFields({ name: '⏱️ Duración', value: item.duration, inline: true });
      } else {
        embed.addFields(
          { name: '📖 Tipo', value: item.type || 'Desconocido', inline: true },
          { name: '⭐ Puntuación', value: item.score ? `${item.score}/10` : 'N/A', inline: true },
          { name: '📚 Publicación', value: item.published?.string || item.status || 'Desconocido', inline: false }
        );
        if (item.chapters) embed.addFields({ name: 'Capítulos', value: String(item.chapters), inline: true });
        if (item.volumes) embed.addFields({ name: 'Volúmenes', value: String(item.volumes), inline: true });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error /info:', err?.response?.data || err.message || err);
      await interaction.editReply('⚠️ Error al obtener la información (API Jikan). Intenta de nuevo.');
    }
  }
});

// /noticias tipo
commands.push({
  data: new SlashCommandBuilder()
    .setName('noticias')
    .setDescription('Muestra noticias recientes de anime o manga.')
    .addStringOption(o => o.setName('tipo').setDescription('anime o manga').setRequired(true).addChoices({ name: 'Anime', value: 'anime' }, { name: 'Manga', value: 'manga' })),
  async execute(interaction) {
    const tipo = interaction.options.getString('tipo');
    await interaction.deferReply();
    try {
      // Jikan has /v4/news?type=anime (useful)
      const url = `https://api.jikan.moe/v4/news?type=${tipo}`;
      const res = await axios.get(url);
      const news = res.data.data?.slice(0, 5) || [];
      if (!news.length) return interaction.editReply('No se encontraron noticias recientes.');
      const embed = new EmbedBuilder()
        .setTitle(`📰 Noticias recientes (${tipo})`)
        .setColor(0x9B59B6)
        .setFooter({ text: 'Fuente: MyAnimeList / Jikan' });

      news.forEach(n => {
        const title = n.title?.substring(0, 80) || 'Noticia';
        const urlN = n.url || n.link || '';
        embed.addFields({ name: title, value: urlN || '(Sin enlace)', inline: false });
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error /noticias:', err?.response?.data || err.message || err);
      await interaction.editReply('⚠️ No se pudieron cargar las noticias (API).');
    }
  }
});

// /recomendacion genero
commands.push({
  data: new SlashCommandBuilder()
    .setName('recomendacion')
    .setDescription('Recomienda un anime/manga por género.')
    .addStringOption(o => o.setName('genero').setDescription('Ej: romance, accion, comedia').setRequired(true))
    .addStringOption(o => o.setName('tipo').setDescription('anime o manga').setRequired(false).addChoices({ name: 'Anime', value: 'anime' }, { name: 'Manga', value: 'manga' })),
  async execute(interaction) {
    const genero = interaction.options.getString('genero');
    const tipo = interaction.options.getString('tipo') || 'anime';
    await interaction.deferReply();
    try {
      // Buscar varios resultados y filtrar por genero en la respuesta
      const url = `https://api.jikan.moe/v4/${tipo}?q=&genres=${encodeURIComponent(genero)}&limit=15`;
      // Note: Jikan expects numeric genre ids, but to keep simple we'll do general search and filter locally by genre name (less precise)
      const searchUrl = `https://api.jikan.moe/v4/${tipo}?q=${encodeURIComponent(genero)}&limit=25`;
      const res = await axios.get(searchUrl);
      const list = res.data.data || [];
      // prefer items that contain genre name in genres array
      const filtered = list.filter(it => {
        const genres = (it.genres || []).map(g => g.name.toLowerCase());
        return genres.some(g => g.includes(genero.toLowerCase()));
      });
      const pool = filtered.length ? filtered : list;
      if (!pool.length) return interaction.editReply(`No encontré recomendaciones para "${genero}".`);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const embed = new EmbedBuilder()
        .setTitle(pick.title || pick.name)
        .setURL(pick.url || '')
        .setDescription((pick.synopsis || '').substring(0, 400) || 'Sin descripción disponible.')
        .setThumbnail(pick.images?.jpg?.image_url || '')
        .addFields(
          { name: 'Tipo', value: tipo, inline: true },
          { name: 'Puntuación', value: pick.score ? `${pick.score}/10` : 'N/A', inline: true }
        )
        .setFooter({ text: `Recomendación para: ${genero}` });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error /recomendacion:', err?.response?.data || err.message || err);
      await interaction.editReply('⚠️ Error al buscar recomendaciones.');
    }
  }
});

// /waifu - usa waifu.pics (sfw)
commands.push({
  data: new SlashCommandBuilder().setName('waifu').setDescription('Muestra una waifu aleatoria (imagen SFW).'),
  async execute(interaction) {
    await interaction.deferReply();
    try {
      const res = await fetch('https://api.waifu.pics/sfw/waifu');
      const data = await res.json();
      const embed = new EmbedBuilder()
        .setTitle('💖 Waifu aleatoria')
        .setImage(data.url)
        .setColor(0xff8fb1)
        .setFooter({ text: 'Fuente: waifu.pics' });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error /waifu:', err);
      await interaction.editReply('⚠️ No pude traer una waifu ahora.');
    }
  }
});

// /trend tipo
commands.push({
  data: new SlashCommandBuilder()
    .setName('trend')
    .setDescription('Muestra los top en tendencia (anime/manga).')
    .addStringOption(o => o.setName('tipo').setDescription('anime o manga').setRequired(true).addChoices({ name: 'Anime', value: 'anime' }, { name: 'Manga', value: 'manga' })),
  async execute(interaction) {
    const tipo = interaction.options.getString('tipo');
    await interaction.deferReply();
    try {
      const url = `https://api.jikan.moe/v4/top/${tipo}?limit=5`;
      const res = await axios.get(url);
      const tops = res.data.data || [];
      const embed = new EmbedBuilder()
        .setTitle(`🔥 Top ${tipo}`)
        .setColor(0xffc107)
        .setFooter({ text: 'Fuente: Jikan (MyAnimeList)' });
      tops.forEach((t, i) => {
        embed.addFields({ name: `${i + 1}. ${t.title}`, value: `Score: ${t.score || 'N/A'} • Type: ${t.type || '?'}` });
      });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error /trend:', err?.response?.data || err.message || err);
      await interaction.editReply('⚠️ No pude obtener tendencias.');
    }
  }
});

// /opinion tema
commands.push({
  data: new SlashCommandBuilder().setName('opinion').setDescription('Da una opinión divertida sobre un tema.').addStringOption(o => o.setName('tema').setDescription('Tema para opinar').setRequired(true)),
  async execute(interaction) {
    const tema = interaction.options.getString('tema');
    const templates = [
      `Bro, ${tema} es como spoiler: emocionante, pero te arrepentirás a las 3 AM.`,
      `Mi opinión sobre ${tema}: más hype que relleno.`,
      `${tema}? Ponlo en la lista, pero no lo veas antes de dormir.`,
      `Si ${tema} fuera un personaje, sería el de apoyo que roba escena.`
    ];
    const chosen = templates[Math.floor(Math.random() * templates.length)];
    await interaction.reply(chosen);
  }
});

// /setup canal rol
commands.push({
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configura canal de noticias y rol de mención.')
    .addChannelOption(o => o.setName('canal').setDescription('Canal de noticias').setRequired(true))
    .addRoleOption(o => o.setName('rol').setDescription('Rol a mencionar').setRequired(false)),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has?.('Administrator')) {
      return interaction.reply({ content: '❌ Necesitas permisos de administrador para configurar.', ephemeral: true });
    }
    const canal = interaction.options.getChannel('canal');
    const rol = interaction.options.getRole('rol');
    CONFIG.canalNoticias = canal.id;
    CONFIG.rolMencion = rol?.id || null;
    saveConfig();
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuración guardada')
      .addFields(
        { name: 'Canal', value: `<#${CONFIG.canalNoticias}>`, inline: true },
        { name: 'Rol', value: CONFIG.rolMencion ? `<@&${CONFIG.rolMencion}>` : 'No configurado', inline: true }
      )
      .setColor(0x00FF00);
    await interaction.reply({ embeds: [embed] });
  }
});

// /estado
commands.push({
  data: new SlashCommandBuilder().setName('estado').setDescription('Muestra el estado del bot.'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🤖 Estado del Bot')
      .setColor(0x3498DB)
      .addFields(
        { name: 'Canal', value: CONFIG.canalNoticias ? `<#${CONFIG.canalNoticias}>` : 'No configurado', inline: true },
        { name: 'Series seguidas (anime)', value: String(CONFIG.seriesSeguidas.anime.length), inline: true },
        { name: 'Series seguidas (manga)', value: String(CONFIG.seriesSeguidas.manga.length), inline: true },
        { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  }
});

// /test
commands.push({
  data: new SlashCommandBuilder().setName('test').setDescription('Prueba si el bot responde.'),
  async execute(interaction) { await interaction.reply('✅ Bot funcionando correctamente!'); }
});

// /agregar tipo nombre
commands.push({
  data: new SlashCommandBuilder()
    .setName('agregar')
    .setDescription('Agrega un anime o manga a la lista.')
    .addStringOption(o => o.setName('tipo').setDescription('anime o manga').setRequired(true).addChoices({ name: 'Anime', value: 'anime' }, { name: 'Manga', value: 'manga' }))
    .addStringOption(o => o.setName('nombre').setDescription('Nombre de la serie').setRequired(true)),
  async execute(interaction) {
    const tipo = interaction.options.getString('tipo');
    const nombre = interaction.options.getString('nombre');
    if (!CONFIG.seriesSeguidas[tipo]) CONFIG.seriesSeguidas[tipo] = [];
    if (CONFIG.seriesSeguidas[tipo].includes(nombre)) return interaction.reply({ content: `❌ "${nombre}" ya está en la lista de ${tipo}.`, ephemeral: true });
    CONFIG.seriesSeguidas[tipo].push(nombre);
    saveConfig();
    await interaction.reply(`✅ Agregado "${nombre}" a ${tipo}. Total: ${CONFIG.seriesSeguidas[tipo].length}`);
  }
});

// /series
commands.push({
  data: new SlashCommandBuilder().setName('series').setDescription('Muestra las series que se siguen.'),
  async execute(interaction) {
    const animeList = CONFIG.seriesSeguidas.anime.slice(0, 20).join('\n') || 'Ninguna';
    const mangaList = CONFIG.seriesSeguidas.manga.slice(0, 20).join('\n') || 'Ninguna';
    const embed = new EmbedBuilder()
      .setTitle('📚 Series Seguidas')
      .addFields(
        { name: `🎬 Anime (${CONFIG.seriesSeguidas.anime.length})`, value: animeList, inline: true },
        { name: `📖 Manga (${CONFIG.seriesSeguidas.manga.length})`, value: mangaList, inline: true }
      )
      .setColor(0x2ecc71);
    await interaction.reply({ embeds: [embed] });
  }
});

// /forzar_verificacion (manual)
commands.push({
  data: new SlashCommandBuilder().setName('forzar_verificacion').setDescription('Forzar verificación manual de noticias (admin).'),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has?.('Administrator')) return interaction.reply({ content: '❌ Necesitas permisos de administrador.', ephemeral: true });
    await interaction.reply('🔍 Forzando verificación de noticias...');
    // pequeña función de ejemplo para chequear anuncios AniList (puede extenderse)
    try {
      // comprobación simple: revisar anuncios de AniList (media NOT_YET_RELEASED)
      const query = `query { Page(page:1, perPage:5) { media(status:NOT_YET_RELEASED, type:ANIME, sort:ID_DESC) { title { romaji english } siteUrl coverImage { large } } } }`;
      const res = await axios.post('https://graphql.anilist.co', { query });
      const anuncios = res.data?.data?.Page?.media || [];
      let posted = 0;
      if (!CONFIG.canalNoticias) return interaction.followUp('⚠️ Canal de noticias no configurado. Usa /setup.');
      const canal = await client.channels.fetch(CONFIG.canalNoticias).catch(()=>null);
      if (!canal) return interaction.followUp('❌ No encontré el canal configurado.');
      for (const a of anuncios) {
        const idNot = `anilist_${a.title?.romaji || a.title?.english}`;
        if (CONFIG.ultimasNoticias.includes(idNot)) continue;
        const embed = new EmbedBuilder()
          .setTitle('🎊 Nuevo anuncio')
          .setDescription(`**${a.title?.romaji || a.title?.english}**`)
          .setURL(a.siteUrl || '')
          .setImage(a.coverImage?.large || null)
          .setColor(0x00FF00);
        await canal.send({ content: CONFIG.rolMencion ? `<@&${CONFIG.rolMencion}>` : '', embeds: [embed] }).catch(console.error);
        CONFIG.ultimasNoticias.push(idNot);
        posted++;
      }
      // mantener últimas 100
      CONFIG.ultimasNoticias = CONFIG.ultimasNoticias.slice(-100);
      saveConfig();
      await interaction.followUp(`✅ Verificación completada. Nuevos anuncios publicados: ${posted}`);
    } catch (err) {
      console.error('Error forzar_verificacion:', err?.response?.data || err.message || err);
      await interaction.followUp('⚠️ Ocurrió un error al verificar.');
    }
  }
});

// /roshidere (info rápida anime)
commands.push({
  data: new SlashCommandBuilder().setName('roshidere').setDescription('Info rápida: When Will Her Tears Dry (Roshidere)'),
  async execute(interaction) {
    await interaction.deferReply();
    try {
      const res = await axios.get(`https://api.jikan.moe/v4/manga?q=When Will Her Tears Dry&limit=1`);
      const item = res.data.data?.[0];
      if (!item) return interaction.editReply('No encontré info de Roshidere.');
      const embed = new EmbedBuilder()
        .setTitle(item.title)
        .setURL(item.url || '')
        .addFields(
          { name: 'Estado', value: item.status || 'Desconocido', inline: true },
          { name: 'Capítulos', value: item.chapters ? String(item.chapters) : 'Desconocido', inline: true }
        )
        .setThumbnail(item.images?.jpg?.image_url || '');
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error /roshidere:', err);
      await interaction.editReply('⚠️ Error obteniendo info de Roshidere.');
    }
  }
});

// /cien_novias
commands.push({
  data: new SlashCommandBuilder().setName('cien_novias').setDescription('Info rápida: The 100 Girlfriends...'),
  async execute(interaction) {
    await interaction.deferReply();
    try {
      const mangaRes = await axios.get(`https://api.jikan.moe/v4/manga?q=The 100 Girlfriends&limit=1`);
      const animeRes = await axios.get(`https://api.jikan.moe/v4/anime?q=The 100 Girlfriends&limit=1`);
      const manga = mangaRes.data.data?.[0];
      const anime = animeRes.data.data?.[0];
      const embed = new EmbedBuilder().setTitle('💕 The 100 Girlfriends Info').setColor(0xFF6B6B);
      if (manga) embed.addFields({ name: '📖 Manga', value: `Capítulos: ${manga.chapters || '?'}\nEstado: ${manga.status || '?'}`, inline: true });
      if (anime) embed.addFields({ name: '🎬 Anime', value: `Episodios: ${anime.episodes || '?'}\nEstado: ${anime.status || '?'}`, inline: true });
      if (manga?.images?.jpg?.image_url) embed.setThumbnail(manga.images.jpg.image_url);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error /cien_novias:', err);
      await interaction.editReply('⚠️ Error buscando info de 100 Girlfriends.');
    }
  }
});

// register commands array in client.commands and for REST registration later
for (const c of commands) {
  client.commands.set(c.data.name, c);
}

// ---------- Register slash commands to GUILD on startup ----------
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('🔁 Registrando comandos en el guild...');
    const cmds = commands.map(c => c.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
    console.log(`✅ Comandos registrados (${cmds.length}) en guild ${GUILD_ID}`);
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }
})();

// ---------- Interaction handler ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return interaction.reply({ content: 'Comando no encontrado.', ephemeral: true });
  try { await command.execute(interaction); } catch (err) { console.error('Error ejecutando comando:', err); try { if (!interaction.replied) await interaction.reply({ content: 'Error interno del comando', ephemeral: true }); } catch (e) {} }
});

// ---------- startup ----------
client.once('ready', () => {
  console.log(`🤖 Conectado como ${client.user.tag} • versión ${BOT_VERSION}`);
  client.user.setActivity('noticias de anime 🎬', { type: 3 }); // Watching
});

// graceful save on exit
process.on('SIGINT', () => { console.log('SIGINT, guardando config...'); saveConfig(); process.exit(); });
process.on('SIGTERM', () => { console.log('SIGTERM, guardando config...'); saveConfig(); process.exit(); });

client.login(TOKEN).catch(err => { console.error('Fallo al loguear:', err); process.exit(1); });
