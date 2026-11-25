# Jisr Launchpad: Teknik Doküman (White Paper)

Sürüm 0.1 · 22 Kasım 2026 · Test ağı aşaması

Jisr (جسر, "köprü"), her coinin bir taban fiyatına sahip olduğu bir meme coin çıkarma platformudur. Bu taban fiyat, kimsenin para çekemediği bir sözleşmede tutulan parayla karşılanır. Bu doküman platformun nasıl çalıştığını, neye karşı koruduğunu, neye karşı korumadığını ve bugün neyin hazır olduğunu anlatır.

## 1. Sorun

Meme coin çıkışlarının çoğu aynı şekilde biter. İlk alıcılar ve coini oluşturan kişi, neredeyse bedavaya gelmiş coinleri tutar ve bunları sonradan gelenlere satar. Klasik bir bağlanma eğrisinde havuzdaki para piyasa değerinin yalnızca küçük bir kısmıdır; bu yüzden satış başladığında fiyatın altında hiçbir şey yoktur. Alışılmış önlemler (kilitler, kademeli serbest bırakma, satış vergileri) ya birinin sözünü tutmasına ya da değiştirilebilen bir kurala dayanır.

Jisr, erken dönemin ucuz coinlerini kaldırır ve her coinin altına gerçek para koyar.

## 2. Bir coin nasıl çalışır

Jisr'de çıkarılan her coinin koşulları aynıdır. Oluşturan kişi yalnızca adı, sembolü, görseli, açıklamayı ve bağlantıları seçer.

| Koşul | Değer |
|---|---|
| Toplam arz | 1,000,000,000 coin, bir kez oluşturulur |
| Satış | İlk 800,000,000 coin tek bir sabit fiyattan |
| Satış fiyatı (dolar rezervi) | Coin başına $0.0001, yani $100,000 piyasa değeri |
| Tabanın üstü | Son 200,000,000 coin, yükselen bir eğriyle fiyatlanır |
| İşlem ücreti | Her alımdan ve her satımdan %5 |
| Cüzdan sınırı | Cüzdan başına arzın %2.5'i (25,000,000 coin) |
| Oluşturana verilen coin | Yok |

### 2.1 Herkese tek fiyat

İlk 800 milyon coin, oluşturan dahil herkese aynı fiyattan satılır. Ucuz bir erken tur yoktur; bu yüzden kimse sizinkinden daha ucuza gelmiş coin tutmaz.

### 2.2 Karşılığı olan taban

Piyasadan çıkan her coin, o coinin **taban rezervine** bir taban fiyatı yatırır. Bu yüzden rezervde, dolaşımdaki bütün coinleri taban fiyattan geri almaya yetecek para her zaman bulunur. Her sahip, coinlerini istediği zaman piyasaya geri satabilir ve %5 ücret düşüldükten sonra taban fiyatı alır.

Dolar rezerviyle örnek:

| Adım | Tutar |
|---|---|
| Ödediğiniz | $1,000.00 |
| Alım ücreti (%5) | $50.00 |
| Aldığınız coin | 9,500,000 |
| Hepsini taban fiyattan geri satarsınız | Ücretten önce $950.00 |
| Satım ücreti (%5) | $47.50 |
| Elinize geçen | $902.50 |

Taban fiyattan alıp sonra satmak toplam %9.75 ücrete mal olur. Taban fiyattan alan birinin mekanizmanın kendisi yüzünden kaybedebileceği en fazla tutar budur. 6. bölümdeki riskler ayrıdır.

### 2.3 Mezuniyet ve yükselen taban

Satıştaki 800 milyon coinin tamamı satıldığında coin **mezun** olmuş sayılır. Bundan sonra her işlemden rezervde kalan %2, rezervi gerekenden büyük hale getirir ve taban fiyat buna göre yükseltilir:

> taban fiyat = taban rezervi ÷ (dolaşımdaki coin sayısı ile 800,000,000'dan büyük olanı)

Taban fiyat hiçbir zaman düşürülmez. Mezuniyet anında $100,000 değerindeki bir coin için rezervde yaklaşık $81,684 bulunur; yani taban, satış fiyatının yaklaşık %2.1 üstünde başlar ve işlem hacmiyle birlikte yükselir.

### 2.4 Tabanın üstü

Son 200 milyon coin, taban fiyata ek olarak, bu coinler satıldıkça büyüyen bir prim karşılığında satılır. Prim ayrı bir **prim rezervinde** tutulur ve coinler aynı çizgi boyunca geri satıldığında iade edilir.

| Eğriden satılan coin | Sıradaki coinin fiyatı | Bu fiyattaki piyasa değeri |
|---|---|---|
| 0 | $0.0001 | $100,000 |
| 100,000,000 | yaklaşık $0.0004 | yaklaşık $400,000 |
| 150,000,000 | yaklaşık $0.0016 | yaklaşık $1,600,000 |
| 190,000,000 (eğrinin sonu) | yaklaşık $0.04 | yaklaşık $40,000,000 |

Taban yalnızca taban fiyatı karşılar. Tabanın üstünde prim ödeyen bir alıcı, başkaları ondan önce satarsa bu primi kaybedebilir.

### 2.5 %5 nereye gider

| Pay | Gittiği yer | Amaç |
|---|---|---|
| %1 | Coini oluşturan kişi | Yalnızca coin işlem gördüğünde ödenir |
| %2 | Coinin taban rezervi | Mezuniyetten sonra tabanı bütün sahipler için yükseltir |
| %2 | Platform cüzdanı | Platformun işletilmesi |

### 2.6 Cüzdan sınırı

Hiçbir cüzdan bir coinin arzının %2.5'inden fazlasını tutamaz. Bu, oluşturanın cüzdanı dahil bütün cüzdanlar için geçerlidir. Sınır, tek bir adresin bir seferde satabileceği miktarı kısıtlar. Bir kişinin birden çok cüzdan kullanmasını engelleyemez: bir blokzincir iki adresin aynı kişiye ait olduğunu bilemez.

## 3. Kim neyi kontrol eder

| Unsur | Parasını kim hareket ettirebilir veya onu kim değiştirebilir |
|---|---|
| Bir coinin rezervleri | Hiç kimse. Para yalnızca formüle göre satıcıya, %1 ücret olarak oluşturana veya %2 ücret olarak platform cüzdanına çıkar |
| Bir coin | Yalnızca sahipleri. Yeni basım yok, durdurma yok, kara liste yok, ücret değişikliği yok |
| Platform cüzdanı | Platform ekibi. %2 ücreti alır |
| Fabrika sahibi | Platform cüzdanının hangi adres olduğunu değiştirebilir. Başka hiçbir şey yapamaz |

Coin ve piyasa sözleşmelerinin sahibi yoktur; yükseltme, durdurma ve para çekme işlevleri de yoktur. Oluşturanın çıkıştan sonra hiçbir özel yetkisi kalmaz. Testler, durumu değiştirebilen işlevlerin tam listesini sabitler; bu yüzden bir yönetici işlevi eklemek derlemeyi başarısız kılar.

Bu tasarımın bedeli: çıkıştan sonra bir hata bulunursa, kimse çalışan bir piyasayı durduramaz veya düzeltemez.

## 4. Oluşturanlar için

- Coin çıkarmak bir ağ işlemine mal olur. Listeleme ücreti yoktur.
- Oluşturan kişi coin almaz. Coini tutmak isterse herkes gibi satış fiyatından, aynı %2.5 sınırı içinde satın alır.
- Oluşturan kişi coinindeki her işlemin %1'ini kazanır; bu tutar coin işlem gördükçe cüzdanına otomatik olarak ödenir.
- Oluşturanın satın aldığı hiçbir şey kilitlenmez veya kademeli serbest bırakılmaz, çünkü diğer bütün alıcılarla aynı fiyatı ödemiştir.

## 5. Ağlar ve rezerv para birimleri

- **Ağlar.** Sözleşmeler herhangi bir EVM ağında çalışır: Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon, Avalanche, Robinhood Chain ve diğerleri. Bir coin, çıkarıldığı ağda yaşar.
- **Rezerv para birimi.** Platformun her kurulumu, coinlerini tek bir token ile fiyatlar ve karşılar: dolar bazlı bir stablecoin (USDT veya USDC) ya da tokenleştirilmiş hisse gibi başka bir standart token. Tokenleştirilmiş hissede taban bir hisse adedidir; bu yüzden dolar değeri hisseyle birlikte hareket eder.
- **Ağın kendi para birimiyle ödeme.** Bir takas yönlendiricisinin bağlı olduğu yerlerde alıcılar ETH veya BNB ile ödeyebilir ve ödeme alabilir. Ödeme girişte ve çıkışta dönüştürülür; rezervde yalnızca rezerv tokeni tutulur.
- **Başka bir ağda alma.** USDC ile karşılanan bir platformda satıcı, coini kendi ağında satıp dolarları başka bir ağda alabilir. Transfer Circle'ın kendi USDC köprüsünden (CCTP) geçer ve platform arada hiçbir şey tutmaz. Circle kendi ücretini tutardan alır. Bu özellik USDT veya tokenleştirilmiş hisseyle karşılanan platformlarda, ayrıca Circle köprüsünün hizmet vermediği BNB Chain ve Robinhood Chain üzerinde kullanılamaz.

## 6. Riskler

Platformu değeri olan herhangi bir şeyle kullanmadan önce bu bölümü okuyun.

- **Denetlenmedi.** Sözleşmeler, rastgele işlem ve saldırı simülasyonları dahil kendi testlerinden geçti. Bağımsız bir güvenlik denetçisi tarafından incelenmedi. Bir hata para kaybına yol açabilir.
- **Kurtarma yok.** Kimse çalışan bir piyasayı durduramaz veya onaramaz. Bu, rezervi insanlardan korur ve hatalara karşı güvenlik ağını ortadan kaldırır.
- **Ücretler.** Taban fiyattan alıp satmak toplamda %9.75'e mal olur.
- **Prim riski.** Taban, taban fiyatı korur. Tabanın üstünde ödenen para korunmaz.
- **Rezerv tokeni riski.** Bir stablecoin sabitini kaybedebilir ve onu çıkaran kurum bir adresi dondurabilir. Tokenleştirilmiş bir hisse kendi hissesini izler ve kimin tutabileceğini kısıtlayabilir. Sözleşmeler bunların hiçbirine karşı savunma yapamaz.
- **Takas riski.** Ağın kendi para birimiyle ödeme, yönlendiriciye ve onun likiditesine bağlıdır ve rezerv tokeniyle ödemekten pahalı olabilir.
- **Köprü riski.** Başka bir ağda ödenen bir satış, dolarların oraya ulaşması için Circle'ın köprüsüne bağlıdır. Circle yavaşlarsa veya durursa teslimat bekler. Sözleşmeler bunu hızlandıramaz ve satışı geri alamaz.
- **Bağlantılı cüzdanlar.** %2.5 sınırı adres başınadır.
- **Satış yerine düz transferle piyasaya gönderilen coinler** gönderen için kaybolur.
- **Taban bir mekanizmadır.** Sözleşmenin bir coin için rezerv tokeniyle ödeyeceği tutardır. Kâr vaadi değildir ve sigorta değildir.

## 7. Durum

| Bölüm | Durum |
|---|---|
| EVM sözleşmeleri | Yazıldı ve test edildi (47 sözleşme testi) |
| Web uygulaması ve kurulum sayfası | Yazıldı ve test edildi (25 tarayıcı testi), yayında |
| Test kurulumu | Sepolia test ağında yayında, değeri olmayan test parasıyla |
| Bağımsız güvenlik denetimi | Yapılmadı |
| Gerçek ağlarda kurulum | Yapılmadı. Denetimden sonra gelir |
| Solana | Program ve sayfa yazıldı ve birlikte test edildi. Test parasıyla çalışan bir test ağı olan Solana devnet üzerinde yayında ve bir daha değiştirilemeyecek şekilde kuruldu. Gerçek ağda değil |
| Bir ağda satıp başka bir ağda almak (köprü) | Yazıldı ve Circle sözleşmelerinin yerine geçen test sözleşmeleriyle test edildi. Henüz Circle'ın canlı köprüsünde çalıştırılmadı |

Sepolia'daki test kurulumu:

- Platform fabrikası: `0x4e34BD62B8245Fa7841061eeFa010fF054FA9d06`
- Solana devnet: `5cbX2QdxMq948ySWxF6yHruKFtpp5Kf8WGA1wb3BaKC8`
- Site: https://w8nwzbf9h5-svg.github.io/jisr-launchpad/
- Kod: https://github.com/w8nwzbf9h5-svg/jisr-launchpad

## 8. Bildirim

Bu doküman bir yazılımı anlatır. Herhangi bir coinin teklifi değildir ve finansal tavsiye değildir. Jisr'de çıkarılan coinleri platform değil, onları oluşturanlar yaratır. Platformu kullanan herkes kendi kararlarından sorumludur.

Bu bir çeviridir. Esas alınan sürüm İngilizce olandır; bir fark varsa İngilizce metin geçerlidir.
