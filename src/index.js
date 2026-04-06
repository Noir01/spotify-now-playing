// src/index.ts
var index_default = {
  async fetch(_request, env, _ctx) {
    if (_request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const NOW_PLAYING_KEY  = "NOW_PLAYING";
    try {
      const cached = await env.SONG_CACHE.get(NOW_PLAYING_KEY);
      if (cached) {
        return new Response(cached, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      const ACCESS_TOKEN_KEY = "SPOTIFY_AT";
  
      const refreshAccessToken = async () => {
        const params = new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: env.SPOTIFY_REFRESH_TOKEN,
        });
        const basic = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  
        const res = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        });
        if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);
  
        const json = await res.json();
        const token = json.access_token;
        const ttl = Math.max((json.expires_in ?? 3600) - 60, 60);
        await env.SONG_CACHE.put(ACCESS_TOKEN_KEY, token, { expirationTtl: ttl });
        return token;
      };
  
      const getAccessToken = async () => {
        const cached = await env.SONG_CACHE.get(ACCESS_TOKEN_KEY);
        if (cached) return cached;
        if (env.SPOTIFY_ACCESS_TOKEN) return env.SPOTIFY_ACCESS_TOKEN;
        return await refreshAccessToken();
      };
  
      const fetchCurrentlyPlaying = async (token) => {
        return await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      };

      let token = await getAccessToken();

      let res = await fetchCurrentlyPlaying(token);

      if (res.status === 401) {
        token = await refreshAccessToken();
        res = await fetchCurrentlyPlaying(token);
      }

      if (res.status === 204) {
        const payload = JSON.stringify({ playing: false });
        await env.SONG_CACHE.put(NOW_PLAYING_KEY, payload, { expirationTtl: 60 });
        return new Response(payload, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);

      const data = await res.json();
      const track = data.item;

      const payload = JSON.stringify({
        song: track?.name ?? null,
        artist: track?.artists?.map((a) => a.name).join(", ") ?? null,
        album: track?.album?.name ?? null,
        album_art: track?.album?.images?.[0]?.url ?? null,
        url: track?.external_urls?.spotify ?? null,
        playing: data.is_playing === true,
      });

      await env.SONG_CACHE.put(NOW_PLAYING_KEY, payload, { expirationTtl: 300 });

      return new Response(payload, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    } catch (err) {
      console.error("Worker error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      return new Response(msg, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
