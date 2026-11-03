/** Hazır ret sebepleri: kasa kiosku ve garson kuyruğu aynı listeyi kullanır. */
export const ORDER_REJECT_REASONS = [
  "Ürün tükendi / stok yok",
  "Mutfak aşırı yoğun",
  "Misafir iptali",
  "Masa hesabı kapandı",
  "Hatalı sipariş",
] as const;

/** Siparişi kasadan iptal ederken önerilen sebepler. */
export const ORDER_CANCEL_REASONS = [
  "Misafir vazgeçti",
  "Hatalı sipariş",
  "Ürün tükendi / stok yok",
  "Masa hesabı kapandı",
] as const;

/** İstemci tarafı alt sınır; sunucu VALIDATION'ı ayrıca geçerlidir. */
export const REASON_MIN_LENGTH = 3;
