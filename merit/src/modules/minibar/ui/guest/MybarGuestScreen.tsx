"use client";

import { useEffect, useState } from "react";

interface MybarProduct {
  id: string;
  name: string;
  unit: string;
  groupName: string;
}

interface MybarGuestScreenProps {
  roomId: string;
  hotelId: string;
  roomNumber?: string;
  hotelName?: string;
  token?: string;
}

type LangCode = "tr" | "en" | "de" | "ru" | "ar";

const I18N = {
  tr: {
    title: "MYBAR",
    subtitle: (hotel: string) =>
      `${hotel} Minibar talebiniz en kısa sürede yerine getirilecektir. Lütfen minibarınızda olmasını istediğiniz ürünleri adetleriyle beraber işaretleyiniz.`,
    room: "Oda",
    all: "Tümü",
    selectedSummary: "Seçilen Ürünler",
    emptySelection: "Henüz bir ürün seçmediniz.",
    noteLabel: "Ek Notunuz veya Özel İstekleriniz",
    notePlaceholder: "İstediğiniz dilde yazabilirsiniz (örn: Ekstra bardak, bol buz rica ediyoruz...)",
    submitBtn: "MYBAR TALEBİ GÖNDER",
    submitting: "Talebiniz İletiliyor...",
    successTitle: "Talebiniz Alınmıştır!",
    successDesc: "Kat görevlilerimiz en kısa sürede minibarınızı hazırlayacaktır. İyi tatiller dileriz.",
    alreadyTitle: "Gününüzün Talebi Alınmıştır",
    alreadyDesc: "Odanız için bugünkü MyBar talebiniz zaten sistemimize iletildi ve hazırlanmaktadır. Günde maksimum 1 talep iletilebilir.",
    selectAtLeastOne: "Lütfen en az bir ürün seçiniz.",
    error: "Talep gönderilirken hata oluştu.",
  },
  en: {
    title: "MYBAR",
    subtitle: (hotel: string) =>
      `Your ${hotel} Minibar request will be fulfilled as soon as possible. Please select the items you wish to have in your minibar along with their quantities.`,
    room: "Room",
    all: "All",
    selectedSummary: "Selected Items",
    emptySelection: "You haven't selected any items yet.",
    noteLabel: "Additional Notes or Special Requests",
    notePlaceholder: "You may write in your language (e.g. Extra ice, extra glasses please...)",
    submitBtn: "SUBMIT MYBAR REQUEST",
    submitting: "Submitting Request...",
    successTitle: "Request Received!",
    successDesc: "Our floor team will prepare your minibar as soon as possible. We wish you a wonderful stay.",
    alreadyTitle: "Today's Request Already Received",
    alreadyDesc: "Your MyBar request for today has already been received and is being prepared. Max 1 request per day.",
    selectAtLeastOne: "Please select at least one item.",
    error: "Error submitting request.",
  },
  de: {
    title: "MYBAR",
    subtitle: (hotel: string) =>
      `Ihre Minibar-Bestellung im ${hotel} wird schnellstmöglich ausgeführt. Bitte wählen Sie die gewünschten Artikel mit Stückzahlen aus.`,
    room: "Zimmer",
    all: "Alle",
    selectedSummary: "Ausgewählte Artikel",
    emptySelection: "Sie haben noch keine Artikel ausgewählt.",
    noteLabel: "Zusätzliche Notizen oder Wünsche",
    notePlaceholder: "In Ihrer Sprache schreiben (z.B. Mehr Eis, extra Gläser...)",
    submitBtn: "MYBAR-ANFRAGE SENDEN",
    submitting: "Wird gesendet...",
    successTitle: "Anfrage Erhalten!",
    successDesc: "Unser Etagenteam wird Ihre Minibar schnellstmöglich vorbereiten.",
    alreadyTitle: "Heutige Anfrage Bereits Erhalten",
    alreadyDesc: "Ihre heutige MyBar-Anfrage wurde bereits übermittelt. Maximal 1 Anfrage pro Tag.",
    selectAtLeastOne: "Bitte wählen Sie mindestens einen Artikel.",
    error: "Fehler beim Senden der Anfrage.",
  },
  ru: {
    title: "MYBAR",
    subtitle: (hotel: string) =>
      `Ваш запрос на мини-бар в ${hotel} будет выполнен в кратчайшие сроки. Пожалуйста, укажите желаемые товары и их количество.`,
    room: "Номер",
    all: "Все",
    selectedSummary: "Выбранные товары",
    emptySelection: "Вы еще не выбрали товары.",
    noteLabel: "Дополнительные пожелания",
    notePlaceholder: "Пишите на любом языке (например: Больше льда, чистые стаканы...)",
    submitBtn: "ОТПРАВИТЬ ЗАПРОС В MYBAR",
    submitting: "Отправка запроса...",
    successTitle: "Запрос Принят!",
    successDesc: "Наша служба мини-бара подготовит ваш заказ в ближайшее время. Приятного отдыха!",
    alreadyTitle: "Запрос на сегодня уже принят",
    alreadyDesc: "Ваш запрос MyBar на сегодня уже получен и обрабатывается. Допускается 1 запрос в день.",
    selectAtLeastOne: "Пожалуйста, выберите хотя бы один товар.",
    error: "Ошибка при отправке запроса.",
  },
  ar: {
    title: "MYBAR",
    subtitle: (hotel: string) =>
      `سيتم تلبية طلب الميني بار الخاص بك في فندق ${hotel} في أقرب وقت ممكن. يرجى تحديد المنتجات والكميات المطلوبة.`,
    room: "غرفة",
    all: "الكل",
    selectedSummary: "المنتجات المحددة",
    emptySelection: "لم تقم باختيار أي منتج بعد.",
    noteLabel: "ملاحظات إضافية أو طلبات خاصة",
    notePlaceholder: "يمكنك الكتابة بأي لغة (مثال: يرجى إحضار المزيد من الثلج وأكواب إضافية...)",
    submitBtn: "إرسال طلب MYBAR",
    submitting: "جارٍ إرسال الطلب...",
    successTitle: "تم استلام طلبك بنجاح!",
    successDesc: "سيقوم فريق خدمة الغرف بإعداد الميني بار الخاص بك في أسرع وقت. نتمنى لك إقامة سعيدة.",
    alreadyTitle: "تم استلام طلب اليوم مسبقاً",
    alreadyDesc: "تم تسجيل طلب MyBar الخاص بغرفتك لهذا اليوم وهو قيد التجهيز. يسمح بطلب واحد يومياً.",
    selectAtLeastOne: "يرجى تحديد منتج واحد على الأقل.",
    error: "حدث خطأ أثناء إرسال الطلب.",
  },
};

const LANG_OPTIONS: { code: LangCode; label: string; flag: string }[] = [
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
];

export function MybarGuestScreen({
  roomId,
  hotelId,
  roomNumber: initialRoomNumber,
  hotelName: initialHotelName,
}: MybarGuestScreenProps) {
  const [lang, setLang] = useState<LangCode>("tr");
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [hotelName, setHotelName] = useState(initialHotelName || "Merit Royal");
  const [roomNumber, setRoomNumber] = useState(initialRoomNumber || "");
  const [products, setProducts] = useState<MybarProduct[]>([]);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [note, setNote] = useState("");
  const [alreadyRequested, setAlreadyRequested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isRtl = lang === "ar";
  const t = I18N[lang];

  useEffect(() => {
    // Detect browser language
    const navLang = navigator.language.slice(0, 2).toLowerCase();
    if (navLang === "en" || navLang === "de" || navLang === "ru" || navLang === "ar") {
      setLang(navLang as LangCode);
    }

    async function loadData() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/minibar/mybar/request?roomId=${roomId}&hotelId=${hotelId}`);
        if (res.ok) {
          const data = await res.json();
          setHotelName(data.hotel.name);
          setRoomNumber(data.room.number);
          setProducts(data.products || []);
          setAlreadyRequested(data.alreadyRequestedToday);
        }
      } catch (err) {
        console.error("Mybar guest load error:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [roomId, hotelId]);

  function handleQuantityChange(productId: string, delta: number) {
    const cur = selectedQuantities[productId] || 0;
    const nextVal = cur + delta;
    if (nextVal < 0 || nextVal > 5) return; // Rule: max +5 / min 0!

    setSelectedQuantities((prev) => {
      const copy = { ...prev };
      if (nextVal === 0) {
        delete copy[productId];
      } else {
        copy[productId] = nextVal;
      }
      return copy;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const items = Object.entries(selectedQuantities).map(([productId, qty]) => ({
      productId,
      qty,
    }));

    if (items.length === 0) {
      setErrorMessage(t.selectAtLeastOne);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/minibar/mybar/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          roomId,
          language: lang,
          note: note.trim() || undefined,
          items,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || t.error);
      }

      setIsSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.error;
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Categories
  const categories = Array.from(new Set(products.map((p) => p.groupName)));

  const filteredProducts = products.filter((p) => {
    if (activeCategory === "all") return true;
    return p.groupName === activeCategory;
  });

  const selectedEntries = Object.entries(selectedQuantities);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-amber-300">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="font-bold text-sm tracking-wide">MYBAR Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen bg-gradient-to-br from-[#0a2351] via-[#1e3a8a] to-[#0a192f] text-slate-100 flex flex-col items-center py-6 px-3 sm:px-6 select-none font-sans"
    >
      {/* Main Luxury Frame Card */}
      <div className="w-full max-w-lg bg-white text-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-amber-400/40 relative">
        {/* Top Language Switcher Dropdown */}
        <div className={`absolute top-4 ${isRtl ? "left-4" : "right-4"} z-30`}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
              className="px-3.5 py-1.5 rounded-full bg-white/95 border-2 border-amber-500 shadow-lg text-xs font-black text-slate-900 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span>{LANG_OPTIONS.find((l) => l.code === lang)?.flag}</span>
              <span className="uppercase">{lang}</span>
              <span className="text-[10px] text-amber-600">▼</span>
            </button>

            {isLangMenuOpen && (
              <div className="absolute top-full mt-1.5 right-0 bg-white rounded-2xl shadow-2xl border-2 border-amber-400 py-1.5 min-w-[130px] z-40 animate-in fade-in">
                {LANG_OPTIONS.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setLang(item.code);
                      setIsLangMenuOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left text-xs font-bold flex items-center gap-2 hover:bg-amber-50 transition-colors ${
                      lang === item.code ? "bg-amber-100/70 text-amber-900 font-black" : "text-slate-800"
                    }`}
                  >
                    <span>{item.flag}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Header Band */}
        <div className="bg-gradient-to-b from-slate-900 via-[#0a2351] to-[#1e3a8a] text-white p-6 sm:p-8 text-center border-b-4 border-amber-400 relative">
          {/* Room Badge */}
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg mb-3 tracking-wide">
            <span>🛎️</span>
            <span>
              {t.room} {roomNumber}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-md">
            {t.title}
          </h1>

          <p className="text-xs sm:text-sm text-slate-200 mt-2.5 leading-relaxed max-w-sm mx-auto font-medium">
            {t.subtitle(hotelName)}
          </p>
        </div>

        {/* Content Area */}
        <div className="p-5 sm:p-6 space-y-5">
          {isSuccess ? (
            <div className="py-10 text-center space-y-4 animate-in fade-in">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto shadow-inner">
                ✓
              </div>
              <h2 className="text-2xl font-black text-slate-900">{t.successTitle}</h2>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
                {t.successDesc}
              </p>
            </div>
          ) : alreadyRequested ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-3xl mx-auto">
                🕒
              </div>
              <h2 className="text-xl font-black text-slate-900">{t.alreadyTitle}</h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
                {t.alreadyDesc}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setActiveCategory("all")}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    activeCategory === "all"
                      ? "bg-amber-500 text-white shadow-md shadow-amber-500/30"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {t.all}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer ${
                      activeCategory === cat
                        ? "bg-amber-500 text-white shadow-md shadow-amber-500/30"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Product Cards Grid with Touch Steppers (- 1 +) */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {filteredProducts.map((p) => {
                  const qty = selectedQuantities[p.id] || 0;
                  const isSelected = qty > 0;

                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? "border-amber-400 bg-amber-50/50 shadow-sm"
                          : "border-slate-200 bg-slate-50/50 hover:bg-white"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="font-bold text-sm text-slate-900">{p.name}</div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          {p.groupName}
                        </div>
                      </div>

                      {/* Stepper: - [qty] + (Range 0 - 5) */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(p.id, -1)}
                          disabled={qty <= 0}
                          className="w-9 h-9 rounded-xl bg-white border border-slate-300 disabled:opacity-30 disabled:pointer-events-none text-slate-800 font-black text-lg flex items-center justify-center active:scale-90 transition-transform shadow-xs cursor-pointer"
                        >
                          −
                        </button>

                        <div className="w-8 text-center font-black text-base text-slate-900">
                          {qty}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleQuantityChange(p.id, 1)}
                          disabled={qty >= 5}
                          className="w-9 h-9 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-lg flex items-center justify-center active:scale-90 transition-transform shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Items Chips Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                <span className="text-xs font-bold text-slate-500 block mb-2 uppercase">
                  {t.selectedSummary} ({selectedEntries.length})
                </span>
                {selectedEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">{t.emptySelection}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedEntries.map(([prodId, count]) => {
                      const prod = products.find((x) => x.id === prodId);
                      return (
                        <span
                          key={prodId}
                          className="px-2.5 py-1 rounded-xl bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                        >
                          <span>{prod?.name}</span>
                          <span className="bg-white/30 px-1 rounded text-[10px] font-black">
                            +{count}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Extra Guest Note Section */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  {t.noteLabel}
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t.notePlaceholder}
                  className="w-full p-3 rounded-2xl border border-slate-300 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center">
                  {errorMessage}
                </div>
              )}

              {/* Submit Button ("MYBAR TALEBİ GÖNDER") */}
              <button
                type="submit"
                disabled={isSubmitting || selectedEntries.length === 0}
                className="w-full py-4 sm:py-5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 hover:brightness-105 active:scale-98 disabled:opacity-40 text-slate-950 font-black text-base sm:text-lg tracking-wider shadow-xl shadow-amber-500/30 transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer uppercase"
              >
                {isSubmitting ? (
                  <span>{t.submitting}</span>
                ) : (
                  <>
                    <span>🛎️</span>
                    <span>{t.submitBtn}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
