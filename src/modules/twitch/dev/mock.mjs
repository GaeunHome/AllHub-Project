// 假的 Twitch API 與圖片 CDN；login 是 nobody 時查無此人；假 id 是奇數的主播正在直播（alice 是 1035），偶數的離線，離線且 id 是 4 的倍數的有離線橫幅
let subscriptionSeq = 0;
/** 用帳號查過的 id → 帳號，頭像上的字才對得上；假伺服器重開後查不到就用 id */
const loginOf = new Map();

const CDN = "https://static-cdn.jtvnw.net";
const GAMES = [
  { id: "1351906", name: "Honkai: Star Rail" },
  { id: "509658", name: "Just Chatting" },
];

const isLive = (id) => Number(id) % 2 === 1;
const gameOf = (id) => GAMES[Math.floor(Number(id) / 2) % GAMES.length];

function user(id, login) {
  const name = login ?? loginOf.get(id) ?? `u${id}`;
  return {
    id,
    login: name,
    display_name: name.toUpperCase(),
    profile_image_url: `${CDN}/jtv_user_pictures/mock-${name}-profile_image-300x300.png`,
    offline_image_url: !isLive(id) && Number(id) % 4 === 0 ? `${CDN}/jtv_user_pictures/mock-${name}-channel_offline_image-1920x1080.png` : "",
  };
}

export function handle({ req, url, body, json, image }) {
  if (url.pathname === "/oauth2/token") return json(200, { access_token: "mock-token", expires_in: 3600, token_type: "bearer" });
  if (url.pathname === "/helix/users") {
    const logins = url.searchParams.getAll("login").filter((l) => l !== "nobody");
    const byLogin = logins.map((login, i) => {
      const id = String(1000 + login.length * 7 + i);
      loginOf.set(id, login);
      return user(id, login);
    });
    return json(200, { data: [...byLogin, ...url.searchParams.getAll("id").map((id) => user(id))] });
  }
  if (url.pathname === "/helix/streams") {
    const startedAt = new Date(Date.now() - 95 * 60_000).toISOString();
    return json(200, {
      data: url.searchParams
        .getAll("user_id")
        .filter(isLive)
        .map((id) => {
          const login = loginOf.get(id) ?? `u${id}`;
          const game = gameOf(id);
          return {
            id: `stream-${id}`,
            user_id: id,
            user_login: login,
            user_name: login.toUpperCase(),
            game_id: game.id,
            game_name: game.name,
            type: "live",
            title: "模擬直播標題",
            viewer_count: Number(id) * 3 + 17,
            started_at: startedAt,
            thumbnail_url: `${CDN}/previews-ttv/live_user_${login}-{width}x{height}.jpg`,
          };
        }),
    });
  }
  if (url.pathname === "/helix/games") {
    return json(200, { data: GAMES.filter((g) => url.searchParams.getAll("id").includes(g.id)).map((g) => ({ ...g, box_art_url: `${CDN}/ttv-boxart/${g.id}-{width}x{height}.jpg` })) });
  }
  if (url.pathname === "/helix/eventsub/subscriptions") {
    if (req.method === "POST") {
      const sub = JSON.parse(body);
      return json(202, { data: [{ id: `mock-sub-${++subscriptionSeq}`, status: "webhook_callback_verification_pending", ...sub, created_at: new Date().toISOString(), cost: 0 }], total: 1, total_cost: 0, max_total_cost: 10000 });
    }
    if (req.method === "DELETE") return json(204);
    return json(200, { data: [], total: 0, total_cost: 0, max_total_cost: 10000, pagination: {} });
  }

  // ---------- 圖片 CDN（static-cdn.jtvnw.net） ----------
  if (url.pathname.startsWith("/jtv_user_pictures/")) {
    const name = /mock-(.+?)-(profile_image|channel_offline_image)/.exec(url.pathname);
    if (name?.[2] === "channel_offline_image") return image(`${name[1]} OFFLINE`, { width: 960, height: 540 });
    return image((name?.[1] ?? "?").slice(0, 2).toUpperCase(), { width: 300, height: 300 });
  }
  if (url.pathname.startsWith("/previews-ttv/")) {
    const login = /live_user_(.+?)-\d+x\d+/.exec(url.pathname)?.[1] ?? "?";
    return image(`LIVE ${login}`, { width: 640, height: 360 });
  }
  if (url.pathname.startsWith("/ttv-boxart/")) {
    const game = GAMES.find((g) => url.pathname.startsWith(`/ttv-boxart/${g.id}-`));
    return image(game ? game.name.slice(0, 2) : "?", { width: 72, height: 96 });
  }
  return false;
}
