# Jisr Launchpad: Buku Putih

Versi 0.1 · 22 November 2026 · Tahap jaringan uji

Jisr (جسر, "jembatan") adalah platform peluncuran meme coin. Setiap koin di sini memiliki harga dasar yang dijamin oleh dana dalam kontrak yang tidak bisa ditarik oleh siapa pun. Dokumen ini menjelaskan cara kerjanya, apa yang dilindunginya, apa yang tidak dilindunginya, dan apa yang sudah dibangun saat ini.

## 1. Masalahnya

Sebagian besar peluncuran meme coin berakhir dengan cara yang sama. Pembeli awal dan pembuat koin memegang koin yang hampir tidak ada biayanya, lalu menjualnya kepada pembeli yang datang belakangan. Pada kurva bonding klasik, dana di pool hanya sebagian kecil dari nilai pasar, sehingga tidak ada yang menopang harga ketika penjualan dimulai. Perlindungan yang lazim (penguncian, pelepasan bertahap, pajak jual) bergantung pada janji seseorang atau pada aturan yang bisa diubah.

Jisr menghapus koin murah di awal dan menaruh dana nyata di bawah setiap koin.

## 2. Cara kerja sebuah koin

Semua koin yang diluncurkan di Jisr memiliki ketentuan yang sama. Pembuat hanya memilih nama, simbol, gambar, deskripsi, dan tautan.

| Ketentuan | Nilai |
|---|---|
| Total pasokan | 1,000,000,000 koin, dibuat satu kali |
| Penjualan | 800,000,000 koin pertama dengan satu harga tetap |
| Harga jual (cadangan dolar) | $0.0001 per koin, kapitalisasi pasar $100,000 |
| Di atas harga dasar | 200,000,000 koin terakhir, dengan harga pada kurva yang naik |
| Biaya transaksi | 5% dari setiap pembelian dan setiap penjualan |
| Batas dompet | 2.5% dari pasokan (25,000,000 koin) per dompet |
| Koin yang diberikan kepada pembuat | Tidak ada |

### 2.1 Satu harga untuk semua

800 juta koin pertama dijual dengan harga yang sama kepada semua orang, termasuk pembuatnya. Tidak ada putaran awal yang murah, jadi tidak ada orang yang memegang koin dengan biaya lebih rendah daripada milik Anda.

### 2.2 Harga dasar yang dijamin

Setiap koin yang keluar dari pasar menyetor satu harga dasar ke **cadangan harga dasar** koin tersebut. Karena itu cadangan selalu cukup untuk membeli kembali semua koin yang beredar pada harga dasar. Setiap pemegang dapat menjual kembali ke pasar kapan saja dan menerima harga dasar dikurangi biaya 5%.

Contoh dengan cadangan dolar:

| Langkah | Jumlah |
|---|---|
| Anda membayar | $1,000.00 |
| Biaya pembelian (5%) | $50.00 |
| Koin yang Anda terima | 9,500,000 |
| Anda menjual semuanya pada harga dasar | $950.00 sebelum biaya |
| Biaya penjualan (5%) | $47.50 |
| Anda menerima | $902.50 |

Membeli lalu menjual pada harga dasar memakan biaya 9.75%. Itulah kerugian terbesar yang bisa dialami pembeli pada harga dasar akibat mekanisme itu sendiri. Risiko pada bagian 6 adalah hal terpisah.

### 2.3 Kelulusan dan harga dasar yang naik

Ketika 800 juta koin penjualan sudah terjual semua, koin tersebut telah **lulus**. Sejak saat itu, 2% dari setiap transaksi yang tetap berada di cadangan membuat cadangan lebih besar daripada yang dibutuhkan, dan harga dasar dinaikkan agar sesuai:

> harga dasar = cadangan harga dasar ÷ yang lebih besar antara (koin beredar, 800,000,000)

Harga dasar tidak pernah diturunkan. Saat kelulusan, cadangan berisi sekitar $81,684 untuk koin senilai $100,000, sehingga harga dasar dimulai sekitar 2.1% di atas harga jual dan naik seiring volume transaksi.

### 2.4 Di atas harga dasar

200 juta koin terakhir berharga sebesar harga dasar ditambah premi yang membesar seiring koin-koin itu terjual. Premi disimpan di **cadangan premi** yang terpisah dan dikembalikan ketika koin dijual kembali di sepanjang garis yang sama.

| Koin kurva yang terjual | Harga koin berikutnya | Nilai pasar pada harga itu |
|---|---|---|
| 0 | $0.0001 | $100,000 |
| 100,000,000 | sekitar $0.0004 | sekitar $400,000 |
| 150,000,000 | sekitar $0.0016 | sekitar $1,600,000 |
| 190,000,000 (akhir kurva) | sekitar $0.04 | sekitar $40,000,000 |

Harga dasar hanya menjamin harga dasar. Pembeli yang membayar premi di atas harga dasar bisa kehilangan premi itu jika orang lain menjual lebih dulu.

### 2.5 Ke mana 5% itu pergi

| Bagian | Tujuan | Kegunaan |
|---|---|---|
| 1% | Pembuat koin | Dibayarkan hanya ketika koin diperdagangkan |
| 2% | Cadangan harga dasar koin | Menaikkan harga dasar bagi semua pemegang setelah kelulusan |
| 2% | Dompet platform | Menjalankan platform |

### 2.6 Batas dompet

Tidak ada dompet yang boleh memegang lebih dari 2.5% pasokan sebuah koin. Ini berlaku untuk semua dompet, termasuk dompet pembuat. Batas ini membatasi jumlah yang bisa dijual satu alamat sekaligus. Batas ini tidak bisa mencegah satu orang memakai beberapa dompet: blockchain tidak tahu bahwa dua alamat dimiliki orang yang sama.

## 3. Siapa mengendalikan apa

| Hal | Siapa yang bisa memindahkan dananya atau mengubahnya |
|---|---|
| Cadangan sebuah koin | Tidak ada. Dana hanya keluar kepada penjual sesuai rumus, kepada pembuat sebagai biaya 1%, atau ke dompet platform sebagai biaya 2% |
| Sebuah koin | Hanya para pemegangnya. Tidak ada pencetakan baru, tidak ada jeda, tidak ada daftar hitam, tidak ada perubahan biaya |
| Dompet platform | Tim platform. Dompet ini menerima biaya 2% |
| Pemilik pabrik (factory) | Dapat mengganti alamat dompet platform. Tidak ada yang lain |

Kontrak koin dan kontrak pasar tidak memiliki pemilik, tidak bisa ditingkatkan, tidak bisa dijeda, dan tidak punya fungsi penarikan. Pembuat tidak memiliki hak khusus setelah peluncuran. Rangkaian pengujian mengunci daftar lengkap fungsi yang bisa mengubah keadaan, sehingga menambahkan fungsi admin akan menggagalkan proses build.

Harga dari rancangan ini: jika ditemukan bug setelah peluncuran, tidak ada yang bisa menjeda atau memperbaiki pasar yang sedang berjalan.

## 4. Untuk pembuat koin

- Peluncuran memerlukan satu transaksi jaringan. Tidak ada biaya listing.
- Pembuat tidak menerima koin. Untuk memegang koin, pembuat membeli pada harga jual seperti orang lain, dalam batas 2.5% yang sama.
- Pembuat memperoleh 1% dari setiap transaksi koinnya dan dapat mengklaimnya kapan saja.
- Tidak ada pembelian pembuat yang dikunci atau dilepas bertahap, karena pembuat membayar harga yang sama dengan pembeli lain.

## 5. Jaringan dan mata uang cadangan

- **Jaringan.** Kontrak berjalan di jaringan EVM mana pun: Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon, Avalanche, Robinhood Chain, dan lainnya. Sebuah koin berada di jaringan tempat koin itu diluncurkan.
- **Mata uang cadangan.** Setiap pemasangan platform menghargai dan menjamin koin-koinnya dengan satu token: stablecoin dolar (USDT atau USDC), atau token standar lain seperti saham yang ditokenisasi. Dengan saham yang ditokenisasi, harga dasar berupa sejumlah saham, sehingga nilai dolarnya bergerak mengikuti saham itu.
- **Membayar dengan mata uang asli jaringan.** Jika router pertukaran terhubung, pembeli dapat membayar dan dibayar dalam ETH atau BNB. Pembayaran dikonversi saat masuk dan keluar; cadangan hanya memegang token cadangan.
- **Menerima di jaringan lain.** Pada platform yang dijamin dengan USDC, penjual dapat menjual di jaringan koin dan menerima dolarnya di jaringan lain. Transfer berjalan melalui jembatan USDC milik Circle sendiri (CCTP), dan platform tidak menahan apa pun di tengah jalan. Circle mengambil biayanya sendiri dari jumlah tersebut. Fitur ini tidak tersedia pada platform yang dijamin dengan USDT atau saham yang ditokenisasi, juga tidak di BNB Chain dan Robinhood Chain, yang tidak dilayani jembatan Circle.

## 6. Risiko

Baca bagian ini sebelum menggunakan platform dengan apa pun yang bernilai.

- **Belum diaudit.** Kontrak telah lulus pengujiannya sendiri, termasuk perdagangan acak dan simulasi serangan. Kontrak belum ditinjau oleh auditor keamanan independen. Bug bisa menyebabkan hilangnya dana.
- **Tidak ada penyelamatan.** Tidak ada yang bisa menjeda atau memperbaiki pasar yang sedang berjalan. Ini melindungi cadangan dari campur tangan manusia dan menghilangkan jaring pengaman terhadap bug.
- **Biaya.** Membeli dan menjual pada harga dasar memakan biaya total 9.75%.
- **Risiko premi.** Harga dasar melindungi harga dasar. Uang yang dibayarkan di atas harga dasar tidak dilindungi.
- **Risiko token cadangan.** Stablecoin bisa kehilangan patokannya, dan penerbitnya bisa membekukan alamat. Saham yang ditokenisasi mengikuti sahamnya dan bisa membatasi siapa yang boleh memegangnya. Kontrak tidak bisa melindungi dari hal-hal ini.
- **Risiko pertukaran.** Membayar dengan mata uang asli jaringan bergantung pada router dan likuiditasnya, dan bisa lebih mahal daripada membayar dengan token cadangan.
- **Risiko jembatan.** Penjualan yang dibayarkan di jaringan lain bergantung pada jembatan Circle untuk mengirimkan dolarnya ke sana. Jika Circle lambat atau berhenti, pengiriman menunggu. Kontrak tidak bisa mempercepatnya atau membatalkan penjualan.
- **Dompet yang saling terkait.** Batas 2.5% berlaku per alamat.
- **Koin yang dikirim ke pasar dengan transfer biasa**, bukan melalui penjualan, hilang bagi pengirimnya.
- **Harga dasar adalah sebuah mekanisme.** Itu adalah jumlah yang akan dibayar kontrak, dalam token cadangan, untuk satu koin. Itu bukan janji keuntungan dan bukan asuransi.

## 7. Status

| Bagian | Keadaan |
|---|---|
| Kontrak EVM | Sudah dibangun dan diuji (44 pengujian kontrak) |
| Aplikasi web dan halaman pemasangan | Sudah dibangun dan diuji (24 pengujian di peramban), sudah daring |
| Pemasangan uji | Daring di jaringan uji Sepolia, dengan uang uji yang tidak bernilai |
| Audit keamanan independen | Belum dilakukan |
| Pemasangan di jaringan sungguhan | Belum dilakukan. Menyusul setelah audit |
| Solana | Program dan halamannya sudah dibangun dan diuji bersama pada node Solana lokal. Belum dipasang di jaringan publik |
| Menjual di satu jaringan dan menerima di jaringan lain (jembatan) | Sudah dibangun dan diuji dengan pengganti kontrak Circle. Belum dijalankan di jembatan Circle yang sesungguhnya |

Pemasangan uji di Sepolia:

- Pabrik platform: `0x5E603f7Fc12D8C2744c9117a43f5021c7dEb5647`
- Situs: https://w8nwzbf9h5-svg.github.io/jisr-launchpad/
- Kode: https://github.com/w8nwzbf9h5-svg/jisr-launchpad

## 8. Pemberitahuan

Dokumen ini menjelaskan sebuah perangkat lunak. Ini bukan penawaran koin apa pun dan bukan nasihat keuangan. Koin yang diluncurkan di Jisr dibuat oleh pembuatnya, bukan oleh platform. Siapa pun yang menggunakan platform bertanggung jawab atas keputusannya sendiri.

Ini adalah terjemahan. Versi bahasa Inggris adalah acuan; jika ada perbedaan, teks bahasa Inggris yang berlaku.
