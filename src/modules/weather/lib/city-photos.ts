// 天氣頁大圖的照片 一個地點一張 跟天氣無關 來源與授權寫在 public/images/cities/LICENSE.md

export type CityPhoto = { src: string; author: string; license: string };

const photo = (file: string, author: string, license: string): CityPhoto => ({ src: `/images/cities/${file}.webp`, author, license });

const PHOTOS: Record<string, CityPhoto> = {
  臺北市: photo("taipei", "Mondoman712", "CC BY-SA 4.0"),
  新北市: photo("new-taipei", "Li Hua-hsuan", "CC0"),
  基隆市: photo("keelung", "Supanut Arunoprayote", "CC BY 4.0"),
  桃園市: photo("taoyuan", "Ken Marshall", "CC BY 2.0"),
  新竹市: photo("hsinchu-city", "Suicasmo", "CC BY-SA 4.0"),
  新竹縣: photo("hsinchu-county", "lienyuan lee", "CC BY 3.0"),
  苗栗縣: photo("miaoli", "Mk2010", "CC BY-SA 4.0"),
  臺中市: photo("taichung", "Nico Kaiser", "CC BY 2.0"),
  彰化縣: photo("changhua", "Bpp88520", "CC0"),
  南投縣: photo("nantou", "Photnart", "CC BY-SA 4.0"),
  雲林縣: photo("yunlin", "阿道", "CC BY-SA 4.0"),
  嘉義市: photo("chiayi-city", "Blowing Puffer Fish", "CC BY 2.0"),
  嘉義縣: photo("chiayi-county", "Felix Filnkoessl", "CC BY-SA 2.0"),
  臺南市: photo("tainan", "xiquinhosilva", "CC BY 2.0"),
  高雄市: photo("kaohsiung", "Balon Greyjoy", "CC0"),
  屏東縣: photo("pingtung", "CEphoto, Uwe Aranas", "CC BY-SA 3.0"),
  宜蘭縣: photo("yilan", "Junyu-K", "CC BY-SA 4.0"),
  花蓮縣: photo("hualien", "Balon Greyjoy", "CC0"),
  臺東縣: photo("taitung", "Alan Wu", "CC BY-SA 2.0"),
  澎湖縣: photo("penghu", "LinChunShan", "CC BY-SA 4.0"),
  金門縣: photo("kinmen", "姜明雄", "CC0"),
  連江縣: photo("lienchiang", "lienyuan lee", "CC BY 3.0"),
  東京: photo("tokyo", "David Kernan", "CC BY 4.0"),
  大阪: photo("osaka", "663highland", "CC BY 2.5"),
  京都: photo("kyoto", "Basile Morin", "CC BY-SA 4.0"),
  札幌: photo("sapporo", "redlegsfan21", "CC BY-SA 2.0"),
  福岡: photo("fukuoka", "Hhcp.0.5.8", "CC BY-SA 3.0"),
  "沖繩（那霸）": photo("okinawa", "663highland", "CC BY 2.5"),
  首爾: photo("seoul", "Frank Schulenburg", "CC BY-SA 4.0"),
  釜山: photo("busan", "Glabb", "公有領域"),
  濟州: photo("jeju", "Bernard Gagnon", "CC0"),
  香港: photo("hong-kong", "Gagan deep Singh", "公有領域"),
  澳門: photo("macau", "Ank Kumar", "CC BY-SA 4.0"),
  新加坡: photo("singapore", "Adam Wilson", "CC0"),
  曼谷: photo("bangkok", "Vyacheslav Argenberg", "CC BY 4.0"),
  吉隆坡: photo("kuala-lumpur", "CEphoto, Uwe Aranas", "CC BY-SA 3.0"),
  河內: photo("hanoi", "P. Hughes", "CC BY 4.0"),
  胡志明市: photo("ho-chi-minh-city", "Pimnl", "CC0"),
  峇里島: photo("bali", "Zexsen Xie", "CC BY 2.0"),
  雪梨: photo("sydney", "Christian Mehlführer", "CC BY 2.5"),
  倫敦: photo("london", "Colin / Wikimedia Commons", "CC BY-SA 4.0"),
  巴黎: photo("paris", "Jeremy Segrott", "CC BY 2.0"),
  紐約: photo("new-york", "Jakub Hałun", "CC BY 4.0"),
  洛杉磯: photo("los-angeles", "Mike Peel (www.mikepeel.net)", "CC BY-SA 4.0"),
};

/** 清單以外的舊城市回 null 名稱來自資料庫 物件內建的名稱不算 */
export const cityPhoto = (name: string): CityPhoto | null => (Object.hasOwn(PHOTOS, name) ? PHOTOS[name] : null);

/** CC BY 與 CC BY-SA 要標示作者 寫在天氣頁的 i 圓圈 */
export const photoCredit = ({ author, license }: CityPhoto): string => `照片：${author}（${license}）`;
