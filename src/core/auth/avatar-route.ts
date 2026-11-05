import "server-only";
import { USER_ID_PATTERN } from "../ids";
import { currentSession } from "./index";
import { readAvatarImage } from "./users";

// 只有登入的人看得到 換照片時 id 會換 同一個網址的內容永遠不變 可以長期快取

const headers = {
  "Content-Type": "image/jpeg",
  "Cache-Control": "private, max-age=31536000, immutable",
  // 內容是使用者上傳的 瀏覽器不能自己猜類型 也不能當成網頁執行
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!(await currentSession())) return new Response(null, { status: 401 });
  const { id } = await params;
  const image = USER_ID_PATTERN.test(id) ? await readAvatarImage(id) : null;
  return image ? new Response(new Uint8Array(image), { headers }) : new Response(null, { status: 404 });
}
