Const BASE_URL = 'https://shivraapi.my.id/otd';
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

// STREAMS CRAWLER V4: Mengonversi link download resolusi tinggi menjadi player video internal
function autoDiscoverStreams(obj) {
    let extractedList = [];

    function convertToEmbedUrl(url) {
        if (!url) return '';
        // Mengubah link file cloud biasa menjadi format frame/embed video player
        if (url.includes('acefile.co') && !url.includes('/player/')) {
            return url.replace('acefile.co/f/', 'acefile.co/player/');
        }
        if (url.includes('streamhide.to') && url.includes('/w/')) {
            return url.replace('/w/', '/e/');
        }
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

        // Cari penanda kualitas resolusi yang melekat pada nama objek/array induk
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

                // Eliminasi domain website biasa milik Otakudesu
                const isWebWrapper = url.includes('otakudesu.') || url.includes('localhost');
                
                // Periksa kecocokan penyedia penyimpanan video populer
                const isStreamingProvider = url.includes('desustream') || 
                                            url.includes('streamhide') || 
                                            url.includes('acefile') || 
                                            url.includes('hxfile') || 
                                            url.includes('embed') || 
                                            url.includes('bilibili') ||
                                            url.includes('drive.google') ||
                                            url.includes('archive.org') ||
                                            normalizedParent.includes('stream') ||
                                            normalizedParent.includes('mirror');

                if (isStreamingProvider && !isWebWrapper) {
                    let convertedUrl = convertToEmbedUrl(url);
                    let label = parentKey.replace(/_/g, ' ').replace(/embeds/gi, '').trim();
                    
                    // Gabungkan label penyedia dengan informasi resolusi yang terdeteksi
                    if (currentQuality) {
                        label = `${label} (${currentQuality})`;
                    } else {
                        label = `${label} (HD/Auto)`;
                    }

                    // Hindari memasukkan teks "LINKS" polos
                    if (label.toLowerCase().includes('link')) label = `Server ${currentQuality || 'HD'}`;

                    if (!extractedList.some(item => item.url === convertedUrl)) {
                        extractedList.push({ label: label, url: convertedUrl, quality: currentQuality || '480p' });
                    }
                }
            }
            return;
        }

        if (Array.isArray(current)) {
            current.forEach((item, index) => {
                if (item && typeof item === 'object') {
                    let url = item.link || item.url || item.stream || item.embed || item.src;
                    let rawLabel = item.quality || item.resolution || item.server || item.label || item.name || parentKey;
                    let labelStr = String(rawLabel).toLowerCase();

                    // Buang data resolusi rendah 360p secara paksa untuk menghemat opsi player
                    if (labelStr.includes('360') || item.quality === '360p') return;

                    let detectedQuality = currentQuality;
                    if (labelStr.includes('720') || labelStr.includes('hd')) detectedQuality = '720p';
                    else if (labelStr.includes('480')) detectedQuality = '480p';

                    if (url && typeof url === 'string') {
                        const isWebWrapper = url.includes('otakudesu.') || url.includes('localhost');
                        if (!isWebWrapper) {
                            let convertedUrl = convertToEmbedUrl(url);
                            let displayLabel = item.server || item.name || parentKey || 'Alternatif Server';
                            displayLabel = `${displayLabel} (${detectedQuality || 'HD'})`;

                            if (!extractedList.some(el => el.url === convertedUrl)) {
                                extractedList.push({ label: displayLabel, url: convertedUrl, quality: detectedQuality || '480p' });
                            }
                        }
                    } else {
                        scan(item, `${parentKey}_${index}`, detectedQuality);
                    }
                } else {
                    scan(item, `${parentKey}_${index}`, currentQuality);
                }
            });
            return;
        }

        if (typeof current === 'object') {
            for (let key in current) {
                if (key === 'meta') continue;
                scan(current[key], key, currentQuality);
            }
        }
    }

    scan(obj);

    // SORTING EMAS: Taruh server DEFAULTSTREAMING & Resolusi 720p paling atas agar jadi default player
    extractedList.sort((a, b) => {
        const labelA = String(a.label).toLowerCase();
        const labelB = String(b.label).toLowerCase();
        if (labelA.includes('default')) return -1;
        if (labelB.includes('default')) return 1;
        if (a.quality === '720p' && b.quality !== '720p') return -1;
        if (b.quality === '720p' && a.quality !== '720p') return 1;
        return 0;
    });

    return extractedList;
}

// FUNGSI EKSTRAKSI ARRAY LIST ANIME
function extractAnimeArray(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result;

    if (result.data) {
        if (Array.isArray(result.data)) return result.data;
        if (typeof result.data === 'object') {
            for (let key in result.data) {
                if (Array.isArray(result.data[key])) return result.data[key];
            }
        }
    }
    for (let key in result) {
        if (Array.isArray(result[key])) return result[key];
    }
    return [];
}

// AMANKAN ID/SLUG DARI URL PENUH
function getSlug(path) {
    if (!path) return '';
    let clean = path.toString().trim();
    if (clean.endsWith('/')) {
        clean = clean.slice(0, -1);
    }
    const parts = clean.split('/');
    return parts[parts.length - 1];
}

// 1. Halaman Utama (Home)
async function loadHome() {
    mainContent.innerHTML = '<div class="loading">Memuat Halaman Utama...</div>';
    const result = await fetchData('/home');
    
    if (!result) return;
    console.log("Home Data Sukses:", result); 

    let html = `
        <h2 class="section-title">Update Terbaru / Rekomendasi</h2>
        <div class="anime-grid">
    `;

    const animeList = extractAnimeArray(result);
    
    if (animeList.length === 0) {
        html += `<p class="loading">Tidak ada data anime ditemukan.</p>`;
    } else {
        animeList.forEach(anime => {
            const title = anime.title || findKeyInObject(anime, ['title', 'name']) || 'Tanpa Judul';
            const thumb = anime.thumb || anime.image || findKeyInObject(anime, ['thumb', 'image', 'poster']) || 'https://via.placeholder.com/180x250';
            const status = anime.episode || anime.status || findKeyInObject(anime, ['episode', 'status']) || 'Sub Indo';
            
            const rawId = anime.endpoint || anime.id || anime.url || title;
            const animeId = getSlug(rawId);
            
            html += `
                <div class="anime-card" onclick="loadAnimeDetail('${animeId}')">
                    <img src="${thumb}" alt="${title}">
                    <div class="anime-info">
                        <h3>${title}</h3>
                        <p>${status}</p>
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    mainContent.innerHTML = html;
}

// 2. Halaman Ongoing / Completed
async function loadPage(type, page = 1) {
    mainContent.innerHTML = `<div class="loading">Memuat daftar ${type}...</div>`;
    const result = await fetchData(`/${type}?page=${page}`);
    
    if (!result) return;
    console.log(`${type} Data Sukses:`, result);

    let html = `
        <h2 class="section-title">Anime ${type} - Halaman ${page}</h2>
        <div class="anime-grid">
    `;

    const animeList = extractAnimeArray(result);
    
    if (animeList.length === 0) {
        html += `<p class="loading">Tidak ada data ditemukan.</p>`;
    } else {
        animeList.forEach(anime => {
            const title = anime.title || findKeyInObject(anime, ['title', 'name']) || 'Tanpa Judul';
            const thumb = anime.thumb || anime.image || findKeyInObject(anime, ['thumb', 'image', 'poster']) || 'https://via.placeholder.com/180x250';
            const status = anime.episode || anime.status || findKeyInObject(anime, ['episode', 'status']) || '';
            
            const rawId = anime.endpoint || anime.id || anime.url;
            const animeId = getSlug(rawId);
            
            html += `
                <div class="anime-card" onclick="loadAnimeDetail('${animeId}')">
                    <img src="${thumb}" alt="${title}">
                    <div class="anime-info">
                        <h3>${title}</h3>
                        <p>${status}</p>
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    mainContent.innerHTML = html;
}

// 3. Halaman Detail Anime
async function loadAnimeDetail(animeId) {
    mainContent.innerHTML = '<div class="loading">Memuat Detail Anime...</div>';
    
    const cleanId = getSlug(animeId);
    const result = await fetchData(`/anime/${cleanId}`);
    
    if (!result) return;
    console.log("Detail Data Sukses:", result);

    const title = findKeyInObject(result, ['title', 'anime_name', 'name']) || 'Judul Tidak Tersedia';
    const thumb = findKeyInObject(result, ['thumb', 'image', 'poster', 'cover']) || 'https://via.placeholder.com/250x350';
    const status = findKeyInObject(result, ['status', 'condition', 'score']) || '-';
    const genres = findKeyInObject(result, ['genres', 'genre', 'type']) || '-';
    const synopsis = findKeyInObject(result, ['synopsis', 'sinopsis', 'description', 'desc']) || 'Tidak ada sinopsis untuk anime ini.';
    const episodes = findKeyInObject(result, ['episode_list', 'episodes', 'episodeList', 'list']) || [];

    let html = `
        <div class="detail-container">
            <img class="detail-img" src="${thumb}" alt="${title}">
            <div class="detail-info">
                <h2>${title}</h2>
                <p><strong>Status:</strong> ${status}</p>
                <p><strong>Genre:</strong> ${genres}</p>
                <p style="margin-top:15px; color: var(--text-muted); line-height: 1.6;">${synopsis}</p>
            </div>
        </div>
        
        <h3 class="section-title">Daftar Episode</h3>
        <div class="episode-list">
    `;

    if (episodes.length === 0) {
        html += `<p>Episode belum tersedia atau silakan periksa sistem batch.</p>`;
    } else {
        episodes.forEach(ep => {
            const rawEpId = ep.endpoint || ep.id || ep.url;
            const epId = getSlug(rawEpId);
            const epTitle = ep.title || ep.name || 'Episode';
            html += `
                <a href="#" class="ep-btn" title="${epTitle}" onclick="loadEpisode('${epId}')">${epTitle}</a>
            `;
        });
    }

    html += `</div>`;
    mainContent.innerHTML = html;
}

// 4. Player Video Streaming Steril (Prioritas 720p / 480p)
async function loadEpisode(epId) {
    mainContent.innerHTML = '<div class="loading">Memuat Video Player...</div>';
    
    const cleanEpId = getSlug(epId);
    const result = await fetchData(`/episode/${cleanEpId}`);
    
    if (!result) return;
    console.log("Episode Data Terurai:", result);

    // Jalankan Engine Penyaring V4 Resolusi Tinggi
    const streamList = autoDiscoverStreams(result);
    console.log("Hasil Filter Server Player HD:", streamList);

    const epTitle = findKeyInObject(result, ['title', 'episode_name']) || 'Streaming Player';
    
    // Pilih server terbaik urutan pertama (Default Streaming atau Server Berresolusi 720p)
    const defaultSrc = streamList.length > 0 ? streamList[0].url : '';

    let html = `
        <h2 class="section-title">${epTitle}</h2>
        <div class="video-container">
            ${defaultSrc ? `<iframe id="videoPlayer" src="${defaultSrc}" allowfullscreen></iframe>` : '<div class="loading">Maaf, tautan video berkualitas tinggi gagal diekstraksi otomatis.</div>'}
        </div>
    `;

    // Tampilkan pilihan tombol alternatif server berresolusi tinggi yang valid
    if (streamList.length > 0) {
        html += `
            <h3 style="margin: 15px 0 10px 0; font-size: 15px; color: var(--text-muted)">Pilihan Kualitas / Alternatif Server HD:</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 25px;">
        `;
        streamList.forEach((stream, index) => {
            html += `
                <button class="ep-btn" style="background: ${index === 0 ? 'var(--accent-color)' : '#2a2a2a'}; border: none; cursor: pointer; padding: 10px 18px; font-weight: bold; text-transform: uppercase;" 
                        onclick="changeServer(this, '${stream.url}')">
                    ${stream.label}
                </button>
            `;
        });
        html += `</div>`;
    }

    html += `<button class="back-btn" onclick="loadHome()">Kembali ke Beranda</button>`;
    mainContent.innerHTML = html;
}

// NAVIGASI PEMILIHAN SERVER PLAYER
window.changeServer = function(btn, url) {
    const player = document.getElementById('videoPlayer');
    if (player) {
        player.src = url;
        const buttons = btn.parentElement.querySelectorAll('button');
        buttons.forEach(b => b.style.background = '#2a2a2a');
        btn.style.background = 'var(--accent-color)';
    }
}

// 5. Fitur Pencarian (Search)
async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    mainContent.innerHTML = `<div class="loading">Mencari anime "${query}"...</div>`;
    const result = await fetchData(`/search?q=${encodeURIComponent(query)}`);
    
    if (!result) return;

    let html = `
        <h2 class="section-title">Hasil Pencarian: "${query}"</h2>
        <div class="anime-grid">
    `;

    const searchResult = extractAnimeArray(result);
    if (searchResult.length === 0) {
        html += `<p class="loading">Anime yang Anda cari tidak ditemukan.</p>`;
    } else {
        searchResult.forEach(anime => {
            const title = anime.title || findKeyInObject(anime, ['title', 'name']) || 'Tanpa Judul';
            const thumb = anime.thumb || anime.image || findKeyInObject(anime, ['thumb', 'image', 'poster']) || 'https://via.placeholder.com/180x250';
            
            const rawId = anime.endpoint || anime.id || anime.url;
            const animeId = getSlug(rawId);
            
            html += `
                <div class="anime-card" onclick="loadAnimeDetail('${animeId}')">
                    <img src="${thumb}" alt="${title}">
                    <div class="anime-info">
                        <h3>${title}</h3>
                        <p>${anime.status || 'Detail'}</p>
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    mainContent.innerHTML = html;
}

document.getElementById('searchInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

window.onload = loadHome;
            
