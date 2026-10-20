# Sawah Nusantara 3D — Interactive WebGL Scene

Scene 3D prosedural interaktif hamparan sawah Nusantara (**Pagi**, **Senja**, dan **Malam**) yang dibangun menggunakan **Three.js**, **WebGL (Custom GLSL Shaders)**, dan **Vite**.

## Fitur Utama

- **200.000 Helai Padi & 2.200 Malai Bulir Padi Instanced**: Dirender secara efisien menggunakan `InstancedBufferGeometry` dan *custom vertex/fragment shader* dengan efek tembus cahaya (*subsurface translucency*).
- **Interaksi Kursor Ganda & Gelombang Angin**:
  - Pergerakan kamera (*parallax*) halus mengikuti arah kursor.
  - Hamparan padi menyibak secara *real-time* di sekitar kursor dan meninggalkan jejak gelombang di *ping-pong render target* (`TrailMap`).
  - Klik pada hamparan sawah memicu cincin gelombang kejut angin (*shockwave*), menerbangkan kawanan burung dari balik padi, dan mempercepat putaran kincir angin bambu (*kolecer*).
- **Lanskap & Budaya Sawah Nusantara**:
  - Siluet gunung berapi kembar berkabut di ufuk cakrawala dan 4 lapisan pepohonan/kelapa prosedural.
  - Saung bambu tradisional lengkap dengan lentera gantung hangat.
  - Kincir angin bambu (*kolecer*), bendera *umbul-umbul* kain yang berkibar, serta orang-orangan sawah (*bebegig*) bercaping bambu dengan rentangan tali rumbai pengusir burung.
  - Ekosistem sawah hidup: burung kuntul putih yang mematuk di genangan air dan capung bersayap transparan yang menghindar saat didekati kursor.
- **Siklus Waktu & Cuaca Dinamis**:
  - **Pagi**, **Senja**, dan **Malam** (lengkap dengan kunang-kunang berpendar, taburan bintang berkelap-kelip, dan bintang jatuh).
  - Mode cuaca **Cerah** dan **Hujan Rintik** (tetesan hujan 3D mengikuti arah angin + cincin riak air konsentris di genangan sawah).
- **3 Sudut Pandang Kamera Sinematik**:
  - **Hamparan** (Sudut pandang utama)
  - **Teras Saung** (Duduk berteduh di bawah atap saung dekat lentera)
  - **Pematang Air** (Sudut rendah dekat genangan air, capung, dan bulir padi)

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

## Build untuk Produksi / Deployment

```bash
npm run build
npm run preview
```

Hasil *build* statis akan tersedia di dalam folder `dist/` dan siap di-*deploy* ke Vercel, Netlify, Cloudflare Pages, atau GitHub Pages.
