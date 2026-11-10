# Spelling corrections for names copied from the hotel's menu documents. Applied when the data set is written,
# after price and image matching (those still work on the document's own spelling).
import re

# whole-name or phrase replacements, longest first; matched case-sensitively on word boundaries
PHRASES = [
    ("INTERNATIONALS COCKTAILS", "INTERNATIONAL COCKTAILS"),
    ("SIGNATURES COCKTAILS", "SIGNATURE COCKTAILS"),
    ("REFRESHMENT SMOOTHIES", "REFRESHING SMOOTHIES"),
    ("ULUSLARASI", "ULUSLARARASI"),
    ("APERATIVES", "APERITIFS"),
    ("RUSSIAN STANDART", "RUSSIAN STANDARD"),
    ("CAÇHACA", "CACHAÇA"),
    ("MILAGRA", "MILAGRO"),
    ("LEMONCELLO", "LIMONCELLO"),
    ("JAGERMEISTER", "JÄGERMEISTER"),
    ("BATI DE COCO", "BATIDA DE CÔCO"),
    ("SKINOSS", "SKINOS"),
    ("GRANDE ABSENTH", "GRANDE ABSENTE"),
    ("DOM BENETICTINE", "DOM BÉNÉDICTINE"),
    ("ARCHER'S", "ARCHERS"),
    ("DISTTILLERY", "DISTILLERY"),
    ("CONCERT MASTER", "CONCERTMASTER"),
    ("COAL ILA", "CAOL ILA"),
    ("ARDBERG", "ARDBEG"),
    ("BENRIARCH", "BENRIACH"),
    ("HENNESY XO", "HENNESSY X.O."),
    ("HENNESY VSOP", "HENNESSY V.S.O.P."),
    ("HENNESY VS", "HENNESSY V.S."),
    ("CLASSE AZUL", "CLASE AZUL"),
    ("BOOLS ELDER FLOWER", "BOLS ELDERFLOWER"),
    ("HUCCKLEBERRY", "HUCKLEBERRY"),
    ("GREEN ANGLE", "GREEN ANGEL"),
    ("AFFAGATO", "AFFOGATO"),
    ("BLOODY MARRY", "BLOODY MARY"),
    ("CAIRPIRINHA", "CAIPIRINHA"),
    ("LYNCBURG", "LYNCHBURG"),
    ("LONG ISLAND ICE TEA", "LONG ISLAND ICED TEA"),
    ("JUSTERINI & BROOKS BARE", "JUSTERINI & BROOKS RARE"),
    ("REFRESHİNG MİNT", "REFRESHING MINT"),
    ("FRUİTY CAMOMİLE", "FRUITY CAMOMILE"),
    ("AYURVEDA HERBS&GİNGER", "AYURVEDA HERBS & GINGER"),
    ("SWEET BERRİES", "SWEET BERRIES"),
    ("CANCIERTO", "CONCIERTO"),
    ("APARATIVO", "APERITIVO"),
    ("GUM MASTIC", "MASTIC"),
    ("MIX FRESH", "MIXED"),
    ("TOST & SANDWİCH", "TOST & SANDVİÇ"),
    ("PASTA & RİSOTTO", "PASTA & RISOTTO"),
    ("Şinitzel", "Şnitzel"),
    ("Kentaki", "Kentucky"),
    ("Penne Arabiata", "Penne Arrabbiata"),
    ("Penne Arrabiata", "Penne Arrabbiata"),
    ("Spaghetti Napolitan", "Spaghetti Napoletana"),
    ("Spagetti Napolitan", "Spagetti Napoliten"),
    ("Browni", "Brownie"),
]
# exact whole-name fixes: (turkish, english) of the corrected pair, keyed by the document's Turkish heading
EXACT = {
    "RUMLAR": ("ROMLAR", "RUMS"),
}
_RX = [(re.compile(r"(?<!\w)%s(?!\w)" % re.escape(a)), b) for a, b in PHRASES]
_VSOP = re.compile(r"V\.S\.O\.P(?!\.)")


def fix(text):
    if not text:
        return text
    for rx, b in _RX:
        text = rx.sub(b, text)
    return _VSOP.sub("V.S.O.P.", text)


def fix_pair(tr, en):
    if tr in EXACT:
        return EXACT[tr]
    return fix(tr), fix(en)
