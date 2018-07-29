#!/bin/bash

v4l2-ctl --set-ctrl=h264_profile=1
v4l2-ctl --set-ctrl=h264_level=9
v4l2-ctl --set-ctrl=video_bitrate=1500000
