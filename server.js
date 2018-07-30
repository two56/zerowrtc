const ws = require('ws');
const fs = require('fs');
const url = require('url');
const https = require('https');

const wss = new ws.Server({
	server:	https.createServer({
			key:	fs.readFileSync('key.pem'),
			cert:	fs.readFileSync('cert.pem')
		}).listen(8443, '0.0.0.0')
});

https.createServer(
	{
		key:	fs.readFileSync('key.pem'),
		cert:	fs.readFileSync('cert.pem')
	},
	(request, response) => {
		let pathName = url.parse(request.url).pathname.substr(1);
		if ( ! pathName.length )
			pathName = 'index.html';
		fs.readFile('html/' + pathName,
			(err, data) => {
				if ( err ) {
					response.writeHead(404, {'Content-type': 'text/plan'});
					response.write('Not Found');
					response.end();
				} else {
					response.writeHead(200);
					response.write(data);
					response.end();
				}
			}
		);
	}
).listen(9443, '0.0.0.0');

wss.on('connection',
	(ws) => {
		ws.isAlive = true;
		ws.on('pong',
			() => {
				ws.isAlive = true;
			}
		);
		ws.on('close',
			() => {
				Array.from(wss.clients).find((client) => client.isServer === true).send(JSON.stringify({
					type:	'DISCONNECT',
					id:	ws.id
				}));
			}
		);
		ws.on('message',
			(message) => {
console.log('MESSAGE', message);
				let msg;
				try {
					msg = JSON.parse(message);
				} catch ( err ) {
					return console.log(err);
				}
				const clients = Array.from(wss.clients);
				if ( msg.type == 'REGISTER' ) {
					Object.assign(ws, {id: msg.id, isServer: msg.isServer || false, isAlive: true});
					ws.send(JSON.stringify({
						type:	'SERVER',
						id:	clients.find((client) => client.isServer === true).id
					}));
				} else if ( clients.some((client) => client.id == msg.dst) )
					clients.find((client) => client.id == msg.dst).send(message);
				else
					ws.send(JSON.stringify({type: 'ERROR', message: 'Unknown message.'}));
			}
		);
	}
);

const interval = setInterval(
	() => {
		wss.clients.forEach(
			(client) => {
				if ( client.isAlive === false ) {
console.log('terminate', client.id);
					Array.from(wss.clients).find((client) => client.isServer === true).send(JSON.stringify({
						type:	'DISCONNECT',
						id:	client.id
					}));
					return client.terminate();
				}
				client.isAlive = false;
				client.ping(() => {});
			}
		);
	},
	15000
);


