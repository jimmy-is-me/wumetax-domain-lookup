const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.join(root,pathname==='/'?'index.html':pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}
 res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'text/html');res.end(data);});
}).listen(4173,'127.0.0.1');
