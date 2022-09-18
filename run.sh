#!/bin/bash

trapped()
{
    echo -------------- trapped start 000--------------
    echo "Oh oh I'm trapped~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ $FFMPEG_PID"
    echo kill $FFMPEG_PID
    kill $FFMPEG_PID
    echo $?
    echo killed ffmpeg
    echo sleep 5 to let ffmpeg finish saving to disk
    sleep 5
    # exec "$0" "$@"
    # echo "exec failed: $0 $*"
    echo exit 1
    exit 1
}

echo 123
echo run.sh start 123!!!!!!!!!!!!!!!!
echo 453

# tail -f /dev/null
# /usr/bin/ffmpeg -nostats -loglevel fatal -nostdin -y -video_size 1920x1080 -framerate 10 -f x11grab -i :1.0+0,0 blackcube.mp4 &
/usr/bin/ffmpeg -nostats -loglevel fatal -nostdin -y -video_size 1920x1080 -framerate 10 -f x11grab -i :20.0+0,0 /home/user/videos/ok2.mp4 &
FFMPEG_PID=$!
trap trapped EXIT

echo 101----------------------------101
echo PID of FFMPEG is $FFMPEG_PID
#
# # sleep 5
# # echo run.sh after sleep 1000000000000000000000000000000000000000000
# # echo hi11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
# # echo okokokokokokokok
# # echo 9i0349i0293i40293i4092!!!!!!!
# tail -f /dev/null
wait
