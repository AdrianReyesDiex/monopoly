// Servidor de archivos solo para probar en tu PC (npm start). En internet el juego vive en GitHub Pages y no
// necesita servidor: el navegador del anfitrión corre las reglas y los demás se conectan a él (ver net.js).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3005; // el 3000 lo usa otra app en esta PC
const FILES = ['index.html', 'game.js', 'wallet.js', 'net.js']; // lista cerrada: no sirve ningún otro archivo de la carpeta
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

http.createServer((req, res) => {
  const name = new URL(req.url, 'http://x').pathname.slice(1) || 'index.html';
  if (!FILES.includes(name)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(name)] + '; charset=utf-8' });
  res.end(fs.readFileSync(path.join(__dirname, name)));
}).listen(PORT, () => console.log(`Magnate en http://localhost:${PORT}`));
