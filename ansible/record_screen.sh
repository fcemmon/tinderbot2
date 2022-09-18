#!/bin/bash

# ssh 100.121.94.78 "timeout 10s ffmpeg -y -video_size 2560x1440 -framerate 20 -f x11grab -i :1 -c:v libx264rgb -crf 0 -preset ultrafast -color_range 2 /home/bijan/screen2.mkv"
ssh 100.121.94.78 "timeout 10s ffmpeg -y -f x11grab -s 2560x1440 -i :1 -f alsa -i default /home/bijan/screen2.mp4"
scp 100.121.94.78:screen2.mp4  .
open .

