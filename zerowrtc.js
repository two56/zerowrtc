const fs = require('fs');
const url = require('url');
const https = require('https');
const WebSocket = require('ws');
const {spawn, exec} = require('child_process');

exec('/usr/bin/v4l2-ctl --set-ctrl=h264_profile=1');
exec('/usr/bin/v4l2-ctl --set-ctrl=h264_level=9');
exec('/usr/bin/v4l2-ctl --set-ctrl=video_bitrate=7680000');
exec('/usr/bin/v4l2-ctl --set-ctrl=h264_i_frame_period=10');

const wss = new WebSocket.Server({
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
console.log('DISCONNECT', ws.id);
				Array.from(wss.clients).find((client) => client.isServer === true).send(JSON.stringify({
					type:	'DISCONNECT',
					id:	ws.id
				}));
			}
		);
		ws.on('message',
			(message) => {
				let msg;
				try {
					msg = JSON.parse(message);
				} catch ( err ) {
					return console.log(err);
				}
				const clients = Array.from(wss.clients);
console.log('MESSAGE', msg);
				if ( msg.type == 'REGISTER' ) {
					Object.assign(ws, {id: msg.id, isServer: msg.isServer || false, isAlive: true});
					if ( clients.reduce((count, client) => count += client.readyState == WebSocket.OPEN, 0) > 2 ) {
						ws.send(JSON.stringify({
							type:		'ERROR',
							message:	'Too many clients connected.'
						}));
						return;
					}
					if ( ! msg.isServer ) {
						if ( ! clients.some((client) => client.isServer === true) ) {
							ws.send(JSON.stringify({
								type:		'ERROR',
								message:	'No servers connected.'
							}));
							return;
						}
						ws.send(JSON.stringify({
							type:		'SERVER',
							id:		clients.find((client) => client.isServer === true).id
						}));
					}
				} else if ( clients.some((client) => client.id == msg.dst) )
					clients.find((client) => client.id == msg.dst).send(message);
				else
					ws.send(JSON.stringify({type: 'ERROR', message: 'Unknown message or destination.'}));
			}
		);
	}
);

const interval = setInterval(
	() => {
		wss.clients.forEach(
			(ws) => {
				if ( ws.isAlive === false ) {
console.log('TERMINATE', ws.id);
					Array.from(wss.clients).find((client) => client.isServer === true).send(JSON.stringify({
						type:	'DISCONNECT',
						id:	ws.id
					}));
					return ws.terminate();
				}
				ws.isAlive = false;
				ws.ping(() => {});
			}
		);
	},
	15000
);

const gst_client = spawn('/usr/bin/python3', ['/srv/zerowrtc/gst-client.py']);

gst_client.stdout.on('data',
	(data) => {
		console.log('gst-client.py stdout: ' + data);
	}
);

gst_client.stderr.on('data',
	(data) => {
		console.log('gst-client.py stderr: ' + data);
	}
);

gst_client.on('close',
	(code) => {
		console.log('gst-client.py exited with code ' + code);
	}
);
