const server = {};
const id = Math.round(Math.random() * 10000);
const video = document.getElementById('receive');
const socket = new WebSocket('wss://' + window.location.hostname + ':8443');

socket.addEventListener('open',
	() => {
		socket.send(JSON.stringify({
			type:	'REGISTER',
			id
		}));
	}
);

socket.addEventListener('message',
	(e) => {
		let msg;
		try {
			msg = JSON.parse(e.data);
		} catch ( err ) {
			console.log(err);
		}
console.log(msg);
		switch ( msg.type ) {
			case 'SERVER':
				Object.assign(server, {
					id:	msg.id,
					pc:	new RTCPeerConnection()
				});
				server.pc.onicecandidate = (e) => {
					if ( e.candidate == null )
						return;
					socket.send(JSON.stringify({
						type:	'ICE',
						src:	id,
						dst:	msg.id,
						data:	e.candidate
					}));
				};
				server.pc.ontrack = (e) => {
					video.srcObject = e.streams[0];
				};
				socket.send(JSON.stringify({
					type:	'CONNECT',
					src:	id,
					dst:	msg.id
				}));
				break;
			case 'SDP':
				if ( server.id != msg.src )
					break;
				switch ( msg.data.type ) {
					case 'offer':
						server.pc.setRemoteDescription(msg.data).then(
							() => server.pc.createAnswer()
						).then(
							(desc) => {
								server.pc.setLocalDescription(desc).then(
									() => {
										socket.send(JSON.stringify({
											type:	'SDP',
											src:	id,
											dst:	msg.src,
											data:	desc
										}));
									}	

								);
							}
						).catch(
							(err) => console.log(err)
						);
						break;
				}
				break;
			case 'ICE':
				if ( server.id != msg.src )
					break;
				server.pc.addIceCandidate(msg.data);
				break;
		}
	}
);
