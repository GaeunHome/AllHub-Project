// 假的 Twitch API；login 是 nobody 時查無此人
let subscriptionSeq = 0;

export function handle({ req, url, body, json }) {
  if (url.pathname === "/oauth2/token") return json(200, { access_token: "mock-token", expires_in: 3600, token_type: "bearer" });
  if (url.pathname === "/helix/users") {
    const logins = url.searchParams.getAll("login").filter((l) => l !== "nobody");
    return json(200, {
      data: logins.map((login, i) => ({ id: String(1000 + login.length * 7 + i), login, display_name: login.toUpperCase(), profile_image_url: "" })),
    });
  }
  if (url.pathname === "/helix/streams") {
    return json(200, {
      data: url.searchParams.getAll("user_id").map((id) => ({ user_id: id, title: "模擬直播標題", game_name: "Honkai: Star Rail", started_at: new Date().toISOString() })),
    });
  }
  if (url.pathname === "/helix/eventsub/subscriptions") {
    if (req.method === "POST") {
      const sub = JSON.parse(body);
      return json(202, { data: [{ id: `mock-sub-${++subscriptionSeq}`, status: "webhook_callback_verification_pending", ...sub, created_at: new Date().toISOString(), cost: 0 }], total: 1, total_cost: 0, max_total_cost: 10000 });
    }
    if (req.method === "DELETE") return json(204);
    return json(200, { data: [], total: 0, total_cost: 0, max_total_cost: 10000, pagination: {} });
  }
  return false;
}
