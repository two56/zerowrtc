import random
import ssl
import websockets
import asyncio
import os
import sys
import json
import argparse

import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst
gi.require_version('GstWebRTC', '1.0')
from gi.repository import GstWebRTC
gi.require_version('GstSdp', '1.0')
from gi.repository import GstSdp

PIPELINE_DESC = '''
v4l2src device=/dev/video0 ! video/x-h264, width=960, height=540, framerate=15/1 ! h264parse config-interval=1 ! rtph264pay pt=102 ! queue ! application/x-rtp,media=video,encoding-name=H264,payload=102 ! webrtcbin name=sendrecv
'''

class WebRTCClient:
	def __init__(self, id_):
		self.id_ = id_
		self.conn = None
		self.pipe = None
		self.webrtc = None
		self.clientid = None
		self.server = 'wss://127.0.0.1:8443'

	async def connect(self):
		sslctx = ssl.create_default_context(purpose=ssl.Purpose.CLIENT_AUTH)
		self.conn = await websockets.connect(self.server, ssl=sslctx)
		await self.conn.send(json.dumps(
			{'type': 'REGISTER', 'isServer': True, 'id': our_id}
		))

	def send_sdp_offer(self, offer):
		text = offer.sdp.as_text()
		print ('Sending offer:\n%s' % text)
		msg = json.dumps({'type': 'SDP', 'src': self.id_, 'dst': self.clientid, 'data': {'type': 'offer', 'sdp': text}})
		loop = asyncio.new_event_loop()
		loop.run_until_complete(self.conn.send(msg))

	def on_offer_created(self, promise, _, __):
		promise.wait()
		reply = promise.get_reply()
		offer = reply['offer']
		promise = Gst.Promise.new()
		self.webrtc.emit('set-local-description', offer, promise)
		promise.interrupt()
		self.send_sdp_offer(offer)

	def on_negotiation_needed(self, element):
		promise = Gst.Promise.new_with_change_func(self.on_offer_created, element, None)
		element.emit('create-offer', None, promise)

	def send_ice_candidate_message(self, _, mlineindex, candidate):
		icemsg = json.dumps({'type': 'ICE', 'src': self.id_, 'dst': self.clientid, 'data': {'candidate': candidate, 'sdpMLineIndex': mlineindex}})
		loop = asyncio.new_event_loop()
		loop.run_until_complete(self.conn.send(icemsg))

	def start_pipeline(self):
		self.pipe = Gst.parse_launch(PIPELINE_DESC)
		self.webrtc = self.pipe.get_by_name('sendrecv')
		self.webrtc.connect('on-negotiation-needed', self.on_negotiation_needed)
		self.webrtc.connect('on-ice-candidate', self.send_ice_candidate_message)
		self.pipe.set_state(Gst.State.PLAYING)
		# element_factory_make 

	async def handle_sdp(self, sdp):
		assert self.webrtc
		assert(sdp['type'] == 'answer')
		sdp = sdp['sdp']
		print ('Received answer:\n%s' % sdp)
		res, sdpmsg = GstSdp.SDPMessage.new()
		GstSdp.sdp_message_parse_buffer(bytes(sdp.encode()), sdpmsg)
		answer = GstWebRTC.WebRTCSessionDescription.new(GstWebRTC.WebRTCSDPType.ANSWER, sdpmsg)
		promise = Gst.Promise.new()
		self.webrtc.emit('set-remote-description', answer, promise)
		promise.interrupt()

	async def handle_ice(self, ice):
		assert self.webrtc
		candidate = ice['candidate']
		sdpmlineindex = ice['sdpMLineIndex']
		self.webrtc.emit('add-ice-candidate', sdpmlineindex, candidate)

	async def loop(self):
		assert self.conn
		async for message in self.conn:
			msg = json.loads(message)
			if msg['type'] == 'CONNECT' and self.pipe is None:
				self.clientid = msg['src']
				self.start_pipeline()
			elif msg['type'] == 'DISCONNECT' and self.pipe is not None:
				self.pipe.set_state(Gst.State.NULL)
				self.clientid = None
                                #self.webrtc = None
                                #self.pipe = None
			elif msg['type'] == 'SDP':
				await self.handle_sdp(msg['data'])
			elif msg['type'] == 'ICE':
				await self.handle_ice(msg['data'])
		return 0


if __name__=='__main__':
	Gst.init(None)
	our_id = random.randrange(10, 10000)
	client = WebRTCClient(our_id)
	asyncio.get_event_loop().run_until_complete(client.connect())
	res = asyncio.get_event_loop().run_until_complete(client.loop())
	sys.exit(res)
