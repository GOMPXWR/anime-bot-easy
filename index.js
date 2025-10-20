const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

console.log('🚀 Iniciando bot en Railway...');

const CONFIG = {
    canalNoticias: process.env.CANAL_NOTICIAS,
    rolMencion: process.env.ROL_MENCION,
    seriesSeguidas: {
        manga: [
            "The 100 Girlfriends Who Really, Really, Really, Really, Really Love You",
            "One Piece",
            "Spy x Family",
            "Dandadan",
            "When Will Her Tears Dry"
        ],
        anime: [
            "The 100 Girlfriends Who Really, Really, Really, Really, Really Love You",
            "Spy x Family",
            "Dandadan", 
            "When Will Her Tears Dry"
        ]
    },
    ultimasNoticias: new Set()
};

client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    client.user.setActivity('noticias de anime 🎬', { type: ActivityType.Watching });
    
    setInterval(verificarNoticias, 10 * 60 * 1000);
    verificarNoticias();
});

async function verificarNoticias() {
    try {
        console.log('🔍 Verificando noticias...');
        if (!CONFIG.canalNoticias) {
            console.log('⚠️ Canal no configurado. Usa !setup');
            return;
        }

        const channel = await client.channels.fetch(CONFIG.canalNoticias);
        if (!channel) {
            console.log('❌ Canal no encontrado');
            return;
        }

        const anuncios = await buscarAnunciosAniList();
        const noticiasReddit = await buscarNoticiasReddit();

        for (const anuncio of anuncios) {
            const idNoticia = `anuncio_${anuncio.titulo}`;
            if (!CONFIG.ultimasNoticias.has(idNoticia)) {
                const embed = new EmbedBuilder()
                    .setTitle('🎊 ¡NUEVO ANIME ANUNCIADO!')
                    .setDescription(`**${anuncio.titulo}**`)
                    .setColor(0x00FF00)
                    .setURL(anuncio.url)
                    .addFields(
                        { name: 'Formato', value: anuncio.formato, inline: true },
                        { name: 'Fecha Est.', value: anuncio.fecha, inline: true }
                    );

                const mensaje = CONFIG.rolMencion ? `<@&${CONFIG.rolMencion}> ¡Nuevo anime!` : '¡Nuevo anime anunciado!';
                await channel.send({ content: mensaje, embeds: [embed] });
                CONFIG.ultimasNoticias.add(idNoticia);
                console.log(`📢 Nuevo anuncio: ${anuncio.titulo}`);
            }
        }

        for (const noticia of noticiasReddit) {
            const idNoticia = `reddit_${noticia.created}`;
            if (!CONFIG.ultimasNoticias.has(idNoticia)) {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Posible Noticia/Filtración')
                    .setDescription(noticia.titulo)
                    .setColor(0xFF9900)
                    .setURL(noticia.url)
                    .addFields(
                        { name: 'Fuente', value: `r/${noticia.subreddit}`, inline: true }
                    );

                await channel.send({ embeds: [embed] });
                CONFIG.ultimasNoticias.add(idNoticia);
                console.log(`📰 Nueva noticia: ${noticia.titulo}`);
            }
        }

        if (CONFIG.ultimasNoticias.size > 100) {
            const arrayNoticias = Array.from(CONFIG.ultimasNoticias);
            CONFIG.ultimasNoticias = new Set(arrayNoticias.slice(-100));
        }
    } catch (error) {
        console.error('❌ Error en verificación:', error);
    }
}

async function buscarAnunciosAniList() {
    try {
        const query = `
            query {
                Page(page: 1, perPage: 10) {
                    media(status: NOT_YET_RELEASED, type: ANIME, sort: ID_DESC) {
                        title { romaji english }
                        startDate { year month day }
                        siteUrl
                        format
                    }
                }
            }
        `;

        const response = await axios.post('https://graphql.anilist.co', { query });
        const anuncios = [];

        for (const media of response.data.data.Page.media) {
            const titulo = media.title.romaji || media.title.english;
            if (titulo) {
                anuncios.push({
                    titulo: titulo,
                    fecha: `${media.startDate.year}-${media.startDate.month}-${media.startDate.day}`,
                    url: media.siteUrl,
                    formato: media.format
                });
            }
        }
        return anuncios;
    } catch (error) {
        console.error('Error en AniList:', error.message);
        return [];
    }
}

async function buscarNoticiasReddit() {
    try {
        const response = await axios.get('https://www.reddit.com/r/anime/new/.json?limit=10');
        const noticias = [];

        for (const post of response.data.data.children) {
            const titulo = post.data.title.toLowerCase();
            const keywords = [
                'season 2', 'season 3', 'sequel', 'announced', 'confirmed',
                'leak', 'rumor', 'adaptation', 'trailer'
            ];

            if (keywords.some(keyword => titulo.includes(keyword))) {
                noticias.push({
                    titulo: post.data.title,
                    url: `https://reddit.com${post.data.permalink}`,
                    subreddit: post.data.subreddit,
                    created: post.data.created_utc
                });
            }
        }
        return noticias;
    } catch (error) {
        console.error('Error en Reddit:', error.message);
        return [];
    }
}

async function buscarInfoAniList(nombreSerie, tipo) {
    try {
        const query = `
            query ($search: String, $type: MediaType) {
                Media(search: $search, type: $type) {
                    title { romaji english }
                    status
                    episodes
                    chapters
                    format
                    siteUrl
                    description
                    startDate { year month day }
                }
            }
        `;

        const variables = { search: nombreSerie, type: tipo };
        const response = await axios.post('https://graphql.anilist.co', {
            query,
            variables
        });

        return response.data;
    } catch (error) {
        console.error('Error buscando info:', error.message);
        return null;
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!setup')) {
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('❌ Necesitas permisos de administrador.');
        }
        
        CONFIG.canalNoticias = message.channel.id;
        const rol = message.mentions.roles.first();
        if (rol) CONFIG.rolMencion = rol.id;

        const embed = new EmbedBuilder()
            .setTitle('✅ Configuración Completada')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Canal de Noticias', value: `<#${CONFIG.canalNoticias}>`, inline: true },
                { name: 'Rol de Mención', value: rol ? `<@&${CONFIG.rolMencion}>` : 'No configurado', inline: true }
            );

        await message.reply({ embeds: [embed] });
        console.log('⚙️ Configuración actualizada via comando');
    }

    if (message.content === '!estado') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Estado del Bot')
            .setColor(0x3498DB)
            .addFields(
                { name: 'Canal', value: CONFIG.canalNoticias ? `<#${CONFIG.canalNoticias}>` : 'No config', inline: true },
                { name: 'Noticias', value: CONFIG.ultimasNoticias.size.toString(), inline: true },
                { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }
            );

        await message.reply({ embeds: [embed] });
    }

    if (message.content === '!test') {
        await message.reply('✅ Bot funcionando correctamente!');
    }

    if (message.content.startsWith('!agregar')) {
        const args = message.content.split(' ');
        if (args.length < 3) {
            return message.reply('❌ Uso: `!agregar manga/anime Nombre de la serie`');
        }

        const tipo = args[1].toLowerCase();
        const nombreSerie = args.slice(2).join(' ');

        if (tipo !== 'manga' && tipo !== 'anime') {
            return message.reply('❌ Tipo debe ser `manga` o `anime`');
        }

        if (CONFIG.seriesSeguidas[tipo].includes(nombreSerie)) {
            return message.reply(`❌ "${nombreSerie}" ya está en la lista de ${tipo}`);
        }

        CONFIG.seriesSeguidas[tipo].push(nombreSerie);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Serie Agregada')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Tipo', value: tipo, inline: true },
                { name: 'Serie', value: nombreSerie, inline: true },
                { name: 'Total', value: CONFIG.seriesSeguidas[tipo].length.toString(), inline: true }
            );

        await message.reply({ embeds: [embed] });
        console.log(`📝 Serie agregada: ${nombreSerie} (${tipo})`);
    }

    if (message.content === '!series') {
        const embed = new EmbedBuilder()
            .setTitle('📚 Series Seguidas')
            .setColor(0x3498DB)
            .addFields(
                { 
                    name: `🎬 Anime (${CONFIG.seriesSeguidas.anime.length})`, 
                    value: CONFIG.seriesSeguidas.anime.slice(0, 10).join('\n') || 'Ninguna',
                    inline: true 
                },
                { 
                    name: `📖 Manga (${CONFIG.seriesSeguidas.manga.length})`, 
                    value: CONFIG.seriesSeguidas.manga.slice(0, 10).join('\n') || 'Ninguna', 
                    inline: true 
                }
            );

        await message.reply({ embeds: [embed] });
    }

    if (message.content.startsWith('!info')) {
        const nombreSerie = message.content.slice(6).trim();
        if (!nombreSerie) {
            return message.reply('❌ Uso: `!info Nombre de la serie`');
        }

        await message.reply(`🔍 Buscando información de **${nombreSerie}**...`);

        const info = await buscarInfoAniList(nombreSerie, 'ANIME');
        if (info && info.data && info.data.Media) {
            const media = info.data.Media;
            const titulo = media.title.romaji || media.title.english || nombreSerie;
            
            const embed = new EmbedBuilder()
                .setTitle(`📺 ${titulo}`)
                .setColor(0xFF6B6B)
                .setURL(media.siteUrl)
                .addFields(
                    { name: 'Estado', value: media.status || 'Desconocido', inline: true },
                    { name: 'Episodios', value: (media.episodes || '?').toString(), inline: true },
                    { name: 'Formato', value: media.format || '?', inline: true }
                );

            if (media.description) {
                const descripcionLimpia = media.description.replace(/<br>/g, '\n').replace(/<[^>]*>/g, '');
                embed.setDescription(descripcionLimpia.substring(0, 200) + '...');
            }

            await message.reply({ embeds: [embed] });
        } else {
            await message.reply('❌ No se pudo encontrar información de esa serie');
        }
    }

    if (message.content === '!noticias') {
        const ultimasNoticias = Array.from(CONFIG.ultimasNoticias).slice(-5);
        
        const embed = new EmbedBuilder()
            .setTitle('📰 Últimas 5 Noticias')
            .setColor(0x9B59B6);

        if (ultimasNoticias.length > 0) {
            embed.setDescription('IDs de las últimas noticias detectadas:\n' + ultimasNoticias.join('\n'));
        } else {
            embed.setDescription('No hay noticias recientes');
        }

        await message.reply({ embeds: [embed] });
    }

    if (message.content === '!roshidere') {
        const info = await buscarInfoAniList("When Will Her Tears Dry", "MANGA");
        if (info && info.data && info.data.Media) {
            const media = info.data.Media;
            const titulo = media.title.romaji || media.title.english;
            
            const embed = new EmbedBuilder()
                .setTitle(`📖 ${titulo}`)
                .setColor(0xFF6B6B)
                .addFields(
                    { name: 'Estado', value: media.status, inline: true },
                    { name: 'Capítulos', value: media.chapters?.toString() || 'Desconocido', inline: true },
                    { name: 'Enlace', value: `[AniList](${media.siteUrl})`, inline: true }
                );

            await message.reply({ embeds: [embed] });
        } else {
            await message.reply('❌ No se pudo encontrar información de Roshidere');
        }
    }

    if (message.content === '!cien_novias') {
        const infoManga = await buscarInfoAniList("The 100 Girlfriends Who Really, Really, Really, Really, Really Love You", "MANGA");
        const infoAnime = await buscarInfoAniList("The 100 Girlfriends Who Really, Really, Really, Really, Really Love You", "ANIME");
        
        const embed = new EmbedBuilder()
            .setTitle('💕 100 Girlfriends Info')
            .setColor(0xFF6B6B);

        if (infoManga?.data?.Media) {
            const manga = infoManga.data.Media;
            embed.addFields({
                name: '📖 Manga',
                value: `Capítulos: ${manga.chapters || '?'}\nEstado: ${manga.status}`,
                inline: true
            });
        }

        if (infoAnime?.data?.Media) {
            const anime = infoAnime.data.Media;
            embed.addFields({
                name: '🎬 Anime', 
                value: `Episodios: ${anime.episodes || '?'}\nEstado: ${anime.status}`,
                inline: true
            });
        }

        await message.reply({ embeds: [embed] });
    }

    if (message.content === '!forzar_verificacion') {
        await message.reply('🔍 Forzando verificación...');
        await verificarNoticias();
        await message.reply('✅ Verificación completada');
    }
});

client.on('error', (error) => {
    console.error('❌ Error del cliente:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Error no manejado:', error);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ ERROR: No se encontró DISCORD_TOKEN');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('❌ Error al conectar:', error);
    process.exit(1);
});