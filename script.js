const BASE_URL = 'https://shivraapi.my.id/otd';
const mainContent = document.getElementById('main-content');

// FUNGSI FETCH API (ANTI-CORS PROXY FALLBACK)
async function fetchData(endpoint) {
    const primaryUrl = `${BASE_URL}${endpoint}`;
    try {
        const response = await fetch(primaryUrl);
        if (!response.ok) throw new Error('Direct fetch failed');
        return await response.json();
    } catch (error) {
        console.warn(`[Jalur Alternatif] Mengalihkan lewat Proxy untuk: ${endpoint}`);
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(primaryUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('Proxy fetch failed');
            return await response.json();
        } catch (proxyError) {
            console.error('Semua jalur fetch gagal:', proxyError);
            mainContent.innerHTML = `<p class="loading">Gagal memuat data. Server API sedang sibuk.</p>`;
            return null;
        }
    }
}

// FUNGSI PENCARI PINTAR DI DALAM OBJEK JSON
function findKeyInObject(obj, targetKeys) {
    if (!obj || typeof obj !== 'object') return null;
    
    for (let key of targetKeys) {
        if (obj[key] !== undefined && obj[key] !== null) {
            return obj[key];
        }
    }
    
    if (obj.data && typeof obj.data === 'object') {
        const found = findKeyInObject(obj.data, targetKeys);
        if (found) return found;
    }
    
    for (let key in obj) {
        if (obj[key] && typeof obj[key] === 'object' && key !== 'meta') {
            const found = findKeyInObject(obj[key], targetKeys);
            if (found) return found;
        }
    }
    return null;
}

// STREAMS CRAWLER V4
function autoDiscoverStreams(obj) {
    let extractedList = [];
    function convertToEmbedUrl(url) {
        if (!url) return '';
        if (url.includes('acefile.co') && !url.includes('/player/')) return url.replace('acefile.co/f/', 'acefile.co/player/');
        if (url.includes('streamhide.to') && url.includes('/w/')) return url.replace('/w/', '/e/');
        if (url.includes('hxfile.co') && !url.includes('/embed-')) {
            const parts = url.split('/');
            const id = parts[parts.length - 1];
            if (id) return `https://hxfile.co/embed-${id}.html`;
        }
        return url;
    }

    function scan(current, parentKey = '', qualityContext = '') {
        if (!current) return;
        const normalizedParent = parentKey.toLowerCase();
        let currentQuality = qualityContext;
        if (normalizedParent.includes('720') || normalizedParent.includes('hd')) currentQuality = '720p';
        else if (normalizedParent.includes('480') || normalizedParent.includes('sd')) currentQuality = '480p';
        else if (normalizedParent.includes('360')) currentQuality = '360p';

        if (typeof current === 'string') {
            if (current.startsWith('http') || current.startsWith('//') || current.startsWith('<iframe')) {
                let url = current;
                if (current.startsWith('<iframe')) {
                    const match = current.match(/src=["']([^"']+)["']/);
                    if (match) url = match[1];
                }
                const isWebWrapper = url.includes('otakudesu.') || url.includes('localhost');
                const isStreamingProvider = url.includes('desustream') || url.includes('streamhide') || url.includes('acefile') || url.includes('hxfile') || url.includes('embed') || url.includes('bilibili') || url.includes('drive.google') || url.includes('archive.org') || normalizedParent.includes('stream') || normalizedParent.includes('mirror');
                if (isStreamingProvider && !isWebWrapper) {
                    let convertedUrl = convertToEmbedUrl(url);
                    let label = parentKey.replace(/_/g, ' ').replace(/embeds/gi, '').trim();
                    if (label.toLowerCase().includes('link')) label = `Server ${currentQuality || 'HD'}`;
                    if (!extractedList.some(item => item.url === convertedUrl)) {
                        extractedList.push({ label: `${label} (${currentQuality || 'HD'})`, url: convertedUrl, quality: currentQuality || '480p' });
                    }
                }
            }
        } else if (Array.isArray(current)) {
            current.forEach((item, index) => {
                if (item && typeof item === 'object') {
                    let url = item.link || item.url || item.stream || item.embed || item.src;
                    if (url && typeof url === 'string' && !url.includes('otakudesu.')) {
                        extractedList.push({ label: (item.server || item.name || 'Server') + ' (HD)', url: convertToEmbedUrl(url), quality: '480p' });
                    } else { scan(item, `${parentKey}_${index}`, currentQuality); }
                } else { scan(item, `${parentKey}_${index}`, currentQuality); }
            });
        } else if (typeof current === 'object') {
            for (let key in current) { if (key !== 'meta') scan(current[key], key, currentQuality); }
        }
    }
    scan(obj);
    return extractedList;
}

function extractAnimeArray(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (result.data) {
        if (Array.isArray(result.data)) return result.data;
        if (typeof result.data === 'object') {
            for (let key in result.data) if (Array.isArray(result.data[key])) return result.data[key];
        }
    }
    for (let key in result) if (Array.isArray(result[key])) return result[key];
    return [];
}

function getSlug(path) {
    if (!path) return '';
    let clean = path.toString().trim();
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    const parts = clean.split('/');
    return parts[parts.length - 1];
}

async function loadHome() {
    mainContent.innerHTML = '<div class="loading">Memuat Halaman Utama...</div>';
    const result = await fetchData('/home');
    if (!result) return;
    let html = `<h2 class="section-title">Update Terbaru</h2><div class="anime-grid">`;
    const animeList = extractAnimeArray(result);
    animeList.forEach(anime => {
        const title = anime.title || findKeyInObject(anime, ['title', 'name']) || 'Tanpa Judul';
        const thumb = anime.thumb || anime.image || findKeyInObject(anime, ['thumb', 'image', 'poster']) || 'https://via.placeholder.com/180x250';
        html += `<div class="anime-card" onclick="loadAnimeDetail('${getSlug(anime.endpoint || anime.id || anime.url)}')"><img src="${thumb}"><div class="anime-info"><h3>${title}</h3></div></div>`;
    });
    mainContent.innerHTML = html + `</div>`;
}

async function loadAnimeDetail(animeId) {
    mainContent.innerHTML = '<div class="loading">Memuat Detail...</div>';
    const result = await fetchData(`/anime/${getSlug(animeId)}`);
    if (!result) return;
    const title = findKeyInObject(result, ['title', 'anime_name', 'name']);
    const episodes = findKeyInObject(result, ['episode_list', 'episodes', 'episodeList', 'list']) || [];
    let html = `<h2>${title}</h2><h3 class="section-title">Daftar Episode</h3><div class="episode-list">`;
    episodes.forEach(ep => {
        const epId = getSlug(ep.endpoint || ep.id || ep.url);
        // MENGIRIM DATA EPISODES KE FUNGSI LOADE PISODE
        html += `<a href="#" class="ep-btn" onclick="loadEpisode('${epId}', ${JSON.stringify(episodes).replace(/"/g, "'")})">${ep.title || 'Ep'}</a>`;
    });
    mainContent.innerHTML = html + `</div>`;
}

// 4. PLAYER DENGAN NAVIGASI NEXT/PREV
async function loadEpisode(epId, episodeList = null) {
    mainContent.innerHTML = '<div class="loading">Memuat Player...</div>';
    const result = await fetchData(`/episode/${getSlug(epId)}`);
    if (!result) return;

    let navHtml = '';
    if (episodeList) {
        const idx = episodeList.findIndex(e => getSlug(e.endpoint || e.url || e.id) === getSlug(epId));
        navHtml = `
            <div style="margin-bottom:20px; display:flex; gap:10px;">
                <button class="back-btn" ${idx <= 0 ? 'disabled style="background:#444"' : `onclick="loadEpisode('${getSlug(episodeList[idx-1].endpoint)}', ${JSON.stringify(episodeList).replace(/"/g, "'")})"`}>Prev</button>
                <button class="back-btn" ${idx >= episodeList.length - 1 ? 'disabled style="background:#444"' : `onclick="loadEpisode('${getSlug(episodeList[idx+1].endpoint)}', ${JSON.stringify(episodeList).replace(/"/g, "'")})"`}>Next</button>
            </div>`;
    }

    const streams = autoDiscoverStreams(result);
    const html = `<h2>${findKeyInObject(result, ['title'])}</h2>${navHtml}<div class="video-container"><iframe id="videoPlayer" src="${streams[0]?.url || ''}"></iframe></div>`;
    mainContent.innerHTML = html;
}

window.onload = loadHome;
