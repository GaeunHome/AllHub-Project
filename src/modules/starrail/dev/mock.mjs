// 假的 HoYoLAB API；含 ltoken_v2、ltuid_v2 的 cookie 都能連結，ltoken_v2=expired 會回 cookie 失效
const signedUids = new Set();

const ok = (data) => ({ retcode: 0, message: "OK", data });
const expired = { retcode: -100, message: "Please login", data: null };

export function handle({ req, url, json }) {
  const cookie = req.headers.cookie ?? "";
  const isExpired = cookie.includes("ltoken_v2=expired");
  if (url.pathname === "/account/binding/api/getUserGameRolesByCookie") {
    if (isExpired) return json(200, expired);
    return json(200, ok({ list: [{ game_biz: "hkrpg_global", region: "prod_official_cht", game_uid: "900000001", nickname: "開拓者", level: 70, region_name: "TW/HK/MO" }] }));
  }
  if (url.pathname === "/game_record/hkrpg/api/note") {
    if (isExpired) return json(200, expired);
    return json(200, ok({ current_stamina: 231, max_stamina: 300, stamina_recover_time: 22080, current_reserve_stamina: 1200, accepted_epedition_num: 4, total_expedition_num: 4, expeditions: [], current_train_score: 300, max_train_score: 500, current_rogue_score: 8000, max_rogue_score: 14000, weekly_cocoon_cnt: 2, weekly_cocoon_limit: 3 }));
  }
  if (url.pathname === "/event/luna/os/info") {
    const uid = /ltuid_v2=(\d+)/.exec(cookie)?.[1] ?? "?";
    return json(200, ok({ total_sign_day: signedUids.has(uid) ? 8 : 7, is_sign: signedUids.has(uid) }));
  }
  if (url.pathname === "/event/luna/os/sign") {
    if (isExpired) return json(200, expired);
    const uid = /ltuid_v2=(\d+)/.exec(cookie)?.[1] ?? "?";
    if (signedUids.has(uid)) return json(200, { retcode: -5003, message: "Traveler, you've already checked in today~", data: null });
    signedUids.add(uid);
    return json(200, ok({ code: "ok", gt_result: { risk_code: 0, gt: "", challenge: "", success: 0, is_risk: false } }));
  }
  return false;
}
