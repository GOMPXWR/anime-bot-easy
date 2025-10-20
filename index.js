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
    ultimasNoticias: new Set(),
    usuariosNotificados: new Set()
};

function esImagenValida(url) {
    if (!url) return false;
    return url.match(/\.(jpeg|jpg|gif|png|webp)$/) !== null || 
           url.includes('i.redd.it') ||
           url.includes('preview.redd.it');
}

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
        const noticiasDoblaje = await buscarNoticiasDoblaje();

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

                if (anuncio.imagen && esImagenValida(anuncio.imagen)) {
                    embed.setImage(anuncio.imagen);
                    embed.setThumbnail(anuncio.imagen);
                }

                const menciones = Array.from(CONFIG.usuariosNotificados).map(id => `<@${id}>`).join(' ');
                const mensaje = menciones || '¡Nuevo anime anunciado!';
                
                await channel.send({ 
                    content: mensaje,
                    embeds: [embed] 
                });
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

                if (noticia.imagen && esImagenValida(noticia.imagen)) {
                    embed.setImage(noticia.imagen);
                }

                await channel.send({ embeds: [embed] });
                CONFIG.ultimasNoticias.add(idNoticia);
                console.log(`📰 Nueva noticia: ${noticia.titulo}`);
            }
        }

        for (const noticia of noticiasDoblaje) {
            const idNoticia = `doblaje_${noticia.created}`;
            if (!CONFIG.ultimasNoticias.has(idNoticia)) {
                const embed = new EmbedBuilder()
                    .setTitle('🎙️ ¡Noticia de Doblaje!')
                    .setDescription(`**${noticia.titulo}**`)
                    .setColor(0x9B59B6)
                    .setURL(noticia.url)
                    .addFields(
                        { name: 'Fuente', value: `r/${noticia.subreddit}`, inline: true },
                        { name: 'Tipo', value: 'Doblaje/Localización', inline: true }
                    );

                if (noticia.imagen && esImagenValida(noticia.imagen)) {
                    embed.setThumbnail(noticia.imagen);
                }

                await channel.send({ embeds: [embed] });
                CONFIG.ultimasNoticias.add(idNoticia);
                console.log(`🎙️ Nueva noticia de doblaje: ${noticia.titulo}`);
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
                        coverImage { large medium }
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
                    formato: media.format,
                    imagen: media.coverImage?.large || media.coverImage?.medium
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
        const response = await axios.get('https://www.reddit.com/r/anime/new/.json?limit=15');
        const noticias = [];

        for (const post of response.data.data.children) {
            const titulo = post.data.title.toLowerCase();
            const keywords = [
                'season 2', 'season 3', 'sequel', 'announced', 'confirmed',
                'leak', 'rumor', 'adaptation', 'trailer', 'release date',
                'anime awards', 'cancel', 'renewed', 'delay'
            ];
            const seriesEspecificas = [
                'roshidere', '100 girlfriends', 'dandadan',
                'spy x family', 'one piece', 'when will her tears dry'
            ];

            if (keywords.some(keyword => titulo.includes(keyword)) ||
                seriesEspecificas.some(serie => titulo.includes(serie))) {
                noticias.push({
                    titulo: post.data.title,
                    url: `https://reddit.com${post.data.permalink}`,
                    subreddit: post.data.subreddit,
                    created: post.data.created_utc,
                    imagen: post.data.url_overridden_by_dest || post.data.thumbnail
                });
            }
        }
        return noticias;
    } catch (error) {
        console.error('Error en Reddit:', error.message);
        return [];
    }
}

async function buscarNoticiasDoblaje() {
    try {
        const subreddits = ['r/animedubs', 'r/anime', 'r/spanishdubs'];
        const noticiasDoblaje = [];
        
        for (const subreddit of subreddits) {
            try {
                const response = await axios.get(`https://www.reddit.com/${subreddit}/new/.json?limit=8`);
                
                for (const post of response.data.data.children) {
                    const titulo = post.data.title.toLowerCase();
                    const keywordsDoblaje = [
                        'dub', 'dubbed', 'doblaje', 'doblado', 'latino', 'español',
                        'castellano', 'voice cast', 'seiyuu', 'english dub',
                        'doblaje mexicano', 'doblaje latino', 'latam dub'
                    ];
                    
                    if (keywordsDoblaje.some(keyword => titulo.includes(keyword))) {
                        noticiasDoblaje.push({
                            titulo: post.data.title,
                            url: `https://reddit.com${post.data.permalink}`,
                            subreddit: post.data.subreddit,
                            created: post.data.created_utc,
                            imagen: post.data.url_overridden_by_dest || post.data.thumbnail
                        });
                    }
                }
            } catch (error) {
                console.error(`Error en subreddit ${subreddit}:`, error.message);
            }
        }
        return noticiasDoblaje;
    } catch (error) {
        console.error('Error buscando noticias de doblaje:', error.message);
        return [];
    }
}

async function buscarInfoAniList(nombreSerie, tipo = null) {
    try {
        const query = `
            query ($search: String, $type: MediaType) {
                Media(search: $search, type: $type) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    type
                    format
                    status
                    description
                    startDate {
                        year
                        month
                        day
                    }
                    endDate {
                        year
                        month
                        day
                    }
                    season
                    episodes
                    chapters
                    volumes
                    duration
                    source
                    genres
                    averageScore
                    popularity
                    trending
                    favourites
                    isAdult
                    siteUrl
                    coverImage {
                        extraLarge
                        large
                        medium
                        color
                    }
                    bannerImage
                    relations {
                        edges {
                            node {
                                title {
                                    romaji
                                    english
                                }
                                type
                                format
                                status
                            }
                            relationType
                        }
                    }
                    nextAiringEpisode {
                        episode
                        airingAt
                    }
                    studios {
                        edges {
                            node {
                                name
                            }
                            isMain
                        }
                    }
                }
            }
        `;

        let media = null;
        
        if (!tipo) {
            const variablesAnime = { search: nombreSerie, type: 'ANIME' };
            const responseAnime = await axios.post('https://graphql.anilist.co', {
                query,
                variables: variablesAnime
            });
            
            if (responseAnime.data.data.Media) {
                media = responseAnime.data.data.Media;
            } else {
                const variablesManga = { search: nombreSerie, type: 'MANGA' };
                const responseManga = await axios.post('https://graphql.anilist.co', {
                    query,
                    variables: variablesManga
                });
                media = responseManga.data.data.Media;
            }
        } else {
            const variables = { search: nombreSerie, type: tipo };
            const response = await axios.post('https://graphql.anilist.co', {
                query,
                variables
            });
            media = response.data.data.Media;
        }

        return { data: { Media: media } };
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
                { name: 'Usuarios Notif.', value: CONFIG.usuariosNotificados.size.toString(), inline: true },
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
        const args = message.content.slice(6).trim();
        if (!args) {
            return message.reply('❌ Uso: `!info Nombre de la serie` o `!info anime/manga Nombre`');
        }

        let tipo = null;
        let nombreSerie = args;
        
        if (args.toLowerCase().startsWith('anime ')) {
            tipo = 'ANIME';
            nombreSerie = args.slice(6);
        } else if (args.toLowerCase().startsWith('manga ')) {
            tipo = 'MANGA';
            nombreSerie = args.slice(6);
        }

        await message.reply(`🔍 Buscando información de **${nombreSerie}**...`);

        const info = await buscarInfoAniList(nombreSerie, tipo);
        if (info && info.data && info.data.Media) {
            const media = info.data.Media;
            const titulo = media.title.romaji || media.title.english || media.title.native || nombreSerie;
            
            const embed = new EmbedBuilder()
                .setTitle(`🎬 ${titulo}`)
                .setColor(media.coverImage?.color || 0xFF6B6B)
                .setURL(media.siteUrl)
                .setDescription(media.description ? 
                    media.description.replace(/<br>/g, '\n').replace(/<[^>]*>/g, '').substring(0, 250) + '...' : 
                    '*Sin descripción disponible*'
                );

            if (media.bannerImage) {
                embed.setImage(media.bannerImage);
            }
            if (media.coverImage?.extraLarge) {
                embed.setThumbnail(media.coverImage.extraLarge);
            }

            const fields = [];
            
            fields.push({ 
                name: '📋 Tipo', 
                value: `${media.type || '?'} • ${media.format || '?'}`, 
                inline: true 
            });
            
            fields.push({ 
                name: '📊 Estado', 
                value: media.status || 'Desconocido', 
                inline: true 
            });
            
            if (media.averageScore) {
                fields.push({ 
                    name: '⭐ Puntuación', 
                    value: `${media.averageScore}/100`, 
                    inline: true 
                });
            }

            if (media.type === 'ANIME') {
                if (media.episodes) {
                    fields.push({ 
                        name: '🎞️ Episodios', 
                        value: media.episodes.toString(), 
                        inline: true 
                    });
                }
                if (media.duration) {
                    fields.push({ 
                        name: '⏱️ Duración', 
                        value: `${media.duration} min`, 
                        inline: true 
                    });
                }
                if (media.nextAiringEpisode) {
                    const fecha = new Date(media.nextAiringEpisode.airingAt * 1000);
                    fields.push({ 
                        name: '🕐 Próximo episodio', 
                        value: `Episodio ${media.nextAiringEpisode.episode}\n<t:${media.nextAiringEpisode.airingAt}:R>`, 
                        inline: true 
                    });
                }
            } else if (media.type === 'MANGA') {
                if (media.chapters) {
                    fields.push({ 
                        name: '📖 Capítulos', 
                        value: media.chapters.toString(), 
                        inline: true 
                    });
                }
                if (media.volumes) {
                    fields.push({ 
                        name: '📚 Volúmenes', 
                        value: media.volumes.toString(), 
                        inline: true 
                    });
                }
            }

            if (media.startDate?.year) {
                const fechaInicio = `${media.startDate.year}-${media.startDate.month || '?'}-${media.startDate.day || '?'}`;
                const fechaFin = media.endDate?.year ? 
                    `${media.endDate.year}-${media.endDate.month || '?'}-${media.endDate.day || '?'}` : 'En emisión';
                
                fields.push({ 
                    name: '📅 Emisión', 
                    value: `${fechaInicio} a ${fechaFin}`, 
                    inline: true 
                });
            }

            if (media.genres && media.genres.length > 0) {
                fields.push({ 
                    name: '🏷️ Géneros', 
                    value: media.genres.slice(0, 3).join(', '), 
                    inline: true 
                });
            }

            if (media.studios?.edges && media.studios.edges.length > 0) {
                const estudios = media.studios.edges
                    .filter(edge => edge.isMain)
                    .map(edge => edge.node.name)
                    .join(', ');
                if (estudios) {
                    fields.push({ 
                        name: '🎨 Estudio', 
                        value: estudios, 
                        inline: true 
                    });
                }
            }

            embed.addFields(fields);
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

            if (media.coverImage?.large) {
                embed.setThumbnail(media.coverImage.large);
            }

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
            if (manga.coverImage?.large) {
                embed.setThumbnail(manga.coverImage.large);
            }
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

    if (message.content === '!notificaciones on') {
        CONFIG.usuariosNotificados.add(message.author.id);
        await message.reply('✅ ¡Ahora recibirás notificaciones de anime!');
    }

    if (message.content === '!notificaciones off') {
        CONFIG.usuariosNotificados.delete(message.author.id);
        await message.reply('❌ Notificaciones desactivadas.');
    }

    if (message.content === '!invitar') {
        const inviteLink = `https://discord.com/oauth2/authorize?client_id=1429393439174664222&scope=bot&permissions=277025770560`;
        await message.reply(`📨 Invita el bot a otros servidores: ${inviteLink}`);
    }

    if (message.content === '!doblajes') {
        await message.reply('🎙️ Buscando noticias de doblajes...');
        const noticiasDoblaje = await buscarNoticiasDoblaje();
        
        if (noticiasDoblaje.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle('🎙️ Últimas Noticias de Doblajes')
                .setColor(0x9B59B6)
                .setDescription(noticiasDoblaje.slice(0, 5).map((noticia, index) => 
                    `${index + 1}. [${noticia.titulo}](${noticia.url})`
                ).join('\n'));
            
            await message.reply({ embeds: [embed] });
        } else {
            await message.reply('❌ No se encontraron noticias de doblajes recientes.');
        }
    }

    if (message.content === '!ayuda' || message.content === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('📖 Comandos Disponibles')
            .setColor(0x3498DB)
            .addFields(
                { 
                    name: '⚙️ Configuración', 
                    value: '`!setup #canal @rol` - Configurar canal y rol\n`!estado` - Ver estado actual' 
                },
                { 
                    name: '🔔 Notificaciones', 
                    value: '`!notificaciones on/off` - Activar/desactivar notificaciones personales' 
                },
                { 
                    name: '📺 Gestión de Series', 
                    value: '`!agregar anime/manga Nombre` - Agregar serie\n`!series` - Ver series seguidas\n`!info [anime/manga] Nombre` - Buscar información' 
                },
                { 
                    name: '🔄 Verificación', 
                    value: '`!forzar_verificacion` - Verificación manual\n`!noticias` - Últimas noticias\n`!doblajes` - Noticias de doblajes' 
                },
                { 
                    name: '🎌 Series Específicas', 
                    value: '`!roshidere` - Info Roshidere\n`!cien_novias` - Info 100 Girlfriends' 
                },
                { 
                    name: '📨 Invitar', 
                    value: '`!invitar` - Link para invitar el bot' 
                }
            )
            .setFooter({ text: 'Monitoreo automático cada 10 minutos • Desarrollado con ❤️' });

        await message.reply({ embeds: [embed] });
    }
});

client.on('guildCreate', async (guild) => {
    try {
        const defaultChannel = guild.systemChannel || guild.channels.cache.find(channel => 
            channel.type === 0 && channel.permissionsFor(guild.members.me).has('SendMessages')
        );
        
        if (defaultChannel) {
            const embed = new EmbedBuilder()
                .setTitle('🎌 ¡Bot de Noticias de Anime Configurado!')
                .setColor(0x00FF00)
                .setDescription('Gracias por agregarme. Aquí están los comandos esenciales:')
                .addFields(
                    { 
                        name: '⚙️ Configuración Básica', 
                        value: '`!setup #canal @rol` - Configurar canal y rol para notificaciones' 
                    },
                    { 
                        name: '🔔 Notificaciones Personales', 
                        value: '`!notificaciones on` - Recibir notificaciones personalmente\n`!notificaciones off` - Desactivar notificaciones' 
                    },
                    { 
                        name: '📺 Agregar Series', 
                        value: '`!agregar anime Nombre Serie` - Seguir nuevo anime\n`!agregar manga Nombre Serie` - Seguir nuevo manga' 
                    },
                    { 
                        name: '🔍 Comandos Útiles', 
                        value: '`!estado` - Ver estado del bot\n`!series` - Ver series seguidas\n`!info [anime/manga] Nombre` - Buscar información\n`!forzar_verificacion` - Verificación manual' 
                    },
                    { 
                        name: '📰 Qué monitorea', 
                        value: '• Nuevos animes anunciados\n• Temporadas 2, 3, etc.\n• Filtraciones y rumores\n• Noticias de doblajes\n• Fechas de estreno\n• Noticias importantes' 
                    }
                )
                .setFooter({ text: 'El bot verificará automáticamente cada 10 minutos' });

            await defaultChannel.send({ embeds: [embed] });
            console.log(`📨 Mensaje de bienvenida enviado a: ${guild.name}`);
        }
    } catch (error) {
        console.error('Error enviando mensaje de bienvenida:', error);
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