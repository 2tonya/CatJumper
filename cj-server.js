const http = require('http');
const fs = require('fs');
const p = require('path');

// Локальный сервер для разработки и тестов.
// Игра не требует сервера: index.html открывается двойным кликом.
// Нужен только когда прогоняешь тесты или проверяешь вёрстку по HTTP.

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8123;

const MT = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';

    const file = p.resolve(p.join(ROOT, rel));
    if (!file.startsWith(p.resolve(ROOT))) {
      res.writeHead(403);
      return res.end('forbidden');
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, {
        'Content-Type': MT[p.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log('CatJumper dev server: http://127.0.0.1:' + PORT + '/index.html');
  });