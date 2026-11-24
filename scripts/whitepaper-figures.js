// The four figures of the white paper, built for each language by scripts/build-whitepaper.js.
//
//   1. the life of a coin          (a sequence, so it is numbered)
//   2. where $1,000 goes           (one whole split into parts: a segmented bar with a legend)
//   3. the floor after graduation  (one line: change of one quantity)
//   4. the price of the next coin  (two lines on one axis)
//
// Every number in the figures comes from the same formulas the contracts use; nothing is drawn by hand.
// Words are HTML and numbers are SVG, so a long translation wraps instead of overflowing, and
// right-to-left text needs no special handling. Charts keep a left-to-right axis in every language.
//
// Colours: one fixed hue per meaning, checked for colour-blind separation against the page's surface
// (blue #3987e5, yellow #c98500, aqua #199e70 on #11151F). Text never takes a series colour.

const T = {
  en: {
    fig: "Figure", tbl: "Numbers",
    t1: "The life of a coin",
    l1a: "Launch", l1a2: "The creator pays the network fee and receives no coins.",
    l1b: "Sale", l1b2: "800M coins at one fixed price. The value of every coin sold goes into the reserve.",
    l1c: "Graduation", l1c2: "The sale sells out. The reserve holds about $81,684 for those 800M coins.",
    l1d: "After graduation", l1d2: "The last 200M coins sell above the floor, and fees from trading keep raising the floor.",
    l1e: "At any time, a holder can sell back to the reserve at the floor price, less the 5% fee.",
    t2: "Where $1,000 goes",
    b2: "You buy with $1,000", s2: "You sell the same coins back",
    r1: "Floor reserve: pays for your coins if you sell", r2: "Stays in the reserve (2%)", r3: "Launchpad (2%)", r4: "Creator (1%)", r5: "You receive",
    c2: "After the buy the reserve holds $970 for coins it can buy back for $950.",
    t3: "The floor after graduation",
    x3: "Money traded after graduation, in millions of dollars", y3: "Floor price, as a multiple of the sale price",
    n3: "2% of every trade stays in the reserve, and the floor is raised to match. It is never lowered. Shown for 800M coins in circulation.",
    t4: "The price of the next coin",
    x4: "Coins sold, in millions", y4: "Price, as a multiple of the sale price",
    k4a: "Price to buy the next coin", k4b: "Floor price",
    z4a: "Sale: one price", z4b: "Above the floor",
    n4: "The curve continues to 990M coins, where the price reaches 400 times the sale price.",
  },
  ar: {
    fig: "الشكل", tbl: "الأرقام",
    t1: "حياة العملة",
    l1a: "الإطلاق", l1a2: "المطوّر يدفع رسوم الشبكة ولا يحصل على أي عملات.",
    l1b: "البيع", l1b2: "800 مليون عملة بسعر واحد ثابت. قيمة كل عملة تُباع تدخل الاحتياطي.",
    l1c: "التخرّج", l1c2: "يكتمل بيع الحصة. الاحتياطي يحمل نحو 81,684$ مقابل تلك الـ800 مليون عملة.",
    l1d: "بعد التخرّج", l1d2: "آخر 200 مليون عملة تُباع فوق الأرضية، ورسوم التداول ترفع الأرضية باستمرار.",
    l1e: "في أي وقت يستطيع الحامل أن يبيع للاحتياطي بسعر الأرضية، ناقص رسم 5%.",
    t2: "أين تذهب 1,000$",
    b2: "تشتري بـ1,000$", s2: "تبيع العملات نفسها",
    r1: "احتياطي الأرضية: يدفع ثمن عملاتك إذا بعت", r2: "يبقى في الاحتياطي (2%)", r3: "المنصة (2%)", r4: "المطوّر (1%)", r5: "تستلم",
    c2: "بعد الشراء يحمل الاحتياطي 970$ مقابل عملات يستطيع إعادة شرائها بـ950$.",
    t3: "الأرضية بعد التخرّج",
    x3: "حجم التداول بعد التخرّج، بملايين الدولارات", y3: "سعر الأرضية، كمضاعف لسعر البيع",
    n3: "2% من كل صفقة تبقى في الاحتياطي، وتُرفع الأرضية بما يطابقها، ولا تُخفَّض أبداً. الرسم لحالة 800 مليون عملة متداولة.",
    t4: "سعر العملة التالية",
    x4: "العملات المباعة، بالملايين", y4: "السعر، كمضاعف لسعر البيع",
    k4a: "سعر شراء العملة التالية", k4b: "سعر الأرضية",
    z4a: "البيع: سعر واحد", z4b: "فوق الأرضية",
    n4: "يستمر المنحنى حتى 990 مليون عملة، حيث يبلغ السعر 400 ضعف سعر البيع.",
  },
  zh: {
    fig: "图", tbl: "数据",
    t1: "一枚代币的生命周期",
    l1a: "发行", l1a2: "创建者支付网络费用，不获得任何代币。",
    l1b: "发售", l1b2: "8 亿枚代币以同一固定价格出售。每售出一枚，其价值都进入储备。",
    l1c: "毕业", l1c2: "发售部分售罄。储备为这 8 亿枚代币持有约 81,684 美元。",
    l1d: "毕业之后", l1d2: "最后 2 亿枚在底价之上出售，交易费用不断抬高底价。",
    l1e: "持有者可随时按底价卖回给储备，扣除 5% 的费用。",
    t2: "1,000 美元的去向",
    b2: "你用 1,000 美元买入", s2: "你把同样的代币卖回",
    r1: "底价储备：你卖出时用它支付", r2: "留在储备中（2%）", r3: "平台（2%）", r4: "创建者（1%）", r5: "你收到",
    c2: "买入后，储备持有 970 美元，而买回这些代币只需 950 美元。",
    t3: "毕业后的底价",
    x3: "毕业后的交易额（百万美元）", y3: "底价，相对于发售价的倍数",
    n3: "每笔交易的 2% 留在储备中，底价随之上调，且永不下调。图中按 8 亿枚流通代币计算。",
    t4: "下一枚代币的价格",
    x4: "已售出的代币（百万枚）", y4: "价格，相对于发售价的倍数",
    k4a: "买入下一枚代币的价格", k4b: "底价",
    z4a: "发售：同一价格", z4b: "底价之上",
    n4: "曲线一直延伸到 9.9 亿枚，届时价格达到发售价的 400 倍。",
  },
  es: {
    fig: "Figura", tbl: "Cifras",
    t1: "La vida de una moneda",
    l1a: "Lanzamiento", l1a2: "El creador paga la comisión de la red y no recibe monedas.",
    l1b: "Venta", l1b2: "800 M de monedas a un único precio fijo. El valor de cada moneda vendida entra en la reserva.",
    l1c: "Graduación", l1c2: "La venta se agota. La reserva guarda unos 81.684 $ por esos 800 M de monedas.",
    l1d: "Tras la graduación", l1d2: "Los últimos 200 M se venden por encima del mínimo, y las comisiones de las operaciones siguen subiendo el mínimo.",
    l1e: "En cualquier momento, un titular puede vender a la reserva al precio mínimo, menos la comisión del 5%.",
    t2: "A dónde van 1.000 $",
    b2: "Compras con 1.000 $", s2: "Vendes esas mismas monedas",
    r1: "Reserva del mínimo: paga tus monedas si vendes", r2: "Se queda en la reserva (2%)", r3: "Plataforma (2%)", r4: "Creador (1%)", r5: "Recibes",
    c2: "Tras la compra, la reserva guarda 970 $ por monedas que puede recomprar por 950 $.",
    t3: "El mínimo tras la graduación",
    x3: "Dinero negociado tras la graduación, en millones de dólares", y3: "Precio mínimo, como múltiplo del precio de venta",
    n3: "El 2% de cada operación se queda en la reserva y el mínimo sube en consecuencia. Nunca baja. Calculado para 800 M de monedas en circulación.",
    t4: "El precio de la siguiente moneda",
    x4: "Monedas vendidas, en millones", y4: "Precio, como múltiplo del precio de venta",
    k4a: "Precio de compra de la siguiente moneda", k4b: "Precio mínimo",
    z4a: "Venta: un solo precio", z4b: "Por encima del mínimo",
    n4: "La curva continúa hasta 990 M de monedas, donde el precio alcanza 400 veces el precio de venta.",
  },
  hi: {
    fig: "चित्र", tbl: "आँकड़े",
    t1: "एक कॉइन का जीवन",
    l1a: "लॉन्च", l1a2: "बनाने वाला नेटवर्क शुल्क देता है और उसे कोई कॉइन नहीं मिलता।",
    l1b: "बिक्री", l1b2: "80 करोड़ कॉइन एक ही तय कीमत पर। बिके हर कॉइन का मूल्य रिज़र्व में जाता है।",
    l1c: "ग्रेजुएशन", l1c2: "बिक्री पूरी हो जाती है। उन 80 करोड़ कॉइन के लिए रिज़र्व में लगभग $81,684 होते हैं।",
    l1d: "ग्रेजुएशन के बाद", l1d2: "आख़िरी 20 करोड़ कॉइन फ़्लोर से ऊपर बिकते हैं, और ट्रेडिंग की फ़ीस फ़्लोर को बढ़ाती रहती है।",
    l1e: "धारक किसी भी समय फ़्लोर कीमत पर, 5% फ़ीस घटाकर, रिज़र्व को वापस बेच सकता है।",
    t2: "$1,000 कहाँ जाता है",
    b2: "आप $1,000 से ख़रीदते हैं", s2: "आप वही कॉइन वापस बेचते हैं",
    r1: "फ़्लोर रिज़र्व: बेचने पर आपके कॉइन का भुगतान यहीं से", r2: "रिज़र्व में रहता है (2%)", r3: "प्लेटफ़ॉर्म (2%)", r4: "बनाने वाला (1%)", r5: "आपको मिलता है",
    c2: "ख़रीद के बाद रिज़र्व में $970 होते हैं, जबकि वे कॉइन $950 में वापस ख़रीदे जा सकते हैं।",
    t3: "ग्रेजुएशन के बाद फ़्लोर",
    x3: "ग्रेजुएशन के बाद हुआ कारोबार, दस लाख डॉलर में", y3: "फ़्लोर कीमत, बिक्री कीमत के गुणज में",
    n3: "हर ट्रेड का 2% रिज़र्व में रहता है और फ़्लोर उसी के अनुसार बढ़ाया जाता है। इसे कभी घटाया नहीं जाता। चित्र 80 करोड़ चलन में मौजूद कॉइन के लिए है।",
    t4: "अगले कॉइन की कीमत",
    x4: "बिके कॉइन, दस लाख में", y4: "कीमत, बिक्री कीमत के गुणज में",
    k4a: "अगला कॉइन ख़रीदने की कीमत", k4b: "फ़्लोर कीमत",
    z4a: "बिक्री: एक ही कीमत", z4b: "फ़्लोर से ऊपर",
    n4: "वक्र 99 करोड़ कॉइन तक चलता है, जहाँ कीमत बिक्री कीमत की 400 गुना हो जाती है।",
  },
  fr: {
    fig: "Figure", tbl: "Chiffres",
    t1: "La vie d'un jeton",
    l1a: "Lancement", l1a2: "Le créateur paie les frais de réseau et ne reçoit aucun jeton.",
    l1b: "Vente", l1b2: "800 M de jetons à un prix fixe unique. La valeur de chaque jeton vendu entre dans la réserve.",
    l1c: "Graduation", l1c2: "La vente est épuisée. La réserve détient environ 81 684 $ pour ces 800 M de jetons.",
    l1d: "Après la graduation", l1d2: "Les 200 derniers millions se vendent au-dessus du plancher, et les frais des échanges continuent de relever le plancher.",
    l1e: "À tout moment, un détenteur peut revendre à la réserve au prix plancher, moins les frais de 5 %.",
    t2: "Où vont 1 000 $",
    b2: "Vous achetez pour 1 000 $", s2: "Vous revendez ces mêmes jetons",
    r1: "Réserve du plancher : paie vos jetons si vous vendez", r2: "Reste dans la réserve (2 %)", r3: "Plateforme (2 %)", r4: "Créateur (1 %)", r5: "Vous recevez",
    c2: "Après l'achat, la réserve détient 970 $ pour des jetons qu'elle peut racheter 950 $.",
    t3: "Le plancher après la graduation",
    x3: "Montant échangé après la graduation, en millions de dollars", y3: "Prix plancher, en multiple du prix de vente",
    n3: "2 % de chaque échange restent dans la réserve, et le plancher est relevé en conséquence. Il n'est jamais abaissé. Calculé pour 800 M de jetons en circulation.",
    t4: "Le prix du jeton suivant",
    x4: "Jetons vendus, en millions", y4: "Prix, en multiple du prix de vente",
    k4a: "Prix d'achat du jeton suivant", k4b: "Prix plancher",
    z4a: "Vente : un seul prix", z4b: "Au-dessus du plancher",
    n4: "La courbe se poursuit jusqu'à 990 M de jetons, où le prix atteint 400 fois le prix de vente.",
  },
  ru: {
    fig: "Рисунок", tbl: "Цифры",
    t1: "Жизнь монеты",
    l1a: "Запуск", l1a2: "Создатель платит комиссию сети и не получает монет.",
    l1b: "Продажа", l1b2: "800 млн монет по одной фиксированной цене. Стоимость каждой проданной монеты идёт в резерв.",
    l1c: "Выпуск", l1c2: "Продажа завершена. В резерве около $81 684 под эти 800 млн монет.",
    l1d: "После выпуска", l1d2: "Последние 200 млн монет продаются выше нижней границы, а комиссии с торговли продолжают её поднимать.",
    l1e: "В любой момент держатель может продать монеты резерву по цене нижней границы за вычетом комиссии 5%.",
    t2: "Куда идут $1 000",
    b2: "Вы покупаете на $1 000", s2: "Вы продаёте те же монеты обратно",
    r1: "Резерв нижней границы: из него оплачиваются ваши монеты при продаже", r2: "Остаётся в резерве (2%)", r3: "Площадка (2%)", r4: "Создатель (1%)", r5: "Вы получаете",
    c2: "После покупки в резерве $970 под монеты, которые он может выкупить за $950.",
    t3: "Нижняя граница после выпуска",
    x3: "Объём торгов после выпуска, млн долларов", y3: "Цена нижней границы, в долях цены продажи",
    n3: "2% с каждой сделки остаются в резерве, и нижняя граница поднимается соответственно. Она никогда не снижается. Показано для 800 млн монет в обращении.",
    t4: "Цена следующей монеты",
    x4: "Продано монет, млн", y4: "Цена, в долях цены продажи",
    k4a: "Цена покупки следующей монеты", k4b: "Цена нижней границы",
    z4a: "Продажа: одна цена", z4b: "Выше нижней границы",
    n4: "Кривая продолжается до 990 млн монет, где цена достигает 400-кратной цены продажи.",
  },
  pt: {
    fig: "Figura", tbl: "Números",
    t1: "A vida de uma moeda",
    l1a: "Lançamento", l1a2: "O criador paga a taxa da rede e não recebe moedas.",
    l1b: "Venda", l1b2: "800 M de moedas a um único preço fixo. O valor de cada moeda vendida entra na reserva.",
    l1c: "Graduação", l1c2: "A venda esgota. A reserva guarda cerca de US$ 81.684 por essas 800 M de moedas.",
    l1d: "Após a graduação", l1d2: "As últimas 200 M são vendidas acima do piso, e as taxas das negociações continuam elevando o piso.",
    l1e: "A qualquer momento, um titular pode vender à reserva pelo preço do piso, menos a taxa de 5%.",
    t2: "Para onde vão US$ 1.000",
    b2: "Você compra com US$ 1.000", s2: "Você vende as mesmas moedas",
    r1: "Reserva do piso: paga suas moedas se você vender", r2: "Fica na reserva (2%)", r3: "Plataforma (2%)", r4: "Criador (1%)", r5: "Você recebe",
    c2: "Depois da compra, a reserva guarda US$ 970 por moedas que pode recomprar por US$ 950.",
    t3: "O piso após a graduação",
    x3: "Valor negociado após a graduação, em milhões de dólares", y3: "Preço do piso, como múltiplo do preço de venda",
    n3: "2% de cada negociação ficam na reserva, e o piso é elevado na mesma medida. Ele nunca é reduzido. Calculado para 800 M de moedas em circulação.",
    t4: "O preço da próxima moeda",
    x4: "Moedas vendidas, em milhões", y4: "Preço, como múltiplo do preço de venda",
    k4a: "Preço de compra da próxima moeda", k4b: "Preço do piso",
    z4a: "Venda: um só preço", z4b: "Acima do piso",
    n4: "A curva continua até 990 M de moedas, onde o preço chega a 400 vezes o preço de venda.",
  },
  tr: {
    fig: "Şekil", tbl: "Rakamlar",
    t1: "Bir coinin yaşamı",
    l1a: "Çıkış", l1a2: "Oluşturan kişi ağ ücretini öder ve hiç coin almaz.",
    l1b: "Satış", l1b2: "800 milyon coin tek bir sabit fiyattan. Satılan her coinin değeri rezerve girer.",
    l1c: "Mezuniyet", l1c2: "Satış tükenir. Rezerv bu 800 milyon coin için yaklaşık 81.684 $ tutar.",
    l1d: "Mezuniyetten sonra", l1d2: "Son 200 milyon coin tabanın üstünde satılır ve işlem ücretleri tabanı yükseltmeye devam eder.",
    l1e: "Coin sahibi istediği zaman, %5 ücret düşülerek, taban fiyattan rezerve geri satabilir.",
    t2: "1.000 $ nereye gider",
    b2: "1.000 $ ile alırsınız", s2: "Aynı coinleri geri satarsınız",
    r1: "Taban rezervi: satarsanız coinlerinizin karşılığını öder", r2: "Rezervde kalır (%2)", r3: "Platform (%2)", r4: "Oluşturan (%1)", r5: "Elinize geçen",
    c2: "Alımdan sonra rezerv, 950 $'a geri alabileceği coinler için 970 $ tutar.",
    t3: "Mezuniyetten sonra taban",
    x3: "Mezuniyetten sonraki işlem hacmi, milyon dolar", y3: "Taban fiyat, satış fiyatının katı olarak",
    n3: "Her işlemin %2'si rezervde kalır ve taban buna göre yükseltilir. Asla düşürülmez. Dolaşımdaki 800 milyon coin için gösterilmiştir.",
    t4: "Bir sonraki coinin fiyatı",
    x4: "Satılan coin, milyon", y4: "Fiyat, satış fiyatının katı olarak",
    k4a: "Bir sonraki coini alma fiyatı", k4b: "Taban fiyat",
    z4a: "Satış: tek fiyat", z4b: "Tabanın üstü",
    n4: "Eğri 990 milyon coine kadar sürer; orada fiyat satış fiyatının 400 katına ulaşır.",
  },
  id: {
    fig: "Gambar", tbl: "Angka",
    t1: "Perjalanan sebuah koin",
    l1a: "Peluncuran", l1a2: "Pembuat membayar biaya jaringan dan tidak menerima koin.",
    l1b: "Penjualan", l1b2: "800 juta koin dengan satu harga tetap. Nilai setiap koin yang terjual masuk ke cadangan.",
    l1c: "Kelulusan", l1c2: "Penjualan habis. Cadangan memegang sekitar $81.684 untuk 800 juta koin itu.",
    l1d: "Setelah kelulusan", l1d2: "200 juta koin terakhir dijual di atas harga dasar, dan biaya perdagangan terus menaikkan harga dasar.",
    l1e: "Kapan saja, pemegang dapat menjual kembali ke cadangan pada harga dasar, dikurangi biaya 5%.",
    t2: "Ke mana $1.000 pergi",
    b2: "Anda membeli dengan $1.000", s2: "Anda menjual kembali koin yang sama",
    r1: "Cadangan harga dasar: membayar koin Anda jika Anda menjual", r2: "Tetap di cadangan (2%)", r3: "Platform (2%)", r4: "Pembuat (1%)", r5: "Anda menerima",
    c2: "Setelah pembelian, cadangan memegang $970 untuk koin yang dapat dibelinya kembali seharga $950.",
    t3: "Harga dasar setelah kelulusan",
    x3: "Nilai perdagangan setelah kelulusan, dalam juta dolar", y3: "Harga dasar, sebagai kelipatan harga jual",
    n3: "2% dari setiap transaksi tetap di cadangan, dan harga dasar dinaikkan mengikutinya. Harga dasar tidak pernah diturunkan. Ditampilkan untuk 800 juta koin yang beredar.",
    t4: "Harga koin berikutnya",
    x4: "Koin terjual, dalam juta", y4: "Harga, sebagai kelipatan harga jual",
    k4a: "Harga beli koin berikutnya", k4b: "Harga dasar",
    z4a: "Penjualan: satu harga", z4b: "Di atas harga dasar",
    n4: "Kurva berlanjut hingga 990 juta koin, saat harga mencapai 400 kali harga jual.",
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n) => "$" + (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2));

/* ---- the model, as in the contracts ---- */
const SALE = 800, CURVE = 200;                       // millions of coins
const priceMultiple = (sold) => (sold <= SALE ? 1 : Math.pow(CURVE / (CURVE - (sold - SALE)), 2)); // price of the next coin / sale price
const GRAD_RESERVE = 80000 / 0.95 * 0.97;            // $ in the reserve when the sale sells out: 81,684.21
const floorMultiple = (volumeM) => (GRAD_RESERVE + 0.02 * volumeM * 1e6) / 80000; // floor / sale price, 800M coins out

/* ---- chart scaffolding: one size, hairline grid, numbers only ---- */
const W = 640, H = 300, M = { l: 46, r: 30, t: 16, b: 30 };
function scales(xMax, yMin, yMax) {
  const px = (x) => M.l + (x / xMax) * (W - M.l - M.r), py = (y) => M.t + (1 - (y - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  return { px, py };
}
const r1 = (n) => Math.round(n * 10) / 10;
const path = (pts) => pts.map((p, i) => (i ? "L" : "M") + r1(p[0]) + " " + r1(p[1])).join(" ");
function frame(sc, xTicks, yTicks, yFmt) {
  return yTicks.map((y) => `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${r1(sc.py(y))}" y2="${r1(sc.py(y))}"/><text class="tick" x="${M.l - 8}" y="${r1(sc.py(y)) + 4}" text-anchor="end">${yFmt(y)}</text>`).join("") +
    xTicks.map((x) => `<text class="tick" x="${r1(sc.px(x))}" y="${H - 9}" text-anchor="middle">${x}</text>`).join("");
}
const endDot = (x, y, cls) => `<circle class="ring" cx="${r1(x)}" cy="${r1(y)}" r="6"/><circle class="${cls}" cx="${r1(x)}" cy="${r1(y)}" r="4"/>`;
const table = (t, head, rows) => `<details class="fig-tbl"><summary>${esc(t.tbl)}</summary><div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td class="num">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
const cap = (t, n, title) => `<figcaption><span class="fig-n">${esc(t.fig)} ${n}</span> ${esc(title)}</figcaption>`;

function life(t) {
  const steps = [[t.l1a, t.l1a2], [t.l1b, t.l1b2], [t.l1c, t.l1c2], [t.l1d, t.l1d2]];
  return `<figure class="fig">${cap(t, 1, t.t1)}
<ol class="fig-steps">${steps.map((s) => `<li><b>${esc(s[0])}</b><span>${esc(s[1])}</span></li>`).join("")}</ol>
<p class="fig-any"><i class="sw sw-floor"></i>${esc(t.l1e)}</p></figure>`;
}

function split(t) {
  const bar = (title, total, parts) => `<div class="fig-bar"><div class="fig-bar-t">${esc(title)}</div>
<div class="segs" dir="ltr" role="img" aria-label="${esc(title + ": " + parts.map((p) => p[1] + " " + money(p[2])).join(", "))}">${parts.map((p) => `<i class="seg ${p[0]}" style="flex:${p[2]} 0 0" title="${esc(p[1] + ": " + money(p[2]))}"></i>`).join("")}</div>
<ul class="fig-key">${parts.map((p) => `<li><i class="sw ${p[0]}"></i><span>${esc(p[1])}</span><b class="num">${money(p[2])}</b></li>`).join("")}</ul></div>`;
  return `<figure class="fig">${cap(t, 2, t.t2)}
${bar(t.b2, 1000, [["sw-floor", t.r1, 950], ["sw-extra", t.r2, 20], ["sw-plat", t.r3, 20], ["sw-crea", t.r4, 10]])}
${bar(t.s2, 950, [["sw-you", t.r5, 902.5], ["sw-extra", t.r2, 19], ["sw-plat", t.r3, 19], ["sw-crea", t.r4, 9.5]])}
<p class="fig-note">${esc(t.c2)}</p></figure>`;
}

function floor(t) {
  const sc = scales(4, 1, 2.1), pts = [0, 1, 2, 3, 4].map((v) => [sc.px(v), sc.py(floorMultiple(v))]);
  const area = path(pts) + ` L${r1(sc.px(4))} ${r1(sc.py(1))} L${r1(sc.px(0))} ${r1(sc.py(1))} Z`;
  const f = (y) => y.toFixed(2) + "×", end = pts[pts.length - 1];
  return `<figure class="fig">${cap(t, 3, t.t3)}
<p class="fig-axis">${esc(t.y3)}</p>
<div class="fig-chart" dir="ltr" data-fig="floor" data-name="${esc(t.t3)}">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.t3 + ". " + t.n3)}">${frame(sc, [0, 1, 2, 3, 4], [1, 1.25, 1.5, 1.75, 2], f)}
<path class="wash-floor" d="${area}"/><path class="ln ln-floor" d="${path(pts)}"/>${endDot(end[0], end[1], "dot-floor")}
<text class="val" x="${r1(end[0]) - 10}" y="${r1(end[1]) - 10}" text-anchor="end">${f(floorMultiple(4))}</text>
<line class="cross" y1="${M.t}" y2="${H - M.b}" hidden/></svg><div class="fig-tip" hidden></div></div>
<p class="fig-axis x">${esc(t.x3)}</p>
<p class="fig-note">${esc(t.n3)}</p>
${table(t, [t.x3, t.y3], [0, 1, 2, 3, 4].map((v) => ["$" + v + "M", f(floorMultiple(v))]))}</figure>`;
}

function price(t) {
  const X = 950, sc = scales(X, 0, 16), pts = [[sc.px(0), sc.py(1)]];
  for (let s = SALE; s <= X; s += 2) pts.push([sc.px(s), sc.py(priceMultiple(s))]);
  const end = pts[pts.length - 1], f = (y) => y + "×", xs = sc.px(SALE);
  const pct = (x) => r1((x / W) * 100); // a position in the drawing as a share of its width, for the HTML labels laid over it
  return `<figure class="fig">${cap(t, 4, t.t4)}
<ul class="fig-key inline"><li><i class="sw sw-line sw-plat"></i><span>${esc(t.k4a)}</span></li><li><i class="sw sw-line sw-floor"></i><span>${esc(t.k4b)}</span></li></ul>
<p class="fig-axis">${esc(t.y4)}</p>
<div class="fig-chart" dir="ltr" data-fig="price" data-a="${esc(t.k4a)}" data-b="${esc(t.k4b)}">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.t4 + ". " + t.n4)}">${frame(sc, [0, 200, 400, 600, 800, 950], [1, 4, 8, 12, 16], f)}
<rect class="band" x="${r1(xs)}" y="${M.t}" width="${r1(sc.px(X) - xs)}" height="${H - M.t - M.b}"/>
<line class="grid" x1="${r1(xs)}" x2="${r1(xs)}" y1="${M.t}" y2="${H - M.b}"/>
<path class="ln ln-floor" d="${path([[xs, sc.py(1)], [sc.px(X), sc.py(1)]])}"/><path class="ln ln-plat" d="${path(pts)}"/>
${endDot(sc.px(X), sc.py(1), "dot-floor")}${endDot(end[0], end[1], "dot-plat")}
<text class="val" x="${r1(end[0]) - 10}" y="${r1(end[1]) + 4}" text-anchor="end">16×</text>
<line class="cross" y1="${M.t}" y2="${H - M.b}" hidden/></svg>
<div class="fig-zone" style="left:${pct(sc.px(0))}%;width:${pct(xs) - pct(sc.px(0))}%"><span dir="auto">${esc(t.z4a)}</span></div>
<div class="fig-zone b" style="right:${r1(100 - pct(xs))}%;width:38%"><span dir="auto">${esc(t.z4b)}</span></div>
<div class="fig-tip" hidden></div></div>
<p class="fig-axis x">${esc(t.x4)}</p>
<p class="fig-note">${esc(t.n4)}</p>
${table(t, [t.x4, t.k4a, t.k4b], [0, 800, 850, 900, 950, 990].map((s) => [s + "M", (Math.round(priceMultiple(s) * 100) / 100) + "×", "1×"]))}</figure>`;
}

/* Styles and the hover layer, shared by every language. */
const CSS = `
.fig{--f-floor:#c98500;--f-plat:#3987e5;--f-crea:#199e70;--f-you:#aeb7c9;margin:22px 0 26px;padding:16px 16px 14px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.fig figcaption{font-weight:700;font-size:16px;line-height:1.35;margin-bottom:14px}
.fig .fig-n{color:var(--muted);font-weight:600;margin-inline-end:6px}
.fig p.fig-note{font-size:14px;line-height:1.6;color:var(--muted);margin:12px 0 0}
.fig p.fig-axis{font-size:12.5px;line-height:1.4;color:var(--muted);margin:0 0 4px}
.fig p.fig-axis.x{text-align:center;margin:4px 0 0}
.fig .sw{display:inline-block;flex:none;width:12px;height:12px;border-radius:3px}
.fig .sw-line{height:3px;width:18px;border-radius:2px}
.fig .sw-floor{background:var(--f-floor)}
.fig .sw-extra{background:repeating-linear-gradient(135deg,var(--f-floor) 0 3px,#6d4a05 3px 6px)}
.fig .sw-plat{background:var(--f-plat)}
.fig .sw-crea{background:var(--f-crea)}
.fig .sw-you{background:var(--f-you)}
.fig-steps{list-style:none;counter-reset:step;margin:0;padding:0;display:grid;gap:10px;grid-template-columns:minmax(0,1fr)}
.fig-steps li{counter-increment:step;position:relative;margin:0;padding:12px 12px 12px;padding-inline-start:46px;background:var(--raise);border:1px solid var(--line);border-radius:10px}
.fig-steps li::before{content:counter(step);position:absolute;inset-inline-start:12px;top:12px;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:600 13px var(--mono);background:var(--bg);border:1px solid var(--line);color:var(--ink)}
.fig-steps b{display:block;font-size:15px;margin-bottom:2px}
.fig-steps span{display:block;font-size:14px;line-height:1.5;color:var(--muted)}
@media (min-width:720px){.fig-steps{grid-template-columns:repeat(4,minmax(0,1fr))}.fig-steps li{padding:44px 12px 12px}.fig-steps li::before{top:12px}}
.fig p.fig-any{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.5;margin:12px 0 0;padding:10px 12px;border-radius:10px;background:var(--floor-soft)}
.fig p.fig-any .sw{margin-top:5px}
.fig-bar+.fig-bar{margin-top:18px}
.fig-bar-t{font-weight:600;font-size:14.5px;margin-bottom:8px}
.segs{display:flex;gap:2px;height:28px}
.segs .seg{min-width:3px;height:100%}
.segs .seg:first-child{border-start-start-radius:4px;border-end-start-radius:4px}
.segs .seg:last-child{border-start-end-radius:4px;border-end-end-radius:4px}
.fig-key{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
.fig-key li{display:flex;gap:9px;align-items:center;margin:0;font-size:14px;line-height:1.4}
.fig-key li span{flex:1;min-width:0}
.fig-key li b{font-weight:600;direction:ltr}
.fig-key.inline{margin:0 0 12px}
@media (min-width:560px){.fig-key.inline{display:flex;flex-wrap:wrap;gap:6px 22px}.fig-key.inline li span{flex:none}}
.fig-chart{position:relative}
.fig-chart svg{display:block;width:100%;height:auto;overflow:visible}
.fig-chart .grid{stroke:var(--line);stroke-width:1}
.fig-chart .tick{font:12px var(--mono);fill:var(--muted)}
.fig-chart .val{font:600 13px var(--mono);fill:var(--ink)}
.fig-chart .ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.fig-chart .ln-floor{stroke:var(--f-floor)}
.fig-chart .ln-plat{stroke:var(--f-plat)}
.fig-chart .wash-floor{fill:var(--f-floor);opacity:.1}
.fig-chart .ring{fill:var(--surface)}
.fig-chart .dot-floor{fill:var(--f-floor)}
.fig-chart .dot-plat{fill:var(--f-plat)}
.fig-chart .cross{stroke:var(--muted);stroke-width:1}
/* The drawing is 640 units wide and shrinks with the screen. On a phone one unit is about half a pixel,
   so text and strokes are drawn larger there to stay readable. */
@media (max-width:620px){.fig-chart .tick{font-size:21px}.fig-chart .val{font-size:22px}.fig-chart .ln{stroke-width:3.6}.fig-chart .ring{r:10px}.fig-chart .dot-floor,.fig-chart .dot-plat{r:7px}.fig-chart .grid,.fig-chart .cross{stroke-width:1.6}}
.fig-zone{position:absolute;top:9%;text-align:center;font-size:12.5px;line-height:1.3;color:var(--muted);pointer-events:none;padding:0 4px}
.fig-zone.b{top:36%;text-align:right;padding-right:8px}
.fig-chart .band{fill:var(--ink);opacity:.045}
.fig-tip{position:absolute;top:6px;z-index:2;pointer-events:none;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:7px 9px;font-size:12.5px;line-height:1.5;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.fig-tip b{font:600 12.5px var(--mono)}
.fig-tip .sw{width:9px;height:9px;margin-inline-end:6px;vertical-align:baseline}
.fig-tbl{margin-top:10px}
.fig-tbl summary{cursor:pointer;font-size:13.5px;font-weight:600;color:var(--muted)}
.fig-tbl td{direction:ltr}
@media print{.fig,.fig-steps li,.fig p.fig-any{background:#fff;border-color:#999}.fig-tip,.fig-chart .cross{display:none}}
`;

/* Crosshair and tooltip on the two line charts. The values are computed from the same formulas as the drawing. */
const JS = `
(function () {
  var W = ${W}, L = ${M.l}, R = ${M.r}, G = ${GRAD_RESERVE};
  var defs = {
    floor: { max: 4, x: function (v) { return "$" + v.toFixed(1) + "M"; }, rows: function (v, el) { return [["sw-floor", el.getAttribute("data-name"), ((G + 20000 * v) / 80000).toFixed(2) + "\\u00d7"]]; } },
    price: { max: 950, x: function (v) { return Math.round(v) + "M"; }, rows: function (v, el) { var p = v <= 800 ? 1 : Math.pow(200 / (1000 - v), 2); return [["sw-plat", el.getAttribute("data-a"), p.toFixed(2) + "\\u00d7"], ["sw-floor", el.getAttribute("data-b"), "1.00\\u00d7"]]; } }
  };
  Array.prototype.forEach.call(document.querySelectorAll(".fig-chart[data-fig]"), function (el) {
    var d = defs[el.getAttribute("data-fig")], svg = el.querySelector("svg"), cross = el.querySelector(".cross"), tip = el.querySelector(".fig-tip");
    if (!d) return;
    function move(ev) {
      var box = svg.getBoundingClientRect(), sx = (ev.clientX - box.left) / box.width * W;
      var v = Math.max(0, Math.min(d.max, (sx - L) / (W - L - R) * d.max)), cx = L + v / d.max * (W - L - R);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.removeAttribute("hidden");
      tip.textContent = "";
      var head = document.createElement("b"); head.textContent = d.x(v); tip.appendChild(head);
      d.rows(v, el).forEach(function (r) {
        var row = document.createElement("div"), sw = document.createElement("i"), val = document.createElement("b");
        sw.className = "sw " + r[0]; val.textContent = " " + r[2];
        row.appendChild(sw); row.appendChild(document.createTextNode(r[1])); row.appendChild(val); tip.appendChild(row);
      });
      tip.hidden = false;
      var left = cx / W * box.width + 12;
      if (left + tip.offsetWidth > box.width) left = cx / W * box.width - tip.offsetWidth - 12;
      tip.style.left = Math.max(0, left) + "px";
    }
    function leave() { cross.setAttribute("hidden", ""); tip.hidden = true; }
    el.addEventListener("pointermove", move); el.addEventListener("pointerdown", move); el.addEventListener("pointerleave", leave);
  });
})();
`;

/* The figures of one language, in reading order. */
function figures(lang) {
  const t = T[lang] || T.en;
  return [life(t), split(t), floor(t), price(t)];
}

module.exports = { figures, CSS, JS, LANGS: Object.keys(T), T };
